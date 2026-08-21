package com.lifev1.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.core.content.ContextCompat;

public class ScaleBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())
            && !"android.intent.action.LOCKED_BOOT_COMPLETED".equals(intent.getAction())) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences("lifev1_scale_bg", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) return;
        if (prefs.getString("deviceId", null) == null) return;

        Intent service = new Intent(context, ScaleForegroundService.class);
        ContextCompat.startForegroundService(context, service);
    }
}
