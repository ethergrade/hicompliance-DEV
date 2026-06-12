import { assessmentV2Api } from '@/lib/api/assessment-v2';
import type { AssessmentCategory, AssessmentQuestion } from '@/data/assessmentQuestions';

/**
 * Maps v2 API categories+questions to the UI format (numeric IDs, question field).
 * Returns the re-mapped categories and a uuid ↔ index lookup table.
 */
export async function loadV2AssessmentData() {
  const categories = await assessmentV2Api.categories();
  const questions = await assessmentV2Api.questions();

  // Build a map: question UUID → sequential index (1-based, matching UI)
  const sortedQs = [...questions].sort((a, b) => a.order_index - b.order_index);
  const uuidToIndex: Record<string, number> = {};
  sortedQs.forEach((q, i) => {
    uuidToIndex[q.id] = i + 1;
  });

  // Map categories to UI format
  const uiCategories: AssessmentCategory[] = categories
    .sort((a, b) => a.order_index - b.order_index)
    .map((cat) => ({
      name: cat.name,
      questions: cat.questions
        .sort((a, b) => a.order_index - b.order_index)
        .map((q) => ({
          id: uuidToIndex[q.id] ?? 0,
          question: q.question_text,
          priority: "MEDIA" as const,
        })),
    }));

  // Build reverse map: index → UUID
  const indexToUuid: Record<number, string> = {};
  Object.entries(uuidToIndex).forEach(([uuid, idx]) => {
    indexToUuid[idx] = uuid;
  });

  return {
    categories: uiCategories,
    uuidToIndex,
    indexToUuid,
  };
}

/**
 * Map UI numeric status strings to v2 API status values.
 */
export function mapToV2Status(
  uiStatus: string | null | undefined
): 'not_applicable' | 'planned_in_progress' | 'completed' | 'not_started' | null {
  if (!uiStatus) return null;
  const map: Record<string, 'not_applicable' | 'planned_in_progress' | 'completed' | 'not_started'> = {
    completato: 'completed',
    pianificato_in_corso: 'planned_in_progress',
    non_applicabile: 'not_applicable',
    non_iniziato: 'not_started',
  };
  return map[uiStatus] ?? null;
}

/**
 * Map v2 API status string to UI format.
 */
export function mapToUiStatus(
  v2Status: string | null | undefined
): 'completato' | 'pianificato_in_corso' | 'non_iniziato' | 'non_applicabile' | null {
  if (!v2Status) return null;
  const map: Record<string, 'completato' | 'pianificato_in_corso' | 'non_applicabile' | 'non_iniziato'> = {
    completed: 'completato',
    planned_in_progress: 'pianificato_in_corso',
    not_applicable: 'non_applicabile',
    not_started: 'non_iniziato',
  };
  return map[v2Status] ?? null;
}
