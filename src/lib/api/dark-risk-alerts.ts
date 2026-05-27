import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  DarkRiskAlert,
  StoreDarkRiskAlertRequest,
  UpdateDarkRiskAlertRequest,
} from "@/types/api";

export const darkRiskAlertsApi = {
  async list(companyId?: string | null): Promise<DarkRiskAlert[]> {
    const endpoint = companyId
      ? `/companies/${companyId}/dark-risk-alerts`
      : "/dark-risk-alerts";
    const res = await apiClient.get<ApiResponse<DarkRiskAlert[]>>(endpoint);
    return res.data;
  },

  async get(companyId: string | null, id: string): Promise<DarkRiskAlert> {
    const prefix = companyId ? `/companies/${companyId}` : "";
    const res = await apiClient.get<ApiResponse<DarkRiskAlert>>(
      `${prefix}/dark-risk-alerts/${id}`
    );
    return res.data;
  },

  async create(companyId: string | null, payload: StoreDarkRiskAlertRequest): Promise<DarkRiskAlert> {
    const prefix = companyId ? `/companies/${companyId}` : "";
    const res = await apiClient.post<ApiResponse<DarkRiskAlert>>(
      `${prefix}/dark-risk-alerts`,
      payload
    );
    return res.data;
  },

  async update(companyId: string | null, id: string, payload: UpdateDarkRiskAlertRequest): Promise<DarkRiskAlert> {
    const prefix = companyId ? `/companies/${companyId}` : "";
    const res = await apiClient.put<ApiResponse<DarkRiskAlert>>(
      `${prefix}/dark-risk-alerts/${id}`,
      payload
    );
    return res.data;
  },

  async delete(companyId: string | null, id: string): Promise<void> {
    const prefix = companyId ? `/companies/${companyId}` : "";
    await apiClient.delete(`${prefix}/dark-risk-alerts/${id}`);
  },
};
