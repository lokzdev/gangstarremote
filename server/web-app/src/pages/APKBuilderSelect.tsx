import { useNavigate } from 'react-router-dom';
import {
  Zap,
  Palette,
  Smartphone,
  ArrowRight,
  Settings,
  Layers,
  Type,
  MousePointer,
  LogOut,
  Shield,
  Building2
} from 'lucide-react';

interface APKBuilderSelectProps {
  onLogout: () => void;
}

export default function APKBuilderSelect({ onLogout }: APKBuilderSelectProps) {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen cyber-bg">
      {/* Header */}
      <header className="neon-panel backdrop-blur-sm border-b border-gray-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Smartphone className="text-orange-500" size={28} />
            <h1 className="text-xl font-bold glow-text">APK Builder</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-gray-400 hover:text-white transition-colors"
            >
              Dashboard
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 text-gray-400 hover:text-red-400 transition-colors"
            >
              <LogOut size={18} />
              Sair
            </button>
          </div>
        </div>
      </header>
      
      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Escolha o Modo de Criação
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Selecione como você deseja criar seu APK. O modo rápido usa templates prontos,
            enquanto o modo visual permite personalização completa com drag-and-drop.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8">
          {/* Quick Builder Card */}
          <div
            onClick={() => navigate('/build-apk/quick')}
            className="group relative bg-gray-800 rounded-2xl p-8 border border-gray-700 hover:border-blue-500 transition-all cursor-pointer hover:shadow-xl hover:shadow-blue-500/10"
          >
            <div className="absolute top-4 right-4">
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full">
                Rápido
              </span>
            </div>
            
            <div className="w-16 h-16 bg-[color:var(--neon-blue)]/12 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Zap size={32} className="text-[color:var(--neon-blue)]" />
            </div>
            
            <h3 className="text-2xl font-bold glow-text mb-3">
              APK Rápido
            </h3>
            
            <p className="text-gray-300 mb-6">
              Crie um APK em segundos. Escolha nome e ícone para empacotar o app.
            </p>
            
            <ul className="space-y-3 mb-8">
              <li className="flex items-center gap-3 text-gray-300">
                <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <Settings size={14} className="text-blue-400" />
                </div>
                Nome e ícone personalizados
              </li>
              <li className="flex items-center gap-3 text-gray-300">
                <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <Shield size={14} className="text-blue-400" />
                </div>
                Acessibilidade automática
              </li>
              <li className="flex items-center gap-3 text-gray-300">
                <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <Zap size={14} className="text-blue-400" />
                </div>
                Build em segundos
              </li>
            </ul>
            
            <div className="flex items-center gap-2 text-blue-400 group-hover:gap-4 transition-all">
              <span className="font-medium">Criar APK Rápido</span>
              <ArrowRight size={20} />
            </div>
          </div>
          
          {/* Visual Builder Card */}
          <div
            onClick={() => navigate('/build-apk/visual')}
            className="group relative bg-gray-800 rounded-2xl p-8 border border-gray-700 hover:border-orange-500 transition-all cursor-pointer hover:shadow-xl hover:shadow-orange-500/10"
          >
            <div className="absolute top-4 right-4">
              <span className="px-3 py-1 bg-orange-500/20 text-orange-400 text-xs font-medium rounded-full">
                Avançado
              </span>
            </div>
            
            <div className="w-16 h-16 bg-[color:var(--neon-blue)]/12 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Palette size={32} className="text-[color:var(--neon-blue)]" />
            </div>
            
            <h3 className="text-2xl font-bold glow-text mb-3">
              APK Visual
            </h3>
            
              <p className="text-gray-300 mb-6">
              Editor completo com drag-and-drop. Crie telas customizadas
              com layout e interação visual para o seu app.
            </p>
            
            <ul className="space-y-3 mb-8">
              <li className="flex items-center gap-3 text-gray-300">
                <div className="w-6 h-6 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <MousePointer size={14} className="text-orange-400" />
                </div>
                Drag-and-drop intuitivo
              </li>
              <li className="flex items-center gap-3 text-gray-300">
                <div className="w-6 h-6 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <Layers size={14} className="text-orange-400" />
                </div>
                Múltiplas telas personalizadas
              </li>
              <li className="flex items-center gap-3 text-gray-300">
                <div className="w-6 h-6 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <Type size={14} className="text-orange-400" />
                </div>
                Textos, inputs, logos e botões
              </li>
              <li className="flex items-center gap-3 text-gray-300">
                <div className="w-6 h-6 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <Building2 size={14} className="text-orange-400" />
                </div>
                Templates de bancos/operadoras
              </li>
            </ul>
            
            <div className="flex items-center gap-2 text-orange-400 group-hover:gap-4 transition-all">
              <span className="font-medium">Abrir Editor Visual</span>
              <ArrowRight size={20} />
            </div>
          </div>
        </div>
        
        {/* Templates Preview */}
        <div className="mt-16">
          <h3 className="text-xl font-semibold text-white mb-6 text-center">
            Templates Disponíveis no Editor Visual
          </h3>
          
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Generic Templates */}
              <div className="neon-panel rounded-xl p-4 border text-center">
                <div className="w-12 h-12 bg-[color:var(--neon-blue)] rounded-xl mx-auto mb-3 flex items-center justify-center">
                  <Building2 size={24} className="text-white" />
                </div>
                <span className="text-sm font-medium text-white">Padrão</span>
                <p className="text-xs text-gray-400 mt-1">Template básico</p>
              </div>

              <div className="neon-panel rounded-xl p-4 border text-center">
                <div className="w-12 h-12 bg-[color:var(--neon-blue)]/30 rounded-xl mx-auto mb-3 flex items-center justify-center">
                  <Building2 size={24} className="text-white" />
                </div>
                <span className="text-sm font-medium text-white">Moderno</span>
                <p className="text-xs text-gray-400 mt-1">Layout com visual moderno</p>
              </div>

              <div className="neon-panel rounded-xl p-4 border text-center">
                <div className="w-12 h-12 bg-[color:var(--neon-blue)]/12 rounded-xl mx-auto mb-3 flex items-center justify-center">
                  <Building2 size={24} className="text-white" />
                </div>
                <span className="text-sm font-medium text-white">Compacto</span>
                <p className="text-xs text-gray-400 mt-1">Versão leve para tela pequena</p>
              </div>

              <div className="neon-panel rounded-xl p-4 border text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-[color:var(--neon-blue)] to-[color:var(--neon-accent)] rounded-xl mx-auto mb-3 flex items-center justify-center">
                  <Palette size={24} className="text-white" />
                </div>
                <span className="text-sm font-medium text-white">Custom</span>
                <p className="text-xs text-gray-400 mt-1">Crie do zero</p>
              </div>
            </div>
        </div>
        
        {/* Info Box */}
        <div className="mt-12 neon-panel border rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-[color:var(--neon-blue)]/12 rounded-xl flex items-center justify-center flex-shrink-0">
              <Shield size={20} className="text-[color:var(--neon-blue)]" />
            </div>
            <div>
              <h4 className="font-semibold text-white mb-2">Sobre Templates</h4>
              <p className="text-gray-300 text-sm">
                Templates são modelos visuais que aceleram a criação de telas do aplicativo. Use-os
                como ponto de partida e personalize cores, textos e botões sem alterar a lógica do backend.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

