import { apiClient } from './index';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TrackStats {
  totalAssets: number;
  compliantAssets: number;
  nonCompliantAssets: number;
  pendingReview: number;
}

export interface TrackAsset {
  id: string;
  name: string;
  type: 'policy' | 'procedure' | 'control' | 'evidence' | 'certificate';
  status: 'Compliant' | 'Non-Compliant' | 'Pending' | 'Expired' | 'Review';
  lastReview: string;
  nextReview: string;
  owner: string;
  framework: string; // e.g. 'NIS2', 'ISO27001', 'GDPR'
  notes?: string;
}

export interface TrackDashboardData {
  stats: TrackStats;
  assets: TrackAsset[];
  upcomingReviews: TrackAsset[];
  expiredItems: TrackAsset[];
  complianceByFramework: { framework: string; compliant: number; total: number }[];
}

// ─── API Client ─────────────────────────────────────────────────────────────

export const trackApi = {
  /** GET /track/dashboard — compliance tracking data */
  dashboard: (tenantId?: string) =>
    apiClient.get<TrackDashboardData>(`/track/dashboard${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /track/assets — list tracked assets */
  assets: (params?: { tenantId?: string; framework?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.tenantId) qs.set('tenant_id', params.tenantId);
    if (params?.framework) qs.set('framework', params.framework);
    if (params?.status) qs.set('status', params.status);
    const query = qs.toString();
    return apiClient.get<TrackAsset[]>(`/track/assets${query ? `?${query}` : ''}`);
  },

  /** PUT /track/assets/{id} — update an asset */
  updateAsset: (assetId: string, data: Partial<TrackAsset>) =>
    apiClient.put(`/track/assets/${assetId}`, data),
};
