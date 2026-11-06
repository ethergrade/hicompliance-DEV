import type { Nis2Profile } from './catalog';

export type SizeClass = 'micro' | 'piccola' | 'media' | 'grande';

export interface SizeData { ula: number; fatturato: number; bilancio: number }

/** Raccomandazione 2003/361/CE thresholds (euro). */
export function sizeClass(d: SizeData): SizeClass {
  const M = 1_000_000;
  if (d.ula >= 250 || (d.fatturato > 50 * M && d.bilancio > 43 * M)) return 'grande';
  if (d.ula >= 50 || (d.fatturato > 10 * M && d.bilancio > 10 * M)) return 'media';
  if (d.ula >= 10 || (d.fatturato > 2 * M && d.bilancio > 2 * M)) return 'piccola';
  return 'micro';
}

export function sizeReason(d: SizeData): string {
  const c = sizeClass(d);
  if (c === 'grande') return d.ula >= 250 ? 'ULA ≥ 250' : 'fatturato > 50 M€ e bilancio > 43 M€';
  if (c === 'media') return d.ula >= 50 ? 'ULA ≥ 50' : 'fatturato e bilancio > 10 M€';
  if (c === 'piccola') return d.ula >= 10 ? 'ULA ≥ 10' : 'fatturato e bilancio > 2 M€';
  return 'sotto tutte le soglie della piccola impresa';
}

export const C03_ALLEGATO_III = ['centrale', 'regione', 'citta_metropolitana', 'comune_100k', 'comune_capoluogo', 'asl', 'altro_allegato_iii'];

export interface WizardAnswers {
  C00?: 'essenziale' | 'importante' | 'no' | 'non_so';
  C01?: number;
  C02?: 'si' | 'servizi_in_IT' | 'no';
  C03?: string; // one of C03_ALLEGATO_III | 'altra_pa' | 'no'
  C04?: string[]; // telco, fiduciari_qualificati, fiduciari_non_qualificati, TLD, DNS, registrar, CER
  C05?: string[]; // 'I' | 'II' | 'IV'
  C06?: SizeData & { soloPropri?: SizeData; relazione?: 'autonoma' | 'associata' | 'collegata' };
  C07?: 'indipendenti' | 'condivisi' | 'na';
  C08?: boolean;
  C09?: string[]; // a | b | c | d
}

export interface ClassificationResult {
  stato: 'in_ambito' | 'fuori_ambito' | 'da_verificare';
  tipologia: 'essenziale' | 'importante' | null;
  fonte: 'autovalutazione' | 'PEC ACN';
  via_inclusione: string | null;
  regime: 'ordinario' | 'dora' | 'registry_registrar' | null;
  classe_dimensionale: SizeClass | null;
  motivi: string[];
  profilo_assessment: Nis2Profile;
}

const profileFor = (stato: ClassificationResult['stato'], tip: ClassificationResult['tipologia']): Nis2Profile =>
  stato === 'in_ambito' && tip === 'essenziale' ? 'ess' : stato === 'in_ambito' && tip === 'importante' ? 'imp' : 'base';

