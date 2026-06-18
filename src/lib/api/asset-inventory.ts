import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  AssetInventoryResource,
  StoreAssetInventoryRequest,
  UpdateAssetInventoryRequest,
} from "@/types/api";

const groupHeader = (groupId?: string) => ({ headers: groupId ? { "X-Group-Id": groupId } : {} });

export const assetInventoryApi = {
  /** Get asset inventory for a specific organization */
  async getByOrganization(organizationId: string, groupId?: string): Promise<AssetInventoryResource | null> {
    const res = await apiClient.get<ApiResponse<AssetInventoryResource | null>>(
      `/companies/${organizationId}/asset-inventory`,
 undefined,
      groupHeader(groupId)
    );
    return res.data;
  },

  /** Create a new asset inventory record */
  async create(payload: StoreAssetInventoryRequest, groupId?: string): Promise<AssetInventoryResource> {
    const res = await apiClient.post<ApiResponse<AssetInventoryResource>>(
      `/companies/${payload.organization_id}/asset-inventory`,
      payload,
      groupHeader(groupId)
    );
    return res.data;
  },

  /** Update an existing asset inventory record */
  async update(id: string, payload: UpdateAssetInventoryRequest, groupId?: string): Promise<AssetInventoryResource> {
    const res = await apiClient.put<ApiResponse<AssetInventoryResource>>(
      `/companies/${id}/asset-inventory`,
      payload,
      groupHeader(groupId)
    );
    return res.data;
  },

  /** Delete an asset inventory record */
  async delete(id: string, groupId?: string): Promise<void> {
    await apiClient.delete(
      `/companies/${id}/asset-inventory`,
      groupHeader(groupId)
    );
  },
};
