import { apiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

const gh = (groupId?: string | null) =>
  groupId ? { headers: { "X-Group-Id": groupId } } : undefined;

export type NucleiProfile =
  | 'baseline_headers'
  | 'exposure_medium'
  | 'web_vuln_safe'
  | 'web_cve_recent'
  | 'web_cve_2026'
  | 'web_cve_2025'
  | 'web_cve_2024'
  | 'web_cve_2023'
  | 'web_cve_2022'
  | 'web_vuln_authorized';

export type NmapProfile = 'web_top' | 'tcp_top_100' | 'service_light' | 'custom_tcp';

export interface NucleiJob {
  id: string;
  organization_id?: string;
  target_url: string;
  normalized_target_url?: string | null;
  resolved_target_url?: string | null;
  target_host?: string | null;
  target_input?: string | null;
  target_kind?: string | null;
  nmap_target?: string | null;
  nmap_profile?: NmapProfile | null;
  stage?: 'queued' | 'nmap_running' | 'nikto_running' | 'waiting_nuclei' | 'nuclei_running' | 'completed' | 'failed' | 'timeout' | 'cancelled' | null;
  next_run_at?: string | null;
  nmap_status?: string | null;
  nmap_started_at?: string | null;
  nmap_completed_at?: string | null;
  nmap_duration_ms?: number | null;
  nmap_version?: string | null;
  open_port_count?: number | null;
  fingerprint_status?: string | null;
  fingerprint_duration_ms?: number | null;
  technology_count?: number | null;
  nikto_status?: string | null;
  nikto_started_at?: string | null;
  nikto_completed_at?: string | null;
  nikto_duration_ms?: number | null;
  nikto_version?: string | null;
  nikto_findings_count?: number | null;
  profile: NucleiProfile;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  attempt_count?: number | null;
  last_error?: string | null;
  timeout_seconds?: number | null;
  rate_limit?: number | null;
  max_findings?: number | null;
  authorized_scan?: boolean | null;
  duration_ms?: number | null;
  nuclei_version?: string | null;
  templates_loaded_count?: number | null;
  templates_executed_count?: number | null;
  findings_count?: number | null;
  warnings?: string[] | null;
  summary?: Record<string, unknown> | null;
  unified_verdict?: UnifiedVerdict | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface UnifiedVerdict {
  level?: 'clean' | 'informational' | 'watch' | 'elevated' | 'critical' | string;
  score?: number;
  reasons?: string[];
  generated_at?: string;
}

export interface NucleiJobDetail {
  job: NucleiJob;
  findings: NucleiFinding[];
  open_ports: NmapOpenPort[];
  cve_matches: CveMatch[];
  technologies: TechnologyFingerprint[];
  nikto_findings: NiktoFinding[];
}

export interface NucleiFinding {
  template_id?: string;
  name?: string | null;
  severity?: string | null;
  type?: string | null;
  matched_at?: string | null;
  matcher_name?: string | null;
  extracted_results?: string[];
  tags?: string[];
  cve_ids?: string[];
}

export interface NmapOpenPort {
  id?: string;
  host?: string | null;
  hostname?: string | null;
  protocol?: string | null;
  port?: number | null;
  state?: string | null;
  service?: string | null;
  product?: string | null;
  version?: string | null;
  extrainfo?: string | null;
  cpe?: string[];
  url_candidates?: string[];
}

export interface CveMatch {
  id?: string;
  cve_id: string;
  severity?: string | null;
  asset_host?: string | null;
  template_id?: string | null;
  matched_at?: string | null;
  cvss_score?: number | null;
  cvss_vector?: string | null;
  cvss_version?: string | null;
  epss_score?: number | null;
  epss_percentile?: number | null;
  kev_known_exploited?: boolean | null;
  match_status?: 'confirmed' | 'potential' | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  source?: string | null;
  cpe?: string | null;
  description?: string | null;
  nvd_status?: string | null;
  published_at?: string | null;
  last_modified_at?: string | null;
}

export interface TechnologyFingerprint {
  id?: string;
  port_id?: string | null;
  url?: string | null;
  asset_host?: string | null;
  port?: number | null;
  name?: string | null;
  version?: string | null;
  source?: string | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  category?: string | null;
  evidence?: Record<string, unknown> | null;
  cpe_candidates?: string[];
}

export interface NiktoFinding {
  id?: string;
  target_url?: string | null;
  asset_host?: string | null;
  port?: number | null;
  tls?: boolean | null;
  severity?: string | null;
  category?: string | null;
  nikto_id?: string | null;
  method?: string | null;
  uri?: string | null;
  message?: string | null;
  references?: string[];
}

export interface ScannableTarget {
  target_url: string;
  value: string;
  host: string;
  kind: 'domain' | 'subdomain' | 'url' | 'ipv4' | 'ipv4_cidr';
  source: string;
  label: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface BatchJobPayload {
  targets?: string[];
  include_surface_assets?: boolean;
  include_discovered_targets?: boolean;
  surface_asset_limit?: number;
  profile: NucleiProfile;
  nmap_profile?: NmapProfile;
  authorized_scan?: boolean;
  timeout_seconds?: number;
  rate_limit?: number;
  max_findings?: number;
}

export interface BatchJobResult {
  queued_count: number;
  skipped_duplicates: number;
  warnings: string[];
  jobs: NucleiJob[];
}

export interface ProcessQueueResult {
  processed_count: number;
  remaining_hint: number;
  processed: Array<{ job_id: string; status: string; stage: string }>;
}

export interface SmokeTestResult {
  ok: boolean;
  duration_ms: number;
  checks: Array<{ name: string; ok: boolean; duration_ms?: number; message?: string }>;
  warnings: string[];
}

export const nucleiScan360Api = {
  async listJobs(
    params?: { status?: string; stage?: string; page?: number },
    groupId?: string | null,
  ): Promise<{ data: NucleiJob[]; current_page: number; total: number }> {
    const res = await apiClient.get<ApiResponse<{ data: NucleiJob[]; current_page: number; total: number }>>(
      `/nuclei-scan360/jobs`,
      params,
      gh(groupId),
    );
    return res.data;
  },

  async getJobDetail(jobId: string, groupId?: string | null): Promise<NucleiJobDetail> {
    const res = await apiClient.get<ApiResponse<NucleiJobDetail>>(
      `/nuclei-scan360/jobs/${jobId}`,
      undefined,
      gh(groupId),
    );
    return res.data;
  },

  async getJobFindings(
    jobId: string,
    params?: { severity?: string; page?: number },
    groupId?: string | null,
  ): Promise<NucleiFinding[]> {
    const res = await apiClient.get<ApiResponse<NucleiFinding[]>>(
      `/nuclei-scan360/jobs/${jobId}/findings`,
      params,
      gh(groupId),
    );
    return res.data;
  },

  async getTargets(
    params?: { limit?: number },
    groupId?: string | null,
  ): Promise<{ targets: ScannableTarget[]; counts: { total: number }; warnings: string[] }> {
    const res = await apiClient.get<ApiResponse<{ targets: ScannableTarget[]; counts: { total: number }; warnings: string[] }>>(
      `/nuclei-scan360/targets`,
      params,
      gh(groupId),
    );
    return res.data;
  },

  async createJob(
    payload: {
      target_url: string;
      profile: NucleiProfile;
      nmap_profile?: NmapProfile;
      authorized_scan?: boolean;
      timeout_seconds?: number;
      rate_limit?: number;
      max_findings?: number;
    },
    groupId?: string | null,
  ): Promise<NucleiJob> {
    const res = await apiClient.post<ApiResponse<NucleiJob>>(
      `/nuclei-scan360/jobs`,
      payload,
      gh(groupId),
    );
    return res.data;
  },

  async batchCreateJobs(
    payload: BatchJobPayload,
    groupId?: string | null,
  ): Promise<BatchJobResult> {
    const res = await apiClient.post<ApiResponse<BatchJobResult>>(
      `/nuclei-scan360/jobs/batch`,
      payload,
      gh(groupId),
    );
    return res.data;
  },

  async processQueue(
    payload: { limit?: number },
    groupId?: string | null,
  ): Promise<ProcessQueueResult> {
    const res = await apiClient.post<ApiResponse<ProcessQueueResult>>(
      `/nuclei-scan360/process-queue`,
      payload,
      gh(groupId),
    );
    return res.data;
  },

  async smokeTest(
    params?: { include_discovered_targets?: boolean },
    groupId?: string | null,
  ): Promise<SmokeTestResult> {
    const res = await apiClient.get<ApiResponse<SmokeTestResult>>(
      `/nuclei-scan360/smoke-test`,
      params,
      gh(groupId),
    );
    return res.data;
  },
};
