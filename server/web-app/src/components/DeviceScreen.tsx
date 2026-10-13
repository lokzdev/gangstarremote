import { useEffect, useRef, useState, useCallback } from 'react';
import { getApiBaseUrl } from '@/services/api';
import type { ScreenDimensions } from '@/types';

interface DeviceScreenProps {
  deviceId: string;
  onCommand: (command: any) => void;
  isBlackScreenActive: boolean;
  onConnectionStatusChange?: (status: 'online' | 'offline' | 'stale') => void;
  /** Método/engine de captura atual para exibir badge discreto no viewer */
  captureMethod?: 'standard' | 'silent';
  killerFrameOnPointerMove?: boolean;
  onRequestFrame?: () => void;
}

const DEFAULT_DIMENSIONS: ScreenDimensions = { width: 360, height: 780, scale: 1 };

function detectFrameMime(buffer: ArrayBuffer): string {
  const b = new Uint8Array(buffer, 0, 4);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.length >= 4 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
  return 'image/jpeg';
}

export default function DeviceScreen({ deviceId, onCommand, isBlackScreenActive, onConnectionStatusChange, captureMethod = 'standard', killerFrameOnPointerMove = false, onRequestFrame }: DeviceScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneFrameRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<ScreenDimensions>(DEFAULT_DIMENSIONS);
  const dimensionsRef = useRef<ScreenDimensions>(DEFAULT_DIMENSIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [isDeviceOffline, setIsDeviceOffline] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const staleCheckRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  // Hot-path refs — no React re-render per frame
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);
  const isDeviceOfflineRef = useRef(false);
  const hasReceivedFrameRef = useRef(false);
  const frameSizeRef = useRef<{ w: number; h: number } | null>(null);
  const renderTokenRef = useRef(0);
  const captureMethodRef = useRef(captureMethod);
  const pendingFrameRef = useRef<ArrayBuffer | null>(null);
  const rafRef = useRef<number | null>(null);
  const fpsCalcWindowRef = useRef({ count: 0, start: Date.now() });
  const lastKillerFrameReqRef = useRef(0);
  const lastFrameDeltaRef = useRef<number | null>(null);
  const fpsLabelRef = useRef<HTMLSpanElement>(null);

  // Estados para gestos
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);

  useEffect(() => {
    captureMethodRef.current = captureMethod;
  }, [captureMethod]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const win = fpsCalcWindowRef.current;
      const elapsed = Date.now() - win.start;
      const fps = elapsed > 0 ? (win.count * 1000) / elapsed : 0;
      win.count = 0;
      win.start = Date.now();
      const lat = lastFrameDeltaRef.current;
      if (fpsLabelRef.current) {
        fpsLabelRef.current.textContent =
          lat != null ? `${fps.toFixed(0)} FPS · ${lat}ms` : `${fps.toFixed(0)} FPS`;
      }
    }, 500);
    return () => window.clearInterval(intervalId);
  }, []);

  const getCanvasContext = useCallback((canvas: HTMLCanvasElement) => {
    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
    }
    return ctxRef.current;
  }, []);

  const updateLayoutIfNeeded = useCallback((imgW: number, imgH: number) => {
    const prev = frameSizeRef.current;
    if (prev && prev.w === imgW && prev.h === imgH) {
      return;
    }
    frameSizeRef.current = { w: imgW, h: imgH };

    const containerWidth = containerRef.current?.clientWidth || 360;
    const aspectRatio = imgH / imgW;
    const maxAvailableHeight = window.innerHeight - 200;
    const maxWidth = 360;

    let width = Math.min(containerWidth, maxWidth);
    let height = width * aspectRatio;

    if (height > maxAvailableHeight) {
      height = maxAvailableHeight;
      width = height / aspectRatio;
    }

    const next: ScreenDimensions = { width, height, scale: width / imgW };
    dimensionsRef.current = next;
    setDimensions(next);

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    if (phoneFrameRef.current) {
      phoneFrameRef.current.style.width = `${width + 24}px`;
      phoneFrameRef.current.style.height = `${height + 24}px`;
    }
  }, []);

  const drawFrame = useCallback((buffer: ArrayBuffer) => {
    pendingFrameRef.current = buffer;

    if (rafRef.current) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const frame = pendingFrameRef.current;
      if (!frame) return;
      pendingFrameRef.current = null;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = getCanvasContext(canvas);
      if (!ctx) return;

      const mimeType = detectFrameMime(frame);
      const blob = new Blob([frame], { type: mimeType });
      const token = ++renderTokenRef.current;

      createImageBitmap(blob)
        .then((bitmap) => {
          if (token !== renderTokenRef.current) {
            bitmap.close();
            return;
          }

          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            updateLayoutIfNeeded(bitmap.width, bitmap.height);
          }

          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();

          const now = Date.now();
          if (lastFrameTsRef.current != null) {
            lastFrameDeltaRef.current = now - lastFrameTsRef.current;
          }
          fpsCalcWindowRef.current.count += 1;
          lastFrameTsRef.current = now;

          if (!hasReceivedFrameRef.current) {
            hasReceivedFrameRef.current = true;
            setIsLoading(false);
          }

          if (isDeviceOfflineRef.current) {
            isDeviceOfflineRef.current = false;
            setIsDeviceOffline(false);
            onConnectionStatusChange?.('online');
          }
        })
        .catch(() => {
          // Frame corrupto ou decode falhou — descarta silenciosamente
        });
    });
  }, [getCanvasContext, updateLayoutIfNeeded, onConnectionStatusChange]);

  // Transmissão via WebSocket
  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;

    const wsProtocol = getApiBaseUrl().startsWith('https') ? 'wss' : 'ws';
    const wsBase = getApiBaseUrl().replace(/^https?/, wsProtocol);

    const connect = () => {
      if (cancelled) return;
      const token = localStorage.getItem('token');
      if (!token) {
        setStreamStatus('offline');
        return;
      }

      setStreamStatus('connecting');
      const ws = new WebSocket(`${wsBase}/ws/dashboard/${deviceId}?token=${token}`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        reconnectAttemptsRef.current = 0;
        setStreamStatus('online');
        isDeviceOfflineRef.current = false;
        setIsDeviceOffline(false);
        onConnectionStatusChange?.('online');
      };

      ws.onmessage = (event) => {
        if (cancelled) return;

        if (event.data instanceof ArrayBuffer && event.data.byteLength === 0) {
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          drawFrame(event.data);
        } else if (event.data instanceof Blob) {
          event.data.arrayBuffer().then((buf) => {
            if (buf.byteLength > 0) drawFrame(buf);
          });
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = (event) => {
        if (cancelled) return;
        setStreamStatus('offline');
        onConnectionStatusChange?.('offline');
        const attempt = reconnectAttemptsRef.current;
        reconnectAttemptsRef.current = attempt + 1;
        const baseDelay = event.code === 1000 ? 2000 : 1000;
        const delay = Math.min(baseDelay * Math.pow(2, Math.min(attempt, 4)), 15000);
        reconnectRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      renderTokenRef.current++;
      ctxRef.current = null;
      reconnectAttemptsRef.current = 0;
    };
  }, [deviceId, drawFrame, onConnectionStatusChange]);

  useEffect(() => {
    const checkStale = () => {
      if (
        lastFrameTsRef.current &&
        streamStatus === 'online' &&
        Date.now() - lastFrameTsRef.current > 60000
      ) {
        if (!isDeviceOfflineRef.current) {
          isDeviceOfflineRef.current = true;
          setIsDeviceOffline(true);
          onConnectionStatusChange?.('stale');
        }
      }
    };

    staleCheckRef.current = window.setInterval(checkStale, 10000);

    return () => {
      if (staleCheckRef.current) {
        window.clearInterval(staleCheckRef.current);
      }
    };
  }, [onConnectionStatusChange, streamStatus]);

  const getDeviceCoordinates = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scale = dimensionsRef.current.scale;
    const x = Math.round((clientX - rect.left) / scale);
    const y = Math.round((clientY - rect.top) / scale);

    return { x, y };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = getDeviceCoordinates(e.clientX, e.clientY);
    setTouchStart({ ...coords, time: Date.now() });

    const timer = window.setTimeout(() => {
      onCommand({
        action: 'LONG_PRESS',
        x: coords.x,
        y: coords.y,
        duration: 500,
      });
      setLongPressTimer(null);
    }, 500);

    setLongPressTimer(timer);
  }, [getDeviceCoordinates, onCommand]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!touchStart) return;

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }

    const coords = getDeviceCoordinates(e.clientX, e.clientY);
    const deltaX = coords.x - touchStart.x;
    const deltaY = coords.y - touchStart.y;
    const deltaTime = Date.now() - touchStart.time;
    const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);

    if (distance < 10 && deltaTime < 300) {
      onCommand({
        action: 'CLICK',
        x: coords.x,
        y: coords.y,
      });
    } else if (distance > 20) {
      onCommand({
        action: 'SWIPE',
        x1: touchStart.x,
        y1: touchStart.y,
        x2: coords.x,
        y2: coords.y,
        duration: deltaTime,
      });
    }

    setTouchStart(null);
  }, [touchStart, longPressTimer, getDeviceCoordinates, onCommand]);

  const handlePointerMove = useCallback((_e: React.PointerEvent<HTMLCanvasElement>) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }

    if (killerFrameOnPointerMove && onRequestFrame) {
      const now = Date.now();
      if (now - lastKillerFrameReqRef.current >= 400) {
        lastKillerFrameReqRef.current = now;
        onRequestFrame();
      }
    }
  }, [touchStart, longPressTimer, killerFrameOnPointerMove, onRequestFrame]);

  return (
    <div ref={containerRef} className="relative flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl p-4 shadow-2xl">
      <div
        ref={phoneFrameRef}
        className="relative bg-black rounded-[2.5rem] p-3 shadow-2xl"
        style={{ width: dimensions.width + 24, height: dimensions.height + 24 }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-10"></div>

        <div className="relative w-full h-full bg-gray-900 rounded-[2rem] overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <div className="text-white text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                <p>Carregando tela...</p>
              </div>
            </div>
          )}

          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-pointer touch-none"
            style={{
              width: dimensions.width,
              height: dimensions.height,
              imageRendering: 'crisp-edges',
            }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerMove={handlePointerMove}
            onContextMenu={(e) => e.preventDefault()}
          />

          {isBlackScreenActive && (
            <div
              className="absolute inset-0 bg-black/25 pointer-events-none z-10 transition-opacity duration-300"
              aria-hidden="true"
            />
          )}

          {isBlackScreenActive && (
            <div className="absolute top-2 left-2 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse z-30">
              🔴 TELA PRETA ATIVA
            </div>
          )}

          {!isLoading && (
            <>
              <span
                ref={fpsLabelRef}
                className="absolute top-8 right-2 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold z-30 bg-black/60 text-emerald-300 border border-emerald-500/40"
              >
                — FPS
              </span>
              <div
                className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold z-30 shadow ${
                  captureMethod === 'silent'
                    ? 'bg-indigo-600/90 text-white border border-indigo-400/50'
                    : 'bg-purple-600/90 text-white border border-purple-400/50'
                }`}
                title={captureMethod === 'silent' ? 'Captura silenciosa (takeScreenshot)' : 'Captura HVNC'}
              >
                {captureMethod === 'silent' ? 'Silencioso' : 'HVNC'}
              </div>
            </>
          )}

          {streamStatus !== 'online' && (
            <div className="absolute bottom-4 left-4 bg-black/70 text-white text-xs px-3 py-1 rounded-full">
              {streamStatus === 'connecting' ? '🔄 Conectando...' : '🔄 Reconectando...'}
            </div>
          )}

          {isDeviceOffline && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
              <div className="text-center text-white p-6 max-w-sm">
                <div className="text-6xl mb-4">📴</div>
                <h3 className="text-xl font-bold mb-2">Dispositivo Sem Resposta</h3>
                <p className="text-gray-300 text-sm mb-4">
                  Não recebemos dados do dispositivo há mais de 1 minuto.
                </p>
                <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 text-yellow-300 text-sm">
                  <p>⏳ Aguardando reconexão...</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-1 bg-gray-700 rounded-full"></div>
      </div>
    </div>
  );
}
