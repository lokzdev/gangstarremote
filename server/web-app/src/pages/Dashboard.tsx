import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { devicesAPI } from '../services/api';
import type { Device } from '../types';
import { RefreshCw, Package } from 'lucide-react';
import DashboardSidebar from '../components/dashboard/DashboardSidebar';
import DeviceTable from '../components/dashboard/DeviceTable';
import ContextMenu from '../components/dashboard/ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';
import { mapDeviceToCliente } from '../utils/mapDeviceToCliente';
import type { Cliente } from '../types/dashboard';

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const { menu, openMenu, closeMenu } = useContextMenu();
  const hasLoadedOnce = useRef(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadDevices = useCallback(async (silent = false) => {
    try {
      if (!silent && !hasLoadedOnce.current) {
        setInitialLoading(true);
      } else if (silent) {
        setRefreshing(true);
      }
      const data = await devicesAPI.getAll();
      setDevices(data);
      hasLoadedOnce.current = true;
    } catch (error) {
      console.error('Erro ao carregar dispositivos:', error);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDevices(false);
    const interval = setInterval(() => loadDevices(true), 3000);
    return () => clearInterval(interval);
  }, [loadDevices]);

  const clientes = useMemo(() => {
    const mapped = devices.map(mapDeviceToCliente);
    const online = mapped.filter((c) => c.status === 'online');
    const offline = mapped.filter((c) => c.status === 'offline');
    return [...online, ...offline];
  }, [devices]);

  const onlineCount = clientes.filter((c) => c.status === 'online').length;
  const offlineCount = clientes.length - onlineCount;

  const handleRowClick = (cliente: Cliente) => {
    if (cliente.status === 'online') {
      navigate(`/device/${cliente.deviceId}`);
    }
  };

  return (
    <div className="min-h-screen cyber-bg flex safe-top safe-bottom">
      <DashboardSidebar onLogout={onLogout} isMobile={isMobile} />

      <div className={`flex-1 flex flex-col min-w-0 ${isMobile ? 'pb-16' : ''}`}>
        <header className="neon-panel border-b border-slate-800 px-4 sm:px-6 py-3 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {isMobile && (
                <img
                  src="/hydra-logo.svg"
                  alt="Hydra"
                  className="w-8 h-8 flex-shrink-0"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold glow-text truncate">HYDRA</h1>
                <p className="text-xs text-slate-400 hidden sm:block">
                  Painel de Dispositivos
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <div className="flex items-center gap-3 text-xs sm:text-sm">
                <span className="text-slate-400">
                  Total: <span className="text-white font-semibold">{clientes.length}</span>
                </span>
                <span className="text-emerald-400">
                  ● {onlineCount} online
                </span>
                <span className="text-red-400 hidden sm:inline">
                  ● {offlineCount} offline
                </span>
              </div>

              {!isMobile && (
                <button
                  type="button"
                  onClick={() => navigate('/build-apk')}
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 btn-neon text-sm"
                >
                  <Package className="w-4 h-4" />
                  APK
                </button>
              )}

              <button
                type="button"
                onClick={() => loadDevices(false)}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700"
                title="Atualizar"
              >
                <RefreshCw className={`w-4 h-4 text-slate-300 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-6 overflow-auto">
          <div className="mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-white">
              Dispositivos
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Clique para controlar · Clique direito para menu rápido
            </p>
          </div>

          <DeviceTable
            clientes={clientes}
            loading={initialLoading}
            onRowClick={handleRowClick}
            onRowContextMenu={(e, cliente) => openMenu(e, cliente)}
            onCreateApk={() => navigate('/build-apk')}
          />
        </main>
      </div>

      <ContextMenu
        visible={menu.visible}
        x={menu.x}
        y={menu.y}
        cliente={menu.cliente}
        onClose={closeMenu}
      />
    </div>
  );
}
