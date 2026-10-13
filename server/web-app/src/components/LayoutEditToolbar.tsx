import React from 'react';

interface LayoutEditToolbarProps {
  isEditMode: boolean;
  isDirty: boolean;
  onToggleEditMode: () => void;
  onSave: () => void;
  onReset: () => void;
}

export const LayoutEditToolbar: React.FC<LayoutEditToolbarProps> = ({
  isEditMode,
  isDirty,
  onToggleEditMode,
  onSave,
  onReset,
}) => {
  return (
    <div className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${
      isEditMode ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'
    }`}>
      <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-4">
        {/* Indicador de modo */}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-blue-400 font-medium text-sm">Modo Edição</span>
        </div>

        <div className="w-px h-6 bg-gray-600" />

        {/* Instruções */}
        <div className="text-xs text-gray-400">
          <span className="text-yellow-400">Arraste bordas</span> para redimensionar • 
          <span className="text-yellow-400"> Clique em botões</span> para editar cores
        </div>

        <div className="w-px h-6 bg-gray-600" />

        {/* Botões de ação */}
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-orange-400 animate-pulse">
              • Alterações não salvas
            </span>
          )}
          
          <button
            onClick={onReset}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            title="Resetar para layout padrão"
          >
            🔄 Resetar
          </button>
          
          <button
            onClick={onSave}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              isDirty 
                ? 'bg-green-600 hover:bg-green-500 text-white' 
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
            disabled={!isDirty}
            title="Salvar layout"
          >
            💾 Salvar
          </button>
          
          <button
            onClick={onToggleEditMode}
            className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
            title="Sair do modo edição"
          >
            ✖ Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

// Botão flutuante para ativar modo edição
export const EditModeToggle: React.FC<{
  isEditMode: boolean;
  onToggle: () => void;
}> = ({ isEditMode, onToggle }) => {
  if (isEditMode) return null;

  return (
    <button
      onClick={onToggle}
      className="fixed bottom-4 right-4 z-50 w-12 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
      title="Ativar modo de edição de layout"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
  );
};

export default LayoutEditToolbar;

