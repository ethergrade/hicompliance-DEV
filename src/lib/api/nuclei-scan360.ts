import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

const groupHeader = (groupId: string) => ({
  headers: { "X-Group-Id": groupId },
});

export interface NucleiScanJob {
  id: string;
  target: string;
  template_tags?: string[];
  severity_filter?: string[];
  status: "queued" | "running" | "completed" | "failed";
  started_at: string | null;
  completed_at: string | null;
  summary?: Record<string, any>;
}

export const nucleiScan360Api = {
  async listJobs(
    companyId: string,
    params?: { page?: number },
    groupId?: string | null,
  ): Promise<NucleiScanJob[]> {
    const res = await complianceApiClient.get<ApiResponse<NucleiScanJob[]>>(
      `/companies/${companyId}/nuclei-scan360/jobs`,
      params,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async createJob(
    companyId: string,
    payload: {
      target_url: string;
      profile: 'baseline_headers' | 'exposure_medium' | 'web_vuln_safe' | 'web_vuln_authorized';
      template_tags?: string[];
      severity_filter?: string[];
    },
    groupId?: string | null,
  ): Promise<NucleiScanJob> {
    const res = await complianceApiClient.post<ApiResponse<NucleiScanJob>>(
      `/companies/${companyId}/nuclei-scan360/jobs`,
      payload,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async getJob(companyId: string, jobId: string, groupId?: string | null): Promise<NucleiScanJob> {
    const res = await complianceApiClient.get<ApiResponse<NucleiScanJob>>(
      `/companies/${companyId}/nuclei-scan360/jobs/${jobId}`,
      undefined,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async getJobFindings(
    companyId: string,
    jobId: string,
    params?: { severity?: string; page?: number },
    groupId?: string | null,
  ): Promise<any[]> {
    const res = await complianceApiClient.get<ApiResponse<any[]>>(
      `/companies/${companyId}/nuclei-scan360/jobs/${jobId}/findings`,
      params,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },
};
