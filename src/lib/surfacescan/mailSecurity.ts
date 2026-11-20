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
  spoofingRisk: 'alto' | 'medio' | 'basso';
}

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

    let spoofingRisk: MailSecRow['spoofingRisk'] = 'basso';
    if (spf === false && dmarc === false) spoofingRisk = 'alto';
    else if (spf !== true || dmarc !== true) spoofingRisk = 'medio';

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
      spoofingRisk,
    });
  }

  const riskOrder = { alto: 0, medio: 1, basso: 2 };
  return Array.from(domainMap.values()).sort((a, b) => riskOrder[a.spoofingRisk] - riskOrder[b.spoofingRisk]);
};
