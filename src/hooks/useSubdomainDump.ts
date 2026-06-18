import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

export const useSubdomainDump = () => {
	const { organizationId, groupId } = useClientOrganization();
	const [history, setHistory] = useState<SubdomainDump[]>([]);
	const [running, setRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [depthSetting, setDepthSetting] = useState<number>(10);
	const [enabledSetting, setEnabledSetting] = useState<boolean>(true);

	// History → backend (POST /subdomain-dump + GET /subdomain-dump/history)
	const fetchHistory = useCallback(async () => {
		if (!organizationId) return;
		try {
			const items = await subdomainDumpApi.history(organizationId, groupId);
			setHistory(items);
		} catch (e) {
			setError(getErrorMessage(e));
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
				await fetchHistory();
				return data;
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
