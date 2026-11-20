import { publicSourceLabel } from '@/lib/surfaceSourceLabels';

/**
 * Sicurezza email per dominio, dalle osservazioni dei moduli mail. Funzione
 * pura: la usano il pannello della Console e il report PDF.
 */
export interface MailSecRow {
  domain: string;
  spf: boolean | null;
  dmarc: boolean | null;
  dkim: boolean | null;
  dkimCount: number;
  spfRecord: string | null;
  dmarcRecord: string | null;
  dmarcLocation: string | null;
  spfDnsLookups: number | null;
  mxCount: number;
  sourceLabel: string;
  /** Stati per controllo (decisioni del 20/11/2026). */
  spfStatus: SpfStatus;
  dmarcStatus: DmarcStatus;
  dkimStatus: DkimStatus;
  /** DMARC con indirizzo di report (rua). */
  dmarcReporting: boolean | null;
  spoofingRisk: 'alto' | 'medio' | 'basso' | 'non_determinato';
}

export type SpfStatus = 'ok' | 'missing' | 'invalid' | 'not_expected' | 'incomplete' | 'unknown';
export type DmarcStatus = 'enforced' | 'no_enforcement' | 'present' | 'missing' | 'invalid' | 'not_expected' | 'incomplete' | 'unknown';
export type DkimStatus = 'verified' | 'not_verified' | 'failed' | 'incomplete';

/** Etichette per pannello e PDF. `tone`: ok, warn (da migliorare), bad (anomalia), muted. */
export const MAIL_STATUS_LABEL: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  ok: { label: 'Valido', tone: 'ok' },
  enforced: { label: 'Con enforcement', tone: 'ok' },
  present: { label: 'Presente', tone: 'ok' },
  verified: { label: 'Verificato', tone: 'ok' },
  no_enforcement: { label: 'Policy senza enforcement', tone: 'warn' },
  missing: { label: 'Assente', tone: 'bad' },
  invalid: { label: 'Non valido', tone: 'bad' },
  failed: { label: 'Verifica fallita', tone: 'bad' },
  not_verified: { label: 'Non verificato', tone: 'muted' },
  not_expected: { label: 'Non atteso (nessun MX)', tone: 'muted' },
  incomplete: { label: 'Controllo incompleto', tone: 'muted' },
  unknown: { label: 'Non disponibile', tone: 'muted' },
};

const SPF_STATUSES: SpfStatus[] = ['ok', 'missing', 'invalid', 'not_expected', 'incomplete'];
const DMARC_STATUSES: DmarcStatus[] = ['enforced', 'no_enforcement', 'missing', 'invalid', 'not_expected', 'incomplete'];
const DKIM_STATUSES: DkimStatus[] = ['verified', 'not_verified', 'failed', 'incomplete'];

const dmarcPolicyOf = (record: string | null): string | null => {
  const m = record ? /(?:^|;)\s*p=([a-z]+)/i.exec(record) : null;
  return m ? m[1].toLowerCase() : null;
};

const stringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : []
);

