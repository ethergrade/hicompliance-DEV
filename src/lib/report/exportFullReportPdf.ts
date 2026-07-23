import jsPDF from "jspdf";
import type { AssessmentCategory, AssessmentResponse } from "@/data/assessmentQuestions";
import { generateAssessmentPDF } from "@/components/assessment/AssessmentReportGenerator";
import {
	captureElement,
	RASTER_DEFAULTS,
	type CapturedImage,
	type RasterOptions,
} from "@/lib/report/rasterCapture";

/**
 * Un blocco report da catturare come immagine e appendere al PDF.
 * `element` è il nodo DOM (già renderizzato, anche offscreen) da fotografare.
 */
export interface ReportBlock {
	title: string;
	element: HTMLElement;
}

export interface FullReportExportParams {
	companyName: string;
	/** Dati assessment per le pagine Q&A vettoriali (riusa AssessmentReportGenerator). */
	assessment?: {
		responses: Record<number, AssessmentResponse>;
		categories?: AssessmentCategory[];
	};
	/** Blocchi visivi (radar, riepiloghi, remediation, surface, darkrisk) in ordine. */
	blocks: ReportBlock[];
	/** Callback opzionale per salvare anche il blob (es. in Gestione Documenti). */
	onBlob?: (blob: Blob, fileName: string) => void | Promise<void>;
	/**
	 * Override dei parametri di rasterizzazione (DPI, formato, qualità).
	 * Vedi RASTER_DEFAULTS: alzare `targetDpi` o passare a png aumenta molto il peso.
	 */
	raster?: Partial<RasterOptions>;
}

const PAGE_MARGIN = 12; // mm
const HEADER_SPACE = 16; // mm riservato al titolo blocco
const FOOTER_SPACE = 16; // mm riservato al footer in fondo pagina (evita accavallamenti)

/** Colori brand (coerenti con AssessmentReportGenerator). */
const DARK: [number, number, number] = [15, 23, 42];
const ACCENT: [number, number, number] = [100, 210, 255];
const MUTED: [number, number, number] = [150, 180, 200];

/**
 * Genera e scarica il report cliente completo:
 *   cover → (assessment Q&A vettoriale) → blocchi visivi catturati (immagini).
 */
export async function exportFullReportPdf(params: FullReportExportParams): Promise<void> {
	const { companyName, assessment, blocks, onBlob } = params;
	const raster: RasterOptions = { ...RASTER_DEFAULTS, ...params.raster };
	// compress: deflate degli stream di contenuto (testo e vettoriale della cover
	// e delle pagine Q&A). Le immagini sono già compresse a monte.
	const doc = new jsPDF({
		orientation: "portrait",
		unit: "mm",
		format: "a4",
		compress: true,
	});
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();

	// ── Cover ────────────────────────────────────────────────────────────────
	doc.setFillColor(...DARK);
	doc.rect(0, 0, pageWidth, pageHeight, "F");
	doc.setTextColor(...ACCENT);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(26);
	doc.text("Report di Sicurezza", pageWidth / 2, 110, { align: "center" });
	doc.setFontSize(14);
	doc.setTextColor(255, 255, 255);
	doc.text(companyName || "Cliente", pageWidth / 2, 124, { align: "center" });
	doc.setFontSize(10);
	doc.setTextColor(...MUTED);
	doc.text(
		`Generato il ${new Date().toLocaleString("it-IT")}`,
		pageWidth / 2,
		138,
		{ align: "center" },
	);
	doc.text(
		"Assessment · Remediation · Surface Scan · Dark Risk",
		pageWidth / 2,
		150,
		{ align: "center" },
	);

	// ── Assessment Q&A vettoriale (riuso del generatore esistente) ────────────
	if (assessment) {
		doc.addPage();
		generateAssessmentPDF({
			responses: assessment.responses,
			categories: assessment.categories,
			companyName,
			doc,
			save: false,
		});
	}

	// I web font devono essere pronti prima della cattura: altrimenti html2canvas
	// misura con un font di fallback e sovrappone/collassa gli spazi del testo.
	if (document.fonts?.ready) {
		try {
			await document.fonts.ready;
		} catch {
			/* no-op */
		}
	}

	// ── Blocchi visivi catturati ──────────────────────────────────────────────
	const contentWidth = pageWidth - PAGE_MARGIN * 2;
	for (const [index, block] of blocks.entries()) {
		if (!block.element) continue;
		const image = await captureElement(block.element, contentWidth, raster);
		addCapturedBlock(doc, image, block.title, index, pageWidth, pageHeight);
	}

	applyFooter(doc, pageWidth, pageHeight);

	const fileName = `Report_${(companyName || "cliente").replace(/\s+/g, "_")}_${new Date()
		.toISOString()
		.slice(0, 10)}.pdf`;

	const blob = doc.output("blob");
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	a.click();
	URL.revokeObjectURL(url);

	if (onBlob) {
		await onBlob(blob, fileName);
	}
}

