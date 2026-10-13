package com.seguranca.protecao;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.view.accessibility.AccessibilityManager;
import java.util.List;

/**
 * Gerenciador de permissões
 * 
 * Centraliza toda a lógica de verificação e solicitação de permissões
 * necessárias para o funcionamento do aplicativo
 */
public class PermissionManager {
    
    private Context context;
    
    public PermissionManager(Context context) {
        this.context = context;
    }
    
    /**
     * Verifica se o serviço de acessibilidade está habilitado
     * @return true se está habilitado, false caso contrário
     */
    public boolean isAccessibilityServiceEnabled() {
        AccessibilityManager am = (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (am == null) return false;
        
        List<AccessibilityServiceInfo> enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        String ourServiceName = AppComponents.accessibilityComponent(context);
        
        for (AccessibilityServiceInfo service : enabledServices) {
            String serviceId = service.getId();
            if (serviceId != null && (ourServiceName.equals(serviceId)
                    || serviceId.contains(AppComponents.ACCESSIBILITY_SERVICE_SIMPLE_NAME))) {
                return true;
            }
        }
        
        // Método alternativo de verificação
        int accessibilityEnabled = 0;
        try {
            accessibilityEnabled = Settings.Secure.getInt(
                context.getContentResolver(),
                Settings.Secure.ACCESSIBILITY_ENABLED
            );
        } catch (Settings.SettingNotFoundException e) {
            return false;
        }

        if (accessibilityEnabled == 1) {
            String services = Settings.Secure.getString(
                context.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            );
            
            if (services != null) {
                return services.toLowerCase().contains(context.getPackageName().toLowerCase());
            }
        }
        
        return false;
    }
    
    /**
     * Verifica se tem permissão para desenhar sobre outras apps
     * @return true se tem permissão, false caso contrário
     */
    public boolean hasOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return Settings.canDrawOverlays(context);
        }
        return true; // Versões antigas não precisam desta permissão
    }
    
    /**
     * Solicita permissão para desenhar sobre outras apps
     */
    public void requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !hasOverlayPermission()) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        }
    }
    
    /**
     * Verifica se o app está ignorando otimizações de bateria
     * @return true se está ignorando, false caso contrário
     */
    public boolean isIgnoringBatteryOptimizations() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            String packageName = context.getPackageName();
            android.os.PowerManager pm = (android.os.PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                return pm.isIgnoringBatteryOptimizations(packageName);
            }
        }
        return true;
    }
    
    /**
     * Solicita para ignorar otimizações de bateria
     */
    public void requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !isIgnoringBatteryOptimizations()) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
    
    /**
     * Verifica se todas as permissões críticas estão concedidas
     * @return true se todas estão concedidas, false caso contrário
     */
    public boolean hasAllCriticalPermissions() {
        return isAccessibilityServiceEnabled() && 
               hasOverlayPermission() && 
               isIgnoringBatteryOptimizations();
    }
    
    /**
     * Abre as configurações de acessibilidade
     */
    public void openAccessibilitySettings() {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }
}
