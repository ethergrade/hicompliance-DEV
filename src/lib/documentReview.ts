export type ReviewState = 'scaduto' | 'imminente' | 'prossimo' | 'pianificato';

export interface ReviewDoc { id: string; name: string; category: string; document_code?: string | null; review_due_date?: string | null; updated_at?: string; created_at?: string }

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Days from today to due date (negative = overdue). */
export function daysUntil(due: string, today = new Date()): number {
  const [y, m, d] = due.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - startOfDay(today).getTime()) / DAY);
}

/** scaduto < 0 days, imminente within 7 days, prossimo within 30, otherwise pianificato. */
export function reviewState(due: string, today = new Date()): ReviewState {
  const n = daysUntil(due, today);
  if (n < 0) return 'scaduto';
  if (n <= 7) return 'imminente';
  if (n <= 30) return 'prossimo';
  return 'pianificato';
}

export function withReviewDates<T extends ReviewDoc>(docs: T[]): (T & { review_due_date: string })[] {
  return docs.filter((d): d is T & { review_due_date: string } => !!d.review_due_date)
    .sort((a, b) => a.review_due_date.localeCompare(b.review_due_date));
}
