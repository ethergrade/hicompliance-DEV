/**
 * Report di sicurezza e conformità: composizione del documento.
 *
 * Ordine (specifica FIX8 di Luca): copertina, indice, sintesi, piano, risultati
 * per area, SurfaceScan360, DarkRisk360, appendici. Chi legge solo le prime
 * pagine trova punteggio, copertura delle fonti, fino a tre priorità con il
 * prossimo passo, e le prime azioni del piano; il dettaglio sta in appendice.
 *
 * Tutto deriva dall'input di `collectReportData`: nessun numero viene inventato
 * e una fonte non disponibile compare come tale, mai come zero.
 */
import { getRiskFromScore } from "@/data/assessmentQuestions";
import { CATEGORY_STATUS_LABELS, isQuestionVisible, type CategoryScore } from "@/lib/assessment/scoring";
import { parseAiCategoryAdvice } from "@/lib/report/parseAiCategories";
import {
	assigneeLabel,
	budgetCoverageLabel,
	computeRemediationKpis,
	formatEuro,
	formatTaskDate,
	isTaskClosed,
	priorityLabel,
	priorityRank,
	parseTaskDate,
} from "@/lib/remediation/kpis";
import { toCvss } from "@/lib/surfacescan/normalize";
import { MAIL_STATUS_LABEL } from "@/lib/surfacescan/mailSecurity";
import type { RemediationTask } from "@/types/api";
import type { ReportData, SourceResult } from "../collectReportData";
import { BRAND, CONTENT_W, PAGE, PdfWriter, RISK_BAND, SEVERITY, type Cell, type ReportFonts, type RGB } from "./writer";
import { formatLongDate, formatNumberIt, formatShortDate, markdownToBlocks, maskEmail, pdfSafe } from "./text";

const RESPONSE_LABEL: Record<string, string> = {
	completato: "Completato",
	pianificato_in_corso: "Pianificato / in corso",
	non_iniziato: "Non iniziato",
	non_applicabile: "Non applicabile",
};

const SEVERITY_LABEL: Record<string, string> = {
	critical: "Critica",
	high: "Alta",
	medium: "Media",
	low: "Bassa",
	info: "Informativa",
};
const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

/** «1 controllo», «2 controlli». */
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const bandColor = (label: string | null | undefined): RGB => RISK_BAND[String(label)] ?? BRAND.navy;

const surfaceLevelColor = (level: string | null): RGB =>
	level === "Critico" ? SEVERITY.critical : level === "Alto" ? SEVERITY.high : level === "Medio" ? SEVERITY.medium : level === "Basso" ? RISK_BAND.Basso : BRAND.navy;

const sourceStateLabel = (s: SourceResult<unknown>): string =>
	s.status === "ok"
		? "Disponibile"
		: s.status === "empty"
			? "Nessun dato"
			: s.status === "not_active"
				? "Servizio non attivo"
				: s.status === "timeout"
					? "Non disponibile: la fonte non ha risposto in tempo"
					: `Non disponibile${s.reason ? `: ${s.reason}` : ""}`;

const num = (value: unknown): number | null => {
	if (value === null || value === undefined || value === "") return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
};

const obj = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toList = (value: unknown): string[] => {
	if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
	if (typeof value === "string") {
		const s = value.trim();
		if (!s) return [];
		if (s.startsWith("[")) {
			try {
				const parsed = JSON.parse(s);
				if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
			} catch {
				/* CSV sotto */
			}
		}
		return s.split(",").map((x) => x.trim()).filter(Boolean);
	}
	return [];
};

