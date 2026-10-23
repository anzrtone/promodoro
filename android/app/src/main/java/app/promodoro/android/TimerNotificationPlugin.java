package app.promodoro.android;

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
     * "paused" (frozen = the time to show).
     */
    @PluginMethod
    public void show(PluginCall call) {
        Context ctx = getContext();
        ensureChannel(ctx);
        String kind = call.getString("kind", "up");
        String title = call.getString("title", "Promodoro");
        String detail = call.getString("detail", "");
        String frozen = call.getString("frozen", "");
        Double atArg = call.getDouble("at");
        long at = atArg == null ? System.currentTimeMillis() : atArg.longValue();
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
            rv.setChronometer(R.id.timer_chrono, base, null, true);
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

        try {
            ctx.getSystemService(NotificationManager.class).notify(NOTIF_ID, b.build());
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not show the timer notification", e);
        }
    }

    @PluginMethod
    public void hide(PluginCall call) {
        getContext().getSystemService(NotificationManager.class).cancel(NOTIF_ID);
        call.resolve();
    }
}
