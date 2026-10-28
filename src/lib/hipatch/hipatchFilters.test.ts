import { describe, expect, it } from "vitest";
import type { HipatchAsset, HipatchCveAsset } from "@/lib/api/hipatch";
import { OS_NON_RILEVATO } from "./assetOs";
import {
	DEFAULT_ASSET_FILTERS,
	DEFAULT_CVE_FILTERS,
	DEFAULT_OS_PATCH_FILTERS,
	filterAssets,
	filterCves,
	filterOsPatches,
	hasActiveAssetFilters,
	osOptions,
	osPatchSeverities,
	type FilterableCve,
} from "./hipatchFilters";

const asset = (id: string, over: Partial<HipatchAsset> = {}): HipatchAsset => ({
	"data.id": id,
	"data.name": id,
	"data.ip": `10.0.0.${id.length}`,
	"data.asset_type": "discovered",
	"data.os_name": "Windows 11",
	"data.last_ping_time": "2026-10-28T07:00:00",
	...over,
});

const ids = (rows: { "data.id"?: string }[]) => rows.map((r) => r["data.id"]);

describe("filtri asset HiPatch", () => {
	const ip = asset("ip", { "data.asset_type": "other_asset", "data.os_name": "" });
	const vecchio = asset("vecchio", { "data.last_ping_time": "2026-10-15T07:00:00" });
	const srv = asset("srv", { "data.os_name": "Ubuntu 22.04" });
	const all = [asset("pc"), srv, vecchio, ip];
	const cves: Record<string, { severity: string }[]> = { pc: [{ severity: "Critical" }], srv: [{ severity: "High" }] };
	const cvesOf = (a: HipatchAsset) => cves[a["data.id"] ?? ""] ?? [];

	it("di default gli IP non riconosciuti restano fuori, e si possono scegliere", () => {
		expect(ids(filterAssets(all, DEFAULT_ASSET_FILTERS, cvesOf))).toEqual(["pc", "srv", "vecchio"]);
		expect(ids(filterAssets(all, { ...DEFAULT_ASSET_FILTERS, kind: "unrecognized" }, cvesOf))).toEqual(["ip"]);
		expect(filterAssets(all, { ...DEFAULT_ASSET_FILTERS, kind: "all" }, cvesOf)).toHaveLength(4);
		expect(hasActiveAssetFilters(DEFAULT_ASSET_FILTERS)).toBe(false);
	});

	it("per OS, compreso OS non rilevato, dal più frequente", () => {
		expect(ids(filterAssets(all, { ...DEFAULT_ASSET_FILTERS, kind: "all", os: OS_NON_RILEVATO }, cvesOf))).toEqual(["ip"]);
		expect(osOptions(all).map((o) => o.os)).toEqual(["Windows 11", "Ubuntu 22.04", OS_NON_RILEVATO]);
	});

	it("per gravità delle CVE: high comprende le critiche", () => {
		const f = (cve: typeof DEFAULT_ASSET_FILTERS.cve) => ids(filterAssets(all, { ...DEFAULT_ASSET_FILTERS, cve }, cvesOf));
		expect(f("critical")).toEqual(["pc"]);
		expect(f("high")).toEqual(["pc", "srv"]);
		expect(f("with")).toEqual(["pc", "srv"]);
		expect(f("without")).toEqual(["vecchio"]);
	});

	it("non visti da più di 7 giorni rispetto all'ultima scansione, non a oggi", () => {
		expect(ids(filterAssets(all, { ...DEFAULT_ASSET_FILTERS, ping: "stale" }, cvesOf))).toEqual(["vecchio"]);
	});

	it("la ricerca guarda nome, hostname e IP", () => {
		expect(ids(filterAssets(all, { ...DEFAULT_ASSET_FILTERS, query: "SRV" }, cvesOf))).toEqual(["srv"]);
	});
});

describe("filtri CVE HiPatch", () => {
	const a = (id: string, name: string) => ({ "data.id": id, "data.name": name, "data.ip": `10.1.1.${id}` }) as HipatchCveAsset;
	const cve = (id: string, severity: FilterableCve["severity"], assets: HipatchCveAsset[], score = 0.1): FilterableCve => ({
		id, severity, assets, score, description: `descrizione ${id}`,
	});
	const rows = [
		cve("CVE-2024-1", "High", [a("1", "srv-db01")], 0.9),
		cve("CVE-2024-2", "Critical", [a("2", "pc-01")]),
		cve("CVE-2023-3", "High", [a("1", "srv-db01"), a("2", "pc-01"), a("3", "pc-02")]),
	];

	it("si cerca per CVE o per asset", () => {
		expect(filterCves(rows, { ...DEFAULT_CVE_FILTERS, query: "2023" }).map((c) => c.id)).toEqual(["CVE-2023-3"]);
		expect(filterCves(rows, { ...DEFAULT_CVE_FILTERS, query: "srv-db" }).map((c) => c.id)).toEqual(["CVE-2023-3", "CVE-2024-1"]);
		expect(filterCves(rows, { ...DEFAULT_CVE_FILTERS, query: "10.1.1.3" }).map((c) => c.id)).toEqual(["CVE-2023-3"]);
	});

	it("gravità e asset", () => {
		expect(filterCves(rows, { ...DEFAULT_CVE_FILTERS, severity: "Critical" }).map((c) => c.id)).toEqual(["CVE-2024-2"]);
		expect(filterCves(rows, { ...DEFAULT_CVE_FILTERS, asset: "3" }).map((c) => c.id)).toEqual(["CVE-2023-3"]);
	});

	it("ordinamenti: gravità, più asset coinvolti, EPSS", () => {
		const ord = (sort: typeof DEFAULT_CVE_FILTERS.sort) => filterCves(rows, { ...DEFAULT_CVE_FILTERS, sort }).map((c) => c.id);
		expect(ord("severity")).toEqual(["CVE-2024-2", "CVE-2023-3", "CVE-2024-1"]);
		expect(ord("assets")).toEqual(["CVE-2023-3", "CVE-2024-2", "CVE-2024-1"]);
		expect(ord("epss")[0]).toBe("CVE-2024-1");
	});
});

describe("filtri patch OS", () => {
	const p = (systemName: string, kbNumber: string, severity: string) => ({ systemName, patch: `Aggiornamento ${kbNumber}`, kbNumber, severity });
	const rows = [p("PCMES01", "KB5121003", "Important"), p("SRV01", "KB5000001", "CRITICAL"), p("PC02", "", "")];

	it("per KB, sistema e severity", () => {
		expect(filterOsPatches(rows, { ...DEFAULT_OS_PATCH_FILTERS, query: "kb5121" }).map((r) => r.systemName)).toEqual(["PCMES01"]);
		expect(filterOsPatches(rows, { ...DEFAULT_OS_PATCH_FILTERS, query: "srv" }).map((r) => r.systemName)).toEqual(["SRV01"]);
		expect(filterOsPatches(rows, { ...DEFAULT_OS_PATCH_FILTERS, severity: "IMPORTANT" }).map((r) => r.systemName)).toEqual(["PCMES01"]);
		expect(osPatchSeverities(rows)).toEqual(["CRITICAL", "IMPORTANT"]);
	});
});
