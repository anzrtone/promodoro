//! File I/O for exports and automatic backups.
//!
//! Export paths come from the native Save dialog the user just answered. Backup files are
//! written atomically (temp file + rename) so a crash or power cut mid-write never leaves
//! a truncated backup, and old dated backups beyond `keep` are pruned.

use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use serde::Serialize;
use tauri::{AppHandle, Manager};

const PREFIX: &str = "promodoro-backup-";

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(err)?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        err(e)
    })
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    write_atomic(Path::new(&path), contents.as_bytes())
}

#[tauri::command]
pub fn write_base64_file(path: String, base64: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(base64).map_err(err)?;
    write_atomic(Path::new(&path), &bytes)
}

/// Default backup location: Documents/Promodoro Backups.
#[tauri::command]
pub fn default_backup_dir(app: AppHandle) -> Result<String, String> {
    let docs = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(err)?;
    Ok(docs.join("Promodoro Backups").to_string_lossy().into_owned())
}

#[derive(Serialize)]
pub struct BackupWriteResult {
    path: String,
    pruned: usize,
}

#[tauri::command]
pub fn backup_write(dir: String, file_name: String, contents: String, keep: usize) -> Result<BackupWriteResult, String> {
    // Only our own dated file names: never a path from elsewhere.
    let valid = file_name.starts_with(PREFIX)
        && file_name.ends_with(".json")
        && !file_name.contains(['/', '\\'])
        && !file_name.contains("..");
    if !valid {
        return Err("invalid backup file name".into());
    }
    let dir = PathBuf::from(dir);
    fs::create_dir_all(&dir).map_err(err)?;
    let target = dir.join(&file_name);
    write_atomic(&target, contents.as_bytes())?;

    let mut ours: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(err)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with(PREFIX) && n.ends_with(".json"))
                .unwrap_or(false)
        })
        .collect();
    ours.sort();
    ours.reverse();
    let mut pruned = 0;
    for old in ours.iter().skip(keep.max(1)) {
        if fs::remove_file(old).is_ok() {
            pruned += 1;
        }
    }
    Ok(BackupWriteResult {
        path: target.to_string_lossy().into_owned(),
        pruned,
    })
}

const SYNC_PREFIX: &str = "promodoro-sync-";
const SYNC_SUBFOLDER: &str = "Promodoro Sync";

#[derive(Serialize)]
pub struct CloudFolder {
    label: String,
    /// Where the sync files go: a "Promodoro Sync" folder inside the cloud folder (made on first sync).
    path: String,
}

/// Cloud-storage folders that exist on this computer (Dropbox, OneDrive, Google Drive, iCloud), so
/// the user can pick one with a click instead of hunting for a folder.
#[tauri::command]
pub fn cloud_folders(app: AppHandle) -> Vec<CloudFolder> {
    let mut found: Vec<(String, PathBuf)> = Vec::new();
    let mut add = |label: &str, p: PathBuf| {
        if p.is_dir() && !found.iter().any(|(_, q)| *q == p) {
            found.push((label.to_string(), p));
        }
    };
    if let Ok(home) = app.path().home_dir() {
        add("Dropbox", home.join("Dropbox"));
        add("iCloud Drive", home.join("iCloudDrive"));
        add("iCloud Drive", home.join("Library/Mobile Documents/com~apple~CloudDocs"));
        add("Google Drive", home.join("Google Drive"));
        add("Google Drive", home.join("Google Drive/My Drive"));
        add("Google Drive", home.join("My Drive"));
        // Windows/macOS add one folder per account: "OneDrive", "OneDrive - Company", …
        if let Ok(entries) = fs::read_dir(&home) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if name.starts_with("OneDrive") {
                    add("OneDrive", e.path());
                }
            }
        }
        // macOS keeps cloud folders under ~/Library/CloudStorage.
        if let Ok(entries) = fs::read_dir(home.join("Library/CloudStorage")) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                let label = if name.starts_with("Dropbox") {
                    "Dropbox"
                } else if name.starts_with("OneDrive") {
                    "OneDrive"
                } else if name.starts_with("GoogleDrive") {
                    "Google Drive"
                } else {
                    continue;
                };
                let mine = e.path().join("My Drive");
                add(label, if mine.is_dir() { mine } else { e.path() });
            }
        }
    }
    // Google Drive for desktop on Windows mounts a drive letter with a "My Drive" folder.
    if cfg!(target_os = "windows") {
        for letter in b'D'..=b'Z' {
            add("Google Drive", PathBuf::from(format!("{}:\\My Drive", letter as char)));
        }
    }
    found
        .into_iter()
        .map(|(label, p)| CloudFolder {
            label,
            path: p.join(SYNC_SUBFOLDER).to_string_lossy().into_owned(),
        })
        .collect()
}

fn valid_sync_name(n: &str) -> bool {
    n.starts_with(SYNC_PREFIX) && n.ends_with(".json") && !n.contains(['/', '\\']) && !n.contains("..")
}

#[derive(Serialize)]
pub struct SyncFile {
    name: String,
    contents: String,
}

/// Read every device's sync snapshot from the shared folder. Files that can't be read yet
/// (e.g. a cloud app is still downloading them) are skipped and picked up on the next sync.
#[tauri::command]
pub fn sync_read_dir(dir: String) -> Result<Vec<SyncFile>, String> {
    let dir = PathBuf::from(dir);
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(err)?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !valid_sync_name(&name) {
            continue;
        }
        if let Ok(contents) = fs::read_to_string(entry.path()) {
            out.push(SyncFile { name, contents });
        }
    }
    Ok(out)
}

/// Write this device's sync snapshot (atomically) into the shared folder.
#[tauri::command]
pub fn sync_write(dir: String, file_name: String, contents: String) -> Result<String, String> {
    if !valid_sync_name(&file_name) {
        return Err("invalid sync file name".into());
    }
    let dir = PathBuf::from(dir);
    fs::create_dir_all(&dir).map_err(err)?;
    let target = dir.join(&file_name);
    write_atomic(&target, contents.as_bytes())?;
    Ok(target.to_string_lossy().into_owned())
}

/// Open a folder in Explorer / Finder / the Linux file manager.
#[tauri::command]
pub fn reveal_folder(dir: String) -> Result<(), String> {
    let cmd = if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(cmd).arg(&dir).spawn().map(|_| ()).map_err(err)
}
