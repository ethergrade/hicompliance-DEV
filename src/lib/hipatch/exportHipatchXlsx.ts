// Export Excel operativo di HiPatch: le righe filtrate in pagina, pronte per
// raggruppare le vulnerabilità e aprire attività (Planner o simili). Ogni foglio
// ha l'autofiltro di Excel già acceso.
import * as XLSX from "xlsx";
import type { HipatchCveAsset } from "@/lib/api/hipatch";
import { assetOs, OS_NON_RILEVATO } from "./assetOs";
import type { FilterableCve, FilterableOsPatch } from "./hipatchFilters";

type Row = Record<string, string | number>;

export interface ExportCve extends FilterableCve {
	baseScore?: number | null;
	firstSeen?: string | null;
	lastSeen?: string | null;
}

const assetName = (a: HipatchCveAsset) => a["data.name"] || a["data.host_name"] || a["data.ip"] || a["data.id"];

const sheet = (rows: Row[], widths: number[], empty: string) => {
	const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([[empty]]);
	ws["!cols"] = widths.map((wch) => ({ wch }));
	if (rows.length && ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };
	return ws;
};

const day = (s?: string | null) => (s ? s.slice(0, 10) : "");

const fileName = (what: string, runDate: string | null | undefined, filtered: boolean) =>
	`hipatch-${what}${filtered ? "-filtrate" : ""}-${(runDate ?? new Date().toISOString()).slice(0, 10)}.xlsx`;

/**
 * Due fogli: "CVE" una riga per vulnerabilità con gli asset coinvolti,
 * "CVE per asset" una riga per coppia CVE/asset, da filtrare per CVE o per
 * asset e raggruppare in attività.
 */
export const exportCvesXlsx = (cves: ExportCve[], opts: { runDate?: string | null; filtered: boolean; name?: string }) => {
	const perCve: Row[] = cves.map((c) => ({
		CVE: c.id,
		Gravità: c.severity,
		CVSS: c.baseScore ?? "",
		EPSS: Number(c.score) || 0,
		"N. asset": c.assets?.length ?? 0,
		Asset: (c.assets ?? []).map(assetName).join(", "),
		"Prima rilevazione": day(c.firstSeen),
		"Ultima rilevazione": day(c.lastSeen),
		Descrizione: c.description ?? "",
	}));

	const perAsset: Row[] = cves.flatMap((c) =>
		(c.assets ?? []).map((a) => ({
			CVE: c.id,
			Gravità: c.severity,
			EPSS: Number(c.score) || 0,
			Asset: assetName(a),
			Hostname: a["data.host_name"] ?? "",
			IP: a["data.ip"] ?? "",
			OS: assetOs(a) ?? OS_NON_RILEVATO,
			Tipo: a["data.asset_type"] === "other_asset" ? "non riconosciuto" : a["data.asset_type"] ?? "",
			"Ultimo ping": day(a["data.last_ping_time"]),
			Descrizione: c.description ?? "",
		})),
	);

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, sheet(perCve, [18, 10, 7, 8, 9, 60, 14, 14, 80], "Nessuna CVE"), "CVE");
	XLSX.utils.book_append_sheet(wb, sheet(perAsset, [18, 10, 8, 28, 28, 15, 28, 16, 12, 80], "Nessun asset coinvolto"), "CVE per asset");
	XLSX.writeFile(wb, opts.name ?? fileName("cve", opts.runDate, opts.filtered));
};

/**
 * "Patch per sistema" una riga per patch in attesa su un sistema; "Per KB"
 * una riga per aggiornamento con i sistemi che lo aspettano, cioè un'attività
 * di rollout.
 */
export const exportOsPatchesXlsx = (
	patches: (FilterableOsPatch & { patchType?: string })[],
	opts: { runDate?: string | null; filtered: boolean },
) => {
	const perSystem: Row[] = patches.map((p) => ({
		Sistema: p.systemName,
		KB: p.kbNumber,
		Severity: p.severity ?? "",
		Tipo: (p.patchType ?? "").replace(/_/g, " "),
		Patch: p.patch,
	}));

	const groups = new Map<string, { patch: string; severity: string; systems: Set<string> }>();
	for (const p of patches) {
		const key = p.kbNumber || p.patch;
		const g = groups.get(key) ?? { patch: p.patch, severity: p.severity ?? "", systems: new Set<string>() };
		g.systems.add(p.systemName);
		groups.set(key, g);
	}
	const perKb: Row[] = [...groups.entries()]
		.sort(([, a], [, b]) => b.systems.size - a.systems.size)
		.map(([key, g]) => ({
			KB: key === g.patch ? "" : key,
			Severity: g.severity,
			"N. sistemi": g.systems.size,
			Sistemi: [...g.systems].sort().join(", "),
			Patch: g.patch,
		}));

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, sheet(perSystem, [24, 12, 12, 18, 80], "Nessuna patch"), "Patch per sistema");
	XLSX.utils.book_append_sheet(wb, sheet(perKb, [12, 12, 10, 60, 80], "Nessuna patch"), "Per KB");
	XLSX.writeFile(wb, fileName("patch-os", opts.runDate, opts.filtered));
};
