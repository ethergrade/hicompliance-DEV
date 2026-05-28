import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  RiskAnalysisItem,
  StoreRiskAnalysisRequest,
  UpdateRiskAnalysisRequest,
} from "@/types/api";

const _h = (companyId: string, groupId?: string | null) => ({
  headers: { "X-Group-Id": groupId || companyId },
});

export const riskAnalysisApi = {
  async list(companyId: string, _g?: string | null): Promise<RiskAnalysisItem[]> {
    const res = await apiClient.get<ApiResponse<RiskAnalysisItem[]>>(
      `/companies/${companyId}/risk-analysis`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  async get(companyId: string, id: string, _g?: string | null): Promise<RiskAnalysisItem> {
    const res = await apiClient.get<ApiResponse<RiskAnalysisItem>>(
      `/companies/${companyId}/risk-analysis/${id}`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  async create(companyId: string, payload: StoreRiskAnalysisRequest, _g?: string | null): Promise<RiskAnalysisItem> {
    const res = await apiClient.post<ApiResponse<RiskAnalysisItem>>(
      `/companies/${companyId}/risk-analysis`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  async update(companyId: string, id: string, payload: UpdateRiskAnalysisRequest, _g?: string | null): Promise<RiskAnalysisItem> {
    const res = await apiClient.put<ApiResponse<RiskAnalysisItem>>(
      `/companies/${companyId}/risk-analysis/${id}`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  async delete(companyId: string, id: string, _g?: string | null): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/risk-analysis/${id}`,
      _h(companyId, _g)
    );
  },
};
