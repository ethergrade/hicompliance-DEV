import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/assessment_scoring_cases.json";
import { buildCategoryScore, computeOverallScore } from "./scoring";
import type { AssessmentCategory, AssessmentResponse } from "@/data/assessmentQuestions";

/**
 * Stessi casi del backend (tests/Fixtures/assessment_scoring_cases.json, test
 * AssessmentScoringTest): se le due formule divergono, uno dei due fallisce.
 */
const V2_TO_UI: Record<string, AssessmentResponse> = {
	completed: "completato",
	planned_in_progress: "pianificato_in_corso",
	not_started: "non_iniziato",
	not_applicable: "non_applicabile",
};

type Case = (typeof fixture.cases)[number];

const build = (c: Case) => {
	const categories: AssessmentCategory[] = [];
	for (const q of c.questions as Array<{ order: number; category: string; dependency?: string }>) {
		let cat = categories.find((x) => x.name === q.category);
		if (!cat) {
			cat = { name: q.category, questions: [] };
			categories.push(cat);
		}
		// Priorità diversa di proposito: il punteggio non deve dipenderne.
		cat.questions.push({ id: q.order, question: `D${q.order}`, priority: "ALTA", dependency: q.dependency });
	}
	const responses: Record<number, AssessmentResponse> = {};
	for (const [order, status] of Object.entries(c.statuses as Record<string, string>)) {
		responses[Number(order)] = V2_TO_UI[status];
	}
	return { categories, responses };
};

describe("formula del punteggio Assessment condivisa con il backend", () => {
	for (const c of fixture.cases) {
		it(c.name, () => {
			const { categories, responses } = build(c);
			const scores = categories.map((cat) => buildCategoryScore(cat, responses, categories));

			expect(computeOverallScore(categories, responses)).toBe(c.expected.overall);
			expect(scores.filter((s) => s.displayScore !== null).length).toBe(c.expected.scored);
			for (const [name, exp] of Object.entries(c.expected.categories as Record<string, { score: number | null; status: string }>)) {
				const s = scores.find((x) => x.name === name)!;
				expect(s.displayScore, `punteggio di ${name}`).toBe(exp.score);
				expect(s.status, `stato di ${name}`).toBe(exp.status);
			}
		});
	}
});
