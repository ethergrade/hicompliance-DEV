/**
 * KPI del piano di remediation: un solo calcolo per la pagina Remediation e
 * per il report PDF.
 *
 * Prima i due calcolavano «Riduzione rischio» come media dell'avanzamento,
 * «Miglioramento compliance» come la stessa media × 1,2 e «Tempo stimato» come
 * media dei giorni residui: nomi che promettevano benefici non misurati. Qui
 * restano solo grandezze verificabili sulle righe del piano. Un budget non
 * indicato resta sconosciuto, non vale zero.
 */

export interface RemediationTaskLike {
	id?: string;
	task: string;
	priority?: string | null;
	end_date?: string | null;
	start_date?: string | null;
	progress?: number | null;
	is_done?: boolean | null;
	assignee?: string | null;
	budget?: number | null;
}

export interface RemediationKpis {
	total: number;
	open: number;
	closed: number;
	/** Aperte con priorità critica o alta. */
	openCriticalHigh: number;
	/** Aperte con scadenza passata. */
	overdue: number;
	/** Aperte senza assegnatario. */
	unassigned: number;
	/** Aperte senza una data di fine valida. */
	undated: number;
	/** La scadenza aperta più vicina, da oggi in poi. */
	nextDeadline: { date: string; task: string } | null;
	/** Media dell'avanzamento dichiarato su tutte le attività (null se non ce ne sono). */
	progressAvg: number | null;
	/** Somma dei budget indicati e su quante attività. */
	budgetKnown: number;
	budgetKnownTasks: number;
}

const CRITICAL_HIGH = new Set(["critical", "high", "critica", "alta"]);

/** Data «YYYY-MM-DD» (o ISO) a mezzanotte locale; null se non valida. */
export const parseTaskDate = (value: string | null | undefined): Date | null => {
	if (!value) return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
	if (!match) return null;
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	return Number.isNaN(date.getTime()) ? null : date;
};

export const isTaskClosed = (task: RemediationTaskLike): boolean =>
	task.is_done === true || (typeof task.progress === "number" && task.progress >= 100);

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const computeRemediationKpis = (
	tasks: RemediationTaskLike[],
	today: Date = new Date(),
): RemediationKpis => {
	const oggi = startOfDay(today);
	const open = tasks.filter((t) => !isTaskClosed(t));

	let nextDeadline: RemediationKpis["nextDeadline"] = null;
	let overdue = 0;
	let undated = 0;
	for (const task of open) {
		const end = parseTaskDate(task.end_date);
		if (!end) {
			undated++;
			continue;
		}
		if (end < oggi) {
			overdue++;
		} else if (!nextDeadline || end < (parseTaskDate(nextDeadline.date) as Date)) {
			nextDeadline = { date: String(task.end_date).slice(0, 10), task: task.task };
		}
	}

	const withBudget = tasks.filter((t) => typeof t.budget === "number" && Number.isFinite(t.budget));

	return {
		total: tasks.length,
		open: open.length,
		closed: tasks.length - open.length,
		openCriticalHigh: open.filter((t) => CRITICAL_HIGH.has(String(t.priority ?? "").toLowerCase())).length,
		overdue,
		unassigned: open.filter((t) => !String(t.assignee ?? "").trim()).length,
		undated,
		nextDeadline,
		progressAvg: tasks.length
			? Math.round(tasks.reduce((sum, t) => sum + (Number(t.progress) || 0), 0) / tasks.length)
			: null,
		budgetKnown: withBudget.reduce((sum, t) => sum + (t.budget as number), 0),
		budgetKnownTasks: withBudget.length,
	};
};

/* ─── Formati italiani condivisi da pagina e PDF ─── */

const PRIORITY_LABELS: Record<string, string> = {
	critical: "Critica",
	high: "Alta",
	medium: "Media",
	low: "Bassa",
};

export const priorityLabel = (priority: string | null | undefined): string =>
	PRIORITY_LABELS[String(priority ?? "").toLowerCase()] ?? (priority ? String(priority) : "Da valutare");

/** Ordine di priorità per gli elenchi: critica prima. */
export const priorityRank = (priority: string | null | undefined): number =>
	({ critical: 0, high: 1, medium: 2, low: 3 })[String(priority ?? "").toLowerCase()] ?? 4;

/** 02/02/2027; «Da pianificare» se manca. */
export const formatTaskDate = (value: string | null | undefined): string => {
	const date = parseTaskDate(value);
	return date ? date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Da pianificare";
};

/** €10.000 (senza decimali); «—» se sconosciuto. */
export const formatEuro = (value: number | null | undefined): string =>
	typeof value === "number" && Number.isFinite(value)
		? `€${Math.round(value).toLocaleString("it-IT")}`
		: "—";

export const assigneeLabel = (assignee: string | null | undefined): string =>
	String(assignee ?? "").trim() || "Da assegnare";

/** «€60.002 su 8 attività di 8»: il budget dichiara quante righe lo hanno. */
export const budgetCoverageLabel = (kpis: RemediationKpis): string =>
	kpis.total === 0
		? "—"
		: kpis.budgetKnownTasks === 0
			? "Non indicato"
			: `${formatEuro(kpis.budgetKnown)} su ${kpis.budgetKnownTasks} attività di ${kpis.total}`;
