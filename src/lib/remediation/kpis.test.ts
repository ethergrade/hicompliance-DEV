import { describe, expect, it } from "vitest";
import {
	budgetCoverageLabel,
	computeRemediationKpis,
	formatEuro,
	formatTaskDate,
	priorityLabel,
	type RemediationTaskLike,
} from "./kpis";

const oggi = new Date(2026, 10, 20); // 20/11/2026

const task = (over: Partial<RemediationTaskLike>): RemediationTaskLike => ({
	task: "Attività",
	priority: "medium",
	end_date: "2026-12-31",
	progress: 0,
	is_done: false,
	assignee: null,
	budget: null,
	...over,
});

describe("computeRemediationKpis", () => {
	it("un task chiuso non conta fra aperte, scadute e senza assegnatario", () => {
		const k = computeRemediationKpis([task({ is_done: true, end_date: "2026-01-01" })], oggi);
		expect(k.open).toBe(0);
		expect(k.overdue).toBe(0);
		expect(k.unassigned).toBe(0);
		expect(k.closed).toBe(1);
	});

	it("progress 100 vale come chiuso", () => {
		expect(computeRemediationKpis([task({ progress: 100 })], oggi).open).toBe(0);
	});

	it("conta scadute, critiche/alte aperte, senza assegnatario e senza data", () => {
		const k = computeRemediationKpis(
			[
				task({ priority: "critical", end_date: "2026-11-01" }),
				task({ priority: "high", assignee: "Mario" }),
				task({ end_date: null }),
				task({ end_date: "non-una-data" }),
			],
			oggi,
		);
		expect(k.overdue).toBe(1);
		expect(k.openCriticalHigh).toBe(2);
		expect(k.unassigned).toBe(3);
		expect(k.undated).toBe(2);
	});

	it("la prossima scadenza è la più vicina da oggi in poi, non una passata", () => {
		const k = computeRemediationKpis(
			[
				task({ task: "Passata", end_date: "2026-11-01" }),
				task({ task: "Lontana", end_date: "2027-03-01" }),
				task({ task: "Vicina", end_date: "2026-12-01" }),
				task({ task: "Oggi", end_date: "2026-11-20" }),
			],
			oggi,
		);
		expect(k.nextDeadline).toEqual({ date: "2026-11-20", task: "Oggi" });
	});

	it("budget null resta sconosciuto, budget 0 è un valore", () => {
		const k = computeRemediationKpis(
			[task({ budget: 10000 }), task({ budget: 0 }), task({ budget: null })],
			oggi,
		);
		expect(k.budgetKnown).toBe(10000);
		expect(k.budgetKnownTasks).toBe(2);
		expect(budgetCoverageLabel(k)).toBe("€10.000 su 2 attività di 3");
	});

	it("senza attività l'avanzamento non esiste", () => {
		const k = computeRemediationKpis([], oggi);
		expect(k.progressAvg).toBeNull();
		expect(budgetCoverageLabel(k)).toBe("—");
	});

	// Caso CSBNO p. 15: otto task allo 0%, assegnatari non indicati.
	it("CSBNO: otto attività aperte, nessun assegnatario", () => {
		const tasks = Array.from({ length: 8 }, (_, i) =>
			task({ priority: i === 0 ? "high" : "medium", budget: i < 2 ? 1 : 10000 }),
		);
		const k = computeRemediationKpis(tasks, oggi);
		expect(k.open).toBe(8);
		expect(k.unassigned).toBe(8);
		expect(k.progressAvg).toBe(0);
		expect(budgetCoverageLabel(k)).toBe("€60.002 su 8 attività di 8");
	});
});

describe("formati", () => {
	it("date, importi e priorità in italiano", () => {
		expect(formatTaskDate("2027-02-02")).toBe("02/02/2027");
		expect(formatTaskDate(null)).toBe("Da pianificare");
		expect(formatEuro(10000)).toBe("€10.000");
		expect(formatEuro(null)).toBe("—");
		expect(priorityLabel("critical")).toBe("Critica");
		expect(priorityLabel("high")).toBe("Alta");
		expect(priorityLabel(null)).toBe("Da valutare");
	});
});
