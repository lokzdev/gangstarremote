import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Cliente, ContextMenuSection, DevicePanelAction } from '@/types/dashboard';

interface ContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  cliente: Cliente | null;
  onClose: () => void;
}

const MENU_SECTIONS: ContextMenuSection[] = [
  {
    title: 'Tela',
    items: [
      { id: 'screen', label: 'Controle / Tela', icon: '📺', panel: 'screen' },
      { id: 'silent', label: 'HVNC Silente', icon: '🔇', panel: 'silent' },
      { id: 'blackScreen', label: 'Tela Preta', icon: '⬛', panel: 'blackScreen' },
      { id: 'screenReader', label: 'Screen Reader V2', icon: '👁️', panel: 'screenReader' },
    ],
  },
  {
    title: 'Mídia',
    items: [
      { id: 'camera', label: 'Câmera', icon: '📷', panel: 'camera' },
      { id: 'mic', label: 'Microfone', icon: '🎤', panel: 'mic' },
    ],
  },
  {
    title: 'Dados',
    items: [
      { id: 'apps', label: 'Apps Instalados', icon: '📱', panel: 'apps' },
      { id: 'keylogger', label: 'Keylogger', icon: '⌨️', panel: 'keylogger' },
      { id: 'lockscreen', label: 'Lockscreen', icon: '🔒', panel: 'lockscreen' },
    ],
  },
  {
    title: 'Layout',
    items: [
      { id: 'floating', label: 'Modo Flutuante', icon: '🪟', panel: 'floating' },
    ],
  },
  {
    title: 'Em breve',
    items: [
      { id: 'sms', label: 'SMS', icon: '💬', disabled: true, hint: 'Em breve' },
      { id: 'contacts', label: 'Contatos', icon: '👥', disabled: true, hint: 'Em breve' },
      { id: 'gps', label: 'GPS', icon: '📍', disabled: true, hint: 'Em breve' },
      { id: 'injection', label: 'Injeção', icon: '💉', disabled: true, hint: 'Em breve' },
      { id: 'broadcast', label: 'Broadcast', icon: '📡', disabled: true, hint: 'Em breve' },
      { id: 'exfil', label: 'Exfil', icon: '📤', disabled: true, hint: 'Em breve' },
    ],
  },
];

export default function ContextMenu({ visible, x, y, cliente, onClose }: ContextMenuProps) {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${Math.max(8, maxX)}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${Math.max(8, maxY)}px`;
    }
  }, [visible, x, y]);

  if (!visible || !cliente) return null;

  const isOnline = cliente.status === 'online';

  const handleAction = (panel?: DevicePanelAction, disabled?: boolean) => {
    if (disabled || !panel) return;
    if (!isOnline) return;

    navigate(`/device/${cliente.deviceId}`, { state: { openPanel: panel } });
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div
        ref={menuRef}
        className="fixed z-[101] min-w-[220px] max-w-[280px] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl shadow-black/50 py-1 text-sm"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2.5 border-b border-slate-800/80">
          <p className="text-white font-semibold truncate">{cliente.modelName || cliente.tag}</p>
          <p className="text-cyan-400 font-mono text-xs truncate">{cliente.ip}</p>
          {!isOnline && (
            <p className="text-red-400 text-[10px] mt-1">Dispositivo offline</p>
          )}
        </div>

        {MENU_SECTIONS.map((section, sectionIdx) => (
          <div key={section.title ?? sectionIdx}>
            {section.title && (
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const itemDisabled = item.disabled || (!!item.panel && !isOnline);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={itemDisabled}
                  title={item.hint ?? (itemDisabled && !isOnline ? 'Dispositivo offline' : undefined)}
                  onClick={() => handleAction(item.panel, itemDisabled)}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                    itemDisabled
                      ? 'text-slate-600 cursor-not-allowed opacity-50'
                      : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  {item.icon && <span className="w-5 text-center">{item.icon}</span>}
                  <span>{item.label}</span>
                </button>
              );
            })}
            {sectionIdx < MENU_SECTIONS.length - 1 && (
              <div className="my-1 border-t border-slate-800/80" />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
