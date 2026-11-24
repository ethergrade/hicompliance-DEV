import { describe, expect, test } from "vitest";
import { dueState, planTotals, type PlanItem } from "./plan";

const today = new Date("2026-11-24T10:00:00Z");
const it = (p: Partial<PlanItem>): PlanItem => ({ id: "x", task_id: "t", organization_id: "o", title: "a", owner: null, due_date: null, cost: null, done: false, notes: null, sort_order: 0, ...p });

describe("piano completo", () => {
	test("past due and not done is scaduto", () => expect(dueState(it({ due_date: "2026-11-20" }), today)).toBe("scaduto"));
	test("due within 7 days is in scadenza", () => expect(dueState(it({ due_date: "2026-12-01" }), today)).toBe("in_scadenza"));
	test("done wins over past date", () => expect(dueState(it({ due_date: "2026-11-01", done: true }), today)).toBe("fatto"));
	test("activity cost above budget is flagged", () => {
		const t = planTotals([it({ cost: 3000, done: true }), it({ cost: 2500 })], 5000, today);
		expect(t.cost).toBe(5500); expect(t.overBudget).toBe(true); expect(t.pct).toBe(50);
	});
});
