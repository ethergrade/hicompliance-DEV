/**
 * Motore di impaginazione del report su jsPDF: testo nativo e misurato.
 *
 * Prima le sezioni dopo il Q&A erano screenshot dei componenti web fatti
 * scorrere sotto due maschere: il taglio di pagina cadeva su un pixel
 * qualsiasi, le intestazioni andavano a capo dentro le parole e nel PDF
 * finivano paginatori e filtri. Qui ogni riga di tabella viene misurata
 * prima di essere scritta, non si spezza mai, e a ogni cambio pagina tornano
 * titolo («continua») e intestazione.
 */
import { jsPDF } from "jspdf";
import { pdfSafe } from "./text";

export type RGB = [number, number, number];

/** Font TrueType in base64 (Montserrat): vedi fonts.ts. */
export interface ReportFonts {
	regular: string;
	semibold: string;
	italic: string;
}

export const PAGE = { width: 210, height: 297, marginX: 16, top: 22, bottom: 20 } as const;
export const CONTENT_W = PAGE.width - PAGE.marginX * 2; // 178 mm

/** Token HiSolution (brand-tokens.json): il colore di brand resta separato dalla severità. */
export const BRAND = {
	navy: [62, 77, 93] as RGB,
	orange: [255, 130, 0] as RGB,
	gray: [83, 86, 90] as RGB,
	lightBlue: [133, 167, 182] as RGB,
	line: [221, 226, 230] as RGB,
	tint: [244, 246, 248] as RGB,
	card: [239, 242, 245] as RGB,
	text: [33, 37, 41] as RGB,
	muted: [108, 117, 125] as RGB,
	white: [255, 255, 255] as RGB,
};

export const SEVERITY: Record<string, RGB> = {
	critical: [176, 32, 32],
	high: [204, 85, 0],
	medium: [161, 120, 0],
	low: [37, 99, 175],
	info: [100, 116, 139],
};

/** Fasce dell'assessment, dalla più critica alla migliore. */
export const RISK_BAND: Record<string, RGB> = {
	Altissimo: [176, 32, 32],
	Alto: [204, 85, 0],
	Moderato: [161, 120, 0],
	Basso: [46, 125, 50],
	"Molto basso": [27, 94, 32],
};

const MM_PER_PT = 0.3528;

export type Align = "left" | "right" | "center";

export interface Column {
	label: string;
	/** Larghezza in mm: la somma deve stare nei 178 mm utili. */
	width: number;
	align?: Align;
	/** Valori brevi (date, importi, sigle): una riga sola, si riduce il corpo prima di andare a capo. */
	nowrap?: boolean;
}

export type Cell = string | number | null | undefined | { text: string; color?: RGB; bold?: boolean };

export interface TableOptions {
	title?: string;
	/**
	 * Titolo da stampare solo sulle pagine di continuazione, quando la tabella
	 * segue già un titolo di sezione: così non si duplica sulla prima pagina.
	 */
	continueTitle?: string;
	fontSize?: number;
	emptyText?: string;
	/** Riga di nota sotto la tabella (es. righe incluse, filtri applicati). */
	note?: string;
}

interface TocEntry {
	title: string;
	level: number;
	page: number;
}

export class PdfWriter {
	readonly doc: jsPDF;
	y: number = PAGE.top;
	private readonly toc: TocEntry[] = [];

	/** Montserrat se i font sono stati caricati, altrimenti il font standard. */
	private readonly family: string;

	constructor(opts: { compress?: boolean; fonts?: ReportFonts | null } = {}) {
		this.doc = new jsPDF({ unit: "mm", format: "a4", compress: opts.compress ?? true });
		this.family = "helvetica";
		if (opts.fonts) {
			// Font incorporato: larghezze corrette per ogni glifo (il «€» del font
			// standard si sovrapponeva alla cifra successiva) e identità HiSolution.
			const add = (file: string, data: string, style: string) => {
				this.doc.addFileToVFS(file, data);
				this.doc.addFont(file, "Montserrat", style);
			};
			add("Montserrat-Regular.ttf", opts.fonts.regular, "normal");
			add("Montserrat-SemiBold.ttf", opts.fonts.semibold, "bold");
			add("Montserrat-Italic.ttf", opts.fonts.italic, "italic");
			this.family = "Montserrat";
		}
		this.doc.setLineHeightFactor(1.25);
		this.font(10);
	}

	get bottom(): number {
		return PAGE.height - PAGE.bottom;
	}

