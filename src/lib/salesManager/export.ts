import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import logoUrl from "@/assets/logo-hi.png";
import { COMMERCIAL_STATUSES, STATUS_LABELS, effectiveValue, type ClientSummary, type SalesRow } from "./value";

const today = () => new Date().toLocaleDateString("it-IT");
const stamp = () => new Date().toISOString().slice(0, 10);

function detailRecords(rows: SalesRow[], names: Record<string, string>) {
	return rows.map((r) => ({
		Cliente: names[r.organizationId] ?? r.organizationId, Azione: r.task, Categoria: r.category, Priorità: r.priority,
		"Avanzamento %": r.progress, "Budget piano": r.budget ?? "", "Valore commerciale": r.proposedValue ?? "",
		"Valore effettivo": effectiveValue(r.budget, r.proposedValue) ?? "",
		"Budget allineato al piano": r.proposedValue == null ? "" : Number(r.proposedValue) === Number(r.budget ?? 0) ? "Sì" : "No",
		Stato: STATUS_LABELS[r.status], "Data proposta": r.proposedAt ?? "", "Data chiusura": r.closedAt ?? "",
		"Ultimo aggiornamento": r.updatedAt ? new Date(r.updatedAt).toLocaleString("it-IT") : "", Note: r.notes ?? "",
		"ID remediation": r.taskId, "ID cliente": r.organizationId,
	}));
}
function summaryRecords(s: ClientSummary[]) {
	return s.map((c) => ({
		Cliente: c.name, Remediation: c.total, "Da valorizzare": c.unvalued,
		...Object.fromEntries(COMMERCIAL_STATUSES.map((st) => [STATUS_LABELS[st], c.byStatus[st]])),
		"Pipeline (EUR)": c.pipelineValue, "Accettato (EUR)": c.acceptedValue, "ID cliente": c.organizationId,
	}));
}

export function exportCsv(summary: ClientSummary[], rows: SalesRow[], names: Record<string, string>) {
	const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(summaryRecords(summary)), { FS: ";" })
		+ "\n\n" + XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(detailRecords(rows, names)), { FS: ";" });
	saveAs(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `HiSolution_SalesManager_${stamp()}.csv`);
}

export function exportExcel(summary: ClientSummary[], rows: SalesRow[], names: Record<string, string>) {
	const wb = XLSX.utils.book_new();
	const head = [["HiSolution S.r.l. — Sales Manager"], [`Piani di remediation · Report del ${today()}`], []];
	const s1 = XLSX.utils.aoa_to_sheet(head);
	XLSX.utils.sheet_add_json(s1, summaryRecords(summary), { origin: "A4" });
	s1["!cols"] = [{ wch: 32 }, ...Array(12).fill({ wch: 14 })];
	const s2 = XLSX.utils.aoa_to_sheet(head);
	XLSX.utils.sheet_add_json(s2, detailRecords(rows, names), { origin: "A4" });
	s2["!cols"] = [{ wch: 28 }, { wch: 50 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 38 }, { wch: 38 }];
	XLSX.utils.book_append_sheet(wb, s1, "Riepilogo");
	XLSX.utils.book_append_sheet(wb, s2, "Dettaglio");
	XLSX.writeFile(wb, `HiSolution_SalesManager_${stamp()}.xlsx`);
}

