import { complianceApiClient, COMPLIANCE_API_BASE_URL, getToken, ApiError } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

/**
 * Asset Management: registro asset del cliente, dal backend Laravel
 * (`/companies/{id}/asset-management/*`).
 *
 * Chi può modificare cosa lo decide il server e lo dice per ogni asset
 * (`can_edit`, `can_delete`). PIN e PUK non arrivano mai nella lista: solo
 * `has_pin`/`has_puk`, e il valore con `secrets()`, che resta nel registro.
 */

export type AssetSource = "manual" | "halo";
export type Availability = "up" | "warn" | "down" | "unknown";

/** Il device HiTrack corrispondente, già trovato dal server (a mano, per IP o per nome). */
export interface AssetHiTrackMatch {
	deviceId: string;
	mode: "manual" | "ip" | "name";
	deviceName: string;
	ipAddress: string | null;
	type: string | null;
	vendor: string | null;
	model: string | null;
	location: string | null;
	osName: string | null;
	networkHealth: string | null;
	lastStatusChangeAt: string | null;
	status: "online" | "offline" | "unknown";
	statusType: "success" | "error" | "muted";
}

export interface ManagedAsset {
	id: string;
	tenant_id: string;
	internal_code: string;
	asset_number: string | null;
	asset_type: string | null;
	model: string | null;
	name: string | null;
	serial_number: string | null;
	status: string | null;
	status_cliente: string | null;
	assignee: string | null;
	date_of_assign: string | null;
	purchase_type: string | null;
	contract_number: string | null;
	start_contract_date: string | null;
	end_contract_date: string | null;
	/** Decimale: arriva come stringa ("899.90"). */
	asset_cost: string | number | null;
	asset_cost_nd: boolean;
	warranty_type: string | null;
	warranty_cost: string | number | null;
	warranty_start_date: string | null;
	warranty_expiration: string | null;
	ddt_number: string | null;
	ddt_date: string | null;
	supplier: string | null;
	note: string | null;
	site: string | null;
	ip_address: string | null;
	source: AssetSource;
	last_synced_at: string | null;
	/** Non è più nel gestionale: resta nel registro, sbloccato. */
	halo_removed_at: string | null;
	created_by: string | null;
	tags: string[];
	flag_color: string | null;
	flag_note: string | null;
	hitrack_device_id: string | null;
	hitrack_link_mode: "manual" | "none" | null;
	has_pin: boolean;
	has_puk: boolean;
	hitrack: AssetHiTrackMatch | null;
	can_edit: boolean;
	can_delete: boolean;
}

/** I campi che si mandano al server: PIN e PUK solo quando si cambiano. */
export type AssetPatch = Partial<
	Omit<ManagedAsset, "id" | "tenant_id" | "internal_code" | "source" | "halo_removed_at" | "created_by" | "hitrack" | "has_pin" | "has_puk" | "can_edit" | "can_delete">
> & { pin?: string | null; puk?: string | null };

export type LookupKind = "asset_type" | "status" | "purchase_type" | "supplier" | "assignee";
export type AssetLookups = Record<LookupKind, string[]>;

export interface AssetCollection {
	id: string;
	name: string;
	assetIds: string[];
}

export interface AssetExpirySettings {
	leadDays: number;
	recipients: string[];
	enabled: boolean;
}

export interface AssetImportReport {
	created: number;
	updated: number;
	skipped: number;
	errors: { row: number; message: string }[];
}

export interface HiTrackDeviceOption {
	id: string;
	name: string;
	ipAddress: string | null;
	type: string | null;
}

/** Colonne del file AKC, nell'ordine di import ed export: [campo, intestazione, obbligatoria]. */
export const ASSET_COLUMNS: [keyof ManagedAsset | "pin" | "puk", string, boolean][] = [
	["internal_code", "Internal Code", true], ["asset_number", "Asset Number", true], ["asset_type", "Asset Type", true],
	["model", "Model", true], ["name", "Name", false], ["serial_number", "Serial Number", true], ["status", "Status", true],
	["status_cliente", "Status Cliente", false], ["pin", "PIN", false], ["puk", "PUK", false], ["assignee", "Assignee", true],
	["date_of_assign", "Date of assign", false], ["purchase_type", "Purchase type", false], ["contract_number", "Contract number", false],
	["start_contract_date", "Start contract date", false], ["end_contract_date", "End contract date", false],
	["asset_cost", "Asset cost", true], ["warranty_type", "Warranty type", false], ["warranty_cost", "Warranty cost", false],
	["warranty_start_date", "Warranty start date", false], ["warranty_expiration", "Warranty expiration", false],
	["ddt_number", "DDT number", false], ["ddt_date", "DDT date", false], ["supplier", "Supplier", true],
	["note", "Note", false], ["site", "Sito", false],
];

/** I campi che arrivano dal gestionale: su quegli asset non si modificano. */
export const SYNCED_FIELDS = new Set<string>([
	"asset_number", "asset_type", "model", "name", "serial_number",
	"status", "status_cliente", "assignee", "site", "supplier",
]);

