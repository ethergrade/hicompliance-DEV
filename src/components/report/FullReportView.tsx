import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useIsFetching } from "@tanstack/react-query";
import { AssessmentRadarChart } from "@/components/assessment/AssessmentRadarChart";
import { SurfaceScanMailSecurity } from "@/components/surface-scan/SurfaceScanMailSecurity";
import { SurfaceScanTrendline } from "@/components/surface-scan/SurfaceScanTrendline";
import SecurityFindings from "@/components/surface-scan/SecurityFindings";
import ExternalScanIntelligenceSection from "@/components/surface-scan/ExternalScanIntelligenceSection";
import { DarkRiskWeeklyTrend } from "@/components/dark-risk/DarkRiskWeeklyTrend";
import { DarkRiskAssetBreakdown } from "@/features/darkrisk/components/DarkRiskAssetBreakdown";
import { DarkRiskCalendarHeatmap } from "@/features/darkrisk/components/DarkRiskCalendarHeatmap";
import { DarkRiskFiletypePieChart } from "@/features/darkrisk/components/DarkRiskFiletypePieChart";
import { DarkRiskSourcePieChart } from "@/features/darkrisk/components/DarkRiskSourcePieChart";
import { useDarkRiskOverview } from "@/hooks/useDarkRiskOverview";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useFullReportData } from "@/hooks/useFullReportData";
import type { ReportBlock } from "@/lib/report/exportFullReportPdf";
import type { AssessmentCategory, AssessmentResponse } from "@/data/assessmentQuestions";

export interface FullReportReadyPayload {
	blocks: ReportBlock[];
	assessment?: {
		responses: Record<number, AssessmentResponse>;
		categories: AssessmentCategory[];
	};
}

interface FullReportViewProps {
	onReady?: (payload: FullReportReadyPayload) => void;
}

/** Campi anagrafica/consistenze letti dall'organizzazione selezionata. */
type OrgAnag = {
	name?: string;
	legal_name?: string | null;
	vat_number?: string | null;
	industry?: string | null;
	business_sector?: string | null;
	customer_sectors?: string[] | null;
	implemented_technologies?: string[] | null;
	firewalls_count?: number | null;
	endpoints_count?: number | null;
	servers_count?: number | null;
	vms_count?: number | null;
};

const STATUS_COLORS: Record<string, string> = {
	completato: "#22c55e",
	pianificato_in_corso: "#eab308",
	non_iniziato: "#ef4444",
	non_applicabile: "#94a3b8",
};

/**
 * Normalizza il markdown dei consigli OpenAI per il report:
 * - isola i "titoletti" tutti-in-grassetto (es. **Stato Attuale:**, ***Proposta:***)
 *   come paragrafi a sé, con riga vuota prima/dopo (spazio sopra, vicino all'elenco sotto);
 * - converte i restanti newline singoli in hard-break markdown.
 */
/** Rimuove il prefisso categoria dal nome task (già mostrato nella colonna
 *  Categoria): es. "Gestione degli incidenti - Consulenza ISO" → "Consulenza ISO". */
const stripCategoryPrefix = (task: string, category: string): string => {
	if (category && task.startsWith(category)) {
		const rest = task.slice(category.length).replace(/^[\s:–—-]+/, "").trim();
		return rest || task;
	}
	return task;
};

const mdBreaks = (s: string): string => {
	const isLabel = (l: string) => /^\s*\*{2,3}[^*]+\*{2,3}\s*$/.test(l);
	const lines = s.replace(/\r\n?/g, "\n").split("\n");
	const out: string[] = [];
	for (const line of lines) {
		if (isLabel(line)) {
			if (out.length && out[out.length - 1].trim() !== "") out.push("");
			out.push(line.trim());
			out.push("");
		} else {
			out.push(line);
		}
	}
	// hard-break sui newline singoli residui (testo scorrevole), non sui paragrafi
	return out.join("\n").replace(/([^\n])\n(?!\n)/g, "$1  \n");
};

const fmtDate = (d?: string | null) =>
	d
		? new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })
		: "—";

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
	<div className="flex justify-between gap-4 py-1 text-sm border-b border-slate-100">
		<span className="text-slate-500">{label}</span>
		<span className="font-medium text-right">{value}</span>
	</div>
);

