/**
 * Android shell (Capacitor). A WebView can't ring reliably once the phone sleeps, so
 * every running timer's crossing moment is handed to Android's AlarmManager through
 * Local Notifications (exact, allow-while-idle). Each alarm sound has its own
 * notification channel backed by a WAV in res/raw (rendered by scripts/render-sounds.ts
 * from the same synth code the app plays in the foreground).
 */
import { App } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { SOUNDS } from '@/audio/catalog';
import type { AlarmSpec, NativeAction, Platform, PlatformHandlers, StatusSpec } from './types';

const STATUS_ID = 1;
const BACKUP_DIR = 'Promodoro';
/** timerId → { notification id, due time } for alarms we've handed to AlarmManager. */
const scheduled = new Map<string, { n: number; at: number }>();
let lastStatusKey = '';
let backgroundAt = 0;
let canNotify = false;

/** Stable positive int32 for a timer id (notification ids must be ints). */
function notifId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return 1000 + (Math.abs(h) % 2_000_000_000);
}

/**
 * Channels are fixed once created (Android ignores later changes), so each sound /
 * vibration combination gets its own. These channels belong to Promodoro only: they
 * never touch the phone's own ringtone or notification sound.
 */
const channelFor = (a: AlarmSpec) =>
  a.quiet ? 'alarm_quiet' : a.silent ? 'alarm_silent' : a.vibrate ? `alarm_${a.soundId}` : `alarm_${a.soundId}_still`;

async function ensureChannels() {
  for (const s of SOUNDS) {
    for (const vibration of [true, false]) {
      await LocalNotifications.createChannel({
        id: vibration ? `alarm_${s.id}` : `alarm_${s.id}_still`,
        name: `Alarm · ${s.name}${vibration ? '' : ' (no vibration)'}`,
        description: 'Rings when a Promodoro timer reaches its goal.',
        importance: 5,
        visibility: 1,
        sound: `${s.id}.wav`,
        vibration,
        lights: true,
        lightColor: '#EE6B6E',
      });
    }
  }
  await LocalNotifications.createChannel({
    id: 'alarm_silent',
    name: 'Alarm · Silent + vibrate',
    importance: 5,
    visibility: 1,
    sound: 'silence.wav',
    vibration: true,
  });
  await LocalNotifications.createChannel({
    id: 'alarm_quiet',
    name: 'Goal reached · quiet',
    description: 'A silent note when a timer that keeps counting reaches its goal.',
    importance: 2,
    visibility: 1,
    sound: 'silence.wav',
    vibration: false,
  });
  await LocalNotifications.createChannel({
    id: 'status',
    name: 'Running timer',
    description: 'A quiet note showing the timer that is running.',
    importance: 2,
    visibility: 1,
    vibration: false,
  });
  await LocalNotifications.registerActionTypes({
    types: [
      { id: 'RUNNING', actions: [{ id: 'toggle', title: 'Pause / resume' }, { id: 'done', title: 'Done' }] },
      { id: 'ALARM', actions: [{ id: 'start-break', title: 'Take a break' }, { id: 'done', title: 'Done' }] },
    ],
  });
}

