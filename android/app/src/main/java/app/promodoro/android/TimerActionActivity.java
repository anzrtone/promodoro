package app.promodoro.android;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * Invisible landing spot for the timer notification's buttons. If the app is running the
 * tap goes straight to JS and nothing appears on screen; if it was closed, the app is
 * launched and applies the tap once it is up.
 */
public class TimerActionActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String action = getIntent().getStringExtra(TimerNotificationPlugin.EXTRA_ACTION);
        if (action != null && !TimerNotificationPlugin.dispatch(action)) {
            Intent launch = new Intent(this, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    .putExtra(TimerNotificationPlugin.EXTRA_ACTION, action);
            startActivity(launch);
        }
        finish();
    }
}
