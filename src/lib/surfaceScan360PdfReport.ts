import jsPDF from 'jspdf';
import { COVER_BG_JPEG_B64, HISOLUTION_LOGO_PNG_B64 } from './reportCoverAssets';
import { REPORT_GLOSSARY } from './reportGlossary';

interface RemediationTask {
  id: string;
  task: string;
  category: string;
  start_date: string;
  end_date: string;
  progress: number;
  priority: string;
  assignee?: string | null;
  source?: string | null;
  source_ref?: string | null;
}

export interface SurfaceScan360Report {
  generated_at: string;
  organization: any;
  scan: any;
  assets_in_scope: any[];
  findings: any[];
  findings_by_severity: Record<string, number>;
  scope_guard_summary?: {
    in_scope?: number;
    excluded_by_scope?: number;
    excluded_shared_noise?: number;
    excluded_reasons?: Record<string, number>;
  };
  cve_catalog?: Array<{
    cve_id: string;
    description?: string | null;
    cvss?: number | null;
    cvss_severity?: string | null;
    epss?: number | null;
    epss_percentile?: number | null;
    cisa_kev?: boolean;
    kev_due_date?: string | null;
    kev_required_action?: string | null;
    cwe?: string[];
    references?: string[];
    affected_assets?: string[];
    published_at?: string | null;
    last_modified_at?: string | null;
    refreshed_at?: string | null;
  }>;
  intel: any[];
  observations?: any[];
  asset_module_details?: Array<{
    asset: string;
    asset_type: 'domain' | 'subdomain';
    http?: { score: number; grade: string | null; statusCode: number | null; checks: Record<string, boolean> };
    http_findings?: Array<{ header: string; status: string; note: string }>;
    dns?: Record<string, any>;
    dns_findings?: Array<{ title: string; severity: string; status: string }>;
    ssl?: { trusted?: boolean; statusCode?: number; grade?: string | null; tls12?: boolean; tls13?: boolean; weak_protocols?: string[]; weak_ciphers?: string[]; subject?: string; issuer?: string };
    whois?: { registrar?: string | null; days_to_expiry?: number | null; expires?: string | null; dnssec?: string | null; source?: string | null };
    threats?: { safe_browsing_unsafe: boolean; urlhaus_listed: boolean; phishtank_verified: boolean; ioc_matched: boolean; ioc_count: number; ioc_lease: number; ioc_refreshed: string | null };
    blocklist?: { listed_count: number };
    technologies?: Array<{ name: string; version: string | null; category: string | null }>;
  }>;
  monitored_scope?: any[];
  subdomain_dumps?: any[];
  remediation_tasks?: RemediationTask[];
  kev_generation?: { created: number; total_kev: number; existing: number };
  ai: {
    executive_summary?: string;
    risk_score?: number;
    risk_level?: string;
    top_recommendations?: Array<{
      priority: number;
      title: string;
      rationale: string;
      action: string;
      affected_assets?: string[];
      severity?: string;
    }>;
    correlations?: string[];
    compliance_notes?: string;
  } | null;
  ai_error?: string | null;
}

const BRAND = { r: 59, g: 130, b: 246 };
const DARK = { r: 17, g: 24, b: 39 };
const MUTED = { r: 110, g: 118, b: 130 };
const LIGHT_BG = { r: 243, g: 246, b: 251 };
const BORDER = { r: 215, g: 222, b: 232 };
const SURFACESCAN_BRAND_TITLE_HICOMPLIANCE = 'HICOMPLIANCE · SURFACESCAN360';
const SURFACESCAN_BRAND_TITLE_HICONSOLE = 'HiConsole - SURFACESCAN360';
const IPV4_STRICT_RX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV4_LOOSE_RX =
  /(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}/;
const IPV6_LOOSE_RX = /(?:[a-f0-9]{1,4}:){2,}[a-f0-9:]{1,}/i;
const DOMAIN_RX =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const sevColor = (s?: string): [number, number, number] => {
  switch ((s || '').toLowerCase()) {
    case 'critical': return [220, 38, 38];
    case 'high': return [234, 88, 12];
    case 'medium': return [202, 138, 4];
    case 'low': return [37, 99, 235];
    case 'info': return [100, 116, 139];
    default: return [120, 120, 120];
  }
};

// Etichette neutre (no vendor names)
const PROVIDER_LABELS: Record<string, string> = {
  shodan: 'Esposizione rete pubblica',
  urlscan: 'Comportamento applicativo esterno',
  hosting_context: 'Geolocalizzazione e Hosting',
  ct_log: 'Evidenze certificate pubbliche',
  dnssec: 'Stato DNSSEC',
  tech_stack: 'Tecnologie rilevate',
  website_recon: 'Tecnologie rilevate',
  mail_security: 'Postura sicurezza email (SPF/DKIM/DMARC)',
  security_headers: 'Controlli HTTP di sicurezza',
  port_scanner: 'Porte e servizi esposti',
  ssl_scan: 'Analisi TLS/SSL',
};
const providerLabel = (p: string) => PROVIDER_LABELS[p] || 'Evidenze esterne';

const hasHiComplianceBrand = (report: SurfaceScan360Report): boolean => {
  const org = report?.organization || {};
  if (typeof org.hicompliance_enabled === 'boolean') return org.hicompliance_enabled;
  if (typeof org.has_hicompliance === 'boolean') return org.has_hicompliance;
  return false;
};

const getSurfaceScanBrandTitle = (report: SurfaceScan360Report): string =>
{
  const raw = String((report?.organization as any)?.report_brand_title || '').trim();
  if (raw === SURFACESCAN_BRAND_TITLE_HICOMPLIANCE || raw === SURFACESCAN_BRAND_TITLE_HICONSOLE) return raw;
  return hasHiComplianceBrand(report) ? SURFACESCAN_BRAND_TITLE_HICOMPLIANCE : SURFACESCAN_BRAND_TITLE_HICONSOLE;
};

const drawHiSolutionLogo = (doc: jsPDF, x: number, y: number): void => {
  // Lightweight vector mark to keep PDF size low and avoid external image loading.
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.roundedRect(x, y, 18, 18, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Hi', x + 5, y + 12.5);
};

const redactReportWords = (value: string) => {
  const providerTokens = [
    /\bshodan\b/gi,
    /\bpentest-?tools?\b/gi,
    /\bweb[\s-]?check\b/gi,
    /\burlscan\b/gi,
  ];
  const technologyTokens = [
    /\bapache\b/gi,
    /\bnginx\b/gi,
    /\bwordpress\b/gi,
    /\bphp\b/gi,
    /\bopenssl\b/gi,
    /\biis\b/gi,
    /\btomcat\b/gi,
    /\bdrupal\b/gi,
    /\bjoomla\b/gi,
  ];
  let out = String(value || '');
  for (const token of providerTokens) out = out.replace(token, 'SurfaceScan360');
  for (const token of technologyTokens) out = out.replace(token, 'componente tecnologica');
  return out.replace(/\s{2,}/g, ' ').trim();
};

const normalizeHost = (value: string): string => String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const isIpv4Address = (value: string): boolean => IPV4_STRICT_RX.test(String(value || '').trim());
const extractIpAddress = (value: string): string => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (isIpv4Address(raw) || raw.includes(':')) return raw;
  const v4 = raw.match(IPV4_LOOSE_RX);
  if (v4?.[0]) return v4[0].toLowerCase();
  const v6 = raw.match(IPV6_LOOSE_RX);
  if (v6?.[0]) return v6[0].toLowerCase();
  return '';
};
const sanitizeAssetLabel = (value: unknown): string => {
  const raw = redactReportWords(String(value || ''))
    .replace(/\bscope completo in monitoraggio\s*\(\d+\s*target\)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!raw) return '';
  const ip = extractIpAddress(raw);
  if (ip) return ip;
  try {
    const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`https://${raw}`);
    const host = normalizeHost(url.hostname || '');
    if (host && (DOMAIN_RX.test(host) || extractIpAddress(host))) return host;
  } catch {
    // fallback on tokens below
  }
  const token = raw
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .split(/[\s|,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .find((entry) => Boolean(entry && (DOMAIN_RX.test(entry) || extractIpAddress(entry))));
  return token || '';
};
const isScopeAggregateTarget = (value: unknown): boolean =>
  /scope completo in monitoraggio/i.test(String(value || ''));
const isValidReportAsset = (value: unknown): boolean => {
  const normalized = sanitizeAssetLabel(value);
  return Boolean(normalized && (extractIpAddress(normalized) || DOMAIN_RX.test(normalized)));
};
const resolveReportTarget = (...candidates: unknown[]): string => {
  for (const candidate of candidates) {
    if (isScopeAggregateTarget(candidate)) continue;
    const normalized = sanitizeAssetLabel(candidate);
    if (isValidReportAsset(normalized)) return normalized;
  }
  return 'n/d';
};
const pickReportAsset = (...candidates: unknown[]): string => {
  for (const candidate of candidates) {
    const normalized = sanitizeAssetLabel(candidate);
    if (isValidReportAsset(normalized)) return normalized;
  }
  return 'n/d';
};
const depthFromRoot = (host: string, rootDomain: string): number => {
  const h = normalizeHost(host);
  const root = normalizeHost(rootDomain);
  if (!h || !root || h === root || !h.endsWith(`.${root}`)) return 0;
  return h.slice(0, -(root.length + 1)).split('.').filter(Boolean).length;
};

const isJunkSummary = (s: any): boolean => {
  if (!s) return true;
  if (typeof s === 'string') {
    const text = redactReportWords(s).trim().toLowerCase();
    if (!text) return true;
    return text.includes('nessun campo tecnico valorizzato nel payload corrente')
      || text.includes('nessuna evidenza tecnica disponibile')
      || text.includes('dati tecnici disponibili:')
      || text === 'n/d'
      || text === 'nessun dato';
  }
  if (typeof s === 'object') {
    const keys = Object.keys(s);
    if (keys.length === 1 && (keys[0] === 'reason' || keys[0] === 'error')) return true;
    if (keys.length === 0) return true;
  }
  return false;
};

const isGenericEvidenceText = (value: string): boolean => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return text.includes('evidenza tecnica disponibile')
    || text.includes('evidenza tecnica acquisita')
    || text.includes('nessuna evidenza disponibile')
    || text.includes('status, scan_id, tool_id')
    || text.includes('nessun campo tecnico valorizzato nel payload corrente')
    || text.includes('dati tecnici disponibili:');
};

