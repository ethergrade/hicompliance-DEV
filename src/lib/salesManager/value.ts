export const COMMERCIAL_STATUSES = [
	"proposto", "inviato", "in_trattativa", "accettato", "rifiutato", "in_esecuzione", "completato",
] as const;
export type CommercialStatus = (typeof COMMERCIAL_STATUSES)[number];

export const STATUS_LABELS: Record<CommercialStatus, string> = {
	proposto: "Proposto", inviato: "Inviato", in_trattativa: "In trattativa", accettato: "Accettato",
	rifiutato: "Rifiutato", in_esecuzione: "In esecuzione", completato: "Completato",
};

const NEXT: Record<CommercialStatus, CommercialStatus[]> = {
	proposto: ["inviato"],
	inviato: ["in_trattativa", "accettato", "rifiutato", "proposto"],
	in_trattativa: ["accettato", "rifiutato", "inviato"],
	accettato: ["in_esecuzione", "in_trattativa"],
	rifiutato: ["proposto"],
	in_esecuzione: ["completato", "accettato"],
	completato: ["in_esecuzione"],
};
export const nextStatuses = (s: CommercialStatus) => NEXT[s] ?? [];
export const canMove = (from: CommercialStatus, to: CommercialStatus) => NEXT[from]?.includes(to) ?? false;

/** Sales value (set in Sales Manager) wins; otherwise the plan budget; null when neither is set. */
export function effectiveValue(budget: number | null | undefined, proposed: number | null | undefined): number | null {
	if (proposed != null && Number(proposed) > 0) return Number(proposed);
	if (budget != null && Number(budget) > 0) return Number(budget);
	return null;
}

export interface SalesRow {
	taskId: string; organizationId: string; task: string; category: string; priority: string;
	progress: number; budget: number | null; proposedValue: number | null;
	status: CommercialStatus; notes: string | null; proposedAt: string | null; closedAt: string | null; updatedAt: string;
}
export interface ClientSummary {
	organizationId: string; name: string; total: number; unvalued: number;
	byStatus: Record<CommercialStatus, number>; pipelineValue: number; acceptedValue: number; lastUpdate: string | null;
}
const WON: CommercialStatus[] = ["accettato", "in_esecuzione", "completato"];
export const isWon = (s: CommercialStatus) => WON.includes(s);

export function summarize(orgs: { id: string; name: string }[], rows: SalesRow[]): ClientSummary[] {
	return orgs.map((o) => {
		const r = rows.filter((x) => x.organizationId === o.id);
		const byStatus = Object.fromEntries(COMMERCIAL_STATUSES.map((s) => [s, 0])) as Record<CommercialStatus, number>;
		let pipelineValue = 0, acceptedValue = 0, unvalued = 0; let lastUpdate: string | null = null;
		for (const x of r) {
			byStatus[x.status]++;
			const v = effectiveValue(x.budget, x.proposedValue);
			if (v == null) unvalued++;
			else { if (x.status !== "rifiutato") pipelineValue += v; if (isWon(x.status)) acceptedValue += v; }
			if (!lastUpdate || x.updatedAt > lastUpdate) lastUpdate = x.updatedAt;
		}
		return { organizationId: o.id, name: o.name, total: r.length, unvalued, byStatus, pipelineValue, acceptedValue, lastUpdate };
	});
}

export const eur = (n: number | null) => n == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Annual KPI: won remediations closed in the year (closedAt, else updatedAt) against the target. */
export function annualKpi(rows: SalesRow[], year: number, target: { value: number; count: number }) {
	const won = rows.filter((r) => isWon(r.status) && new Date(r.closedAt ?? r.updatedAt ?? 0).getFullYear() === year);
	const value = won.reduce((a, r) => a + (effectiveValue(r.budget, r.proposedValue) ?? 0), 0);
	return {
		wonValue: value, wonCount: won.length,
		remainingValue: Math.max(0, target.value - value), remainingCount: Math.max(0, target.count - won.length),
		pctValue: target.value > 0 ? Math.min(100, Math.round((value / target.value) * 100)) : 0,
		pctCount: target.count > 0 ? Math.min(100, Math.round((won.length / target.count) * 100)) : 0,
	};
}
