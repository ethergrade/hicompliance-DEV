import jsPDF from 'jspdf';

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
  organization: Record<string, unknown>;
  scan: Record<string, unknown>;
  assets_in_scope: unknown[];
  findings: unknown[];
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
  intel: unknown[];
  observations?: unknown[];
  asset_module_details?: unknown[];
  monitored_scope?: unknown[];
  subdomain_dumps?: unknown[];
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
  hosting_context: 'Classificazione contesto hosting',
  ct_log: 'Evidenze certificate pubbliche',
  dnssec: 'Stato DNSSEC',
  tech_stack: 'Configurazione applicativa',
  mail_security: 'Postura sicurezza email (SPF/DKIM/DMARC)',
  security_headers: 'Controlli HTTP di sicurezza',
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
  const raw = String((report?.organization as unknown)?.report_brand_title || '').trim();
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

const isJunkSummary = (s: unknown): boolean => {
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

const summarizeIntel = (provider: string, target: string, summary: unknown): string => {
  if (summary == null) return 'Nessun dato';
  if (typeof summary === 'string') return redactReportWords(summary);
  if (typeof summary !== 'object') return redactReportWords(String(summary));

  const read = (key: string) => String(summary?.[key] ?? '').trim();
  const boolText = (value: unknown) => (value ? 'sì' : 'no');

  if (provider === 'urlscan' && Array.isArray(summary.recent)) {
    if (summary.recent.length === 0) return `Nessuna scansione pubblica nota per ${target}`;
    const r = summary.recent[0];
    const d = r.date ? new Date(r.date).toLocaleDateString('it-IT') : 'n/d';
    return `${summary.total} evidenz${summary.total === 1 ? 'a' : 'e'} pubblic${summary.total === 1 ? 'a' : 'he'} - ultimo aggiornamento ${d} - IP: ${r.ip || 'n/d'}`;
  }
  if (provider === 'hosting_context') {
    const out: string[] = [];
    if (summary.resolved_ips?.length) out.push(`IP risolti: ${summary.resolved_ips.join(', ')}`);
    if (summary.co_hosted_count != null) out.push(`co-hosted: ${summary.co_hosted_count}`);
    if (summary.multi_tenant != null) out.push(`multi-tenant: ${summary.multi_tenant ? 'sì' : 'no'}`);
    if (summary.cdn_score != null) out.push(`score CDN: ${summary.cdn_score}`);
    if (summary.type) out.push(`tipo: ${summary.type}`);
    return out.join(' · ') || 'n/d';
  }
  if (provider === 'shodan') {
    if (summary.reason === 'not_found') return `Nessuna esposizione pubblica significativa rilevata per ${target}`;
    const ports = summary.ports || summary.open_ports;
    const banners = summary.banners || [];
    const parts: string[] = [];
    if (ports?.length) parts.push(`porte aperte: ${ports.join(', ')}`);
    if (banners.length) parts.push(`banner tecnici: ${banners.length}`);
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
      .map((entry: unknown) => {
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
  if (Array.isArray((summary as unknown)?.detected)) {
    return `Pattern applicativi rilevati: ${(summary as unknown).detected.length}`;
  }
  if (parts.length > 0) {
    return redactReportWords(parts.join(' · '));
  }
  if (keys.length > 0) {
    const scalarPairs = keys
      .slice(0, 12)
      .map((key) => {
        const raw = (summary as unknown)?.[key];
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
  const totalSub = (report.subdomain_dumps || []).reduce((sum, dump: unknown) => {
    return sum + Number(dump?.total_returned || (Array.isArray(dump?.results) ? dump.results.length : 0) || 0);
  }, 0);
  return {
    executive_summary:
      `Analisi consulenziale aggiornata su asset esterni: ${totalFindings} evidenze rilevate, ` +
      `scope monitorato con ${totalScope} regole e ${totalSub} sottodomini osservati. ` +
      `Priorità su riduzione esposizione e chiusura vulnerabilità aperte.`,
    risk_score: risk.score,
    risk_level: risk.level,
    top_recommendations: [
      { priority: 1, title: 'Riduzione esposizione prioritaria', rationale: 'Le evidenze a severità alta/media richiedono intervento tempestivo.', action: 'Chiudere i punti di esposizione più critici con remediation tracciata.', severity: 'high', affected_assets: [] },
      { priority: 2, title: 'Gestione vulnerabilità per impatto', rationale: 'Le CVE presenti richiedono ordine di esecuzione per rischio.', action: 'Applicare patch/mitigazioni e validare con nuova scansione.', severity: 'high', affected_assets: [] },
      { priority: 3, title: 'Hardening configurativo', rationale: 'Controlli web e rete non uniformi aumentano il rischio operativo.', action: 'Allineare baseline di sicurezza su asset pubblici.', severity: 'medium', affected_assets: [] },
      { priority: 4, title: 'Controllo perimetro e sottodomini', rationale: 'La variazione del perimetro modifica il rischio esposto.', action: 'Rieseguire discovery periodica e allineare continuamente lo scope.', severity: 'medium', affected_assets: [] },
      { priority: 5, title: 'Governance e verifica continua', rationale: 'La sicurezza esterna richiede controllo ricorrente.', action: 'Programmare ciclo continuo: analisi, remediation, verifica.', severity: 'low', affected_assets: [] },
      { priority: 6, title: 'Risoluzione finding ad alta frequenza', rationale: 'Findings ripetuti indicano fragilità strutturali del perimetro esterno.', action: 'Aggregare i finding ricorrenti e pianificare azioni risolutive per classe di problema.', severity: 'medium', affected_assets: [] },
      { priority: 7, title: 'Riduzione superficie servizi esposti', rationale: 'Servizi non indispensabili aumentano il rischio di attacco opportunistico.', action: 'Disabilitare i servizi non necessari e limitare l’esposizione alle sole sorgenti autorizzate.', severity: 'medium', affected_assets: [] },
      { priority: 8, title: 'Rafforzamento controlli di accesso', rationale: 'Asset pubblici con controlli deboli possono favorire accessi non autorizzati.', action: 'Applicare policy di accesso restrittive, MFA e segmentazione sui sistemi Internet-facing.', severity: 'medium', affected_assets: [] },
      { priority: 9, title: 'Controllo continuo del ciclo patch', rationale: 'Il ritardo nel patching incrementa la finestra di esposizione ai threat actor.', action: 'Definire SLA di patching per severità e verificare periodicamente lo stato di applicazione.', severity: 'low', affected_assets: [] },
      { priority: 10, title: 'Validazione periodica post-remediation', rationale: 'La remediation non verificata può lasciare il rischio residuo invariato.', action: 'Eseguire scansioni di conferma dopo ogni remediation e mantenere storico evidenze.', severity: 'low', affected_assets: [] },
    ],
    correlations: [
      'La severità aggregata riflette la priorità operativa di remediation.',
      'Scope e sottodomini rilevati influenzano direttamente il volume dei finding.',
      'La riduzione dell’esposizione esterna migliora il profilo di rischio complessivo.',
    ],
    compliance_notes:
      'Le azioni suggerite supportano un percorso coerente con i requisiti di gestione del rischio e miglioramento continuo previsti dai principali framework di sicurezza.',
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

  const drawFooter = () => {
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

  // ===== COVER =====
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, w, 180, 'F');
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 175, w, 5, 'F');
  doc.setTextColor(255, 255, 255);
  drawHiSolutionLogo(doc, margin, 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 230);
  doc.text('HiSolution', margin + 24, 39);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(getSurfaceScanBrandTitle(report), margin, 58);
  doc.setFontSize(24);
  doc.text('Report Attack Surface', margin, 96);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const o = report.organization || {};
  doc.text(o.legal_name || o.name || 'Cliente', margin, 121);
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 230);
  doc.text(`Generato: ${new Date(report.generated_at).toLocaleString('it-IT')}`, margin, 146);
  if (aiData?.risk_score != null) {
    const score = aiData.risk_score;
    const level = aiData.risk_level || '';
    const label = `Risk Score ${score}/100 · ${level}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const tw = doc.getTextWidth(label) + 20;
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.roundedRect(w - margin - tw, 130, tw, 22, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, w - margin - tw + 10, 145);
  }
  y = 210;
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
  const anagRows: Array<[string, unknown]> = [
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
    const scopeRows = monitored.map((m: unknown) => {
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
  (report.subdomain_dumps || []).forEach((dump: unknown) => {
    ((dump.results || []) as unknown[]).forEach((r: unknown) => {
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
  (report.assets_in_scope || []).forEach((a: unknown) => {
    if (a.hostname) allHostnames.add(a.hostname.toLowerCase());
    if (a.asset_type === 'domain' || a.asset_type === 'subdomain') allHostnames.add(String(a.asset_value).toLowerCase());
  });
  monitored.forEach((m: unknown) => {
    if (m.entry_type === 'domain') allHostnames.add(String(m.input_value).toLowerCase());
  });
  // anche da intel target
  (report.intel || []).forEach((i: unknown) => {
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

  (report.findings || []).forEach((finding: unknown) => {
    const findingType = String(finding?.finding_type || '').toLowerCase();
    if (findingType !== 'open_port_exposed' && findingType !== 'service_fingerprint_exposed') return;
    const evidence = finding?.evidence && typeof finding.evidence === 'object'
      ? (finding.evidence as Record<string, unknown>)
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

  (report.observations || []).forEach((obs: unknown) => {
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
      value.data.forEach((entry: unknown) => {
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

  (report.intel || []).forEach((entry: unknown) => {
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
      summary.data.forEach((dataEntry: unknown) => {
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

  // ===== 5 EVIDENZE ESTERNE =====
  sectionTitle(5, 'Evidenze esterne');
  const intel = (report.intel || [])
    .map((i: unknown) => {
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
    .filter((i: unknown) => i.summaryText && !isJunkSummary(i.summaryText));
  const observations = report.observations || [];

  // Aggiungi osservazioni chiave per arricchire il report
  const obsAsIntel = observations
    .filter((ob: unknown) => ['dnssec','tech_stack','mail_security','security_headers','ct_log'].includes(ob.module))
    .map((ob: unknown) => ({
      group: providerLabel(ob.module),
      target: resolveReportTarget(
        ob.value?.domain,
        ob.value?.hostname,
        ob.value?.host,
        ob.value?.target,
        ob.value?.url,
        ob.title,
      ),
      summaryText: summarizeIntel(
        ob.module,
        resolveReportTarget(
          ob.value?.domain,
          ob.value?.hostname,
          ob.value?.host,
          ob.value?.target,
          ob.value?.url,
          ob.title,
        ),
        ob.value,
      ),
    }));
  const allIntel = [...intel, ...obsAsIntel]
    .filter((i: unknown) => !isJunkSummary(i?.summaryText))
    .filter((i: unknown) => !isScopeAggregateTarget(i?.target));

  if (allIntel.length === 0) {
    text('Nessun dato di enrichment disponibile.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  } else {
    const byProvider: Record<string, unknown[]> = {};
    allIntel.forEach((i: unknown) => { (byProvider[i.group || 'Evidenze esterne'] ||= []).push(i); });
    Object.entries(byProvider).forEach(([prov, list]) => {
      const rows = list.slice(0, 20).map((i: unknown) => [
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
  const byAsset: Record<string, unknown[]> = {};
  allFindings.forEach((f: unknown) => {
    const k = pickReportAsset(f.affected_asset, f.affected_url, f.ip, s.target);
    (byAsset[k] ||= []).push(f);
  });
  const assetEntries = Object.entries(byAsset).sort((a, b) => b[1].length - a[1].length);

  if (assetEntries.length === 0) {
    text('Nessun finding rilevato.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  } else {
    // Tabella riepilogo per asset
    const sumRows = assetEntries.map(([asset, list]) => {
      const cnt = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<string, number>;
      list.forEach((f) => { cnt[f.severity] = (cnt[f.severity] || 0) + 1; });
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

    // Dettaglio per asset
    y += 6;
    assetEntries.forEach(([asset, list]) => {
      ensure(40);
      text(asset, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
      list.sort((a, b) => {
        const r = { critical: 5, high: 4, medium: 3, low: 2, info: 1 } as Record<string, number>;
        return (r[b.severity] || 0) - (r[a.severity] || 0);
      }).forEach((f: unknown) => {
        ensure(28);
        const badgeW = severityBadge(f.severity);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        const titleLines = doc.splitTextToSize(redactReportWords(f.title || '(senza titolo)'), w - margin * 2 - badgeW - 10);
        doc.text(titleLines[0], margin + badgeW + 6, y);
        y += 12;
        for (let i = 1; i < titleLines.length; i++) { ensure(12); doc.text(titleLines[i], margin + badgeW + 6, y); y += 12; }
        const cweValues = Array.isArray(f.cwe) ? f.cwe.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [];
        const owaspLabel = [f.owasp, f.owasp_label].filter(Boolean).join(' · ');
        if (Array.isArray(f.cve) && f.cve.length) text(`CVE: ${f.cve.join(', ')}${f.cvss ? '  ·  CVSS ' + f.cvss : ''}`, { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
        if (owaspLabel || cweValues.length > 0) {
          const mapping = [
            owaspLabel ? `OWASP: ${owaspLabel}` : null,
            cweValues.length > 0 ? `CWE: ${cweValues.slice(0, 5).join(', ')}` : null,
          ].filter(Boolean).join('  ·  ');
          if (mapping) text(mapping, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b] });
        }
        if (Number(f.occurrence_count || 0) > 1) {
          text(`Occorrenze aggregate: ${Number(f.occurrence_count)}`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b] });
        }
        if (f.remediation) text(`Remediation: ${redactReportWords(f.remediation)}`, { size: 9 });
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
      aiData.top_recommendations.forEach((r: unknown) => {
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
      aiData.correlations.forEach((c: unknown) => text(`• ${redactReportWords(String(c || ''))}`, { size: 9 }));
    }

    if (aiData.compliance_notes) {
      sectionTitle(10, 'Note di compliance');
      text(redactReportWords(aiData.compliance_notes));
    }
  }

  drawFooter();
  renderToc();
  const filename = `SurfaceScan360_${(o.name || 'report').replace(/\s+/g, '_')}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}
