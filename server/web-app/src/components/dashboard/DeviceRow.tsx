import { memo, type MouseEvent } from 'react';
import type { Cliente } from '@/types/dashboard';
import LatencyBadge from './LatencyBadge';

interface DeviceRowProps {
  cliente: Cliente;
  onClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
}

function badgeClass(badge: string): string {
  switch (badge) {
    case 'VNC':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'SILENT':
      return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    case 'HVNC':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    case 'IDLE':
      return 'bg-slate-700/40 text-slate-500 border-slate-600/40';
    default:
      return 'bg-slate-700/40 text-slate-400 border-slate-600/40';
  }
}

function DeviceRow({ cliente, onClick, onContextMenu }: DeviceRowProps) {
  const isOnline = cliente.status === 'online';

  return (
    <tr
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`border-b border-slate-800/80 cursor-pointer transition-colors ${
        isOnline ? 'hover:bg-slate-800/60' : 'opacity-50 hover:bg-slate-900/40'
      }`}
    >
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse' : 'bg-red-500/70'
            }`}
          />
          <LatencyBadge lastActivityAt={cliente.lastActivityAt} isOnline={isOnline} />
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="text-white font-semibold text-sm tracking-wide truncate max-w-[220px] block">
          {cliente.modelName}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="text-cyan-400 font-mono text-sm">{cliente.ip}</span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-md px-2 py-0.5 text-xs text-slate-300">
          <span aria-hidden>🤖</span>
          {cliente.androidVersion}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex flex-wrap gap-1">
          {cliente.badges.map((badge) => (
            <span
              key={badge}
              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${badgeClass(badge)}`}
            >
              {badge}
            </span>
          ))}
          {cliente.badges.length === 0 && (
            <span className="text-slate-600 text-[10px]">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}

function rowPropsEqual(prev: DeviceRowProps, next: DeviceRowProps): boolean {
  const a = prev.cliente;
  const b = next.cliente;
  return (
    a.deviceId === b.deviceId &&
    a.status === b.status &&
    a.ip === b.ip &&
    a.modelName === b.modelName &&
    a.androidVersion === b.androidVersion &&
    a.lastActivityAt === b.lastActivityAt &&
    Math.round(a.latencyMs / 1000) === Math.round(b.latencyMs / 1000) &&
    a.badges.join(',') === b.badges.join(',')
  );
}

export default memo(DeviceRow, rowPropsEqual);
