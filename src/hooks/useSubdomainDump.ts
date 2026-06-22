import { useCallback, useEffect, useState } from "react";
import {
	subdomainDumpApi,
	type SubdomainDump,
	type SubdomainResult,
} from "@/lib/api/subdomain-dump";
import { useClientOrganization } from "@/hooks/useClientOrganization";

export type { SubdomainDump, SubdomainResult };

type OrgSettingsRow = {
	subdomain_dump_depth?: number;
	subdomain_dump_enabled?: boolean;
};

function getErrorMessage(e: unknown): string {
	return e instanceof Error ? e.message : "Errore dump";
}

function normalizeResults(
	results: SubdomainDump["results"] | unknown,
): SubdomainDump["results"] {
	return Array.isArray(results) ? results : [];
}

function normalizeDump(dump: SubdomainDump): SubdomainDump {
	return {
		...dump,
		results: normalizeResults(dump.results),
		sources: Array.isArray(dump.sources) ? dump.sources : [],
	};
}

function dumpKey(dump: SubdomainDump): string {
	return dump.id || `${dump.root_domain}|${dump.created_at}`;
}

function mergeHistory(
	primary: SubdomainDump[],
	fallback: SubdomainDump[],
): SubdomainDump[] {
	const merged = new Map<string, SubdomainDump>();
	for (const dump of [...primary, ...fallback]) {
		const normalized = normalizeDump(dump);
		const existing = merged.get(dumpKey(normalized));
		if (!existing) {
			merged.set(dumpKey(normalized), normalized);
			continue;
		}
		merged.set(dumpKey(normalized), {
			...existing,
			...normalized,
			results:
				normalized.results.length > 0 ? normalized.results : existing.results,
		});
	}
	return Array.from(merged.values()).sort(
		(a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""),
	);
}

export const useSubdomainDump = () => {
	const { organizationId, groupId } = useClientOrganization();
	const [history, setHistory] = useState<SubdomainDump[]>([]);
	const [running, setRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [depthSetting, setDepthSetting] = useState<number>(10);
	const [enabledSetting, setEnabledSetting] = useState<boolean>(true);

	// History → backend (POST /subdomain-dump + GET /subdomain-dump/history)
	const fetchHistory = useCallback(async () => {
		if (!organizationId) return [];
		try {
			const items = (
				await subdomainDumpApi.history(organizationId, groupId)
			).map(normalizeDump);
			setHistory((current) => mergeHistory(items, current));
			return items;
		} catch (e) {
			setError(getErrorMessage(e));
			return [];
		}
	}, [organizationId, groupId]);

	// Settings → ancora Supabase (mancano endpoint GET/PUT /subdomain-dumps/settings nel backend)
	const fetchSettings = useCallback(async () => {
		if (!organizationId) return;
		// TODO: migrate to backend API (organizations subdomain_dump settings)
		setDepthSetting(10);
		setEnabledSetting(true);
	}, [organizationId]);

	useEffect(() => {
		fetchHistory();
		fetchSettings();
	}, [fetchHistory, fetchSettings]);

	const updateSettings = useCallback(
		async (depth: number, enabled: boolean) => {
			if (!organizationId) return false;
			const d = Math.max(1, Math.min(100, Math.round(depth)));
			// TODO: migrate to backend API (organizations subdomain_dump settings update)
			setDepthSetting(d);
			setEnabledSetting(enabled);
			return true;
		},
		[organizationId],
	);

	const runDump = useCallback(
		async (rootDomain: string, overrideDepth?: number) => {
			if (!organizationId) return null;
			setRunning(true);
			setError(null);
			try {
				const data = await subdomainDumpApi.store(
					organizationId,
					{
						root_domain: rootDomain.trim().toLowerCase(),
						depth_limit: overrideDepth,
						triggered_by: "manual",
					},
					groupId,
				);
				if (!data) throw new Error("Errore dump");
				const normalized = normalizeDump(data);
				setHistory((current) => mergeHistory([normalized], current));
				await fetchHistory();
				setHistory((current) => mergeHistory([normalized], current));
				return normalized;
			} catch (e) {
				setError(getErrorMessage(e));
				return null;
			} finally {
				setRunning(false);
			}
		},
		[organizationId, groupId, fetchHistory],
	);

	return {
		history,
		running,
		error,
		depthSetting,
		enabledSetting,
		runDump,
		updateSettings,
		refetch: fetchHistory,
	};
};
