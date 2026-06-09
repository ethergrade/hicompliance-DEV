import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

const groupHeader = (groupId: string) => ({
  headers: { "X-Group-Id": groupId },
});

export interface SurfaceScanJob {
  id: string;
  raw_target: string;
  normalized_target: string;
  target_type: "domain" | "ip" | "url";
  scan_profile: "standard" | "full";
  status: "queued" | "running" | "completed" | "partial" | "failed";
  hostname?: string | null;
  root_domain?: string | null;
  resolved_ips?: string[] | null;
  hosting_context?: string | null;
  shodan_status?: string | null;
  created_at?: string;
  started_at: string | null;
  completed_at: string | null;
  error_message?: string | null;
  summary: {
    overall_score: number;
    risk_level: string;
    total_assets?: number;
    critical_count?: number;
    warning_count?: number;
    safe_count?: number;
    high_cves?: number;
    medium_cves?: number;
    low_cves?: number;
    discovered_hosts?: string[];
    discovered_subdomains?: string[];
  } | null;
}

export interface SurfaceScanAiReport {
  id: string;
  scan_job_id: string;
  title: string;
  created_at: string;
  ai_summary: { risk_score: number; risk_level: string } | null;
}

export const surfaceScan360Api = {
  // Jobs
  async listJobs(
    companyId: string,
    params?: { status?: string; page?: number },
    groupId?: string | null,
  ): Promise<SurfaceScanJob[]> {
    const res = await complianceApiClient.get<ApiResponse<SurfaceScanJob[]>>(
      `/companies/${companyId}/surface-scan360/jobs`,
      params,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async createJob(
    companyId: string,
    payload: { target: string; scan_profile?: "standard" | "full" },
    groupId?: string | null,
  ): Promise<SurfaceScanJob> {
    const res = await complianceApiClient.post<ApiResponse<SurfaceScanJob>>(
      `/companies/${companyId}/surface-scan360/jobs`,
      payload,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async getJob(companyId: string, jobId: string, groupId?: string | null): Promise<SurfaceScanJob> {
    const res = await complianceApiClient.get<ApiResponse<SurfaceScanJob>>(
      `/companies/${companyId}/surface-scan360/jobs/${jobId}`,
      undefined,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async getJobFindings(
    companyId: string,
    jobId: string,
    params?: { severity?: string; module?: string; page?: number },
    groupId?: string | null,
  ): Promise<any[]> {
    const res = await complianceApiClient.get<ApiResponse<any[]>>(
      `/companies/${companyId}/surface-scan360/jobs/${jobId}/findings`,
      params,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  // AI Report
  async listAiReports(
    companyId: string,
    params?: { page?: number },
    groupId?: string | null,
  ): Promise<SurfaceScanAiReport[]> {
    const res = await complianceApiClient.get<ApiResponse<SurfaceScanAiReport[]>>(
      `/companies/${companyId}/surface-scan360/ai-report`,
      params,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async createAiReport(
    companyId: string,
    payload?: {
      job_id?: string;
      scope_mode?: "organization_scope" | "single_job";
      force_regenerate?: boolean;
      trigger_source?: "manual" | "auto_on_complete";
    },
    groupId?: string | null,
  ): Promise<SurfaceScanAiReport> {
    const res = await complianceApiClient.post<ApiResponse<SurfaceScanAiReport>>(
      `/companies/${companyId}/surface-scan360/ai-report`,
      payload || { scope_mode: "organization_scope", trigger_source: "manual" },
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  // Monitored IPs (replaces Supabase surface_scan_monitored_ips query)
  async listMonitoredIps(
    companyId: string,
    groupId?: string | null,
  ): Promise<any[]> {
    const res = await complianceApiClient.get<ApiResponse<any[]>>(
      `/companies/${companyId}/surface-scan360/monitored-ips`,
      undefined,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data || [];
  },

  async deleteMonitoredIp(
    companyId: string,
    monitoredIpId: string,
    groupId?: string | null,
  ): Promise<void> {
    await complianceApiClient.delete(
      `/companies/${companyId}/surface-scan360/monitored-ips/${monitoredIpId}`,
      groupId ? groupHeader(groupId) : undefined,
    );
  },

  async getExposureSummary(
    companyId: string,
    params?: { job_id?: string; scope_mode?: string },
    groupId?: string | null,
  ): Promise<any> {
    const res = await complianceApiClient.get<ApiResponse<any>>(
      `/companies/${companyId}/surface-scan360/exposure-summary`,
      params as Record<string, string>,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async getAiReport(companyId: string, reportId: string, groupId?: string | null): Promise<any> {
    const res = await complianceApiClient.get<ApiResponse<any>>(
      `/companies/${companyId}/surface-scan360/ai-report/${reportId}`,
      undefined,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },
};