export const android: Platform = {
  kind: 'android',
  backupFolderPickable: false,
  nativeAlarmSound: () => canNotify,

  async init(h: PlatformHandlers) {
    canNotify = (await LocalNotifications.checkPermissions()).display === 'granted';
    try {
      await ensureChannels();
    } catch (err) {
      console.warn('[android] channel setup failed', err);
    }
    await LocalNotifications.addListener('localNotificationActionPerformed', (ev) => {
      const extra = ev.notification.extra as { timerId?: string } | undefined;
      if (ev.actionId && ev.actionId !== 'tap') h.onAction(ev.actionId as NativeAction);
      else if (extra?.timerId) h.onAlarm(extra.timerId);
    });
    await LocalNotifications.addListener('localNotificationReceived', (n) => {
      const extra = n.extra as { timerId?: string } | undefined;
      if (extra?.timerId) h.onAlarm(extra.timerId);
    });
    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        h.onResume(backgroundAt ? Date.now() - backgroundAt : 0);
        backgroundAt = 0;
      } else {
        backgroundAt = Date.now();
        h.onBackground();
      }
    });
    await App.addListener('backButton', () => {
      if (!h.onBack?.()) void App.minimizeApp();
    });
  },

  async syncAlarms(alarms: AlarmSpec[]) {
    const now = Date.now();
    const wanted = new Map(alarms.map((a) => [a.id, a]));
    // Only cancel alarms that are still in the future. One that already fired is a
    // delivered notification: cancelling it would silence the ringing alarm.
    const cancel: Array<{ id: number }> = [];
    for (const [id, s] of scheduled) {
      const w = wanted.get(id);
      if (w && w.at === s.at) continue;
      if (s.at > now) cancel.push({ id: s.n });
      scheduled.delete(id);
    }
    if (cancel.length) await LocalNotifications.cancel({ notifications: cancel });
    const toSchedule = alarms.filter((a) => a.at > now - 1000 && scheduled.get(a.id)?.at !== a.at);
    if (!toSchedule.length) return;
    await LocalNotifications.schedule({
      notifications: toSchedule.map((a) => {
        const id = notifId(a.id);
        scheduled.set(a.id, { n: id, at: a.at });
        return {
          id,
          title: a.title,
          body: a.body,
          channelId: channelFor(a),
          schedule: { at: new Date(Math.max(a.at, now + 500)), allowWhileIdle: true },
          actionTypeId: 'ALARM',
          smallIcon: 'ic_stat_pomo',
          iconColor: '#EE6B6E',
          extra: { timerId: a.id },
        };
      }),
    });
  },

  async setStatus(status: StatusSpec | null) {
    const key = status ? `${status.key}|${status.running}` : '';
    if (key === lastStatusKey) return;
    lastStatusKey = key;
    if (!status) {
      await LocalNotifications.cancel({ notifications: [{ id: STATUS_ID }] });
      return;
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: STATUS_ID,
          title: status.title,
          body: status.detail,
          channelId: 'status',
          ongoing: status.running,
          autoCancel: false,
          actionTypeId: 'RUNNING',
          smallIcon: 'ic_stat_pomo',
          iconColor: '#EE6B6E',
        },
      ],
    });
  },

  async requestNotificationPermission() {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === 'granted') return (canNotify = true);
    const req = await LocalNotifications.requestPermissions();
    canNotify = req.display === 'granted';
    return canNotify;
  },

  async saveExport(fileName, _mime, contents) {
    const res = await Filesystem.writeFile({ path: fileName, data: contents, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: fileName, dialogTitle: 'Save your Promodoro export', files: [res.uri] });
    return res.uri;
  },

  async saveBinary(fileName, _mime, base64) {
    const res = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    await Share.share({ title: fileName, dialogTitle: 'Share your notebook page', files: [res.uri] });
    return res.uri;
  },

  vibrate(kind) {
    if (kind === 'tap') void Haptics.impact({ style: ImpactStyle.Light });
    else if (kind === 'success') void Haptics.notification({ type: NotificationType.Success });
    else void Haptics.vibrate({ duration: 600 });
  },

  async pickBackupFolder() {
    return null;
  },

  async defaultBackupFolder() {
    return `Documents/${BACKUP_DIR}`;
  },

  /**
   * Backups go to the public Documents/Promodoro folder: it survives uninstalling the
   * app and can be synced by Google Drive / Syncthing / FolderSync if the user wants.
   */
  async writeBackup(_dir, fileName, contents, keep) {
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== 'granted') await Filesystem.requestPermissions();
    const tmp = `${BACKUP_DIR}/.${fileName}.tmp`;
    const final = `${BACKUP_DIR}/${fileName}`;
    await Filesystem.writeFile({ path: tmp, data: contents, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    try {
      await Filesystem.deleteFile({ path: final, directory: Directory.Documents });
    } catch {
      /* first backup of the day */
    }
    await Filesystem.rename({ from: tmp, to: final, directory: Directory.Documents, toDirectory: Directory.Documents });
    const { files } = await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Documents });
    const ours = files
      .map((f) => f.name)
      .filter((n) => /^promodoro-backup-.*\.json$/.test(n))
      .sort()
      .reverse();
    const old = ours.slice(Math.max(1, keep));
    for (const name of old) await Filesystem.deleteFile({ path: `${BACKUP_DIR}/${name}`, directory: Directory.Documents });
    return { path: `Documents/${final}`, pruned: old.length };
  },

  /** Same public Documents/Promodoro folder as backups, so Drive / Syncthing / FolderSync can carry it to the other device. */
  async readSyncFiles() {
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== 'granted') await Filesystem.requestPermissions();
    let names: string[];
    try {
      names = (await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Documents })).files.map((f) => f.name);
    } catch {
      return []; // folder not created yet
    }
    const out: Array<{ name: string; text: string }> = [];
    for (const name of names.filter((n) => /^promodoro-sync-[\w-]+\.json$/.test(n))) {
      try {
        const r = await Filesystem.readFile({ path: `${BACKUP_DIR}/${name}`, directory: Directory.Documents, encoding: Encoding.UTF8 });
        out.push({ name, text: typeof r.data === 'string' ? r.data : await r.data.text() });
      } catch {
        /* a file the cloud app hasn't finished downloading: next time */
      }
    }
    return out;
  },

  async writeSyncFile(_dir, fileName, contents) {
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== 'granted') await Filesystem.requestPermissions();
    const tmp = `${BACKUP_DIR}/.${fileName}.tmp`;
    const final = `${BACKUP_DIR}/${fileName}`;
    await Filesystem.writeFile({ path: tmp, data: contents, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    try {
      await Filesystem.deleteFile({ path: final, directory: Directory.Documents });
    } catch {
      /* first write */
    }
    await Filesystem.rename({ from: tmp, to: final, directory: Directory.Documents, toDirectory: Directory.Documents });
    return `Documents/${final}`;
  },
};
