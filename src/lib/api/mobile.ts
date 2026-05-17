import { apiClient } from './index';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MobileStats {
  totalDevices: number;
  enrolled: number;
  compliant: number;
  nonCompliant: number;
}

export interface MobileDevice {
  id: string;
  name: string;
  user: string;
  platform: 'iOS' | 'Android' | 'Windows';
  osVersion: string;
  enrollmentStatus: 'Enrolled' | 'Pending' | 'Unenrolled';
  complianceStatus: 'Compliant' | 'Non-Compliant';
  lastSync: string;
  model: string;
  serialNumber?: string;
  policies: number;
  apps: number;
}

export interface MobileDashboardData {
  stats: MobileStats;
  devices: MobileDevice[];
  nonCompliantDevices: MobileDevice[];
  platformBreakdown: { platform: string; count: number }[];
}

// ─── API Client ─────────────────────────────────────────────────────────────

export const mobileApi = {
  /** GET /mobile/dashboard — mobile management data */
  dashboard: (tenantId?: string) =>
    apiClient.get<MobileDashboardData>(`/mobile/dashboard${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /mobile/devices — list mobile devices */
  devices: (tenantId?: string) =>
    apiClient.get<MobileDevice[]>(`/mobile/devices${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** POST /mobile/devices/{id}/wipe — remote wipe */
  wipe: (deviceId: string) =>
    apiClient.post(`/mobile/devices/${deviceId}/wipe`),

  /** POST /mobile/devices/{id}/lock — remote lock */
  lock: (deviceId: string) =>
    apiClient.post(`/mobile/devices/${deviceId}/lock`),
};
