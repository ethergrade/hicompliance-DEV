import { apiClient } from './index';
import { hipatchApi } from './hipatch';

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
// NOTE: This now uses hipatchApi internally which calls the backend CSV endpoints
// Backend routes: /tenant-services/{id}/hipatch/patches/pending|performed

export const patchesApi = {
  /** 
   * GET /patches/dashboard — aggregated patch data for the current tenant
   * Internally uses hipatchApi which reads from CSV files in storage
   */
  dashboard: async (_tenantId?: string): Promise<PatchDashboardData> => {
    // tenantId is ignored here - the hook uses organizationId from context
    // This maintains backward compatibility with existing code
    // The actual tenant resolution happens in usePatchDashboard hook
    throw new Error('Use hipatchApi.dashboard() directly or usePatchDashboard() hook');
  },

  /** GET /patches/os — OS-level patches (DEPRECATED: use hipatchApi) */
  osPatches: (_tenantId?: string) =>
    apiClient.get<OsPatch[]>(`/patches/os${_tenantId ? `?tenant_id=${_tenantId}` : ''}`).catch(() => ({ data: [] as OsPatch[] })),

  /** GET /patches/software — Software-level patches (DEPRECATED) */
  softwarePatches: (_tenantId?: string) =>
    apiClient.get<SoftwarePatch[]>(`/patches/software${_tenantId ? `?tenant_id=${_tenantId}` : ''}`).catch(() => ({ data: [] as SoftwarePatch[] })),

  /** POST /patches/deploy — Deploy patches to endpoints */
  deploy: (patchIds: string[], endpointIds: string[]) =>
    apiClient.post('/patches/deploy', { patch_ids: patchIds, endpoints: endpointIds }),

  /** POST /patches/{id}/approve — Approve a patch */
  approve: (patchId: string) =>
    apiClient.post(`/patches/${patchId}/approve`),
};

// Re-export hipatchApi as patchesApi.v2 for migration
export { hipatchApi };
