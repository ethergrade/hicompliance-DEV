import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  ConsistenzeItem,
  ConsistenzeSummary,
} from "@/types/api";

const groupHeader = (companyId: string) => ({
  headers: { "X-Group-Id": companyId },
});

export const consistenzeApi = {
  /** List all items for a company */
  async items(companyId: string): Promise<ConsistenzeItem[]> {
    const res = await apiClient.get<ApiResponse<ConsistenzeItem[]>>(
      `/companies/${companyId}/consistenze/items`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Create a new item */
  async createItem(companyId: string, payload: Partial<ConsistenzeItem>): Promise<ConsistenzeItem> {
    const res = await apiClient.post<ApiResponse<ConsistenzeItem>>(
      `/companies/${companyId}/consistenze/items`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Update an item */
  async updateItem(companyId: string, itemId: string, payload: Partial<ConsistenzeItem>): Promise<ConsistenzeItem> {
    const res = await apiClient.put<ApiResponse<ConsistenzeItem>>(
      `/companies/${companyId}/consistenze/items/${itemId}`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Delete an item */
  async deleteItem(companyId: string, itemId: string): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/consistenze/items/${itemId}`,
      groupHeader(companyId)
    );
  },

  /** Get summary for a company */
  async summary(companyId: string): Promise<ConsistenzeSummary> {
    const res = await apiClient.get<ApiResponse<ConsistenzeSummary>>(
      `/companies/${companyId}/consistenze/summary`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Update summary for a company */
  async updateSummary(companyId: string, payload: Partial<ConsistenzeSummary>): Promise<ConsistenzeSummary> {
    const res = await apiClient.put<ApiResponse<ConsistenzeSummary>>(
      `/companies/${companyId}/consistenze/summary`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },
};
