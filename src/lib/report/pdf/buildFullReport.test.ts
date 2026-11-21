import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { AssessmentCategory, AssessmentResponse } from "@/data/assessmentQuestions";
import { buildCategoryScore, computeOverallScore } from "@/lib/assessment/scoring";
import { countSurfaceFindings, type SurfaceFindingRow } from "@/hooks/useSurfaceScanFindings";
import type { RemediationTask } from "@/types/api";
import type { ReportData, SourceResult } from "../collectReportData";
import { buildFullReportPdf } from "./buildFullReport";
import { PdfWriter } from "./writer";

const ok = <T,>(data: T): SourceResult<T> => ({ status: "ok", data, fetchedAt: "2026-11-20T10:00:00Z", reason: null });

/** Le aree e le risposte reali di CSBNO (ciclo «Assessment 2026»). */
const csbno = () => {
	const aree: Array<[string, number, number, number, number]> = [
		["Business Continuity, Disaster recovery, Backup", 5, 1, 2, 0],
		["Certificazioni", 0, 0, 0, 3],
		["Crittografia", 6, 0, 0, 0],
		["Gestione delle identità Gestione degli accessi", 15, 1, 0, 0],
		["Gestione degli incidenti", 8, 15, 1, 0],
		["Gestione del rischio", 4, 4, 0, 0],
		["Gestione delle risorse", 12, 0, 0, 0],
		["Gestione fornitori e acquisti", 7, 4, 0, 0],
		["Governance", 1, 4, 3, 0],
		["HR e formazione", 1, 8, 1, 0],
		["Igiene informatica", 3, 2, 0, 0],
		["Manutenzione e miglioramento continuo", 8, 3, 0, 0],
		["Network Security Best Practices & Operations", 4, 0, 0, 0],
		["Sviluppo software", 0, 0, 1, 1],
	];
	let id = 1;
	const categories: AssessmentCategory[] = [];
	const responses: Record<number, AssessmentResponse> = {};
	for (const [name, c, p, ni, na] of aree) {
		const values: AssessmentResponse[] = [
			...Array(c).fill("completato"),
			...Array(p).fill("pianificato_in_corso"),
			...Array(ni).fill("non_iniziato"),
			...Array(na).fill("non_applicabile"),
		];
		const questions = values.map((v, i) => {
			const q = { id: id++, question: `${name}: domanda ${i + 1} con un testo volutamente lungo per verificare l'a capo fra parole senza troncamenti né puntini di sospensione`, priority: "MEDIA" };
			responses[q.id] = v;
			return q;
		});
		categories.push({ name, questions } as unknown as AssessmentCategory);
	}
	return { categories, responses };
};

const task = (i: number, over: Partial<RemediationTask> = {}): RemediationTask =>
	({
		id: `t${i}`,
		tenant_id: "x",
		task: `Attività ${i}`,
		category: "Governance",
		priority: i === 0 ? "high" : "medium",
		color: "",
		start_date: "2026-08-06",
		end_date: "2026-12-26",
		progress: 0,
		is_done: false,
		assignee: null,
		budget: i < 2 ? 1 : 10000,
		dependencies: null,
		display_order: i,
		is_deleted: false,
		is_hidden: false,
		source: null,
		source_ref: null,
		created_at: "",
		updated_at: "",
		...over,
	}) as RemediationTask;

const finding = (i: number, severity: SurfaceFindingRow["severity"]): SurfaceFindingRow =>
	({
		id: `f${i}`,
		scan_job_id: "j1",
		finding_type: "x",
		title: `Finding numero ${i} con descrizione abbastanza lunga da andare a capo nella colonna`,
		severity,
		affected_asset: `host${i}.csbno.net`,
		cvss: severity === "critical" ? 9.8 : null,
		created_at: "2026-11-16T01:00:00Z",
		last_seen_at: "2026-11-16T01:00:00Z",
	}) as unknown as SurfaceFindingRow;

