export interface PlanItem {
	id: string; task_id: string; organization_id: string; title: string; owner: string | null;
	due_date: string | null; cost: number | null; done: boolean; notes: string | null; sort_order: number;
}
export type DueState = "fatto" | "scaduto" | "in_scadenza" | "pianificato" | "senza_data";

/** in_scadenza = due within 7 days (inclusive); scaduto = past due and not done. */
export function dueState(item: Pick<PlanItem, "done" | "due_date">, today = new Date()): DueState {
	if (item.done) return "fatto";
	if (!item.due_date) return "senza_data";
	const d0 = new Date(today.toISOString().slice(0, 10)).getTime();
	const days = Math.round((new Date(item.due_date).getTime() - d0) / 86400000);
	if (days < 0) return "scaduto";
	if (days <= 7) return "in_scadenza";
	return "pianificato";
}
export const DUE_LABELS: Record<DueState, string> = { fatto: "Fatto", scaduto: "Scaduto", in_scadenza: "In scadenza", pianificato: "Pianificato", senza_data: "Senza data" };

export function planTotals(items: PlanItem[], budget: number | null, today = new Date()) {
	const cost = items.reduce((a, i) => a + (Number(i.cost) || 0), 0);
	return {
		cost, done: items.filter((i) => i.done).length, total: items.length,
		overdue: items.filter((i) => dueState(i, today) === "scaduto").length,
		overBudget: budget != null && Number(budget) > 0 && cost > Number(budget),
		pct: items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : 0,
	};
}
