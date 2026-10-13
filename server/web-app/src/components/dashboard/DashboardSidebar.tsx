import { useNavigate, useLocation } from 'react-router-dom';
import {
  Monitor,
  Smartphone,
  ScrollText,
  Settings,
  Palette,
  Package,
  LogOut,
} from 'lucide-react';

interface DashboardSidebarProps {
  onLogout: () => void;
  isMobile?: boolean;
}

const navItems = [
  { id: 'devices', icon: Smartphone, label: 'Dispositivos', path: '/dashboard', disabled: false },
  { id: 'broadcast', icon: Monitor, label: 'Transmissão', path: '/dashboard', disabled: false },
  { id: 'logs', icon: ScrollText, label: 'Logs', path: null, disabled: true, hint: 'Em breve' },
  { id: 'config', icon: Settings, label: 'Config', path: '/telegram', disabled: false },
] as const;

export default function DashboardSidebar({ onLogout, isMobile }: DashboardSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  if (isMobile) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-800/95 backdrop-blur-lg border-t border-slate-700 safe-bottom z-50">
        <div className="grid grid-cols-5 h-14">
          {navItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = item.path === location.pathname;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                title={'hint' in item ? item.hint : undefined}
                onClick={() => item.path && !item.disabled && navigate(item.path)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
                  item.disabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : active
                      ? 'text-purple-400'
                      : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onLogout}
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] text-gray-400 hover:text-red-400"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair</span>
          </button>
        </div>
      </nav>
    );
  }

  return (
    <aside className="w-16 flex-shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-2">
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="mb-4 p-1 rounded-lg hover:bg-slate-800 transition-colors"
        title="HYDRA"
      >
        <img
          src="/hydra-logo.svg"
          alt="Hydra"
          className="w-9 h-9"
          style={{ filter: 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.5))' }}
        />
      </button>

      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.id === 'devices' && location.pathname === '/dashboard';
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            title={item.disabled && 'hint' in item ? item.hint : item.label}
            onClick={() => item.path && !item.disabled && navigate(item.path)}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
              item.disabled
                ? 'text-gray-600 cursor-not-allowed opacity-40'
                : active
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                  : 'text-gray-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Icon className="w-5 h-5" />
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => navigate('/apk-studio')}
        title="APK Studio"
        className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-400 hover:text-purple-300 hover:bg-slate-800"
      >
        <Palette className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={() => navigate('/build-apk')}
        title="APK Builder"
        className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-400 hover:text-orange-300 hover:bg-slate-800"
      >
        <Package className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={onLogout}
        title="Sair"
        className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-slate-800"
      >
        <LogOut className="w-5 h-5" />
      </button>
    </aside>
  );
}
