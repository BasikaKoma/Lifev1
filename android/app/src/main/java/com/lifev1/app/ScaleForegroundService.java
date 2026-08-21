package com.lifev1.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Date;
import java.util.Locale;
import java.util.Queue;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONObject;

public class ScaleForegroundService extends Service {
    public static final String EXTRA_DEVICE_ID = "deviceId";
    public static final String EXTRA_DEVICE_NAME = "deviceName";
    public static final String EXTRA_INGEST_TOKEN = "ingestToken";
    public static final String EXTRA_INGEST_URL = "ingestUrl";
    public static final String EXTRA_API_KEY = "apiKey";

    private static final String PREFS = "lifev1_scale_bg";
    private static final String CHANNEL_ID = "lifev1_scale_sync";
    private static final int NOTIFICATION_ID = 4217;
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final UUID SVC_FFE0 = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb");
    private static final UUID CHAR_FFE1 = UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb");
    private static final UUID CHAR_FFE2 = UUID.fromString("0000ffe2-0000-1000-8000-00805f9b34fb");
    private static final UUID CHAR_FFE3 = UUID.fromString("0000ffe3-0000-1000-8000-00805f9b34fb");
    private static final UUID SVC_FFF0 = UUID.fromString("0000fff0-0000-1000-8000-00805f9b34fb");
    private static final UUID CHAR_FFF1 = UUID.fromString("0000fff1-0000-1000-8000-00805f9b34fb");
    private static final UUID CHAR_FFF2 = UUID.fromString("0000fff2-0000-1000-8000-00805f9b34fb");

    private static volatile boolean running = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Queue<Runnable> gattQueue = new ArrayDeque<>();
    private boolean gattBusy = false;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private String deviceId;
    private String deviceName;
    private String ingestToken;
    private String ingestUrl;
    private String apiKey;
    private boolean scanning = false;
    private Double lastWeight = null;
    private long lastSavedAt = 0L;

    public static boolean isRunning() {
        return running;
    }

    public static void clearPrefs(Context context) {
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().clear().apply();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        createChannel();
        startForegroundInternal("Σε αναμονή μέτρησης");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (intent != null) {
            deviceId = intent.getStringExtra(EXTRA_DEVICE_ID);
            deviceName = intent.getStringExtra(EXTRA_DEVICE_NAME);
            ingestToken = intent.getStringExtra(EXTRA_INGEST_TOKEN);
            ingestUrl = intent.getStringExtra(EXTRA_INGEST_URL);
            apiKey = intent.getStringExtra(EXTRA_API_KEY);
            prefs.edit()
                .putBoolean("enabled", true)
                .putString("deviceId", deviceId)
                .putString("deviceName", deviceName)
                .putString("ingestToken", ingestToken)
                .putString("ingestUrl", ingestUrl)
                .putString("apiKey", apiKey)
                .apply();
        } else {
            deviceId = prefs.getString("deviceId", null);
            deviceName = prefs.getString("deviceName", "QN-Scale");
            ingestToken = prefs.getString("ingestToken", null);
            ingestUrl = prefs.getString("ingestUrl", null);
            apiKey = prefs.getString("apiKey", "");
        }

        if (deviceId == null || ingestToken == null || ingestUrl == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        startScan();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        stopScan();
        closeGatt();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startForegroundInternal(String text) {
        Notification notification = buildNotification(text);
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            );
        } else if (Build.VERSION.SDK_INT >= 29) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification(String text) {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pending = PendingIntent.getActivity(
            this,
            0,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("lifev1 · Ζυγαριά")
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(text));
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Scale sync",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Κρατά τη ζυγαριά σε αναμονή στο παρασκήνιο");
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getSystemService(BLUETOOTH_SERVICE);
        return manager != null ? manager.getAdapter() : null;
    }

    private void startScan() {
        BluetoothAdapter adapter = adapter();
        if (adapter == null || !adapter.isEnabled()) {
            handler.postDelayed(this::startScan, 15000);
            return;
        }
        if (scanning) return;
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) return;

        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build();
        ScanFilter.Builder filter = new ScanFilter.Builder();
        if (BluetoothAdapter.checkBluetoothAddress(deviceId)) {
            filter.setDeviceAddress(deviceId);
        } else {
            filter.setDeviceName("QN-Scale");
        }

