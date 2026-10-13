import { useState } from 'react';
import { authAPI } from '../services/api';
import { User, Lock, Key } from 'lucide-react';

interface LoginPageProps {
  onLogin: (token: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hwid, setHwid] = useState('');
  const [needsHwid, setNeedsHwid] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Gera HWID único baseado no navegador
  const generateHWID = (): string => {
    const nav = window.navigator;
    const screen = window.screen;
    
    const data = [
      nav.userAgent,
      nav.language,
      screen.width,
      screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      nav.hardwareConcurrency || 0,
      (nav as any).deviceMemory || 0,
    ].join('|');
    
    // Hash simples
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0') + 
           '-' + Date.now().toString(16).toUpperCase().slice(-8);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Primeiro tenta login normal
      const response = await authAPI.login({ username, password });
      
      // Verifica se precisa de HWID
      if (response.needs_hwid) {
        setNeedsHwid(true);
        setHwid(generateHWID());
        setLoading(false);
        return;
      }
      
      onLogin(response.access_token);
    } catch (err: any) {
      let detail = err.response?.data?.detail;
      
      // detail pode ser string ou array de objetos de validação
      if (Array.isArray(detail)) {
        detail = detail.map((d: any) => d.msg || d.message || '').join(', ');
      } else if (typeof detail === 'object' && detail?.msg) {
        detail = detail.msg;
      }
      
      const detailStr = String(detail || '');
      
      // Se o erro for de HWID inválido
      if (detailStr.includes('HWID') || detailStr.includes('hwid')) {
        setError('❌ Esta conta já está vinculada a outro dispositivo.');
      } else if (detailStr.includes('banned') || detailStr.includes('banido')) {
        setError('🚫 Sua conta foi banida. Contate o administrador.');
      } else {
        setError(detailStr || 'Erro ao autenticar');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleHwidActivation = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.activateHwid({ username, password, hwid });
      onLogin(response.access_token);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      // detail pode ser string ou array de objetos de validação
      if (typeof detail === 'string') {
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join(', '));
      } else if (detail?.msg) {
        setError(detail.msg);
      } else {
        setError('Erro ao ativar HWID');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo Hydra */}
        <div className="text-center mb-8">
          <img 
            src="/hydra-logo.svg" 
            alt="Hydra" 
            className="w-20 h-20 mx-auto mb-4 drop-shadow-2xl"
            style={{ filter: 'drop-shadow(0 0 10px rgba(139, 92, 246, 0.5))' }}
          />
          <h1 className="text-3xl font-bold text-white mb-2">HYDRA</h1>
          <p className="text-gray-400">Sistema de Controle Remoto</p>
        </div>

        {/* Form */}
        <div className="bg-slate-800 rounded-lg shadow-2xl p-8">
          {!needsHwid ? (
            <>
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-white">Login</h2>
                <p className="text-gray-400 text-sm mt-1">Entre com suas credenciais</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Usuário
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-600"
                      placeholder="Digite seu usuário"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-600"
                      placeholder="Digite sua senha"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Carregando...' : 'Entrar'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-yellow-600 rounded-full mb-4">
                  <Key className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-white">Ativação de Dispositivo</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Esta é a primeira vez que você acessa de este dispositivo.
                </p>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-700 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Seu HWID (Hardware ID)
                  </label>
                  <div className="bg-slate-900 rounded p-3 font-mono text-sm text-green-400 break-all">
                    {hwid}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    ⚠️ Este ID é único para seu dispositivo. Após ativar, você só poderá acessar deste dispositivo.
                  </p>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleHwidActivation}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Ativando...' : '✅ Ativar Dispositivo'}
                </button>

                <button
                  onClick={() => {
                    setNeedsHwid(false);
                    setError('');
                  }}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-gray-300 font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  Voltar
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-gray-500 text-sm mt-6">
          ⚠️ Apenas para fins educacionais
        </p>
      </div>
    </div>
  );
}
