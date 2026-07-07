import { forwardRef } from "react";

export interface PlanTask {
	id: string;
	task: string;
	category: string;
	start_date: string;
	end_date: string;
	progress: number;
	priority: string;
	assignee: string | null;
	budget: number | null;
}

/** Rimuove il prefisso categoria dal nome task (stesso helper del report). */
const stripCategoryPrefix = (task: string, category: string): string => {
	if (category && task.startsWith(category)) {
		const rest = task.slice(category.length).replace(/^[\s:–—-]+/, "").trim();
		return rest || task;
	}
	return task;
};

function computeCounters(tasks: PlanTask[]) {
	const totalBudget = tasks.reduce((s, t) => s + (t.budget || 0), 0);
	const critical = tasks.filter((t) => t.priority === "critical").length;
	const high = tasks.filter((t) => t.priority === "high").length;
	const avgProgress =
		tasks.length > 0
			? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / tasks.length)
			: 0;
	const avgDays =
		tasks.length > 0
			? Math.round(
					tasks.reduce((s, t) => {
						const d = Math.ceil(
							(new Date(t.end_date).getTime() - Date.now()) / 86_400_000,
						);
						return s + Math.max(0, d);
					}, 0) / tasks.length,
				)
			: 0;
	return {
		totalBudget: `€${totalBudget.toLocaleString("it-IT")}`,
		estimatedCompletion: tasks.length > 0 ? `${avgDays} giorni` : "—",
		riskReduction: `${avgProgress}%`,
		complianceImprovement: `${Math.min(100, Math.round(avgProgress * 1.2))}%`,
		criticalIssues: critical,
		highPriorityActions: high,
	};
}

/**
 * Tabella "Piano di Remediation" (stessa del report completo), resa in tema
 * chiaro per la cattura html2canvas. Usata dall'export PDF di /remediation.
 */
export const RemediationPlanTable = forwardRef<HTMLDivElement, { tasks: PlanTask[] }>(
	({ tasks }, ref) => {
		const counters = computeCounters(tasks);
		return (
			<div
				ref={ref}
				className="report-light report-print bg-white text-slate-900"
				style={{ width: 900, padding: 32 }}
			>
				<h2 className="text-lg font-bold mb-4">Piano di Remediation</h2>
				<div className="grid grid-cols-3 gap-3 mb-4">
					{[
						["Budget Totale", counters.totalBudget],
						["Tempo Stimato", counters.estimatedCompletion],
						["Riduzione Rischio", counters.riskReduction],
						["Miglioramento Compliance", counters.complianceImprovement],
						["Criticità", String(counters.criticalIssues)],
						["Azioni Prioritarie", String(counters.highPriorityActions)],
					].map(([label, value]) => (
						<div key={label} className="border border-slate-200 rounded-md p-3">
							<div className="text-xs text-slate-500">{label}</div>
							<div className="text-lg font-bold">{value}</div>
						</div>
					))}
				</div>
				<table className="w-full text-xs border-collapse">
					<thead>
						<tr className="bg-slate-100 text-left">
							<th className="p-2">Categoria</th>
							<th className="p-2">Task</th>
							<th className="p-2">Inizio</th>
							<th className="p-2">Fine</th>
							<th className="p-2">Progresso</th>
							<th className="p-2">Priorità</th>
							<th className="p-2">Assegnatario</th>
							<th className="p-2 text-right">Budget</th>
						</tr>
					</thead>
					<tbody>
						{tasks.map((t) => (
							<tr key={t.id} className="border-b border-slate-100">
								<td className="p-2">{t.category}</td>
								<td className="p-2">{stripCategoryPrefix(t.task, t.category)}</td>
								<td className="p-2">{t.start_date}</td>
								<td className="p-2">{t.end_date}</td>
								<td className="p-2">{t.progress}%</td>
								<td className="p-2 capitalize">{t.priority}</td>
								<td className="p-2">{t.assignee ?? "—"}</td>
								<td className="p-2 text-right">
									{t.budget != null ? `€${t.budget.toLocaleString("it-IT")}` : "—"}
								</td>
							</tr>
						))}
						{tasks.length === 0 && (
							<tr>
								<td className="p-2 text-slate-400" colSpan={8}>
									Nessun task di remediation.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		);
	},
);

RemediationPlanTable.displayName = "RemediationPlanTable";
