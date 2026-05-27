import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  AssetInventoryV2Payload,
  AssetInventoryV2Resource,
} from "@/types/api";

const groupHeader = (companyId: string) => ({
  headers: { "X-Group-Id": companyId },
});

export const assetInventoryV2Api = {
  /** GET /companies/{company}/asset-inventory — returns null if not yet filled */
  async get(companyId: string): Promise<AssetInventoryV2Resource | null> {
    const res = await apiClient.get<ApiResponse<AssetInventoryV2Resource | null>>(
      `/companies/${companyId}/asset-inventory`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** PUT /companies/{company}/asset-inventory — upsert */
  async upsert(companyId: string, payload: AssetInventoryV2Payload): Promise<AssetInventoryV2Resource> {
    const res = await apiClient.put<ApiResponse<AssetInventoryV2Resource>>(
      `/companies/${companyId}/asset-inventory`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },
};
