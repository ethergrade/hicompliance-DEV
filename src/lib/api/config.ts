import { apiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

export const configApi = {
  /** Assignable roles for tenant users */
  async roles(): Promise<string[]> {
    const res = await apiClient.get<ApiResponse<string[]>>("/config/roles");
    return res.data;
  },

  /** Assessment status map */
  async assessmentStatuses(): Promise<string[]> {
    const res = await apiClient.get<ApiResponse<string[]>>("/config/assessment-statuses");
    return res.data;
  },
};
