import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types/api';

export interface SurfaceScanAlertApiResource {
  id: string;
  tenant_id: string | null;
  user_id: string;
  alert_email: string;
  alert_types: string[] | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface StoreSurfaceScanAlertRequest {
  alert_email: string;
  alert_types?: string[] | null;
  is_active?: boolean;
}

const groupHeader = (groupId: string) => ({
  headers: { 'X-Group-Id': groupId },
});

const h = (companyId: string, groupId?: string | null) =>
  groupId ? groupHeader(groupId) : groupHeader(companyId);

export const surfaceScanAlertsApi = {
  async list(companyId: string, groupId?: string | null): Promise<SurfaceScanAlertApiResource[]> {
    const res = await apiClient.get<ApiResponse<SurfaceScanAlertApiResource[]>>(
      `/companies/${companyId}/surface-scan-alerts`,
      undefined,
      h(companyId, groupId),
    );
    return res.data;
  },

  async create(companyId: string, payload: StoreSurfaceScanAlertRequest, groupId?: string | null): Promise<SurfaceScanAlertApiResource> {
    const res = await apiClient.post<ApiResponse<SurfaceScanAlertApiResource>>(
      `/companies/${companyId}/surface-scan-alerts`,
      payload,
      h(companyId, groupId),
    );
    return res.data;
  },

  async update(companyId: string, id: string, payload: StoreSurfaceScanAlertRequest, groupId?: string | null): Promise<SurfaceScanAlertApiResource> {
    const res = await apiClient.put<ApiResponse<SurfaceScanAlertApiResource>>(
      `/companies/${companyId}/surface-scan-alerts/${id}`,
      payload,
      h(companyId, groupId),
    );
    return res.data;
  },

  async delete(companyId: string, id: string, groupId?: string | null): Promise<void> {
    await apiClient.delete(`/companies/${companyId}/surface-scan-alerts/${id}`, h(companyId, groupId));
  },
};
