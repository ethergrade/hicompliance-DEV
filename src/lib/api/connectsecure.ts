import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

const groupHeader = (groupId: string) => ({
  headers: { "X-Group-Id": groupId },
});

export const connectSecureApi = {
  async getDomains(companyId: string, groupId?: string | null): Promise<unknown[]> {
    const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
      `/companies/${companyId}/connectsecure/domains`,
      undefined,
      groupId ? groupHeader(groupId) : undefined,
    );
    return Array.isArray(res.data) ? res.data : [];
  },

  async getConfig(companyId: string, groupId?: string | null): Promise<Record<string, unknown>> {
    const res = await complianceApiClient.get<ApiResponse<Record<string, unknown>>>(
      `/companies/${companyId}/connectsecure/config`,
      undefined,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data ?? {};
  },

  async updateConfig(
    companyId: string,
    groupId: string | null | undefined,
    data: {
      pod_host: string;
      company_id: string;
      client_auth_token?: string;
      enabled?: boolean;
    },
  ): Promise<void> {
    await complianceApiClient.put<ApiResponse<unknown>>(
      `/companies/${companyId}/connectsecure/config`,
      data,
      groupId ? groupHeader(groupId) : undefined,
    );
  },

  async scan(
    companyId: string,
    groupId: string | null | undefined,
    action: "test_auth" | "scan",
  ): Promise<{ ok: boolean; user_id?: string | null; error?: string | null; triggered?: number }> {
    const res = await complianceApiClient.post<ApiResponse<{ ok: boolean; user_id?: string | null; error?: string | null; triggered?: number }>>(
      `/companies/${companyId}/connectsecure/scan`,
      { action },
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data ?? { ok: false };
  },

  async sweepAll(groupId?: string | null): Promise<{ ok: boolean; orgs_swept: number; results: unknown[] }> {
    const res = await complianceApiClient.post<ApiResponse<{ ok: boolean; orgs_swept: number; results: unknown[] }>>(
      "/admin/surfacescan/connectsecure/sweep",
      {},
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data ?? { ok: false, orgs_swept: 0, results: [] };
  },
};
