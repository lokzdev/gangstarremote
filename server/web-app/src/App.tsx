import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import DeviceControl from './pages/DeviceControl';
import APKBuilder from './pages/APKBuilder';
import APKBuilderSelect from './pages/APKBuilderSelect';
import APKBuilderVisual from './pages/APKBuilderVisual';
import APKStudio from './pages/APKStudio';
import AdminLogin from './pages/AdminLogin';
import AdminPanel from './pages/AdminPanel';
import TelegramConfig from './pages/TelegramConfig';
import { authAPI } from './services/api';

interface UserInfo {
  id: number;
  username: string;
  is_admin: boolean;
}

function App() {
  // Estado para usuários normais
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  
  // Estado separado para admin
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminInfo, setAdminInfo] = useState<UserInfo | null>(null);

  // Login de usuário normal
  const handleLogin = async (token: string) => {
    localStorage.setItem('token', token);
    setIsAuthenticated(true);
  };

  // Login de admin (separado)
  const handleAdminLogin = async (token: string) => {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('token', token); // Também salva no token normal para API funcionar
    setIsAdminAuthenticated(true);
    
    try {
      const info = await authAPI.me();
      setAdminInfo(info);
    } catch (err) {
      console.error('Erro ao buscar info do admin', err);
    }
  };

  // Logout de usuário normal
  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  // Logout de admin
  const handleAdminLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('token');
    setIsAdminAuthenticated(false);
    setAdminInfo(null);
  };

  // Verifica autenticação ao carregar
  useEffect(() => {
    const checkAuth = async () => {
      // Verifica token de admin
      const adminToken = localStorage.getItem('admin_token');
      if (adminToken) {
        localStorage.setItem('token', adminToken);
        
        // Primeiro tenta refresh para garantir token válido
        try {
          const refreshResponse = await authAPI.refresh();
          if (refreshResponse.access_token) {
            localStorage.setItem('admin_token', refreshResponse.access_token);
            localStorage.setItem('token', refreshResponse.access_token);
          }
        } catch {
          // Se refresh falhar, continua com token antigo
          console.log('Refresh falhou, tentando com token existente...');
        }
        
        // Agora verifica se é admin
        try {
          const info = await authAPI.me();
          if (info.is_admin) {
            setAdminInfo(info);
            setIsAdminAuthenticated(true);
          }
        } catch (err: any) {
          // Se falhar mesmo após refresh, remove tokens
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            localStorage.removeItem('admin_token');
            localStorage.removeItem('token');
          } else {
            // Erro de rede - mantém autenticado
            setIsAdminAuthenticated(true);
          }
        }
        
        setLoading(false);
        return;
      }
      
      // Verifica token de usuário normal
      const token = localStorage.getItem('token');
      if (token) {
        // Primeiro tenta refresh para garantir token válido
        try {
          const refreshResponse = await authAPI.refresh();
          if (refreshResponse.access_token) {
            localStorage.setItem('token', refreshResponse.access_token);
          }
        } catch {
          // Se refresh falhar, continua com token antigo
          console.log('Refresh falhou, tentando com token existente...');
        }
        
        // Agora verifica autenticação
        try {
          await authAPI.me();
          setIsAuthenticated(true);
        } catch (err: any) {
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            localStorage.removeItem('token');
            setIsAuthenticated(false);
          } else {
            // Erro de rede - mantém autenticado
            setIsAuthenticated(true);
          }
        }
      }
      
      setLoading(false);
    };
    
    checkAuth();
  }, []);

  // Refresh token para usuário normal
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    const refreshToken = async () => {
      try {
        const response = await authAPI.refresh();
        if (!cancelled && response.access_token) {
          localStorage.setItem('token', response.access_token);
        }
      } catch (error: any) {
        if (!cancelled) {
          // Só desloga se for erro 401 (token inválido/expirado)
          if (error?.response?.status === 401) {
            console.error('Token expirado - fazendo logout');
            localStorage.removeItem('token');
            setIsAuthenticated(false);
          } else {
            // Erro de rede - NÃO desloga, tenta novamente depois
            console.warn('Erro de rede ao renovar token, tentando novamente...');
          }
        }
      }
    };

    // Refresh inicial após 1 segundo (dá tempo de carregar)
    const initialTimeout = window.setTimeout(refreshToken, 1000);
    // Refresh periódico a cada 10 minutos
    const interval = window.setInterval(refreshToken, 1000 * 60 * 10);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimeout);
      window.clearInterval(interval);
    };
  }, [isAuthenticated]);

  // Refresh token para admin
  useEffect(() => {
    if (!isAdminAuthenticated) return;

    let cancelled = false;

    const refreshToken = async () => {
      try {
        const response = await authAPI.refresh();
        if (!cancelled && response.access_token) {
          localStorage.setItem('admin_token', response.access_token);
          localStorage.setItem('token', response.access_token);
        }
      } catch (error: any) {
        if (!cancelled) {
          // Só desloga se for erro 401 (token inválido/expirado)
          if (error?.response?.status === 401) {
            console.error('Token admin expirado - fazendo logout');
            localStorage.removeItem('admin_token');
            localStorage.removeItem('token');
            setIsAdminAuthenticated(false);
            setAdminInfo(null);
          } else {
            // Erro de rede - NÃO desloga, tenta novamente depois
            console.warn('Erro de rede ao renovar token admin, tentando novamente...');
          }
        }
      }
    };

    // Refresh inicial após 1 segundo
    const initialTimeout = window.setTimeout(refreshToken, 1000);
    // Refresh periódico a cada 10 minutos
    const interval = window.setInterval(refreshToken, 1000 * 60 * 10);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimeout);
      window.clearInterval(interval);
    };
  }, [isAdminAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* ==================== ROTAS DE USUÁRIO NORMAL ==================== */}
        <Route 
          path="/login" 
          element={
            isAuthenticated ? 
            <Navigate to="/dashboard" /> : 
            <LoginPage onLogin={handleLogin} />
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            isAuthenticated ? 
            <Dashboard onLogout={handleLogout} /> : 
            <Navigate to="/login" />
          } 
        />
        <Route 
          path="/device/:deviceId" 
          element={
            isAuthenticated ? 
            <DeviceControl onLogout={handleLogout} /> : 
            <Navigate to="/login" />
          } 
        />
        <Route 
          path="/apk-builder" 
          element={
            isAuthenticated ? 
            <APKBuilder onLogout={handleLogout} /> : 
            <Navigate to="/login" />
          } 
        />
        
        {/* Rotas do novo APK Builder Visual */}
        <Route 
          path="/build-apk" 
          element={
            isAuthenticated ? 
            <APKBuilderSelect onLogout={handleLogout} /> : 
            <Navigate to="/login" />
          } 
        />
        <Route 
          path="/build-apk/quick" 
          element={
            isAuthenticated ? 
            <APKBuilder onLogout={handleLogout} /> : 
            <Navigate to="/login" />
          } 
        />
        <Route 
          path="/build-apk/visual" 
          element={
            isAuthenticated ? 
            <APKBuilderVisual /> : 
            <Navigate to="/login" />
          } 
        />
        
        {/* APK Studio - Sistema completo de criação de APK */}
        <Route 
          path="/apk-studio" 
          element={
            isAuthenticated ? 
            <APKStudio /> : 
            <Navigate to="/login" />
          } 
        />
        
        {/* Telegram Crypter - Integração com @android_protect_bot */}
        <Route 
          path="/telegram" 
          element={
            isAuthenticated ? 
            <TelegramConfig /> : 
            <Navigate to="/login" />
          } 
        />
        
        {/* ==================== ROTAS DE ADMIN (SEPARADAS) ==================== */}
        <Route 
          path="/admin" 
          element={
            isAdminAuthenticated && adminInfo?.is_admin ? 
            <AdminPanel onLogout={handleAdminLogout} /> : 
            <AdminLogin onLogin={handleAdminLogin} />
          } 
        />
        
        {/* ==================== ROTA PADRÃO ==================== */}
        <Route 
          path="/" 
          element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
