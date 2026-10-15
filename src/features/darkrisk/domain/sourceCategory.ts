// Categorie delle sorgenti DarkRisk e glossario, come in
// app/Services/DarkRisk/Support/SourceCategory.php. Il backend manda già le
// categorie; la conversione qui copre gli snapshot di prima, che hanno ancora i
// bucket grezzi del fornitore (leaks.private.general, web.public.eu, …).

export const SOURCE_GLOSSARY: Array<[string, string]> = [
  ["Data Leak", "Credenziali e dati da database compromessi (pubblici e riservati)."],
  ["Bot Logs / Infostealer", "Dati esfiltrati da malware infostealer (Redline, Vidar, Lumma): cookie e credenziali browser."],
  ["Dark Web", "Servizi nascosti Tor (.onion) e I2P (.i2p): esposizione su rete anonima."],
  ["Paste", "Documenti su siti di paste (es. Pastebin): possibili dump di credenziali."],
  ["Web pubblico", "Pagine web pubblicamente indicizzate che citano il dominio/asset."],
  ["Web governativo", "Siti governativi pubblici che citano l'asset."],
  ["WHOIS / Dominio", "Dati di registrazione e configurazione del dominio."],
  ["Dumpster / Misti", "Dati eterogenei ad alto valore non classificati altrove."],
];

const CATEGORIES = SOURCE_GLOSSARY.map(([c]) => c);

export function sourceCategory(raw: string): string {
  const s = raw.trim().toLowerCase();
  const known = CATEGORIES.find((c) => c.toLowerCase() === s);
  if (known) return known;
  if (!s) return "Dumpster / Misti";
  if (s.startsWith("leaks.logs") || s.startsWith("leaks logs") || s.startsWith("bot") || s.includes("infostealer")) return "Bot Logs / Infostealer";
  if (s.startsWith("leak") || s.includes("data leak")) return "Data Leak";
  if (s.startsWith("darknet") || s.startsWith("dark-web") || s.startsWith("darkweb") || s.startsWith("dark web") || s.includes("onion") || s.includes("i2p")) return "Dark Web";
  if (s.startsWith("paste")) return "Paste";
  if (s.startsWith("web.gov") || s.includes("governativ")) return "Web governativo";
  if (s.startsWith("web") || ["social", "social media", "forum", "news"].includes(s)) return "Web pubblico";
  if (s.startsWith("whois") || s.startsWith("dns") || s.startsWith("domain")) return "WHOIS / Dominio";
  return "Dumpster / Misti";
}

/** Somma i conteggi per categoria. */
export function aggregateBySourceCategory(data: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    const c = sourceCategory(key);
    out[c] = (out[c] ?? 0) + Number(value || 0);
  }
  return out;
}
