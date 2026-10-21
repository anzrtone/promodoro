//! Native alarm scheduler.
//!
//! The WebView hands us the wall-clock instant at which each running timer reaches its
//! goal. A small Rust thread watches those instants and, when one passes, shows an OS
//! notification, flashes the taskbar and emits `alarm-fired` to the UI (which plays the
//! sound and records the event). This keeps alarms on time even when the window is hidden
//! in the tray and the WebView is throttled or asleep.

use std::collections::HashSet;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, UserAttentionType};
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Alarm {
    pub id: String,
    pub at_ms: i64,
    pub title: String,
    pub body: String,
}

#[derive(Default)]
pub struct Scheduler {
    alarms: Mutex<Vec<Alarm>>,
    /// (timer id, due instant) pairs that already rang, so a re-sync can't double ring.
    fired: Mutex<HashSet<(String, i64)>>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

impl Scheduler {
    pub fn replace(&self, alarms: Vec<Alarm>) {
        let fired = self.fired.lock().unwrap();
        let pending = alarms
            .into_iter()
            .filter(|a| !fired.contains(&(a.id.clone(), a.at_ms)))
            .collect();
        *self.alarms.lock().unwrap() = pending;
    }

    fn take_due(&self, now: i64) -> Vec<Alarm> {
        let mut alarms = self.alarms.lock().unwrap();
        let (due, keep): (Vec<Alarm>, Vec<Alarm>) = alarms.drain(..).partition(|a| a.at_ms <= now);
        *alarms = keep;
        let mut fired = self.fired.lock().unwrap();
        if fired.len() > 500 {
            fired.clear();
        }
        due.into_iter()
            .filter(|a| fired.insert((a.id.clone(), a.at_ms)))
            .collect()
    }
}

/// Start the watcher thread. 250 ms resolution is plenty for a focus timer.
pub fn start(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(250));
        let due = app.state::<Scheduler>().take_due(now_ms());
        for alarm in due {
            let _ = app
                .notification()
                .builder()
                .title(&alarm.title)
                .body(&alarm.body)
                .show();
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.request_user_attention(Some(UserAttentionType::Informational));
            }
            let _ = app.emit("alarm-fired", alarm.id.clone());
        }
    });
}

#[tauri::command]
pub fn schedule_alarms(scheduler: tauri::State<'_, Scheduler>, alarms: Vec<Alarm>) {
    scheduler.replace(alarms);
}
