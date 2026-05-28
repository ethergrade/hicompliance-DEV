import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  ConsistenzeItem,
  ConsistenzeSummary,
} from "@/types/api";

const _h = (companyId: string, groupId?: string | null) => ({
  headers: { "X-Group-Id": groupId || companyId },
});

export const consistenzeApi = {
  /** List all items for a company */
  async items(companyId: string, _g?: string | null): Promise<ConsistenzeItem[]> {
    const res = await apiClient.get<ApiResponse<ConsistenzeItem[]>>(
      `/companies/${companyId}/consistenze/items`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Create a new item */
  async createItem(companyId: string, payload: Partial<ConsistenzeItem>, _g?: string | null): Promise<ConsistenzeItem> {
    const res = await apiClient.post<ApiResponse<ConsistenzeItem>>(
      `/companies/${companyId}/consistenze/items`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Update an item */
  async updateItem(companyId: string, itemId: string, payload: Partial<ConsistenzeItem>, _g?: string | null): Promise<ConsistenzeItem> {
    const res = await apiClient.put<ApiResponse<ConsistenzeItem>>(
      `/companies/${companyId}/consistenze/items/${itemId}`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Delete an item */
  async deleteItem(companyId: string, itemId: string, _g?: string | null): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/consistenze/items/${itemId}`,
      _h(companyId, _g)
    );
  },

  /** Get summary for a company */
  async summary(companyId: string, _g?: string | null): Promise<ConsistenzeSummary> {
    const res = await apiClient.get<ApiResponse<ConsistenzeSummary>>(
      `/companies/${companyId}/consistenze/summary`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Update summary for a company */
  async updateSummary(companyId: string, payload: Partial<ConsistenzeSummary>, _g?: string | null): Promise<ConsistenzeSummary> {
    const res = await apiClient.put<ApiResponse<ConsistenzeSummary>>(
      `/companies/${companyId}/consistenze/summary`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },
};
