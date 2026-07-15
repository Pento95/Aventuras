//! Native backup / restore / image-export commands.
//!
//! These move large payloads (the SQLite database, exported images) entirely inside the
//! native side: the bytes are streamed file-to-file (or DB-to-file) and never cross the
//! Tauri IPC bridge nor land in the WebView's JS heap. Only small parameters (paths, ids)
//! travel over IPC. This is the robust fix for the Android OutOfMemoryError crashes that
//! the earlier chunked-IPC TS helpers only mitigated.

use std::fs::File;
use std::io::{self, BufWriter, Write};
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose, Engine as _};
use futures_util::TryStreamExt;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

/// Path to the live application database (app_data_dir/aventura.db).
fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?
        .join("aventura.db"))
}

/// Open the export destination for writing, returning a real `std::fs::File`.
///
/// `dest` is whatever the save dialog returned: a `content://` SAF URI on Android, or a real path
/// on desktop. For the URI we open the app-owned file descriptor via the fs plugin (ContentResolver)
/// in read+write+truncate mode — that fd is seekable, which `ZipWriter` requires — so the export is
/// written STRAIGHT to the user-chosen location. No temp file, no second copy, and (being native)
/// no bytes cross the JS bridge.
fn open_dest(app: &AppHandle, dest: &str) -> Result<File, String> {
    use std::str::FromStr;
    use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

    // Infallible: yields Url for `content://…`, Path otherwise.
    match FilePath::from_str(dest).unwrap() {
        FilePath::Url(url) => {
            let mut opts = OpenOptions::new();
            opts.read(true).write(true).truncate(true).create(true);
            app.fs()
                .open(FilePath::Url(url), opts)
                .map_err(|e| format!("failed to open destination: {e}"))
        }
        FilePath::Path(p) => {
            File::create(&p).map_err(|e| format!("failed to create {}: {e}", p.display()))
        }
    }
}

/// Create a backup ZIP at `dest_path` containing the (already VACUUMed) database file and a
/// metadata entry. `dest_path` is a real filesystem path — the save-dialog result on desktop,
/// or a file inside the app external dir on Android — so the whole archive is written natively
/// with no bytes crossing the JS/IPC bridge.
///
/// The DB is streamed straight from disk into the archive, so nothing larger than an internal
/// buffer is ever held in memory.
#[tauri::command]
pub async fn backup_database(
    app: AppHandle,
    db_path: String,
    dest_path: String,
    metadata_json: String,
) -> Result<String, String> {
    let src = PathBuf::from(&db_path);

    let mut db_file =
        File::open(&src).map_err(|e| format!("failed to open db snapshot {db_path}: {e}"))?;
    let out = open_dest(&app, &dest_path)?;
    let mut zip = ZipWriter::new(out);

    // Level 1 (fastest): the DB is mostly base64-encoded PNGs — already-compressed data expanded
    // 33%. Level 1 cheaply recovers that base64 bloat; higher levels burn far more CPU (brutal on
    // mobile) for almost no extra shrink, since the PNGs themselves don't recompress.
    let deflated = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .compression_level(Some(1));
    zip.start_file("aventura.db", deflated)
        .map_err(|e| format!("failed to add db to archive: {e}"))?;
    io::copy(&mut db_file, &mut zip).map_err(|e| format!("failed to stream db into archive: {e}"))?;

    zip.start_file("metadata.json", SimpleFileOptions::default())
        .map_err(|e| format!("failed to add metadata to archive: {e}"))?;
    zip.write_all(metadata_json.as_bytes())
        .map_err(|e| format!("failed to write metadata: {e}"))?;

    zip.finish()
        .map_err(|e| format!("failed to finalize archive: {e}"))?;
    Ok(dest_path)
}