const summarizeIntel = (provider: string, target: string, summary: any): string => {
  if (summary == null) return 'Nessun dato';
  if (typeof summary === 'string') return redactReportWords(summary);
  if (typeof summary !== 'object') return redactReportWords(String(summary));

  const read = (key: string) => String(summary?.[key] ?? '').trim();
  const boolText = (value: any) => (value ? 'sì' : 'no');

  if (provider === 'urlscan' && Array.isArray(summary.recent)) {
    if (summary.recent.length === 0) return `Nessuna scansione pubblica nota per ${target}`;
    const r = summary.recent[0];
    const d = r.date ? new Date(r.date).toLocaleDateString('it-IT') : 'n/d';
    return `${summary.total} evidenz${summary.total === 1 ? 'a' : 'e'} pubblic${summary.total === 1 ? 'a' : 'he'} - ultimo aggiornamento ${d} - IP: ${r.ip || 'n/d'}`;
  }
  if (provider === 'hosting_context') {
    const out: string[] = [];
    if (summary.resolved_ips?.length) out.push(`IP: ${summary.resolved_ips.join(', ')}`);
    if (summary.country) out.push(`Paese: ${summary.country}`);
    if (summary.city) out.push(`Città: ${summary.city}`);
    if (summary.asn) out.push(`ASN: ${summary.asn}`);
    if (summary.org) out.push(`Provider: ${summary.org}`);
    if (summary.isp) out.push(`ISP: ${summary.isp}`);
    if (summary.co_hosted_count != null) out.push(`co-hosted: ${summary.co_hosted_count}`);
    if (summary.cdn_score != null) out.push(`CDN score: ${summary.cdn_score}`);
    if (summary.type) out.push(`hosting type: ${summary.type}`);
    return out.join(' · ') || 'n/d';
  }
  if (provider === 'website_recon' || provider === 'tech_stack') {
    // Osservazione tecnologie: ob.value.technologies array oppure summary con fields diretti
    const techs: string[] = [];
    const techArr = Array.isArray(summary.technologies) ? summary.technologies : [];
    for (const t of techArr.slice(0, 8)) {
      const name = String(t.technology_name || t.name || '').trim();
      const version = String(t.technology_version || t.version || '').trim();
      const cat = String(t.category || '').trim();
      if (!name) continue;
      techs.push(version ? `${name} ${version}` : name);
    }
    if (techs.length > 0) {
      const cat = techArr[0]?.category ? ` [${String(techArr[0].category).trim()}]` : '';
      return `Tecnologie rilevate${cat}: ${techs.join(', ')}`;
    }
    // Summary diretto (tech_stack module)
    if (summary.technology_name) {
      const v = summary.technology_version ? ` ${summary.technology_version}` : '';
      return `${summary.technology_name}${v}${summary.category ? ` (${summary.category})` : ''}`;
    }
    return 'Nessuna tecnologia rilevata';
  }
  if (provider === 'port_scanner') {
    const openPorts: number[] = Array.isArray(summary.open_ports) ? summary.open_ports : [];
    const dataArr: any[] = Array.isArray(summary.data) ? summary.data : [];
    const services = dataArr.map((d: any) => {
      const svc = String(d.service_name || d.service_product || d.service || '').trim();
      return svc ? `${d.port}/${d.protocol || 'tcp'} (${svc})` : `${d.port}/${d.protocol || 'tcp'}`;
    }).filter(Boolean).slice(0, 6);
    if (services.length) return `Porte esposte: ${services.join(', ')}`;
    if (openPorts.length) return `Porte aperte: ${openPorts.join(', ')}`;
    return 'Nessun servizio esposto rilevato';
  }
  if (provider === 'ssl_scan') {
    const grade = summary.grade ? `Grado TLS: ${summary.grade}` : '';
    const weakProtos = Array.isArray(summary.weak_protocols) && summary.weak_protocols.length
      ? `Protocolli deboli: ${summary.weak_protocols.join(', ')}` : '';
    const cert = summary.certificate_subject ? `Cert: ${String(summary.certificate_subject).slice(0, 60)}` : '';
    return [grade, weakProtos, cert].filter(Boolean).join(' · ') || 'TLS rilevato';
  }
  if (provider === 'shodan') {
    if (summary.reason === 'not_found') return `Nessuna esposizione pubblica significativa rilevata per ${target}`;
    const ports = summary.ports || summary.open_ports;
    const banners = summary.banners || [];
    const parts: string[] = [];
    if (ports?.length) parts.push(`porte aperte: ${ports.join(', ')}`);
    if (banners.length) parts.push(`banner tecnici: ${banners.length}`);
    if (summary.country) parts.push(`Paese: ${summary.country}`);
    if (summary.city) parts.push(`Città: ${summary.city}`);
    if (summary.org) parts.push(`operatore rete: ${summary.org}`);
    if (summary.asn) parts.push(`ASN: ${summary.asn}`);
    return redactReportWords(parts.join(' · ') || 'Nessuna esposizione pubblica confermata.');
  }

  const parts: string[] = [];
  const status = read('status') || read('state');
  if (status) parts.push(`Stato: ${status}`);
  const scanId = read('scan_id');
  if (scanId) parts.push(`Scan ID: ${scanId}`);
  const toolId = read('tool_id');
  if (toolId) parts.push(`Controllo ID: ${toolId}`);
  const outputType = read('output_type');
  if (outputType) parts.push(`Output: ${outputType}`);
  if (summary?.progress != null && String(summary.progress).trim() !== '') {
    const progress = Number(summary.progress);
    parts.push(Number.isFinite(progress) ? `Progresso: ${Math.round(progress)}%` : `Progresso: ${String(summary.progress)}`);
  }
  if (summary?.output_collected != null) parts.push(`Output raccolto: ${boolText(summary.output_collected)}`);
  const label = read('label');
  if (label) parts.push(`Etichetta: ${label}`);
  const ip = read('ip') || read('ip_address') || read('host_ip');
  if (ip) parts.push(`IP: ${ip}`);
  const host = read('host') || read('hostname') || read('domain');
  if (host) parts.push(`Host: ${host}`);
  const asn = read('asn');
  if (asn) parts.push(`ASN: ${asn}`);
  const org = read('org');
  if (org) parts.push(`Rete: ${org}`);

  if (summary?.has_mx != null) parts.push(`MX presenti: ${boolText(summary.has_mx)}`);
  if (summary?.has_spf != null) parts.push(`SPF presente: ${boolText(summary.has_spf)}`);
  if (summary?.has_dmarc != null) parts.push(`DMARC presente: ${boolText(summary.has_dmarc)}`);
  if (summary?.has_bimi != null) parts.push(`BIMI presente: ${boolText(summary.has_bimi)}`);
  const spfRecords = Array.isArray(summary?.spf_records) ? summary.spf_records.filter(Boolean) : [];
  if (spfRecords.length) parts.push(`SPF: ${spfRecords.slice(0, 2).join(' ; ')}`);
  const dmarcRecords = Array.isArray(summary?.dmarc_records) ? summary.dmarc_records.filter(Boolean) : [];
  if (dmarcRecords.length) parts.push(`DMARC: ${dmarcRecords.slice(0, 2).join(' ; ')}`);
  const dkimSelectors = Array.isArray(summary?.dkim_selectors_found) ? summary.dkim_selectors_found.filter(Boolean) : [];
  if (dkimSelectors.length) parts.push(`Selector DKIM: ${dkimSelectors.slice(0, 6).join(', ')}`);

  const ports = [...(Array.isArray(summary?.ports) ? summary.ports : []), ...(Array.isArray(summary?.open_ports) ? summary.open_ports : [])]
    .map((port) => Number(port))
    .filter((port) => Number.isFinite(port));
  if (ports.length > 0) {
    parts.push(`Porte esposte: ${Array.from(new Set(ports)).slice(0, 20).join(', ')}`);
  }

  if (Array.isArray(summary?.data) && summary.data.length > 0) {
    const serviceRows = summary.data
      .map((entry: any) => {
        const port = String(entry?.port ?? '').trim();
        const proto = String(entry?.transport ?? entry?.protocol ?? '').trim().toLowerCase();
        const service = String(entry?.service ?? entry?.product ?? '').trim();
        const version = String(entry?.version ?? '').trim();
        const left = [port, proto].filter(Boolean).join('/');
        const right = [service, version].filter(Boolean).join(' ');
        return [left, right].filter(Boolean).join(' ');
      })
      .filter(Boolean);
    if (serviceRows.length > 0) parts.push(`Servizi osservati: ${serviceRows.slice(0, 6).join(' | ')}`);
  }

  const keys = summary ? Object.keys(summary) : [];
  if (Array.isArray((summary as any)?.detected)) {
    return `Pattern applicativi rilevati: ${(summary as any).detected.length}`;
  }
  if (parts.length > 0) {
    return redactReportWords(parts.join(' · '));
  }
  if (keys.length > 0) {
    const scalarPairs = keys
      .slice(0, 12)
      .map((key) => {
        const raw = (summary as any)?.[key];
        if (raw == null) return null;
        if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
          const value = String(raw).trim();
          if (!value) return null;
          return `${key}: ${value}`;
        }
        return null;
      })
      .filter(Boolean) as string[];
    if (scalarPairs.length > 0) {
      return redactReportWords(`Dati tecnici: ${scalarPairs.slice(0, 5).join(' · ')}`);
    }
    return '';
  }
  return '';
};