async function loadLogo(url: string): Promise<string | null> {
	try {
		const response = await fetch(url);
		const blob = await response.blob();
		return await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

/* ─────────────────────────── Modello derivato ─────────────────────────── */

interface Priority {
	weight: number;
	what: string;
	why: string;
	next: string;
	ref: string;
}

interface Derived {
	scores: CategoryScore[];
	scored: CategoryScore[];
	excluded: CategoryScore[];
	overall: number | null;
	overallBand: string | null;
	answered: number;
	visible: number;
	applicable: number;
	notApplicable: number;
	tasks: RemediationTask[];
	openTasks: RemediationTask[];
	kpis: ReturnType<typeof computeRemediationKpis>;
	surfaceIncluded: boolean;
	darkIncluded: boolean;
	dark: Record<string, unknown>;
	darkSnapshot: Record<string, unknown>;
	catIndex: Map<string, number>;
}

function derive(data: ReportData): Derived {
	const assessment = data.assessment.data;
	const scores = assessment?.scores ?? [];
	const scored = scores.filter((s) => s.displayScore !== null);
	const excluded = scores.filter((s) => s.displayScore === null);
	const tasks = data.remediation.data ?? [];
	const dark = obj(data.darkRisk.data);
	return {
		scores,
		scored,
		excluded,
		overall: assessment && scored.length ? assessment.overallScore : null,
		overallBand: assessment && scored.length ? getRiskFromScore(assessment.overallScore).label : null,
		answered: scores.reduce((a, s) => a + s.answered, 0),
		visible: scores.reduce((a, s) => a + s.visibleTotal, 0),
		applicable: scores.reduce((a, s) => a + s.applicable, 0),
		notApplicable: scores.reduce((a, s) => a + s.counts.non_applicabile, 0),
		tasks,
		openTasks: tasks.filter((t) => !isTaskClosed(t)),
		kpis: computeRemediationKpis(tasks, data.generatedAt),
		surfaceIncluded: data.surfaceScan.status !== "not_active",
		darkIncluded: data.darkRisk.status !== "not_active" && dark.enabled !== false,
		dark,
		darkSnapshot: obj(dark.weekly_snapshot),
		catIndex: new Map(scores.map((s, i) => [s.name, i + 1])),
	};
}

/** Fino a tre priorità, da regole fisse: ogni voce porta l'evidenza e il passo successivo. */
function priorities(data: ReportData, d: Derived): Priority[] {
	const out: Priority[] = [];
	const coveredAreas = new Set<string>();

	const taskFor = (area: string) =>
		d.openTasks
			.filter((t) => t.category === area)
			.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))[0];

	const nextFromTask = (t: RemediationTask | undefined) =>
		t
			? `«${t.task}» · ${assigneeLabel(t.assignee)} · scadenza ${formatTaskDate(t.end_date)}`
			: "Da valutare: assegnare un responsabile e pianificare l'intervento con il criterio di verifica.";

	for (const s of d.scored) {
		if (s.displayScore === null || s.displayScore >= 40) continue;
		const band = getRiskFromScore(s.displayScore).label;
		const task = taskFor(s.name);
		coveredAreas.add(s.name);
		out.push({
			weight: s.displayScore < 20 ? 1 : 4,
			what: `Rafforzare l'area «${s.name}»`,
			why: `${s.displayScore}/100, rischio ${band.toLowerCase()}: ${plural(s.counts.non_iniziato, "controllo non iniziato", "controlli non iniziati")} e ${plural(s.counts.pianificato_in_corso, "pianificato o in corso", "pianificati o in corso")}.`,
			next: nextFromTask(task),
			ref: `Appendice A, area A${d.catIndex.get(s.name)}${task ? "; piano, Appendice B" : ""}`,
		});
	}

	for (const t of d.openTasks) {
		const p = String(t.priority).toLowerCase();
		if ((p !== "critical" && p !== "high") || coveredAreas.has(t.category)) continue;
		out.push({
			weight: p === "critical" ? 2 : 5,
			what: t.task,
			why: `Attività del piano a priorità ${priorityLabel(t.priority).toLowerCase()} nell'area «${t.category}», avanzamento ${t.progress ?? 0}%.`,
			next: `${assigneeLabel(t.assignee)} · scadenza ${formatTaskDate(t.end_date)}`,
			ref: "Piano, Appendice B",
		});
	}

	const ss = data.surfaceScan.data;
	if (ss) {
		const confirmed = ss.findings.filter(
			(f) => (f.severity === "critical" || f.severity === "high") && f.attribution_confidence !== "low" && f.finding_type !== "shodan_cve_signal_unattributed",
		);
		for (const sev of ["critical", "high"] as const) {
			const rows = confirmed.filter((f) => f.severity === sev).sort((a, b) => (toCvss(b.cvss) ?? 0) - (toCvss(a.cvss) ?? 0));
			if (!rows.length) continue;
			const top = rows[0];
			out.push({
				weight: sev === "critical" ? 0 : 3,
				what: `Correggere: ${top.title}`,
				why: `${plural(rows.length, "finding SurfaceScan360 aperto", "finding SurfaceScan360 aperti")} di gravità ${SEVERITY_LABEL[sev].toLowerCase()}; il primo riguarda ${top.affected_asset || top.ip || "un asset del perimetro"}${toCvss(top.cvss) !== null ? ` (CVSS ${formatNumberIt(toCvss(top.cvss) as number)})` : ""}.`,
				next: "Da valutare: assegnare l'intervento e verificarne la chiusura con una nuova scansione.",
				ref: "SurfaceScan360, Appendice D",
			});
		}
	}

	const sevDist = obj(d.darkSnapshot.severity_distribution);
	const darkHigh = (num(sevDist.critical) ?? 0) + (num(sevDist.high) ?? 0);
	if (d.darkIncluded && darkHigh > 0) {
		out.push({
			weight: 6,
			what: "Valutare le evidenze DarkRisk360 di gravità alta",
			why: `${plural(darkHigh, "evidenza aperta", "evidenze aperte")} di gravità critica o alta nell'ultimo aggiornamento settimanale.`,
			next: "Verificare la pertinenza nella Console DarkRisk360 e prenderle in carico.",
			ref: "DarkRisk360",
		});
	}

	return out.sort((a, b) => a.weight - b.weight).slice(0, 3);
}

/* ─────────────────────────── Sezioni ─────────────────────────── */

function cover(w: PdfWriter, data: ReportData, d: Derived, logo: string | null): void {
	const doc = w.doc;
	if (logo) doc.addImage(logo, "PNG", PAGE.marginX, 24, 60, 60 / 3.54);
	doc.setDrawColor(...BRAND.orange);
	doc.setLineWidth(1.2);
	doc.line(PAGE.marginX, 70, PAGE.marginX + 40, 70);

	w.y = 82;
	w.font(24, "bold", BRAND.navy);
	for (const line of w.split("Report di sicurezza e conformità", CONTENT_W)) {
		doc.text(line, PAGE.marginX, w.y, { baseline: "top" });
		w.y += w.lineHeight(24);
	}
	w.y += 4;
	w.font(16, "normal", BRAND.text);
	for (const line of w.split(data.companyName, CONTENT_W)) {
		doc.text(line, PAGE.marginX, w.y, { baseline: "top" });
		w.y += w.lineHeight(16);
	}
	w.y += 8;

	const campaign = data.campaigns.data?.current;
	const rows: Array<[string, string]> = [
		["Data di generazione", formatLongDate(data.generatedAt)],
		["Ciclo di assessment", campaign ? `${campaign.label}${campaign.is_confirmed ? " (confermato)" : " (in compilazione)"}` : "Non disponibile"],
		[
			"Contenuti",
			["Assessment", "Piano di remediation", d.surfaceIncluded ? "SurfaceScan360" : null, d.darkIncluded ? "DarkRisk360" : null]
				.filter(Boolean)
				.join(", "),
		],
	];
	for (const [label, value] of rows) {
		w.font(9, "normal", BRAND.muted);
		doc.text(pdfSafe(label), PAGE.marginX, w.y, { baseline: "top" });
		w.font(10.5, "normal", BRAND.text);
		const lines = w.split(value, CONTENT_W - 45);
		lines.forEach((line, k) => doc.text(line, PAGE.marginX + 45, w.y + k * w.lineHeight(10.5), { baseline: "top" }));
		w.y += Math.max(lines.length * w.lineHeight(10.5), 5) + 2;
	}

	w.font(8.5, "normal", BRAND.muted);
	const note = w.split(
		`Documento riservato, destinato a ${data.companyName}. Contiene informazioni sulla sicurezza dell'organizzazione: va condiviso solo con chi deve intervenire. Prodotto con HiSolution Console.`,
		CONTENT_W,
	);
	note.forEach((line, k) => doc.text(line, PAGE.marginX, PAGE.height - 34 + k * w.lineHeight(8.5), { baseline: "top" }));
}

function tocPage(w: PdfWriter): number {
	w.addPage();
	const page = w.pageNumber;
	w.heading("Indice", 1, { toc: false, keepWith: 0 });
	// Le voci si scrivono a documento finito, quando le pagine sono note.
	return page;
}

