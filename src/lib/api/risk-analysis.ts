import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  RiskAnalysisItem,
  StoreRiskAnalysisRequest,
  UpdateRiskAnalysisRequest,
} from "@/types/api";

const groupHeader = (companyId: string) => ({
  headers: { "X-Group-Id": companyId },
});

export const riskAnalysisApi = {
  async list(companyId: string): Promise<RiskAnalysisItem[]> {
    const res = await apiClient.get<ApiResponse<RiskAnalysisItem[]>>(
      `/companies/${companyId}/risk-analysis`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  async get(companyId: string, id: string): Promise<RiskAnalysisItem> {
    const res = await apiClient.get<ApiResponse<RiskAnalysisItem>>(
      `/companies/${companyId}/risk-analysis/${id}`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  async create(companyId: string, payload: StoreRiskAnalysisRequest): Promise<RiskAnalysisItem> {
    const res = await apiClient.post<ApiResponse<RiskAnalysisItem>>(
      `/companies/${companyId}/risk-analysis`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  async update(companyId: string, id: string, payload: UpdateRiskAnalysisRequest): Promise<RiskAnalysisItem> {
    const res = await apiClient.put<ApiResponse<RiskAnalysisItem>>(
      `/companies/${companyId}/risk-analysis/${id}`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  async delete(companyId: string, id: string): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/risk-analysis/${id}`,
      groupHeader(companyId)
    );
  },
};
