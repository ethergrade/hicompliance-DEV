import { describe, expect, it } from "vitest";
import type { CredentialLeak } from "../domain/contracts";
import { EMPTY_FILTERS, filterCredentialLeaks, formatDay, invalidRange, leakDay } from "./credentialLeakFilters";

const leak = (account: string, evidenceDate: string | null, over: Partial<CredentialLeak> = {}): CredentialLeak => ({
	id: account, credentialKey: account, firstSeenAt: null, lastSeenAt: null, seenCount: 1,
	selector: account, assetScope: null, maskedValue: "***", clearValue: "x", clearAccount: account,
	passwordType: "Plaintext", bucketCanonical: null, bucketDisplay: null, sourceShort: null, sourceLong: null,
	collectionName: null, confidence: "high", evidenceDate, createdAt: "2026-10-27T10:00:00Z", evidenceId: null,
	findingId: null, acknowledged: false, acknowledgedAt: null, acknowledgedBy: null, acknowledgementNote: null, ...over,
});

describe("filtri credenziali esposte", () => {
	it("il giorno del leak è quello scritto dalla fonte, senza fuso", () => {
		expect(leakDay(leak("a", "2026-10-20T23:30:00Z"))).toBe("2026-10-20");
		expect(leakDay(leak("a", "2026-03-15 00:00:00"))).toBe("2026-03-15");
		expect(leakDay(leak("a", null))).toBeNull();
		expect(leakDay(leak("a", "ieri"))).toBeNull();
		expect(formatDay("2026-03-15")).toBe("15/03/2026");
	});

	it("l'intervallo comprende i due estremi e conta le righe senza data escluse", () => {
		const rows = [
			leak("primo", "2026-10-01T00:10:00Z"),
			leak("ultimo", "2026-10-20T23:59:00Z"),
			leak("fuori", "2026-10-21T00:00:01Z"),
			leak("senza", null),
		];
		const r = filterCredentialLeaks(rows, { ...EMPTY_FILTERS, dateFrom: "2026-10-01", dateTo: "2026-10-20" });
		expect(r.rows.map((x) => x.id)).toEqual(["primo", "ultimo"]);
		expect(r.withoutDate).toBe(1);
		expect(filterCredentialLeaks(rows, EMPTY_FILTERS).withoutDate).toBe(0);
	});

	it("un intervallo rovesciato non filtra niente e si segnala", () => {
		const f = { ...EMPTY_FILTERS, dateFrom: "2026-10-20", dateTo: "2026-10-01" };
		expect(invalidRange(f)).toBe(true);
		expect(filterCredentialLeaks([leak("a", "2020-01-01")], f).rows).toHaveLength(1);
	});

	it("riconoscimento e tipo di password", () => {
		const rows = [leak("a", null, { acknowledged: true }), leak("b", null, { passwordType: "MD5" })];
		expect(filterCredentialLeaks(rows, { ...EMPTY_FILTERS, ack: "only" }).rows.map((x) => x.id)).toEqual(["a"]);
		expect(filterCredentialLeaks(rows, { ...EMPTY_FILTERS, ack: "exclude" }).rows.map((x) => x.id)).toEqual(["b"]);
		expect(filterCredentialLeaks(rows, { ...EMPTY_FILTERS, passwordType: "MD5" }).rows.map((x) => x.id)).toEqual(["b"]);
	});
});