/// Restore the database from a backup ZIP.
///
/// Extracts only the `aventura.db` entry (older backups may also contain `stories/*.avt`,
/// which are ignored), streaming it directly over the live DB file. A safety copy of the
/// current DB is written first. The caller is expected to restart the app immediately after,
/// since the sql plugin still holds the old file open.
#[tauri::command]
pub async fn restore_database(app: AppHandle, zip_path: String) -> Result<(), String> {
    let target = db_path(&app)?;
    let app_dir = target
        .parent()
        .ok_or_else(|| "invalid db path".to_string())?
        .to_path_buf();

    let file = File::open(&zip_path).map_err(|e| format!("failed to open backup {zip_path}: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("invalid backup archive: {e}"))?;

    // Safety copy of the current DB (native copy, no buffer through JS/IPC).
    if target.exists() {
        let safety = app_dir.join("aventura-pre-restore.db");
        if let Err(e) = std::fs::copy(&target, &safety) {
            // Non-fatal: log-style warning surfaced to the caller-friendly console via Err? No —
            // keep going, the restore itself is the important part.
            eprintln!("[restore] could not write safety copy: {e}");
        }
    }

    {
        let mut entry = archive
            .by_name("aventura.db")
            .map_err(|_| "backup does not contain aventura.db".to_string())?;
        let mut out =
            File::create(&target).map_err(|e| format!("failed to open db for writing: {e}"))?;
        io::copy(&mut entry, &mut out)
            .map_err(|e| format!("failed to stream db from archive: {e}"))?;
    }

    // Remove WAL/SHM side files that could otherwise conflict with the restored DB.
    for suffix in ["-wal", "-shm"] {
        let side = with_suffix(&target, suffix);
        let _ = std::fs::remove_file(side);
    }

    Ok(())
}

/// Append `suffix` to a path's file name (e.g. aventura.db -> aventura.db-wal).
fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

/// Decode an image's stored value (optionally a `data:` URL) into raw bytes.
fn decode_image(data: &str) -> Result<Vec<u8>, String> {
    let b64 = match data.split_once(',') {
        Some((prefix, rest)) if prefix.starts_with("data:") => rest,
        _ => data,
    };
    general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| format!("invalid base64: {e}"))
}

/// Open a read-only connection pool to the live database.
async fn open_ro_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let db = db_path(app)?;
    let options = SqliteConnectOptions::new().filename(&db).read_only(true);
    SqlitePool::connect_with(options)
        .await
        .map_err(|e| format!("failed to open database: {e}"))
}

/// Export a story's embedded images to a ZIP. A single ordered query streams the rows so only
/// one image is decoded/held at a time, and each decoded PNG is written straight into the
/// archive on disk. Peak memory is one image.
///
/// Returns the number of images written.
#[tauri::command]
pub async fn export_images_zip(
    app: AppHandle,
    story_id: String,
    dest_path: String,
    selected_ids: Option<Vec<String>>,
) -> Result<String, String> {
    let pool = open_ro_pool(&app).await?;
    let selection = selected_ids.map(|v| v.into_iter().collect::<std::collections::HashSet<_>>());

    let out = open_dest(&app, &dest_path)?;
    let mut zip = ZipWriter::new(out);
    // PNGs are already compressed — store without re-deflating.
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

    let mut rows = sqlx::query(
        "SELECT id, image_data FROM embedded_images WHERE story_id = ? ORDER BY created_at ASC",
    )
    .bind(&story_id)
    .fetch(&pool);

    let mut written = 0usize;
    while let Some(row) = rows
        .try_next()
        .await
        .map_err(|e| format!("failed to read images: {e}"))?
    {
        let id: String = row.get("id");
        if let Some(sel) = &selection {
            if !sel.contains(&id) {
                continue;
            }
        }
        let data: String = row.get("image_data");
        if data.is_empty() {
            continue;
        }
        let bytes = match decode_image(&data) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("[export] skipping image {id}: {e}");
                continue;
            }
        };

        let name = format!("image-{:03}.png", written + 1);
        zip.start_file(&name, stored)
            .map_err(|e| format!("failed to add {name}: {e}"))?;
        zip.write_all(&bytes)
            .map_err(|e| format!("failed to write {name}: {e}"))?;
        written += 1;
    }

    drop(rows);

    if written == 0 {
        // Nothing was written — finalize the (empty) archive and report.
        let _ = zip.finish();
        pool.close().await;
        return Err("No valid images to export".to_string());
    }

    zip.finish()
        .map_err(|e| format!("failed to finalize archive: {e}"))?;
    pool.close().await;
    Ok(dest_path)
}

/// Export a single embedded image as a PNG at `dest_path`, decoding its base64 from SQLite
/// natively. Returns the written path.
#[tauri::command]
pub async fn export_single_image(
    app: AppHandle,
    image_id: String,
    dest_path: String,
) -> Result<String, String> {
    let pool = open_ro_pool(&app).await?;
    let row = sqlx::query("SELECT image_data FROM embedded_images WHERE id = ?")
        .bind(&image_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("failed to read image {image_id}: {e}"))?;
    pool.close().await;

    let data: String = row
        .map(|r| r.get::<String, _>("image_data"))
        .filter(|d| !d.is_empty())
        .ok_or_else(|| "Invalid image data".to_string())?;
    let bytes = decode_image(&data)?;

    let mut out = open_dest(&app, &dest_path)?;
    out.write_all(&bytes)
        .map_err(|e| format!("failed to write image: {e}"))?;
    out.flush().map_err(|e| format!("failed to flush image: {e}"))?;
    Ok(dest_path)
}

