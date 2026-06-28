import { ApiError, complianceApiClient } from "@/lib/api-client";
import { darkRiskApi as legacyDarkRiskApi } from "@/lib/api/darkrisk";
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

const V2_ENABLED = String(import.meta.env.VITE_DARKRISK_ORCHESTRATOR_V2 ?? "true") !== "false";

const requestOptions = (groupId?: string | null) =>
	groupId ? { headers: { "X-Group-Id": groupId } } : undefined;

const canUseLegacyFallback = (error: unknown): boolean =>
	!V2_ENABLED || (error instanceof ApiError && [404, 405, 501].includes(error.status));

const withLegacyFallback = async <T>(primary: () => Promise<T>, legacy: () => Promise<T>): Promise<T> => {
	if (!V2_ENABLED) return legacy();
	try {
		return await primary();
	} catch (error) {
		if (!canUseLegacyFallback(error)) throw error;
		return legacy();
	}
};

const getData = async (path: string, groupId?: string | null, params?: Record<string, string | number>) => {
	const response = await complianceApiClient.get<ApiResponse<unknown>>(
		path,
		params,
		requestOptions(groupId),
	);
	return response.data;
};

export const darkRiskGateway = {
	async getScope(companyId: string, groupId?: string | null): Promise<DarkRiskScope> {
		return withLegacyFallback(
			async () => parseScope(await getData(`/companies/${companyId}/external-scope`, groupId)),
			async () => parseScope(await legacyDarkRiskApi.listTargets(companyId, groupId)),
		);
	},

	async updateScope(
		companyId: string,
		scope: DarkRiskScope,
		groupId?: string | null,
	): Promise<DarkRiskScope> {
		return withLegacyFallback(
			async () => {
				const response = await complianceApiClient.put<ApiResponse<unknown>>(
					`/companies/${companyId}/external-scope`,
					{ targets: scope.targets.map(({ type, value }) => ({ type, value })) },
					requestOptions(groupId),
				);
				return parseScope(response.data);
			},
			async () => {
				const existing = await legacyDarkRiskApi.listTargets(companyId, groupId);
				await Promise.all(existing.map((target) => legacyDarkRiskApi.deleteTarget(companyId, target.id, groupId)));
				if (scope.targets.length > 0) {
					await legacyDarkRiskApi.createTargetsBatch(
						companyId,
						{ scope: scope.targets.map((target) => target.value) },
						groupId,
					);
				}
				return this.getScope(companyId, groupId);
			},
		);
	},

	async getStandardOverview(companyId: string, groupId?: string | null): Promise<StandardOverview> {
		return parseStandardOverview(await getData(`/companies/${companyId}/darkrisk/overview`, groupId));
	},

	async createStandardRun(companyId: string, groupId?: string | null): Promise<DarkRiskRun> {
		return withLegacyFallback(
			async () => {
				const response = await complianceApiClient.post<ApiResponse<unknown>>(
					`/companies/${companyId}/darkrisk/runs`,
					{},
					requestOptions(groupId),
				);
				return parseRun(response.data, "standard");
			},
			async () => parseRun(
				await legacyDarkRiskApi.createScanRun(companyId, { trigger_type: "manual" }, groupId),
				"standard",
			),
		);
	},

	async createExtendedRun(companyId: string, groupId?: string | null): Promise<DarkRiskRun> {
		return withLegacyFallback(
			async () => {
				const response = await complianceApiClient.post<ApiResponse<unknown>>(
					`/companies/${companyId}/darkrisk-esteso/runs`,
					{},
					requestOptions(groupId),
				);
				return parseRun(response.data, "extended");
			},
			async () => parseRun(
				await legacyDarkRiskApi.createScanRun(companyId, { trigger_type: "manual" }, groupId),
				"extended",
			),
		);
	},

	async getRun(
		companyId: string,
		runId: string,
		groupId?: string | null,
	): Promise<DarkRiskRun> {
		return withLegacyFallback(
			async () => parseRun(
				await getData(`/companies/${companyId}/darkrisk/runs/${runId}`, groupId),
				"standard",
			),
			async () => parseRun(await legacyDarkRiskApi.getScanRun(companyId, runId, groupId), "standard"),
		);
	},

	async getExtendedResults(
		companyId: string,
		runId: string,
		groupId?: string | null,
	): Promise<ExtendedRunResult> {
		return withLegacyFallback(
			async () => parseExtendedResults(
				await getData(`/companies/${companyId}/darkrisk-esteso/runs/${runId}/results`, groupId),
			),
			async () => parseExtendedResults(
				await legacyDarkRiskApi.getScanRunFindings(companyId, runId, { page: 1 }, groupId),
			),
		);
	},

	async getReports(
		companyId: string,
		mode: "standard" | "extended",
		groupId?: string | null,
	): Promise<DarkRiskReport[]> {
		return withLegacyFallback(
			async () => parseReports(
				await getData(`/companies/${companyId}/darkrisk/reports`, groupId, { mode }),
			).filter((report) => report.mode === mode),
			async () => parseReports(
				await legacyDarkRiskApi.listReportSnapshots(companyId, { page: 1, per_page: 30 }, groupId),
			).filter((report) => report.mode === mode),
		);
	},
};
