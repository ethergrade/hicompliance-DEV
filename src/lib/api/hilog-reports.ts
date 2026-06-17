import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

const groupHeader = (groupId: string) => ({
  headers: { "X-Group-Id": groupId },
});

export interface CorrelationReport {
  id: string;
  title: string;
  description: string | null;
  time_range_label: string;
  time_range_days: number;
  events_count: number;
  format: string;
  status: string;
  report_data: Record<string, unknown>[];
  filter_config: Record<string, unknown>;
  created_at: string;
  organization_id: string | null;
  user_id: string;
}

export interface StoreHilogCorrelationReportRequest {
  organization_id?: string;
  title: string;
  description?: string;
  time_range_label: string;
  time_range_days: number;
  events_count: number;
  format: string;
  status: string;
  report_data: Record<string, unknown>[];
  filter_config: Record<string, unknown>;
}

/** Extract array from API response — handles both plain arrays and Laravel paginated {data:[]...} */
const extractArray = <T>(data: unknown): T[] => {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "data" in data && Array.isArray((data as Record<string, unknown>).data)) {
    return (data as Record<string, unknown>).data as T[];
  }
  return [];
};

export const hilogReportsApi = {
  /** List correlation reports for a company */
  async list(
    companyId: string,
    params?: { page?: number },
    groupId?: string | null,
  ): Promise<CorrelationReport[]> {
    const res = await complianceApiClient.get<ApiResponse<CorrelationReport[]>>(
      `/companies/${companyId}/hilog-reports`,
      params,
      groupId ? groupHeader(groupId) : undefined,
    );
    return extractArray<CorrelationReport>(res.data);
  },

  /** Get a single correlation report */
  async get(
    companyId: string,
    reportId: string,
    groupId?: string | null,
  ): Promise<CorrelationReport> {
    const res = await complianceApiClient.get<ApiResponse<CorrelationReport>>(
      `/companies/${companyId}/hilog-reports/${reportId}`,
      undefined,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  /** Create a new correlation report */
  async create(
    companyId: string,
    payload: StoreHilogCorrelationReportRequest,
    groupId?: string | null,
  ): Promise<CorrelationReport> {
    const res = await complianceApiClient.post<ApiResponse<CorrelationReport>>(
      `/companies/${companyId}/hilog-reports`,
      payload,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  /** Delete a correlation report */
  async delete(
    companyId: string,
    reportId: string,
    groupId?: string | null,
  ): Promise<void> {
    await complianceApiClient.delete(
      `/companies/${companyId}/hilog-reports/${reportId}`,
      groupId ? groupHeader(groupId) : undefined,
    );
  },
};
