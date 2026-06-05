import { apiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

const groupHeader = (groupId: string) => ({
  headers: { "X-Group-Id": groupId },
});

export interface DarkRiskTarget {
  id: string;
  tenant_id: string;
  group_id: string;
  scope: string;
  label?: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DarkRiskNotificationConfig {
  alert_on_new_findings: boolean;
  alert_severity_threshold: string;
  min_new_findings_to_alert: number;
  weekly_summary_enabled: boolean;
  recipient_emails: string[];
}

export const darkRiskApi = {
  // Targets
  async listTargets(companyId: string, groupId?: string | null): Promise<DarkRiskTarget[]> {
    const res = await apiClient.get<ApiResponse<DarkRiskTarget[]>>(
      `/companies/${companyId}/darkrisk/targets`,
      undefined,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async createTargetsBatch(
    companyId: string,
    payload: { scope: string[]; label?: string },
    groupId?: string | null,
  ): Promise<DarkRiskTarget[]> {
    const res = await apiClient.post<ApiResponse<DarkRiskTarget[]>>(
      `/companies/${companyId}/darkrisk/targets/batch`,
      payload,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async previewTargets(
    companyId: string,
    payload: { scope: string[] },
    groupId?: string | null,
  ): Promise<DarkRiskTarget[]> {
    const res = await apiClient.post<ApiResponse<DarkRiskTarget[]>>(
      `/companies/${companyId}/darkrisk/targets/preview`,
      payload,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async updateTarget(
    companyId: string,
    targetId: string,
    payload: { label?: string; enabled?: boolean },
    groupId?: string | null,
  ): Promise<DarkRiskTarget> {
    const res = await apiClient.put<ApiResponse<DarkRiskTarget>>(
      `/companies/${companyId}/darkrisk/targets/${targetId}`,
      payload,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async deleteTarget(companyId: string, targetId: string, groupId?: string | null): Promise<void> {
    await apiClient.delete<ApiResponse<void>>(
      `/companies/${companyId}/darkrisk/targets/${targetId}`,
      groupId ? groupHeader(groupId) : undefined,
    );
  },

  async toggleTarget(companyId: string, targetId: string, groupId?: string | null): Promise<DarkRiskTarget> {
    const res = await apiClient.patch<ApiResponse<DarkRiskTarget>>(
      `/companies/${companyId}/darkrisk/targets/${targetId}/toggle`,
      {},
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  // Notification config
  async getNotificationConfig(companyId: string, groupId?: string | null): Promise<DarkRiskNotificationConfig> {
    const res = await apiClient.get<ApiResponse<DarkRiskNotificationConfig>>(
      `/companies/${companyId}/darkrisk/notification-config`,
      undefined,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async updateNotificationConfig(
    companyId: string,
    payload: Partial<DarkRiskNotificationConfig>,
    groupId?: string | null,
  ): Promise<DarkRiskNotificationConfig> {
    const res = await apiClient.put<ApiResponse<DarkRiskNotificationConfig>>(
      `/companies/${companyId}/darkrisk/notification-config`,
      payload,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },
};