function summary(w: PdfWriter, data: ReportData, d: Derived): void {
	w.addPage();
	w.heading("Sintesi", 1);

	const ss = data.surfaceScan.data;
	const darkIndex = num(d.dark.risk_index);
	const darkLevel = (d.dark.risk_level as string | null) ?? null;

	const cards: Array<{ label: string; value: string; hint?: string | null; color?: RGB }> = [
		{
			label: "Punteggio assessment",
			value: d.overall !== null ? `${d.overall}/100` : "Non valutato",
			hint:
				d.overall !== null
					? `Rischio ${String(d.overallBand).toLowerCase()} · ${d.scored.length} aree valutate${d.excluded.length ? `, ${d.excluded.length} esclus${d.excluded.length === 1 ? "a" : "e"}` : ""}`
					: sourceStateLabel(data.assessment),
			color: bandColor(d.overallBand),
		},
		{
			label: "Questionario",
			value: d.visible ? `${d.answered}/${d.visible} compilate` : "Non disponibile",
			hint: d.visible ? `${d.applicable} risposte applicabili · ${d.notApplicable} non applicabili` : null,
		},
		{
			label: "Piano di remediation",
			value: d.tasks.length ? plural(d.kpis.open, "attività aperta", "attività aperte") : "Nessuna attività",
			hint: d.tasks.length
				? `${plural(d.kpis.openCriticalHigh, "critica/alta", "critiche/alte")} · ${plural(d.kpis.overdue, "scaduta", "scadute")} · ${d.kpis.unassigned} senza assegnatario`
				: sourceStateLabel(data.remediation),
		},
	];
	if (d.surfaceIncluded) {
		cards.push(
			{
				label: "SurfaceScan360 · postura",
				value: ss?.postureScore !== null && ss?.postureScore !== undefined ? `${Math.round(ss.postureScore)}/100` : "Non disponibile",
				hint: ss?.riskLevel ? `Rischio ${ss.riskLevel} · 100 = nessun rischio rilevato` : sourceStateLabel(data.surfaceScan),
				color: surfaceLevelColor(ss?.riskLevel ?? null),
			},
			{
				label: "SurfaceScan360 · finding aperti",
				value: ss ? String(ss.counts.total) : "Non disponibile",
				hint: ss
					? `${plural(ss.counts.critical, "critico", "critici")} · ${plural(ss.counts.high, "alto", "alti")} · ${plural(ss.counts.medium, "medio", "medi")} · ${plural(ss.counts.low, "basso", "bassi")} · ${plural(ss.counts.info, "informativo", "informativi")}`
					: null,
			},
		);
	}
	if (d.darkIncluded) {
		cards.push({
			label: "DarkRisk360 · indice",
			value: darkIndex !== null ? `${darkIndex}/100` : "Non disponibile",
			hint: darkIndex !== null ? `Esposizione ${darkLevel ?? "n/d"} · 0 = nessuna, 100 = massima` : sourceStateLabel(data.darkRisk),
			color: surfaceLevelColor(darkLevel),
		});
	}
	w.kpis(cards, 3);

	const prios = priorities(data, d);
	w.heading("Priorità", 2, { keepWith: 30 });
	if (prios.length === 0) {
		w.paragraph("Nei dati disponibili non emergono interventi urgenti: nessuna area a rischio alto o altissimo, nessuna attività critica aperta, nessun finding critico confermato.");
	} else {
		w.table(
			[
				{ label: "Cosa", width: 48 },
				{ label: "Perché", width: 56 },
				{ label: "Prossimo passo", width: 44 },
				{ label: "Riferimento", width: 30 },
			],
			prios.map((p) => [{ text: p.what, bold: true }, p.why, p.next, p.ref]),
			{ continueTitle: "Priorità", fontSize: 8.5 },
		);
	}

	const analysisBlock = (() => {
		const snap = [...(data.snapshots.data ?? [])].sort((a, b) => b.snapshot_year - a.snapshot_year)[0];
		return snap?.analysis_state === "ok" && snap.analysis?.overall ? snap.analysis.overall : null;
	})();
	if (analysisBlock?.headline || analysisBlock?.executive_summary) {
		w.heading("Sintesi dell'analisi", 2);
		if (analysisBlock.headline) w.paragraph(analysisBlock.headline, { style: "bold" });
		if (analysisBlock.executive_summary) {
			for (const block of markdownToBlocks(analysisBlock.executive_summary)) {
				if (block.kind === "li") w.bullets([block.text]);
				else w.paragraph(block.text);
			}
		}
	}

	w.heading("Fonti e aggiornamento", 2, { keepWith: 25 });
	const latestSnap = [...(data.snapshots.data ?? [])].sort((a, b) => b.snapshot_year - a.snapshot_year)[0];
	const coverage = obj(d.dark.monitoring_coverage);
	const rows: Cell[][] = [
		["Questionario di assessment", formatShortDate(data.assessment.data?.assessmentDate ?? null), sourceStateLabel(data.assessment)],
		["Elaborazione dell'assessment", formatShortDate(latestSnap?.created_at ?? null), sourceStateLabel(data.snapshots)],
		["Piano di remediation", formatShortDate(data.remediation.fetchedAt), sourceStateLabel(data.remediation)],
	];
	if (d.surfaceIncluded) rows.push(["SurfaceScan360 (ultima scansione completata)", formatShortDate(ss?.lastScanAt ?? null), sourceStateLabel(data.surfaceScan)]);
	if (d.darkIncluded) rows.push(["DarkRisk360 (ultima esecuzione)", formatShortDate((coverage.last_run_at as string) ?? null), sourceStateLabel(data.darkRisk)]);
	w.table(
		[
			{ label: "Fonte", width: 78 },
			{ label: "Aggiornato al", width: 30, nowrap: true },
			{ label: "Stato", width: 70 },
		],
		rows,
		{ continueTitle: "Fonti e aggiornamento", fontSize: 8.5 },
	);
}

