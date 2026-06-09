import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

const groupHeader = (groupId: string) => ({
  headers: { "X-Group-Id": groupId },
});

export type LifecycleAction = "pause_all_services" | "resume_all_services" | "delete_client";

export interface LifecycleResponse {
  ok: boolean;
  message: string;
}

export const lifecycleApi = {
  /**
   * Execute a client lifecycle action.
   * Only super-admins can invoke these actions.
   */
  async execute(
    companyId: string,
    action: LifecycleAction,
    groupId?: string | null,
  ): Promise<LifecycleResponse> {
    const res = await complianceApiClient.post<ApiResponse<LifecycleResponse>>(
      `/companies/${companyId}/lifecycle`,
      { action },
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },
};
