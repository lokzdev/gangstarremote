import React, { useState, useRef, useEffect } from 'react';

interface ButtonStyle {
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
}

interface EditableButtonProps {
  id: string;
  children: React.ReactNode;
  onClick?: () => void;
  isEditMode: boolean;
  customStyle?: ButtonStyle;
  onStyleChange?: (style: ButtonStyle) => void;
  className?: string;
  disabled?: boolean;
  title?: string;
}

// Cores predefinidas
const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#64748b', '#1e293b', '#000000',
  '#ffffff', '#f1f5f9', '#cbd5e1', '#94a3b8', '#475569',
];

export const EditableButton: React.FC<EditableButtonProps> = ({
  id,
  children,
  onClick,
  isEditMode,
  customStyle = {},
  onStyleChange,
  className = '',
  disabled = false,
  title,
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editingProperty, setEditingProperty] = useState<'bg' | 'text' | 'border'>('bg');
  const pickerRef = useRef<HTMLDivElement>(null);

  // Fechar picker ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };

    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColorPicker]);

  const handleClick = (e: React.MouseEvent) => {
    if (isEditMode) {
      e.preventDefault();
      e.stopPropagation();
      setShowColorPicker(!showColorPicker);
      return;
    }
    if (onClick && !disabled) {
      onClick();
    }
  };

  const handleColorSelect = (color: string) => {
    if (onStyleChange) {
      const newStyle = { ...customStyle };
      switch (editingProperty) {
        case 'bg':
          newStyle.backgroundColor = color;
          break;
        case 'text':
          newStyle.textColor = color;
          break;
        case 'border':
          newStyle.borderColor = color;
          break;
      }
      onStyleChange(newStyle);
    }
  };

  const buttonStyle: React.CSSProperties = {
    backgroundColor: customStyle.backgroundColor,
    color: customStyle.textColor,
    borderColor: customStyle.borderColor,
    borderWidth: customStyle.borderColor ? '2px' : undefined,
    borderStyle: customStyle.borderColor ? 'solid' : undefined,
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        className={`${className} ${isEditMode ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-800' : ''}`}
        style={buttonStyle}
        disabled={disabled && !isEditMode}
        title={isEditMode ? `✏️ Clique para editar cores de: ${id}` : title}
      >
        {children}
        {isEditMode && (
          <span className="absolute -top-2 -right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs shadow-lg">
            ✏️
          </span>
        )}
      </button>

      {/* Color Picker Popup */}
      {showColorPicker && isEditMode && (
        <div 
          ref={pickerRef}
          className="absolute z-[9999] top-full left-1/2 transform -translate-x-1/2 mt-2 p-4 bg-gray-900 rounded-xl shadow-2xl border-2 border-blue-500"
          style={{ minWidth: '240px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-sm text-white mb-3 font-bold flex items-center gap-2">
            🎨 Editar: <span className="text-blue-400">{id}</span>
          </div>
          
          {/* Seletor de propriedade */}
          <div className="flex gap-1 mb-4">
            <button
              onClick={() => setEditingProperty('bg')}
              className={`flex-1 px-3 py-2 text-xs rounded-lg font-semibold transition-all ${
                editingProperty === 'bg' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              🎨 Fundo
            </button>
            <button
              onClick={() => setEditingProperty('text')}
              className={`flex-1 px-3 py-2 text-xs rounded-lg font-semibold transition-all ${
                editingProperty === 'text' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              ✏️ Texto
            </button>
            <button
              onClick={() => setEditingProperty('border')}
              className={`flex-1 px-3 py-2 text-xs rounded-lg font-semibold transition-all ${
                editingProperty === 'border' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              ⬜ Borda
            </button>
          </div>

          {/* Cor atual */}
          <div className="mb-3 text-xs text-gray-400">
            Cor atual: {' '}
            <span 
              className="inline-block w-4 h-4 rounded border border-white align-middle"
              style={{ 
                backgroundColor: editingProperty === 'bg' 
                  ? customStyle.backgroundColor 
                  : editingProperty === 'text' 
                    ? customStyle.textColor 
                    : customStyle.borderColor || 'transparent' 
              }}
            />
          </div>

          {/* Grid de cores */}
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleColorSelect(color)}
                className="w-8 h-8 rounded-lg border-2 border-gray-600 hover:border-white hover:scale-110 transition-all shadow-md"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>

          {/* Botão fechar */}
          <button
            onClick={() => setShowColorPicker(false)}
            className="w-full mt-4 px-3 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition-all"
          >
            ✓ Fechar
          </button>
        </div>
      )}
    </div>
  );
};

export default EditableButton;
