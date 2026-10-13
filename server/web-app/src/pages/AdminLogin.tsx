import { useState } from 'react';
import { authAPI } from '../services/api';
import { Shield, User, Lock } from 'lucide-react';

interface AdminLoginProps {
  onLogin: (token: string) => void;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Login normal
      const response = await authAPI.login({ username, password });
      
      if (response.needs_hwid) {
        // Admin não precisa de HWID, então isso não deveria acontecer
        // Mas se acontecer, tenta ativar com HWID especial
        const hwidResponse = await authAPI.activateHwid({ 
          username, 
          password, 
          hwid: 'ADMIN-PANEL-' + Date.now() 
        });
        
        // Verifica se é admin
        const userInfo = await authAPI.me();
        if (!userInfo.is_admin) {
          setError('❌ Acesso negado. Apenas administradores.');
          return;
        }
        
        onLogin(hwidResponse.access_token);
        return;
      }
      
      // Verifica se é admin antes de permitir login
      localStorage.setItem('token', response.access_token);
      const userInfo = await authAPI.me();
      
      if (!userInfo.is_admin) {
        localStorage.removeItem('token');
        setError('❌ Acesso negado. Apenas administradores podem acessar este painel.');
        return;
      }
      
      onLogin(response.access_token);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail?.includes('banned') || detail?.includes('banido')) {
        setError('🚫 Sua conta foi banida.');
      } else {
        setError(detail || 'Credenciais inválidas');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-600 rounded-full mb-4 shadow-lg shadow-red-500/30">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Panel</h1>
          <p className="text-red-300">Acesso Restrito - Administradores</p>
        </div>

        {/* Form */}
        <div className="bg-slate-800/80 backdrop-blur rounded-lg shadow-2xl p-8 border border-red-500/20">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Usuário Admin
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="admin"
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
                  className="w-full pl-10 pr-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="••••••••"
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
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  <span>Entrar como Admin</span>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-red-400/50 text-xs mt-6">
          🔒 Área restrita - Acesso não autorizado é proibido
        </p>
      </div>
    </div>
  );
}

