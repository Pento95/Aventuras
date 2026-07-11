//! Native backup / restore / image-export commands.
//!
//! These move large payloads (the SQLite database, exported images) entirely inside the
//! native side: the bytes are streamed file-to-file (or DB-to-file) and never cross the
//! Tauri IPC bridge nor land in the WebView's JS heap. Only small parameters (paths, ids)
//! travel over IPC. This is the robust fix for the Android OutOfMemoryError crashes that
//! the earlier chunked-IPC TS helpers only mitigated.

use std::fs::File;
use std::io::{self, Write};
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

/// Create a backup ZIP containing the (already VACUUMed) database file and a metadata entry.
///
/// The DB is streamed straight from disk into the archive, so nothing larger than an internal
/// buffer is ever held in memory.
#[tauri::command]
pub async fn backup_database(
    db_path: String,
    dest_path: String,
    metadata_json: String,
) -> Result<(), String> {
    let src = PathBuf::from(&db_path);
    let dest = PathBuf::from(&dest_path);

    let mut db_file =
        File::open(&src).map_err(|e| format!("failed to open db snapshot {db_path}: {e}"))?;
    let out = File::create(&dest).map_err(|e| format!("failed to create backup {dest_path}: {e}"))?;
    let mut zip = ZipWriter::new(out);

    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    zip.start_file("aventura.db", deflated)
        .map_err(|e| format!("failed to add db to archive: {e}"))?;
    io::copy(&mut db_file, &mut zip).map_err(|e| format!("failed to stream db into archive: {e}"))?;

    zip.start_file("metadata.json", SimpleFileOptions::default())
        .map_err(|e| format!("failed to add metadata to archive: {e}"))?;
    zip.write_all(metadata_json.as_bytes())
        .map_err(|e| format!("failed to write metadata: {e}"))?;

    zip.finish()
        .map_err(|e| format!("failed to finalize archive: {e}"))?;
    Ok(())
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
) -> Result<usize, String> {
    let pool = open_ro_pool(&app).await?;
    let selection = selected_ids.map(|v| v.into_iter().collect::<std::collections::HashSet<_>>());

    let out = File::create(&dest_path).map_err(|e| format!("failed to create {dest_path}: {e}"))?;
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
    zip.finish()
        .map_err(|e| format!("failed to finalize archive: {e}"))?;
    pool.close().await;

    if written == 0 {
        return Err("No valid images to export".to_string());
    }
    Ok(written)
}

/// Export a single embedded image as a PNG file, decoding its base64 from SQLite natively.
#[tauri::command]
pub async fn export_single_image(
    app: AppHandle,
    image_id: String,
    dest_path: String,
) -> Result<(), String> {
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

    std::fs::write(&dest_path, bytes).map_err(|e| format!("failed to write {dest_path}: {e}"))?;
    Ok(())
}