/** Collegamento a Halo e sync degli asset: solo super-admin. */
export interface HaloLink {
	haloClientId: string;
	haloClientName: string | null;
	lastSyncStatus: "running" | "ok" | "error" | null;
	lastSyncMessage: string | null;
	lastSyncCounts: { read: number; created: number; updated: number; unchanged: number; removed: number } | null;
	lastSyncStartedAt: string | null;
	lastSyncAt: string | null;
	/** Ultimo segno di vita della sync in corso (ogni ~15 s, anche mentre aspetta il limite di Halo). */
	heartbeatAt?: string | null;
	linkedAt: string | null;
}

export interface HaloClientOption {
	id: string;
	name: string;
	linkedTenantId: string | null;
}

const opts = (groupId?: string | null) => (groupId ? { headers: { "X-Group-Id": groupId } } : undefined);
const base = (orgId: string) => `/companies/${orgId}/asset-management`;

export const managedAssetsApi = {
	async list(orgId: string, groupId?: string | null): Promise<ManagedAsset[]> {
		return (await complianceApiClient.get<ApiResponse<ManagedAsset[]>>(`${base(orgId)}/assets`, undefined, opts(groupId))).data ?? [];
	},
	async create(orgId: string, groupId: string | null, p: AssetPatch): Promise<ManagedAsset> {
		return (await complianceApiClient.post<ApiResponse<ManagedAsset>>(`${base(orgId)}/assets`, p, opts(groupId))).data;
	},
	async update(orgId: string, groupId: string | null, id: string, p: AssetPatch): Promise<ManagedAsset> {
		return (await complianceApiClient.put<ApiResponse<ManagedAsset>>(`${base(orgId)}/assets/${id}`, p, opts(groupId))).data;
	},
	async remove(orgId: string, groupId: string | null, id: string): Promise<void> {
		await complianceApiClient.delete(`${base(orgId)}/assets/${id}`, opts(groupId));
	},
	/** Ogni lettura di PIN e PUK resta nel registro delle modifiche. */
	async secrets(orgId: string, groupId: string | null, id: string): Promise<{ pin: string | null; puk: string | null }> {
		return (await complianceApiClient.post<ApiResponse<{ pin: string | null; puk: string | null }>>(`${base(orgId)}/assets/${id}/secrets`, {}, opts(groupId))).data;
	},
	async bulk(
		orgId: string,
		groupId: string | null,
		p: { ids: string[]; addTags?: string[]; removeTags?: string[]; assignee?: string | null; site?: string | null },
	): Promise<{ updated: number; skipped: number }> {
		return (await complianceApiClient.post<ApiResponse<{ updated: number; skipped: number }>>(`${base(orgId)}/assets/bulk`, p, opts(groupId))).data;
	},
	async hitrackLink(
		orgId: string,
		groupId: string | null,
		id: string,
		mode: "manual" | "none" | "auto",
		deviceId?: string,
	): Promise<ManagedAsset> {
		return (await complianceApiClient.put<ApiResponse<ManagedAsset>>(`${base(orgId)}/assets/${id}/hitrack`, { mode, deviceId }, opts(groupId))).data;
	},
	async hitrackDevices(orgId: string, groupId?: string | null): Promise<HiTrackDeviceOption[]> {
		return (await complianceApiClient.get<ApiResponse<HiTrackDeviceOption[]>>(`${base(orgId)}/hitrack-devices`, undefined, opts(groupId))).data ?? [];
	},

	async lookups(orgId: string, groupId?: string | null): Promise<AssetLookups> {
		return (await complianceApiClient.get<ApiResponse<AssetLookups>>(`${base(orgId)}/lookups`, undefined, opts(groupId))).data;
	},
	async addLookup(orgId: string, groupId: string | null, kind: LookupKind, value: string): Promise<AssetLookups> {
		return (await complianceApiClient.post<ApiResponse<AssetLookups>>(`${base(orgId)}/lookups`, { kind, value }, opts(groupId))).data;
	},
	async removeLookup(orgId: string, groupId: string | null, kind: LookupKind, value: string): Promise<AssetLookups> {
		const qs = new URLSearchParams({ kind, value });
		return (await complianceApiClient.delete<ApiResponse<AssetLookups>>(`${base(orgId)}/lookups?${qs}`, opts(groupId))).data;
	},
	async expiry(orgId: string, groupId?: string | null): Promise<AssetExpirySettings> {
		return (await complianceApiClient.get<ApiResponse<AssetExpirySettings>>(`${base(orgId)}/expiry-settings`, undefined, opts(groupId))).data;
	},
	async saveExpiry(orgId: string, groupId: string | null, p: Partial<AssetExpirySettings>): Promise<AssetExpirySettings> {
		return (await complianceApiClient.put<ApiResponse<AssetExpirySettings>>(`${base(orgId)}/expiry-settings`, p, opts(groupId))).data;
	},

	async collections(orgId: string, groupId?: string | null): Promise<AssetCollection[]> {
		return (await complianceApiClient.get<ApiResponse<AssetCollection[]>>(`${base(orgId)}/collections`, undefined, opts(groupId))).data ?? [];
	},
	async createCollection(orgId: string, groupId: string | null, name: string): Promise<AssetCollection> {
		return (await complianceApiClient.post<ApiResponse<AssetCollection>>(`${base(orgId)}/collections`, { name }, opts(groupId))).data;
	},
	async renameCollection(orgId: string, groupId: string | null, id: string, name: string): Promise<AssetCollection> {
		return (await complianceApiClient.patch<ApiResponse<AssetCollection>>(`${base(orgId)}/collections/${id}`, { name }, opts(groupId))).data;
	},
	async deleteCollection(orgId: string, groupId: string | null, id: string): Promise<void> {
		await complianceApiClient.delete(`${base(orgId)}/collections/${id}`, opts(groupId));
	},
	async updateCollectionAssets(orgId: string, groupId: string | null, id: string, p: { add?: string[]; remove?: string[] }): Promise<AssetCollection> {
		return (await complianceApiClient.put<ApiResponse<AssetCollection>>(`${base(orgId)}/collections/${id}/assets`, p, opts(groupId))).data;
	},

	/** Il file Excel lo prepara il server, con le colonne AKC e senza PIN/PUK. */
	async exportXlsx(orgId: string, groupId?: string | null): Promise<Blob> {
		return complianceApiClient.getBlob(`${base(orgId)}/export`, opts(groupId));
	},
	async importXlsx(orgId: string, groupId: string | null, file: File): Promise<AssetImportReport> {
		const form = new FormData();
		form.append("file", file);
		const token = getToken();
		const res = await fetch(`${COMPLIANCE_API_BASE_URL}${base(orgId)}/import`, {
			method: "POST",
			headers: {
				Accept: "application/json",
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(groupId ? { "X-Group-Id": groupId } : {}),
			},
			body: form,
		});
		const json = await res.json().catch(() => ({ success: false, message: res.statusText }));
		if (!res.ok) throw new ApiError(res.status, json);
		return json.data as AssetImportReport;
	},
};

