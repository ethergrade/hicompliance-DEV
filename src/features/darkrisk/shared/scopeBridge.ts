import { supabase } from "@/integrations/supabase/client";
import type { DarkRiskScope, DarkRiskScopeTarget } from "../domain/contracts";
import { normalizeScopeTargets, normalizeScopeValue } from "../domain/scope";

type SurfaceScanMonitoredIpRow = {
	id: string;
	entry_type: string | null;
	input_value: string | null;
	ip_start: string | null;
	ip_end: string | null;
};

const toSurfaceScopeValue = (row: SurfaceScanMonitoredIpRow): string | null => {
	const entryType = String(row.entry_type || "").trim().toLowerCase();
	if (entryType === "domain") {
		return String(row.input_value || "").trim();
	}
	if (entryType === "single") {
		return String(row.ip_start || row.input_value || "").trim();
	}
	return null;
};

export const shouldUseSharedDarkRiskScope = async (companyId: string): Promise<boolean> => {
	const { data, error } = await supabase
		.from("organizations")
		.select("hicompliance_enabled")
		.eq("id", companyId)
		.maybeSingle();

	if (error) {
		throw error;
	}

	return data?.hicompliance_enabled === true;
};

export const getSharedDarkRiskScope = async (companyId: string): Promise<DarkRiskScope> => {
	const { data, error } = await supabase
		.from("surface_scan_monitored_ips" as never)
		.select("id, entry_type, input_value, ip_start, ip_end")
		.eq("organization_id", companyId)
		.order("created_at", { ascending: true });

	if (error) {
		throw error;
	}

	const targets = normalizeScopeTargets(
		(data || [])
			.map((row) => toSurfaceScopeValue(row as SurfaceScanMonitoredIpRow))
			.filter((value): value is string => Boolean(value)),
		).map(
		(target): DarkRiskScopeTarget => ({
			id: target.id,
			type: target.type,
			value: target.value,
			enabled: true,
		}),
	);

	return { targets };
};

const buildSurfaceRowFromTarget = (
	companyId: string,
	target: DarkRiskScopeTarget,
) => {
	const normalized = normalizeScopeValue(target.value);
	return {
		organization_id: companyId,
		input_value: normalized.value,
		entry_type: normalized.type === "domain" ? "domain" : "single",
		ip_start: normalized.type === "ip" ? normalized.value : "",
		ip_end: normalized.type === "ip" ? normalized.value : "",
		discovered_via: "manual",
		discovered_from: null,
		created_by: null,
	};
};

export const updateSharedDarkRiskScope = async (
	companyId: string,
	scope: DarkRiskScope,
): Promise<DarkRiskScope> => {
	const normalizedTargets = normalizeScopeTargets(scope.targets.map((target) => target.value));

	const { data: existingRows, error: loadError } = await supabase
		.from("surface_scan_monitored_ips" as never)
		.select("id, entry_type, input_value, ip_start, ip_end")
		.eq("organization_id", companyId);

	if (loadError) {
		throw loadError;
	}

	const desiredKeys = new Set(
		normalizedTargets.map((target) => `${target.type}:${target.value}`),
	);
	const existingSupported = (existingRows || []).flatMap((row) => {
		const value = toSurfaceScopeValue(row as SurfaceScanMonitoredIpRow);
		if (!value) return [];
		try {
			const normalized = normalizeScopeValue(value);
			return [{
				key: `${normalized.type}:${normalized.value}`,
				id: (row as SurfaceScanMonitoredIpRow).id,
			}];
		} catch {
			return [];
		}
	});

	const keepKeys = new Set(
		existingSupported
			.filter((row) => desiredKeys.has(row.key))
			.map((row) => row.key),
	);
	const deleteIds = existingSupported
		.filter((row) => !desiredKeys.has(row.key))
		.map((row) => row.id);

	if (deleteIds.length > 0) {
		const { error: deleteError } = await supabase
			.from("surface_scan_monitored_ips" as never)
			.delete()
			.in("id", deleteIds);

		if (deleteError) {
			throw deleteError;
		}
	}

	const rowsToInsert = normalizedTargets.filter((target) => {
		const key = `${target.type}:${target.value}`;
		return !keepKeys.has(key);
	});

	if (rowsToInsert.length > 0) {
		const payload = rowsToInsert.map((target) => buildSurfaceRowFromTarget(companyId, target));
		const { error: insertError } = await supabase
			.from("surface_scan_monitored_ips" as never)
			.insert(payload);

		if (insertError) {
			throw insertError;
		}
	}

	try {
		const { error: syncError } = await supabase.functions.invoke("darkrisk360-sync-surfacescan", {
			body: {
				customer_id: companyId,
				trigger_type: "darkrisk_shared_scope_update",
				auto_scope_scan: true,
				force_scope_refresh: true,
			},
		});

		if (syncError) {
			console.warn("DarkRisk shared scope sync failed:", syncError);
		}
	} catch (error) {
		console.warn("DarkRisk shared scope sync threw:", error);
	}

	return getSharedDarkRiskScope(companyId);
};