	get pageNumber(): number {
		return this.doc.getCurrentPageInfo().pageNumber;
	}

	get tocEntries(): readonly TocEntry[] {
		return this.toc;
	}

	addPage(): void {
		this.doc.addPage();
		this.y = PAGE.top;
	}

	/** Va a pagina nuova se l'altezza richiesta non entra. */
	ensure(height: number): boolean {
		if (this.y + height > this.bottom) {
			this.addPage();
			return true;
		}
		return false;
	}

	space(mm: number): void {
		this.y += mm;
	}

	font(size: number, style: "normal" | "bold" | "italic" = "normal", color: RGB = BRAND.text): void {
		this.doc.setFont(this.family, style);
		this.doc.setFontSize(size);
		this.doc.setTextColor(color[0], color[1], color[2]);
	}

	lineHeight(size: number, factor = 1.25): number {
		return size * MM_PER_PT * factor;
	}

	/** A capo fra parole; una parola più larga della colonna si spezza solo se non c'è altro modo. */
	split(text: string, width: number): string[] {
		const safe = pdfSafe(text);
		if (!safe) return [""];
		return safe.split("\n").flatMap((part) => (part ? (this.doc.splitTextToSize(part, width) as string[]) : [""]));
	}

	textWidth(text: string): number {
		return this.doc.getTextWidth(pdfSafe(text));
	}

	/** Titolo di sezione: entra nell'indice e resta con almeno l'inizio del contenuto. */
	heading(title: string, level: 1 | 2 | 3 = 1, opts: { toc?: boolean; keepWith?: number } = {}): void {
		const size = level === 1 ? 16 : level === 2 ? 12.5 : 10.5;
		const before = level === 1 ? 2 : level === 2 ? 4 : 3;
		const lines = (() => {
			this.font(size, "bold", level === 1 ? BRAND.navy : BRAND.text);
			return this.split(title, CONTENT_W);
		})();
		const height = lines.length * this.lineHeight(size) + before + 2;
		this.ensure(height + (opts.keepWith ?? 18));
		this.y += before;
		this.font(size, "bold", level === 1 ? BRAND.navy : BRAND.text);
		for (const line of lines) {
			this.doc.text(line, PAGE.marginX, this.y, { baseline: "top" });
			this.y += this.lineHeight(size);
		}
		if (level === 1) {
			this.doc.setDrawColor(...BRAND.orange);
			this.doc.setLineWidth(0.6);
			this.doc.line(PAGE.marginX, this.y + 0.8, PAGE.marginX + 24, this.y + 0.8);
			this.y += 2.5;
		}
		this.y += 2;
		if (opts.toc !== false && level <= 2) {
			this.toc.push({ title: pdfSafe(title), level, page: this.pageNumber });
		}
	}

	/** Paragrafo che può continuare sulla pagina successiva, riga per riga. */
	paragraph(
		text: string,
		opts: { size?: number; style?: "normal" | "bold" | "italic"; color?: RGB; indent?: number; gapAfter?: number; width?: number } = {},
	): void {
		const size = opts.size ?? 10;
		const indent = opts.indent ?? 0;
		this.font(size, opts.style ?? "normal", opts.color ?? BRAND.text);
		const lines = this.split(text, (opts.width ?? CONTENT_W) - indent);
		const lh = this.lineHeight(size);
		// almeno due righe insieme, per non lasciare una riga orfana a fondo pagina
		this.ensure(Math.min(lines.length, 2) * lh);
		for (const line of lines) {
			if (this.ensure(lh)) this.font(size, opts.style ?? "normal", opts.color ?? BRAND.text);
			this.doc.text(line, PAGE.marginX + indent, this.y, { baseline: "top" });
			this.y += lh;
		}
		this.y += opts.gapAfter ?? 2;
	}

	bullets(items: string[], opts: { size?: number } = {}): void {
		const size = opts.size ?? 10;
		for (const item of items) {
			this.font(size);
			const lines = this.split(item, CONTENT_W - 5);
			const lh = this.lineHeight(size);
			this.ensure(Math.min(lines.length, 2) * lh);
			this.doc.text("•", PAGE.marginX + 1, this.y, { baseline: "top" });
			for (const line of lines) {
				if (this.ensure(lh)) this.font(size);
				this.doc.text(line, PAGE.marginX + 5, this.y, { baseline: "top" });
				this.y += lh;
			}
			this.y += 0.8;
		}
		this.y += 1.5;
	}