export const haloAdminApi = {
	async clients(search: string): Promise<HaloClientOption[]> {
		const qs = new URLSearchParams(search ? { search } : {});
		return (await complianceApiClient.get<ApiResponse<HaloClientOption[]>>(`/admin/halo/clients?${qs}`)).data ?? [];
	},
	async link(orgId: string): Promise<HaloLink | null> {
		return (await complianceApiClient.get<ApiResponse<HaloLink | null>>(`/admin/halo/links/${orgId}`)).data ?? null;
	},
	async setLink(orgId: string, haloClientId: string): Promise<HaloLink> {
		return (await complianceApiClient.put<ApiResponse<HaloLink>>(`/admin/halo/links/${orgId}`, { halo_client_id: haloClientId })).data;
	},
	async unlink(orgId: string): Promise<void> {
		await complianceApiClient.delete(`/admin/halo/links/${orgId}`);
	},
	async sync(orgId: string): Promise<HaloLink> {
		return (await complianceApiClient.post<ApiResponse<HaloLink>>(`/admin/halo/links/${orgId}/sync`, {})).data;
	},
};

/**
 * La sync gira davvero: "in corso" e con un battito degli ultimi 3 minuti, per
 * quanto duri. Senza battito il job è morto (per esempio il deploy ha riavviato
 * i worker) e si può rilanciare: il server libera i lock rimasti. Con un backend
 * che non manda ancora il battito vale la mezz'ora dall'avvio.
 */
export function haloSyncRunning(l: HaloLink | null | undefined, now = Date.now()): boolean {
	if (l?.lastSyncStatus !== "running") return false;
	if (l.heartbeatAt) return now - new Date(l.heartbeatAt).getTime() < 3 * 60_000;
	return !!l.lastSyncStartedAt && now - new Date(l.lastSyncStartedAt).getTime() < 30 * 60_000;
}

/** Arriva dal gestionale e c'è ancora: i campi sincronizzati sono bloccati. */
export const isSyncedFromGestionale = (a: Pick<ManagedAsset, "source" | "halo_removed_at">) =>
	a.source === "halo" && !a.halo_removed_at;

export function daysUntil(d: string | null): number | null {
	if (!d) return null;
	return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

/** I giorni alla prima scadenza fra fine contratto e fine garanzia. */
export function nearestExpiry(a: ManagedAsset): number | null {
	const v = [daysUntil(a.end_contract_date), daysUntil(a.warranty_expiration)].filter((x): x is number => x !== null);
	return v.length ? Math.min(...v) : null;
}

/** Il semaforo: offline rosso, online con rete in sofferenza giallo, online verde. */
export function availabilityOf(m: AssetHiTrackMatch | null | undefined): Availability {
	if (!m) return "unknown";
	if (m.statusType === "error") return "down";
	if (m.statusType === "success") return m.networkHealth === "red" || m.networkHealth === "amber" ? "warn" : "up";
	return "unknown";
}

export const assetDisplayName = (a: Pick<ManagedAsset, "name" | "model" | "internal_code">) =>
	a.name || a.model || `Asset ${a.internal_code}`;
