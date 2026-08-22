package com.lifev1.app;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScaleBackground")
public class ScaleBackgroundPlugin extends Plugin {
    private static ScaleBackgroundPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    static void emitMeasurement(JSObject data) {
        if (instance != null) {
            instance.notifyListeners("measurement", data, false);
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String ingestToken = call.getString("ingestToken");
        String ingestUrl = call.getString("ingestUrl");
        if (deviceId == null || deviceId.isEmpty() || ingestToken == null || ingestToken.isEmpty()) {
            call.reject("Missing deviceId or ingestToken");
            return;
        }

        Intent intent = new Intent(getContext(), ScaleForegroundService.class);
        intent.putExtra(ScaleForegroundService.EXTRA_DEVICE_ID, deviceId);
        intent.putExtra(ScaleForegroundService.EXTRA_DEVICE_NAME, call.getString("deviceName", "QN-Scale"));
        intent.putExtra(ScaleForegroundService.EXTRA_INGEST_TOKEN, ingestToken);
        intent.putExtra(ScaleForegroundService.EXTRA_INGEST_URL, ingestUrl);
        intent.putExtra(ScaleForegroundService.EXTRA_API_KEY, call.getString("apiKey", ""));
        ContextCompat.startForegroundService(getContext(), intent);
        JSObject result = new JSObject();
        result.put("running", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ScaleForegroundService.class));
        JSObject result = new JSObject();
        result.put("running", false);
        call.resolve(result);
    }

    @PluginMethod
    public void unpair(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ScaleForegroundService.class));
        ScaleForegroundService.clearPrefs(getContext());
        JSObject result = new JSObject();
        result.put("running", false);
        call.resolve(result);
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", ScaleForegroundService.isRunning());
        call.resolve(result);
    }
}