async function logoData(): Promise<string> {
	const b = await (await fetch(logoUrl)).blob();
	return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });
}
const fmt = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export async function exportPpt(summary: ClientSummary[], rows: SalesRow[]) {
	const { default: PptxGenJS } = await import("pptxgenjs");
	const pptx = new PptxGenJS();
	pptx.layout = "LAYOUT_WIDE";
	const logo = await logoData();
	const NAVY = "0F1E3C", ACC = "1FA2C9", LIGHT = "F4F6FA";
	pptx.defineSlideMaster({
		title: "HISOL", background: { color: "FFFFFF" },
		objects: [
			{ rect: { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: NAVY } } },
			{ image: { data: logo, x: 0.4, y: 0.15, w: 0.6, h: 0.6 } },
			{ text: { text: "HiSolution · Sales Manager", options: { x: 1.15, y: 0.2, w: 8, h: 0.5, color: "FFFFFF", fontSize: 16, bold: true, fontFace: "Georgia" } } },
			{ rect: { x: 0, y: 7.2, w: 13.33, h: 0.3, fill: { color: LIGHT } } },
			{ text: { text: `Riservato · ${today()}`, options: { x: 0.4, y: 7.2, w: 6, h: 0.3, fontSize: 10, color: "5A6478" } } },
		],
		slideNumber: { x: 12.5, y: 7.2, fontSize: 10, color: "5A6478" },
	});
	const cover = pptx.addSlide();
	cover.background = { color: NAVY };
	cover.addImage({ data: logo, x: 0.8, y: 0.8, w: 1.4, h: 1.4 });
	cover.addText("Piani di remediation", { x: 0.8, y: 2.8, w: 11, h: 1, fontSize: 48, bold: true, color: "FFFFFF", fontFace: "Georgia" });
	cover.addText(`Pipeline commerciale · ${today()}`, { x: 0.8, y: 3.9, w: 11, h: 0.6, fontSize: 22, color: ACC });

	const tot = summary.reduce((a, c) => ({ p: a.p + c.pipelineValue, w: a.w + c.acceptedValue, n: a.n + c.total, u: a.u + c.unvalued }), { p: 0, w: 0, n: 0, u: 0 });
	const s = pptx.addSlide({ masterName: "HISOL" });
	s.addText("Riepilogo pipeline", { x: 0.5, y: 1.1, w: 12, h: 0.7, fontSize: 32, bold: true, color: NAVY, fontFace: "Georgia" });
	[["Pipeline", fmt(tot.p)], ["Accettato", fmt(tot.w)], ["Remediation", String(tot.n)], ["Da valorizzare", String(tot.u)]].forEach(([l, v], i) => {
		s.addShape("rect", { x: 0.5 + i * 3.1, y: 2.0, w: 2.9, h: 1.4, fill: { color: LIGHT } });
		s.addText(v, { x: 0.5 + i * 3.1, y: 2.05, w: 2.9, h: 0.85, fontSize: 30, bold: true, color: NAVY, align: "center" });
		s.addText(l, { x: 0.5 + i * 3.1, y: 2.85, w: 2.9, h: 0.45, fontSize: 14, color: "5A6478", align: "center" });
	});
	s.addChart("bar", [{ name: "Remediation", labels: COMMERCIAL_STATUSES.map((x) => STATUS_LABELS[x]), values: COMMERCIAL_STATUSES.map((x) => summary.reduce((a, c) => a + c.byStatus[x], 0)) }],
		{ x: 0.5, y: 3.7, w: 12.3, h: 3.3, chartColors: [ACC], showValue: true, catAxisLabelFontSize: 12, valAxisHidden: true });

	const PER = 10;
	for (const c of summary.filter((x) => x.total > 0)) {
		const all = rows.filter((x) => x.organizationId === c.organizationId);
		const pages = Math.max(1, Math.ceil(all.length / PER));
		for (let p = 0; p < pages; p++) {
			const sl = pptx.addSlide({ masterName: "HISOL" });
			sl.addText(c.name + (pages > 1 ? ` (${p + 1}/${pages})` : ""), { x: 0.5, y: 1.1, w: 12, h: 0.7, fontSize: 28, bold: true, color: NAVY, fontFace: "Georgia" });
			sl.addText(`Remediation ${c.total} · Da valorizzare ${c.unvalued} · Pipeline ${fmt(c.pipelineValue)} · Accettato ${fmt(c.acceptedValue)}`, { x: 0.5, y: 1.8, w: 12.3, h: 0.4, fontSize: 14, color: ACC });
			const hdr = ["Azione", "Categoria", "Priorità", "Avanz.", "Budget piano", "Valore comm.", "Stato", "Note"].map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } }));
			const body = all.slice(p * PER, (p + 1) * PER).map((x) => [x.task, x.category ?? "", x.priority ?? "", `${x.progress}%`,
				x.budget ? fmt(Number(x.budget)) : "—", x.proposedValue ? fmt(Number(x.proposedValue)) : "—", STATUS_LABELS[x.status], x.notes ?? ""].map((t) => ({ text: String(t) })));
			sl.addTable([hdr, ...body], { x: 0.4, y: 2.3, w: 12.5, colW: [3.9, 1.5, 0.9, 0.8, 1.3, 1.3, 1.2, 1.6], fontSize: 9, border: { type: "solid", color: "DDE2EA", pt: 0.5 }, autoPage: false });
		}
	}
	const end = pptx.addSlide();
	end.background = { color: NAVY };
	end.addImage({ data: logo, x: 5.97, y: 1.8, w: 1.4, h: 1.4 });
	end.addText("HiSolution", { x: 0, y: 3.5, w: 13.33, h: 0.8, fontSize: 36, bold: true, color: "FFFFFF", align: "center", fontFace: "Georgia" });
	end.addText("Grazie", { x: 0, y: 4.3, w: 13.33, h: 0.6, fontSize: 20, color: ACC, align: "center" });
	await pptx.writeFile({ fileName: `HiSolution_SalesManager_${stamp()}.pptx` });
}