function plan(w: PdfWriter, d: Derived): void {
	w.addPage();
	w.heading("Piano di remediation", 1);
	const k = d.kpis;
	w.kpis(
		[
			{ label: "Critiche/alte aperte", value: String(k.openCriticalHigh), color: k.openCriticalHigh ? SEVERITY.critical : BRAND.navy },
			{ label: "Scadute", value: String(k.overdue), color: k.overdue ? SEVERITY.high : BRAND.navy },
			{ label: "Senza assegnatario", value: String(k.unassigned) },
			{ label: "Prossima scadenza", value: k.nextDeadline ? formatTaskDate(k.nextDeadline.date) : "Nessuna", hint: k.nextDeadline?.task ?? null },
			{ label: "Avanzamento del piano", value: k.progressAvg === null ? "—" : `${k.progressAvg}%`, hint: "Media dell'avanzamento dichiarato" },
			{
				label: "Budget indicato",
				value: k.budgetKnownTasks ? formatEuro(k.budgetKnown) : "Non indicato",
				hint: k.total ? `Su ${k.budgetKnownTasks} attività di ${k.total} · importi registrati, non necessariamente approvati` : null,
			},
		],
		3,
	);

	const next = [...d.openTasks]
		.sort(
			(a, b) =>
				priorityRank(a.priority) - priorityRank(b.priority) ||
				(parseTaskDate(a.end_date)?.getTime() ?? Infinity) - (parseTaskDate(b.end_date)?.getTime() ?? Infinity) ||
				String(a.id).localeCompare(String(b.id)),
		)
		.slice(0, 5);

	w.table(
		[
			{ label: "Azione", width: 58 },
			{ label: "Area", width: 34 },
			{ label: "Priorità", width: 18 },
			{ label: "Assegnatario", width: 26 },
			{ label: "Scadenza", width: 21, nowrap: true },
			{ label: "Avanzamento", width: 21, align: "right", nowrap: true },
		],
		next.map((t) => [t.task, t.category || "—", priorityLabel(t.priority), assigneeLabel(t.assignee), formatTaskDate(t.end_date), `${t.progress ?? 0}%`]),
		{
			title: "Prossime azioni",
			emptyText: "Nessuna attività aperta nel piano.",
			note: d.openTasks.length > next.length ? `Le altre ${d.openTasks.length - next.length} attività aperte sono nel piano completo, in Appendice B.` : "Piano completo in Appendice B.",
		},
	);
}

function areas(w: PdfWriter, data: ReportData, d: Derived): void {
	w.addPage();
	w.heading("Risultati per area", 1);
	w.paragraph(
		"Punteggio da 0 a 100 sulle risposte applicabili di ogni area (Completato 100, Pianificato o in corso 50, Non iniziato 0): più alto è, meglio è. Il rischio va nel verso opposto: un punteggio alto corrisponde a un rischio basso. Le aree con sole risposte non applicabili non hanno punteggio e restano fuori dalla media complessiva; uno 0 è un punteggio reale.",
		{ size: 9, color: BRAND.muted },
	);

	const sorted = [...d.scored].sort((a, b) => (a.displayScore ?? 0) - (b.displayScore ?? 0));
	w.bars(
		sorted.map((s) => {
			const band = getRiskFromScore(s.displayScore as number).label;
			return {
				label: s.status === "partial" ? `${s.name} (parziale)` : s.name,
				value: s.displayScore,
				scoreLabel: `${s.displayScore}/100`,
				riskLabel: band,
				color: bandColor(band),
			};
		}),
	);

	if (d.excluded.length) {
		w.paragraph(
			`Escluse dal punteggio: ${d.excluded
				.map((s) => `${s.name} (${CATEGORY_STATUS_LABELS[s.status].toLowerCase()}${s.counts.non_applicabile ? `, ${s.counts.non_applicabile} risposte N/A` : ""})`)
				.join("; ")}.`,
			{ size: 9 },
		);
	}

	w.table(
		[
			{ label: "Area", width: 70 },
			{ label: "Punteggio", width: 20, align: "right", nowrap: true },
			{ label: "Rischio", width: 22, nowrap: true },
			{ label: "Risposte (C · P · NI · N/A)", width: 40, nowrap: true },
			{ label: "Stato", width: 26 },
		],
		d.scores.map((s) => {
			const band = s.displayScore !== null ? getRiskFromScore(s.displayScore).label : null;
			return [
				`A${d.catIndex.get(s.name)} · ${s.name}`,
				s.displayScore !== null ? `${s.displayScore}/100` : "—",
				band ? { text: band, color: bandColor(band) } : "—",
				`${s.counts.completato} · ${s.counts.pianificato_in_corso} · ${s.counts.non_iniziato} · ${s.counts.non_applicabile}`,
				CATEGORY_STATUS_LABELS[s.status],
			];
		}),
		{
			title: "Dettaglio per area",
			note: "C = Completato, P = Pianificato o in corso, NI = Non iniziato, N/A = Non applicabile. Le domande nascoste da una risposta precedente non sono contate.",
		},
	);

	// Confronto con l'anno precedente: solo aree valutate in entrambi gli anni.
	const year = data.generatedAt.getFullYear();
	const prev = (data.snapshots.data ?? []).find((s) => s.snapshot_year === year - 1);
	if (prev) {
		const prevByName = new Map(
			Object.values(prev.category_scores ?? {}).map((c) => [String(c.category_name ?? c.name ?? ""), c]),
		);
		// Variazione solo con lo stesso metodo di calcolo; altrimenti i due valori.
		const sameMethod = prev.score_method_current === true;
		const rows: Cell[][] = [];
		for (const s of d.scored) {
			const p = prevByName.get(s.name);
			if (!p || !(Number(p.answered) > 0) || p.score === null || p.score === undefined) continue;
			const delta = (s.displayScore as number) - Number(p.score);
			rows.push([
				s.name,
				`${Math.round(Number(p.score))}/100`,
				`${s.displayScore}/100`,
				sameMethod
					? { text: delta === 0 ? "0" : `${delta > 0 ? "+" : ""}${Math.round(delta)}`, color: delta > 0 ? RISK_BAND.Basso : delta < 0 ? SEVERITY.high : BRAND.muted }
					: { text: "—", color: BRAND.muted },
			]);
		}
		if (rows.length) {
			w.table(
				[
					{ label: "Area", width: 100 },
					{ label: String(year - 1), width: 26, align: "right", nowrap: true },
					{ label: String(year), width: 26, align: "right", nowrap: true },
					{ label: "Variazione", width: 26, align: "right", nowrap: true },
				],
				rows,
				{
					title: `Confronto con il ${year - 1}`,
					note: sameMethod
						? `Valori dei due anni calcolati con lo stesso metodo. Sono escluse le aree senza risposte valutabili in uno dei due anni.`
						: `I valori del ${year - 1} sono calcolati con il metodo precedente: sono mostrati, ma la variazione non si calcola. Sono escluse le aree senza risposte valutabili in uno dei due anni.`,
				},
			);
		}
	}
}

