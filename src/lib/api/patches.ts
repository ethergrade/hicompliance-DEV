import { apiClient } from './index';

// ─── Types (matching dashboard mock data structures) ────────────────────────

export interface OsPatch {
  systemName: string;
  patch: string;
  description: string;
  kbNumber: string;
  severity: 'Low' | 'Medium' | 'Important' | 'Critical';
}

export interface OsPatchInstalled extends OsPatch {
  status: 'Installed' | 'Failed' | 'Pending';
}

export interface SoftwarePatch {
  systemName: string;
  patch: string;
  description: string;
  impact: 'Low' | 'Medium' | 'Important' | 'Critical';
  status: 'Available' | 'Rejected' | 'Pending';
}

export interface SoftwarePatchInstalled {
  systemName: string;
  product: string;
  type: string;
  status: 'Installed' | 'Failed' | 'Pending';
}

export interface PatchStats {
  osPending: number;
  osInstalled: number;
  softwareAvailable: number;
  softwareInstalled: number;
  failedPatches: number;
}

export interface PatchDashboardData {
  stats: PatchStats;
  osPatchesPending: OsPatch[];
  osPatchesInstalled: OsPatchInstalled[];
  softwarePatchesAvailable: SoftwarePatch[];
  softwarePatchesInstalled: SoftwarePatchInstalled[];
}

// ─── API Client ─────────────────────────────────────────────────────────────

export const patchesApi = {
  /** GET /patches/dashboard — aggregated patch data for the current tenant */
  dashboard: (tenantId?: string) =>
    apiClient.get<PatchDashboardData>(`/patches/dashboard${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /patches/os — OS-level patches */
  osPatches: (tenantId?: string) =>
    apiClient.get<OsPatch[]>(`/patches/os${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /patches/software — Software-level patches */
  softwarePatches: (tenantId?: string) =>
    apiClient.get<SoftwarePatch[]>(`/patches/software${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** POST /patches/deploy — Deploy patches to endpoints */
  deploy: (patchIds: string[], endpointIds: string[]) =>
    apiClient.post('/patches/deploy', { patch_ids: patchIds, endpoint_ids: endpointIds }),

  /** POST /patches/{id}/approve — Approve a patch */
  approve: (patchId: string) =>
    apiClient.post(`/patches/${patchId}/approve`),
};
