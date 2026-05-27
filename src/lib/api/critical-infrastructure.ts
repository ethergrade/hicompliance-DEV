import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  CriticalInfrastructureAsset,
} from "@/types/api";

const groupHeader = (companyId: string) => ({
  headers: { "X-Group-Id": companyId },
});

export const criticalInfrastructureApi = {
  /** List all critical infrastructure assets for a company */
  async list(companyId: string): Promise<CriticalInfrastructureAsset[]> {
    const res = await apiClient.get<ApiResponse<CriticalInfrastructureAsset[]>>(
      `/companies/${companyId}/critical-infrastructure`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Create a new critical infrastructure asset */
  async create(companyId: string, payload: Partial<CriticalInfrastructureAsset>): Promise<CriticalInfrastructureAsset> {
    const res = await apiClient.post<ApiResponse<CriticalInfrastructureAsset>>(
      `/companies/${companyId}/critical-infrastructure`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Update a critical infrastructure asset */
  async update(companyId: string, assetId: string, payload: Partial<CriticalInfrastructureAsset>): Promise<CriticalInfrastructureAsset> {
    const res = await apiClient.put<ApiResponse<CriticalInfrastructureAsset>>(
      `/companies/${companyId}/critical-infrastructure/${assetId}`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Delete a critical infrastructure asset */
  async delete(companyId: string, assetId: string): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/critical-infrastructure/${assetId}`,
      groupHeader(companyId)
    );
  },
};