	/** Riquadri affiancati con valore principale ed etichetta: misurati prima di disegnarli. */
	kpis(cards: Array<{ label: string; value: string; hint?: string | null; color?: RGB }>, perRow = 3): void {
		const gap = 3;
		const width = (CONTENT_W - gap * (perRow - 1)) / perRow;
		for (let start = 0; start < cards.length; start += perRow) {
			const row = cards.slice(start, start + perRow);
			const measured = row.map((card) => {
				this.font(8);
				const label = this.split(card.label.toUpperCase(), width - 6);
				this.font(13, "bold");
				const value = this.split(card.value, width - 6);
				this.font(8);
				const hint = card.hint ? this.split(card.hint, width - 6) : [];
				const height =
					4 + label.length * this.lineHeight(8) + 1 + value.length * this.lineHeight(13) + (hint.length ? 1 + hint.length * this.lineHeight(8) : 0) + 3;
				return { card, label, value, hint, height };
			});
			const height = Math.max(...measured.map((m) => m.height));
			this.ensure(height + gap);
			measured.forEach((m, i) => {
				const x = PAGE.marginX + i * (width + gap);
				this.doc.setFillColor(...BRAND.card);
				this.doc.roundedRect(x, this.y, width, height, 1.5, 1.5, "F");
				let yy = this.y + 4;
				this.font(8, "normal", BRAND.muted);
				for (const line of m.label) {
					this.doc.text(line, x + 3, yy, { baseline: "top" });
					yy += this.lineHeight(8);
				}
				yy += 1;
				this.font(13, "bold", m.card.color ?? BRAND.navy);
				for (const line of m.value) {
					this.doc.text(line, x + 3, yy, { baseline: "top" });
					yy += this.lineHeight(13);
				}
				if (m.hint.length) {
					yy += 1;
					this.font(8, "normal", BRAND.muted);
					for (const line of m.hint) {
						this.doc.text(line, x + 3, yy, { baseline: "top" });
						yy += this.lineHeight(8);
					}
				}
			});
			this.y += height + gap;
		}
		this.y += 1;
	}

