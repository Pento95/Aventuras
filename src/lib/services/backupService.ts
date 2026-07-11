/**
 * BackupService — Creates and restores full backup ZIPs of the user's database.
 *
 * The backup is DB-only: it contains the raw SQLite database (via VACUUM INTO for atomic
 * consistency) plus a small metadata entry. The database already holds every story, entry,
 * lorebook entry, setting and embedded/background image, and restore only ever reads
 * `aventura.db`, so per-story `.avt` files were pure duplication and have been removed.
 *
 * The heavy work (zipping the DB, extracting it on restore) runs in native Rust
 * (`backup_database` / `restore_database`): the bytes are streamed file-to-file and never
 * cross the Tauri IPC bridge nor land in the WebView's JS heap. Only paths travel over IPC.
 * This is the robust fix for the Android OutOfMemoryError crashes that chunked-IPC helpers
 * only mitigated.
 *
 * Backwards compatible: older backups that also contain `stories/*.avt` still restore fine,
 * since the native restore ignores everything except `aventura.db`.
 */

import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { remove, exists, stat } from '@tauri-apps/plugin-fs'
import * as path from '@tauri-apps/api/path'
import { getVersion } from '@tauri-apps/api/app'
import { database } from './database'

interface BackupMetadata {
  version: number
  createdAt: string
  appVersion: string
  storyCount: number
  hasDatabaseSnapshot: boolean
  databaseSizeBytes: number
}

class BackupService {
  /**
   * Create a full backup ZIP containing the database and metadata.
   * @returns true if backup was saved, false if user cancelled the dialog
   */
  async createFullBackup(): Promise<boolean> {
    // 1. Prompt user for save location first (fail fast if they cancel)
    const datestamp = new Date().toISOString().slice(0, 10)
    const savePath = await save({
      title: 'Save Aventura Backup',
      defaultPath: `aventura-backup-${datestamp}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })

    if (!savePath) return false

    console.log('[Backup] Starting full backup...')

    let appVersion = '0.0.0'
    try {
      appVersion = await getVersion()
    } catch {
      // ignore
    }

    // 2. Create a consistent DB snapshot via VACUUM INTO (writes to disk, no large buffer).
    //    Fall back to the live DB file if VACUUM is unavailable.
    const tempDir = await path.tempDir()
    const tempDbPath = await path.join(tempDir, `aventura-backup-${Date.now()}.db`)
    let dbSourcePath: string | null = null
    let cleanupTemp = false

    try {
      await database.vacuumInto(tempDbPath)
      if (await exists(tempDbPath)) {
        dbSourcePath = tempDbPath
        cleanupTemp = true
      }
    } catch (error) {
      console.warn('[Backup] VACUUM INTO failed, falling back to live DB file:', error)
    }

    if (!dbSourcePath) {
      const appDataDir = await path.appDataDir()
      const livePath = await path.join(appDataDir, 'aventura.db')
      if (await exists(livePath)) dbSourcePath = livePath
    }

    if (!dbSourcePath) {
      console.error('[Backup] No database snapshot available')
      throw new Error('Could not read the database to back up.')
    }

    try {
      // 3. Metadata (settings live inside the DB snapshot, no separate export needed)
      let storyCount = 0
      try {
        storyCount = await database.countStories()
      } catch (error) {
        console.warn('[Backup] Failed to count stories:', error)
      }

      let databaseSizeBytes = 0
      try {
        databaseSizeBytes = Number((await stat(dbSourcePath)).size)
      } catch {
        // Non-critical
      }

      const metadata: BackupMetadata = {
        version: 1,
        createdAt: new Date().toISOString(),
        appVersion,
        storyCount,
        hasDatabaseSnapshot: true,
        databaseSizeBytes,
      }

      // 4. Zip the DB straight to disk in native code (no JS/IPC buffer of the DB bytes)
      console.log('[Backup] Writing archive...')
      await invoke('backup_database', {
        dbPath: dbSourcePath,
        destPath: savePath,
        metadataJson: JSON.stringify(metadata),
      })
      console.log(
        `[Backup] Saved to ${savePath} (${(databaseSizeBytes / 1024 / 1024).toFixed(2)} MB DB)`,
      )
    } finally {
      if (cleanupTemp) {
        try {
          if (await exists(tempDbPath)) await remove(tempDbPath)
        } catch {
          // Non-critical cleanup failure
        }
      }
    }

    return true
  }

  /**
   * Restore the application from a backup ZIP file.
   * Replaces the current database with the one from the backup, then exits.
   * The user must manually restart the app so migrations run on the restored DB.
   * @param zipPath Path to the backup ZIP file (from a file picker dialog)
   */
  async restoreFromBackup(zipPath: string): Promise<void> {
    console.log('[Restore] Loading backup from', zipPath)

    // 1. Close the current DB connection so the file can be replaced underneath it.
    console.log('[Restore] Closing database connection...')
    await database.close()

    // 2. Extract aventura.db from the archive straight onto the live DB file in native code.
    //    A safety copy (aventura-pre-restore.db) and WAL/SHM cleanup are handled natively.
    //    Throws if the archive has no aventura.db entry.
    await invoke('restore_database', { zipPath })
    console.log('[Restore] Database file replaced.')

    // 3. Exit the app — user must reopen so migrations run on the restored DB.
    //    Using exit() instead of relaunch() to avoid Windows webview2 crash
    //    (Chrome_WidgetWin_0 unregister error).
    console.log('[Restore] Exiting application. Please restart manually.')
    const { exit } = await import('@tauri-apps/plugin-process')
    await exit(0)
  }
}

export const backupService = new BackupService()
