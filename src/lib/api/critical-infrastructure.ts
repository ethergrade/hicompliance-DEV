import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  CriticalInfrastructureAsset,
} from "@/types/api";

const _h = (companyId: string, groupId?: string | null) => ({
  headers: { "X-Group-Id": groupId || companyId },
});

export const criticalInfrastructureApi = {
  /** List all critical infrastructure assets for a company */
  async list(companyId: string, _g?: string | null): Promise<CriticalInfrastructureAsset[]> {
    const res = await apiClient.get<ApiResponse<CriticalInfrastructureAsset[]>>(
      `/companies/${companyId}/critical-infrastructure`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Create a new critical infrastructure asset */
  async create(companyId: string, payload: Partial<CriticalInfrastructureAsset>, _g?: string | null): Promise<CriticalInfrastructureAsset> {
    const res = await apiClient.post<ApiResponse<CriticalInfrastructureAsset>>(
      `/companies/${companyId}/critical-infrastructure`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Update a critical infrastructure asset */
  async update(companyId: string, assetId: string, payload: Partial<CriticalInfrastructureAsset>, _g?: string | null): Promise<CriticalInfrastructureAsset> {
    const res = await apiClient.put<ApiResponse<CriticalInfrastructureAsset>>(
      `/companies/${companyId}/critical-infrastructure/${assetId}`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Delete a critical infrastructure asset */
  async delete(companyId: string, assetId: string, _g?: string | null): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/critical-infrastructure/${assetId}`,
      _h(companyId, _g)
    );
  },
};
