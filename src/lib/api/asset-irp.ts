import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  AssetIrpItem,
} from "@/types/api";

const groupHeader = (companyId: string) => ({
  headers: { "X-Group-Id": companyId },
});

export const assetIrpApi = {
  /** List all asset IRP entries for a company */
  async list(companyId: string): Promise<AssetIrpItem[]> {
    const res = await apiClient.get<ApiResponse<AssetIrpItem[]>>(
      `/companies/${companyId}/asset-irp`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Sync asset IRP entries */
  async sync(companyId: string): Promise<AssetIrpItem[]> {
    const res = await apiClient.post<ApiResponse<AssetIrpItem[]>>(
      `/companies/${companyId}/asset-irp/sync`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Update an asset IRP entry */
  async update(companyId: string, assetIrpId: string, payload: Partial<AssetIrpItem>): Promise<AssetIrpItem> {
    const res = await apiClient.put<ApiResponse<AssetIrpItem>>(
      `/companies/${companyId}/asset-irp/${assetIrpId}`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },
};
