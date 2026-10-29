package app.promodoro.android;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * A countdown just reached zero. If the timer keeps counting (overtime) the notification
 * turns into a count-up from that moment; otherwise it goes away. Runs without the app.
 */
public class TimerFlipReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if ("up".equals(intent.getStringExtra("after"))) {
            long at = intent.getLongExtra("at", System.currentTimeMillis());
            TimerNotificationPlugin.post(ctx, "up", at, intent.getStringExtra("title"), intent.getStringExtra("detail"), "", "end", true);
        } else {
            ctx.getSystemService(NotificationManager.class).cancel(TimerNotificationPlugin.NOTIF_ID);
        }
    }
}
