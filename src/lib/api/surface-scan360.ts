import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

const groupHeader = (groupId: string) => ({
	headers: { "X-Group-Id": groupId },
});

/** Extract array from API response — handles both plain arrays and Laravel paginated {data:[], ...} */
const extractArray = <T>(data: unknown): T[] => {
	if (Array.isArray(data)) return data;
	if (
		data &&
		typeof data === "object" &&
		"data" in data &&
		Array.isArray((data as { data?: T[] }).data)
	)
		return (data as { data: T[] }).data;
	return [];
};

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
	payload?: any;
}

export const surfaceScan360Api = {
	// Jobs
	async listJobs(
		companyId: string,
		params?: { status?: string; page?: number; per_page?: number },
		groupId?: string | null,
	): Promise<SurfaceScanJob[]> {
		const res = await complianceApiClient.get<ApiResponse<SurfaceScanJob[]>>(
			`/companies/${companyId}/surface-scan360/jobs`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<SurfaceScanJob>(res.data);
	},

	async createJob(
		companyId: string,
		payload: {
			target?: string;
			scan_profile?:
				| "standard"
				| "full"
				| "safe_recon"
				| "domain_exposure"
				| "ip_exposure"
				| "cve_api_validation";
			tenant_id?: string;
			customer_id?: string;
			scan_name?: string;
			root_domains?: string[];
			subdomains?: string[];
			public_ips?: string[];
			scan_depth?: string;
			protocol?: string;
			check_alive?: boolean;
			[k: string]: unknown;
		},
		groupId?: string | null,
	): Promise<unknown> {
		const res = await complianceApiClient.post<ApiResponse<unknown>>(
			`/companies/${companyId}/surface-scan360/jobs`,
			payload,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	async getJob(
		companyId: string,
		jobId: string,
		groupId?: string | null,
	): Promise<SurfaceScanJob> {
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
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/jobs/${jobId}/findings`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data);
	},

	// AI Report
	async listAiReports(
		companyId: string,
		params?: { page?: number },
		groupId?: string | null,
	): Promise<SurfaceScanAiReport[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/surface-scan360/ai-report`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		// Backend returns Laravel paginated response: {data: [...], current_page, ...}
		return extractArray<SurfaceScanAiReport>(res.data);
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
		const res = await complianceApiClient.post<
			ApiResponse<SurfaceScanAiReport>
		>(
			`/companies/${companyId}/surface-scan360/ai-report`,
			payload || { scope_mode: "organization_scope", trigger_source: "manual" },
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	// Exposure findings (open ports, services, exposure data per job)
	async getExposureFindings(
		companyId: string,
		jobId: string,
		params?: {
			severity?: string;
			status?: string;
			finding_type?: string;
			page?: number;
		},
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/jobs/${jobId}/exposure-findings`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data);
	},

	async listMonitoredIps(
		companyId: string,
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/monitored-ips`,
			undefined,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data || []);
	},

	async createMonitoredIp(
		companyId: string,
		payload: {
			input_value: string;
			entry_type: string;
			ip_start: string;
			ip_end: string;
			discovered_via?: string;
			discovered_from?: string | null;
		},
		groupId?: string | null,
	): Promise<unknown> {
		const res = await complianceApiClient.post<ApiResponse<unknown>>(
			`/companies/${companyId}/surface-scan360/monitored-ips`,
			payload,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
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
	): Promise<unknown> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/surface-scan360/exposure-summary`,
			params as Record<string, string>,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	async getObservations(
		companyId: string,
		params?: {
			job_ids?: string;
			module?: string;
			observation_type?: string;
			page?: number;
		},
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/observations`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data);
	},
	async getModuleResults(
		companyId: string,
		params?: { job_ids?: string; status?: string; page?: number },
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/module-results`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data);
	},

	async getTechnologies(
		companyId: string,
		params?: { job_ids?: string; page?: number },
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/technologies`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data);
	},

	async getOpenPorts(
		companyId: string,
		params?: { job_ids?: string; exposure_level?: string; per_page?: number; page?: number },
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/open-ports`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data);
	},
	async getAiReport(
		companyId: string,
		reportId: string,
		groupId?: string | null,
	): Promise<unknown> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/surface-scan360/ai-report/${reportId}`,
			undefined,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	async getAssets(
		companyId: string,
		params?: { job_id?: string; job_ids?: string; asset_type?: string; all?: boolean; per_page?: number; page?: number },
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/assets`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data);
	},

	async getFindings(
		companyId: string,
		params?: { job_ids?: string; severity?: string; status?: string; active_only?: boolean; finding_type?: string; cisa_kev?: boolean; per_page?: number; page?: number },
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/findings`,
			params as Record<string, unknown>,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data);
	},

	// Monthly Reports
	async getMonthlyReports(
		companyId: string,
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/monthly-report`,
			undefined,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data);
	},

	async generateMonthlyReport(
		companyId: string,
		payload?: { month_key?: string; force_regenerate?: boolean; trigger_source?: string },
		groupId?: string | null,
	): Promise<unknown> {
		const res = await complianceApiClient.post<ApiResponse<unknown>>(
			`/companies/${companyId}/surface-scan360/monthly-report`,
			payload ?? {},
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	// Delete AI report
	async deleteAiReport(
		companyId: string,
		reportId: string,
		groupId?: string | null,
	): Promise<void> {
		await complianceApiClient.delete(
			`/companies/${companyId}/surface-scan360/ai-report/${reportId}`,
			groupId ? groupHeader(groupId) : undefined,
		);
	},

	async getAlerts(
		companyId: string,
		params?: { severity?: string; status?: string; page?: number },
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/findings/alerts`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data);
	},

	async getCisaKev(
		companyId: string,
		params?: { severity?: string; status?: string; page?: number },
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown[]>>(
			`/companies/${companyId}/surface-scan360/findings/cisa-kev`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<unknown>(res.data);
	},
};
