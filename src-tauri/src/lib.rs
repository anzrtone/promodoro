//! Promodoro desktop shell (Tauri 2).
//!
//! The UI, timer engine and IndexedDB storage live in the WebView and are shared with
//! the Android app. This shell adds what a desktop focus timer needs natively:
//!  - a Rust alarm scheduler that rings on time while the window is hidden (alarms.rs)
//!  - a system tray with a live timer tooltip and quick actions
//!  - close-to-tray, a global start/pause shortcut (Ctrl+Alt+P), single instance
//!  - "sticky-note" mini mode: a tiny always-on-top window
//!  - atomic file writes for exports and automatic backups (files.rs)

mod alarms;
mod files;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

#[derive(Default)]
struct Shell {
    close_to_tray: AtomicBool,
    /// Window geometry saved when entering mini mode, restored on exit.
    before_mini: Mutex<Option<(PhysicalSize<u32>, PhysicalPosition<i32>)>>,
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn native_action(app: &AppHandle, action: &str) {
    let _ = app.emit("native-action", action.to_string());
}

#[tauri::command]
fn set_close_to_tray(shell: tauri::State<'_, Shell>, on: bool) {
    shell.close_to_tray.store(on, Ordering::Relaxed);
}

/// Live timer text for the tray tooltip (and the menu-bar title on macOS).
#[tauri::command]
fn set_status(app: AppHandle, text: Option<String>) {
    if let Some(tray) = app.tray_by_id("main") {
        let tip = text.clone().unwrap_or_else(|| "Promodoro".into());
        let _ = tray.set_tooltip(Some(tip));
        #[cfg(target_os = "macos")]
        let _ = tray.set_title(text);
    }
}

#[tauri::command]
fn set_mini_mode(window: WebviewWindow, shell: tauri::State<'_, Shell>, on: bool) -> Result<(), String> {
    let e = |e: tauri::Error| e.to_string();
    if on {
        let size = window.outer_size().map_err(e)?;
        let pos = window.outer_position().map_err(e)?;
        *shell.before_mini.lock().unwrap() = Some((size, pos));
        window.set_min_size(Some(LogicalSize::new(240.0, 200.0))).map_err(e)?;
        window.set_decorations(false).map_err(e)?;
        window.set_always_on_top(true).map_err(e)?;
        window.set_size(LogicalSize::new(300.0, 286.0)).map_err(e)?;
    } else {
        window.set_always_on_top(false).map_err(e)?;
        window.set_decorations(true).map_err(e)?;
        window.set_min_size(Some(LogicalSize::new(380.0, 560.0))).map_err(e)?;
        if let Some((size, pos)) = shell.before_mini.lock().unwrap().take() {
            window.set_size(size).map_err(e)?;
            window.set_position(pos).map_err(e)?;
        } else {
            window.set_size(LogicalSize::new(1180.0, 820.0)).map_err(e)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Open Promodoro", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Start / pause focus", true, Some("CmdOrCtrl+Alt+P"))?;
    let done = MenuItem::with_id(app, "done", "Done", true, None::<&str>)?;
    let mini = MenuItem::with_id(app, "mini", "Sticky-note mode", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Promodoro", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &sep, &toggle, &done, &mini, &sep2, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Promodoro")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            "mini" => {
                show_main(app);
                native_action(app, "mini");
            }
            other => native_action(app, other),
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
        let toggle = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyP);
        builder = builder
            // Must be first: a second launch just focuses the running app.
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts([toggle])
                    .expect("register global shortcut")
                    .with_handler(move |app, shortcut, event| {
                        if shortcut == &toggle && event.state() == ShortcutState::Pressed {
                            native_action(app, "toggle");
                        }
                    })
                    .build(),
            );
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Shell { close_to_tray: AtomicBool::new(true), ..Default::default() })
        .manage(alarms::Scheduler::default())
        .setup(|app| {
            build_tray(app)?;
            alarms::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let shell = window.state::<Shell>();
                if shell.close_to_tray.load(Ordering::Relaxed) {
                    // Keep timers and alarms alive in the tray.
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            alarms::schedule_alarms,
            set_close_to_tray,
            set_status,
            set_mini_mode,
            quit_app,
            files::write_text_file,
            files::write_base64_file,
            files::default_backup_dir,
            files::backup_write,
            files::cloud_folders,
            files::sync_read_dir,
            files::sync_write,
            files::reveal_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Promodoro");
}
