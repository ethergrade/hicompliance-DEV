// Legenda e nomenclatura DarkRisk360 per le fonti (bucket) dei finding.
// Mappa gli identificatori tecnici dei bucket in etichette leggibili (IT) per
// dashboard e report. NESSUN riferimento a provider esterni.
//
// Uso: bucketLabel(b) -> etichetta breve; bucketCategory(b) -> categoria;
// BUCKET_LEGEND -> array per render della legenda.

// Etichette esatte per bucket noti (match diretto)
export const BUCKET_LABELS: Record<string, string> = {
  // Data leak (database compromessi)
  'leaks.private.general': 'Data Leak riservati',
  'leaks.public.general': 'Data Leak pubblici',
  'leaks.public.wikileaks': 'Leak WikiLeaks / Cryptome',
  'leaks.restricted': 'Data Leak riservati',
  // Bot logs / infostealer
  'leaks.logs': 'Bot Logs / Infostealer',
  // Dark web
  'darknet.tor': 'Dark Web — Tor (.onion)',
  'darknet.i2p': 'Dark Web — I2P (.i2p)',
  // Paste
  'pastes': 'Paste pubblici',
  'paste': 'Paste pubblici',
  // WHOIS / DNS
  'whois': 'Registrazioni dominio (WHOIS)',
  'dns': 'Record DNS',
  // Documenti
  'documents.public.scihub': 'Documenti pubblici',
  // Usenet
  'usenet': 'Usenet',
  // Dumpster / dati misti
  'dumpster': 'Dati misti (Dumpster)',
  'dumpster.web.ssn': 'Dumpster — siti dati personali',
  'dumpster.web.1': 'Dumpster — siti high-value',
  // Web pubblico per TLD/area
  'web.public.com': 'Web pubblico — .com',
  'web.public.org': 'Web pubblico — .org',
  'web.public.net': 'Web pubblico — .net',
  'web.public.info': 'Web pubblico — .info',
  'web.public.it': 'Web pubblico — .it',
  'web.public.eu': 'Web pubblico — Europa',
  'web.public.de': 'Web pubblico — DACH (AT/DE/LU/CH)',
  'web.public.ua': 'Web pubblico — UA/KZ/RU',
  'web.public.kp': 'Web pubblico — Corea del Nord',
  'web.public.cn': 'Web pubblico — Cina',
  'web.public.peer': 'Web pubblico — TLD blockchain',
  'web.public.tech': 'Web pubblico — .tech',
  'web.public.business': 'Web pubblico — business',
  'web.public.social': 'Web pubblico — social',
  // Web governativo
  'web.public.gov': 'Web governativo — US',
  'web.gov.ru': 'Web governativo — Russia',
};

// Categoria di alto livello per raggruppamento e legenda
export type BucketCategory =
  | 'Data Leak'
  | 'Bot Logs / Infostealer'
  | 'Dark Web'
  | 'Paste'
  | 'Web pubblico'
  | 'Web governativo'
  | 'WHOIS / Dominio'
  | 'Documenti'
  | 'Dumpster / Misti'
  | 'Usenet'
  | 'Altro';

export function bucketCategory(bucket: string | null | undefined): BucketCategory {
  const b = String(bucket || '').trim().toLowerCase();
  if (!b) return 'Altro';
  if (b === 'leaks.logs') return 'Bot Logs / Infostealer';
  if (b.startsWith('leaks.')) return 'Data Leak';
  if (b.startsWith('darknet.')) return 'Dark Web';
  if (b === 'pastes' || b === 'paste') return 'Paste';
  if (b === 'whois' || b === 'dns') return 'WHOIS / Dominio';
  if (b.startsWith('documents.')) return 'Documenti';
  if (b.startsWith('dumpster')) return 'Dumpster / Misti';
  if (b === 'usenet') return 'Usenet';
  if (b === 'web.public.gov' || b.startsWith('web.gov.')) return 'Web governativo';
  if (b.startsWith('web.')) return 'Web pubblico';
  return 'Altro';
}

// Etichetta leggibile per un bucket, con fallback intelligente.
export function bucketLabel(bucket: string | null | undefined): string {
  const raw = String(bucket || '').trim();
  if (!raw) return 'Fonte non classificata';
  const key = raw.toLowerCase();
  if (BUCKET_LABELS[key]) return BUCKET_LABELS[key];
  if (BUCKET_LABELS[raw]) return BUCKET_LABELS[raw];
  // Fallback per prefisso
  if (key.startsWith('web.public.')) {
    const tld = key.split('.').slice(2).join('.');
    return tld ? `Web pubblico — ${tld}` : 'Web pubblico';
  }
  if (key.startsWith('web.gov.')) return 'Web governativo';
  if (key.startsWith('leaks.')) return key === 'leaks.logs' ? 'Bot Logs / Infostealer' : 'Data Leak';
  if (key.startsWith('darknet.')) return 'Dark Web';
  if (key.startsWith('dumpster')) return 'Dati misti (Dumpster)';
  if (key.startsWith('documents.')) return 'Documenti pubblici';
  // Titoli leggibili da snake/dot case
  return raw.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Legenda da mostrare in dashboard e report (categoria + significato per il cliente)
export const BUCKET_LEGEND: Array<{ category: BucketCategory; description: string }> = [
  { category: 'Data Leak', description: 'Credenziali e dati provenienti da database compromessi (pubblici e riservati).' },
  { category: 'Bot Logs / Infostealer', description: 'Dati esfiltrati da malware infostealer (es. Redline, Vidar, Lumma): cookie, credenziali browser.' },
  { category: 'Dark Web', description: 'Servizi nascosti Tor (.onion) e I2P (.i2p) — esposizione su rete anonima.' },
  { category: 'Paste', description: 'Documenti pubblicati su siti di paste (es. Pastebin): possibili dump di credenziali.' },
  { category: 'Web pubblico', description: 'Pagine web pubblicamente indicizzate che contengono riferimenti al dominio/asset.' },
  { category: 'Web governativo', description: 'Siti governativi pubblici che citano l\'asset.' },
  { category: 'WHOIS / Dominio', description: 'Dati di registrazione e configurazione del dominio.' },
  { category: 'Documenti', description: 'Documenti pubblici che menzionano l\'asset.' },
  { category: 'Dumpster / Misti', description: 'Dati eterogenei ad alto valore non classificati in altre categorie.' },
  { category: 'Usenet', description: 'Messaggi pubblici Usenet.' },
];
