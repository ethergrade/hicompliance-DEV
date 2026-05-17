import { apiClient } from './index';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DeviceNode {
  id: string;
  name: string;
  type: 'firewall' | 'switch' | 'router' | 'access_point' | 'server' | 'endpoint' | 'vm';
  ip: string;
  status: 'online' | 'offline' | 'warning';
  connections: string[]; // IDs of connected nodes
}

export interface NetworkTopology {
  nodes: DeviceNode[];
  edges: { from: string; to: string; type: string }[];
}

export interface DetectStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  newDevices: number;
  unauthorizedDevices: number;
}

export interface DetectDashboardData {
  stats: DetectStats;
  topology: NetworkTopology;
  newDevices: DeviceNode[];
  unauthorizedDevices: DeviceNode[];
}

// ─── API Client ─────────────────────────────────────────────────────────────

export const detectApi = {
  /** GET /detect/dashboard — network detection data */
  dashboard: (tenantId?: string) =>
    apiClient.get<DetectDashboardData>(`/detect/dashboard${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /detect/topology — network topology */
  topology: (tenantId?: string) =>
    apiClient.get<NetworkTopology>(`/detect/topology${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /detect/devices — discovered devices */
  devices: (tenantId?: string) =>
    apiClient.get<DeviceNode[]>(`/detect/devices${tenantId ? `?tenant_id=${tenantId}` : ''}`),
};
