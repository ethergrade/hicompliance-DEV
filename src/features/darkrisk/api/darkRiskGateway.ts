import type { DarkRiskReport, DarkRiskRun, DarkRiskScope, ExtendedRunResult, StandardOverview } from "../domain/contracts";
import { parseExtendedResults, parseReports, parseRun, parseScope, parseStandardOverview } from "../domain/schemas";
import { supabase } from "@/integrations/supabase/client";
import { resolveDarkRiskEntitlements, type DarkRiskEntitlementHints, type DarkRiskEntitlements } from "../shared/entitlementResolver";
import { getSharedDarkRiskScope, shouldUseSharedDarkRiskScope, updateSharedDarkRiskScope } from "../shared/scopeBridge";
import { darkRiskHttp } from "./http";

export const darkRiskGateway = {
	async getOrganizationEntitlementHints(companyId: string): Promise<DarkRiskEntitlementHints> {
		const { data, error } = await supabase
			.from("organizations")
			.select("hicompliance_enabled, dark_risk360_enabled, darkrisk_esteso_enabled")
			.eq("id", companyId)
			.maybeSingle();

		if (error) {
			throw error;
		}

		return {
			hicomplianceEnabled: data?.hicompliance_enabled === true,
			darkRisk360Enabled: data?.dark_risk360_enabled === true,
			darkRiskExtendedEnabled: data?.darkrisk_esteso_enabled === true,
		};
	},
	async getEntitlements(companyId: string): Promise<DarkRiskEntitlements> {
		const [apiResult, hintsResult] = await Promise.allSettled([
			darkRiskHttp<Record<string, unknown>>(`/companies/${companyId}/darkrisk/overview`),
			darkRiskGateway.getOrganizationEntitlementHints(companyId),
		]);

		const data = apiResult.status === "fulfilled" ? apiResult.value : null;
		const hints = hintsResult.status === "fulfilled" ? hintsResult.value : null;
		const grants = data?.entitlements && typeof data.entitlements === "object"
			? data.entitlements as Record<string, unknown>
			: data ?? {};

		return {
			...resolveDarkRiskEntitlements(
				{
					standardEnabled: data?.enabled === true || grants.standard_monitor === true || grants.standard_enabled === true || grants.hicompliance === true || grants.extended_identity === true || data?.tier === "extended",
					extendedEnabled: grants.extended_identity === true || grants.extended_enabled === true || data?.tier === "extended",
				},
				hints,
			),
		};
	},
	async getScope(companyId: string): Promise<DarkRiskScope> {
		if (await shouldUseSharedDarkRiskScope(companyId)) {
			return getSharedDarkRiskScope(companyId);
		}
		return parseScope(await darkRiskHttp(`/companies/${companyId}/external-scope`));
	},
	async updateScope(companyId: string, scope: DarkRiskScope): Promise<DarkRiskScope> {
		if (await shouldUseSharedDarkRiskScope(companyId)) {
			return updateSharedDarkRiskScope(companyId, scope);
		}
		return parseScope(await darkRiskHttp(`/companies/${companyId}/external-scope`, {
			method: "PUT",
			body: { targets: scope.targets.map(({ type, value }) => ({ type, value })) },
		}));
	},
	async getStandardOverview(companyId: string): Promise<StandardOverview> {
		return parseStandardOverview(await darkRiskHttp(`/companies/${companyId}/darkrisk/overview`));
	},
	async createStandardRun(companyId: string): Promise<DarkRiskRun> {
		return parseRun(await darkRiskHttp(`/companies/${companyId}/darkrisk/runs`, { method: "POST", body: {} }), "standard");
	},
	async createExtendedRun(companyId: string): Promise<DarkRiskRun> {
		return parseRun(await darkRiskHttp(`/companies/${companyId}/darkrisk-esteso/runs`, { method: "POST", body: {} }), "extended");
	},
	async getRun(companyId: string, runId: string): Promise<DarkRiskRun> {
		return parseRun(await darkRiskHttp(`/companies/${companyId}/darkrisk/runs/${runId}`), "standard");
	},
	async getExtendedResults(companyId: string, runId: string): Promise<ExtendedRunResult> {
		return parseExtendedResults(await darkRiskHttp(`/companies/${companyId}/darkrisk-esteso/runs/${runId}/results`));
	},
	async getReports(companyId: string, mode: "standard" | "extended"): Promise<DarkRiskReport[]> {
		return parseReports(await darkRiskHttp(`/companies/${companyId}/darkrisk/reports`, { params: { mode } })).filter((report) => report.mode === mode);
	},
};
