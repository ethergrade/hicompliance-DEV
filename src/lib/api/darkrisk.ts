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

export interface DarkRiskNotificationConfig {
	alert_on_new_findings: boolean;
	alert_severity_threshold: string;
	min_new_findings_to_alert: number;
	weekly_summary_enabled: boolean;
	recipient_emails: string[];
}

export const darkRiskApi = {
	// Notification config
	async getNotificationConfig(
		companyId: string,
		groupId?: string | null,
	): Promise<DarkRiskNotificationConfig> {
		const res = await complianceApiClient.get<
			ApiResponse<DarkRiskNotificationConfig>
		>(
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
		const res = await complianceApiClient.put<
			ApiResponse<DarkRiskNotificationConfig>
		>(
			`/companies/${companyId}/darkrisk/notification-config`,
			payload,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	// Overview
	async getOverview(
		companyId: string,
		groupId?: string | null,
	): Promise<unknown> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/overview`,
			undefined,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	// Scan runs
	async listScanRuns(
		companyId: string,
		params?: { page?: number; per_page?: number },
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/scan-runs`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray(res.data);
	},

	async createScanRun(
		companyId: string,
		payload?: {
			notes?: string;
			trigger_type?: string;
			[k: string]: unknown;
		},
		groupId?: string | null,
	): Promise<unknown> {
		const res = await complianceApiClient.post<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/scan-runs`,
			payload || {},
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	async getScanRun(
		companyId: string,
		scanRunId: string,
		groupId?: string | null,
	): Promise<unknown> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/scan-runs/${scanRunId}`,
			undefined,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	async getScanRunFindings(
		companyId: string,
		scanRunId: string,
		params?: { severity?: string; page?: number },
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/scan-runs/${scanRunId}/findings`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray(res.data);
	},

	// Report snapshots
	async listReportSnapshots(
		companyId: string,
		params?: { page?: number; per_page?: number },
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/report-snapshots`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray(res.data);
	},

	async createReportSnapshot(
		companyId: string,
		payload: {
			scan_run_id?: string;
			classification?: string;
			report_mode?: string;
			scope?: string;
			force?: boolean;
			[k: string]: unknown;
		},
		groupId?: string | null,
	): Promise<unknown> {
		const res = await complianceApiClient.post<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/report-snapshots`,
			payload,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	async getReportSnapshot(
		companyId: string,
		snapshotId: string,
		groupId?: string | null,
	): Promise<unknown> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/report-snapshots/${snapshotId}`,
			undefined,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	// Findings
	async listFindings(
		companyId: string,
		params?: Record<string, string | number | boolean | undefined>,
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/findings`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray(res.data);
	},

	// Assets
	async listAssets(
		companyId: string,
		params?: Record<string, string | number | boolean | undefined>,
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/assets`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray(res.data);
	},

	// Selectors
	async listSelectors(
		companyId: string,
		params?: Record<string, string | number | boolean | undefined>,
		groupId?: string | null,
	): Promise<unknown[]> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/selectors`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray(res.data);
	},

	// Roadmap status (dedicated endpoint)
	async getRoadmapStatus(
		companyId: string,
		groupId?: string | null,
	): Promise<unknown> {
		const res = await complianceApiClient.get<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/roadmap-status`,
			undefined,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	// Evidence reveal
	async revealEvidence(
		companyId: string,
		evidenceId: string,
		payload: { reason: string; expires_in?: number },
		groupId?: string | null,
	): Promise<unknown> {
		const res = await complianceApiClient.post<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/evidence/${evidenceId}/reveal`,
			payload,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},
};
