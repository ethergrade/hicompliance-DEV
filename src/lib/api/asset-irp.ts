import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  AssetIrpItem,
} from "@/types/api";

const _h = (companyId: string, groupId?: string | null) => ({
  headers: { "X-Group-Id": groupId || companyId },
});

export const assetIrpApi = {
  /** List all asset IRP entries for a company */
  async list(companyId: string, _g?: string | null): Promise<AssetIrpItem[]> {
    const res = await apiClient.get<ApiResponse<AssetIrpItem[]>>(
      `/companies/${companyId}/asset-irp`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Sync asset IRP entries */
  async sync(companyId: string, _g?: string | null): Promise<AssetIrpItem[]> {
    const res = await apiClient.post<ApiResponse<AssetIrpItem[]>>(
      `/companies/${companyId}/asset-irp/sync`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Update an asset IRP entry */
  async update(companyId: string, assetIrpId: string, payload: Partial<AssetIrpItem>, _g?: string | null): Promise<AssetIrpItem> {
    const res = await apiClient.put<ApiResponse<AssetIrpItem>>(
      `/companies/${companyId}/asset-irp/${assetIrpId}`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },
};
