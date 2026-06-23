import { apiClient } from "./index";
import { tenantServicesApi } from "./tenant-services";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HipatchSummary {
	last_updated: string;
	avg_risk_score: number;
	max_risk_score: number;
	cve_by_severity: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	total_cves: number;
	total_assets: number;
	pending_os_patches: number;
	patch_risk_percent: number;
}

export interface HipatchAsset {
	"data.id"?: string;
	"data.name"?: string;
	"data.host_name"?: string;
	"data.ip"?: string;
	"data.os_full_name"?: string;
	"data.os_name"?: string;
	"data.os_vendor"?: string;
	"data.os_version"?: string;
	"data.platform"?: string;
	"data.status"?: string;
	"data.asset_type"?: string;
	"data.asset_category"?: string;
	"data.manufacturer"?: string;
	"data.hardware_model"?: string;
	"data.importance"?: string;
	"data.scan_status"?: string;
	"data.last_discovered_time"?: string;
	"data.last_ping_time"?: string;
	"data.mac"?: string;
	"data.tenantid"?: string;
}

export interface HipatchOsPatch {
	id: string;
	name: string;
	severity: string;
	status: string;
	type: string;
	kbNumber: string;
	device_name?: string;
	installedAt?: string;
}

export interface HipatchSoftwarePatch {
	id: string;
	productIdentifier?: string;
	title: string;
	impact: string;
	status: string;
	type: string;
	device_name?: string;
	installedAt?: string;
}

export interface HipatchRemediation {
	status: string;
	total: number;
	affected_assets: number;
	critical_problems: number;
	epss_vuls: number;
	fix: string;
	high_problems: number;
	is_patchable: boolean;
	low_problems: number;
	medium_problems: number;
	os_name: string;
	product: string;
	remediation_action: string;
	severity: string;
	solution_id: string;
	total_count: number;
	total_problems: number;
	url: string;
}

export interface HipatchCveAsset {
	"data.id": string;
	"data.name": string;
	"data.host_name": string;
	"data.ip": string;
	"data.os_full_name": string;
	"data.os_name": string;
	"data.os_vendor"?: string;
	"data.os_version"?: string;
	"data.platform"?: string;
	"data.asset_type": string;
	"data.asset_category"?: string;
	"data.importance"?: string;
	"data.last_ping_time": string;
	"data.last_discovered_time": string;
	"data.mac"?: string;
}

