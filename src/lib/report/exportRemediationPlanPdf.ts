import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const PAGE_MARGIN = 12; // mm
const HEADER_SPACE = 16; // mm riservato al titolo blocco
const FOOTER_SPACE = 16; // mm riservato al footer

const DARK: [number, number, number] = [15, 23, 42];
const ACCENT: [number, number, number] = [100, 210, 255];
const MUTED: [number, number, number] = [150, 180, 200];

/**
 * Esporta il Piano di Remediation come PDF: copertina (come il report completo)
 * + la tabella del gantt catturata dall'elemento passato. Sottoinsieme del report.
 */
export async function exportRemediationPlanPdf(params: {
	companyName: string;
	element: HTMLElement;
}): Promise<void> {
	const { companyName, element } = params;
	const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();

	// ── Copertina ─────────────────────────────────────────────────────────────
	doc.setFillColor(...DARK);
	doc.rect(0, 0, pageWidth, pageHeight, "F");
	doc.setTextColor(...ACCENT);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(26);
	doc.text("Piano di Remediation", pageWidth / 2, 110, { align: "center" });
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

	// I web font devono essere pronti prima della cattura.
	if (document.fonts?.ready) {
		try {
			await document.fonts.ready;
		} catch {
			/* no-op */
		}
	}

	const canvas = await html2canvas(element, {
		scale: 2,
		useCORS: true,
		backgroundColor: "#ffffff",
		logging: false,
	});
	addCapturedBlock(doc, canvas, "Piano di Remediation", pageWidth, pageHeight);
	applyFooter(doc, pageWidth, pageHeight);

	const fileName = `Piano_Remediation_${(companyName || "cliente").replace(/\s+/g, "_")}_${new Date()
		.toISOString()
		.slice(0, 10)}.pdf`;

	const blob = doc.output("blob");
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	a.click();
	URL.revokeObjectURL(url);
}

/** Aggiunge un canvas (anche alto) su una o più pagine, con titolo e margine footer. */
function addCapturedBlock(
	doc: jsPDF,
	canvas: HTMLCanvasElement,
	title: string,
	pageWidth: number,
	pageHeight: number,
): void {
	const imgData = canvas.toDataURL("image/png");
	const imgWidth = pageWidth - PAGE_MARGIN * 2;
	const imgHeight = (canvas.height * imgWidth) / canvas.width;

	doc.addPage();
	doc.setFont("helvetica", "bold");
	doc.setFontSize(13);
	doc.setTextColor(...DARK);
	doc.text(title, PAGE_MARGIN, PAGE_MARGIN + 6);

	const bottomLimit = pageHeight - FOOTER_SPACE;
	let rendered = 0;
	let pageIndex = 0;

	while (rendered < imgHeight - 0.5 && pageIndex < 200) {
		const pageTop = pageIndex === 0 ? PAGE_MARGIN + HEADER_SPACE : PAGE_MARGIN;
		const avail = bottomLimit - pageTop;

		doc.addImage(imgData, "PNG", PAGE_MARGIN, pageTop - rendered, imgWidth, imgHeight);

		doc.setFillColor(255, 255, 255);
		doc.rect(0, bottomLimit, pageWidth, pageHeight - bottomLimit, "F");
		if (pageIndex > 0) doc.rect(0, 0, pageWidth, pageTop, "F");

		rendered += avail;
		pageIndex++;
		if (rendered < imgHeight - 0.5) doc.addPage();
	}
}

/** Footer con numero pagina su tutte le pagine (esclusa la copertina). */
function applyFooter(doc: jsPDF, pageWidth: number, pageHeight: number): void {
	const total = doc.getNumberOfPages();
	for (let i = 2; i <= total; i++) {
		doc.setPage(i);
		doc.setFontSize(7);
		doc.setTextColor(120, 130, 145);
		doc.text("Piano di Remediation — HiConsole", PAGE_MARGIN, pageHeight - 6);
		doc.text(`Pagina ${i}/${total}`, pageWidth - PAGE_MARGIN, pageHeight - 6, {
			align: "right",
		});
	}
}
