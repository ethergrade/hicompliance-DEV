import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  AssetInventoryResource,
  StoreAssetInventoryRequest,
  UpdateAssetInventoryRequest,
} from "@/types/api";

export const assetInventoryApi = {
  /** Get asset inventory for a specific organization */
  async getByOrganization(organizationId: string): Promise<AssetInventoryResource | null> {
    const res = await apiClient.get<ApiResponse<AssetInventoryResource | null>>(
      `/asset-inventory/${organizationId}`
    );
    return res.data;
  },

  /** Create a new asset inventory record */
  async create(payload: StoreAssetInventoryRequest): Promise<AssetInventoryResource> {
    const res = await apiClient.post<ApiResponse<AssetInventoryResource>>(
      "/asset-inventory",
      payload
    );
    return res.data;
  },

  /** Update an existing asset inventory record */
  async update(id: string, payload: UpdateAssetInventoryRequest): Promise<AssetInventoryResource> {
    const res = await apiClient.put<ApiResponse<AssetInventoryResource>>(
      `/asset-inventory/${id}`,
      payload
    );
    return res.data;
  },

  /** Delete an asset inventory record */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/asset-inventory/${id}`);
  },
};