	/**
	 * Tabella paginata per righe intere. Intestazione e titolo tornano a ogni
	 * cambio pagina; titolo, intestazione e prima riga stanno sempre insieme.
	 */
	table(columns: Column[], rows: Cell[][], opts: TableOptions = {}): void {
		const size = opts.fontSize ?? 9;
		const lh = this.lineHeight(size);
		const padX = 1.6;
		const padY = 1.5;

		const cellText = (cell: Cell): string =>
			cell === null || cell === undefined ? "" : typeof cell === "object" ? cell.text : String(cell);

		// Intestazioni: a capo solo fra parole. Se una parola da sola non entra
		// nella colonna («Avanzamento»), si riduce il corpo di quella colonna.
		const headerSizes = columns.map((c) => {
			const words = pdfSafe(c.label).split(/\s+/).filter(Boolean);
			for (let s = size; s > 6; s -= 0.5) {
				this.font(s, "bold");
				if (words.every((word) => this.textWidth(word) <= c.width - padX * 2)) return s;
			}
			return 6;
		});
		const headerLines = columns.map((c, i) => {
			this.font(headerSizes[i], "bold");
			return this.split(c.label, c.width - padX * 2);
		});
		const headerH = Math.max(...headerLines.map((l) => l.length)) * lh + padY * 2;

		const measured = rows.map((row) =>
			columns.map((col, i) => {
				const cell = row[i];
				const bold = typeof cell === "object" && cell !== null && Boolean(cell.bold);
				const text = cellText(cell);
				this.font(size, bold ? "bold" : "normal");
				const avail = col.width - padX * 2;
				if (col.nowrap) {
					// Valore breve: prima si riduce il corpo, poi (solo se non basta) si va a capo.
					for (let s = size; s >= 6.5; s -= 0.5) {
						this.font(s, bold ? "bold" : "normal");
						if (this.textWidth(text) <= avail) return { lines: [pdfSafe(text)], size: s, bold };
					}
					this.font(size, bold ? "bold" : "normal");
				}
				return { lines: this.split(text, avail), size, bold };
			}),
		);
		const rowHeights = measured.map((cells) => Math.max(...cells.map((c) => c.lines.length)) * lh + padY * 2);

		const titleSize = 10.5;
		const titleH = opts.title ? this.lineHeight(titleSize) + 2 : 0;
		const contTitleH = opts.title || opts.continueTitle ? this.lineHeight(titleSize) + 2 : 0;

		const drawTitle = (continued: boolean) => {
			const base = opts.title ?? (continued ? opts.continueTitle : undefined);
			if (!base) return;
			this.font(titleSize, "bold", BRAND.text);
			const text = pdfSafe(continued ? `${base} (continua)` : base);
			for (const line of this.split(text, CONTENT_W)) {
				this.doc.text(line, PAGE.marginX, this.y, { baseline: "top" });
				this.y += this.lineHeight(titleSize);
			}
			this.y += 2;
		};

		const drawHeader = () => {
			this.doc.setFillColor(...BRAND.navy);
			this.doc.rect(PAGE.marginX, this.y, CONTENT_W, headerH, "F");
			let x = PAGE.marginX;
			columns.forEach((col, i) => {
				this.font(headerSizes[i], "bold", BRAND.white);
				headerLines[i].forEach((line, k) => {
					this.writeAligned(line, x, col.width, padX, this.y + padY + k * lh, col.align);
				});
				x += col.width;
			});
			this.y += headerH;
		};

		const first = rowHeights[0] ?? lh + padY * 2;
		this.ensure(titleH + headerH + Math.min(first, 40));
		drawTitle(false);
		drawHeader();

		if (rows.length === 0) {
			this.font(size, "italic", BRAND.muted);
			this.doc.text(pdfSafe(opts.emptyText ?? "Nessun elemento."), PAGE.marginX + padX, this.y + padY, { baseline: "top" });
			this.y += lh + padY * 2;
		}

		measured.forEach((cells, r) => {
			let remaining = cells.map((c) => [...c.lines]);
			let rowH = rowHeights[r];
			const usable = this.bottom - PAGE.top - contTitleH - headerH;

			// Riga più alta di una pagina (nota lunghissima): si spezza per righe di
			// testo, con intestazione ripetuta. Caso eccezionale, non la regola.
			while (rowH > 0) {
				if (this.y + Math.min(rowH, usable) > this.bottom) {
					this.addPage();
					drawTitle(true);
					drawHeader();
				}
				const fits = Math.floor((this.bottom - this.y - padY * 2) / lh);
				const take = Math.max(1, Math.min(fits, Math.max(...remaining.map((l) => l.length))));
				const chunkH = take * lh + padY * 2;

				if (r % 2 === 1) {
					this.doc.setFillColor(...BRAND.tint);
					this.doc.rect(PAGE.marginX, this.y, CONTENT_W, chunkH, "F");
				}
				let x = PAGE.marginX;
				columns.forEach((col, i) => {
					const cell = rows[r][i];
					const color = typeof cell === "object" && cell !== null && cell.color ? cell.color : BRAND.text;
					this.font(cells[i].size, cells[i].bold ? "bold" : "normal", color);
					remaining[i].slice(0, take).forEach((line, k) => {
						this.writeAligned(line, x, col.width, padX, this.y + padY + k * lh, col.align);
					});
					x += col.width;
				});
				this.doc.setDrawColor(...BRAND.line);
				this.doc.setLineWidth(0.2);
				this.doc.line(PAGE.marginX, this.y + chunkH, PAGE.marginX + CONTENT_W, this.y + chunkH);
				this.y += chunkH;

				remaining = remaining.map((l) => l.slice(take));
				const left = Math.max(...remaining.map((l) => l.length));
				rowH = left > 0 ? left * lh + padY * 2 : 0;
			}
		});

		if (opts.note) {
			this.y += 1.5;
			this.paragraph(opts.note, { size: 8, color: BRAND.muted, gapAfter: 0 });
		}
		this.y += 4;
	}

