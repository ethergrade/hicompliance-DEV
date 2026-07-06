import {
  AssessmentCategory,
  AssessmentQuestion,
  AssessmentResponse,
  calculateCategoryScore,
} from '@/data/assessmentQuestions';

/**
 * Shared assessment scoring — single source of truth used by both the
 * /assessment page and the dashboard so the two never drift.
 *
 * Replicates exactly the client-side computation in Assessment.tsx:
 *  - per-category score via calculateCategoryScore (weighted by priority)
 *  - counts only VISIBLE questions (dependency-aware), mirroring getCategoryCounts
 *  - overall score = simple average of category scores, considering only
 *    categories that have at least one answer and are not fully N/A.
 */

/**
 * A question is visible unless it depends on a parent that is not in an
 * "active" state (planned/completed). Mirrors Assessment.tsx isQuestionVisible.
 */
export function isQuestionVisible(
  q: Pick<AssessmentQuestion, 'id' | 'dependency'>,
  responses: Record<number, AssessmentResponse>,
  allCategories: AssessmentCategory[]
): boolean {
  const dep = q.dependency;
  if (!dep) return true;
  const depIdx = parseInt(dep, 10);
  if (isNaN(depIdx) || depIdx < 1) return true;
  // Self-reference guard: a question depending on itself is always visible
  if (depIdx === q.id) return true;

  const parentQ = allCategories.flatMap((c) => c.questions).find((pq) => pq.id === depIdx);
  if (!parentQ) return true;

  const parentStatus = responses[parentQ.id] || null;
  return parentStatus === 'pianificato_in_corso' || parentStatus === 'completato';
}

export interface CategoryScore {
  name: string;
  score: number;
  answered: number;
  isNotApplicable: boolean;
}

export function buildCategoryScore(
  cat: AssessmentCategory,
  responses: Record<number, AssessmentResponse>,
  allCategories: AssessmentCategory[]
): CategoryScore {
  const counts = {
    completato: 0,
    pianificato_in_corso: 0,
    non_iniziato: 0,
    non_applicabile: 0,
  };

  for (const q of cat.questions) {
    // Only count visible questions, mirroring getCategoryCounts in Assessment.tsx
    if (!isQuestionVisible(q, responses, allCategories)) continue;
    const r = responses[q.id];
    if (r && counts[r] !== undefined) counts[r]++;
  }

  const answered =
    counts.completato +
    counts.pianificato_in_corso +
    counts.non_iniziato +
    counts.non_applicabile;

  const isNotApplicable =
    counts.non_applicabile > 0 &&
    counts.completato === 0 &&
    counts.pianificato_in_corso === 0 &&
    counts.non_iniziato === 0;

  return {
    name: cat.name,
    // Score intentionally uses all answered questions (calculateCategoryScore
    // ignores visibility), identical to Assessment.tsx behavior.
    score: calculateCategoryScore(cat.questions, responses),
    answered,
    isNotApplicable,
  };
}

export function computeOverallScore(
  categories: AssessmentCategory[],
  responses: Record<number, AssessmentResponse>
): number {
  const cats = categories.map((c) => buildCategoryScore(c, responses, categories));
  const withAnswers = cats.filter((c) => c.answered > 0 && !c.isNotApplicable);
  if (withAnswers.length === 0) return 0;
  return Math.round(
    withAnswers.reduce((a, c) => a + c.score, 0) / withAnswers.length
  );
}
