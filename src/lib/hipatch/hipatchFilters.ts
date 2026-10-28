// Filtri delle tabelle HiPatch (asset, CVE, patch OS), separati dal componente
// per poterli provare. Lavorano sui dati già scaricati: la pagina ha in mano
// tutto il run.
import type { HipatchAsset, HipatchCveAsset } from "@/lib/api/hipatch";
import { assetOs, OS_NON_RILEVATO } from "./assetOs";

export type Severity = "Low" | "Medium" | "High" | "Critical";

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const rank = (s?: string) => SEVERITY_RANK[(s ?? "").toLowerCase()] ?? 0;

const contains = (q: string, ...values: (string | undefined | null)[]) =>
	values.some((v) => (v ?? "").toLowerCase().includes(q));

// ─── Asset ────────────────────────────────────────────────────────────────────

/**
 * Gli "other_asset" sono IP che hanno risposto alla discovery senza hostname
 * né OS: su Panapesca 5717 su 6110. Lo scanner elenca solo chi ha risposto
 * (stato, ping e discovery sono uguali per tutti), quindi è il tipo a separare
 * il rumore, non lo stato.
 */
export const isUnrecognized = (a: Pick<HipatchAsset, "data.asset_type">) => a["data.asset_type"] === "other_asset";

export type AssetKind = "recognized" | "unrecognized" | "all";
/** "critical" e "high": almeno una CVE di quella gravità (high comprende le critiche). */
export type AssetCveFilter = "all" | "with" | "without" | "critical" | "high";
export type AssetPingFilter = "all" | "stale";

export interface AssetFilters {
	query: string;
	kind: AssetKind;
	os: string; // "all", un sistema operativo o OS_NON_RILEVATO
	cve: AssetCveFilter;
	ping: AssetPingFilter;
}

/** Il default mostra i dispositivi veri: gli IP non riconosciuti si scelgono. */
export const DEFAULT_ASSET_FILTERS: AssetFilters = { query: "", kind: "recognized", os: "all", cve: "all", ping: "all" };

/** Giorni senza risposta oltre i quali un asset è "non visto di recente". */
export const STALE_DAYS = 7;

const DAY_MS = 86_400_000;
const pingTime = (a: HipatchAsset) => {
	const t = Date.parse(a["data.last_ping_time"] ?? "");
	return Number.isNaN(t) ? null : t;
};

/**
 * L'ultimo ping dell'elenco: il riferimento per "non visto da 7 giorni" è la
 * scansione, non oggi, altrimenti un run vecchio di una settimana renderebbe
 * tutto "non visto".
 */
export const latestPing = (assets: HipatchAsset[]) =>
	assets.reduce<number | null>((max, a) => {
		const t = pingTime(a);
		return t !== null && (max === null || t > max) ? t : max;
	}, null);

export const isStale = (a: HipatchAsset, reference: number | null) => {
	if (reference === null) return false;
	const t = pingTime(a);
	return t === null || reference - t > STALE_DAYS * DAY_MS;
};

export const assetOsLabel = (a: HipatchAsset) => assetOs(a) ?? OS_NON_RILEVATO;

/** I sistemi operativi presenti, dal più frequente; "OS non rilevato" in fondo. */
export const osOptions = (assets: HipatchAsset[]) => {
	const counts = new Map<string, number>();
	for (const a of assets) counts.set(assetOsLabel(a), (counts.get(assetOsLabel(a)) ?? 0) + 1);
	return [...counts.entries()]
		.sort(([a, na], [b, nb]) => Number(a === OS_NON_RILEVATO) - Number(b === OS_NON_RILEVATO) || nb - na || a.localeCompare(b))
		.map(([os, count]) => ({ os, count }));
};

export const hasActiveAssetFilters = (f: AssetFilters) =>
	f.query.trim() !== "" || f.kind !== DEFAULT_ASSET_FILTERS.kind || f.os !== "all" || f.cve !== "all" || f.ping !== "all";

/**
 * @param cvesOf le CVE dell'asset, dalla più grave
 */