const reportData = (): ReportData => {
	const { categories, responses } = csbno();
	const findings = [
		finding(0, "critical"),
		...Array.from({ length: 33 }, (_, i) => finding(i + 1, "medium")),
		...Array.from({ length: 115 }, (_, i) => finding(i + 40, "low")),
		...Array.from({ length: 112 }, (_, i) => finding(i + 200, "info")),
	];
	return {
		organizationId: "org",
		companyName: "CSBNO",
		org: { vat_number: "01234567890" },
		generatedAt: new Date(2026, 10, 20),
		assessment: ok({
			categories,
			responses,
			scores: categories.map((c) => buildCategoryScore(c, responses, categories)),
			overallScore: computeOverallScore(categories, responses),
			assessmentDate: "2026-08-04T10:00:00Z",
		}),
		campaigns: ok({ campaigns: [], current: { label: "Assessment 2026", is_confirmed: true } as never, readiness: {} as never }),
		snapshots: ok([]),
		remediation: ok(Array.from({ length: 8 }, (_, i) => task(i))),
		inventory: { status: "empty", data: null, fetchedAt: "", reason: "Nessun dato disponibile" },
		surfaceScan: ok({
			findings,
			counts: countSurfaceFindings(findings),
			postureScore: 84.7,
			riskLevel: "Basso",
			riskPoints: 10,
			lastScanAt: "2026-11-16T01:00:00Z",
			scopeRules: 3,
			history: [],
			mail: [],
		}),
		darkRisk: { status: "not_active", data: null, fetchedAt: "", reason: "Servizio non attivo" },
		darkFindings: { status: "not_active", data: null, fetchedAt: "", reason: "Servizio non attivo" },
	};
};

/** Come in produzione per Inera: nessun asset collegato, solo la voce di perimetro del record. */
const darkFinding = (i: number, severity: string, perimeterEntry: string | null, title = `Leak ${i}`) =>
	({
		id: `d${i}`, title, findingType: "domain_leak", severity, status: "new", asset: null, perimeterEntry, leakDate: i % 2 ? "2025-03-01" : null,
		surfaceFindingId: null, firstSeenAt: "2026-10-01T00:00:00Z", lastSeenAt: "2026-11-16T00:00:00Z", acknowledged: false,
		acknowledgedAt: null, acknowledgedBy: null, acknowledgementNote: null, assignee: null, assigneeUserId: null,
		actionStatus: null, compromiseType: "direct",
	}) as const;

/** Inera: DarkRisk attivo con 18 evidenze alte, che devono avere un posto nelle priorità e un'appendice. */
const withDarkRisk = (): ReportData => {
	const data = reportData();
	const rows = [
		...Array.from({ length: 18 }, (_, i) => darkFinding(i, "high", i < 12 ? "inera.it" : null, i === 0 ? "Credenziale esposta: mario.rossi@inera.it" : `Leak ${i}`)),
		...Array.from({ length: 30 }, (_, i) => darkFinding(100 + i, "medium", "95.216.30.73", i === 0 ? "Collection #2-#5 &amp; Antipublic" : `Leak ${100 + i}`)),
	];
	return {
		...data,
		surfaceScan: { ...data.surfaceScan, data: { ...data.surfaceScan.data!, findings: [finding(0, "critical"), ...Array.from({ length: 188 }, (_, i) => finding(i + 1, "high"))], counts: countSurfaceFindings([finding(0, "critical"), ...Array.from({ length: 188 }, (_, i) => finding(i + 1, "high"))]) } },
		darkRisk: ok({ enabled: true, total_leaks: 593, new_this_week: 16, risk_index: 36, risk_level: "Medio", weekly_snapshot: { severity_distribution: { high: 18, medium: 312 } }, monitoring_coverage: {} }),
		darkFindings: ok({ rows: [...rows], total: 48 }),
	};
};