/// Write a story's `.avt` export to `dest_path`, natively.
///
/// The frontend passes the full export JSON with `embeddedImages` as METADATA only (no base64),
/// so nothing heavy crosses the IPC bridge. This command fills in each image's base64 `imageData`
/// from SQLite and streams the completed JSON to disk — keeping the image bytes off the WebView
/// JS heap (their sole home would otherwise be a giant `JSON.stringify` string → Android OOM).
/// Returns the written path.
#[tauri::command]
pub async fn export_story_avt(
    app: AppHandle,
    story_json: String,
    dest_path: String,
) -> Result<String, String> {
    let mut root: serde_json::Value =
        serde_json::from_str(&story_json).map_err(|e| format!("invalid export json: {e}"))?;

    // Story id, used to pull all images in one query below.
    let story_id = root
        .get("story")
        .and_then(|s| s.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Map each image id to its slot in the array (metadata only — cheap).
    let mut index_by_id: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    if let Some(images) = root.get("embeddedImages").and_then(|v| v.as_array()) {
        for (i, img) in images.iter().enumerate() {
            if let Some(id) = img.get("id").and_then(|v| v.as_str()) {
                index_by_id.insert(id.to_string(), i);
            }
        }
    }

    let pool = open_ro_pool(&app).await?;
    // One query for the whole story instead of one per image, STREAMED: each row's base64 is moved
    // straight into its JSON slot, so peak memory stays one row + the output (never all rows at
    // once, which would double the heap and risk OOM on large galleries).
    if let Some(sid) = &story_id {
        if !index_by_id.is_empty() {
            let mut rows =
                sqlx::query("SELECT id, image_data FROM embedded_images WHERE story_id = ?")
                    .bind(sid)
                    .fetch(&pool);
            while let Some(row) = rows
                .try_next()
                .await
                .map_err(|e| format!("failed to read images: {e}"))?
            {
                let id: String = row.get("id");
                if let Some(&i) = index_by_id.get(&id) {
                    let data: String = row.get("image_data");
                    if let Some(obj) = root
                        .get_mut("embeddedImages")
                        .and_then(|v| v.get_mut(i))
                        .and_then(|v| v.as_object_mut())
                    {
                        obj.insert("imageData".to_string(), serde_json::Value::String(data));
                    }
                }
            }
        }
    }
    pool.close().await;

    let file = open_dest(&app, &dest_path)?;
    let mut writer = BufWriter::new(file);
    serde_json::to_writer(&mut writer, &root).map_err(|e| format!("failed to write avt: {e}"))?;
    // Flush the buffer to the fd explicitly before it closes, so nothing is lost on a SAF fd.
    writer.flush().map_err(|e| format!("failed to flush avt: {e}"))?;
    Ok(dest_path)
}


/// Copy a user-picked SAF `content://` source (the backup chosen via the open dialog on Android)
/// into a real temp file in the app dir, and return its path. Restore needs a real, seekable file:
/// the picked URI cannot be `std::fs::open`ed, so we stream it in natively via the fs plugin's
/// content-URI file descriptor (no bytes cross the JS bridge). The caller restores from the temp
/// path; the temp is best-effort cleaned up by the restore, and the app exits right after anyway.
#[tauri::command]
pub fn import_saf_to_temp(app: AppHandle, src_uri: String) -> Result<String, String> {
    use std::str::FromStr;
    use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

    // Stage into the app's INTERNAL cache dir: always writable via std::fs. (The app-specific
    // external dir /sdcard/Android/data/<id>/files is NOT reliably creatable under scoped storage
    // and gave ENOENT.) This temp is internal-only; the user's backup itself lives wherever they
    // picked it and is read via the SAF fd below.
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("no cache dir: {e}"))?;
    std::fs::create_dir_all(&dir).ok();
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest_path = dir.join(format!(".tmp-restore-{millis}.zip"));

    let src_fp = FilePath::from_str(&src_uri).map_err(|e| format!("invalid source uri: {e}"))?;
    let mut opts = OpenOptions::new();
    opts.read(true);
    let mut src = app
        .fs()
        .open(src_fp, opts)
        .map_err(|e| format!("failed to open source: {e}"))?;
    let mut out =
        File::create(&dest_path).map_err(|e| format!("failed to create temp restore file: {e}"))?;
    io::copy(&mut src, &mut out).map_err(|e| format!("failed to copy source: {e}"))?;
    out.flush().map_err(|e| format!("failed to flush temp: {e}"))?;
    Ok(dest_path.to_string_lossy().into_owned())
}
