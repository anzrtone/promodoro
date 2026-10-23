package app.promodoro.android;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TimerNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