function surfaceScan(w: PdfWriter, data: ReportData, d: Derived): void {
	if (!d.surfaceIncluded) return;
	w.addPage();
	w.heading("SurfaceScan360 · Superficie esposta", 1);
	const ss = data.surfaceScan.data;
	if (!ss) {
		w.paragraph(`Dati non disponibili: ${sourceStateLabel(data.surfaceScan)}.`);
		return;
	}

	w.kpis(
		[
			{
				label: "Postura",
				value: ss.postureScore !== null ? `${Math.round(ss.postureScore)}/100` : "Non disponibile",
				hint: ss.riskLevel ? `Rischio ${ss.riskLevel}` : "Nessuna scansione utilizzabile",
				color: surfaceLevelColor(ss.riskLevel),
			},
			{ label: "Finding aperti", value: String(ss.counts.total), hint: "Coda corrente, informativi compresi" },
			{ label: "Ultima scansione completata", value: formatShortDate(ss.lastScanAt), hint: ss.scopeRules === null ? null : `${ss.scopeRules} regole di perimetro monitorate` },
		],
		3,
	);
	w.paragraph(
		"La postura va da 0 a 100 (100 = nessun rischio rilevato) e riflette lo stato corrente del perimetro; il livello di rischio deriva dai punti di rischio con le soglie del servizio. I finding chiusi, accettati o fuori perimetro non sono contati.",
		{ size: 8.5, color: BRAND.muted },
	);

	const unattributed = ss.findings.filter((f) => f.finding_type === "shodan_cve_signal_unattributed" || f.attribution_confidence === "low").length;
	w.table(
		[
			{ label: "Gravità", width: 78 },
			{ label: "Finding aperti", width: 50, align: "right", nowrap: true },
			{ label: "Quota", width: 50, align: "right", nowrap: true },
		],
		[
			...SEVERITY_ORDER.map((sev) => [
				{ text: SEVERITY_LABEL[sev], color: SEVERITY[sev], bold: true },
				String(ss.counts[sev]),
				ss.counts.total ? `${formatNumberIt((ss.counts[sev] / ss.counts.total) * 100)}%` : "—",
			]),
			[{ text: "Totale", bold: true }, { text: String(ss.counts.total), bold: true }, ss.counts.total ? "100%" : "—"],
		],
		{
			title: "Finding per gravità",
			note: unattributed
				? `Di cui ${unattributed} segnali non attribuiti con certezza al perimetro (IP condivisi o hosting): da verificare prima di intervenire.`
				: undefined,
		},
	);

	if (ss.mail.length) {
		const st = (s: string): { text: string; color: RGB } => {
			const x = MAIL_STATUS_LABEL[s] ?? MAIL_STATUS_LABEL.unknown;
			return { text: x.label, color: x.tone === "bad" ? SEVERITY.high : x.tone === "warn" ? SEVERITY.medium : x.tone === "ok" ? RISK_BAND.Basso : BRAND.muted };
		};
		const rischio = { alto: "Alto", medio: "Medio", basso: "Basso", non_determinato: "Non determinato" } as const;
		w.table(
			[
				{ label: "Dominio", width: 46 },
				{ label: "SPF", width: 30 },
				{ label: "DMARC", width: 38 },
				{ label: "DKIM", width: 30 },
				{ label: "Rischio spoofing", width: 34 },
			],
			ss.mail.map((m) => [
				m.domain,
				st(m.spfStatus),
				m.dmarcStatus === "no_enforcement" && m.dmarcReporting !== null
					? { ...st(m.dmarcStatus), text: `${MAIL_STATUS_LABEL.no_enforcement.label}${m.dmarcReporting ? ", report attivi" : ", senza report"}` }
					: st(m.dmarcStatus),
				st(m.dkimStatus),
				{ text: rischio[m.spoofingRisk], color: m.spoofingRisk === "alto" ? SEVERITY.critical : m.spoofingRisk === "medio" ? SEVERITY.medium : m.spoofingRisk === "basso" ? RISK_BAND.Basso : BRAND.muted },
			]),
			{
				title: "Sicurezza della posta",
				note: "Anomalie: SPF o DMARC assenti o non validi su un dominio che riceve posta, DKIM con verifica fallita. «Policy senza enforcement» (p=none) segnala ma non blocca. DKIM «Non verificato»: il selettore usato dal server di posta non è tra quelli comuni, non è un errore. «Controllo incompleto»: il DNS non ha risposto.",
			},
		);
	}

	if (ss.history.length) {
		w.table(
			[
				{ label: "Giorno di scansione", width: 44, nowrap: true },
				{ label: "Punteggio medio", width: 34, align: "right", nowrap: true },
				{ label: "Host analizzati", width: 34, align: "right", nowrap: true },
				{ label: "Host critici", width: 32, align: "right", nowrap: true },
				{ label: "CVE alte", width: 34, align: "right", nowrap: true },
			],
			ss.history.slice(0, 8).map((h) => [
				formatShortDate(h.scanned_at),
				formatNumberIt(Number(h.avg_score) || 0),
				String(h.hosts_scanned ?? h.total_assets ?? 0),
				String(h.critical_count ?? 0),
				String(h.high_cves ?? 0),
			]),
			{
				title: "Andamento delle ultime scansioni",
				note: "Punteggio medio dei job della giornata: è una misura per scansione, diversa dalla postura corrente del perimetro.",
			},
		);
	}

	w.paragraph("Elenco completo dei finding aperti in Appendice D.", { size: 9, color: BRAND.muted });
}

