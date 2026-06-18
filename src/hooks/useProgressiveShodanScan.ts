import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { shodanApi } from "@/lib/api/shodan";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import type { ShodanAsset } from "./useShodanScan";

export interface ScanRule {
	id: string;
	entry_type: "single" | "range" | "cidr" | "domain";
	input_value: string;
	ip_start: string;
	ip_end: string;
}

interface RuleScanResult {
	assets: ShodanAsset[];
	errors: Array<{ target: string; error: string }>;
	truncated?: boolean;
	rule_id: string;
	scanned_at: string;
}

/**
 * Engine progressivo: una query per regola.
 * Range/CIDR vengono espansi server-side (host/search net:) — 1 chiamata API per range.
 * La UI si popola progressivamente man mano che ogni regola termina.
 */
export const useProgressiveShodanScan = (rules: ScanRule[], enabled = true) => {
	const { organizationId, groupId } = useClientOrganization();

	const queries = useQueries({
		queries: rules.map((rule) => ({
			queryKey: [
				"shodan-scan-rule",
				organizationId,
				groupId,
				rule.entry_type,
				rule.input_value,
				rule.ip_start,
				rule.ip_end,
			],
			enabled: enabled && !!rule.input_value && !!organizationId,
			staleTime: 10 * 60 * 1000,
			queryFn: async (): Promise<RuleScanResult> => {
				if (!organizationId) throw new Error("organizationId mancante");
				const res = await shodanApi.scan(
					organizationId,
					{
						rule: {
							entry_type: rule.entry_type,
							input_value: rule.input_value,
							ip_start: rule.ip_start,
							ip_end: rule.ip_end,
						},
					},
					groupId,
				);
				return {
					assets: res.assets,
					errors: res.errors,
					scanned_at: res.scanned_at,
					truncated: res.truncated,
					rule_id: rule.id,
				};
			},
		})),
	});

	return useMemo(() => {
		const assets: ShodanAsset[] = [];
		const errors: Array<{ target: string; error: string }> = [];
		const truncatedRules: string[] = [];
		let completed = 0;
		let loading = false;
		let anyError: Error | null = null;

		queries.forEach((q, i) => {
			if (q.isLoading || q.isFetching) loading = true;
			if (q.isSuccess && q.data) {
				completed += 1;
				assets.push(...q.data.assets);
				errors.push(...q.data.errors);
				if (q.data.truncated) truncatedRules.push(rules[i].input_value);
			}
			if (q.isError && !anyError) anyError = q.error as Error;
		});

		// Dedup per IP — merge hostnames per non perdere domini co-locati (Cloudflare / shared hosting)
		const dedupMap = new Map<string, ShodanAsset & { hostnames: string[] }>();
		for (const a of assets) {
			const existing = dedupMap.get(a.ip);
			const incoming = [a.hostname].filter(Boolean) as string[];
			if (!existing) {
				dedupMap.set(a.ip, { ...a, hostnames: incoming });
			} else {
				const merged = Array.from(
					new Set([...(existing.hostnames || []), ...incoming]),
				);
				const winner =
					a.raw_service_count > existing.raw_service_count ? a : existing;
				dedupMap.set(a.ip, { ...winner, hostnames: merged });
			}
		}

		return {
			assets: Array.from(dedupMap.values()),
			errors,
			truncatedRules,
			completed,
			total: rules.length,
			progress:
				rules.length === 0 ? 0 : Math.round((completed / rules.length) * 100),
			isLoading: loading,
			error: anyError,
		};
	}, [queries, rules]);
};
