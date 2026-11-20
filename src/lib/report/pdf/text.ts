/**
 * Testo sicuro per i font standard del PDF (codifica WinAnsi).
 *
 * I font standard coprono l'italiano (accenti, €, «», …, –, •) ma non frecce,
 * simboli matematici o emoji: vanno sostituiti, altrimenti jsPDF stampa
 * caratteri sbagliati e il testo copiato dal PDF non corrisponde.
 */
const REPLACEMENTS: Array<[RegExp, string]> = [
	[/[→⇒➜➔]/g, "->"],
	[/[←⇐]/g, "<-"],
	[/≥/g, ">="],
	[/≤/g, "<="],
	[/≠/g, "!="],
	[/[−‐‑‒]/g, "-"],
	[/[✓✔]/g, "OK"],
	[/[✗✘]/g, "x"],
	[/×/g, "x"],
	[/[​-‍﻿]/g, ""],
	[/ /g, " "],
];

// Caratteri della codifica WinAnsi oltre a ASCII stampabile e Latin-1.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

const isWinAnsi = (ch: string): boolean => {
	const code = ch.codePointAt(0) ?? 0;
	return (
		ch === "\n" ||
		(code >= 0x20 && code <= 0x7e) ||
		(code >= 0xa0 && code <= 0xff) ||
		WIN_ANSI_EXTRA.has(ch)
	);
};

export const pdfSafe = (value: unknown): string => {
	let text = String(value ?? "");
	for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement);
	text = text.replace(/\r\n?/g, "\n").replace(/\t/g, " ");
	return Array.from(text).filter(isWinAnsi).join("");
};

/**
 * Markdown dei consigli in testo semplice: paragrafi ed elenchi puntati.
 * Grassetti, titoli e link diventano testo normale.
 */
export const markdownToBlocks = (markdown: string): Array<{ kind: "p" | "li"; text: string }> => {
	const blocks: Array<{ kind: "p" | "li"; text: string }> = [];
	let paragraph: string[] = [];
	const flush = () => {
		const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
		if (text) blocks.push({ kind: "p", text });
		paragraph = [];
	};
	const clean = (line: string) =>
		line
			.replace(/\*\*\*|\*\*|__/g, "")
			.replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$|[.,;:])/g, "$1$2")
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/`([^`]+)`/g, "$1")
			.trim();

	for (const raw of String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n")) {
		const line = raw.trim();
		if (!line) {
			flush();
			continue;
		}
		const bullet = /^([-*+•]|\d+[.)])\s+(.*)$/.exec(line);
		if (bullet) {
			flush();
			blocks.push({ kind: "li", text: clean(bullet[2]) });
			continue;
		}
		const heading = /^#{1,6}\s+(.*)$/.exec(line);
		if (heading) {
			flush();
			blocks.push({ kind: "p", text: clean(heading[1]) });
			continue;
		}
		paragraph.push(clean(line));
	}
	flush();
	return blocks.filter((b) => b.text);
};

/** Data italiana senza secondi: «20 novembre 2026». */
export const formatLongDate = (value: string | Date | null | undefined): string => {
	if (!value) return "Non disponibile";
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime())
		? "Non disponibile"
		: date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
};

/** Data breve: «20/11/2026». */
export const formatShortDate = (value: string | Date | null | undefined): string => {
	if (!value) return "Non disponibile";
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime())
		? "Non disponibile"
		: date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/** Numero italiano con al più una cifra decimale. */
export const formatNumberIt = (value: number, decimals = 1): string =>
	value.toLocaleString("it-IT", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });

/** Email mascherata per i riepiloghi: m***@dominio.it. */
export const maskEmail = (value: string): string =>
	value.includes("@") ? value.replace(/^(.)[^@]*(@.*)$/, "$1***$2") : value;
