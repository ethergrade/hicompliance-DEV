import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
	DarkRiskReport,
	DarkRiskRun,
	DarkRiskScope,
	ExtendedRunResult,
	StandardOverview,
} from "../domain/contracts";
import {
	parseExtendedResults,
	parseReports,
	parseRun,
	parseScope,
	parseStandardOverview,
} from "../domain/schemas";
import {
	resolveDarkRiskEntitlements,
	type DarkRiskEntitlements,
} from "../shared/entitlementResolver";

const requestOptions = (groupId?: string | null) =>
	groupId ? { headers: { "X-Group-Id": groupId } } : undefined;

const getData = async (
	path: string,
	groupId?: string | null,
	params?: Record<string, string | number>,
) => {
	const response = await complianceApiClient.get<ApiResponse<unknown>>(
		path,
		params,
		requestOptions(groupId),
	);
	return response.data;
};

export const darkRiskGateway = {
	async getEntitlements(
		companyId: string,
		groupId?: string | null,
	): Promise<DarkRiskEntitlements> {
		const data = (await getData(
			`/companies/${companyId}/darkrisk/entitlement`,
			groupId,
		)) as Record<string, unknown>;
		const enabled = data?.enabled === true;
		const tier =
			typeof data?.tier === "string" ? data.tier.toLowerCase() : null;

		return {
			...resolveDarkRiskEntitlements(
				{
					standardEnabled: enabled,
					extendedEnabled: enabled && tier === "extended",
				},
				null,
			),
		};
	},

	async getScope(
		companyId: string,
		groupId?: string | null,
	): Promise<DarkRiskScope> {
		return parseScope(
			await getData(`/companies/${companyId}/external-scope`, groupId),
		);
	},

	async updateScope(
		companyId: string,
		scope: DarkRiskScope,
		groupId?: string | null,
	): Promise<DarkRiskScope> {
		const response = await complianceApiClient.put<ApiResponse<unknown>>(
			`/companies/${companyId}/external-scope`,
			{
				// Il backend accetta un array di stringhe (domini/IP) e rileva
				// il target_type da sé; inviare {type,value} dà 422.
				targets: scope.targets.map(({ value }) => value),
			},
			requestOptions(groupId),
		);
		return parseScope(response.data);
	},

	async getStandardOverview(
		companyId: string,
		groupId?: string | null,
	): Promise<StandardOverview> {
		return parseStandardOverview(
			await getData(`/companies/${companyId}/darkrisk/overview`, groupId),
		);
	},

	async createStandardRun(
		companyId: string,
		groupId?: string | null,
	): Promise<DarkRiskRun> {
		const data = await getData(
			`/companies/${companyId}/darkrisk/scan-runs`,
			groupId,
			{ trigger_source: "manual" },
		);
		return parseRun(data, "standard");
	},

	async getStandardRun(
		companyId: string,
		runId: string,
		groupId?: string | null,
	): Promise<DarkRiskRun> {
		return parseRun(
			await getData(
				`/companies/${companyId}/darkrisk/scan-runs/${runId}`,
				groupId,
			),
			"standard",
		);
	},

	async getReports(
		companyId: string,
		mode: "standard" | "extended",
		groupId?: string | null,
	): Promise<DarkRiskReport[]> {
		const endpoint = mode === "extended" ? `reports?mode=extended` : `reports`;
		return parseReports(
			await getData(`/companies/${companyId}/darkrisk/${endpoint}`, groupId),
		);
	},

	/**
	 * Scarica il PDF di uno snapshot report tramite fetch autenticato (il download
	 * endpoint è protetto da Bearer, quindi un <a href> semplice non basta).
	 */
	async downloadReport(
		companyId: string,
		snapshotId: string,
		groupId?: string | null,
	): Promise<void> {
		const blob = await complianceApiClient.getBlob(
			`/companies/${companyId}/darkrisk/report-snapshots/${snapshotId}/download`,
			requestOptions(groupId),
		);
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `darkrisk360-report-${snapshotId}.pdf`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	},

	async getExtendedResult(
		companyId: string,
		runId: string,
		groupId?: string | null,
	): Promise<ExtendedRunResult> {
		return parseExtendedResults(
			await getData(
				`/companies/${companyId}/darkrisk/extended-runs/${runId}/result`,
				groupId,
			),
		);
	},

	async getExtendedScans(
		companyId: string,
		groupId?: string | null,
	): Promise<DarkRiskRun[]> {
		const items = await getData(
			`/companies/${companyId}/darkrisk/extended-runs`,
			groupId,
		);
		return Array.isArray(items)
			? items.map((item: unknown) =>
					parseRun(item as Record<string, unknown>, "extended"),
				)
			: [];
	},

	async createExtendedRun(
		companyId: string,
		groupId?: string | null,
	): Promise<DarkRiskRun> {
		const response = await complianceApiClient.post<ApiResponse<unknown>>(
			`/companies/${companyId}/darkrisk/extended-runs`,
			undefined,
			requestOptions(groupId),
		);
		return parseRun(response.data as Record<string, unknown>, "extended");
	},
};