/**
 * Vista report aggregata (solo contenuti cliente), renderizzata espansa.
 * Usata sia dalla route /report (debug) sia offscreen per generare il PDF.
 */
const FullReportView: React.FC<FullReportViewProps> = ({ onReady }) => {
	const { assessment, remediation, consistenze, elaborazioneDate, aiCategoryAdvice, isLoading } = useFullReportData();
	const { data: darkRisk } = useDarkRiskOverview();

	const snapshot = darkRisk?.weekly_snapshot ?? null;

	// I campi jsonb possono essere null anche a snapshot presente: ogni grafico
	// va reso solo se ha davvero dei dati, altrimenti nel PDF resta un riquadro
	// vuoto senza spiegazione.
	const hasSourceChart = Object.keys(snapshot?.results_by_source ?? {}).length > 0;
	const hasFiletypeChart = Object.keys(snapshot?.results_by_filetype ?? {}).length > 0;
	const hasDayChart = Object.keys(snapshot?.results_by_day ?? {}).length > 0;

	const severityRows = Object.entries(snapshot?.severity_distribution ?? {}).filter(
		([, count]) => Number(count) > 0,
	);

	// L'API espone by_source/by_filetype in snake_case, il componente li vuole
	// in camelCase: conversione qui, così il componente resta condiviso con le
	// pagine DarkRisk senza adattatori duplicati.
	const assetBreakdown = (() => {
		const raw = snapshot?.results_by_asset;
		if (!raw || Object.keys(raw).length === 0) return null;
		return Object.fromEntries(
			Object.entries(raw).map(([asset, value]) => [
				asset,
				{
					total: Number(value?.total ?? 0),
					bySource: value?.by_source ?? {},
					byFiletype: value?.by_filetype ?? {},
				},
			]),
		);
	})();
	const { selectedOrganization } = useClientOrganization();
	const org = (selectedOrganization ?? null) as unknown as OrgAnag | null;
	const isFetching = useIsFetching();

	const refs = {
		intro: useRef<HTMLDivElement>(null),
		nis2: useRef<HTMLDivElement>(null),
		categorySummary: useRef<HTMLDivElement>(null),
		remediation: useRef<HTMLDivElement>(null),
		surface: useRef<HTMLDivElement>(null),
		darkrisk: useRef<HTMLDivElement>(null),
	};
	const [firedReady, setFiredReady] = useState(false);

	useEffect(() => {
		if (!onReady || firedReady) return;
		if (isLoading || isFetching > 0) return;

		const t = window.setTimeout(() => {
			requestAnimationFrame(() => {
				const blocks: ReportBlock[] = [];
				const push = (ref: React.RefObject<HTMLDivElement>, title: string) => {
					if (ref.current) blocks.push({ title, element: ref.current });
				};
				push(refs.intro, "Anagrafica e Consistenze");
				push(refs.nis2, "Valutazione conformità NIS2");
				push(refs.categorySummary, "Riepilogo e Consigli per Categoria");
				push(refs.remediation, "Piano di Remediation");
				push(refs.surface, "SurfaceScan360 — Esposizione");
				push(refs.darkrisk, "DarkRisk360 — Panoramica");

				onReady({
					blocks,
					assessment: assessment
						? { responses: assessment.responses, categories: assessment.categories }
						: undefined,
				});
				setFiredReady(true);
			});
		}, 600);
		return () => window.clearTimeout(t);
	}, [onReady, firedReady, isLoading, isFetching, assessment, refs.intro, refs.nis2, refs.categorySummary, refs.remediation, refs.surface, refs.darkrisk]);

	const companyName = org?.legal_name || org?.name || "Cliente";
	// I campi possono arrivare come array, stringa JSON (es. '["XDR","MFA"]'),
	// stringa CSV o null: normalizziamo sempre a lista di stringhe.
	const toList = (v: unknown): string[] => {
		if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
		if (typeof v === "string") {
			const s = v.trim();
			if (!s) return [];
			if (s.startsWith("[")) {
				try {
					const parsed = JSON.parse(s);
					if (Array.isArray(parsed))
						return parsed.map((x) => String(x).trim()).filter(Boolean);
				} catch {
					/* fallback CSV sotto */
				}
			}
			return s.split(",").map((x) => x.trim()).filter(Boolean);
		}
		return [];
	};
	const sectors = toList(org?.customer_sectors);
	const solutions = toList(org?.implemented_technologies);

	// Consistenze complete dall'asset inventory (tutti i campi, raggruppati).
	const ci = consistenze;
	const n = (v?: number | null) => (v ?? 0);
	const consistenzeGroups: { title: string; rows: [string, React.ReactNode][] }[] = [
		{
			title: "Infrastruttura",
			rows: [
				["Utenti", n(ci?.users_count)],
				["Sedi", n(ci?.locations_count)],
				["Endpoint", n(ci?.endpoints_count)],
				["Server", n(ci?.servers_count)],
				["Hypervisor", n(ci?.hypervisors_count)],
				["Virtual Machine", n(ci?.virtual_machines_count)],
			],
		},
		{
			title: "Rete",
			rows: [
				["Firewall", n(ci?.firewalls_count)],
				["Core switch", n(ci?.core_switches_count)],
				["Access switch", n(ci?.access_switches_count)],
				["Access point", n(ci?.access_points_count)],
				["Altri dispositivi", n(ci?.miscellaneous_network_devices_count)],
				["Totale dispositivi di rete", n(ci?.total_network_devices_count)],
			],
		},
		{
			title: "Vulnerability Assessment (IP)",
			rows: [
				["IP puntuali", n(ci?.va_ip_punctual_count)],
				["Subnet /25", n(ci?.va_subnet_25_count)],
				["Subnet /24", n(ci?.va_subnet_24_count)],
				["Subnet /23", n(ci?.va_subnet_23_count)],
				["Subnet /22", n(ci?.va_subnet_22_count)],
				["Subnet /21", n(ci?.va_subnet_21_count)],
				["Totale IP", n(ci?.va_total_ips_count)],
			],
		},
		{
			title: "HiLog",
			rows: [
				["Syslog", n(ci?.hilog_syslog_count)],
				["IIS", n(ci?.hilog_iis_count)],
				["Apache", n(ci?.hilog_apache_count)],
				["SQL", n(ci?.hilog_sql_count)],
				["Path custom", n(ci?.hilog_custom_path_count)],
				["Endpoint", n(ci?.hilog_endpoint_count)],
				["Server", n(ci?.hilog_server_count)],
				["DLP Linux", n(ci?.hilog_dlp_linux_count)],
				["DLP Windows", n(ci?.hilog_dlp_windows_count)],
				["SharePoint DLP", ci?.hilog_sharepoint_dlp_enabled ? n(ci?.hilog_sharepoint_dlp_count) : "No"],
				["Entra ID", ci?.hilog_entra_id_enabled ? "Sì" : "No"],
			],
		},
	];

	return (
		<div className="report-light report-print bg-white text-slate-900" style={{ width: 900 }}>
			{/* ── Intestazione: Anagrafica + Consistenze ── */}
			<section ref={refs.intro} className="p-8 bg-white">
				<div className="mb-6">
					<h3 className="text-sm font-semibold text-slate-700 mb-2">Anagrafica</h3>
					<div className="grid grid-cols-2 gap-x-8">
						<InfoRow label="Azienda" value={companyName} />
						<InfoRow label="P.IVA" value={org?.vat_number || "—"} />
						<InfoRow label="Settore" value={org?.industry || org?.business_sector || "—"} />
						<InfoRow label="Settore clienti" value={sectors.length > 0 ? sectors.join(", ") : "—"} />
						<InfoRow label="Compilazione assessment" value={fmtDate(assessment?.assessmentDate)} />
						<InfoRow label="Elaborazione assessment" value={fmtDate(elaborazioneDate)} />
					</div>
					<div className="mt-3">
						<div className="text-sm text-slate-500 mb-1">Soluzioni implementate</div>
						{solutions.length > 0 ? (
							<ul className="list-disc pl-5 text-sm">
								{solutions.map((s) => (
									<li key={s}>{s}</li>
								))}
							</ul>
						) : (
							<div className="text-sm">—</div>
						)}
					</div>
				</div>

				<div>
					<h3 className="text-sm font-semibold text-slate-700 mb-2">Consistenze</h3>
					<div className="grid grid-cols-4 gap-x-8">
						{consistenzeGroups.map((g) => (
							<div key={g.title}>
								<div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
									{g.title}
								</div>
								{g.rows.map(([label, value]) => (
									<InfoRow key={label} label={label} value={value} />
								))}
							</div>
						))}
					</div>
					{ci?.notes ? (
						<div className="mt-3 text-sm">
							<span className="text-slate-500">Note: </span>
							{ci.notes}
						</div>
					) : null}
				</div>
			</section>

			{/* ── Valutazione conformità NIS2 (due colonne: dati + radar) ── */}
			<section ref={refs.nis2} className="p-8 bg-white">
				<h2 className="text-lg font-bold mb-4">Valutazione della conformità alla Direttiva NIS2</h2>
				<div className="grid grid-cols-2 gap-8 items-center">
					<div className="space-y-6">
						<div>
							<div className="text-5xl font-bold text-primary leading-none mb-2">{assessment?.overallScore ?? 0}%</div>
							<div className="text-sm text-slate-500">Conformità Generale alla direttiva NIS2</div>
							<div className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-sm font-medium">
								{assessment?.overallRiskLabel ?? "—"}
							</div>
						</div>
						<div>
							<div className="text-5xl font-bold text-red-500 leading-none mb-2">
								{100 - (assessment?.overallScore ?? 0)}%
							</div>
							<div className="text-sm text-slate-500">Indicatore di rischio</div>
							<div className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-sm font-medium">
								{assessment?.overallRiskLabel ?? "—"}
							</div>
						</div>
					</div>
					<div>
						{assessment && assessment.radar.length > 0 ? (
							<AssessmentRadarChart data={assessment.radar} />
						) : (
							<p className="text-sm text-slate-400">Nessuna risposta disponibile.</p>
						)}
					</div>
				</div>
			</section>

			{/* ── Riepilogo e Consigli per Categoria (barra + testo AI insieme) ── */}
			<section ref={refs.categorySummary} className="p-8 bg-white">
				<h2 className="text-lg font-bold mb-4">Riepilogo e Consigli per Categoria</h2>
				<div className="space-y-4">
					{(assessment?.categorySummaries ?? []).map((cat) => {
						const total = Math.max(1, cat.answered);
						const seg = (n: number) => `${(n / total) * 100}%`;
						const advice = aiCategoryAdvice.find(
							(a) =>
								a.category.toLowerCase() === cat.name.toLowerCase() ||
								a.category.toLowerCase().includes(cat.name.toLowerCase()) ||
								cat.name.toLowerCase().includes(a.category.toLowerCase()),
						);
						return (
							<div key={cat.name} className="border border-slate-200 rounded-md p-4">
								<div className="flex items-center justify-between text-sm mb-2">
									<span className="font-medium">{cat.name}</span>
									<span className="text-slate-500">
										{cat.answered}/{cat.total} · {cat.score}/100 · {cat.riskLabel}
									</span>
								</div>
								<div className="flex h-3 w-full overflow-hidden rounded bg-slate-100">
									{(["completato", "pianificato_in_corso", "non_iniziato", "non_applicabile"] as const).map(
										(k) =>
											cat.counts[k] > 0 ? (
												<div key={k} style={{ width: seg(cat.counts[k]), backgroundColor: STATUS_COLORS[k] }} />
											) : null,
									)}
								</div>
								<div className="mt-1 flex gap-4 text-xs text-slate-500">
									<span>✔ {cat.counts.completato}</span>
									<span>◐ {cat.counts.pianificato_in_corso}</span>
									<span>✗ {cat.counts.non_iniziato}</span>
									<span>N/A {cat.counts.non_applicabile}</span>
								</div>
								{advice && (
									<div className="mt-3 pt-3 border-t border-slate-100 text-sm leading-relaxed [&_p]:mt-4 [&_p]:mb-1 [&>p:first-child]:mt-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mt-1 [&_ul]:mb-2 [&_li]:my-0.5 [&_strong]:font-semibold [&_h3]:font-semibold [&_h3]:mt-4">
										<ReactMarkdown>{mdBreaks(advice.advice)}</ReactMarkdown>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</section>

			{/* ── Remediation: contatori + tabella ── */}
			<section ref={refs.remediation} className="p-8 bg-white">
				<h2 className="text-lg font-bold mb-4">Piano di Remediation</h2>
				{remediation && (
					<div className="grid grid-cols-3 gap-3 mb-4">
						{[
							["Budget Totale", remediation.counters.totalBudget],
							["Tempo Stimato", remediation.counters.estimatedCompletion],
							["Riduzione Rischio", remediation.counters.riskReduction],
							["Miglioramento Compliance", remediation.counters.complianceImprovement],
							["Criticità", String(remediation.counters.criticalIssues)],
							["Azioni Prioritarie", String(remediation.counters.highPriorityActions)],
						].map(([label, value]) => (
							<div key={label} className="border border-slate-200 rounded-md p-3">
								<div className="text-xs text-slate-500">{label}</div>
								<div className="text-lg font-bold">{value}</div>
							</div>
						))}
					</div>
				)}
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
						{(remediation?.tasks ?? []).map((t) => (
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
						{(remediation?.tasks ?? []).length === 0 && (
							<tr>
								<td className="p-2 text-slate-400" colSpan={8}>
									Nessun task di remediation.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</section>

			{/* ── SurfaceScan360 (contenuti cliente) ── */}
			<section ref={refs.surface} className="p-8 bg-white space-y-6">
				<h2 className="text-lg font-bold">SurfaceScan360 — Esposizione</h2>
				<SurfaceScanMailSecurity />
				<SurfaceScanTrendline />
				<SecurityFindings />
				<ExternalScanIntelligenceSection />
			</section>

			{/* ── DarkRisk360 (contenuti cliente) ── */}
			<section ref={refs.darkrisk} className="p-8 bg-white space-y-6">
				<h2 className="text-lg font-bold">DarkRisk360 — Panoramica</h2>
				<div className="grid grid-cols-4 gap-3">
					{[
						["Leak rilevati", snapshot?.total_records ?? 0],
						// Il campo sullo snapshot è new_records_this_week: leggere
						// new_this_week (che esiste solo come alias top-level)
						// mostrava sempre 0.
						["Nuovi nel periodo", snapshot?.new_records_this_week ?? 0],
						["Indice di rischio", `${darkRisk?.kpis.risk_score.value ?? 0}/100`],
						["Target monitorati", darkRisk?.kpis.monitored_domains.value ?? 0],
					].map(([label, value]) => (
						<div key={label as string} className="border border-slate-200 rounded-md p-3">
							<div className="text-xs text-slate-500">{label}</div>
							<div className="text-lg font-bold">{value}</div>
						</div>
					))}
				</div>

				<DarkRiskWeeklyTrend />

				{/* Distribuzione per severità: dato aggregato, nessun contenuto sensibile. */}
				{severityRows.length > 0 && (
					<div>
						<h3 className="text-sm font-semibold text-slate-700 mb-2">Severità delle evidenze</h3>
						<div className="flex flex-wrap gap-2">
							{severityRows.map(([severity, count]) => (
								<span
									key={severity}
									className="border border-slate-200 rounded px-2 py-1 text-xs capitalize"
								>
									{severity}: <strong>{count}</strong>
								</span>
							))}
						</div>
					</div>
				)}

				{hasSourceChart && (
					<div className="grid grid-cols-2 gap-6">
						<DarkRiskSourcePieChart
							data={snapshot!.results_by_source!}
							title="Risultati per sorgente"
						/>
						{hasFiletypeChart && (
							<DarkRiskFiletypePieChart
								data={snapshot!.results_by_filetype!}
								title="Risultati per tipo di file"
							/>
						)}
					</div>
				)}

				{hasDayChart && (
					<DarkRiskCalendarHeatmap
						data={snapshot!.results_by_day!}
						title="Evidenze per data di leak"
					/>
				)}

				{assetBreakdown && <DarkRiskAssetBreakdown data={assetBreakdown} />}

				{!snapshot && (
					<p className="text-sm text-slate-500">
						Nessuna scansione DarkRisk360 completata: l'analisi aggregata sarà disponibile
						dopo la prima esecuzione settimanale.
					</p>
				)}
			</section>
		</div>
	);
};

export default FullReportView;
