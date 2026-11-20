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
 * Metodo del punteggio: lo stesso valore di AssessmentScoring::METHOD nel
 * backend. Uno snapshot con un metodo diverso (o senza, «Metodo precedente»)
 * non si confronta con il punteggio attuale.
 */
export const SCORE_METHOD = 'aree-pesate-2026-11';

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

/**
 * Stato di una categoria, distinto dal punteggio:
 * - `scored`: tutte le domande visibili hanno una risposta, almeno una applicabile;
 * - `partial`: ci sono risposte applicabili ma restano domande visibili senza risposta;
 * - `not_applicable`: tutte le domande visibili sono N/A (nessuna senza risposta);
 * - `not_assessed`: nessuna risposta applicabile (vuota, o N/A con domande ancora da compilare).
 *
 * Prima bastava un N/A con le altre domande senza risposta per dichiarare la
 * categoria non applicabile, e il PDF stampava «0/100 Altissimo» anche per le
 * categorie tutte N/A (Certificazioni di CSBNO).
 */
export type CategoryStatus = 'scored' | 'partial' | 'not_applicable' | 'not_assessed';

export interface CategoryCounts {
  completato: number;
  pianificato_in_corso: number;
  non_iniziato: number;
  non_applicabile: number;
  /** Domande visibili senza risposta. */
  mancanti: number;
}

export interface CategoryScore {
  name: string;
  /** Punteggio grezzo (0 senza risposte applicabili): per compatibilità. */
  score: number;
  /** Punteggio da mostrare: null se la categoria non è valutabile. */
  displayScore: number | null;
  status: CategoryStatus;
  /** Risposte date sulle domande visibili, N/A compresi. */
  answered: number;
  /** Risposte applicabili (Completato, Pianificato, Non iniziato). */
  applicable: number;
  /** Domande visibili. */
  visibleTotal: number;
  counts: CategoryCounts;
  /** Vero solo per `not_applicable`. */
  isNotApplicable: boolean;
}

export function buildCategoryScore(
  cat: AssessmentCategory,
  responses: Record<number, AssessmentResponse>,
  allCategories: AssessmentCategory[]
): CategoryScore {
  const counts: CategoryCounts = {
    completato: 0,
    pianificato_in_corso: 0,
    non_iniziato: 0,
    non_applicabile: 0,
    mancanti: 0,
  };

  let visibleTotal = 0;
  const visibleQuestions: AssessmentQuestion[] = [];
  for (const q of cat.questions) {
    // Only count visible questions, mirroring getCategoryCounts in Assessment.tsx
    if (!isQuestionVisible(q, responses, allCategories)) continue;
    visibleTotal++;
    visibleQuestions.push(q);
    const r = responses[q.id];
    if (r && r in counts) counts[r as keyof CategoryCounts]++;
    else counts.mancanti++;
  }

  const applicable = counts.completato + counts.pianificato_in_corso + counts.non_iniziato;
  const answered = applicable + counts.non_applicabile;

  const status: CategoryStatus =
    applicable === 0
      ? counts.non_applicabile > 0 && counts.mancanti === 0
        ? 'not_applicable'
        : 'not_assessed'
      : counts.mancanti > 0
        ? 'partial'
        : 'scored';

  // Formula unica con il backend (AssessmentScoring, metodo SCORE_METHOD):
  // solo le domande visibili (una condizionale nascosta non conta anche se ha
  // una risposta) e tutte con lo stesso peso, come è sempre stato di fatto
  // (il mapper v2 assegna «MEDIA» a ogni domanda).
  const score = calculateCategoryScore(
    visibleQuestions.map((q) => ({ ...q, priority: 'MEDIA' as const })),
    responses,
  );

  return {
    name: cat.name,
    score,
    displayScore: applicable > 0 ? score : null,
    status,
    answered,
    applicable,
    visibleTotal,
    counts,
    isNotApplicable: status === 'not_applicable',
  };
}

export function computeOverallScore(
  categories: AssessmentCategory[],
  responses: Record<number, AssessmentResponse>
): number {
  const cats = categories.map((c) => buildCategoryScore(c, responses, categories));
  // Solo categorie con risposte applicabili: N/A e categorie vuote fuori dal
  // denominatore (stessa popolazione di prima, detta in modo esplicito).
  const valutate = cats.filter((c) => c.applicable > 0);
  if (valutate.length === 0) return 0;
  return Math.round(valutate.reduce((a, c) => a + c.score, 0) / valutate.length);
}

/** Etichetta italiana dello stato, per tabelle e grafici. */
export const CATEGORY_STATUS_LABELS: Record<CategoryStatus, string> = {
  scored: 'Valutata',
  partial: 'Parziale',
  not_applicable: 'Non applicabile',
  not_assessed: 'Non valutata',
};