describe("buildFullReportPdf · CSBNO", () => {
	it("apre con sintesi e numeri coerenti con la Console", async () => {
		const pdf = await buildFullReportPdf(reportData(), null, { compress: false });
		const text = pdf.text();

		expect(pdf.pages).toBeGreaterThan(8);
		expect(text).toContain("72/100");
		expect(text).toContain("128/128 compilate");
		expect(text).toContain("124 risposte applicabili");
		// 261 = 1 + 0 + 33 + 115 + 112: il totale torna come somma.
		expect(text).toContain("(261)");
		expect(text).toContain("Informativa");
		// KPI vecchi spariti.
		expect(text).not.toContain("Riduzione rischio");
		expect(text).not.toContain("Miglioramento compliance");
		// Budget con copertura invece di un totale che conta i vuoti come zero.
		expect(text).toContain("60.002");
		expect(text).toContain("Su 8 attivit");
		// Footer numerato con il totale.
		expect(text).toContain(`Pagina 3 di ${pdf.pages}`);
		// Servizio non attivo: niente sezione DarkRisk inventata.
		expect(text).not.toContain("DarkRisk360 \\267 Esposizione");
	});

	it("l'elenco dei finding è delimitato e lo dichiara", async () => {
		const text = (await buildFullReportPdf(reportData(), null, { compress: false })).text();
		// 1 critico + 33 medi elencati; bassi e informativi solo nel conteggio.
		expect(text).toContain("Elencati 34 finding su 261 aperti");
		expect(text).toContain("115 di gravit");
		expect(text).toContain("112 di gravit");
		expect(text).not.toContain("(D35)");
	});

	it("le tabelle lunghe ripetono titolo e intestazione con «continua»", async () => {
		const text = (await buildFullReportPdf(reportData(), null, { compress: false })).text();
		expect(text).toContain("continua");
	});
});

describe("buildFullReportPdf · DarkRisk360", () => {
	it("le evidenze alte hanno un posto fra le priorità anche con molti finding SurfaceScan", async () => {
		const text = (await buildFullReportPdf(withDarkRisk(), null, { compress: false })).text();
		// Le celle vanno a capo: si cercano frammenti brevi.
		expect(text).toContain("Valutare le evidenze");
		expect(text).toContain("Appendice E");
	});

	it("l'appendice E elenca le evidenze aperte per voce di perimetro, senza email in chiaro", async () => {
		const text = (await buildFullReportPdf(withDarkRisk(), null, { compress: false })).text();
		expect(text).toContain("Appendice E · Evidenze DarkRisk360 aperte");
		expect(text).toContain("inera.it · 12 evidenze");
		expect(text).toContain("Da attribuire a una voce di perimetro · 6 evidenze");
		expect(text).toContain("Appendice F · Anagrafica e consistenze");
		expect(text).toContain("m***@inera.it");
		expect(text).not.toContain("mario.rossi@inera.it");
		expect(text).toContain("Collection #2-#5 & Antipublic");
		expect(text).not.toContain("&amp;");
	});
});

describe("PdfWriter.table", () => {
	it("una tabella su più pagine ripete l'intestazione e non perde righe", () => {
		const w = new PdfWriter({ compress: false });
		const rows = Array.from({ length: 120 }, (_, i) => [`Riga ${i + 1}`, "Testo di una cella abbastanza lungo da occupare più righe nella colonna stretta della tabella di prova"]);
		w.table(
			[
				{ label: "Riferimento", width: 40 },
				{ label: "Descrizione", width: 60 },
			],
			rows,
			{ title: "Prova" },
		);
		const pages = w.doc.getNumberOfPages();
		const text = w.doc.output();
		expect(pages).toBeGreaterThan(1);
		// un titolo «(continua)» per ogni pagina oltre la prima
		expect(text.split("Prova \\(continua\\)").length - 1).toBe(pages - 1);
		// tutte le righe presenti
		for (const n of [1, 60, 120]) expect(text).toContain(`(Riga ${n})`);
	});
});

describe("PdfWriter.bars", () => {
	it("la barra piena finisce prima delle colonne punteggio e rischio (Montserrat)", () => {
		const font = (f: string) => readFileSync(`src/assets/fonts/Montserrat-${f}.ttf`).toString("base64");
		const w = new PdfWriter({ compress: false, fonts: { regular: font("Regular"), semibold: font("SemiBold"), italic: font("Italic") } });
		const rects: Array<[number, number]> = [];
		const original = w.doc.rect.bind(w.doc);
		w.doc.rect = ((x: number, y: number, width: number, h: number, style?: string) => {
			rects.push([x, width]);
			return original(x, y, width, h, style);
		}) as typeof w.doc.rect;
		w.bars([{ label: "Gestione del rischio", value: 100, scoreLabel: "100/100", riskLabel: "Molto basso", color: [0, 0, 0] }]);
		w.font(9, "bold");
		// la colonna più a sinistra fra le due di testo è il punteggio, allineato a destra
		const labelStart = 16 + 178 - w.textWidth("Molto basso") - 6 - w.textWidth("Punteggio");
		const barEnd = Math.max(...rects.map(([x, width]) => x + width));
		expect(barEnd).toBeLessThan(labelStart);
	});
});
