import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../services/api';
import { 
  MessageCircle, 
  Key, 
  Phone, 
  Bot, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  ArrowLeft,
  Lock,
  Unplug,
  Shield
} from 'lucide-react';

interface TelegramStatus {
  configured: boolean;
  phone: string;
  bot_username: string;
  connected: boolean;
  waiting_code: boolean;
  waiting_password: boolean;
  has_session: boolean;
}

// Bot de crypter padrão
const CRYPTER_BOT = "android_protect_bot";

export default function TelegramConfig() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Formulário de configuração
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  
  // Verificação
  const [verificationCode, setVerificationCode] = useState('');
  const [password2FA, setPassword2FA] = useState('');
  const [step, setStep] = useState<'config' | 'code' | 'password' | 'connected'>('config');
  
  const token = localStorage.getItem('token');
  
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/telegram/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        
        if (data.connected) {
          setStep('connected');
        } else if (data.waiting_code) {
          setStep('code');
        } else if (data.waiting_password) {
          setStep('password');
        } else {
          setStep('config');
        }
        
        // Preenche campos se já configurado
        if (data.phone) setPhone(data.phone);
      }
    } catch (e) {
      console.error('Erro ao buscar status:', e);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchStatus();
  }, []);
  
  const handleConfigure = async () => {
    setError('');
    setLoading(true);
    
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/telegram/configure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          api_id: apiId,
          api_hash: apiHash,
          phone,
          bot_username: CRYPTER_BOT  // Sempre usa @android_protect_bot
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccess('Configurado! Iniciando login...');
        // Inicia login automaticamente
        await handleLogin();
      } else {
        setError(data.detail || 'Erro ao configurar');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleLogin = async () => {
    setError('');
    setLoading(true);
    
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/telegram/login`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await res.json();
      
      if (data.status === 'code_sent') {
        setStep('code');
        setSuccess('Código enviado para o Telegram!');
      } else if (data.status === 'already_logged') {
        setStep('connected');
        setSuccess(`Já conectado como ${data.user}!`);
      } else if (data.status === 'error') {
        setError(data.message);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleVerifyCode = async () => {
    setError('');
    setLoading(true);
    
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/telegram/verify-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: verificationCode })
      });
      
      const data = await res.json();
      
      if (data.status === 'success') {
        setStep('connected');
        setSuccess(`Conectado como ${data.user}!`);
      } else if (data.status === 'password_needed') {
        setStep('password');
        setSuccess('Senha 2FA necessária');
      } else if (data.status === 'error') {
        setError(data.message);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleVerifyPassword = async () => {
    setError('');
    setLoading(true);
    
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/telegram/verify-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: password2FA })
      });
      
      const data = await res.json();
      
      if (data.status === 'success') {
        setStep('connected');
        setSuccess(`Conectado como ${data.user}!`);
      } else if (data.status === 'error') {
        setError(data.message);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await fetch(`${getApiBaseUrl()}/api/telegram/disconnect`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setStep('config');
      setSuccess('Desconectado');
      fetchStatus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading && !status) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Telegram Crypter</h1>
              <p className="text-gray-400 text-sm">Integração com bot de criptografia</p>
            </div>
          </div>
        </div>
        
        {/* Mensagens */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-300">{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-4 bg-green-500/20 border border-green-500 rounded-lg flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-green-300">{success}</span>
          </div>
        )}
        
        {/* Status Card */}
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            📊 Status da Conexão
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${status?.configured ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <span className="text-gray-300">Configurado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${status?.connected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
              <span className="text-gray-300">Conectado</span>
            </div>
            {status?.phone && (
              <div className="flex items-center gap-2 col-span-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">{status.phone}</span>
              </div>
            )}
            {status?.bot_username && (
              <div className="flex items-center gap-2 col-span-2">
                <Bot className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">@{status.bot_username}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Formulário baseado no step */}
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          
          {step === 'config' && (
            <>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-500" />
                Conectar ao Crypter
              </h2>
              
              {/* Info do Bot */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <Bot className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="text-green-300 font-bold">@{CRYPTER_BOT}</p>
                    <p className="text-green-400/70 text-sm">Bot de criptografia automática</p>
                  </div>
                </div>
                <p className="text-green-300/80 text-sm">
                  🔐 Os APKs gerados serão enviados automaticamente para este bot e retornados criptografados.
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <p className="text-blue-300 text-sm">
                    📌 <strong>Para obter API ID e Hash:</strong><br />
                    1. Acesse <a href="https://my.telegram.org" target="_blank" rel="noopener" className="underline hover:text-blue-200">my.telegram.org</a><br />
                    2. Faça login com seu número<br />
                    3. Vá em "API development tools"<br />
                    4. Crie um app e copie as credenciais
                  </p>
                </div>
                
                <div>
                  <label className="text-gray-300 text-sm block mb-1">API ID</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      type="text"
                      value={apiId}
                      onChange={(e) => setApiId(e.target.value)}
                      placeholder="12345678"
                      className="w-full bg-slate-700 text-white pl-10 pr-4 py-3 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-gray-300 text-sm block mb-1">API Hash</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      type="text"
                      value={apiHash}
                      onChange={(e) => setApiHash(e.target.value)}
                      placeholder="abcdef1234567890abcdef1234567890"
                      className="w-full bg-slate-700 text-white pl-10 pr-4 py-3 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-gray-300 text-sm block mb-1">Seu Número de Telefone (com código do país)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+5511999999999"
                      className="w-full bg-slate-700 text-white pl-10 pr-4 py-3 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>
                  <p className="text-gray-500 text-xs mt-1">Use o mesmo número que você usa no Telegram</p>
                </div>
                
                <button
                  onClick={handleConfigure}
                  disabled={loading || !apiId || !apiHash || !phone}
                  className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold flex items-center justify-center gap-2 shadow-lg"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
                  Conectar ao Telegram
                </button>
              </div>
            </>
          )}
          
          {step === 'code' && (
            <>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                📱 Código de Verificação
              </h2>
              
              <p className="text-gray-400 mb-4">
                Digite o código que você recebeu no Telegram
              </p>
              
              <div className="space-y-4">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="12345"
                  maxLength={6}
                  className="w-full bg-slate-700 text-white text-center text-2xl tracking-widest px-4 py-4 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
                
                <button
                  onClick={handleVerifyCode}
                  disabled={loading || !verificationCode}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                  Verificar Código
                </button>
              </div>
            </>
          )}
          
          {step === 'password' && (
            <>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                🔐 Senha 2FA
              </h2>
              
              <p className="text-gray-400 mb-4">
                Sua conta tem verificação em duas etapas. Digite sua senha:
              </p>
              
              <div className="space-y-4">
                <input
                  type="password"
                  value={password2FA}
                  onChange={(e) => setPassword2FA(e.target.value)}
                  placeholder="Sua senha 2FA"
                  className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
                
                <button
                  onClick={handleVerifyPassword}
                  disabled={loading || !password2FA}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                  Verificar Senha
                </button>
              </div>
            </>
          )}
          
          {step === 'connected' && (
            <>
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Conectado ao Telegram!</h2>
                <p className="text-gray-400 mb-6">
                  O bot <strong>@{status?.bot_username}</strong> está pronto para criptografar APKs
                </p>
                
                <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
                  <p className="text-gray-300 text-sm">
                    🔐 Quando você gerar um APK, ele será automaticamente enviado para o bot de crypter.
                  </p>
                </div>
                
                <button
                  onClick={handleDisconnect}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 mx-auto"
                >
                  <Unplug className="w-5 h-5" />
                  Desconectar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

