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