const booleanOrNull = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'ok', 'valid', 'presente'].includes(normalized)) return true;
    if (['false', 'no', 'invalid', 'missing', 'assente'].includes(normalized)) return false;
  }
  return null;
};


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const buildMailSecurityRows = (obs: any[], allJobs: any[]): MailSecRow[] => {
  const jobDomainMap = new Map<string, string>(
    allJobs.map((j: any) => [String(j.id), String(j.normalized_target || '')])
  );

  // Dedupe by domain (take most recent per domain)
  const domainMap = new Map<string, MailSecRow>();

  for (const o of obs as any[]) {
    const val = (o.value || {}) as Record<string, any>;
    const domain =
      String(val.domain || val.domain_scanned || '').trim() ||
      jobDomainMap.get(String(o.scan_job_id || '')) ||
      String(o.title || '').replace(/^Configurazione email per\s+/i, '').split(':')[0].trim();
    if (!domain) continue;
    if (domainMap.has(domain)) continue;

    const spfRecords = stringArray(val.spf_records);
    const dmarcRecords = stringArray(val.dmarc_records);
    const dkimSelectors = stringArray(val.dkim_selectors_found);
    const mxRecords = stringArray(val.mx_records);
    const spf = booleanOrNull(val.spf_valid) ?? booleanOrNull(val.has_spf) ?? (spfRecords.length > 0 ? true : null);
    const dmarc = booleanOrNull(val.dmarc_valid) ?? booleanOrNull(val.has_dmarc) ?? (dmarcRecords.length > 0 ? true : null);
    const dkimChecked = val.dkim_checked !== false;
    const dkim = dkimChecked
      ? (booleanOrNull(val.has_dkim) ?? (dkimSelectors.length > 0 ? true : false))
      : null;
    const dkimCount = dkimSelectors.length;
    const spfDnsLookups = Number(val.spf_dns_lookups);

    // Stati dal backend quando ci sono; per le osservazioni precedenti (o di
    // altre fonti) si ricavano dai valori disponibili. DKIM non osservato non è
    // mai un'anomalia: «Non verificato».
    const spfStatus: SpfStatus = SPF_STATUSES.includes(val.spf_status)
      ? val.spf_status
      : spf === true ? 'ok' : spf === false ? 'missing' : 'unknown';
    const policy = typeof val.dmarc_policy === 'string' ? val.dmarc_policy : dmarcPolicyOf(dmarcRecords[0] ?? null);
    const dmarcStatus: DmarcStatus = DMARC_STATUSES.includes(val.dmarc_status)
      ? val.dmarc_status
      : dmarc === false ? 'missing'
      : policy === 'none' ? 'no_enforcement'
      : policy === 'quarantine' || policy === 'reject' ? 'enforced'
      : dmarc === true ? 'present' : 'unknown';
    const dkimStatus: DkimStatus = DKIM_STATUSES.includes(val.dkim_status)
      ? val.dkim_status
      : dkimSelectors.length > 0 || dkim === true ? 'verified' : 'not_verified';
    const dmarcReporting = typeof val.dmarc_reporting === 'boolean'
      ? val.dmarc_reporting
      : dmarcRecords[0] ? /(?:^|;)\s*rua=/i.test(dmarcRecords[0]) : null;

    const anomalia = (s: string) => s === 'missing' || s === 'invalid' || s === 'failed';
    const indeterminato = (s: string) => s === 'incomplete' || s === 'unknown';
    let spoofingRisk: MailSecRow['spoofingRisk'] = 'basso';
    if (anomalia(spfStatus) && anomalia(dmarcStatus)) spoofingRisk = 'alto';
    else if (anomalia(spfStatus) || anomalia(dmarcStatus) || dmarcStatus === 'no_enforcement' || anomalia(dkimStatus)) spoofingRisk = 'medio';
    else if (indeterminato(spfStatus) || indeterminato(dmarcStatus)) spoofingRisk = 'non_determinato';

    domainMap.set(domain, {
      domain,
      spf,
      dmarc,
      dkim,
      dkimCount,
      spfRecord: spfRecords[0] || null,
      dmarcRecord: dmarcRecords[0] || null,
      dmarcLocation: String(val.dmarc_location || '').trim() || null,
      spfDnsLookups: Number.isFinite(spfDnsLookups) ? spfDnsLookups : null,
      mxCount: mxRecords.length,
      sourceLabel: publicSourceLabel(val.source || o.module, 'Motore exposure'),
      spfStatus,
      dmarcStatus,
      dkimStatus,
      dmarcReporting,
      spoofingRisk,
    });
  }

  const riskOrder = { alto: 0, medio: 1, non_determinato: 2, basso: 3 };
  return Array.from(domainMap.values()).sort((a, b) => riskOrder[a.spoofingRisk] - riskOrder[b.spoofingRisk]);
};
