import { apiClient } from './index';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EndpointStats {
  totalEndpoints: number;
  protectedEndpoints: number;
  atRiskEndpoints: number;
  onlineEndpoints: number;
  offlineEndpoints: number;
  pendingUpdates: number;
}

export interface EndpointDevice {
  id: string;
  name: string;
  type: 'Workstation' | 'Laptop' | 'Server' | 'Mobile';
  os: string;
  status: 'Online' | 'Offline' | 'Warning' | 'Critical';
  lastSeen: string;
  protection: 'Protected' | 'At Risk' | 'Unknown' | 'Outdated';
  threats: number;
  compliance: number;
}

export interface EndpointThreat {
  id: string;
  endpoint: string;
  threatName: string;
  type: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  detectedAt: string;
  status: 'Quarantined' | 'Removed' | 'Blocked' | 'Patched' | 'Pending';
}

export interface PendingUpdate {
  endpoint: string;
  currentVersion: string;
  latestVersion: string;
  component: string;
  daysOutdated: number;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface EndpointDashboardData {
  stats: EndpointStats;
  endpoints: EndpointDevice[];
  recentThreats: EndpointThreat[];
  pendingUpdates: PendingUpdate[];
}

// ─── API Client ─────────────────────────────────────────────────────────────

export const endpointsApi = {
  /** GET /endpoints/dashboard — aggregated endpoint data */
  dashboard: (tenantId?: string) =>
    apiClient.get<EndpointDashboardData>(`/endpoints/dashboard${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /endpoints — list endpoints */
  list: (tenantId?: string) =>
    apiClient.get<EndpointDevice[]>(`/endpoints${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /endpoints/{id} — single endpoint detail */
  get: (endpointId: string) =>
    apiClient.get<EndpointDevice>(`/endpoints/${endpointId}`),

  /** GET /endpoints/threats — recent endpoint threats */
  threats: (tenantId?: string) =>
    apiClient.get<EndpointThreat[]>(`/endpoints/threats${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** POST /endpoints/{id}/scan — trigger scan on endpoint */
  scan: (endpointId: string) =>
    apiClient.post(`/endpoints/${endpointId}/scan`),
};