/**
 * Aggiunge un canvas (potenzialmente alto) su una o più pagine, con titolo.
 * Usa il classico trucco jsPDF di riposizionamento negativo dell'immagine.
 */
function addCapturedBlock(
	doc: jsPDF,
	image: CapturedImage,
	title: string,
	blockIndex: number,
	pageWidth: number,
	pageHeight: number,
): void {
	const imgWidth = pageWidth - PAGE_MARGIN * 2;
	const imgHeight = (image.height * imgWidth) / image.width;

	doc.addPage();

	// Titolo blocco (solo sulla prima pagina del blocco)
	doc.setFont("helvetica", "bold");
	doc.setFontSize(13);
	doc.setTextColor(...DARK);
	doc.text(title, PAGE_MARGIN, PAGE_MARGIN + 6);

	// Banda di contenuto per pagina: sotto il titolo (pagina 1) o sotto il margine
	// superiore (pagine successive), e sopra la banda footer riservata in fondo.
	const bottomLimit = pageHeight - FOOTER_SPACE;
	let rendered = 0; // mm di immagine già mostrati
	let pageIndex = 0;

	while (rendered < imgHeight - 0.5 && pageIndex < 200) {
		const pageTop = pageIndex === 0 ? PAGE_MARGIN + HEADER_SPACE : PAGE_MARGIN;
		const avail = bottomLimit - pageTop;

		// L'immagine è disegnata intera ma "scorre" verso l'alto ad ogni pagina.
		// L'alias esplicito garantisce che jsPDF riusi lo stesso XObject su tutte
		// le pagine del blocco invece di riembeddare i byte ad ogni addImage.
		doc.addImage(
			image.data,
			image.format,
			PAGE_MARGIN,
			pageTop - rendered,
			imgWidth,
			imgHeight,
			`block-${blockIndex}`,
			"FAST",
		);

		// Maschera bianca sulla banda footer per non far sconfinare il contenuto.
		doc.setFillColor(255, 255, 255);
		doc.rect(0, bottomLimit, pageWidth, pageHeight - bottomLimit, "F");
		// Sulle pagine di continuazione, maschera il margine superiore (righe duplicate).
		if (pageIndex > 0) doc.rect(0, 0, pageWidth, pageTop, "F");

		rendered += avail;
		pageIndex++;
		if (rendered < imgHeight - 0.5) doc.addPage();
	}
}

/** Footer con numero pagina su tutte le pagine (esclusa la cover). */
function applyFooter(doc: jsPDF, pageWidth: number, pageHeight: number): void {
	const total = doc.getNumberOfPages();
	for (let i = 2; i <= total; i++) {
		doc.setPage(i);
		doc.setDrawColor(...MUTED);
		doc.setFontSize(7);
		doc.setTextColor(120, 130, 145);
		doc.text("Report di Sicurezza — HiConsole", PAGE_MARGIN, pageHeight - 6);
		doc.text(`Pagina ${i}/${total}`, pageWidth - PAGE_MARGIN, pageHeight - 6, {
			align: "right",
		});
	}
}
