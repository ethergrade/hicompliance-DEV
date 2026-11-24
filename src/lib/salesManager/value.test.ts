import { describe, expect, test } from "vitest";
import { canMove, effectiveValue, summarize, type SalesRow } from "./value";

describe("sales manager rules", () => {
	test("sales value wins over plan budget", () => expect(effectiveValue(5000, 3000)).toBe(3000));
	test("plan budget used when sales value empty", () => expect(effectiveValue(5000, null)).toBe(5000));
	test("sales value used when budget empty", () => expect(effectiveValue(null, 3000)).toBe(3000));
	test("no value when both empty", () => expect(effectiveValue(0, null)).toBeNull());
	test("proposto cannot jump to completato", () => expect(canMove("proposto", "completato")).toBe(false));
	test("inviato can become accettato", () => expect(canMove("inviato", "accettato")).toBe(true));
	test("summary counts unvalued and accepted", () => {
		const base = { organizationId: "o1", task: "t", category: "c", priority: "p", progress: 0, notes: null, proposedAt: null, closedAt: null, updatedAt: "2026-01-01" };
		const rows: SalesRow[] = [
			{ ...base, taskId: "1", budget: 1000, proposedValue: null, status: "accettato" },
			{ ...base, taskId: "2", budget: null, proposedValue: null, status: "proposto" },
			{ ...base, taskId: "3", budget: null, proposedValue: 500, status: "rifiutato" },
		];
		const [s] = summarize([{ id: "o1", name: "A" }], rows);
		expect(s.total).toBe(3); expect(s.unvalued).toBe(1); expect(s.acceptedValue).toBe(1000); expect(s.pipelineValue).toBe(1000);
	});
});