const computeFallbackRisk = (report: SurfaceScan360Report): { score: number; level: string } => {
  const sev = report.findings_by_severity || {};
  const penalty =
    Number(sev.critical || 0) * 22 +
    Number(sev.high || 0) * 12 +
    Number(sev.medium || 0) * 6 +
    Number(sev.low || 0) * 2 +
    Number(sev.info || 0);
  const score = Math.max(5, Math.min(100, 100 - penalty));
  if (score <= 30) return { score, level: 'Critico' };
  if (score <= 50) return { score, level: 'Alto' };
  if (score <= 75) return { score, level: 'Medio' };
  return { score, level: 'Basso' };
};

const buildFallbackAi = (report: SurfaceScan360Report) => {
  const risk = computeFallbackRisk(report);
  const totalFindings = (report.findings || []).length;
  const totalScope = (report.monitored_scope || []).length;
  const totalSub = (report.subdomain_dumps || []).reduce((sum, dump: any) => {
    return sum + Number(dump?.total_returned || (Array.isArray(dump?.results) ? dump.results.length : 0) || 0);
  }, 0);

  // Detect dominant finding category to tailor priorities
  const allF = report.findings || [];
  const credentialFindings = allF.filter((f: any) =>
    /intelx|darkrisk|credential|leak|identity|password|stealer/i.test(String(f.finding_type || f.title || ''))
  );
  const cveFindings = allF.filter((f: any) => Array.isArray((f as any).cve) && (f as any).cve.length > 0);
  const highSev = allF.filter((f: any) => f.severity === 'high' || f.severity === 'critical');
  const isCredentialDominant = credentialFindings.length > totalFindings * 0.4;
  const hasCriticalCve = cveFindings.some((f: any) => f.severity === 'critical' || f.severity === 'high');

  const credentialRecs = [
    { priority: 1, title: 'Reset immediato password esposte nei leak', rationale: `${credentialFindings.filter((f: any) => /password|credential|stealer/i.test(String(f.finding_type || ''))).length} credenziali esposte rilevate: il riutilizzo su altri servizi è il vettore di attacco più probabile.`, action: 'Forzare il cambio password per tutti gli account presenti nei leak, disabilitare le sessioni attive e revocare i token OAuth/SAML compromessi.', severity: 'critical', affected_assets: [] },
    { priority: 2, title: 'Abilitare MFA obbligatoria su tutti gli accessi esterni', rationale: 'Credenziali esposte senza MFA consentono accesso immediato ad attaccanti in possesso della password.', action: 'Abilitare MFA (TOTP o push) su Microsoft 365, VPN, portali web e tutti gli accessi Internet-facing. Bloccare gli accessi legacy che non supportano MFA.', severity: 'critical', affected_assets: [] },
    { priority: 3, title: 'Bloccare riutilizzo password con policy e blocklist', rationale: 'Le password esposte potrebbero essere riutilizzate su altri servizi aziendali.', action: 'Implementare una password blocklist (HIBP o analoga) e una policy di complessità minima ≥12 char. Vietare il riutilizzo degli ultimi 10 password.', severity: 'high', affected_assets: [] },
    { priority: 4, title: 'Revoca credenziali API e token di servizio', rationale: 'I leak possono includere token API, service account e credenziali di sistema oltre alle password utente.', action: 'Inventariare e ruotare tutti i secret, API key, token di integrazione e credenziali di servizio del dominio esposto.', severity: 'high', affected_assets: [] },
    { priority: 5, title: 'Rollout DMARC enforcement (p=reject)', rationale: 'Domini senza DMARC in enforcement sono vettori di spoofing e phishing verso clienti e partner.', action: 'Configurare DMARC p=quarantine → p=reject con reporting RUA/RUF. Validare SPF (<10 lookup) e abilitare DKIM con selector aggiornato.', severity: 'high', affected_assets: [] },
    { priority: 6, title: 'Monitoraggio continuo leak identity e alerting', rationale: 'Nuovi leak compaiono quotidianamente; il monitoraggio reattivo riduce il tempo di esposizione.', action: 'Attivare alerting automatico su nuove esposizioni dei domini e delle email aziendali. Integrare nel ciclo DarkRisk360 settimanale.', severity: 'medium', affected_assets: [] },
    { priority: 7, title: 'Hardening TLS e header di sicurezza HTTP', rationale: 'Controlli TLS deboli e header mancanti amplificano il rischio di MITM e session hijacking.', action: 'Abilitare HSTS (includeSubDomains), CSP, X-Frame-Options, aggiornare cipher suite TLS (TLS 1.3, disabilitare TLS 1.0/1.1).', severity: 'medium', affected_assets: [] },
    { priority: 8, title: 'Separazione domini su IP/hosting distinti', rationale: 'Blast radius elevato: un attacco su un dominio può compromettere tutti i domini condivisi sulla stessa infrastruttura.', action: 'Separare i domini collaterali su IP e provider distinti. Applicare network segmentation tra ambienti produzione e staging.', severity: 'medium', affected_assets: [] },
    { priority: 9, title: 'EDR aggiornato e protezione anti-infostealer', rationale: 'Stealer log rilevati indicano compromissioni endpoint che esfiltrano cookie e credenziali browser.', action: 'Verificare copertura EDR su tutti gli endpoint. Vietare il salvataggio di credenziali nei browser aziendali. Aggiornare definizioni anti-malware.', severity: 'medium', affected_assets: [] },
    { priority: 10, title: 'Validazione post-remediation con nuova scansione', rationale: 'La remediation non verificata lascia il rischio residuo potenzialmente invariato.', action: 'Eseguire una nuova scansione DarkRisk360 a 30 giorni per confermare la riduzione delle esposizioni e aggiornare il risk score.', severity: 'low', affected_assets: [] },
  ];

  const genericRecs = [
    { priority: 1, title: hasCriticalCve ? 'Patching urgente CVE critiche' : 'Riduzione esposizione prioritaria', rationale: hasCriticalCve ? `${cveFindings.length} CVE rilevate, alcune critiche: finestra di sfruttamento attiva.` : `${highSev.length} finding ad alta severità richiedono intervento tempestivo.`, action: hasCriticalCve ? 'Applicare patch per le CVE critiche/alte entro 7 giorni. Isolare i sistemi non patchabili in attesa di mitigazioni.' : 'Chiudere i punti di esposizione più critici con remediation tracciata e verificata.', severity: hasCriticalCve ? 'critical' : 'high', affected_assets: [] },
    { priority: 2, title: 'Gestione vulnerabilità per impatto e sfruttabilità', rationale: 'Le CVE presenti richiedono ordine di esecuzione basato su CVSS + EPSS + contesto operativo.', action: 'Applicare patch/mitigazioni prioritizzando per CVSS ≥7 e EPSS > 1%. Validare con nuova scansione dopo ogni batch.', severity: 'high', affected_assets: [] },
    { priority: 3, title: 'Hardening configurativo sui servizi esposti', rationale: 'Controlli web e rete non uniformi aumentano il rischio operativo e il blast radius.', action: 'Allineare la baseline di sicurezza su tutti gli asset pubblici: TLS 1.3, header HTTP, cipher suite aggiornate.', severity: 'medium', affected_assets: [] },
    { priority: 4, title: 'Controllo perimetro e discovery sottodomini', rationale: 'La variazione del perimetro modifica il rischio esposto. Sottodomini dimenticati sono vettori di attacco frequenti.', action: 'Eseguire subdomain enumeration periodica, verificare i DNS shadow e disabilitare i sottodomini non più in uso.', severity: 'medium', affected_assets: [] },
    { priority: 5, title: 'Email security: SPF/DKIM/DMARC su tutti i domini', rationale: 'Domini senza enforcement DMARC sono esposti a spoofing e phishing verso clienti e partner.', action: 'Configurare DMARC p=quarantine su tutti i domini principali e collaterali. Abilitare DKIM e validare SPF.', severity: 'high', affected_assets: [] },
    { priority: 6, title: 'Chiusura porte non necessarie e firewall review', rationale: `${highSev.length} finding ad alto rischio: alcuni potrebbero includere servizi di gestione esposti.`, action: 'Revisione firewall: bloccare porte 21/23/8080/3389 da Internet pubblico. Consentire accesso amministrativo solo da IP autorizzati o VPN.', severity: 'high', affected_assets: [] },
    { priority: 7, title: 'Rafforzamento controlli di accesso e IAM', rationale: 'Asset pubblici con controlli deboli favoriscono accessi non autorizzati e lateral movement.', action: 'Applicare MFA su tutti gli accessi Internet-facing. Implementare Conditional Access Policy e revisione periodica dei privilegi.', severity: 'medium', affected_assets: [] },
    { priority: 8, title: 'Monitoraggio continuo e alerting automatico', rationale: 'La sicurezza esterna richiede controllo ricorrente: le minacce evolvono tra una scansione e l\'altra.', action: 'Implementare alerting su variazioni DNS, nuovi servizi esposti e nuove evidenze di compromissione. Integrare con SIEM.', severity: 'medium', affected_assets: [] },
    { priority: 9, title: 'Ciclo patch strutturato con SLA per severità', rationale: 'Il ritardo nel patching incrementa la finestra di esposizione ai threat actor e aumenta la probabilità di sfruttamento.', action: 'Definire SLA: critiche ≤72h, alte ≤7gg, medie ≤30gg, basse ≤90gg. Monitorare compliance e documentare le eccezioni.', severity: 'low', affected_assets: [] },
    { priority: 10, title: 'Validazione post-remediation con nuova scansione', rationale: 'La remediation non verificata lascia il rischio residuo potenzialmente invariato.', action: 'Eseguire scansioni di conferma dopo ogni remediation e mantenere storico delle evidenze risolte.', severity: 'low', affected_assets: [] },
  ];

  return {
    executive_summary:
      isCredentialDominant
        ? `Analisi DarkRisk360: ${credentialFindings.length} evidenze di esposizione credenziali/identità rilevate su ${totalScope} asset monitorati. ` +
          `Rischio complessivo ${risk.level}: priorità immediata su reset password, abilitazione MFA e monitoraggio identity continuo.`
        : `Analisi consulenziale aggiornata su asset esterni: ${totalFindings} evidenze rilevate, ` +
          `scope monitorato con ${totalScope} regole e ${totalSub} sottodomini osservati. ` +
          `Priorità su riduzione esposizione e chiusura vulnerabilità aperte.`,
    risk_score: risk.score,
    risk_level: risk.level,
    top_recommendations: isCredentialDominant ? credentialRecs : genericRecs,
    correlations: isCredentialDominant
      ? [
          'Le credenziali esposte senza MFA rappresentano il vettore di attacco a più alta probabilità di sfruttamento.',
          `${credentialFindings.length} evidenze di leak su ${totalScope} domini: il rischio di riutilizzo password è elevato.`,
          'La presenza di stealer log indica compromissione endpoint: intervenire su EDR prima di forzare il solo reset password.',
        ]
      : [
          'La severità aggregata riflette la priorità operativa di remediation.',
          'Scope e sottodomini rilevati influenzano direttamente il volume dei finding.',
          'La riduzione dell\'esposizione esterna migliora il profilo di rischio complessivo.',
        ],
    compliance_notes:
      isCredentialDominant
        ? 'Le azioni suggerite sono allineate ai controlli NIST CSF (ID.RA, PR.AC, DE.CM), ISO 27001 A.9 e ai requisiti GDPR in caso di breach di credenziali personali.'
        : 'Le azioni suggerite supportano un percorso coerente con i requisiti di gestione del rischio e miglioramento continuo previsti dai principali framework di sicurezza.',
  };
};

