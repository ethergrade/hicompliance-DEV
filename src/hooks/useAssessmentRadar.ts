import { useQuery } from "@tanstack/react-query";
import { assessmentV2Api } from "@/lib/api/assessment-v2";
import { loadV2AssessmentData, mapToUiStatus } from "@/lib/assessmentV2Mapper";
import { calculateCategoryScore, type AssessmentResponse } from "@/data/assessmentQuestions";

export interface RadarPoint {
	category: string;
	fullName: string;
	compliance: number;
	target: number;
}

interface QuestionLike {
	id: number;
	dependency?: string;
}

interface CategoryLike {
	name: string;
	questions: QuestionLike[];
}

/**
 * Visibilità domanda (mirror di Assessment.isQuestionVisible): una domanda con
 * dependency è visibile solo se il genitore è 'pianificato_in_corso'/'completato'.
 */
function isQuestionVisible(
	q: QuestionLike,
	responses: Record<number, AssessmentResponse>,
	categories: CategoryLike[],
): boolean {
	const dep = q.dependency;
	if (!dep) return true;
	const depIdx = parseInt(dep, 10);
	if (isNaN(depIdx) || depIdx < 1 || depIdx === q.id) return true;
	const parent = categories.flatMap((c) => c.questions).find((pq) => pq.id === depIdx);
	if (!parent) return true;
	const ps = responses[parent.id] ?? null;
	return ps === "pianificato_in_corso" || ps === "completato";
}

async function loadRadar(orgId: string, groupId: string | null): Promise<RadarPoint[]> {
	const { categories, indexToUuid } = await loadV2AssessmentData(groupId);
	const items = await assessmentV2Api.responses(orgId, groupId);

	const uuidToIndex: Record<string, number> = {};
	Object.entries(indexToUuid).forEach(([idx, uuid]) => {
		uuidToIndex[uuid as string] = Number(idx);
	});
	const responses: Record<number, AssessmentResponse> = {};
	items.forEach((it) => {
		const idx = uuidToIndex[it.question_id];
		if (idx) responses[idx] = mapToUiStatus(it.status);
	});

	return (categories as CategoryLike[])
		.map((cat) => {
			// isNotApplicable: solo risposte N/A sulle domande visibili (mirror Assessment).
			let na = 0;
			let other = 0;
			for (const q of cat.questions) {
				if (!isQuestionVisible(q, responses, categories as CategoryLike[])) continue;
				const r = responses[q.id];
				if (r === "non_applicabile") na++;
				else if (r) other++;
			}
			const isNotApplicable = na > 0 && other === 0;
			const score = calculateCategoryScore(cat.questions, responses);
			return { name: cat.name, score, isNotApplicable };
		})
		.filter((c) => !c.isNotApplicable)
		.map((c) => ({
			category: c.name.length > 14 ? `${c.name.substring(0, 12)}…` : c.name,
			fullName: c.name,
			compliance: Number.isFinite(c.score) ? c.score : 0,
			target: 90,
		}));
}

/**
 * Radar di conformità NIS2 calcolato live dalle risposte (stessa formula della
 * vista Assessment), così Dashboard/report restano allineati alla lista categorie.
 */
export function useAssessmentRadar(orgId?: string | null, groupId?: string | null) {
	return useQuery({
		queryKey: ["assessment-radar", orgId, groupId],
		enabled: !!orgId,
		queryFn: () => loadRadar(orgId!, groupId ?? null),
	});
}