export const filterAssets = (
	assets: HipatchAsset[],
	f: AssetFilters,
	cvesOf: (a: HipatchAsset) => { severity: string }[],
	reference: number | null = latestPing(assets),
) => {
	const q = f.query.trim().toLowerCase();
	return assets.filter((a) => {
		if (f.kind === "recognized" && isUnrecognized(a)) return false;
		if (f.kind === "unrecognized" && !isUnrecognized(a)) return false;
		if (q && !contains(q, a["data.name"], a["data.host_name"], a["data.ip"])) return false;
		if (f.os !== "all" && assetOsLabel(a) !== f.os) return false;
		if (f.cve !== "all") {
			const worst = Math.max(0, ...cvesOf(a).map((c) => rank(c.severity)));
			if (f.cve === "with" && worst === 0) return false;
			if (f.cve === "without" && worst > 0) return false;
			if (f.cve === "critical" && worst < SEVERITY_RANK.critical) return false;
			if (f.cve === "high" && worst < SEVERITY_RANK.high) return false;
		}
		if (f.ping === "stale" && !isStale(a, reference)) return false;
		return true;
	});
};

// ─── CVE ──────────────────────────────────────────────────────────────────────

export interface FilterableCve {
	id: string;
	description?: string;
	score: number; // EPSS
	severity: Severity;
	assets?: HipatchCveAsset[];
}

export type CveSort = "severity" | "assets" | "epss";

export interface CveFilters {
	query: string;
	severity: "all" | Severity;
	asset: string; // "all" o data.id
	sort: CveSort;
}

export const DEFAULT_CVE_FILTERS: CveFilters = { query: "", severity: "all", asset: "all", sort: "severity" };

export const hasActiveCveFilters = (f: CveFilters) => f.query.trim() !== "" || f.severity !== "all" || f.asset !== "all";

const assetCount = (c: FilterableCve) => c.assets?.length ?? 0;

/**
 * La ricerca guarda la CVE (codice e descrizione) e gli asset coinvolti
 * (nome, hostname, IP): "CVE-2024-" e "srv-db01" trovano entrambe ciò che
 * serve per pianificare una remediation. "Più asset coinvolti" mette in cima
 * le CVE condivise, quelle che si chiudono con un intervento solo.
 */
export const filterCves = <T extends FilterableCve>(cves: T[], f: CveFilters): T[] => {
	const q = f.query.trim().toLowerCase();
	const rows = cves.filter((c) => {
		if (f.severity !== "all" && c.severity !== f.severity) return false;
		if (f.asset !== "all" && !(c.assets ?? []).some((a) => a["data.id"] === f.asset)) return false;
		if (
			q &&
			!contains(q, c.id, c.description) &&
			!(c.assets ?? []).some((a) => contains(q, a["data.name"], a["data.host_name"], a["data.ip"]))
		) {
			return false;
		}
		return true;
	});
	const bySeverity = (a: T, b: T) => rank(b.severity) - rank(a.severity);
	const byAssets = (a: T, b: T) => assetCount(b) - assetCount(a);
	const byEpss = (a: T, b: T) => b.score - a.score;
	const order = { severity: [bySeverity, byAssets, byEpss], assets: [byAssets, bySeverity, byEpss], epss: [byEpss, bySeverity, byAssets] }[f.sort];
	return [...rows].sort((a, b) => order.reduce((r, cmp) => r || cmp(a, b), 0));
};

// ─── Patch OS ─────────────────────────────────────────────────────────────────

export interface FilterableOsPatch {
	systemName: string;
	patch: string;
	kbNumber: string;
	severity?: string;
}

export interface OsPatchFilters {
	query: string; // sistema, patch o KB
	severity: string; // "all" o il valore della fonte (CRITICAL, IMPORTANT, …)
}

export const DEFAULT_OS_PATCH_FILTERS: OsPatchFilters = { query: "", severity: "all" };

export const filterOsPatches = <T extends FilterableOsPatch>(patches: T[], f: OsPatchFilters): T[] => {
	const q = f.query.trim().toLowerCase();
	return patches.filter(
		(p) =>
			(f.severity === "all" || (p.severity ?? "").toUpperCase() === f.severity) &&
			(!q || contains(q, p.systemName, p.patch, p.kbNumber)),
	);
};

/** Le severity presenti, nell'ordine della fonte: critica, importante, poi il resto. */
export const osPatchSeverities = (patches: FilterableOsPatch[]) => {
	const order = ["CRITICAL", "IMPORTANT", "MODERATE", "LOW", "OPTIONAL"];
	const found = [...new Set(patches.map((p) => (p.severity ?? "").toUpperCase()).filter(Boolean))];
	return found.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
};
