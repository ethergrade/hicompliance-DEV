import { describe, expect, it } from "vitest";
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

	it("le tabelle lunghe ripetono titolo e intestazione con «continua»", async () => {
		const text = (await buildFullReportPdf(reportData(), null, { compress: false })).text();
		expect(text).toContain("continua");
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
