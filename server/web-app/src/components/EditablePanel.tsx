import React, { useState, useRef, useEffect, ReactNode } from 'react';

interface EditablePanelProps {
  id: string;
  children: ReactNode;
  isEditMode: boolean;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  onSizeChange: (width: number, height: number) => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export const EditablePanel: React.FC<EditablePanelProps> = ({
  id,
  children,
  isEditMode,
  width,
  height,
  minWidth = 200,
  minHeight = 200,
  maxWidth = 1200,
  maxHeight = 1200,
  onSizeChange,
  className = '',
  style = {},
  title,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const startPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    setResizeDirection(direction);
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      width: width,
      height: height,
    };
  };

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing || !resizeDirection) return;

      const deltaX = e.clientX - startPos.current.x;
      const deltaY = e.clientY - startPos.current.y;

      let newWidth = startPos.current.width;
      let newHeight = startPos.current.height;

      if (resizeDirection.includes('e')) {
        newWidth = Math.min(maxWidth, Math.max(minWidth, startPos.current.width + deltaX));
      }
      if (resizeDirection.includes('w')) {
        newWidth = Math.min(maxWidth, Math.max(minWidth, startPos.current.width - deltaX));
      }
      if (resizeDirection.includes('s')) {
        newHeight = Math.min(maxHeight, Math.max(minHeight, startPos.current.height + deltaY));
      }
      if (resizeDirection.includes('n')) {
        newHeight = Math.min(maxHeight, Math.max(minHeight, startPos.current.height - deltaY));
      }

      onSizeChange(newWidth, newHeight);
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
      setResizeDirection(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isResizing, resizeDirection, minWidth, minHeight, maxWidth, maxHeight, onSizeChange]);

  // Estilos dos handles de resize
  const resizeHandleStyle = (position: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      backgroundColor: 'rgba(59, 130, 246, 0.7)',
      zIndex: 100,
      display: isEditMode ? 'block' : 'none',
    };

    switch (position) {
      case 'e':
        return { ...base, right: -4, top: 0, width: 8, height: '100%', cursor: 'ew-resize' };
      case 'w':
        return { ...base, left: -4, top: 0, width: 8, height: '100%', cursor: 'ew-resize' };
      case 's':
        return { ...base, bottom: -4, left: 0, width: '100%', height: 8, cursor: 'ns-resize' };
      case 'n':
        return { ...base, top: -4, left: 0, width: '100%', height: 8, cursor: 'ns-resize' };
      case 'se':
        return { ...base, right: -6, bottom: -6, width: 16, height: 16, cursor: 'nwse-resize', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 1)' };
      case 'sw':
        return { ...base, left: -6, bottom: -6, width: 16, height: 16, cursor: 'nesw-resize', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 1)' };
      case 'ne':
        return { ...base, right: -6, top: -6, width: 16, height: 16, cursor: 'nesw-resize', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 1)' };
      case 'nw':
        return { ...base, left: -6, top: -6, width: 16, height: 16, cursor: 'nwse-resize', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 1)' };
      default:
        return base;
    }
  };

  return (
    <div
      ref={panelRef}
      data-panel-id={id}
      className={`relative ${className}`}
      style={{
        width: width,
        height: height,
        ...style,
        outline: isEditMode ? '3px dashed #3b82f6' : 'none',
        outlineOffset: '2px',
        transition: isResizing ? 'none' : 'outline 0.2s',
      }}
    >
      {/* Título do painel em modo edição */}
      {isEditMode && title && (
        <div className="absolute -top-7 left-0 text-xs text-blue-400 font-bold bg-gray-900 px-2 py-1 rounded z-50 whitespace-nowrap">
          📐 {title} ({Math.round(width)}x{Math.round(height)})
        </div>
      )}

      {/* Conteúdo */}
      <div className="w-full h-full overflow-hidden">
        {children}
      </div>

      {/* Handles de resize - só aparecem em modo edição */}
      {isEditMode && (
        <>
          <div style={resizeHandleStyle('e')} onMouseDown={(e) => handleResizeStart(e, 'e')} title="Arrastar para redimensionar largura" />
          <div style={resizeHandleStyle('w')} onMouseDown={(e) => handleResizeStart(e, 'w')} title="Arrastar para redimensionar largura" />
          <div style={resizeHandleStyle('s')} onMouseDown={(e) => handleResizeStart(e, 's')} title="Arrastar para redimensionar altura" />
          <div style={resizeHandleStyle('n')} onMouseDown={(e) => handleResizeStart(e, 'n')} title="Arrastar para redimensionar altura" />
          <div style={resizeHandleStyle('se')} onMouseDown={(e) => handleResizeStart(e, 'se')} title="Arrastar canto para redimensionar" />
          <div style={resizeHandleStyle('sw')} onMouseDown={(e) => handleResizeStart(e, 'sw')} title="Arrastar canto para redimensionar" />
          <div style={resizeHandleStyle('ne')} onMouseDown={(e) => handleResizeStart(e, 'ne')} title="Arrastar canto para redimensionar" />
          <div style={resizeHandleStyle('nw')} onMouseDown={(e) => handleResizeStart(e, 'nw')} title="Arrastar canto para redimensionar" />
        </>
      )}
    </div>
  );
};

export default EditablePanel;