        scanning = true;
        updateNotification("Αναζήτηση ζυγαριάς…");
        try {
            scanner.startScan(Collections.singletonList(filter.build()), settings, scanCallback);
        } catch (SecurityException e) {
            scanning = false;
        }
        handler.postDelayed(this::restartScan, 25000);
    }

    private void stopScan() {
        handler.removeCallbacks(this::restartScan);
        if (!scanning || scanner == null) return;
        try {
            scanner.stopScan(scanCallback);
        } catch (Exception ignored) {
        }
        scanning = false;
    }

    private void restartScan() {
        stopScan();
        if (gatt == null) startScan();
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            if (device == null) return;
            stopScan();
            connect(device);
        }
    };

    private void connect(BluetoothDevice device) {
        updateNotification("Σύνδεση…");
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                gatt = device.connectGatt(this, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            } else {
                gatt = device.connectGatt(this, false, gattCallback);
            }
        } catch (SecurityException e) {
            handler.postDelayed(this::startScan, 4000);
        }
    }

    private void closeGatt() {
        if (gatt == null) return;
        try {
            gatt.disconnect();
            gatt.close();
        } catch (Exception ignored) {
        }
        gatt = null;
        gattBusy = false;
        gattQueue.clear();
    }

    private void enqueueGatt(Runnable task) {
        gattQueue.add(task);
        pumpGatt();
    }

    private void pumpGatt() {
        if (gattBusy) return;
        Runnable next = gattQueue.poll();
        if (next == null) return;
        gattBusy = true;
        next.run();
    }

    private void completeGatt() {
        gattBusy = false;
        pumpGatt();
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                updateNotification("Συνδεδεμένη · περιμένει μέτρηση");
                handler.post(() -> {
                    try {
                        gatt.discoverServices();
                    } catch (SecurityException ignored) {
                    }
                });
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                closeGatt();
                updateNotification("Σε αναμονή μέτρησης");
                handler.postDelayed(ScaleForegroundService.this::startScan, 1500);
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            BluetoothGattService ffe0 = gatt.getService(SVC_FFE0);
            BluetoothGattService fff0 = gatt.getService(SVC_FFF0);
            if (ffe0 != null) {
                enableChar(gatt, ffe0.getCharacteristic(CHAR_FFE1), false);
                enableChar(gatt, ffe0.getCharacteristic(CHAR_FFE2), true);
                enqueueGatt(() -> writeStart(gatt, ffe0.getCharacteristic(CHAR_FFE3)));
            } else if (fff0 != null) {
                enableChar(gatt, fff0.getCharacteristic(CHAR_FFF1), false);
                enqueueGatt(() -> writeStart(gatt, fff0.getCharacteristic(CHAR_FFF2)));
            } else {
                closeGatt();
                handler.postDelayed(ScaleForegroundService.this::startScan, 3000);
            }
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
            completeGatt();
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            completeGatt();
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            parseAndMaybeSave(characteristic.getValue());
        }

        @Override
        public void onCharacteristicChanged(
            BluetoothGatt gatt,
            BluetoothGattCharacteristic characteristic,
            byte[] value
        ) {
            parseAndMaybeSave(value);
        }
    };

    private void enableChar(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, boolean indicate) {
        if (characteristic == null) return;
        enqueueGatt(() -> {
            try {
                gatt.setCharacteristicNotification(characteristic, true);
                BluetoothGattDescriptor descriptor = characteristic.getDescriptor(CCCD);
                if (descriptor == null) {
                    completeGatt();
                    return;
                }
                descriptor.setValue(
                    indicate
                        ? BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                        : BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                );
                gatt.writeDescriptor(descriptor);
            } catch (SecurityException e) {
                completeGatt();
            }
        });
    }

    private void writeStart(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
        if (characteristic == null) {
            completeGatt();
            return;
        }
        byte[] packet = new byte[] { 0x13, 0x09, 0x15, 0x01, 0x10, 0x00, 0x00, 0x00, 0x00 };
        int sum = 0;
        for (int i = 0; i < packet.length - 1; i += 1) sum += packet[i] & 0xff;
        packet[packet.length - 1] = (byte) (sum & 0xff);
        try {
            characteristic.setValue(packet);
            characteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
            gatt.writeCharacteristic(characteristic);
        } catch (SecurityException e) {
            completeGatt();
        }
        handler.postDelayed(this::completeGatt, 400);
    }

    private void parseAndMaybeSave(byte[] value) {
        if (value == null || value.length < 6 || value[0] != 0x10) return;
        double weightKg = (((value[3] & 0xff) << 8) | (value[4] & 0xff)) / 100.0;
        if (weightKg < 5 || weightKg > 300) return;
        boolean stable = value.length > 5 && value[5] == 0x01;
        Integer impedance = null;
        if (value.length >= 8) {
            int impRaw = (value[6] & 0xff) | ((value[7] & 0xff) << 8);
            if (impRaw > 0 && impRaw < 5000) impedance = impRaw;
        }
        if (!stable) {
            updateNotification(String.format(Locale.US, "Μέτρηση %.1f kg…", weightKg));
            return;
        }
        long now = System.currentTimeMillis();
        if (lastWeight != null && Math.abs(lastWeight - weightKg) < 0.01 && now - lastSavedAt < 30_000) {
            return;
        }
        lastWeight = weightKg;
        lastSavedAt = now;
        updateNotification(String.format(Locale.US, "Αποθηκεύτηκε %.1f kg", weightKg));
        postWeight(weightKg, impedance);
    }

    private void postWeight(double weightKg, Integer impedance) {
        JSObject event = new JSObject();
        event.put("weightKg", weightKg);
        event.put("stable", true);
        if (impedance != null) event.put("impedance", impedance);
        event.put("deviceId", deviceId);
        event.put("deviceName", deviceName);
        ScaleBackgroundPlugin.emitMeasurement(event);

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                iso.setTimeZone(TimeZone.getTimeZone("UTC"));
                SimpleDateFormat dayFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                JSONObject body = new JSONObject();
                body.put("token", ingestToken);
                body.put("weightKg", weightKg);
                body.put("day", dayFormat.format(new Date()));
                body.put("recordedAt", iso.format(new Date()));
                body.put("deviceId", deviceId);
                body.put("deviceName", deviceName);
                body.put("stable", true);
                if (impedance != null) body.put("impedance", impedance);

                URL url = new URL(ingestUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                connection.setRequestProperty("Content-Type", "application/json");
                if (apiKey != null && !apiKey.isEmpty()) {
                    connection.setRequestProperty("apikey", apiKey);
                    connection.setRequestProperty("Authorization", "Bearer " + apiKey);
                }
                byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = connection.getOutputStream()) {
                    os.write(payload);
                }
                connection.getResponseCode();
            } catch (Exception ignored) {
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "scale-ingest").start();
    }
}