function darkRisk(w: PdfWriter, d: Derived): void {
	if (!d.darkIncluded) return;
	w.addPage();
	w.heading("DarkRisk360 · Esposizione nel dark web", 1);
	const dark = d.dark;
	const snap = d.darkSnapshot;
	const total = num(dark.total_leaks);
	const fresh = num(dark.new_this_week);
	const index = num(dark.risk_index);
	const level = (dark.risk_level as string | null) ?? null;
	const weekStart = (dark.snapshot_week_start as string | null) ?? null;
	const coverage = obj(dark.monitoring_coverage);

	w.kpis(
		[
			{ label: "Record raccolti", value: total === null ? "Non disponibile" : String(total), hint: "Record della fonte che citano il perimetro" },
			{
				label: "Nuovi nella settimana",
				value: fresh === null ? "Non disponibile" : String(fresh),
				hint: [weekStart ? `Settimana dal ${formatShortDate(weekStart)}` : null, num(dark.new_public_web_this_week) ? `di cui web pubblico: ${num(dark.new_public_web_this_week)}` : null]
					.filter(Boolean)
					.join(" · ") || null,
			},
			{ label: "Indice di esposizione", value: index === null ? "Non disponibile" : `${index}/100`, hint: index === null ? null : `Rischio ${(level ?? "n/d").toLowerCase()} · 0 = nessuna, 100 = massima`, color: surfaceLevelColor(level) },
			{ label: "Ultima esecuzione", value: formatShortDate((coverage.last_run_at as string) ?? null), hint: `${num(coverage.scope_entries) ?? 0} voci di perimetro monitorate` },
		],
		2,
	);

	const delta = obj(snap.delta_vs_prev);
	const dIndex = num(delta.risk_index);
	if (dIndex !== null && delta.prev_week_key) {
		w.paragraph(
			dIndex === 0
				? `Indice invariato rispetto alla settimana ${delta.prev_week_key}.`
				: `Indice ${dIndex > 0 ? "in aumento (esposizione peggiorata)" : "in calo (esposizione migliorata)"} di ${formatNumberIt(Math.abs(dIndex))} punti rispetto alla settimana ${delta.prev_week_key}.`,
			{ size: 9 },
		);
	}

	const sev = obj(snap.severity_distribution);
	w.table(
		[
			{ label: "Gravità", width: 100 },
			{ label: "Evidenze aperte", width: 78, align: "right", nowrap: true },
		],
		SEVERITY_ORDER.map((s) => [{ text: SEVERITY_LABEL[s], color: SEVERITY[s], bold: true }, String(num(sev[s]) ?? 0)]),
		{ title: "Evidenze per gravità", note: "Evidenze aperte del profilo, nell'ultimo aggiornamento settimanale." },
	);

	const bySource = Object.entries(obj(snap.results_by_source)).map(([k, v]) => [k, num(v) ?? 0] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
	const sourceTotal = bySource.reduce((a, [, v]) => a + v, 0);
	if (bySource.length) {
		w.table(
			[
				{ label: "Categoria di fonte", width: 100 },
				{ label: "Record", width: 39, align: "right", nowrap: true },
				{ label: "Quota", width: 39, align: "right", nowrap: true },
			],
			bySource.map(([k, v]) => [k, String(v), `${formatNumberIt((v / sourceTotal) * 100)}%`]),
			{ title: "Record per categoria di fonte" },
		);
	}

	const byType = Object.entries(obj(snap.results_by_filetype)).map(([k, v]) => [k, num(v) ?? 0] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
	const unclassified = new Set(["unknown", "other", "non classificato"]);
	if (byType.length && byType.every(([k]) => unclassified.has(k.toLowerCase()))) {
		w.paragraph(`Tipo di file: non classificato dalla fonte per tutti i ${byType.reduce((a, [, v]) => a + v, 0)} record.`, { size: 9 });
	} else if (byType.length) {
		const typeTotal = byType.reduce((a, [, v]) => a + v, 0);
		w.table(
			[
				{ label: "Tipo di file", width: 100 },
				{ label: "Record", width: 39, align: "right", nowrap: true },
				{ label: "Quota", width: 39, align: "right", nowrap: true },
			],
			byType.map(([k, v]) => [k, String(v), `${formatNumberIt((v / typeTotal) * 100)}%`]),
			{ title: "Record per tipo di file" },
		);
	}

	const groups = Object.entries(obj(snap.results_by_asset))
		.map(([k, v]) => {
			const g = obj(v);
			const sources = Object.entries(obj(g.by_source)).sort((a, b) => (num(b[1]) ?? 0) - (num(a[1]) ?? 0)).slice(0, 2).map(([s]) => s);
			return [k, num(g.total) ?? 0, sources] as const;
		})
		.sort((a, b) => b[1] - a[1]);
	if (groups.length) {
		const attributed = groups.reduce((a, [, v]) => a + v, 0);
		w.table(
			[
				{ label: "Voce di perimetro", width: 70 },
				{ label: "Record attribuiti", width: 34, align: "right", nowrap: true },
				{ label: "Fonti principali", width: 74 },
			],
			groups.map(([k, v, s]) => [maskEmail(k), String(v), s.join(", ") || "—"]),
			{
				title: "Record attribuiti per voce di perimetro",
				note: `${attributed} record attribuiti a una voce di perimetro${total !== null ? ` su ${total} raccolti` : ""}: gli altri non sono collegati con certezza a una voce specifica.`,
			},
		);
	}

	const weeks = Array.isArray(dark.historical_weeks) ? (dark.historical_weeks as unknown[]).map(obj) : [];
	if (weeks.length) {
		w.table(
			[
				{ label: "Settimana", width: 36, nowrap: true },
				{ label: "Record totali", width: 36, align: "right", nowrap: true },
				{ label: "Nuovi", width: 34, align: "right", nowrap: true },
				{ label: "di cui web pubblico", width: 38, align: "right", nowrap: true },
				{ label: "Indice", width: 34, align: "right", nowrap: true },
			],
			weeks.map((r) => [
				String(r.week_key ?? ""),
				String(num(r.total_records) ?? "—"),
				String(num(r.new_this_week) ?? "—"),
				num(r.new_public_web) === null ? "—" : String(num(r.new_public_web)),
				num(r.risk_index) === null ? "—" : `${num(r.risk_index)}/100`,
			]),
			{
				title: "Andamento settimanale",
				note: "Il web pubblico (pagine indicizzate che citano il dominio) è indicato a parte: pesa molto sui nuovi di una settimana, poco sull'esposizione. Indice: 0 = nessuna esposizione, 100 = massima.",
			},
		);
	}
}

function appendices(w: PdfWriter, data: ReportData, d: Derived): void {
	const assessment = data.assessment.data;

	// A · Domande e risposte, testo integrale
	if (assessment) {
		w.addPage();
		w.heading("Appendice A · Domande e risposte", 1);
		w.paragraph("Testo integrale delle domande visibili per il cliente, con l'identificativo usato nei rimandi del documento.", { size: 9, color: BRAND.muted });
		assessment.categories.forEach((cat, i) => {
			const s = d.scores[i];
			const visible = cat.questions.filter((q) => isQuestionVisible(q, assessment.responses, assessment.categories));
			const hidden = cat.questions.length - visible.length;
			const band = s.displayScore !== null ? getRiskFromScore(s.displayScore).label : null;
			w.heading(`A${i + 1} · ${cat.name}`, 2, { keepWith: 25 });
			w.paragraph(
				s.displayScore !== null
					? `Punteggio ${s.displayScore}/100 · rischio ${String(band).toLowerCase()} · ${CATEGORY_STATUS_LABELS[s.status].toLowerCase()}`
					: CATEGORY_STATUS_LABELS[s.status],
				{ size: 9, style: "bold", color: bandColor(band) },
			);
			w.table(
				[
					{ label: "Rif.", width: 16, nowrap: true },
					{ label: "Domanda", width: 120 },
					{ label: "Risposta", width: 42 },
				],
				visible.map((q, n) => {
					const r = assessment.responses[q.id];
					return [
						`A${i + 1}.${n + 1}`,
						q.question,
						r ? { text: RESPONSE_LABEL[r] ?? r, color: r === "non_iniziato" ? SEVERITY.critical : r === "pianificato_in_corso" ? SEVERITY.medium : r === "completato" ? RISK_BAND.Basso : BRAND.muted } : { text: "Senza risposta", color: BRAND.muted },
					];
				}),
				{ continueTitle: `A${i + 1} · ${cat.name}`, fontSize: 8.5, note: hidden ? `${hidden} domand${hidden === 1 ? "a non mostrata perché dipende" : "e non mostrate perché dipendono"} da una risposta precedente.` : undefined },
			);
		});
	}

	// B · Piano completo
	w.addPage();
	w.heading("Appendice B · Piano di remediation completo", 1);
	const ordered = [...d.tasks].sort(
		(a, b) =>
			Number(isTaskClosed(a)) - Number(isTaskClosed(b)) ||
			priorityRank(a.priority) - priorityRank(b.priority) ||
			(parseTaskDate(a.end_date)?.getTime() ?? Infinity) - (parseTaskDate(b.end_date)?.getTime() ?? Infinity),
	);
	w.table(
		[
			{ label: "Azione", width: 46 },
			{ label: "Area", width: 32 },
			{ label: "Priorità", width: 16, nowrap: true },
			{ label: "Assegnatario", width: 22 },
			{ label: "Periodo", width: 26 },
			{ label: "Avanzamento", width: 18, align: "right", nowrap: true },
			{ label: "Budget", width: 18, align: "right", nowrap: true },
		],
		ordered.map((t) => [
			isTaskClosed(t) ? `${t.task} (chiusa)` : t.task,
			t.category || "—",
			priorityLabel(t.priority),
			assigneeLabel(t.assignee),
			`dal ${formatTaskDate(t.start_date)}\nal ${formatTaskDate(t.end_date)}`,
			`${t.progress ?? 0}%`,
			t.budget === null || t.budget === undefined ? "Non indicato" : formatEuro(t.budget),
		]),
		{
			continueTitle: "Piano di remediation completo",
			fontSize: 8.5,
			emptyText: data.remediation.status === "ok" ? "Nessuna attività." : sourceStateLabel(data.remediation),
			note: `Budget: ${budgetCoverageLabel(d.kpis)}. Gli importi sono quelli registrati nel piano.`,
		},
	);

	// C · Consigli per area
	const snap = [...(data.snapshots.data ?? [])].sort((a, b) => b.snapshot_year - a.snapshot_year)[0];
	const advice = snap?.analysis?.categories?.length
		? snap.analysis.categories.map((c) => ({ category: c.category_name, advice: c.advice }))
		: parseAiCategoryAdvice(snap?.openai_data);
	if (advice.length) {
		w.addPage();
		w.heading("Appendice C · Consigli per area", 1);
		for (const a of advice) {
			if (!a.advice) continue;
			w.heading(a.category, 2, { toc: false, keepWith: 20 });
			for (const block of markdownToBlocks(a.advice)) {
				if (block.kind === "li") w.bullets([block.text], { size: 9.5 });
				else w.paragraph(block.text, { size: 9.5 });
			}
		}
	}

	// D · Finding SurfaceScan
	const ss = data.surfaceScan.data;
	if (d.surfaceIncluded && ss) {
		w.addPage();
		w.heading("Appendice D · Finding SurfaceScan360 aperti", 1);
		const rank = (s: string) => SEVERITY_ORDER.indexOf(s as (typeof SEVERITY_ORDER)[number]);
		const sorted = [...ss.findings].sort((a, b) => rank(a.severity) - rank(b.severity) || (toCvss(b.cvss) ?? -1) - (toCvss(a.cvss) ?? -1));
		// Inclusione delimitata e dichiarata: critici, alti e medi fino a un tetto,
		// bassi e informativi solo nel conteggio. Un cliente con 3.700 finding
		// aperti avrebbe avuto più di 200 pagine di elenco.
		const MAX_ROWS = 300;
		const rows = sorted.filter((f) => ["critical", "high", "medium"].includes(f.severity)).slice(0, MAX_ROWS);
		const omitted = SEVERITY_ORDER.map((sev) => [sev, ss.counts[sev] - rows.filter((f) => f.severity === sev).length] as const).filter(([, n]) => n > 0);
		w.table(
			[
				{ label: "Rif.", width: 13, nowrap: true },
				{ label: "Gravità", width: 20, nowrap: true },
				{ label: "Finding", width: 70 },
				{ label: "Asset", width: 42 },
				{ label: "CVSS", width: 12, align: "right", nowrap: true },
				{ label: "Ultima oss.", width: 21, nowrap: true },
			],
			rows.map((f, i) => [
				`D${i + 1}`,
				{ text: SEVERITY_LABEL[f.severity] ?? f.severity, color: SEVERITY[f.severity] ?? BRAND.text, bold: true },
				f.title + (f.cve?.length ? ` (${f.cve.slice(0, 3).join(", ")}${f.cve.length > 3 ? "…" : ""})` : ""),
				f.affected_asset || f.ip || "—",
				toCvss(f.cvss) !== null ? formatNumberIt(toCvss(f.cvss) as number) : "—",
				formatShortDate(f.last_seen_at || f.created_at),
			]),
			{
				continueTitle: "Finding SurfaceScan360 aperti",
				fontSize: 8,
				note:
					`Elencati ${rows.length} finding su ${ss.counts.total} aperti, ordinati per gravità e CVSS` +
					(omitted.length
						? `; non elencati: ${omitted.map(([sev, n]) => `${n} di gravità ${SEVERITY_LABEL[sev].toLowerCase()}`).join(", ")}. L'elenco completo è nella Console, SurfaceScan360 > Azioni.`
						: ". Coda corrente della Console, senza stati chiusi o accettati né righe fuori perimetro."),
			},
		);
	}

	// E · Anagrafica e consistenze
	w.addPage();
	w.heading("Appendice E · Anagrafica e consistenze", 1);
	const org = data.org ?? {};
	const sectors = toList(org.customer_sectors);
	const solutions = toList(org.implemented_technologies);
	w.table(
		[
			{ label: "Voce", width: 60 },
			{ label: "Valore", width: 118 },
		],
		[
			["Organizzazione", data.companyName],
			["Partita IVA", org.vat_number || "Non indicata"],
			["Settore", org.industry || org.business_sector || "Non indicato"],
			["Settori dei clienti", sectors.length ? sectors.join(", ") : "Non indicati"],
			["Soluzioni implementate", solutions.length ? solutions.join(", ") : "Non indicate"],
			["Ultima risposta al questionario", formatLongDate(data.assessment.data?.assessmentDate ?? null)],
			["Elaborazione dell'assessment", formatLongDate(snap?.created_at ?? null)],
		],
		{ title: "Anagrafica" },
	);
	const ci = (data.inventory.data ?? {}) as Record<string, unknown>;
	const n = (k: string) => (num(ci[k]) === null ? "—" : String(num(ci[k])));
	if (data.inventory.status === "ok") {
		const group = (title: string, rows: Array<[string, string]>) =>
			w.table(
				[
					{ label: "Voce", width: 120 },
					{ label: "Quantità", width: 58, align: "right", nowrap: true },
				],
				rows,
				{ title, fontSize: 8.5 },
			);
		group("Infrastruttura", [
			["Utenti", n("users_count")],
			["Sedi", n("locations_count")],
			["Endpoint", n("endpoints_count")],
			["Server", n("servers_count")],
			["Hypervisor", n("hypervisors_count")],
			["Virtual machine", n("virtual_machines_count")],
		]);
		group("Rete", [
			["Firewall", n("firewalls_count")],
			["Core switch", n("core_switches_count")],
			["Access switch", n("access_switches_count")],
			["Access point", n("access_points_count")],
			["Altri dispositivi di rete", n("miscellaneous_network_devices_count")],
			["Totale dispositivi di rete", n("total_network_devices_count")],
		]);
	} else {
		w.paragraph(`Consistenze: ${sourceStateLabel(data.inventory).toLowerCase()}.`, { size: 9 });
	}

	// F · Metodologia e glossario
	w.addPage();
	w.heading("Appendice F · Metodologia e glossario", 1);
	w.paragraph(
		"Il punteggio dell'assessment è un'autovalutazione a questionario: misura quanto i controlli sono dichiarati attivi, non ne verifica l'efficacia. SurfaceScan360 osserva dall'esterno i servizi esposti del perimetro dichiarato; DarkRisk360 cerca riferimenti al perimetro in fonti del dark web e di data leak. Le tre misure hanno scale e significati diversi e non vanno sommate.",
		{ size: 9.5 },
	);
	w.table(
		[
			{ label: "Termine", width: 44 },
			{ label: "Significato", width: 134 },
		],
		[
			["Punteggio assessment", "Media delle aree valutate, 0–100; più alto è meglio. Il rischio va nel verso opposto: altissimo sotto 20, alto 20–39, moderato 40–59, basso 60–79, molto basso da 80."],
			["Non applicabile (N/A)", "Risposta esclusa dal calcolo: non abbassa né alza il punteggio."],
			["Postura SurfaceScan360", "Stato corrente del perimetro esterno, 0–100; 100 = nessun rischio rilevato."],
			["Indice DarkRisk360", "Esposizione nel dark web, 0–100; più alto è peggio."],
			["Finding", "Problema osservato su un asset del perimetro, con una gravità."],
			["Record", "Documento o voce di una fonte esterna che cita il perimetro; più record possono riferirsi alla stessa evidenza."],
			["CVSS", "Gravità tecnica di una vulnerabilità, 0–10."],
			["EPSS", "Probabilità stimata che una vulnerabilità venga sfruttata nei prossimi 30 giorni."],
			["KEV", "Vulnerabilità con sfruttamento noto, dall'elenco dell'agenzia statunitense CISA."],
			["SPF, DMARC", "Record DNS che indicano quali server possono inviare posta per il dominio e cosa fare dei messaggi falsificati."],
		],
		{ continueTitle: "Glossario", fontSize: 8.5 },
	);
}

/* ─────────────────────────── Ingresso ─────────────────────────── */

export async function buildFullReportPdf(
	data: ReportData,
	logoUrl: string | null,
	opts: { compress?: boolean; fonts?: ReportFonts | null } = {},
): Promise<{ blob: Blob; filename: string; text: () => string; pages: number }> {
	const w = new PdfWriter({ compress: opts.compress, fonts: opts.fonts });
	const d = derive(data);
	const logo = logoUrl ? await loadLogo(logoUrl) : null;

	w.doc.setProperties({
		title: pdfSafe(`Report di sicurezza e conformità - ${data.companyName}`),
		subject: "Assessment, piano di remediation, SurfaceScan360, DarkRisk360",
		author: "HiSolution",
		creator: "HiSolution Console",
	});
	(w.doc as unknown as { setLanguage?: (lang: string) => void }).setLanguage?.("it-IT");

	cover(w, data, d, logo);
	const toc = tocPage(w);
	summary(w, data, d);
	plan(w, d);
	areas(w, data, d);
	surfaceScan(w, data, d);
	darkRisk(w, d);
	appendices(w, data, d);

	w.finalize({
		tocPage: toc,
		headerText: `Report di sicurezza e conformità · ${data.companyName}`,
		footerText: `HiSolution Console · Riservato · ${formatShortDate(data.generatedAt)}`,
	});

	const safeName = data.companyName.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "Cliente";
	const day = data.generatedAt.toISOString().slice(0, 10);
	return {
		blob: w.doc.output("blob"),
		filename: `Report_${safeName}_${day}.pdf`,
		// Sorgente del PDF (leggibile solo senza compressione): serve ai test.
		text: () => w.doc.output(),
		pages: w.doc.getNumberOfPages(),
	};
}
