import { describe, expect, it } from "vitest";
import type { AssessmentCategory, AssessmentResponse } from "@/data/assessmentQuestions";
import { buildCategoryScore, computeOverallScore } from "./scoring";

let nextId = 1;
const cat = (name: string, n: number, deps: Record<number, number> = {}): AssessmentCategory => {
	const questions = Array.from({ length: n }, (_, i) => {
		const id = nextId++;
		return { id, question: `${name} ${i + 1}`, priority: "MEDIA" as const, dependency: deps[i] ? String(deps[i]) : undefined };
	});
	return { name, questions } as unknown as AssessmentCategory;
};

const answer = (c: AssessmentCategory, values: Array<AssessmentResponse | null>) =>
	Object.fromEntries(
		c.questions.map((q, i) => [q.id, values[i]]).filter(([, v]) => v !== null),
	) as Record<number, AssessmentResponse>;

describe("stato delle categorie (collaudo A02)", () => {
	it("zero reale: risposte applicabili tutte Non iniziato → 0/100 valutata", () => {
		const c = cat("Zero", 2);
		const r = buildCategoryScore(c, answer(c, ["non_iniziato", "non_iniziato"]), [c]);
		expect(r.status).toBe("scored");
		expect(r.displayScore).toBe(0);
	});

	it("tutta N/A → non applicabile, nessun punteggio", () => {
		const c = cat("NA", 3);
		const r = buildCategoryScore(c, answer(c, ["non_applicabile", "non_applicabile", "non_applicabile"]), [c]);
		expect(r.status).toBe("not_applicable");
		expect(r.displayScore).toBeNull();
		expect(r.isNotApplicable).toBe(true);
	});

	it("N/A con domande senza risposta → non valutata, non «non applicabile»", () => {
		const c = cat("NA parziale", 2);
		const r = buildCategoryScore(c, answer(c, ["non_applicabile", null]), [c]);
		expect(r.status).toBe("not_assessed");
		expect(r.displayScore).toBeNull();
	});

	it("nessun dato → non valutata", () => {
		const c = cat("Vuota", 2);
		expect(buildCategoryScore(c, {}, [c]).status).toBe("not_assessed");
	});

	it("risposte applicabili con domande ancora da compilare → parziale con punteggio", () => {
		const c = cat("Parziale", 3);
		const r = buildCategoryScore(c, answer(c, ["completato", null, null]), [c]);
		expect(r.status).toBe("partial");
		expect(r.displayScore).toBe(100);
		expect(r.counts.mancanti).toBe(2);
	});

	it("una domanda nascosta dalla dipendenza non conta come mancante", () => {
		const c = cat("Condizionale", 2);
		// la seconda dipende dalla prima, che è Non iniziato: resta nascosta
		const parent = c.questions[0].id;
		(c.questions[1] as { dependency?: string }).dependency = String(parent);
		const r = buildCategoryScore(c, answer(c, ["non_iniziato", null]), [c]);
		expect(r.visibleTotal).toBe(1);
		expect(r.status).toBe("scored");
	});
});

/**
 * Collaudo A01, numeri reali di CSBNO (ciclo «Assessment 2026»): 128 risposte
 * visibili, 124 applicabili, 4 N/A. Certificazioni tutta N/A, Sviluppo
 * software 1 Non iniziato + 1 N/A = 0/100 valido. 13 aree valutate, 72/100.
 */
describe("CSBNO (collaudo A01)", () => {
	const aree: Array<[string, number, number, number, number]> = [
		// nome, completato, pianificato, non iniziato, N/A
		["Business Continuity, Disaster recovery, Backup", 5, 1, 2, 0],
		["Certificazioni", 0, 0, 0, 3],
		["Crittografia", 6, 0, 0, 0],
		["Gestione delle identità Gestione degli accessi", 15, 1, 0, 0],
		["Gestione degli incidenti", 8, 15, 1, 0],
		["Gestione del rischio", 4, 4, 0, 0],
		["Gestione delle risorse", 12, 0, 0, 0],
		["Gestione fornitori e acquisti", 7, 4, 0, 0],
		["Governance", 1, 4, 3, 0],
		["HR e formazione", 1, 8, 1, 0],
		["Igiene informatica", 3, 2, 0, 0],
		["Manutenzione e miglioramento continuo", 8, 3, 0, 0],
		["Network Security Best Practices & Operations", 4, 0, 0, 0],
		["Sviluppo software", 0, 0, 1, 1],
	];
	const categories: AssessmentCategory[] = [];
	const responses: Record<number, AssessmentResponse> = {};
	for (const [nome, c, p, ni, na] of aree) {
		const values: AssessmentResponse[] = [
			...Array(c).fill("completato"),
			...Array(p).fill("pianificato_in_corso"),
			...Array(ni).fill("non_iniziato"),
			...Array(na).fill("non_applicabile"),
		];
		const category = cat(nome, values.length);
		categories.push(category);
		Object.assign(responses, answer(category, values));
	}
	const scores = categories.map((c) => buildCategoryScore(c, responses, categories));
	const byName = (n: string) => scores.find((s) => s.name === n)!;

	it("128 compilate, 124 applicabili, 4 N/A", () => {
		expect(scores.reduce((a, s) => a + s.answered, 0)).toBe(128);
		expect(scores.reduce((a, s) => a + s.applicable, 0)).toBe(124);
		expect(scores.reduce((a, s) => a + s.counts.non_applicabile, 0)).toBe(4);
	});

	it("Certificazioni non applicabile, Sviluppo software 0/100 valido", () => {
		expect(byName("Certificazioni").status).toBe("not_applicable");
		expect(byName("Certificazioni").displayScore).toBeNull();
		expect(byName("Sviluppo software").status).toBe("scored");
		expect(byName("Sviluppo software").displayScore).toBe(0);
	});

	it("13 aree valutate, punteggio 72/100", () => {
		expect(scores.filter((s) => s.displayScore !== null)).toHaveLength(13);
		expect(computeOverallScore(categories, responses)).toBe(72);
	});
});