/** Implements §1.5 of the HiConsole NIS2 ACN spec (D.Lgs. 138/2024). Self-assessment only: ACN decides. */
export function classify(a: WizardAnswers): ClassificationResult {
  if (a.C00 === 'essenziale' || a.C00 === 'importante') {
    return { stato: 'in_ambito', tipologia: a.C00, fonte: 'PEC ACN', via_inclusione: 'designazione_ACN', regime: a.C08 ? 'dora' : 'ordinario', classe_dimensionale: null, motivi: ['Tipologia comunicata da ACN via PEC (prevale sull\'autovalutazione)'], profilo_assessment: a.C00 === 'essenziale' ? 'ess' : 'imp' };
  }
  const base = { fonte: 'autovalutazione' as const };
  if (a.C02 === 'no') {
    return { ...base, stato: 'fuori_ambito', tipologia: null, via_inclusione: null, regime: null, classe_dimensionale: null, motivi: ['Non stabilita in Italia: verificare l\'autorità competente di un altro Stato membro'], profilo_assessment: 'base' };
  }
  const c04 = (a.C04 ?? []).filter((x) => x !== 'nessuna');
  const c05 = a.C05 ?? [];
  const c09 = (a.C09 ?? []).filter((x) => x !== 'nessuna');
  const classe = a.C06 ? sizeClass(a.C06) : null;
  const motivi: string[] = [];
  let via: string | null = null;

  if (a.C03 && C03_ALLEGATO_III.includes(a.C03)) { via = 'PA'; motivi.push('PA dell\'Allegato III (art. 3 c.6-7)'); }
  else if (c04.length) { via = 'tipologia_c5'; motivi.push('Attività in ambito a prescindere dalla dimensione (art. 3 c.5)'); }

  if (!via && (c05.includes('I') || c05.includes('II')) && (classe === 'media' || classe === 'grande')) {
    via = 'dimensione';
    motivi.push(`Settore Allegato ${c05.filter((x) => x !== 'IV').join('/')} e impresa ${classe} (art. 3 c.2)`);
    if (a.C07 === 'indipendenti' && a.C06?.soloPropri && ['micro', 'piccola'].includes(sizeClass(a.C06.soloPropri))) {
      motivi.push('Clausola di salvaguardia richiedibile (DPCM 221/2024)');
    }
  }
  if (!via && c09.length) { via = 'collegata_c10'; motivi.push('Impresa collegata a soggetto NIS (art. 3 c.10)'); }
  if (!via && (c05.includes('IV') || a.C03 === 'altra_pa')) {
    return { ...base, stato: 'da_verificare', tipologia: null, via_inclusione: 'designazione_ACN', regime: null, classe_dimensionale: classe, motivi: ['Possibile designazione ACN (Allegato IV o altra PA): serve conferma ACN'], profilo_assessment: 'base' };
  }
  if (!via) {
    return { ...base, stato: 'fuori_ambito', tipologia: null, via_inclusione: null, regime: null, classe_dimensionale: classe, motivi: ['Nessun criterio di inclusione soddisfatto: profilo Base volontario'], profilo_assessment: 'base' };
  }
  const regime = a.C08 ? 'dora' : c04.some((x) => x === 'TLD' || x === 'registrar') ? 'registry_registrar' : 'ordinario';
  const essenziale =
    (c05.includes('I') && classe === 'grande') ||
    c04.includes('CER') ||
    (c04.includes('telco') && classe === 'media') ||
    c04.some((x) => ['fiduciari_qualificati', 'TLD', 'DNS'].includes(x)) ||
    a.C03 === 'centrale';
  const tipologia = essenziale ? 'essenziale' : 'importante';
  const daVerificare = motivi.some((m) => m.startsWith('Clausola')) || a.C02 === 'servizi_in_IT';
  if (a.C02 === 'servizi_in_IT') motivi.push('Servizi offerti in Italia senza stabilimento: verificare le regole di giurisdizione');
  const stato = daVerificare ? 'da_verificare' : 'in_ambito';
  return { ...base, stato, tipologia, via_inclusione: via, regime, classe_dimensionale: classe, motivi, profilo_assessment: profileFor(stato, tipologia) === 'base' ? (tipologia === 'essenziale' ? 'ess' : 'imp') : profileFor(stato, tipologia) };
}

export interface Deadline { label: string; date: string; kind: 'annuale' | 'inserimento' }

/** §2.1-2.2 deadlines. pecDate (YYYY-MM-DD) required for 2025 insertion. */
export function nis2Deadlines(year: number, insertionYear?: number, pecDate?: string): Deadline[] {
  const d: Deadline[] = [
    { label: 'Registrazione / aggiornamento dichiarazione NIS (1 gen - 28 feb)', date: `${year}-02-28`, kind: 'annuale' },
    { label: 'Esito ACN su inserimento/permanenza', date: `${year}-04-14`, kind: 'annuale' },
    { label: 'Aggiornamento informazioni art. 7 c.4-5 (15 apr - 31 mag)', date: `${year}-05-31`, kind: 'annuale' },
    { label: 'Categorizzazione attività e servizi (1 mag - 30 giu)', date: `${year}-06-30`, kind: 'annuale' },
  ];
  const addMonths = (iso: string, n: number) => { const x = new Date(iso + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
  if (insertionYear === 2025 && pecDate) {
    d.push({ label: 'Obbligo notifica incidenti significativi (PEC + 9 mesi)', date: addMonths(pecDate, 9), kind: 'inserimento' });
    d.push({ label: 'Misure di sicurezza di base (PEC + 18 mesi)', date: addMonths(pecDate, 18), kind: 'inserimento' });
  } else if (insertionYear === 2026) {
    d.push({ label: 'Obbligo notifica incidenti significativi', date: '2027-01-01', kind: 'inserimento' });
    d.push({ label: 'Misure di sicurezza di base', date: '2027-07-31', kind: 'inserimento' });
  }
  return d.sort((a, b) => a.date.localeCompare(b.date));
}
