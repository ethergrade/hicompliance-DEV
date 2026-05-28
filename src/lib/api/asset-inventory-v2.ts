import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  AssetInventoryV2Payload,
  AssetInventoryV2Resource,
} from "@/types/api";

const _h = (companyId: string, groupId?: string | null) => ({
  headers: { "X-Group-Id": groupId || companyId },
});

export const assetInventoryV2Api = {
  /** GET /companies/{company}/asset-inventory — returns null if not yet filled */
  async get(companyId: string, _g?: string | null): Promise<AssetInventoryV2Resource | null> {
    const res = await apiClient.get<ApiResponse<AssetInventoryV2Resource | null>>(
      `/companies/${companyId}/asset-inventory`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** PUT /companies/{company}/asset-inventory — upsert */
  async upsert(companyId: string, payload: AssetInventoryV2Payload, _g?: string | null): Promise<AssetInventoryV2Resource> {
    const res = await apiClient.put<ApiResponse<AssetInventoryV2Resource>>(
      `/companies/${companyId}/asset-inventory`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },
};
