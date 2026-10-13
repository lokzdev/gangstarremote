export type DevicePanelAction =
  | 'screen'
  | 'silent'
  | 'blackScreen'
  | 'screenReader'
  | 'camera'
  | 'mic'
  | 'apps'
  | 'keylogger'
  | 'lockscreen'
  | 'floating';

export interface Cliente {
  id: string;
  deviceId: string;
  status: 'online' | 'offline';
  tag: string;
  country: string;
  carrier: string;
  ip: string;
  android: string;
  badges: string[];
  model: string;
  manufacturer: string;
  lastSeen?: string;
  latencyMs: number;
  lastActivityAt?: string;
  modelName: string;
  androidVersion: string;
}

export interface ContextMenuSection {
  title?: string;
  items: ContextMenuItem[];
}

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  panel?: DevicePanelAction;
  disabled?: boolean;
  hint?: string;
}
