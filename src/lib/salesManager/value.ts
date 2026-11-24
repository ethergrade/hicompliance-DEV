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

/** Plan budget wins; otherwise the sales value; null when neither is set. */
export function effectiveValue(budget: number | null | undefined, proposed: number | null | undefined): number | null {
	if (budget != null && Number(budget) > 0) return Number(budget);
	if (proposed != null && Number(proposed) > 0) return Number(proposed);
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
