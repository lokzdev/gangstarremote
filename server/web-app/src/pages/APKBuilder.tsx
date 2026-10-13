import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apkAPI, getApiBaseUrl } from '../services/api';
import { ArrowLeft, Package, Download, Loader, CheckCircle } from 'lucide-react';

interface APKBuilderProps {
  onLogout: () => void;
}

export default function APKBuilder({ onLogout: _onLogout }: APKBuilderProps) {
  const navigate = useNavigate();
  const [appName, setAppName] = useState('Google Play Services');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string>('');
  const [building, setBuilding] = useState(false);
  const [buildSuccess, setBuildSuccess] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildMessage, setBuildMessage] = useState('');
  const [buildId, setBuildId] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIconFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setIconPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Polling do status do build
  useEffect(() => {
    if (!buildId || !building) return;

    const checkStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBaseUrl()}/api/build-status/${buildId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setBuildProgress(data.progress || 0);
          setBuildMessage(data.message || '');
          
          if (data.status === 'success') {
            setBuilding(false);
            setBuildSuccess(true);
            setDownloadUrl(data.download_url);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          } else if (data.status === 'error') {
            setBuilding(false);
            setError(data.message || 'Erro no build');
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          }
        }
      } catch (err) {
        console.error('Erro ao verificar status:', err);
      }
    };

    pollIntervalRef.current = setInterval(checkStatus, 2000);
    checkStatus(); // Primeira verificação imediata

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [buildId, building]);

  const handleBuild = async () => {
    if (!iconFile) {
      setError('Ícone é obrigatório');
      return;
    }

    setBuilding(true);
    setError('');
    setBuildSuccess(false);
    setBuildProgress(0);
    setBuildMessage('Iniciando build...');

    try {
      const formData = new FormData();
      formData.append('app_name', appName);
      formData.append('icon', iconFile);

      const response = await apkAPI.build(formData);

      // Build assíncrono - salva o build_id para polling
      if (response.status === 'building' && response.build_id) {
        setBuildId(response.build_id);
        setBuildMessage('Build iniciado em background...');
      } else if (response.status === 'success') {
        // Build síncrono (fallback)
        setBuildSuccess(true);
        setDownloadUrl(response.download_url);
        setBuilding(false);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao construir APK');
      setBuilding(false);
    }
  };

  return (
    <div className="min-h-screen cyber-bg">
      {/* Header */}
      <header className="neon-panel border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-300" />
              </button>
              <div>
                <h1 className="text-lg font-bold glow-text">Construtor de APK</h1>
                <p className="text-xs text-gray-300">Gere pacotes Android personalizados (interface visual)</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Form */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center">
              <Package className="w-5 h-5 mr-2 text-purple-400" />
              Configuração do APK
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nome do Aplicativo
                </label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full px-4 py-2 bg-transparent border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--neon-blue)]"
                  placeholder="Ex: MeuApp Seguro"
                />
                <p className="mt-1 text-xs text-gray-400">Nome que será usado no empacotamento do aplicativo</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Ícone do Aplicativo
                </label>
                <div className="flex items-center space-x-4">
                  {iconPreview && (
                    <img src={iconPreview} alt="Preview" className="w-16 h-16 rounded-lg border-2 border-slate-600" />
                  )}
                  <label className="flex-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white cursor-pointer hover:bg-slate-600 transition-colors text-center">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleIconChange}
                      className="hidden"
                    />
                    {iconFile ? iconFile.name : 'Escolher ícone (JPG/PNG)'}
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-400">Qualquer tamanho, será redimensionado automaticamente</p>
              </div>

              {/* Barra de progresso durante build */}
              {building && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-400 mb-1">
                    <span>{buildMessage}</span>
                    <span>{buildProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${buildProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    O build está sendo feito em background. Você pode continuar usando o painel.
                  </p>
                </div>
              )}

              <button
                onClick={handleBuild}
                disabled={building || !appName.trim()}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                {building ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Construindo em background... ({buildProgress}%)</span>
                  </>
                ) : (
                  <>
                    <Package className="w-5 h-5" />
                    <span>Construir APK</span>
                  </>
                )}
              </button>

              {error && (
                <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {buildSuccess && (
                <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
                  <div className="flex items-center text-green-400 font-semibold mb-3">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    APK Construído com Sucesso!
                  </div>
                  <a
                    href={`${getApiBaseUrl()}${downloadUrl}`}
                    download
                    className="w-full flex items-center justify-center space-x-2 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    <span>Baixar APK</span>
                  </a>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
