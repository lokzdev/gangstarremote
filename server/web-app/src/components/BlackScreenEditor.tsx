import React, { useState, useRef, useEffect } from 'react';
import { X, Save, Trash2, Type, Image, Square, Circle } from 'lucide-react';

// Dimensões base do Android (proporção 9:19.5 - equivalente a tela 1080x2400)
const ANDROID_WIDTH = 360;
const ANDROID_HEIGHT = 780;

// Dimensões do preview no editor (escala visual)
const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = 650;

interface ScreenElement {
  id: string;
  type: 'text' | 'image' | 'rectangle' | 'circle' | 'logo';
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  borderRadius?: number;
  opacity?: number;
  imageUrl?: string;
}

interface BlackScreenTemplate {
  id: string;
  name: string;
  backgroundColor: string;
  elements: ScreenElement[];
  createdAt: string;
}

interface BlackScreenEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: BlackScreenTemplate) => void;
  onApply: (template: BlackScreenTemplate) => void;
  initialTemplate?: BlackScreenTemplate;
}

const BlackScreenEditor: React.FC<BlackScreenEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  onApply,
  initialTemplate
}) => {
  const [templateName, setTemplateName] = useState(initialTemplate?.name || 'Minha Tela Preta');
  const [backgroundColor, setBackgroundColor] = useState(initialTemplate?.backgroundColor || '#000000');
  const [elements, setElements] = useState<ScreenElement[]>(initialTemplate?.elements || []);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [savedTemplates, setSavedTemplates] = useState<BlackScreenTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  
  const previewRef = useRef<HTMLDivElement>(null);

  // Carregar templates salvos
  useEffect(() => {
    const saved = localStorage.getItem('blackScreenTemplates');
    if (saved) {
      setSavedTemplates(JSON.parse(saved));
    }
  }, []);

  // Template padrão de exemplo
  useEffect(() => {
    if (!initialTemplate && elements.length === 0) {
      setElements([
        {
          id: 'default-text-1',
          type: 'text',
          x: 80,
          y: 300,
          width: 200,
          height: 40,
          content: 'Verificando segurança...',
          fontSize: 18,
          fontWeight: 'bold',
          color: '#FFFFFF',
          opacity: 100
        },
        {
          id: 'default-text-2',
          type: 'text',
          x: 90,
          y: 350,
          width: 180,
          height: 30,
          content: 'Aguarde alguns instantes',
          fontSize: 14,
          fontWeight: 'normal',
          color: '#AAAAAA',
          opacity: 100
        }
      ]);
    }
  }, []);

  const generateId = () => `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addElement = (type: ScreenElement['type']) => {
    const newElement: ScreenElement = {
      id: generateId(),
      type,
      x: 50,
      y: 200,
      width: type === 'text' ? 200 : 100,
      height: type === 'text' ? 40 : 100,
      content: type === 'text' ? 'Novo texto' : '',
      fontSize: 16,
      fontWeight: 'normal',
      color: '#FFFFFF',
      backgroundColor: type === 'rectangle' || type === 'circle' ? '#333333' : 'transparent',
      borderRadius: type === 'circle' ? 50 : 0,
      opacity: 100
    };
    setElements([...elements, newElement]);
    setSelectedElement(newElement.id);
  };

  const updateElement = (id: string, updates: Partial<ScreenElement>) => {
    setElements(elements.map(el => {
      if (el.id === id) {
        let updated = { ...el, ...updates };
        // Clampar posição e tamanho
        updated.x = Math.max(0, Math.min(ANDROID_WIDTH - updated.width, updated.x));
        updated.y = Math.max(0, Math.min(ANDROID_HEIGHT - updated.height, updated.y));
        return updated;
      }
      return el;
    }));
  };

  const deleteElement = (id: string) => {
    setElements(elements.filter(el => el.id !== id));
    if (selectedElement === id) setSelectedElement(null);
  };

  const handleMouseDown = (e: React.MouseEvent, elementId: string) => {
    e.stopPropagation();
    const element = elements.find(el => el.id === elementId);
    if (!element || !previewRef.current) return;

    const rect = previewRef.current.getBoundingClientRect();
    const scaleX = ANDROID_WIDTH / rect.width;
    const scaleY = ANDROID_HEIGHT / rect.height;
    
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    setSelectedElement(elementId);
    setIsDragging(true);
    setDragOffset({
      x: mouseX - element.x,
      y: mouseY - element.y
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedElement || !previewRef.current) return;

    const rect = previewRef.current.getBoundingClientRect();
    const scaleX = ANDROID_WIDTH / rect.width;
    const scaleY = ANDROID_HEIGHT / rect.height;
    
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const element = elements.find(el => el.id === selectedElement);
    if (!element) return;

    let newX = mouseX - dragOffset.x;
    let newY = mouseY - dragOffset.y;

    // Clampar dentro dos limites
    newX = Math.max(0, Math.min(ANDROID_WIDTH - element.width, newX));
    newY = Math.max(0, Math.min(ANDROID_HEIGHT - element.height, newY));

    updateElement(selectedElement, { x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, elementId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      updateElement(elementId, { imageUrl: event.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const saveTemplate = () => {
    const template: BlackScreenTemplate = {
      id: initialTemplate?.id || generateId(),
      name: templateName,
      backgroundColor,
      elements,
      createdAt: new Date().toISOString()
    };

    const existingIndex = savedTemplates.findIndex(t => t.id === template.id);
    let updated: BlackScreenTemplate[];
    
    if (existingIndex >= 0) {
      updated = [...savedTemplates];
      updated[existingIndex] = template;
    } else {
      updated = [...savedTemplates, template];
    }

    setSavedTemplates(updated);
    localStorage.setItem('blackScreenTemplates', JSON.stringify(updated));
    onSave(template);
    alert('✅ Template salvo com sucesso!');
  };

  const loadTemplate = (template: BlackScreenTemplate) => {
    setTemplateName(template.name);
    setBackgroundColor(template.backgroundColor);
    setElements(template.elements);
    setShowTemplates(false);
  };

  const deleteTemplate = (id: string) => {
    const updated = savedTemplates.filter(t => t.id !== id);
    setSavedTemplates(updated);
    localStorage.setItem('blackScreenTemplates', JSON.stringify(updated));
  };

  const applyTemplate = () => {
    const template: BlackScreenTemplate = {
      id: initialTemplate?.id || generateId(),
      name: templateName,
      backgroundColor,
      elements,
      createdAt: new Date().toISOString()
    };
    onApply(template);
  };

  const selectedEl = elements.find(el => el.id === selectedElement);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-800 p-4 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">🎨 Editor de Tela Preta</h2>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="bg-slate-700 text-white px-3 py-1 rounded border border-slate-600"
              placeholder="Nome do template"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold"
            >
              📁 Templates
            </button>
            <button
              onClick={saveTemplate}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> Salvar
            </button>
            <button
              onClick={applyTemplate}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold"
            >
              ⚡ Aplicar no Dispositivo
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Elements */}
          <div className="w-48 bg-slate-800 p-3 border-r border-slate-700 overflow-y-auto">
            <h3 className="text-white font-semibold mb-3 text-sm">➕ Adicionar</h3>
            <div className="space-y-2">
              <button
                onClick={() => addElement('text')}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
              >
                <Type className="w-4 h-4" /> Texto
              </button>
              <button
                onClick={() => addElement('image')}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
              >
                <Image className="w-4 h-4" /> Imagem/Logo
              </button>
              <button
                onClick={() => addElement('rectangle')}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
              >
                <Square className="w-4 h-4" /> Retângulo
              </button>
              <button
                onClick={() => addElement('circle')}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
              >
                <Circle className="w-4 h-4" /> Círculo
              </button>
            </div>

            <h3 className="text-white font-semibold mt-6 mb-3 text-sm">🎨 Fundo</h3>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer"
              />
              <input
                type="text"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="flex-1 bg-slate-700 text-white px-2 py-1 rounded text-sm"
              />
            </div>

            <h3 className="text-white font-semibold mt-6 mb-3 text-sm">📋 Elementos ({elements.length})</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {elements.map((el, index) => (
                <div
                  key={el.id}
                  onClick={() => setSelectedElement(el.id)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-xs ${
                    selectedElement === el.id ? 'bg-blue-600 ring-1 ring-blue-400' : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  <span className="text-white truncate flex-1 mr-2">
                    <span className="text-gray-400 mr-1">{index + 1}.</span>
                    {el.type === 'text' && `📝 ${el.content?.substring(0, 12) || 'Texto'}${(el.content?.length || 0) > 12 ? '...' : ''}`}
                    {el.type === 'image' && '🖼️ Imagem'}
                    {el.type === 'rectangle' && '⬛ Retângulo'}
                    {el.type === 'circle' && '⚫ Círculo'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteElement(el.id); }}
                    className="text-red-400 hover:text-red-300 p-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            {elements.length === 0 && (
              <p className="text-gray-500 text-xs text-center py-4">Nenhum elemento</p>
            )}
          </div>

          {/* Center - Phone Preview */}
          <div className="flex-1 flex items-center justify-center p-4 bg-slate-950 overflow-auto">
            <div className="relative flex-shrink-0">
              {/* Phone Frame */}
              <div className="bg-gray-800 rounded-[40px] p-3 shadow-2xl">
                <div 
                  ref={previewRef}
                  className="relative rounded-[32px]"
                  style={{
                    width: `${PREVIEW_WIDTH}px`,
                    height: `${PREVIEW_HEIGHT}px`,
                    backgroundColor: backgroundColor,
                    overflow: 'visible' // Permite ver elementos que saem da área
                  }}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onClick={() => setSelectedElement(null)}
                >
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-2xl z-10" />
                  
                  {/* Elements */}
                  {elements.map((el, index) => {
                    const scaleX = PREVIEW_WIDTH / ANDROID_WIDTH;
                    const scaleY = PREVIEW_HEIGHT / ANDROID_HEIGHT;
                    
                    return (
                      <div
                        key={el.id}
                        className={`absolute cursor-move transition-shadow ${
                          selectedElement === el.id ? 'ring-2 ring-blue-500 z-20' : 'z-10'
                        }`}
                        style={{
                          left: el.x * scaleX,
                          top: el.y * scaleY,
                          width: Math.max(el.width * scaleX, 20),
                          height: Math.max(el.height * scaleY, 20),
                          opacity: (el.opacity || 100) / 100
                        }}
                        onMouseDown={(e) => handleMouseDown(e, el.id)}
                        title={`Elemento ${index + 1}: ${el.type} (${Math.round(el.x)}, ${Math.round(el.y)})`}
                      >
                        {el.type === 'text' && (
                          <div
                            style={{
                              color: el.color,
                              fontSize: Math.max((el.fontSize || 16) * scaleX, 8),
                              fontWeight: el.fontWeight,
                              textAlign: 'center',
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              wordBreak: 'break-word',
                              overflow: 'hidden'
                            }}
                          >
                            {el.content}
                          </div>
                        )}
                        {el.type === 'image' && (
                          <div
                            className="w-full h-full flex items-center justify-center overflow-hidden"
                            style={{ backgroundColor: el.backgroundColor || 'transparent' }}
                          >
                            {el.imageUrl ? (
                              <img src={el.imageUrl} alt="" className="max-w-full max-h-full object-contain" />
                            ) : (
                              <div className="text-gray-500 text-xs flex flex-col items-center">
                                <span className="text-2xl">📷</span>
                                <span className="text-[10px]">Clique para adicionar</span>
                              </div>
                            )}
                          </div>
                        )}
                        {(el.type === 'rectangle' || el.type === 'circle') && (
                          <div
                            className="w-full h-full"
                            style={{
                              backgroundColor: el.backgroundColor,
                              borderRadius: el.type === 'circle' ? '50%' : (el.borderRadius || 0)
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Grid visual de ajuda (mostra quando arrasta) */}
                  {isDragging && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                      backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                      backgroundSize: '30px 30px'
                    }} />
                  )}
                </div>
              </div>
              
              {/* Info da posição atual */}
              {selectedEl && isDragging && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black/80 text-white px-2 py-1 rounded text-xs">
                  X: {Math.round(selectedEl.x)} | Y: {Math.round(selectedEl.y)}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Properties */}
          <div className="w-64 bg-slate-800 p-3 border-l border-slate-700 overflow-y-auto">
            {selectedEl ? (
              <>
                <h3 className="text-white font-semibold mb-3 text-sm">⚙️ Propriedades</h3>
                
                {/* Position */}
                <div className="mb-4">
                  <label className="text-gray-400 text-xs">Posição</label>
                  <div className="flex gap-2 mt-1">
                    <div className="flex-1">
                      <label className="text-gray-500 text-[10px]">X</label>
                      <input
                        type="number"
                        value={Math.round(selectedEl.x)}
                        onChange={(e) => updateElement(selectedEl.id, { x: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-gray-500 text-[10px]">Y</label>
                      <input
                        type="number"
                        value={Math.round(selectedEl.y)}
                        onChange={(e) => updateElement(selectedEl.id, { y: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Size */}
                <div className="mb-4">
                  <label className="text-gray-400 text-xs">Tamanho</label>
                  <div className="flex gap-2 mt-1">
                    <div className="flex-1">
                      <label className="text-gray-500 text-[10px]">Largura</label>
                      <input
                        type="number"
                        value={Math.round(selectedEl.width)}
                        onChange={(e) => updateElement(selectedEl.id, { width: parseInt(e.target.value) || 50 })}
                        className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-gray-500 text-[10px]">Altura</label>
                      <input
                        type="number"
                        value={Math.round(selectedEl.height)}
                        onChange={(e) => updateElement(selectedEl.id, { height: parseInt(e.target.value) || 50 })}
                        className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Text Properties */}
                {selectedEl.type === 'text' && (
                  <>
                    <div className="mb-4">
                      <label className="text-gray-400 text-xs">Texto</label>
                      <textarea
                        value={selectedEl.content || ''}
                        onChange={(e) => updateElement(selectedEl.id, { content: e.target.value })}
                        className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1"
                        rows={2}
                      />
                    </div>
                    <div className="mb-4">
                      <label className="text-gray-400 text-xs">Tamanho da Fonte</label>
                      <input
                        type="number"
                        value={selectedEl.fontSize || 16}
                        onChange={(e) => updateElement(selectedEl.id, { fontSize: parseInt(e.target.value) || 16 })}
                        className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="text-gray-400 text-xs">Peso</label>
                      <select
                        value={selectedEl.fontWeight || 'normal'}
                        onChange={(e) => updateElement(selectedEl.id, { fontWeight: e.target.value })}
                        className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Negrito</option>
                        <option value="lighter">Leve</option>
                      </select>
                    </div>
                    <div className="mb-4">
                      <label className="text-gray-400 text-xs">Cor do Texto</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="color"
                          value={selectedEl.color || '#FFFFFF'}
                          onChange={(e) => updateElement(selectedEl.id, { color: e.target.value })}
                          className="w-10 h-8 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={selectedEl.color || '#FFFFFF'}
                          onChange={(e) => updateElement(selectedEl.id, { color: e.target.value })}
                          className="flex-1 bg-slate-700 text-white px-2 py-1 rounded text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Image Properties */}
                {selectedEl.type === 'image' && (
                  <div className="mb-4">
                    <label className="text-gray-400 text-xs">Imagem</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, selectedEl.id)}
                      className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1"
                    />
                    {selectedEl.imageUrl && (
                      <img src={selectedEl.imageUrl} alt="" className="mt-2 max-h-20 rounded" />
                    )}
                  </div>
                )}

                {/* Shape Properties */}
                {(selectedEl.type === 'rectangle' || selectedEl.type === 'circle') && (
                  <>
                    <div className="mb-4">
                      <label className="text-gray-400 text-xs">Cor de Fundo</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="color"
                          value={selectedEl.backgroundColor || '#333333'}
                          onChange={(e) => updateElement(selectedEl.id, { backgroundColor: e.target.value })}
                          className="w-10 h-8 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={selectedEl.backgroundColor || '#333333'}
                          onChange={(e) => updateElement(selectedEl.id, { backgroundColor: e.target.value })}
                          className="flex-1 bg-slate-700 text-white px-2 py-1 rounded text-sm"
                        />
                      </div>
                    </div>
                    {selectedEl.type === 'rectangle' && (
                      <div className="mb-4">
                        <label className="text-gray-400 text-xs">Borda Arredondada</label>
                        <input
                          type="number"
                          value={selectedEl.borderRadius || 0}
                          onChange={(e) => updateElement(selectedEl.id, { borderRadius: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mt-1"
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Opacity */}
                <div className="mb-4">
                  <label className="text-gray-400 text-xs">Opacidade ({selectedEl.opacity || 100}%)</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedEl.opacity || 100}
                    onChange={(e) => updateElement(selectedEl.id, { opacity: parseInt(e.target.value) })}
                    className="w-full mt-1"
                  />
                </div>

                {/* Delete Button */}
                <button
                  onClick={() => deleteElement(selectedEl.id)}
                  className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Excluir Elemento
                </button>
              </>
            ) : (
              <div className="text-gray-400 text-sm text-center py-8">
                Selecione um elemento para editar suas propriedades
              </div>
            )}
          </div>
        </div>

        {/* Templates Modal */}
        {showTemplates && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
            <div className="bg-slate-800 rounded-xl p-6 w-96 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-lg">📁 Templates Salvos</h3>
                <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {savedTemplates.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Nenhum template salvo</p>
              ) : (
                <div className="space-y-2">
                  {savedTemplates.map(template => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between bg-slate-700 p-3 rounded-lg"
                    >
                      <div>
                        <p className="text-white font-semibold">{template.name}</p>
                        <p className="text-gray-400 text-xs">
                          {template.elements.length} elementos • {new Date(template.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => loadTemplate(template)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                        >
                          Carregar
                        </button>
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          className="p-1 bg-red-600 hover:bg-red-700 text-white rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlackScreenEditor;


