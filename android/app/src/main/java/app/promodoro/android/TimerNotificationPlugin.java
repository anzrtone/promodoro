package app.promodoro.android;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The running-timer notification: a real chronometer (it ticks on its own, with no JS
 * running) plus pause / resume / stop buttons. Buttons open {@link TimerActionActivity},
 * which hands the tap to this plugin, or launches the app first if it was closed.
 */
@CapacitorPlugin(name = "TimerNotification")
public class TimerNotificationPlugin extends Plugin {
    static final String EXTRA_ACTION = "promodoro_action";
    static final String CHANNEL = "timer_live";
    /** Same id the plain status notification uses, so the two replace each other. */
    static final int NOTIF_ID = 1;
    private static final int CORAL = 0xFFEE6B6E;

    private static TimerNotificationPlugin live;

    @Override
    public void load() {
        live = this;
        if (getActivity() != null) handleIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void handleOnDestroy() {
        if (live == this) live = null;
        super.handleOnDestroy();
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra(EXTRA_ACTION);
        if (action == null) return;
        intent.removeExtra(EXTRA_ACTION);
        dispatch(action);
    }

    /** Hand a button tap to JS. False when the app isn't running (the caller launches it). */
    static boolean dispatch(String action) {
        TimerNotificationPlugin p = live;
        if (p == null) return false;
        JSObject data = new JSObject();
        data.put("action", action);
        // Retained, so a tap that launched the app is delivered once JS starts listening.
        p.notifyListeners("action", data, true);
        return true;
    }

    private static void ensureChannel(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Running timer (live)", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("A quiet, ticking note with pause and stop buttons for the timer that is running.");
        ch.setShowBadge(false);
        ch.enableVibration(false);
        ch.setSound(null, null);
        nm.createNotificationChannel(ch);
    }

    private static PendingIntent actionIntent(Context ctx, String action, int code) {
        Intent i = new Intent(ctx, TimerActionActivity.class).putExtra(EXTRA_ACTION, action);
        i.setAction("app.promodoro.android.TIMER_" + action);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /**
     * kind: "down" (at = when it reaches zero), "up" (at = when counting began) or
     * "paused" (frozen = the time to show). For "down", `after` says what happens at zero
     * even if the app is asleep: "up" keeps counting overtime, "end" removes the notification.
     */
    @PluginMethod
    public void show(PluginCall call) {
        JSObject d = call.getData();
        // Timestamps outrun an int, and PluginCall.getDouble/getLong ignore other number types.
        long at = d.optLong("at", System.currentTimeMillis());
        try {
            post(getContext(), d.optString("kind", "up"), at, d.optString("title", "Promodoro"), d.optString("detail", ""), d.optString("frozen", ""), d.optString("after", "end"), d.optBoolean("plus", false));
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not show the timer notification", e);
        }
    }

    @PluginMethod
    public void hide(PluginCall call) {
        cancelFlip(getContext());
        getContext().getSystemService(NotificationManager.class).cancel(NOTIF_ID);
        call.resolve();
    }

    static void post(Context ctx, String kind, long at, String title, String detail, String frozen, String after, boolean plus) {
        ensureChannel(ctx);
        boolean paused = "paused".equals(kind);

        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.notification_timer);
        rv.setTextViewText(R.id.timer_label, title);
        if (paused) {
            rv.setViewVisibility(R.id.timer_chrono, View.GONE);
            rv.setViewVisibility(R.id.timer_frozen, View.VISIBLE);
            rv.setTextViewText(R.id.timer_frozen, frozen);
            rv.setImageViewResource(R.id.btn_primary, R.drawable.ic_timer_play);
            rv.setInt(R.id.btn_primary, "setBackgroundResource", R.drawable.btn_circle_coral);
            rv.setViewVisibility(R.id.btn_stop, View.VISIBLE);
            rv.setOnClickPendingIntent(R.id.btn_stop, actionIntent(ctx, "done", 2));
        } else {
            long base = SystemClock.elapsedRealtime() + (at - System.currentTimeMillis());
            rv.setViewVisibility(R.id.timer_frozen, View.GONE);
            rv.setViewVisibility(R.id.timer_chrono, View.VISIBLE);
            rv.setChronometerCountDown(R.id.timer_chrono, "down".equals(kind));
            // The format's %s is the time; "+%s" marks overtime.
            rv.setChronometer(R.id.timer_chrono, base, plus ? "+%s" : null, true);
            rv.setImageViewResource(R.id.btn_primary, R.drawable.ic_timer_pause);
            rv.setInt(R.id.btn_primary, "setBackgroundResource", R.drawable.btn_circle_soft);
            rv.setViewVisibility(R.id.btn_stop, View.GONE);
        }
        rv.setOnClickPendingIntent(R.id.btn_primary, actionIntent(ctx, "toggle", 1));

        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_pomo)
                .setColor(CORAL)
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(rv)
                // Plain text for places that can't show the custom view (always-on display, wearables).
                .setContentTitle(paused ? frozen : title)
                .setContentText(detail)
                .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setAutoCancel(false)
                .setOngoing(!paused)
                .setContentIntent(openPi);
        ctx.getSystemService(NotificationManager.class).notify(NOTIF_ID, b.build());

        cancelFlip(ctx);
        if ("down".equals(kind)) scheduleFlip(ctx, at, title, detail, after);
    }

    /** The moment a countdown reaches zero, with or without the app running. */
    private static PendingIntent flipIntent(Context ctx, long at, String title, String detail, String after, int flags) {
        Intent i = new Intent(ctx, TimerFlipReceiver.class)
                .putExtra("at", at)
                .putExtra("title", title)
                .putExtra("detail", detail)
                .putExtra("after", after);
        return PendingIntent.getBroadcast(ctx, 3, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void scheduleFlip(Context ctx, long at, String title, String detail, String after) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        PendingIntent pi = flipIntent(ctx, at, title, detail, after, PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static void cancelFlip(Context ctx) {
        PendingIntent pi = flipIntent(ctx, 0, "", "", "", PendingIntent.FLAG_NO_CREATE);
        if (pi != null) {
            ctx.getSystemService(AlarmManager.class).cancel(pi);
            pi.cancel();
        }
    }
}
