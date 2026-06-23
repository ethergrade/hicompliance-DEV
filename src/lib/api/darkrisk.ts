import { complianceApiClient } from "@/lib/api-client";
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
	async listTargets(
		companyId: string,
		groupId?: string | null,
	): Promise<DarkRiskTarget[]> {
		const res = await complianceApiClient.get<ApiResponse<DarkRiskTarget[]>>(
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
		const res = await complianceApiClient.post<ApiResponse<DarkRiskTarget[]>>(
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
		const res = await complianceApiClient.post<ApiResponse<DarkRiskTarget[]>>(
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
		const res = await complianceApiClient.put<ApiResponse<DarkRiskTarget>>(
			`/companies/${companyId}/darkrisk/targets/${targetId}`,
			payload,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	async deleteTarget(
		companyId: string,
		targetId: string,
		groupId?: string | null,
	): Promise<void> {
		await complianceApiClient.delete<ApiResponse<void>>(
			`/companies/${companyId}/darkrisk/targets/${targetId}`,
			groupId ? groupHeader(groupId) : undefined,
		);
	},

	async toggleTarget(
		companyId: string,
		targetId: string,
		groupId?: string | null,
	): Promise<DarkRiskTarget> {
		const res = await complianceApiClient.patch<ApiResponse<DarkRiskTarget>>(
			`/companies/${companyId}/darkrisk/targets/${targetId}/toggle`,
			{},
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

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
	async getOverview(companyId: string, groupId?: string | null): Promise<any> {
		const res = await complianceApiClient.get<ApiResponse<any>>(
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
	): Promise<any[]> {
		const res = await complianceApiClient.get<ApiResponse<any[]>>(
			`/companies/${companyId}/darkrisk/scan-runs`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	async createScanRun(
		companyId: string,
		payload?: {
			notes?: string;
			trigger_type?: string;
			include_dti_extended?: boolean;
			identity_emails?: string[];
			[k: string]: unknown;
		},
		groupId?: string | null,
	): Promise<any> {
		const res = await complianceApiClient.post<ApiResponse<any>>(
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
	): Promise<any> {
		const res = await complianceApiClient.get<ApiResponse<any>>(
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
	): Promise<any[]> {
		const res = await complianceApiClient.get<ApiResponse<any[]>>(
			`/companies/${companyId}/darkrisk/scan-runs/${scanRunId}/findings`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	// Report snapshots
	async listReportSnapshots(
		companyId: string,
		params?: { page?: number; per_page?: number },
		groupId?: string | null,
	): Promise<any[]> {
		const res = await complianceApiClient.get<ApiResponse<any[]>>(
			`/companies/${companyId}/darkrisk/report-snapshots`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
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
	): Promise<any> {
		const res = await complianceApiClient.post<ApiResponse<any>>(
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
	): Promise<any> {
		const res = await complianceApiClient.get<ApiResponse<any>>(
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
	): Promise<any[]> {
		const res = await complianceApiClient.get<ApiResponse<any[]>>(
			`/companies/${companyId}/darkrisk/findings`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	// Assets
	async listAssets(
		companyId: string,
		params?: Record<string, string | number | boolean | undefined>,
		groupId?: string | null,
	): Promise<any[]> {
		const res = await complianceApiClient.get<ApiResponse<any[]>>(
			`/companies/${companyId}/darkrisk/assets`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	// Selectors
	async listSelectors(
		companyId: string,
		params?: Record<string, string | number | boolean | undefined>,
		groupId?: string | null,
	): Promise<any[]> {
		const res = await complianceApiClient.get<ApiResponse<any[]>>(
			`/companies/${companyId}/darkrisk/selectors`,
			params,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	// Roadmap status (dedicated endpoint)
	async getRoadmapStatus(
		companyId: string,
		groupId?: string | null,
	): Promise<any> {
		const res = await complianceApiClient.get<ApiResponse<any>>(
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
	): Promise<any> {
		const res = await complianceApiClient.post<ApiResponse<any>>(
			`/companies/${companyId}/darkrisk/evidence/${evidenceId}/reveal`,
			payload,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},
};
