/** JS side of TimerNotificationPlugin.java: the ticking running-timer notification on Android. */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface TimerNotificationOptions {
  title: string;
  detail: string;
  kind: 'down' | 'up' | 'paused';
  /** Epoch ms: when a countdown reaches zero, or when a count-up began. */
  at: number;
  /** The time to show while paused. */
  frozen: string;
}

export interface TimerNotificationPlugin {
  show(options: TimerNotificationOptions): Promise<void>;
  hide(): Promise<void>;
  addListener(event: 'action', cb: (e: { action: string }) => void): Promise<PluginListenerHandle>;
}

export const TimerNotification = registerPlugin<TimerNotificationPlugin>('TimerNotification');
