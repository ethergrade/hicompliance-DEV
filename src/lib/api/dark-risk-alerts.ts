import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  DarkRiskAlert,
  StoreDarkRiskAlertRequest,
  UpdateDarkRiskAlertRequest,
} from "@/types/api";

const groupHeader = (groupId: string) => ({
  headers: { "X-Group-Id": groupId },
});

const h = (companyId: string, groupId?: string | null) => {
  const id = groupId || companyId;
  return id ? groupHeader(id) : undefined;
};

const prefix = (companyId: string | null) =>
  companyId ? `/companies/${companyId}` : "";

export const darkRiskAlertsApi = {
  async list(companyId?: string | null, groupId?: string | null): Promise<DarkRiskAlert[]> {
    const endpoint = companyId
      ? `/companies/${companyId}/dark-risk-alerts`
      : "/dark-risk-alerts";
    const res = await apiClient.get<ApiResponse<DarkRiskAlert[]>>(endpoint, undefined, h(companyId, groupId));
    return res.data;
  },

  async get(companyId: string | null, id: string, groupId?: string | null): Promise<DarkRiskAlert> {
    const res = await apiClient.get<ApiResponse<DarkRiskAlert>>(
      `${prefix(companyId)}/dark-risk-alerts/${id}`,
      undefined,
      h(companyId, groupId)
    );
    return res.data;
  },

  async create(companyId: string | null, payload: StoreDarkRiskAlertRequest, groupId?: string | null): Promise<DarkRiskAlert> {
    const res = await apiClient.post<ApiResponse<DarkRiskAlert>>(
      `${prefix(companyId)}/dark-risk-alerts`,
      payload,
      h(companyId, groupId)
    );
    return res.data;
  },

  async update(companyId: string | null, id: string, payload: UpdateDarkRiskAlertRequest, groupId?: string | null): Promise<DarkRiskAlert> {
    const res = await apiClient.put<ApiResponse<DarkRiskAlert>>(
      `${prefix(companyId)}/dark-risk-alerts/${id}`,
      payload,
      h(companyId, groupId)
    );
    return res.data;
  },

  async delete(companyId: string | null, id: string, groupId?: string | null): Promise<void> {
    await apiClient.delete(`${prefix(companyId)}/dark-risk-alerts/${id}`, h(companyId, groupId));
  },
};
