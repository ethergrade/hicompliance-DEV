import type { HipatchAsset } from "@/lib/api/hipatch";

/**
 * Il sistema operativo di un asset HiPatch, dal campo più completo a quello più
 * povero: nome completo, nome, produttore + versione, piattaforma. Null se la
 * scansione non l'ha identificato: tabelle ed export mostrano un trattino, con
 * il tooltip che spiega perché; il filtro per OS lo chiama «OS non rilevato».
 */
export function assetOs(a: HipatchAsset): string | null {
	const v = (s?: string) => (s ?? "").trim();
	return (
		v(a["data.os_full_name"]) ||
		v(a["data.os_name"]) ||
		[v(a["data.os_vendor"]), v(a["data.os_version"])].filter(Boolean).join(" ") ||
		v(a["data.platform"]) ||
		null
	);
}

/** Voce del filtro per sistema operativo. */
export const OS_NON_RILEVATO = "OS non rilevato";

/** Cella di tabella ed export quando l'OS non è stato identificato. */
export const OS_ASSENTE = "—";

/** Il tooltip: perché manca, e che non è un errore della pagina. */
export const OS_NON_RILEVATO_HINT =
	"La scansione ha trovato il dispositivo in rete ma non ne ha identificato il sistema operativo (per esempio perché non ha un agente o non è stato analizzato con credenziali). Non è un errore di visualizzazione.";
