export interface AiCategoryAdvice {
	category: string;
	advice: string; // markdown
}

/** Estrae il testo markdown grezzo da openai_data (vari formati). */
function extractText(data: unknown): string {
	// openai_data può essere doppio/triplo-encoded (stringa JSON che contiene
	// una stringa JSON): decodifichiamo finché resta una stringa JSON.
	let cur: unknown = data;
	for (let i = 0; i < 4 && typeof cur === "string"; i++) {
		const s = cur.trim();
		if (!(s.startsWith("[") || s.startsWith("{") || s.startsWith('"'))) break;
		try {
			cur = JSON.parse(s);
		} catch {
			break;
		}
	}

	const arr = Array.isArray(cur) ? cur : null;
	if (!arr || arr.length === 0) return "";

	const first = arr[0] as Record<string, unknown>;
	// Formato thread message OpenAI: [{ content: [{ text: { value } }] }]
	const content = first?.content;
	if (Array.isArray(content) && content.length > 0) {
		const block = content[0] as Record<string, unknown>;
		const text = block?.text as Record<string, unknown> | undefined;
		if (typeof text?.value === "string") return text.value;
	}
	// Formato semplice: [{ text: { value } }]
	const text = first?.text as Record<string, unknown> | undefined;
	if (typeof text?.value === "string") return text.value;

	return "";
}

/**
 * Estrae i consigli per categoria dalla sezione "FOCUS CATEGORIE" del report
 * OpenAI (porting della logica Nis2::parseOpenai del vecchio sistema).
 * Salta la sezione CYBERSWOT; termina su SINTESI/FOCUS FINALE.
 */
export function parseAiCategoryAdvice(openaiData: unknown): AiCategoryAdvice[] {
	const raw = extractText(openaiData).replace(/---/g, "");
	if (!raw) return [];

	const headerRe = /^(#{1,4})\s+/;
	const lines = raw.split("\n");
	const result: AiCategoryAdvice[] = [];
	let current: "intro" | "analysis" | "categories" | "outro" = "intro";
	let skipCyberswot = false;
	let currentCat: AiCategoryAdvice | null = null;

	const flush = () => {
		if (currentCat && currentCat.category) {
			currentCat.advice = currentCat.advice.trim();
			result.push(currentCat);
		}
		currentCat = null;
	};

	for (const line of lines) {
		const s = line.trim();
		if (headerRe.test(s)) {
			const up = s.toUpperCase();
			if (up.includes("CYBERSWOT")) {
				skipCyberswot = true;
				continue;
			}
			if (
				skipCyberswot &&
				(up.includes("FOCUS FINALE E CONCLUSIONI") ||
					up.includes("SINTESI DEI MIGLIORAMENTI") ||
					up.includes("FOCUS CATEGORIE") ||
					up.includes("ANALISI DEL REPORT"))
			) {
				skipCyberswot = false;
			}
			if (skipCyberswot) continue;

			if (up.includes("ANALISI DEL REPORT")) {
				flush();
				current = "analysis";
				continue;
			}
			if (up.includes("FOCUS CATEGORIE")) {
				flush();
				current = "categories";
				continue;
			}
			if (up.includes("SINTESI DEI MIGLIORAMENTI") || up.includes("FOCUS FINALE E CONCLUSIONI")) {
				flush();
				current = "outro";
				continue;
			}

			// Header interno alla sezione categorie = nuova categoria.
			if (current === "categories") {
				flush();
				const name = s
					.replace(/^#{1,4}\s*(?:Categoria:\s*)?/i, "")
					.replace(/\*\*/g, "")
					.trim();
				currentCat = { category: name, advice: "" };
			}
			continue;
		}

		if (skipCyberswot) continue;
		if (current === "categories" && currentCat) {
			currentCat.advice += (currentCat.advice ? "\n" : "") + line;
		}
	}
	flush();

	return result;
}