export interface HipatchCve {
	base_score: string | number;
	company_id: string;
	company_name: string;
	description: string;
	epss_score: string | number;
	exploitability_score: string | number;
	first_vul_discovered: string;
	last_vul_discovered: string;
	problem_name: string;
	severity: string;
	total_count: string | number;
	assets?: HipatchCveAsset[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getHipatchServiceId(
	organizationId: string,
	groupId?: string | null,
): Promise<string | null> {
	try {
		const services = await tenantServicesApi.listByOrganization(
			organizationId,
			groupId,
		);
		const svc = services.find(
			(s) =>
				s.service_type?.toLowerCase() === "hipatch" &&
				s.tenant_id === organizationId,
		);
		return svc?.id || null;
	} catch {
		return null;
	}
}

function makeOpts(groupId?: string | null) {
	return groupId ? { headers: { "X-Group-Id": groupId } } : undefined;
}

function unwrap<T>(res: { success?: boolean; data?: T[] } | T[]): T[] {
	if (Array.isArray(res)) return res;
	const r = res as { success?: boolean; data?: T[] };
	if (r && typeof r === "object" && "data" in r) return r.data ?? [];
	return [];
}

function unwrapOne<T>(res: { success?: boolean; data?: T }): T | null {
	if (res && typeof res === "object" && "data" in res) return res.data ?? null;
	return null;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const hipatchApi = {
	async summary(
		organizationId: string,
		groupId?: string | null,
		date?: string,
	): Promise<HipatchSummary | null> {
		const id = await getHipatchServiceId(organizationId, groupId);
		if (!id) return null;
		const params = date ? { date } : undefined;
		const res = await apiClient.get<{ success: boolean; data: HipatchSummary }>(
			`/tenant-services/${id}/hipatch/summary`,
			params,
			makeOpts(groupId),
		);
		return unwrapOne(res);
	},

	async assets(
		organizationId: string,
		groupId?: string | null,
		date?: string,
	): Promise<HipatchAsset[]> {
		const id = await getHipatchServiceId(organizationId, groupId);
		if (!id) return [];
		const params = date ? { date } : undefined;
		const res = await apiClient.get<{ success: boolean; data: HipatchAsset[] }>(
			`/tenant-services/${id}/hipatch/assets`,
			params,
			makeOpts(groupId),
		);
		return unwrap(res);
	},

	async osPatchesPending(
		organizationId: string,
		groupId?: string | null,
		date?: string,
	): Promise<HipatchOsPatch[]> {
		const id = await getHipatchServiceId(organizationId, groupId);
		if (!id) return [];
		const params = date ? { date } : undefined;
		const res = await apiClient.get<{
			success: boolean;
			data: HipatchOsPatch[];
		}>(
			`/tenant-services/${id}/hipatch/patches/os/pending`,
			params,
			makeOpts(groupId),
		);
		return unwrap(res);
	},

	async osPatchesInstalled(
		organizationId: string,
		groupId?: string | null,
		date?: string,
	): Promise<HipatchOsPatch[]> {
		const id = await getHipatchServiceId(organizationId, groupId);
		if (!id) return [];
		const params = date ? { date } : undefined;
		const res = await apiClient.get<{
			success: boolean;
			data: HipatchOsPatch[];
		}>(
			`/tenant-services/${id}/hipatch/patches/os/installed`,
			params,
			makeOpts(groupId),
		);
		return unwrap(res);
	},

	async softwarePatchesPending(
		organizationId: string,
		groupId?: string | null,
		date?: string,
	): Promise<HipatchSoftwarePatch[]> {
		const id = await getHipatchServiceId(organizationId, groupId);
		if (!id) return [];
		const params = date ? { date } : undefined;
		const res = await apiClient.get<{
			success: boolean;
			data: HipatchSoftwarePatch[];
		}>(
			`/tenant-services/${id}/hipatch/patches/software/pending`,
			params,
			makeOpts(groupId),
		);
		return unwrap(res);
	},

	async softwarePatchesInstalled(
		organizationId: string,
		groupId?: string | null,
		date?: string,
	): Promise<HipatchSoftwarePatch[]> {
		const id = await getHipatchServiceId(organizationId, groupId);
		if (!id) return [];
		const params = date ? { date } : undefined;
		const res = await apiClient.get<{
			success: boolean;
			data: HipatchSoftwarePatch[];
		}>(
			`/tenant-services/${id}/hipatch/patches/software/installed`,
			params,
			makeOpts(groupId),
		);
		return unwrap(res);
	},

	async remediations(
		organizationId: string,
		groupId?: string | null,
		date?: string,
	): Promise<HipatchRemediation[]> {
		const id = await getHipatchServiceId(organizationId, groupId);
		if (!id) return [];
		const params = date ? { date } : undefined;
		const res = await apiClient.get<{
			success: boolean;
			data: HipatchRemediation[];
		}>(
			`/tenant-services/${id}/hipatch/remediations`,
			params,
			makeOpts(groupId),
		);
		return unwrap(res);
	},

	async cves(
		organizationId: string,
		groupId?: string | null,
		date?: string,
	): Promise<HipatchCve[]> {
		const id = await getHipatchServiceId(organizationId, groupId);
		if (!id) return [];
		const params = date ? { date } : undefined;
		const res = await apiClient.get<{ success: boolean; data: HipatchCve[] }>(
			`/tenant-services/${id}/hipatch/cves`,
			params,
			makeOpts(groupId),
		);
		return unwrap(res);
	},

	async enrichCves(
		organizationId: string,
		groupId?: string | null,
		date?: string,
	): Promise<{ queued: number; message?: string } | null> {
		const id = await getHipatchServiceId(organizationId, groupId);
		if (!id) return null;
		const body = date ? { date } : {};
		const res = await apiClient.post<{
			success: boolean;
			data: { queued: number; message?: string };
		}>(`/tenant-services/${id}/hipatch/cves/enrich`, body, makeOpts(groupId));
		return unwrapOne(res);
	},
	async epssVulnerabilities(
		organizationId: string,
		groupId?: string | null,
		date?: string,
	): Promise<HipatchCve[]> {
		const id = await getHipatchServiceId(organizationId, groupId);
		if (!id) return [];
		const params = date ? { date } : undefined;
		const res = await apiClient.get<{ success: boolean; data: HipatchCve[] }>(
			`/tenant-services/${id}/hipatch/epss-vulnerabilities`,
			params,
			makeOpts(groupId),
		);
		return unwrap(res);
	},
};

export { getHipatchServiceId };
