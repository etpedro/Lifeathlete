package app.lifeathlete.android;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge is created in super.onCreate.
        registerPlugin(HealthConnectBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