	/** Barre orizzontali 0–100 con nome intero a sinistra e valore a destra. */
	bars(items: Array<{ label: string; value: number | null; valueLabel: string; color: RGB }>, opts: { labelWidth?: number } = {}): void {
		const labelW = opts.labelWidth ?? 68;
		const size = 9;
		const lh = this.lineHeight(size);
		// La colonna dei valori si misura sull'etichetta più lunga, con margine:
		// a larghezza fissa «100/100 · Molto basso» invadeva la fine della barra.
		this.font(size, "bold");
		const valueW = Math.max(30, ...items.map((item) => this.textWidth(item.valueLabel))) + 4;
		const barX = PAGE.marginX + labelW + 2;
		const barW = CONTENT_W - labelW - 2 - valueW;

		// scala: 0, 20, 40, 60, 80, 100
		const drawScale = () => {
			this.font(7, "normal", BRAND.muted);
			for (let v = 0; v <= 100; v += 20) {
				const x = barX + (barW * v) / 100;
				this.doc.text(String(v), x, this.y, { baseline: "top", align: "center" });
			}
			this.y += 3.5;
		};
		this.ensure(14);
		drawScale();

		for (const item of items) {
			this.font(size);
			const lines = this.split(item.label, labelW);
			const h = Math.max(lines.length * lh, 4.5) + 2;
			if (this.ensure(h)) drawScale();
			this.font(size, "normal", BRAND.text);
			lines.forEach((line, k) => this.doc.text(line, PAGE.marginX, this.y + 1 + k * lh, { baseline: "top" }));
			const barY = this.y + 1 + (Math.max(lines.length * lh, 4.5) - 3.5) / 2;
			this.doc.setFillColor(...BRAND.tint);
			this.doc.rect(barX, barY, barW, 3.5, "F");
			if (item.value !== null && item.value > 0) {
				this.doc.setFillColor(...item.color);
				this.doc.rect(barX, barY, (barW * Math.min(100, item.value)) / 100, 3.5, "F");
			}
			this.font(size, "bold", item.color);
			this.doc.text(pdfSafe(item.valueLabel), PAGE.marginX + CONTENT_W, barY - 0.2, { baseline: "top", align: "right" });
			this.y += h;
		}
		this.y += 3;
	}

	private writeAligned(line: string, x: number, width: number, pad: number, y: number, align: Align = "left"): void {
		if (align === "right") this.doc.text(line, x + width - pad, y, { baseline: "top", align: "right" });
		else if (align === "center") this.doc.text(line, x + width / 2, y, { baseline: "top", align: "center" });
		else this.doc.text(line, x + pad, y, { baseline: "top" });
	}

	/** Indice cliccabile su una pagina già riservata, segnalibri, intestazioni e footer numerati. */
	finalize(opts: { tocPage: number | null; headerText: string; footerText: string }): void {
		const total = this.doc.getNumberOfPages();

		if (opts.tocPage) {
			this.doc.setPage(opts.tocPage);
			let y = PAGE.top + 14;
			for (const entry of this.toc) {
				const size = entry.level === 1 ? 10.5 : 9.5;
				const indent = entry.level === 1 ? 0 : 6;
				this.font(size, entry.level === 1 ? "bold" : "normal", BRAND.text);
				const page = String(entry.page);
				const titleW = CONTENT_W - indent - 14;
				const lines = this.split(entry.title, titleW);
				lines.forEach((line, k) => {
					this.doc.text(line, PAGE.marginX + indent, y + k * this.lineHeight(size), { baseline: "top" });
				});
				this.doc.text(page, PAGE.marginX + CONTENT_W, y, { baseline: "top", align: "right" });
				const h = lines.length * this.lineHeight(size);
				this.doc.link(PAGE.marginX, y, CONTENT_W, h, { pageNumber: entry.page });
				y += h + (entry.level === 1 ? 2.2 : 1.2);
				if (y > this.bottom) break;
			}
		}

		// Segnalibri del lettore PDF.
		const outline = (this.doc as unknown as { outline?: { add: (parent: unknown, title: string, opts: { pageNumber: number }) => unknown } }).outline;
		if (outline) {
			let parent: unknown = null;
			for (const entry of this.toc) {
				const node = outline.add(entry.level === 1 ? null : parent, entry.title, { pageNumber: entry.page });
				if (entry.level === 1) parent = node;
			}
		}

		for (let i = 2; i <= total; i++) {
			this.doc.setPage(i);
			this.font(7.5, "normal", BRAND.muted);
			this.doc.text(pdfSafe(opts.headerText), PAGE.marginX, 10, { baseline: "top" });
			this.doc.setDrawColor(...BRAND.line);
			this.doc.setLineWidth(0.2);
			this.doc.line(PAGE.marginX, 14, PAGE.marginX + CONTENT_W, 14);
			this.doc.line(PAGE.marginX, PAGE.height - 13, PAGE.marginX + CONTENT_W, PAGE.height - 13);
			this.doc.text(pdfSafe(opts.footerText), PAGE.marginX, PAGE.height - 11, { baseline: "top" });
			this.doc.text(`Pagina ${i} di ${total}`, PAGE.marginX + CONTENT_W, PAGE.height - 11, { baseline: "top", align: "right" });
		}
	}
}