export function generateSurfaceScan360Pdf(report: SurfaceScan360Report): void {
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
    precision: 2,
  });
  const aiData = report.ai || buildFallbackAi(report);
  const margin = 40;
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  let y = margin;
  let pageNum = 1;
  const sectionIndex: Array<{ number: number; title: string; page: number }> = [];

  // skipNextFooter: evita di stampare il footer sulla cover (pagina 1)
  let skipNextFooter = false;
  const drawFooter = () => {
    if (skipNextFooter) { skipNextFooter = false; return; }
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.setFont('helvetica', 'normal');
    doc.text(`HiCompliance · SurfaceScan360`, margin, h - 18);
    doc.text(`Pagina ${pageNum}`, w - margin, h - 18, { align: 'right' });
  };
  const newPage = () => { drawFooter(); doc.addPage(); pageNum += 1; y = margin; };
  const ensure = (need: number) => { if (y + need > h - margin - 24) newPage(); };

  const text = (
    txt: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {}
  ) => {
    const size = opts.size ?? 10;
    doc.setFontSize(size);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    const c = opts.color ?? [DARK.r, DARK.g, DARK.b];
    doc.setTextColor(c[0], c[1], c[2]);
    const x = margin + (opts.indent ?? 0);
    const lines = doc.splitTextToSize(txt, w - margin * 2 - (opts.indent ?? 0));
    for (const l of lines) { ensure(size + 4); doc.text(l, x, y); y += size + 4; }
  };

  const sectionTitle = (n: number, title: string) => {
    sectionIndex.push({ number: n, title, page: pageNum });
    ensure(50);
    y += 12;
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(margin, y - 2, 4, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text(`${n}. ${title}`, margin + 12, y + 12);
    y += 32;
  };

  const kv = (k: string, v: string) => {
    ensure(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(`${k}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    const lines = doc.splitTextToSize(String(v), w - margin * 2 - 120);
    doc.text(lines[0] || '', margin + 110, y);
    y += 12;
    for (let i = 1; i < lines.length; i++) { ensure(12); doc.text(lines[i], margin + 110, y); y += 12; }
  };

  const severityBadge = (sev: string, atX?: number) => {
    const [r, g, b] = sevColor(sev);
    const label = (sev || 'info').toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const tw = doc.getTextWidth(label) + 10;
    const x0 = atX ?? margin;
    doc.setFillColor(r, g, b);
    doc.roundedRect(x0, y - 9, tw, 12, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, x0 + 5, y);
    return tw;
  };

  // ===== TABLE HELPER =====
  const drawTable = (
    headers: string[],
    rows: string[][],
    columnWidths: number[],
    rowHeight = 16
  ) => {
    const totalW = columnWidths.reduce((s, w) => s + w, 0);
    // Header
    ensure(rowHeight + 6);
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(margin, y, totalW, rowHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    let cx = margin;
    headers.forEach((hd, i) => {
      doc.text(hd, cx + 4, y + 11);
      cx += columnWidths[i];
    });
    y += rowHeight;
    // Rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    rows.forEach((row, idx) => {
      // compute needed height (max wrapped lines across cols)
      let maxLines = 1;
      const wrapped: string[][] = [];
      row.forEach((cell, i) => {
        const lines = doc.splitTextToSize(cell || '', columnWidths[i] - 8);
        wrapped.push(lines);
        if (lines.length > maxLines) maxLines = lines.length;
      });
      const rh = Math.max(rowHeight, maxLines * 10 + 6);
      ensure(rh);
      if (idx % 2 === 0) {
        doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
        doc.rect(margin, y, totalW, rh, 'F');
      }
      // border
      doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      doc.line(margin, y + rh, margin + totalW, y + rh);
      let cx2 = margin;
      wrapped.forEach((lines, i) => {
        let ty = y + 11;
        lines.forEach((ln: string) => {
          doc.text(ln, cx2 + 4, ty);
          ty += 10;
        });
        cx2 += columnWidths[i];
      });
      y += rh;
    });
    // outer border
    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.rect(margin, y - (rows.length * rowHeight + rowHeight), totalW, 1, 'S');
    y += 14;
  };

  // ===== COVER — Template HiSolution =====
  const o = report.organization || {};
  const clientLabel = (o.legal_name || o.name || 'Cliente').slice(0, 55);
  const brandTitle = getSurfaceScanBrandTitle(report);

  // 1. Sfondo fotografico full-page (edificio/cupola HiSolution template)
  doc.addImage(COVER_BG_JPEG_B64, 'JPEG', 0, 0, w, h);

  // 2. Overlay scuro in alto (logo area)
  doc.setFillColor(8, 15, 32);
  doc.rect(0, 0, w, 72, 'F');
  // 3. Overlay scuro in basso (text area)
  doc.setFillColor(8, 15, 32);
  doc.rect(0, h * 0.62, w, h * 0.38, 'F');
  // 4. Barra accent blu
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 70, w, 3, 'F');

  // 5. Logo HiSolution (top-left)
  doc.addImage(HISOLUTION_LOGO_PNG_B64, 'PNG', margin, 15, 130, 37);
  // Brand label (top-right)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(140, 175, 225);
  doc.text('HiSolution Srl  ·  support@hisolution.it', w - margin, 38, { align: 'right' });

  // 6. Titolo servizio
  const titleY = h * 0.665;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(255, 255, 255);
  doc.text('SurfaceScan360', margin, titleY);

  // 7. Sottotitolo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(160, 200, 255);
  doc.text('Vulnerability Surface Scan  ·  Report Completo', margin, titleY + 22);

  // 8. Separatore accent
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(margin, titleY + 33, 44, 2, 'F');

  // 9. Nome cliente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text(clientLabel, margin, titleY + 56);

  // 10. Variante brand + data
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(130, 170, 220);
  doc.text(brandTitle, margin, titleY + 74);
  doc.text(`Generato il ${new Date(report.generated_at).toLocaleDateString('it-IT')}`, margin, titleY + 87);

  // 11. Risk Score badge (right side)
  if (aiData?.risk_score != null) {
    const score = aiData.risk_score;
    const level = aiData.risk_level || '';
    const label = `Risk Score ${score}/100  ·  ${level}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const tw = doc.getTextWidth(label) + 20;
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.roundedRect(w - margin - tw, titleY + 42, tw, 22, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, w - margin - tw + 10, titleY + 57);
  }

  // 12. Footer cover: classificazione + contatti
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 140, 195);
  doc.text('Pubblico ( )  ·  Privato ( )  ·  Confidenziale (X)', margin, h - 34);
  doc.text('Il seguente rapporto contiene informazioni riservate. Non distribuire senza autorizzazione.', margin, h - 22);
  doc.text('Via Della Canapiglia 5, Vecchiano (PI)', w - margin, h - 22, { align: 'right' });

  y = h + 1;
  skipNextFooter = true; // non stampare footer sulla cover page
  newPage();
  const tocPage = pageNum;
  newPage();

  const renderToc = () => {
    doc.setPage(tocPage);
    y = margin;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text('Sommario', margin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text('Indice capitoli (clicca per aprire la sezione)', margin, y);
    y += 16;
    sectionIndex
      .sort((a, b) => a.number - b.number)
      .forEach((entry) => {
        if (y > h - margin - 24) return;
        const label = `${entry.number}. ${entry.title}`;
        const pageLabel = `Pag. ${entry.page}`;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(label, margin, y);
        const pageLabelWidth = doc.getTextWidth(pageLabel);
        doc.text(pageLabel, w - margin - pageLabelWidth, y);
        doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
        doc.line(margin, y + 3, w - margin, y + 3);
        doc.link(margin, y - 9, w - margin * 2, 14, { pageNumber: entry.page });
        y += 18;
      });
  };

  // ===== 1 ANAGRAFICA =====
  sectionTitle(1, 'Anagrafica cliente');
  const anagRows: Array<[string, any]> = [
    ['Ragione sociale', o.legal_name || o.name],
    ['P.IVA', o.vat_number],
    ['Codice fiscale', o.fiscal_code],
    ['Sede legale', o.legal_address],
    ['Sede operativa', o.operational_address],
    ['PEC', o.pec],
    ['Email', o.email],
    ['Telefono', o.phone],
    ['Settore', o.business_sector],
    ['Classificazione NIS2', o.nis2_classification],
  ];
  anagRows.forEach(([k, v]) => { if (v) kv(k, String(v)); });

  // ===== 2 SCOPE — TABELLA REGOLE MONITORATE =====
  sectionTitle(2, 'Scope della scansione');
  const s = report.scan || {};
  kv('Target principale', `${s.target || 'n/d'} (${s.target_type || 'n/d'})`);
  kv('Profilo', s.scan_profile || 'n/d');
  kv('Hosting', s.hosting_context || 'n/d');
  kv('Completata', s.completed_at ? new Date(s.completed_at).toLocaleString('it-IT') : 'n/d');
  if (s.overall_score != null) kv('Overall score', `${s.overall_score}/100`);
  if (s.risk_level) kv('Risk level', String(s.risk_level));
  if (s.scope_mode) kv('Modalità report', s.scope_mode === 'single_job' ? 'Singola scansione' : 'Scope completo');
  if (s.scope_targets_total != null) kv('Target inclusi', String(s.scope_targets_total));
  if (Array.isArray(s.scope_profiles) && s.scope_profiles.length > 0) {
    kv('Profili inclusi', s.scope_profiles.join(', '));
  }
  if (Array.isArray(s.scope_target_types) && s.scope_target_types.length > 0) {
    kv('Tipi target', s.scope_target_types.join(', '));
  }
  y += 6;

  const monitored = report.monitored_scope || [];
  if (monitored.length > 0) {
    text(`Asset oggetto della scansione (${monitored.length})`, { bold: true, size: 10, color: [BRAND.r, BRAND.g, BRAND.b] });
    y += 2;
    const scopeRows = monitored.map((m: any) => {
      const value = m.entry_type === 'range'
        ? `${m.ip_start} - ${m.ip_end}`
        : m.input_value;
      const origine = m.discovered_via === 'subdomain_dump'
        ? `da sottodominio (${m.discovered_from || 'n/d'})`
        : (m.discovered_via || 'manuale');
      return [m.entry_type || 'n/d', value, origine];
    });
    drawTable(['Tipo', 'Valore', 'Origine'], scopeRows, [80, 290, 145]);
  } else {
    text('Nessuna regola di scope configurata.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  }

  const scopeSummary = report.scope_guard_summary || {};
  const inScopeCount = Number(scopeSummary.in_scope || 0);
  const excludedScopeCount = Number(scopeSummary.excluded_by_scope || 0);
  const excludedSharedCount = Number(scopeSummary.excluded_shared_noise || 0);
  y += 6;
  text('Elementi esclusi da scope guard', { bold: true, size: 10, color: [BRAND.r, BRAND.g, BRAND.b] });
  text(
    `In scope: ${inScopeCount} · Esclusi scope: ${excludedScopeCount} · Esclusi shared/noise: ${excludedSharedCount}`,
    { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] },
  );

  const scoreBreakdown = s.score_breakdown || null;
  if (scoreBreakdown && typeof scoreBreakdown === 'object') {
    y += 8;
    text('Score breakdown per area', { bold: true, size: 10, color: [BRAND.r, BRAND.g, BRAND.b] });
    y += 2;
    const rows = [
      ['Transport', String(scoreBreakdown.transportScore ?? '-')],
      ['DNS', String(scoreBreakdown.dnsScore ?? '-')],
      ['HTTP Security', String(scoreBreakdown.httpSecurityScore ?? '-')],
      ['Exposure', String(scoreBreakdown.exposureScore ?? '-')],
      ['Reputation', String(scoreBreakdown.reputationScore ?? '-')],
      ['Quality', String(scoreBreakdown.qualityScore ?? '-')],
      ['Domain Hygiene', String(scoreBreakdown.domainHygieneScore ?? '-')],
    ];
    drawTable(['Area', 'Score'], rows, [260, 255]);
  }

  // ===== 3 SOTTODOMINI CON PROFONDITÀ =====
  sectionTitle(3, 'Sottodomini rilevati');
  const allHostnames = new Set<string>();
  const dumpSubdomains: Array<{ host: string; ip?: string | null; root: string; depth: number; evidence: string }> = [];
  (report.subdomain_dumps || []).forEach((dump: any) => {
    ((dump.results || []) as any[]).forEach((r: any) => {
      const host = normalizeHost(r.subdomain);
      if (!host) return;
      allHostnames.add(host);
      dumpSubdomains.push({
        host,
        ip: r.ip,
        root: dump.root_domain,
        depth: depthFromRoot(host, dump.root_domain),
        evidence: [r.ip, r.country, r.asn_name].filter(Boolean).join(' · ') || `rilevato ${dump.created_at ? new Date(dump.created_at).toLocaleString('it-IT') : ''}`,
      });
    });
  });
  (report.assets_in_scope || []).forEach((a: any) => {
    if (a.hostname) allHostnames.add(a.hostname.toLowerCase());
    if (a.asset_type === 'domain' || a.asset_type === 'subdomain') allHostnames.add(String(a.asset_value).toLowerCase());
  });
  monitored.forEach((m: any) => {
    if (m.entry_type === 'domain') allHostnames.add(String(m.input_value).toLowerCase());
  });
  // anche da intel target
  (report.intel || []).forEach((i: any) => {
    if (i.target && /[a-z]/i.test(i.target) && !/^\d+\.\d+\.\d+\.\d+$/.test(i.target)) {
      allHostnames.add(String(i.target).toLowerCase());
    }
  });

  // Raggruppa: root = ultimi 2 label, subdomain = profondità = label_count - 2
  const subdomainGroups: Record<string, Array<{ host: string; depth: number }>> = {};
  Array.from(allHostnames).forEach((host) => {
    const labels = host.split('.').filter(Boolean);
    if (labels.length < 2) return;
    const root = labels.slice(-2).join('.');
    const depth = Math.max(0, labels.length - 2);
    (subdomainGroups[root] ||= []).push({ host, depth });
  });

  const hasSubs = Object.values(subdomainGroups).some((arr) => arr.some((x) => x.depth > 0));
  if (!hasSubs) {
    text('Nessun sottodominio rilevato in questo snapshot. Esegui un dump sottodomini per arricchire lo scope.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  } else if (dumpSubdomains.length > 0) {
    text(`Evidenze dirette da discovery sottodomini (${dumpSubdomains.length})`, { bold: true, size: 10, color: [BRAND.r, BRAND.g, BRAND.b] });
    y += 6;
    drawTable(['Profondità', 'Sottodominio', 'Root', 'Evidenza'], dumpSubdomains.map((x) => [`L${x.depth}`, x.host, x.root, x.evidence]), [65, 190, 110, 150]);
    y += 8;
  } else {
    Object.entries(subdomainGroups).forEach(([root, list]) => {
      list.sort((a, b) => a.depth - b.depth || a.host.localeCompare(b.host));
      const subs = list.filter((x) => x.depth > 0);
      if (subs.length === 0) return;
      ensure(60);
      y += 6;
      text(`${root}  —  ${subs.length} sottodomin${subs.length === 1 ? 'io' : 'i'}`, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
      y += 8;
      const rows = subs.map((x) => [`L${x.depth}`, x.host, x.depth >= 3 ? 'profondo' : x.depth === 2 ? 'medio' : 'diretto']);
      drawTable(['Profondità', 'Sottodominio', 'Livello'], rows, [70, 320, 125]);
      y += 10;
    });
  }

  // ===== 4 PORTE APERTE =====
  sectionTitle(4, 'Porte aperte e servizi esposti');
  const normalizeIp = (value: unknown): string => {
    return extractIpAddress(String(value || ''));
  };
  const sanitizePortHost = (value: unknown): string => {
    const asset = sanitizeAssetLabel(value);
    if (extractIpAddress(asset)) return '';
    return normalizeHost(asset);
  };
  const normalizePort = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return null;
    return Math.round(parsed);
  };
  const severityWeight = (severity: string): number => {
    if (severity === 'critical') return 5;
    if (severity === 'high') return 4;
    if (severity === 'medium') return 3;
    if (severity === 'low') return 2;
    return 1;
  };
  const bestSeverity = (severities: Set<string>): string => {
    const normalized = Array.from(severities).map((entry) => String(entry || '').toLowerCase());
    if (normalized.includes('critical')) return 'critical';
    if (normalized.includes('high')) return 'high';
    if (normalized.includes('medium')) return 'medium';
    if (normalized.includes('low')) return 'low';
    return 'info';
  };

  type PortEvidenceRow = {
    host: string;
    ip: string;
    port: number;
    protocol: string;
    services: Set<string>;
    severities: Set<string>;
    cves: Set<string>;
  };

  const portEvidenceMap = new Map<string, PortEvidenceRow>();
  const addPortEvidence = (input: {
    host?: unknown;
    ip?: unknown;
    port?: unknown;
    protocol?: unknown;
    service?: unknown;
    severity?: unknown;
    cves?: unknown;
  }) => {
    const port = normalizePort(input.port);
    if (!port) return;
    const hostRaw = String(input.host || s.target || '').trim();
    const hostSanitized = sanitizePortHost(hostRaw);
    const ipFromHost = normalizeIp(hostRaw);
    const ip = normalizeIp(input.ip) || ipFromHost || (normalizeIp(hostSanitized) ? normalizeIp(hostSanitized) : '');
    const host = resolveReportTarget(hostSanitized, input.host, input.ip);
    if (host === 'n/d' && !ip) return;
    const protocol = String(input.protocol || 'tcp').trim().toLowerCase() || 'tcp';
    const key = `${host}|${ip}|${port}|${protocol}`;
    if (!portEvidenceMap.has(key)) {
      portEvidenceMap.set(key, {
        host,
        ip,
        port,
        protocol,
        services: new Set<string>(),
        severities: new Set<string>(),
        cves: new Set<string>(),
      });
    }
    const row = portEvidenceMap.get(key)!;
    const serviceValue = String(input.service || '').trim();
    if (serviceValue) row.services.add(redactReportWords(serviceValue));
    const severity = String(input.severity || 'info').toLowerCase();
    row.severities.add(severity);
    if (Array.isArray(input.cves)) {
      input.cves
        .map((entry) => String(entry || '').trim().toUpperCase())
        .filter((entry) => /^CVE-\d{4}-\d{4,7}$/.test(entry))
        .forEach((entry) => row.cves.add(entry));
    }
  };

  (report.findings || []).forEach((finding: any) => {
    const findingType = String(finding?.finding_type || '').toLowerCase();
    if (findingType !== 'open_port_exposed' && findingType !== 'service_fingerprint_exposed') return;
    const evidence = finding?.evidence && typeof finding.evidence === 'object'
      ? (finding.evidence as Record<string, any>)
      : {};
    const serviceName = [evidence?.service, evidence?.version].filter(Boolean).join(' ').trim()
      || finding?.title
      || '';
    addPortEvidence({
      host: finding?.affected_asset || finding?.affected_url || evidence?.hostname || evidence?.host || s.target,
      ip: finding?.ip || evidence?.ip || evidence?.host_ip || evidence?.raw?.ip_address,
      port: finding?.port ?? evidence?.port ?? evidence?.raw?.number,
      protocol: finding?.protocol || evidence?.protocol || evidence?.raw?.protocol,
      service: serviceName,
      severity: finding?.severity || 'info',
      cves: finding?.cve,
    });
  });

  (report.observations || []).forEach((obs: any) => {
    const value = obs?.value || {};
    const host = value?.host || value?.hostname || value?.domain || value?.target || obs?.title;
    const ip = value?.ip || value?.ip_address || value?.host_ip;
    if (Array.isArray(value?.ports)) {
      value.ports.forEach((port: number) => {
        addPortEvidence({ host, ip, port, severity: obs?.severity || 'info' });
      });
    }
    if (Array.isArray(value?.open_ports)) {
      value.open_ports.forEach((port: number) => {
        addPortEvidence({ host, ip, port, severity: obs?.severity || 'info' });
      });
    }
    if (Array.isArray(value?.data)) {
      value.data.forEach((entry: any) => {
        addPortEvidence({
          host,
          ip,
          port: entry?.port,
          protocol: entry?.transport || entry?.protocol,
          service: entry?.product || entry?.service || '',
          severity: obs?.severity || 'info',
        });
      });
    }
  });

  (report.intel || []).forEach((entry: any) => {
    const summary = entry?.summary || {};
    const host = entry?.target || summary?.host || summary?.hostname || s.target;
    const ip = summary?.ip || summary?.ip_address || summary?.host_ip;
    if (Array.isArray(summary?.ports)) {
      summary.ports.forEach((port: number) => {
        addPortEvidence({ host, ip, port });
      });
    }
    if (Array.isArray(summary?.open_ports)) {
      summary.open_ports.forEach((port: number) => {
        addPortEvidence({ host, ip, port });
      });
    }
    if (Array.isArray(summary?.data)) {
      summary.data.forEach((dataEntry: any) => {
        addPortEvidence({
          host,
          ip,
          port: dataEntry?.port,
          protocol: dataEntry?.transport || dataEntry?.protocol,
          service: dataEntry?.product || dataEntry?.service || '',
          cves: dataEntry?.cve,
        });
      });
    }
  });

  const portEntries = Array.from(portEvidenceMap.values()).sort((a, b) => {
    const sevDelta = severityWeight(bestSeverity(b.severities)) - severityWeight(bestSeverity(a.severities));
    if (sevDelta !== 0) return sevDelta;
    const hostDelta = a.host.localeCompare(b.host);
    if (hostDelta !== 0) return hostDelta;
    return a.port - b.port;
  });

  if (portEntries.length === 0) {
    text(
      'Nessuna esposizione di porte/servizi confermata nei findings attuali. Rieseguire una scansione domain_exposure o cve_api_validation per aggiornare le evidenze attive.',
      { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 },
    );
  } else {
    const rows = portEntries.slice(0, 120).map((entry) => {
      const services = Array.from(entry.services);
      const serviceLabel = services.length === 0
        ? '—'
        : services.length > 2
          ? `${services.slice(0, 2).join(' / ')} +${services.length - 2}`
          : services.join(' / ');
      const cveList = Array.from(entry.cves);
      return [
        resolveReportTarget(entry.host, entry.ip),
        entry.ip || '-',
        `${entry.port}/${entry.protocol}`,
        serviceLabel,
        bestSeverity(entry.severities).toUpperCase(),
        cveList.length > 0 ? cveList.slice(0, 3).join(', ') : '-',
      ];
    });
    drawTable(
      ['Dominio / Subdominio', 'IP correlato', 'Porta / Proto', 'Servizio', 'Sev', 'CVE'],
      rows,
      [120, 88, 72, 120, 45, 70],
    );
    if (portEntries.length > 120) {
      text(`… e altre ${portEntries.length - 120} esposizioni disponibili nel repository report`, {
        size: 8,
        color: [MUTED.r, MUTED.g, MUTED.b],
        indent: 4,
      });
    }
  }

  // ===== 5 EVIDENZE ESTERNE — DETTAGLIO PER ASSET =====
  sectionTitle(5, 'Evidenze esterne per asset');
  const observations = report.observations || [];

  // Markers ASCII (jsPDF helvetica non supporta glifi Unicode)
  const OK = '[OK]';
  const NO = '[X]';
  const WARN = '[!]';

  // Mapping reali chiavi check HTTP header → label
  const HTTP_HEADER_RULES: Array<{ key: string; label: string }> = [
    { key: 'contentSecurityPolicy', label: 'Content-Security-Policy' },
    { key: 'strictTransportSecurity', label: 'Strict-Transport-Security (HSTS)' },
    { key: 'xContentTypeOptions', label: 'X-Content-Type-Options' },
    { key: 'xFrameOptions', label: 'X-Frame-Options' },
    { key: 'referrerPolicy', label: 'Referrer-Policy' },
    { key: 'permissionsPolicy', label: 'Permissions-Policy' },
    { key: 'crossOriginOpenerPolicy', label: 'Cross-Origin-Opener-Policy' },
    { key: 'crossOriginResourcePolicy', label: 'Cross-Origin-Resource-Policy' },
  ];

  const amd = (report.asset_module_details || []).slice();
  const domainsAmd = amd.filter((a) => a.asset_type === 'domain');
  const subsAmd = amd.filter((a) => a.asset_type === 'subdomain');

  const renderAssetBlock = (a: NonNullable<SurfaceScan360Report['asset_module_details']>[number]) => {
    ensure(40);
    // Header asset
    y += 4;
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(margin, y - 2, 3, 14, 'F');
    text(`${a.asset}${a.asset_type === 'subdomain' ? '  (sottodominio)' : ''}`, { bold: true, size: 12, color: [DARK.r, DARK.g, DARK.b], indent: 8 });
    y += 2;

    // HTTP Security
    if (a.http) {
      const score = Number(a.http.score ?? 0);
      const col: [number, number, number] = score >= 70 ? [16, 133, 89] : score >= 40 ? [180, 120, 10] : [200, 50, 50];
      text(`HTTP Security — Score ${score}/100 · Grade ${a.http.grade || '-'} · HTTP ${a.http.statusCode ?? '-'}`, { size: 9, bold: true, color: col, indent: 8 });
      const checks = a.http.checks || {};
      const rows = HTTP_HEADER_RULES
        .filter((r) => r.key in checks)
        .map((r) => [r.label, checks[r.key] ? `${OK} Presente` : `${NO} Mancante`]);
      if (rows.length > 0) drawTable(['Header di sicurezza', 'Stato'], rows, [320, 195]);
      if (Array.isArray(a.http_findings) && a.http_findings.length > 0) {
        drawTable(
          ['Header', 'Stato', 'Nota'],
          a.http_findings.slice(0, 6).map((f) => [f.header || '-', String(f.status || '-').toUpperCase(), String(f.note || '-').slice(0, 90)]),
          [150, 60, 305]
        );
      }
    }

    // DNS Posture & Email Security
    if (a.dns) {
      const d = a.dns;
      const score = Number(d.score ?? 0);
      const col: [number, number, number] = score >= 70 ? [16, 133, 89] : score >= 40 ? [180, 120, 10] : [200, 50, 50];
      text(`DNS & Email Security — Score ${score}/100 · Grade ${d.grade || '-'}`, { size: 9, bold: true, color: col, indent: 8 });
      const protoRows = [
        ['SPF', d.hasSpf ? `${OK} Presente` : `${NO} Assente`],
        ['DMARC', d.hasDmarc ? `${OK} Presente` : `${NO} Assente`],
        ['CAA', d.hasCaa ? `${OK} Presente` : `${NO} Assente`],
        ['DNSSEC', d.hasDnssecDelegation ? `${OK} Attivo` : `${NO} Non configurato`],
        ['Mail Exchange (MX)', d.hasMailExchange ? `${OK} Presente` : `${NO} Assente`],
      ];
      drawTable(['Protocollo', 'Stato'], protoRows, [200, 315]);
      if (Array.isArray(a.dns_findings) && a.dns_findings.length > 0) {
        drawTable(
          ['Finding DNS', 'Severità', 'Stato'],
          a.dns_findings.slice(0, 6).map((f) => [String(f.title || '-').slice(0, 130), String(f.severity || '-').toUpperCase(), String(f.status || '-').toUpperCase()]),
          [290, 80, 145]
        );
      }
    }

    // SSL/TLS
    if (a.ssl && (a.ssl.trusted !== undefined || a.ssl.grade || a.ssl.subject)) {
      text('SSL/TLS', { size: 9, bold: true, color: [BRAND.r, BRAND.g, BRAND.b], indent: 8 });
      const s = a.ssl;
      const sslRows: string[][] = [];
      if (s.trusted !== undefined) sslRows.push(['Certificato trusted', s.trusted ? `${OK} Si` : `${NO} No`]);
      if (s.grade) sslRows.push(['Grado SSL Labs', String(s.grade)]);
      if (s.tls12 !== undefined) sslRows.push(['TLS 1.2+', s.tls12 ? `${OK} Supportato` : `${NO} No`]);
      if (s.tls13 !== undefined) sslRows.push(['TLS 1.3', s.tls13 ? `${OK} Supportato` : `${NO} No`]);
      if (Array.isArray(s.weak_protocols) && s.weak_protocols.length) sslRows.push(['Protocolli deboli', `${WARN} ${s.weak_protocols.join(', ')}`]);
      if (Array.isArray(s.weak_ciphers) && s.weak_ciphers.length) sslRows.push(['Cipher deboli', `${WARN} ${s.weak_ciphers.slice(0, 3).join(', ')}`]);
      if (s.subject) sslRows.push(['Soggetto certificato', String(s.subject).slice(0, 80)]);
      if (s.issuer) sslRows.push(['Emittente (CA)', String(s.issuer).slice(0, 80)]);
      if (sslRows.length > 0) drawTable(['Campo', 'Valore'], sslRows, [200, 315]);
    }

    // WHOIS / RDAP
    if (a.whois && (a.whois.registrar || a.whois.days_to_expiry != null)) {
      text('Domain WHOIS / RDAP', { size: 9, bold: true, color: [BRAND.r, BRAND.g, BRAND.b], indent: 8 });
      const w = a.whois;
      const wRows: string[][] = [];
      if (w.registrar) wRows.push(['Registrar', String(w.registrar)]);
      if (w.days_to_expiry != null) {
        const dl = Number(w.days_to_expiry);
        const flag = dl < 30 ? `  ${WARN} URGENTE` : dl < 90 ? `  ${WARN} Attenzione` : '';
        wRows.push(['Scadenza dominio', `${dl} giorni${flag}`]);
      }
      if (w.expires) wRows.push(['Data scadenza', String(w.expires).slice(0, 10)]);
      if (w.dnssec) wRows.push(['DNSSEC (RDAP)', String(w.dnssec)]);
      if (w.source) wRows.push(['Fonte dati', String(w.source)]);
      if (wRows.length > 0) drawTable(['Campo', 'Valore'], wRows, [200, 315]);
    }

    // Tecnologie (solo se presenti — niente n/d)
    if (Array.isArray(a.technologies) && a.technologies.length > 0) {
      text('Tecnologie rilevate', { size: 9, bold: true, color: [BRAND.r, BRAND.g, BRAND.b], indent: 8 });
      drawTable(
        ['Tecnologia', 'Versione', 'Categoria'],
        a.technologies.slice(0, 10).map((t) => [t.name, t.version || '-', t.category || '-']),
        [220, 120, 175]
      );
    }

    // Threat Intelligence
    if (a.threats || a.blocklist) {
      text('Threat Intelligence & Reputazione', { size: 9, bold: true, color: [BRAND.r, BRAND.g, BRAND.b], indent: 8 });
      const t = a.threats;
      const tRows: string[][] = [];
      if (t) {
        tRows.push(['Safe Browsing (Google)', t.safe_browsing_unsafe ? `${WARN} Unsafe` : `${OK} Safe`]);
        tRows.push(['URLHaus (abuse.ch)', t.urlhaus_listed ? `${WARN} Listato` : `${OK} Non listato`]);
        tRows.push(['PhishTank', t.phishtank_verified ? `${WARN} Phishing` : `${OK} Pulito`]);
        tRows.push(['IOC Fresh List', t.ioc_matched ? `${WARN} Match (${t.ioc_count})` : `${OK} No match`]);
      }
      if (a.blocklist) {
        tRows.push(['DNS Blocklist', Number(a.blocklist.listed_count) > 0 ? `${WARN} In ${a.blocklist.listed_count} blocklist` : `${OK} Clean`]);
      }
      if (tRows.length > 0) drawTable(['Controllo', 'Risultato'], tRows, [200, 315]);
    }
    y += 6;
  };

  if (amd.length === 0) {
    text('Nessuna evidenza tecnica per-asset disponibile in questo snapshot.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  } else {
    if (domainsAmd.length > 0) {
      text(`Domini in scope (${domainsAmd.length})`, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
      y += 4;
      domainsAmd.forEach(renderAssetBlock);
    }
    if (subsAmd.length > 0) {
      ensure(40);
      y += 6;
      text(`Sottodomini rilevati (${subsAmd.length})`, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
      y += 4;
      subsAmd.forEach(renderAssetBlock);
    }
  }

  // ── Intel generica residua (hosting/geo/altre evidenze) ────────────────────
  const intel = (report.intel || [])
    .map((i: any) => {
      const resolvedTarget = resolveReportTarget(
        i?.target,
        i?.summary?.domain,
        i?.summary?.hostname,
        i?.summary?.host,
        i?.summary?.url,
        i?.summary?.ip,
        i?.summary?.ip_address,
      );
      if (i && typeof i === 'object' && i.summary_text && !isGenericEvidenceText(String(i.summary_text))) {
        return {
          group: String(i.category || 'Evidenze esterne'),
          target: resolvedTarget,
          summaryText: redactReportWords(String(i.summary_text)),
        };
      }
      return {
        group: providerLabel(String(i?.provider || '')),
        target: resolvedTarget,
        summaryText: summarizeIntel(String(i?.provider || ''), resolvedTarget, i?.summary),
      };
    })
    .filter((i: any) => i.summaryText && !isJunkSummary(i.summaryText));

  // Osservazioni residue: SOLO geolocalizzazione/hosting (il resto è già per-asset).
  // tech_stack/website_recon/ssl/dns/http esclusi qui (mostrati nel dettaglio per-asset sopra).
  const OBS_MODULES_INCLUDED = ['hosting_context'];
  const TECH_EMPTY_RX = /nessuna tecnologia|^n\/d$|tecnologie rilevate:\s*$/i;
  const obsAsIntel = observations
    .filter((ob: any) => OBS_MODULES_INCLUDED.includes(ob.module))
    .map((ob: any) => {
      const resolvedTarget = resolveReportTarget(
        ob.value?.domain,
        ob.value?.hostname,
        ob.value?.host,
        ob.value?.target,
        ob.value?.url,
        ob.title,
      );
      return {
        group: providerLabel(ob.module),
        target: resolvedTarget,
        summaryText: summarizeIntel(ob.module, resolvedTarget, ob.value),
      };
    });
  const allIntel = [...intel, ...obsAsIntel]
    .filter((i: any) => !isJunkSummary(i?.summaryText))
    .filter((i: any) => !isScopeAggregateTarget(i?.target))
    .filter((i: any) => !TECH_EMPTY_RX.test(String(i?.summaryText || '')))
    .filter((i: any) => String(i?.target || 'n/d') !== 'n/d');

  if (allIntel.length === 0) {
    // Nessuna evidenza extra: la sezione per-asset sopra è già esaustiva
  } else {
    text('Geolocalizzazione e contesto hosting', { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
    y += 2;
    const byProvider: Record<string, any[]> = {};
    allIntel.forEach((i: any) => { (byProvider[i.group || 'Evidenze esterne'] ||= []).push(i); });
    Object.entries(byProvider).forEach(([prov, list]) => {
      const rows = list.slice(0, 20).map((i: any) => [
        String(i.target || 'n/d'),
        String(i.summaryText || 'Nessuna evidenza disponibile.'),
      ]);
      text(`${prov} (${list.length})`, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
      y += 2;
      drawTable(['Target', 'Risultato'], rows, [180, 335]);
      if (list.length > 20) text(`… e altri ${list.length - 20} risultati`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b], indent: 4 });
      y += 4;
    });
  }

  // ===== 6 CVE & FINDINGS — per asset =====
  sectionTitle(6, 'CVE e vulnerabilità');
  const allFindings = report.findings || [];
  const sc = report.findings_by_severity || {};
  text(
    `Totale findings: ${allFindings.length}  ·  Critici: ${sc.critical || 0}  ·  Alti: ${sc.high || 0}  ·  Medi: ${sc.medium || 0}  ·  Bassi: ${sc.low || 0}  ·  Info: ${sc.info || 0}`,
    { bold: true, size: 10 }
  );
  y += 6;
  const cveCatalog = Array.isArray(report.cve_catalog) ? report.cve_catalog : [];
  const cveCatalogScoped = cveCatalog
    .map((entry) => {
      const scopedAssets = Array.isArray(entry.affected_assets)
        ? entry.affected_assets.map((asset) => sanitizeAssetLabel(asset)).filter((asset) => isValidReportAsset(asset))
        : [];
      return {
        ...entry,
        affected_assets: Array.from(new Set(scopedAssets)),
      };
    })
    .filter((entry) => entry.affected_assets.length > 0);
  if (cveCatalogScoped.length > 0) {
    text('Catalogo CVE con descrizione tecnica', { bold: true, size: 10, color: [BRAND.r, BRAND.g, BRAND.b] });
    y += 2;
    const cveRows = cveCatalogScoped.map((entry) => {
      const cvss = entry.cvss != null ? String(entry.cvss) : '-';
      const epss = entry.epss != null ? `${(Number(entry.epss) * 100).toFixed(2)}%` : '-';
      const kev = entry.cisa_kev ? 'Sì' : 'No';
      const assets = (entry.affected_assets || []).slice(0, 3).join(', ');
      const desc = redactReportWords(String(entry.description || 'Descrizione non disponibile.'));
      return [
        entry.cve_id || '-',
        cvss,
        epss,
        kev,
        assets || '-',
        desc,
      ];
    });
    drawTable(['CVE', 'CVSS', 'EPSS', 'KEV', 'Asset', 'Descrizione'], cveRows, [88, 42, 52, 38, 110, 185]);
  } else {
    text('Nessuna CVE associabile in modo attendibile ad asset dominio/sottodominio/IP in scope.', {
      color: [MUTED.r, MUTED.g, MUTED.b],
      size: 9,
    });
    y += 4;
  }

  // Raggruppa per asset
  const byAsset: Record<string, any[]> = {};
  allFindings.forEach((f: any) => {
    const k = pickReportAsset(f.affected_asset, f.affected_url, f.ip, s.target);
    (byAsset[k] ||= []).push(f);
  });
  // Escludi asset non identificabili (n/d)
  const assetEntries = Object.entries(byAsset)
    .filter(([asset]) => asset !== 'n/d' && asset !== '')
    .sort((a, b) => b[1].length - a[1].length);

  if (assetEntries.length === 0) {
    text('Nessun finding rilevato.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  } else {
    // Tabella riepilogo per asset: solo conteggi per severità
    const sumRows = assetEntries.map(([asset, list]) => {
      const cnt = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<string, number>;
      list.forEach((f) => { cnt[String(f.severity || 'info')] = (cnt[String(f.severity || 'info')] || 0) + 1; });
      return [
        asset,
        String(list.length),
        String(cnt.critical || 0),
        String(cnt.high || 0),
        String(cnt.medium || 0),
        String(cnt.low || 0),
        String(cnt.info || 0),
      ];
    });
    text('Riepilogo findings per asset', { bold: true, size: 10, color: [BRAND.r, BRAND.g, BRAND.b] });
    y += 2;
    drawTable(['Asset', 'Tot', 'Crit', 'High', 'Med', 'Low', 'Info'], sumRows, [225, 40, 50, 50, 50, 50, 50]);

    // Dettaglio per asset: solo CVE e finding tecnici (no DARKRISK/IntelX generici)
    y += 6;
    assetEntries.forEach(([asset, list]) => {
      const technicalFindings = list.filter((f: any) => {
        const ft = String(f.finding_type || '').toLowerCase();
        const title = String(f.title || '').toLowerCase();
        // Escludi finding generici IntelX/DARKRISK con titoli da collection name
        if (/intelx|darkrisk|leaks.signal/.test(ft)) return false;
        if (/\[part\s+\d+\s+of\s+\d+\]/i.test(title)) return false;
        if (/(\.txt|\.csv|\.rar|\.zip|\.7z|\.log)\b/i.test(title)) return false;
        if (Array.isArray(f.cve) && f.cve.length > 0) return true;
        if (/cve|open.port|security.header|ssl|tls|http/i.test(ft)) return true;
        return Boolean(f.cvss || f.cwe?.length);
      });
      if (technicalFindings.length === 0) return;
      ensure(40);
      text(asset, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
      technicalFindings
        .sort((a: any, b: any) => {
          const r: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
          return (r[b.severity] || 0) - (r[a.severity] || 0);
        })
        .forEach((f: any) => {
          ensure(28);
          const badgeW = severityBadge(f.severity);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(DARK.r, DARK.g, DARK.b);
          const titleLines = doc.splitTextToSize(redactReportWords(f.title || '(senza titolo)'), w - margin * 2 - badgeW - 10);
          doc.text(titleLines[0], margin + badgeW + 6, y);
          y += 12;
          for (let i = 1; i < titleLines.length; i++) { ensure(12); doc.text(titleLines[i], margin + badgeW + 6, y); y += 12; }
          const cweValues = Array.isArray(f.cwe) ? f.cwe.map((entry: any) => String(entry || '').trim()).filter(Boolean) : [];
          if (Array.isArray(f.cve) && f.cve.length) text(`CVE: ${f.cve.join(', ')}${f.cvss ? '  ·  CVSS ' + f.cvss : ''}`, { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
          if (cweValues.length > 0) text(`CWE: ${cweValues.slice(0, 5).join(', ')}`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b] });
          y += 3;
        });
      y += 4;
    });
  }

  // ===== 7 EXECUTIVE SUMMARY =====
  if (aiData) {
    sectionTitle(7, 'Executive summary (AI CISO)');
    if (aiData.risk_score != null) {
      text(`Risk score: ${aiData.risk_score}/100  ·  Livello: ${aiData.risk_level || 'n/d'}`, { bold: true });
    }
    if (aiData.executive_summary) text(redactReportWords(aiData.executive_summary));

    if (aiData.top_recommendations?.length) {
      y += 6;
      sectionTitle(8, 'Priorità operative AI (Top 10)');
      aiData.top_recommendations.forEach((r: any) => {
        ensure(40);
        const badgeW = severityBadge(r.severity || 'info');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(`#${r.priority}  ${redactReportWords(r.title)}`, margin + badgeW + 6, y);
        y += 14;
        if (r.rationale) text(`Razionale: ${redactReportWords(r.rationale)}`, { size: 9 });
        if (r.action) text(`Indicazione: ${redactReportWords(r.action)}`, { size: 9, bold: true });
        if (r.affected_assets?.length) text(`Asset: ${r.affected_assets.join(', ')}`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b] });
        y += 6;
      });
    }

    if (aiData.correlations?.length) {
      sectionTitle(9, 'Correlazioni');
      aiData.correlations.forEach((c: any) => text(`• ${redactReportWords(String(c || ''))}`, { size: 9 }));
    }

    if (aiData.compliance_notes) {
      sectionTitle(10, 'Note di compliance');
      text(redactReportWords(aiData.compliance_notes));
    }
  }

  // ===== 11 GLOSSARIO TECNICO =====
  sectionTitle(11, 'Glossario tecnico');
  text('Definizioni semplificate dei termini tecnici usati in questo report.', { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
  y += 4;
  for (const entry of REPORT_GLOSSARY) {
    ensure(28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text(entry.term, margin, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    const defLines = doc.splitTextToSize(entry.definition, w - margin * 2 - 10);
    defLines.forEach((line: string) => { ensure(10); doc.text(line, margin + 8, y); y += 10; });
    y += 4;
  }

  drawFooter();
  renderToc();
  const filename = `SurfaceScan360_${(o.name || 'report').replace(/\s+/g, '_')}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}
