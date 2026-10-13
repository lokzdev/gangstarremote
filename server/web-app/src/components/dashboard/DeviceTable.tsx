import type { MouseEvent } from 'react';
import type { Cliente } from '@/types/dashboard';
import DeviceRow from './DeviceRow';

interface DeviceTableProps {
  clientes: Cliente[];
  loading: boolean;
  onRowClick: (cliente: Cliente) => void;
  onRowContextMenu: (event: MouseEvent, cliente: Cliente) => void;
  onCreateApk?: () => void;
}

export default function DeviceTable({
  clientes,
  loading,
  onRowClick,
  onRowContextMenu,
  onCreateApk,
}: DeviceTableProps) {
  if (loading && clientes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mb-4" />
        <p>Carregando dispositivos...</p>
      </div>
    );
  }

  if (clientes.length === 0) {
    return (
      <div className="bg-slate-950 rounded-xl border border-slate-800 p-12 text-center">
        <p className="text-white font-semibold text-lg mb-2">Nenhum dispositivo</p>
        <p className="text-slate-400 text-sm mb-6">Aguardando conexões ou registre um novo APK.</p>
        {onCreateApk && (
          <button
            type="button"
            onClick={onCreateApk}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm"
          >
            Criar APK
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="bg-slate-900/90 text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800">
            <th className="px-3 py-2.5 font-semibold">Status / Latência</th>
            <th className="px-3 py-2.5 font-semibold">Modelo</th>
            <th className="px-3 py-2.5 font-semibold">IP</th>
            <th className="px-3 py-2.5 font-semibold">Android</th>
            <th className="px-3 py-2.5 font-semibold">Features</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((cliente) => (
            <DeviceRow
              key={cliente.deviceId}
              cliente={cliente}
              onClick={() => onRowClick(cliente)}
              onContextMenu={(e) => onRowContextMenu(e, cliente)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
