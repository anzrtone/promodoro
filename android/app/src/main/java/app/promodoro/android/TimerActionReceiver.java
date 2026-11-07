package app.promodoro.android;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Lands the timer notification's buttons. A broadcast, not an activity, so tapping pause
 * leaves the notification shade open (an activity PendingIntent always collapses it). If the
 * app is running the tap goes straight to JS; if it was closed, the app is launched and applies
 * the tap once it is up.
 */
public class TimerActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getStringExtra(TimerNotificationPlugin.EXTRA_ACTION);
        if (action == null || TimerNotificationPlugin.dispatch(action)) return;
        try {
            ctx.startActivity(new Intent(ctx, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    .putExtra(TimerNotificationPlugin.EXTRA_ACTION, action));
        } catch (RuntimeException ignored) {
            // Android may refuse a background launch; the next time the app opens it catches up.
        }
    }
}
