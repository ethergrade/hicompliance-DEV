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
import {
	resolveDarkRiskEntitlements,
	type DarkRiskEntitlements,
} from "../shared/entitlementResolver";

const V2_ENABLED =
	String(import.meta.env.VITE_DARKRISK_ORCHESTRATOR_V2 ?? "true") !== "false";

const requestOptions = (groupId?: string | null) =>
	groupId ? { headers: { "X-Group-Id": groupId } } : undefined;

const canUseLegacyFallback = (error: unknown): boolean =>
	!V2_ENABLED ||
	(error instanceof ApiError && [404, 405, 501].includes(error.status));

const withLegacyFallback = async <T>(
	primary: () => Promise<T>,
	legacy: () => Promise<T>,
): Promise<T> => {
	if (!V2_ENABLED) return legacy();
	try {
		return await primary();
	} catch (error) {
		if (!canUseLegacyFallback(error)) throw error;
		return legacy();
	}
};

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
	async getEntitlements(companyId: string): Promise<DarkRiskEntitlements> {
		const data = (await getData(
			`/companies/${companyId}/darkrisk/entitlement`,
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
		return withLegacyFallback(
			async () =>
				parseScope(
					await getData(`/companies/${companyId}/external-scope`, groupId),
				),
			async () =>
				parseScope(await legacyDarkRiskApi.listTargets(companyId, groupId)),
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
					{
						targets: scope.targets.map(({ type, value }) => ({ type, value })),
					},
					requestOptions(groupId),
				);
				return parseScope(response.data);
			},
			async () => {
				const existing = await legacyDarkRiskApi.listTargets(
					companyId,
					groupId,
				);
				await Promise.all(
					existing.map((target) =>
						legacyDarkRiskApi.deleteTarget(companyId, target.id, groupId),
					),
				);
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
};
