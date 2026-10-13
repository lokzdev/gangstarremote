import { useState, useEffect, useCallback } from 'react';
import { layoutAPI } from '@/services/api';

// Tipos para o layout
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
}

export interface ElementStyle {
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  borderRadius?: number;
  fontSize?: number;
}

export interface LayoutPreferences {
  // Layout grid para os painéis principais
  panels: {
    vnc: { x: number; y: number; width: number; height: number };
    v2: { x: number; y: number; width: number; height: number };
    controls: { x: number; y: number; width: number; height: number };
    navigation: { x: number; y: number; width: number; height: number };
  };
  // Estilos dos botões
  buttonStyles: {
    [key: string]: ElementStyle;
  };
  // Configurações gerais
  settings: {
    vncAspectRatio: number;
    v2AspectRatio: number;
    showV2: boolean;
    compactMode: boolean;
  };
}

// Layout padrão
const DEFAULT_LAYOUT: LayoutPreferences = {
  panels: {
    vnc: { x: 0, y: 0, width: 400, height: 700 },
    v2: { x: 410, y: 0, width: 400, height: 700 },
    controls: { x: 820, y: 0, width: 250, height: 400 },
    navigation: { x: 0, y: 0, width: 200, height: 500 },
  },
  buttonStyles: {},
  settings: {
    vncAspectRatio: 0.5,
    v2AspectRatio: 0.5,
    showV2: true,
    compactMode: false,
  },
};

export function useEditableLayout() {
  const [layout, setLayout] = useState<LayoutPreferences>(DEFAULT_LAYOUT);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Carregar layout salvo
  useEffect(() => {
    const loadLayout = async () => {
      try {
        const response = await layoutAPI.getLayout();
        if (response.layout) {
          setLayout({ ...DEFAULT_LAYOUT, ...response.layout });
        }
      } catch (error) {
        console.error('Erro ao carregar layout:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadLayout();
  }, []);

  // Salvar layout
  const saveLayout = useCallback(async () => {
    try {
      await layoutAPI.saveLayout(layout);
      setIsDirty(false);
      return true;
    } catch (error) {
      console.error('Erro ao salvar layout:', error);
      return false;
    }
  }, [layout]);

  // Resetar layout
  const resetLayout = useCallback(async () => {
    try {
      await layoutAPI.resetLayout();
      setLayout(DEFAULT_LAYOUT);
      setIsDirty(false);
      return true;
    } catch (error) {
      console.error('Erro ao resetar layout:', error);
      return false;
    }
  }, []);

  // Atualizar painel
  const updatePanel = useCallback((
    panelId: keyof LayoutPreferences['panels'],
    updates: Partial<LayoutPreferences['panels'][typeof panelId]>
  ) => {
    setLayout(prev => ({
      ...prev,
      panels: {
        ...prev.panels,
        [panelId]: { ...prev.panels[panelId], ...updates },
      },
    }));
    setIsDirty(true);
  }, []);

  // Atualizar estilo de botão
  const updateButtonStyle = useCallback((
    buttonId: string,
    style: Partial<ElementStyle>
  ) => {
    setLayout(prev => ({
      ...prev,
      buttonStyles: {
        ...prev.buttonStyles,
        [buttonId]: { ...prev.buttonStyles[buttonId], ...style },
      },
    }));
    setIsDirty(true);
  }, []);

  // Atualizar configurações
  const updateSettings = useCallback((
    updates: Partial<LayoutPreferences['settings']>
  ) => {
    setLayout(prev => ({
      ...prev,
      settings: { ...prev.settings, ...updates },
    }));
    setIsDirty(true);
  }, []);

  // Toggle modo edição
  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev);
  }, []);

  return {
    layout,
    isEditMode,
    isDirty,
    isLoading,
    setIsEditMode,
    toggleEditMode,
    saveLayout,
    resetLayout,
    updatePanel,
    updateButtonStyle,
    updateSettings,
    setLayout,
  };
}

export default useEditableLayout;

