// Genera report SurfaceScan360 con sintesi e top-10 raccomandazioni via OpenAI gpt-4o-mini.
// Body: { job_id?: string, scan_job_id?: string, organization_id?: string, trigger_source?: "manual"|"auto_on_complete", force_regenerate?: boolean }
// Se job_id non fornito, usa l'ultimo job completato dell'organizzazione.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-surface-internal-secret',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const INTERNAL_REPORT_SECRET =
  Deno.env.get('SURFACESCAN_REPORT_INTERNAL_SECRET') ||
  Deno.env.get('SURFACESCAN_INTERNAL_REPORT_SECRET') ||
  '';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const SEV_RANK: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const TECHNOLOGY_TOKENS: RegExp[] = [
  /\bapache\b/gi,
  /\bnginx\b/gi,
  /\bwordpress\b/gi,
  /\bphp\b/gi,
  /\bopenssl\b/gi,
  /\bcpanel\b/gi,
  /\bplesk\b/gi,
  /\biis\b/gi,
  /\btomcat\b/gi,
  /\bdrupal\b/gi,
  /\bjoomla\b/gi,
  /\bshodan\b/gi,
  /\bpentest-?tools?\b/gi,
  /\bweb[\s-]?check\b/gi,
  /\burlscan\b/gi,
  /\bcrt\.sh\b/gi,
  /\bhackertarget\b/gi,
  /\bpassive[_\s-]?dns\b/gi,
];
const CVE_REGEX = /\bCVE-\d{4}-\d{4,7}\b/gi;
const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV4_LOOSE_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const IPV6_LOOSE_REGEX = /\b(?:[a-f0-9]{1,4}:){2,}[a-f0-9:]{1,}\b/i;
const PARENS_CONTENT_REGEX = /^\((.*)\)$/;
const SURFACESCAN_BRAND_TITLE_HICOMPLIANCE = 'HICOMPLIANCE · SURFACESCAN360';
const SURFACESCAN_BRAND_TITLE_HICONSOLE = 'HiConsole - SURFACESCAN360';
const SURFACESCAN_LEGACY_SCOPE_TITLE = 'SurfaceScan360 Report - Organization Scope';
const TOP_RECOMMENDATIONS_LIMIT = 10;

function isIpv4(value: string): boolean {
  const v = String(value || '').trim();
  if (!IPV4_REGEX.test(v)) return false;
  const parts = v.split('.').map((x) => Number(x));
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
}

function parseHostname(value: string): string | null {
  const raw = String(value || '')
    .replace(/\b(?:shodan|urlscan|web\s*-?\s*check|pentest\s*-?\s*tools?)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!raw) return null;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const host = u.hostname.trim().toLowerCase();
      return host || null;
    }
  } catch {
    // fallback below
  }
  const cleaned = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase();
  if (!cleaned || isIpv4(cleaned)) return null;
  if (cleaned.includes(' ')) {
    const tokens = cleaned
      .split(/[\s|,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    for (const token of tokens) {
      if (!token || isIpv4(token) || token.includes(':')) continue;
      if (token.includes('.')) return token;
    }
  }
  if (!cleaned.includes('.')) return null;
  return cleaned;
}

function surfaceScanBrandTitle(hicomplianceEnabled: boolean): string {
  return hicomplianceEnabled ? SURFACESCAN_BRAND_TITLE_HICOMPLIANCE : SURFACESCAN_BRAND_TITLE_HICONSOLE;
}

function isIpv6(value: string): boolean {
  return String(value || '').includes(':');
}

type ScopeExclusionReason = 'scope_excluded_domain' | 'scope_excluded_ip' | 'scope_excluded_shared_noise';

interface MonitoredScopeRule {
  entry_type: string;
  input_value: string;
  ip_start: string;
  ip_end: string;
}

const SHARED_NOISE_PATTERNS: RegExp[] = [
  /^net-\d{1,3}(?:-\d{1,3}){3}\./i,
  /^host-\d{1,3}(?:-\d{1,3}){3}\./i,
  /^dyn-\d{1,3}(?:-\d{1,3}){3}\./i,
  /^webx\d+\./i,
  /\bcust\b/i,
  /\bdsl\b/i,
  /\bpppoe\b/i,
  /\bpool\b/i,
  /\bdynamic\b/i,
];

const SHARED_NOISE_SUFFIXES = [
  'aruba.it',
  'vodafonedsl.it',
  'teletu.it',
  'fastwebnet.it',
  'alice.it',
  'tim.it',
  'tiscali.it',
];

function ipv4ToNumber(ip: string): number | null {
  if (!isIpv4(ip)) return null;
  const [a, b, c, d] = ip.split('.').map((entry) => Number(entry));
  if ([a, b, c, d].some((entry) => Number.isNaN(entry))) return null;
  return (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
}

function isIpInRange(ip: string, ipStart: string, ipEnd: string): boolean {
  const current = String(ip || '').trim().toLowerCase();
  const start = String(ipStart || '').trim().toLowerCase();
  const end = String(ipEnd || '').trim().toLowerCase();
  if (!current || !start || !end) return false;
  if (current.includes(':') || start.includes(':') || end.includes(':')) {
    return current === start && current === end;
  }
  const currentNum = ipv4ToNumber(current);
  const startNum = ipv4ToNumber(start);
  const endNum = ipv4ToNumber(end);
  if (currentNum === null || startNum === null || endNum === null) return false;
  return currentNum >= startNum && currentNum <= endNum;
}

function splitScopeRules(rows: any[]): { scopeDomains: string[]; ipScopeRules: MonitoredScopeRule[] } {
  const scopeDomains: string[] = [];
  const ipScopeRules: MonitoredScopeRule[] = [];
  for (const row of rows || []) {
    const entryType = String(row?.entry_type || '').trim().toLowerCase();
    if (entryType === 'domain') {
      const input = String(row?.input_value || '').trim().toLowerCase();
      if (input) scopeDomains.push(input);
      continue;
    }
    if (['single', 'range', 'cidr'].includes(entryType)) {
      ipScopeRules.push({
        entry_type: entryType,
        input_value: String(row?.input_value || '').trim().toLowerCase(),
        ip_start: String(row?.ip_start || '').trim().toLowerCase(),
        ip_end: String(row?.ip_end || '').trim().toLowerCase(),
      });
    }
  }
  return {
    scopeDomains: [...new Set(scopeDomains)],
    ipScopeRules,
  };
}

function isHostWithinScope(hostname: string, scopeDomains: string[]): boolean {
  const host = normalizeHost(hostname).replace(/^www\./, '');
  if (!host) return false;
  for (const rawScope of scopeDomains) {
    const scope = normalizeHost(rawScope).replace(/^www\./, '');
    if (!scope) continue;
    if (host === scope || host.endsWith(`.${scope}`)) return true;
  }
  return false;
}

function classifyHostScopeReason(hostname: string, scopeDomains: string[]): ScopeExclusionReason | null {
  const host = normalizeHost(hostname).replace(/^www\./, '');
  if (!host) return 'scope_excluded_domain';
  const inScope = isHostWithinScope(host, scopeDomains);
  const matchesPattern = SHARED_NOISE_PATTERNS.some((pattern) => pattern.test(host));
  const matchesSuffix = SHARED_NOISE_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  const sharedNoise = matchesPattern || matchesSuffix;
  if (sharedNoise && !inScope) return 'scope_excluded_shared_noise';
  if (!inScope) return 'scope_excluded_domain';
  return null;
}

function isIpWithinScopeRules(ip: string, ipScopeRules: MonitoredScopeRule[]): boolean {
  const candidate = String(ip || '').trim().toLowerCase();
  if (!candidate) return false;
  for (const rule of ipScopeRules || []) {
    const entryType = String(rule?.entry_type || '').toLowerCase();
    if (!['single', 'range', 'cidr'].includes(entryType)) continue;
    const input = String(rule?.input_value || '').trim().toLowerCase();
    const start = String(rule?.ip_start || '').trim().toLowerCase();
    const end = String(rule?.ip_end || '').trim().toLowerCase();
    if (entryType === 'single') {
      if (candidate === input || candidate === start) return true;
      continue;
    }
    if (isIpInRange(candidate, start, end)) return true;
  }
  return false;
}

function getScopeReasonFromAsset(
  asset: any,
  scopeDomains: string[],
  ipScopeRules: MonitoredScopeRule[],
): ScopeExclusionReason | null {
  const backendExcluded = Boolean(asset?.raw?._scope_excluded);
  const backendReason = String(asset?.raw?._scope_exclusion_reason || '').trim().toLowerCase();
  if (backendExcluded) {
    return (backendReason as ScopeExclusionReason) || 'scope_excluded_domain';
  }

  const assetType = String(asset?.asset_type || '').toLowerCase();
  const ipCandidate = String(asset?.ip || asset?.raw?.ip || '').trim().toLowerCase();
  const value = String(asset?.asset_value || '').trim().toLowerCase();

  if (assetType === 'ip' || assetType === 'open_port' || isIpv4(value) || isIpv6(value)) {
    const ipValue = ipCandidate || (assetType === 'open_port' ? value.split(':')[0] : value);
    if (ipValue && !isIpWithinScopeRules(ipValue, ipScopeRules)) return 'scope_excluded_ip';
    return null;
  }

  const hostCandidate = String(asset?.hostname || parseHostname(value) || value).trim().toLowerCase();
  if (!hostCandidate) return 'scope_excluded_domain';
  return classifyHostScopeReason(hostCandidate, scopeDomains);
}

function getScopeReasonFromFinding(
  finding: any,
  scopeDomains: string[],
  ipScopeRules: MonitoredScopeRule[],
): ScopeExclusionReason | null {
  const backendExcluded = Boolean(finding?.evidence?._scope_excluded);
  const backendReason = String(finding?.evidence?._scope_exclusion_reason || '').trim().toLowerCase();
  if (backendExcluded) {
    return (backendReason as ScopeExclusionReason) || 'scope_excluded_domain';
  }
  const ipCandidate = String(finding?.ip || finding?.evidence?.ip || '').trim().toLowerCase();
  if (ipCandidate && (isIpv4(ipCandidate) || isIpv6(ipCandidate))) {
    if (!isIpWithinScopeRules(ipCandidate, ipScopeRules)) return 'scope_excluded_ip';
  }
  const hostCandidate =
    parseHostname(String(finding?.affected_url || '')) ||
    parseHostname(String(finding?.affected_asset || '')) ||
    '';
  if (hostCandidate) {
    return classifyHostScopeReason(hostCandidate, scopeDomains);
  }
  return null;
}

function normalizeAssetLabel(value: string): string {
  const raw = String(value || '')
    .replace(/\b(?:shodan|urlscan|web\s*-?\s*check|pentest\s*-?\s*tools?)\b/gi, ' ')
    .replace(/\bscope completo in monitoraggio\s*\(\d+\s*target\)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!raw) return '';
  if (isIpv4(raw)) return raw;
  const looseIpv4 = raw.match(IPV4_LOOSE_REGEX);
  if (looseIpv4?.[0]) return looseIpv4[0];
  const looseIpv6 = raw.match(IPV6_LOOSE_REGEX);
  if (looseIpv6?.[0]) return looseIpv6[0];
  const host = parseHostname(raw);
  if (host) return host;
  return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim().toLowerCase();
}

function isScopeAggregateLabel(value: unknown): boolean {
  return /scope completo in monitoraggio/i.test(String(value || ''));
}

function resolveSpecificAssetTarget(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (isScopeAggregateLabel(candidate)) continue;
    const normalized = normalizeAssetLabel(String(candidate || ''));
    if (!normalized) continue;
    const inferred = inferAssetType(normalized);
    if (inferred === 'domain' || inferred === 'subdomain' || inferred === 'ip' || inferred === 'url') {
      return normalized;
    }
  }
  return '';
}

function isValidCveAssetLabel(value: string): boolean {
  const normalized = normalizeAssetLabel(value);
  if (!normalized) return false;
  const inferred = inferAssetType(normalized);
  return inferred === 'domain' || inferred === 'subdomain' || inferred === 'ip';
}

function inferAssetType(value: string, hint?: string | null): 'domain' | 'subdomain' | 'ip' | 'url' | 'range' | 'asset' {
  const hinted = String(hint || '').toLowerCase();
  if (hinted === 'range') return 'range';
  if (hinted === 'domain' || hinted === 'subdomain' || hinted === 'ip' || hinted === 'url') {
    return hinted;
  }
  const normalized = normalizeAssetLabel(value);
  if (!normalized) return 'asset';
  if (isIpv4(normalized)) return 'ip';
  if (/^https?:\/\//i.test(String(value || ''))) return 'url';
  const labels = normalized.split('.').filter(Boolean);
  if (labels.length >= 3) return 'subdomain';
  if (labels.length >= 2) return 'domain';
  return 'asset';
}

function parseDmarcPolicy(record: string): string | null {
  const m = String(record || '').match(/(?:^|;)\s*p=([a-zA-Z]+)/i);
  if (!m) return null;
  return String(m[1] || '').toLowerCase();
}

function normalizeHost(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, 'www.');
}

function subdomainDepth(host: string, rootDomain: string): number {
  const h = normalizeHost(host);
  const root = normalizeHost(rootDomain);
  if (!h || !root || h === root || !h.endsWith(`.${root}`)) return 0;
  return h.slice(0, -(root.length + 1)).split('.').filter(Boolean).length;
}

// Mappa euristica CVE → categoria assessment NIS2 (14 categorie ufficiali)
function inferCategoryFromCwe(cweIds: string[] | null, title: string): string {
  const cwes = (cweIds ?? []).map((c) => String(c).toUpperCase());
  const t = (title || '').toLowerCase();
  const has = (xs: string[]) => xs.some((c) => cwes.includes(c));
  if (has(['CWE-287','CWE-798','CWE-522','CWE-306','CWE-307','CWE-862','CWE-863']) || /auth|login|credential|privilege/.test(t))
    return 'Gestione delle identità Gestione degli accessi';
  if (has(['CWE-310','CWE-311','CWE-326','CWE-327','CWE-330']) || /crypt|tls|ssl|cipher/.test(t))
    return 'Crittografia';
  if (has(['CWE-79','CWE-89','CWE-22','CWE-78','CWE-77','CWE-94','CWE-502','CWE-434','CWE-918']) || /injection|xss|rce|deserial|upload/.test(t))
    return 'Sviluppo software';
  if (has(['CWE-200','CWE-209','CWE-538']) || /information disclosure|leak/.test(t))
    return 'Gestione delle risorse';
  if (/dos|denial of service|exhaust|overflow/.test(t) || has(['CWE-400','CWE-770']))
    return 'Network Security Best Practices & Operations';
  // Default: i KEV sono per definizione vulnerabilità note → patching/manutenzione
  return 'Manutenzione e miglioramento continuo';
}

function priorityFromCvss(cvss: number | null): { priority: string; color: string } {
  const s = Number(cvss ?? 0);
  if (s >= 9) return { priority: 'critical', color: '#DC2626' };
  if (s >= 7) return { priority: 'high', color: '#EA580C' };
  if (s >= 4) return { priority: 'medium', color: '#EAB308' };
  return { priority: 'low', color: '#22C55E' };
}

function redactTechnologyMentions(value: string): string {
  let out = String(value || '');
  out = out
    .replace(/\b(?:shodan|urlscan|web\s*-?\s*check|pentest\s*-?\s*tools?)\b/gi, 'SurfaceScan360');
  for (const token of TECHNOLOGY_TOKENS) out = out.replace(token, 'componente tecnologica');
  return out.replace(/\s{2,}/g, ' ').trim();
}

function extractCvesFromText(value: string): string[] {
  const matches = String(value || '').toUpperCase().match(CVE_REGEX) ?? [];
  return Array.from(new Set(matches));
}

function toTextSummary(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    return redactTechnologyMentions(value);
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  const asArray = (k: string) => (Array.isArray(obj[k]) ? (obj[k] as unknown[]) : []);
  const asString = (k: string) => String(obj[k] ?? '').trim();
  const boolText = (input: unknown) => (input ? 'sì' : 'no');

  const status = asString('status') || asString('state');
  if (status) parts.push(`Stato: ${status}`);
  const scanId = asString('scan_id');
  if (scanId) parts.push(`Scan ID: ${scanId}`);
  const toolId = asString('tool_id');
  if (toolId) parts.push(`Controllo ID: ${toolId}`);
  const outputType = asString('output_type');
  if (outputType) parts.push(`Output: ${outputType}`);
  if (obj['progress'] != null && String(obj['progress']).trim() !== '') {
    const progress = Number(obj['progress']);
    parts.push(
      Number.isFinite(progress)
        ? `Progresso: ${Math.max(0, Math.min(100, Math.round(progress)))}%`
        : `Progresso: ${String(obj['progress'])}`,
    );
  }
  if (obj['output_collected'] != null) {
    parts.push(`Output raccolto: ${boolText(obj['output_collected'])}`);
  }
  const label = asString('label');
  if (label) parts.push(`Etichetta: ${label}`);

  const ip = asString('ip') || asString('ip_address') || asString('host_ip');
  if (ip) parts.push(`IP: ${ip}`);
  const host = asString('host') || asString('hostname') || asString('domain') || asString('target');
  if (host) parts.push(`Host: ${host}`);
  const asn = asString('asn');
  if (asn) parts.push(`ASN: ${asn}`);
  const org = asString('org');
  if (org) parts.push(`Rete: ${org}`);
  const city = asString('city');
  const country = asString('country');
  if (city || country) parts.push(`Posizione: ${[city, country].filter(Boolean).join(', ')}`);

  const ports = [...asArray('ports'), ...asArray('open_ports')]
    .map((p) => Number(p))
    .filter((p) => Number.isFinite(p));
  if (ports.length > 0) {
    parts.push(`Porte esposte rilevate: ${[...new Set(ports)].slice(0, 15).join(', ')}`);
  }
  const hostnames = asArray('hostnames')
    .map((h) => String(h || '').trim())
    .filter(Boolean);
  if (hostnames.length > 0) {
    parts.push(`Host correlati: ${hostnames.slice(0, 5).join(', ')}`);
  }
  if (Array.isArray(obj['data'])) {
    const rows = (obj['data'] as unknown[])
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return '';
        const row = entry as Record<string, unknown>;
        const port = String(row.port ?? '').trim();
        const transport = String(row.transport ?? row.protocol ?? '').trim().toLowerCase();
        const service = String(row.service ?? row.product ?? '').trim();
        const version = String(row.version ?? '').trim();
        const portProto = [port, transport].filter(Boolean).join('/');
        const details = [service, version].filter(Boolean).join(' ');
        return [portProto, details].filter(Boolean).join(' ');
      })
      .filter(Boolean);
    if (rows.length > 0) {
      parts.push(`Servizi osservati: ${rows.slice(0, 6).join(' | ')}`);
    }
  }

  if (obj['has_mx'] != null) parts.push(`MX presenti: ${boolText(obj['has_mx'])}`);
  if (obj['has_spf'] != null) parts.push(`SPF presente: ${boolText(obj['has_spf'])}`);
  if (obj['has_dmarc'] != null) parts.push(`DMARC presente: ${boolText(obj['has_dmarc'])}`);
  if (obj['has_bimi'] != null) parts.push(`BIMI presente: ${boolText(obj['has_bimi'])}`);
  if (obj['has_dkim'] != null) parts.push(`DKIM presente: ${boolText(obj['has_dkim'])}`);

  const spfRecords = asArray('spf_records').map((entry) => String(entry || '').trim()).filter(Boolean);
  if (spfRecords.length > 0) parts.push(`SPF: ${spfRecords.slice(0, 2).join(' ; ')}`);
  const dmarcRecords = asArray('dmarc_records').map((entry) => String(entry || '').trim()).filter(Boolean);
  if (dmarcRecords.length > 0) parts.push(`DMARC: ${dmarcRecords.slice(0, 2).join(' ; ')}`);
  const dkimSelectors = asArray('dkim_selectors_found').map((entry) => String(entry || '').trim()).filter(Boolean);
  if (dkimSelectors.length > 0) parts.push(`Selector DKIM trovati: ${dkimSelectors.slice(0, 6).join(', ')}`);

  const performance = Number(obj['performance']);
  const accessibility = Number(obj['accessibility']);
  const bestPractices = Number(obj['best_practices']);
  const seo = Number(obj['seo']);
  if (Number.isFinite(performance) || Number.isFinite(accessibility) || Number.isFinite(bestPractices) || Number.isFinite(seo)) {
    const q: string[] = [];
    if (Number.isFinite(performance)) q.push(`Performance ${Math.round(performance)}`);
    if (Number.isFinite(accessibility)) q.push(`Accessibility ${Math.round(accessibility)}`);
    if (Number.isFinite(bestPractices)) q.push(`Best practices ${Math.round(bestPractices)}`);
    if (Number.isFinite(seo)) q.push(`SEO ${Math.round(seo)}`);
    if (q.length > 0) parts.push(`Quality: ${q.join(' · ')}`);
  }

  if (obj['type']) {
    parts.push(`Contesto: ${String(obj['type'])}`);
  }
  if (obj['multi_tenant'] != null) {
    parts.push(`Multi-tenant: ${obj['multi_tenant'] ? 'sì' : 'no'}`);
  }
  if (obj['total'] != null) {
    parts.push(`Risultati storici trovati: ${String(obj['total'])}`);
  }
  if (parts.length === 0) return '';
  return redactTechnologyMentions(parts.join(' · '));
}

function isPlaceholderSummary(value: string): boolean {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return text.includes('nessun campo tecnico valorizzato nel payload corrente')
    || text.includes('nessuna evidenza disponibile')
    || text.includes('dati tecnici disponibili:')
    || text === 'n/d'
    || text === 'nessun dato';
}

function mapIntelCategory(provider: string): string {
  const key = String(provider || '').toLowerCase();
  if (key.includes('pentest')) return 'Validazione esposizione e vulnerabilità';
  if (key.includes('shodan')) return 'Esposizione servizi pubblici';
  if (key.includes('urlscan')) return 'Comportamento applicativo esterno';
  if (key.includes('dns') || key.includes('mail')) return 'Postura DNS e posta';
  if (key.includes('security_headers') || key.includes('http')) return 'Configurazione sicurezza web';
  if (key.includes('hosting')) return 'Classificazione contesto hosting';
  return 'Evidenze esterne';
}

function normalizeRiskLevelFromScore(score: number): 'Critico' | 'Alto' | 'Medio' | 'Basso' {
  if (score <= 30) return 'Critico';
  if (score <= 50) return 'Alto';
  if (score <= 75) return 'Medio';
  return 'Basso';
}

function computeRiskScoreFromSeverity(sevCount: Record<string, number>): number {
  const crit = Number(sevCount.critical || 0);
  const high = Number(sevCount.high || 0);
  const med = Number(sevCount.medium || 0);
  const low = Number(sevCount.low || 0);
  const info = Number(sevCount.info || 0);
  const penalty = crit * 22 + high * 12 + med * 6 + low * 2 + info;
  return Math.max(5, Math.min(100, 100 - penalty));
}

const OWASP_TOP10_2021: Record<string, string> = {
  'A01:2021': 'Broken Access Control',
  'A02:2021': 'Cryptographic Failures',
  'A03:2021': 'Injection',
  'A04:2021': 'Insecure Design',
  'A05:2021': 'Security Misconfiguration',
  'A06:2021': 'Vulnerable & Outdated Components',
  'A07:2021': 'Identification & Authentication Failures',
  'A08:2021': 'Software & Data Integrity Failures',
  'A09:2021': 'Security Logging & Monitoring Failures',
  'A10:2021': 'Server-Side Request Forgery',
};

const FINDING_TAXONOMY: Record<string, { cwe: string; owasp: string; baselineCvss: number }> = {
  missing_referrer_policy: { cwe: 'CWE-200', owasp: 'A01:2021', baselineCvss: 3.1 },
  missing_xfo: { cwe: 'CWE-1021', owasp: 'A05:2021', baselineCvss: 5.4 },
  missing_xcto: { cwe: 'CWE-79', owasp: 'A03:2021', baselineCvss: 4.3 },
  missing_x_content_type_options: { cwe: 'CWE-79', owasp: 'A03:2021', baselineCvss: 4.3 },
  missing_csp: { cwe: 'CWE-1021', owasp: 'A05:2021', baselineCvss: 6.1 },
  missing_hsts: { cwe: 'CWE-319', owasp: 'A02:2021', baselineCvss: 5.9 },
  weak_hsts: { cwe: 'CWE-319', owasp: 'A02:2021', baselineCvss: 4.0 },
  missing_permissions_policy: { cwe: 'CWE-693', owasp: 'A05:2021', baselineCvss: 3.1 },
  server_header_leak: { cwe: 'CWE-200', owasp: 'A05:2021', baselineCvss: 2.7 },
  server_header_exposed: { cwe: 'CWE-200', owasp: 'A05:2021', baselineCvss: 2.7 },
  x_powered_by_leak: { cwe: 'CWE-200', owasp: 'A05:2021', baselineCvss: 2.7 },
  x_powered_by_exposed: { cwe: 'CWE-200', owasp: 'A05:2021', baselineCvss: 2.7 },
  missing_framing_protection: { cwe: 'CWE-1021', owasp: 'A05:2021', baselineCvss: 5.4 },
  spf_missing: { cwe: 'CWE-290', owasp: 'A07:2021', baselineCvss: 5.3 },
  spf_weak: { cwe: 'CWE-290', owasp: 'A07:2021', baselineCvss: 4.3 },
  dmarc_missing: { cwe: 'CWE-290', owasp: 'A07:2021', baselineCvss: 5.3 },
  dmarc_weak: { cwe: 'CWE-290', owasp: 'A07:2021', baselineCvss: 4.3 },
  dkim_missing: { cwe: 'CWE-290', owasp: 'A07:2021', baselineCvss: 4.3 },
  dnssec_missing: { cwe: 'CWE-345', owasp: 'A08:2021', baselineCvss: 4.0 },
  cookie_missing_secure: { cwe: 'CWE-614', owasp: 'A02:2021', baselineCvss: 5.4 },
  cookie_missing_httponly: { cwe: 'CWE-1004', owasp: 'A05:2021', baselineCvss: 5.4 },
  cookie_missing_samesite: { cwe: 'CWE-1275', owasp: 'A05:2021', baselineCvss: 4.3 },
  open_directory_listing: { cwe: 'CWE-548', owasp: 'A05:2021', baselineCvss: 5.3 },
  exposed_admin_panel: { cwe: 'CWE-284', owasp: 'A01:2021', baselineCvss: 7.5 },
  sensitive_file_exposed: { cwe: 'CWE-538', owasp: 'A01:2021', baselineCvss: 7.5 },
  outdated_software: { cwe: 'CWE-1104', owasp: 'A06:2021', baselineCvss: 6.5 },
  default_credentials: { cwe: 'CWE-798', owasp: 'A07:2021', baselineCvss: 9.8 },
  open_port_exposed: { cwe: 'CWE-284', owasp: 'A05:2021', baselineCvss: 5.8 },
  service_fingerprint_exposed: { cwe: 'CWE-200', owasp: 'A05:2021', baselineCvss: 3.3 },
  shodan_cve_signal: { cwe: 'CWE-1104', owasp: 'A06:2021', baselineCvss: 6.8 },
  shodan_cve_signal_domain: { cwe: 'CWE-1104', owasp: 'A06:2021', baselineCvss: 6.8 },
  shodan_cve_signal_ip: { cwe: 'CWE-1104', owasp: 'A06:2021', baselineCvss: 7.2 },
  shodan_cve_signal_unattributed: { cwe: 'CWE-200', owasp: 'A05:2021', baselineCvss: 3.5 },
};

function taxonomyForFindingType(findingType: string | null | undefined): { cwe: string; owasp: string; owasp_label: string; baselineCvss: number } | null {
  const key = String(findingType || '').toLowerCase();
  const base = FINDING_TAXONOMY[key];
  if (!base) return null;
  return {
    cwe: base.cwe,
    owasp: base.owasp,
    owasp_label: OWASP_TOP10_2021[base.owasp] || base.owasp,
    baselineCvss: base.baselineCvss,
  };
}

function normalizeScanStatus(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'completed' || s === 'partial' || s === 'failed' || s === 'running' || s === 'queued') return s;
  return 'unknown';
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchRowsByJobIds(
  supabase: any,
  table: string,
  select: string,
  jobIds: string[],
  options?: {
    orderBy?: string;
    ascending?: boolean;
    pageSize?: number;
    maxRows?: number;
  },
): Promise<any[]> {
  if (!Array.isArray(jobIds) || jobIds.length === 0) return [];
  const pageSize = Math.max(100, Math.min(2000, Number(options?.pageSize || 1000)));
  const maxRows = Math.max(pageSize, Number(options?.maxRows || 25000));
  const chunks = chunkArray(jobIds.filter(Boolean), 120);
  const allRows: any[] = [];

  for (const chunk of chunks) {
    let from = 0;
    while (allRows.length < maxRows) {
      let query = supabase
        .from(table)
        .select(select)
        .in('scan_job_id', chunk)
        .range(from, from + pageSize - 1);

      if (options?.orderBy) {
        query = query.order(options.orderBy, { ascending: Boolean(options?.ascending) });
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) break;
      allRows.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    if (allRows.length >= maxRows) break;
  }

  if (allRows.length <= maxRows) return allRows;
  return allRows.slice(0, maxRows);
}

function buildConsultingRecommendations(input: {
  findings: any[];
  assets: any[];
  monitoredScope: any[];
  discoveredSubdomains: any[];
}): Array<{ priority: number; title: string; rationale: string; action: string; affected_assets: string[]; severity: string }> {
  const findings = input.findings || [];
  const assets = input.assets || [];
  const monitoredScope = input.monitoredScope || [];
  const discoveredSubdomains = input.discoveredSubdomains || [];
  const byType = new Set(findings.map((f: any) => String(f.finding_type || '').toLowerCase()));
  const criticalFindings = findings.filter((f: any) => String(f.severity || '').trim().toLowerCase() === 'critical');
  const affectedAssets = Array.from(
    new Set(
      findings
        .map((f: any) => String(f.affected_asset || f.affected_url || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, TOP_RECOMMENDATIONS_LIMIT);
  const criticalAssets = Array.from(
    new Set(
      criticalFindings
        .map((f: any) => String(f.affected_asset || f.affected_url || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, TOP_RECOMMENDATIONS_LIMIT);

  const out: Array<{ priority: number; title: string; rationale: string; action: string; affected_assets: string[]; severity: string }> = [];

  if (criticalFindings.length > 0) {
    out.push({
      priority: 1,
      title: 'Gestire immediatamente i finding critici',
      rationale: `Sono presenti ${criticalFindings.length} finding critici che richiedono una risposta operativa prioritaria e verificabile.`,
      action: 'Avviare remediation immediata sui sistemi coinvolti, applicare misure compensative temporanee e validare la chiusura con riesecuzione della scansione.',
      affected_assets: criticalAssets.length > 0 ? criticalAssets : affectedAssets,
      severity: 'critical',
    });
  }

  out.push({
    priority: 1,
    title: 'Ridurre immediatamente l’esposizione ad alta priorità',
    rationale: 'Sono presenti evidenze con severità elevata o media che aumentano la superficie d’attacco esterna.',
    action: 'Definire una finestra di remediation rapida, confermare ownership degli asset coinvolti e chiudere prima i punti più esposti.',
    affected_assets: affectedAssets,
    severity: 'high',
  });

  if (findings.some((f: any) => Array.isArray(f.cve) && f.cve.length > 0)) {
    out.push({
      priority: 2,
      title: 'Prioritizzare patching e mitigazioni CVE confermate',
      rationale: 'La presenza di CVE richiede una gestione ordinata per ridurre rischio operativo e reputazionale.',
      action: 'Ordinare le CVE per severità e impatto business, applicare patch o compensating control e validare il risultato con nuova verifica.',
      affected_assets: affectedAssets,
      severity: 'high',
    });
  }

  if (byType.has('open_port_exposed') || byType.has('service_fingerprint_exposed')) {
    out.push({
      priority: 3,
      title: 'Limitare servizi pubblicamente raggiungibili',
      rationale: 'Porte o servizi esposti aumentano il rischio di ricognizione e abuso.',
      action: 'Applicare regole ACL/firewall, rimuovere servizi non necessari e restringere l’accesso a sorgenti autorizzate.',
      affected_assets: affectedAssets,
      severity: 'medium',
    });
  }

  if (
    byType.has('missing_csp') ||
    byType.has('missing_hsts') ||
    byType.has('missing_x_content_type_options') ||
    byType.has('missing_framing_protection')
  ) {
    out.push({
      priority: 4,
      title: 'Rafforzare baseline di sicurezza applicativa',
      rationale: 'Header e controlli web incompleti favoriscono attacchi opportunistici su asset Internet-facing.',
      action: 'Applicare baseline standard sui controlli HTTP di sicurezza e rieseguire la validazione di conformità tecnica.',
      affected_assets: affectedAssets,
      severity: 'medium',
    });
  }

  out.push({
    priority: 5,
    title: 'Governare scope e discovery continuativa',
    rationale: 'L’efficacia del monitoraggio dipende da uno scope aggiornato e dalla visibilità dei sottodomini.',
    action: `Mantenere allineato lo scope (${monitoredScope.length} regole attive), verificare i sottodomini scoperti (${discoveredSubdomains.length}) e programmare riesecuzioni periodiche.`,
    affected_assets: assets.slice(0, TOP_RECOMMENDATIONS_LIMIT).map((a: any) => String(a.asset_value || a.hostname || a.ip || '').trim()).filter(Boolean),
    severity: 'low',
  });

  const unique: typeof out = [];
  const seen = new Set<string>();
  for (const entry of out) {
    const key = entry.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique.slice(0, TOP_RECOMMENDATIONS_LIMIT).map((entry, index) => ({ ...entry, priority: index + 1 }));
}

function buildOperationalPrioritiesByAsset(input: {
  assetMatrix: Array<{
    asset: string;
    asset_type: string;
    related_ips: string[];
    findings_total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    cve_count: number;
    open_ports_count: number;
  }>;
  fallbackAssets: string[];
}): Array<{ priority: number; title: string; rationale: string; action: string; affected_assets: string[]; severity: string }> {
  const rows = [...(input.assetMatrix || [])];
  rows.sort((a, b) => {
    const scoreA = a.critical * 40 + a.high * 25 + a.medium * 10 + a.cve_count * 8 + a.open_ports_count * 6 + a.low * 2 + a.info;
    const scoreB = b.critical * 40 + b.high * 25 + b.medium * 10 + b.cve_count * 8 + b.open_ports_count * 6 + b.low * 2 + b.info;
    return scoreB - scoreA;
  });

  const selected = rows.filter((row) => row.findings_total > 0 || row.open_ports_count > 0 || row.cve_count > 0).slice(0, TOP_RECOMMENDATIONS_LIMIT);
  const out = selected.map((row, index) => {
    const hasCve = row.cve_count > 0;
    const hasOpenPorts = row.open_ports_count > 0;
    const highRisk = row.critical > 0 || row.high > 0;
    const severity = highRisk ? 'high' : row.medium > 0 ? 'medium' : 'low';
    const keyRisks: string[] = [];
    if (row.critical > 0) keyRisks.push(`${row.critical} finding critici`);
    if (row.high > 0) keyRisks.push(`${row.high} finding alti`);
    if (row.medium > 0) keyRisks.push(`${row.medium} finding medi`);
    if (hasCve) keyRisks.push(`${row.cve_count} CVE associate`);
    if (hasOpenPorts) keyRisks.push(`${row.open_ports_count} porte esposte`);

    const actionParts: string[] = [];
    if (hasOpenPorts) {
      actionParts.push('verificare necessità delle porte esposte e limitare accesso con ACL/firewall');
    }
    if (hasCve) {
      actionParts.push('prioritizzare patching/misure compensative sulle CVE collegate');
    }
    if (row.medium + row.high + row.critical > 0) {
      actionParts.push('chiudere prima i finding a severità più alta e rieseguire la validazione');
    }
    if (actionParts.length === 0) {
      actionParts.push('mantenere monitoraggio continuo e verificare periodicamente la postura');
    }

    const scopeRefs = row.related_ips.length > 0 ? `${row.asset} (${row.related_ips.join(', ')})` : row.asset;
    return {
      priority: index + 1,
      title: `Priorità operativa su ${row.asset}`,
      rationale: `Asset ${scopeRefs}: ${keyRisks.join(', ') || 'nessun rischio prioritario rilevato'}.`,
      action: `Per ${scopeRefs}: ${actionParts.join('; ')}.`,
      affected_assets: [row.asset, ...row.related_ips].filter(Boolean).slice(0, 10),
      severity,
    };
  });

  while (out.length < TOP_RECOMMENDATIONS_LIMIT) {
    const fallback = input.fallbackAssets[out.length] || input.fallbackAssets[0] || 'perimetro monitorato';
    out.push({
      priority: out.length + 1,
      title: `Priorità operativa su ${fallback}`,
      rationale: `Asset ${fallback}: consolidare la postura di sicurezza con verifica periodica delle evidenze.`,
      action: `Per ${fallback}: eseguire riesecuzione della scansione, validare remediation aperte e aggiornare lo scope monitorato.`,
      affected_assets: [fallback],
      severity: 'low',
    });
  }

  return out.slice(0, TOP_RECOMMENDATIONS_LIMIT).map((item, idx) => ({ ...item, priority: idx + 1 }));
}

function buildFallbackAiReport(input: {
  orgName: string;
  target: string;
  sevCount: Record<string, number>;
  findings: any[];
  assets: any[];
  monitoredScope: any[];
  discoveredSubdomains: any[];
}): any {
  const score = computeRiskScoreFromSeverity(input.sevCount);
  const level = normalizeRiskLevelFromScore(score);
  const totalFindings = Object.values(input.sevCount || {}).reduce((sum, v) => sum + Number(v || 0), 0);
  const recommendations = buildConsultingRecommendations({
    findings: input.findings,
    assets: input.assets,
    monitoredScope: input.monitoredScope,
    discoveredSubdomains: input.discoveredSubdomains,
  });

  const critical = Number(input.sevCount.critical || 0);
  const high = Number(input.sevCount.high || 0);
  const medium = Number(input.sevCount.medium || 0);
  const subCount = input.discoveredSubdomains.length;
  const scopeCount = input.monitoredScope.length;

  return {
    executive_summary:
      `La valutazione dell’esposizione esterna per ${input.orgName || 'l’organizzazione'} sul target ${input.target || 'selezionato'} ` +
      `mostra ${totalFindings} evidenze totali (critiche: ${critical}, alte: ${high}, medie: ${medium}). ` +
      `Lo scope monitorato include ${scopeCount} regole e sono stati rilevati ${subCount} sottodomini nel perimetro osservato. ` +
      `La priorità operativa è ridurre i punti più esposti e consolidare i controlli di sicurezza sugli asset pubblici.`,
    risk_score: score,
    risk_level: level,
    top_recommendations: recommendations,
    correlations: [
      `La severità massima rilevata è ${critical > 0 ? 'critica' : high > 0 ? 'alta' : medium > 0 ? 'media' : 'bassa/informativa'}.`,
      `Le evidenze su asset Internet-facing suggeriscono un approccio di remediation progressivo per priorità.`,
      `L’ampliamento o variazione del perimetro (scope/subdomini) incide direttamente sul volume dei risultati rilevati.`,
    ],
    compliance_notes:
      'Le azioni prioritarie supportano i principi di gestione del rischio, hardening continuo e riduzione dell’esposizione richiesti dai framework NIS2 e dalle buone pratiche di sicurezza.',
  };
}

function sanitizeAiReport(report: any, fallback: any, sevCount: Record<string, number> = {}): any {
  const safe = report && typeof report === 'object' ? { ...report } : {};
  const normalized = {
    executive_summary: redactTechnologyMentions(String(safe.executive_summary || fallback.executive_summary || '')),
    risk_score: Number.isFinite(Number(safe.risk_score)) ? Number(safe.risk_score) : Number(fallback.risk_score || 50),
    risk_level: String(safe.risk_level || '').trim() || fallback.risk_level || 'Medio',
    top_recommendations: Array.isArray(safe.top_recommendations) ? safe.top_recommendations : fallback.top_recommendations,
    correlations: Array.isArray(safe.correlations) ? safe.correlations : fallback.correlations,
    compliance_notes: redactTechnologyMentions(String(safe.compliance_notes || fallback.compliance_notes || '')),
  };
  normalized.risk_score = Math.max(0, Math.min(100, normalized.risk_score));
  normalized.risk_level = normalizeRiskLevelFromScore(normalized.risk_score);
  const criticalCount = Number(sevCount.critical || 0);
  normalized.top_recommendations = (normalized.top_recommendations || [])
    .slice(0, TOP_RECOMMENDATIONS_LIMIT)
    .map((item: any, idx: number) => ({
      priority: idx + 1,
      title: redactTechnologyMentions(String(item?.title || `Raccomandazione ${idx + 1}`)),
      rationale: redactTechnologyMentions(String(item?.rationale || '')),
      action: redactTechnologyMentions(String(item?.action || '')),
      affected_assets: Array.isArray(item?.affected_assets) ? item.affected_assets.slice(0, 10) : [],
      severity: String(item?.severity || 'medium').toLowerCase(),
    }));
  if (
    criticalCount > 0 &&
    !normalized.top_recommendations.some((item: any) => String(item?.severity || '').toLowerCase() === 'critical')
  ) {
    normalized.top_recommendations.unshift({
      priority: 1,
      title: 'Gestire immediatamente i finding critici',
      rationale: `Sono presenti ${criticalCount} finding critici che richiedono mitigazioni immediate e tracciate.`,
      action: 'Aprire piano di remediation urgente, applicare workaround temporanei e rieseguire scansione di validazione entro la finestra concordata.',
      affected_assets: [],
      severity: 'critical',
    });
  }
  while (normalized.top_recommendations.length < TOP_RECOMMENDATIONS_LIMIT) {
    normalized.top_recommendations.push(
      fallback.top_recommendations[normalized.top_recommendations.length] || {
        priority: normalized.top_recommendations.length + 1,
        title: `Raccomandazione ${normalized.top_recommendations.length + 1}`,
        rationale: 'Consolidare il piano di miglioramento continuo della sicurezza esterna.',
        action: 'Programmare riesecuzione periodica della scansione e verifica delle remediation aperte.',
        affected_assets: [],
        severity: 'low',
      },
    );
  }
  normalized.top_recommendations = normalized.top_recommendations
    .slice(0, TOP_RECOMMENDATIONS_LIMIT)
    .map((item: any, idx: number) => ({ ...item, priority: idx + 1 }));
  normalized.correlations = (normalized.correlations || [])
    .slice(0, 5)
    .map((item: any) => redactTechnologyMentions(String(item || '')))
    .filter(Boolean);
  return normalized;
}

async function generateKevRemediations(supabase: any, organizationId: string, findings: any[]) {
  // 1) raccogli CVE unici dai findings
  const allCves = Array.from(new Set(findings.flatMap((f) => (f.cve ?? [])).map((c: string) => String(c).toUpperCase()).filter(Boolean)));
  if (allCves.length === 0) return { created: 0, total_kev: 0, existing: 0 };

  // 2) filtra KEV via cve_intel_cache
  const { data: intel } = await supabase
    .from('cve_intel_cache')
    .select('cve_id, cvss_v3_score, cwe_ids, kev_due_date, kev_required_action, description')
    .in('cve_id', allCves)
    .eq('cisa_kev', true);
  const kevList = intel ?? [];
  if (kevList.length === 0) return { created: 0, total_kev: 0, existing: 0 };

  // 3) trova già esistenti per evitare duplicati
  const { data: existing } = await supabase
    .from('remediation_tasks')
    .select('source_ref')
    .eq('organization_id', organizationId)
    .eq('source', 'cisa_kev');
  const have = new Set((existing ?? []).map((r: any) => r.source_ref));

  // 4) costruisci righe da inserire
  const today = new Date();
  const rows: any[] = [];
  for (const k of kevList) {
    if (have.has(k.cve_id)) continue;
    const cat = inferCategoryFromCwe(k.cwe_ids, k.description || k.cve_id);
    const { priority, color } = priorityFromCvss(k.cvss_v3_score);
    const due = k.kev_due_date ? new Date(k.kev_due_date) : new Date(today.getTime() + 14 * 24 * 3600 * 1000);
    const start = today;
    rows.push({
      organization_id: organizationId,
      task: `[KEV] ${k.cve_id} - ${k.kev_required_action || 'Applicare patch / mitigare vulnerabilità sfruttata attivamente'}`,
      category: cat,
      start_date: start.toISOString().slice(0, 10),
      end_date: due.toISOString().slice(0, 10),
      progress: 0, // pianificato
      priority,
      color,
      assignee: 'IT Security Team',
      source: 'cisa_kev',
      source_ref: k.cve_id,
    });
  }
  if (rows.length === 0) return { created: 0, total_kev: kevList.length, existing: have.size };

  const { error: insErr } = await supabase
    .from('remediation_tasks')
    .upsert(rows, { onConflict: 'organization_id,source,source_ref', ignoreDuplicates: true });
  if (insErr) console.warn('KEV remediation insert failed', insErr.message);
  return { created: rows.length, total_kev: kevList.length, existing: have.size };
}

async function callOpenAi(systemPrompt: string, userPrompt: string) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY non configurata');
  // Sanitize: rimuovi whitespace/newline/caratteri non-ASCII che fanno fallire fetch con
  // "Failed to construct 'Request': 'headers' is not a valid ByteString"
  const cleanKey = OPENAI_API_KEY.trim().replace(/[^\x20-\x7E]/g, '');
  if (!cleanKey) throw new Error('OPENAI_API_KEY contiene solo caratteri non validi');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cleanKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '{}';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const requestedJobId = String((body as any)?.job_id || (body as any)?.scan_job_id || '').trim() || undefined;
    let organization_id = String((body as any)?.organization_id || '').trim() || undefined;
    const triggerSource = String((body as any)?.trigger_source || 'manual').trim() || 'manual';
    const forceRegenerate = Boolean((body as any)?.force_regenerate);
    const requestedCreatedBy = String((body as any)?.created_by || '').trim() || null;
    const scopeMode = String((body as any)?.scope_mode || 'organization_scope').trim().toLowerCase();

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Auth: utente autenticato o chiamata interna sicura (service role/secret)
    const authHeader = req.headers.get('authorization');
    const bearerToken = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    const internalHeaderSecret = req.headers.get('x-surface-internal-secret') || '';
    const isInternalCall =
      (INTERNAL_REPORT_SECRET && internalHeaderSecret === INTERNAL_REPORT_SECRET) ||
      (bearerToken && bearerToken === SERVICE_ROLE);

    let actorUserId: string | null = null;
    if (!isInternalCall) {
      if (!authHeader) return json({ error: 'Autenticazione richiesta' }, 401);
      const { data: userData } = await supabase.auth.getUser(bearerToken);
      if (!userData?.user) return json({ error: 'Token non valido' }, 401);
      actorUserId = userData.user.id;

      if (!organization_id) {
        const { data: u } = await supabase.from('users').select('organization_id').eq('auth_user_id', userData.user.id).maybeSingle();
        organization_id = u?.organization_id ?? undefined;
      }
      if (!organization_id) {
        const { data: cd } = await supabase.from('contact_directory').select('organization_id').eq('auth_user_id', userData.user.id).limit(1).maybeSingle();
        organization_id = cd?.organization_id ?? undefined;
      }
    } else {
      actorUserId = requestedCreatedBy;
    }

    // Se chiamata interna senza organization_id, prova a risolvere dal job.
    if (!organization_id && requestedJobId) {
      const { data: jOrg } = await supabase
        .from('surface_scan_jobs')
        .select('organization_id, customer_id')
        .eq('id', requestedJobId)
        .maybeSingle();
      organization_id = jOrg?.organization_id || jOrg?.customer_id || undefined;
    }

    if (!organization_id) {
      return json({ error: 'organization_id mancante: passa organization_id nel body o associa l\'utente a un\'organizzazione' }, 400);
    }

    // Job set: scope completo organizzazione (default) o singolo job esplicito.
    const { data: scopedJobsData, error: scopedJobsError } = await supabase
      .from('surface_scan_jobs')
      .select('*')
      .or(`organization_id.eq.${organization_id},customer_id.eq.${organization_id}`)
      .in('status', ['completed', 'partial'])
      .order('completed_at', { ascending: false })
      .limit(600);
    if (scopedJobsError) throw scopedJobsError;

    const allCompletedJobs = (scopedJobsData || []).filter((row: any) =>
      ['completed', 'partial'].includes(normalizeScanStatus(String(row?.status || ''))),
    );
    if (allCompletedJobs.length === 0) {
      return json({ error: 'Nessuno scan completato disponibile per l\'organizzazione' }, 404);
    }

    let anchorJob = allCompletedJobs[0];
    if (requestedJobId) {
      const explicitJob = allCompletedJobs.find((entry: any) => String(entry?.id || '') === requestedJobId);
      if (!explicitJob) {
        return json({ error: 'Job richiesto non trovato o non completato nello scope organizzazione' }, 404);
      }
      anchorJob = explicitJob;
    }

    const normalizedScopeMode = scopeMode === 'single_job' ? 'single_job' : 'organization_scope';
    const scopedJobs = normalizedScopeMode === 'single_job' ? [anchorJob] : allCompletedJobs;
    const scopedJobIds = Array.from(new Set(scopedJobs.map((entry: any) => String(entry?.id || '').trim()).filter(Boolean)));
    if (scopedJobIds.length === 0) {
      return json({ error: 'Nessun job valido nello scope del report' }, 404);
    }
    const scopeTargets = Array.from(
      new Set(
        scopedJobs
          .map((entry: any) => String(entry?.raw_target || entry?.normalized_target || '').trim())
          .filter(Boolean),
      ),
    );
    const scopeTargetTypes = Array.from(
      new Set(
        scopedJobs
          .map((entry: any) => String(entry?.target_type || '').trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const scopeProfiles = Array.from(
      new Set(
        scopedJobs
          .map((entry: any) => String(entry?.scan_profile || '').trim())
          .filter(Boolean),
      ),
    );
    const scopeCompletedEpochs = scopedJobs
      .map((entry: any) => new Date(String(entry?.completed_at || entry?.started_at || '')).getTime())
      .filter((ts: number) => Number.isFinite(ts) && ts > 0);
    const scopeStartedEpochs = scopedJobs
      .map((entry: any) => new Date(String(entry?.started_at || entry?.created_at || '')).getTime())
      .filter((ts: number) => Number.isFinite(ts) && ts > 0);
    const scopeCompletedAt = scopeCompletedEpochs.length > 0
      ? new Date(Math.max(...scopeCompletedEpochs)).toISOString()
      : anchorJob?.completed_at || null;
    const scopeStartedAt = scopeStartedEpochs.length > 0
      ? new Date(Math.min(...scopeStartedEpochs)).toISOString()
      : anchorJob?.started_at || null;
    const scopeTargetLabel = normalizedScopeMode === 'single_job'
      ? String(anchorJob?.raw_target || anchorJob?.normalized_target || 'Target selezionato')
      : `Scope completo in monitoraggio (${scopeTargets.length} target)`;

    const isOrganizationScope = normalizedScopeMode === 'organization_scope';
    const [existingCanonicalRowRes, latestSingleReportRowRes] = await Promise.all([
      isOrganizationScope
        ? supabase
            .from('surface_scan_ai_reports')
            .select('id, payload, created_at, title')
            .eq('organization_id', organization_id)
            .in('title', [
              SURFACESCAN_BRAND_TITLE_HICOMPLIANCE,
              SURFACESCAN_BRAND_TITLE_HICONSOLE,
              SURFACESCAN_LEGACY_SCOPE_TITLE,
            ])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
      !isOrganizationScope
        ? supabase
            .from('surface_scan_ai_reports')
            .select('id, payload, created_at, title')
            .eq('organization_id', organization_id)
            .eq('scan_job_id', anchorJob.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);

    const existingCanonicalRow = existingCanonicalRowRes?.data ?? null;
    const latestSingleReportRow = latestSingleReportRowRes?.data ?? null;

    if (!isOrganizationScope && latestSingleReportRow && !forceRegenerate && triggerSource === 'auto_on_complete') {
      return json({
        ok: true,
        existing: true,
        repository_id: latestSingleReportRow.id,
        created_at: latestSingleReportRow.created_at,
        report: latestSingleReportRow.payload,
      });
    }

    const [
      profileRes,
      orgRes,
      monitoredRes,
      subdomainDumpRes,
      rawAssetsAll,
      rawFindingsAll,
      rawIntelAll,
      rawObservationsAll,
      rawExposureFindingsAll,
      rawOpenPortsAll,
      rawWebTechAll,
      rawSslAll,
    ] = await Promise.all([
      supabase.from('organization_profiles').select('*').eq('organization_id', organization_id).maybeSingle(),
      supabase.from('organizations').select('id, name, hicompliance_enabled').eq('id', organization_id).maybeSingle(),
      supabase.from('surface_scan_monitored_ips').select('entry_type, input_value, ip_start, ip_end, discovered_via, discovered_from').eq('organization_id', organization_id),
      supabase.from('subdomain_dumps').select('id, root_domain, depth_limit, total_discovered, total_returned, truncated, sources, results, created_at').eq('organization_id', organization_id).order('created_at', { ascending: false }).limit(50),
      fetchRowsByJobIds(
        supabase,
        'surface_assets',
        'asset_type, asset_value, hostname, ip, source, raw, scan_job_id, first_seen, last_seen',
        scopedJobIds,
        { orderBy: 'last_seen', ascending: false, pageSize: 1000, maxRows: 50000 },
      ),
      fetchRowsByJobIds(
        supabase,
        'surface_findings',
        'provider, module, finding_type, title, description, severity, affected_asset, affected_url, ip, port, protocol, remediation, cve, cwe, cvss, evidence, attribution_confidence, status, created_at, scan_job_id',
        scopedJobIds,
        { orderBy: 'created_at', ascending: false, pageSize: 1000, maxRows: 80000 },
      ),
      fetchRowsByJobIds(
        supabase,
        'surface_external_intel',
        'provider, target, found, summary, raw_response, confidence, created_at, scan_job_id',
        scopedJobIds,
        { orderBy: 'created_at', ascending: false, pageSize: 800, maxRows: 20000 },
      ),
      fetchRowsByJobIds(
        supabase,
        'surface_observations',
        'module, observation_type, title, value, severity, created_at, scan_job_id',
        scopedJobIds,
        { orderBy: 'created_at', ascending: false, pageSize: 1000, maxRows: 40000 },
      ),
      fetchRowsByJobIds(
        supabase,
        'surface_exposure_findings',
        'finding_type, title, severity, cvss, cve_ids, affected_host, affected_port, affected_url, description, evidence, recommendation, source, created_at, scan_job_id',
        scopedJobIds,
        { orderBy: 'created_at', ascending: false, pageSize: 1200, maxRows: 60000 },
      ),
      fetchRowsByJobIds(
        supabase,
        'surface_open_ports',
        'host, ip, port, protocol, service_name, service_product, service_version, exposure_level, remediation_hint, is_web, is_tls, last_seen_at, scan_job_id',
        scopedJobIds,
        { orderBy: 'last_seen_at', ascending: false, pageSize: 1200, maxRows: 60000 },
      ),
      fetchRowsByJobIds(
        supabase,
        'surface_web_technologies',
        'url, host, port, technology_name, technology_version, category, confidence, created_at, scan_job_id',
        scopedJobIds,
        { orderBy: 'created_at', ascending: false, pageSize: 1200, maxRows: 60000 },
      ),
      fetchRowsByJobIds(
        supabase,
        'surface_ssl_results',
        'url, host, port, grade, weak_protocols, weak_ciphers, certificate_subject, certificate_issuer, created_at, scan_job_id',
        scopedJobIds,
        { orderBy: 'created_at', ascending: false, pageSize: 800, maxRows: 20000 },
      ),
    ]);

    const profile = profileRes.data;
    const org = orgRes.data;
    const monitored_scope = monitoredRes.data ?? [];
    const { scopeDomains, ipScopeRules } = splitScopeRules(monitored_scope);
    const scope_guard_summary = {
      in_scope: 0,
      excluded_by_scope: 0,
      excluded_shared_noise: 0,
      excluded_reasons: {} as Record<string, number>,
    };

    const trackScopeReason = (reason: ScopeExclusionReason | null) => {
      if (!reason) {
        scope_guard_summary.in_scope += 1;
        return;
      }
      scope_guard_summary.excluded_reasons[reason] = (scope_guard_summary.excluded_reasons[reason] || 0) + 1;
      if (reason === 'scope_excluded_shared_noise') {
        scope_guard_summary.excluded_shared_noise += 1;
      } else {
        scope_guard_summary.excluded_by_scope += 1;
      }
    };

    const rawAssetsScoped = (rawAssetsAll || []).filter((asset: any) => {
      const reason = getScopeReasonFromAsset(asset, scopeDomains, ipScopeRules);
      trackScopeReason(reason);
      return reason === null;
    });
    const rawAssetsByKey = new Map<string, any>();
    for (const asset of rawAssetsScoped) {
      const key = [
        String(asset?.asset_type || '').toLowerCase(),
        normalizeHost(String(asset?.hostname || asset?.asset_value || '')),
        String(asset?.ip || (asset as any)?.raw?.ip || '').trim().toLowerCase(),
      ].join('|');
      if (!key) continue;
      const current = rawAssetsByKey.get(key);
      const currentTs = new Date(String(current?.last_seen || current?.first_seen || 0)).getTime() || 0;
      const incomingTs = new Date(String(asset?.last_seen || asset?.first_seen || 0)).getTime() || 0;
      if (!current || incomingTs >= currentTs) {
        rawAssetsByKey.set(key, asset);
      }
    }
    const rawAssets = Array.from(rawAssetsByKey.values());
    const subdomain_dumps = (subdomainDumpRes.data ?? []).map((dump: any) => {
      const filteredResults = ((dump?.results ?? []) as any[]).filter((entry: any) => {
        const host = String(entry?.subdomain || '').trim().toLowerCase();
        if (!host) return false;
        const hostReason = classifyHostScopeReason(host, scopeDomains);
        if (hostReason) {
          trackScopeReason(hostReason);
          return false;
        }
        const ip = String(entry?.ip || '').trim().toLowerCase();
        if (ip && !isIpWithinScopeRules(ip, ipScopeRules)) {
          trackScopeReason('scope_excluded_ip');
          return false;
        }
        trackScopeReason(null);
        return true;
      });
      return {
        ...dump,
        total_returned: filteredResults.length,
        results: filteredResults,
      };
    });
    const assetKeys = new Set(rawAssets.map((a: any) => normalizeHost(a.hostname || a.asset_value || a.ip)));
    const discoveredSubdomainAssets = subdomain_dumps.flatMap((dump: any) =>
      ((dump.results ?? []) as any[]).map((r: any) => ({
        asset_type: 'subdomain',
        asset_value: r.subdomain,
        hostname: r.subdomain,
        ip: r.ip,
        source: 'discovery_sottodomini',
        root_domain: dump.root_domain,
        depth: subdomainDepth(r.subdomain, dump.root_domain),
        discovered_at: dump.created_at,
        evidence: {
          root_domain: dump.root_domain,
          country: r.country,
          asn_name: r.asn_name,
          depth_limit: dump.depth_limit,
        },
      }))
    ).filter((a: any) => {
      const key = normalizeHost(a.hostname || a.asset_value);
      if (!key || assetKeys.has(key)) return false;
      const reason = getScopeReasonFromAsset(a, scopeDomains, ipScopeRules);
      trackScopeReason(reason);
      if (reason) return false;
      assetKeys.add(key);
      return true;
    });
    const assets = [...rawAssets, ...discoveredSubdomainAssets];

    const exposureFindingsForMerge = (rawExposureFindingsAll || []).map((finding: any) => ({
      provider: 'surface_exposure_engine',
      module: String(finding?.source || 'surface_exposure_engine'),
      finding_type: finding?.finding_type,
      title: finding?.title,
      description: finding?.description,
      severity: finding?.severity || 'info',
      affected_asset: finding?.affected_host || null,
      affected_url: finding?.affected_url || null,
      ip: null,
      port: finding?.affected_port ?? null,
      protocol: null,
      remediation: finding?.recommendation || null,
      cve: Array.isArray(finding?.cve_ids) ? finding.cve_ids : [],
      cwe: [],
      cvss: finding?.cvss ?? null,
      evidence: finding?.evidence ? { text: finding.evidence } : {},
      attribution_confidence: 'high',
      created_at: finding?.created_at,
      scan_job_id: finding?.scan_job_id,
    }));

    const findingsRaw = ([...(rawFindingsAll || []), ...exposureFindingsForMerge])
      .filter((finding: any) => !['resolved', 'suppressed', 'false_positive', 'accepted_risk'].includes(String(finding?.status || '').toLowerCase()))
      .filter((finding: any) => {
        const reason = getScopeReasonFromFinding(finding, scopeDomains, ipScopeRules);
        trackScopeReason(reason);
        return reason === null;
      })
      .sort((a, b) => {
        const tsA = new Date(String(a?.created_at || 0)).getTime() || 0;
        const tsB = new Date(String(b?.created_at || 0)).getTime() || 0;
        if (tsA !== tsB) return tsB - tsA;
        return (SEV_RANK[String(b?.severity || '').toLowerCase()] ?? 0) - (SEV_RANK[String(a?.severity || '').toLowerCase()] ?? 0);
      });
    const findingDedupMap = new Map<string, any>();
    for (const f of findingsRaw) {
      const cvesFromArray = Array.isArray(f.cve)
        ? f.cve.map((c: unknown) => String(c || '').toUpperCase().trim()).filter(Boolean)
        : [];
      const cvesFromText = extractCvesFromText(
        `${String(f.title || '')} ${String(f.description || '')} ${String(f.remediation || '')}`,
      );
      const cves = Array.from(new Set([...cvesFromArray, ...cvesFromText]));
      const taxonomy = taxonomyForFindingType(String(f.finding_type || ''));
      const cweFromFinding = Array.isArray(f.cwe)
        ? f.cwe.map((entry: unknown) => String(entry || '').trim().toUpperCase()).filter(Boolean)
        : [];
      const cweMerged = Array.from(new Set([
        ...cweFromFinding,
        ...(taxonomy?.cwe ? [taxonomy.cwe] : []),
      ]));
      const resolvedCvss =
        f.cvss != null
          ? Number(f.cvss)
          : cves.length === 0 && taxonomy
            ? Number(taxonomy.baselineCvss)
            : null;
      const normalizedFinding = {
        provider: String(f.provider || '').trim() || null,
        module: String(f.module || '').trim() || null,
        finding_type: String(f.finding_type || '').trim() || null,
        title: redactTechnologyMentions(String(f.title || '')),
        description: redactTechnologyMentions(String(f.description || '')),
        severity: String(f.severity || 'info').toLowerCase(),
        affected_asset: String(f.affected_asset || '').trim() || null,
        affected_url: String(f.affected_url || '').trim() || null,
        ip: String(f.ip || '').trim() || null,
        port: Number.isFinite(Number(f.port)) ? Number(f.port) : null,
        protocol: String(f.protocol || '').trim().toLowerCase() || null,
        remediation: redactTechnologyMentions(String(f.remediation || '')),
        cve: cves,
        cwe: cweMerged,
        owasp: taxonomy?.owasp || null,
        owasp_label: taxonomy?.owasp_label || null,
        cvss: Number.isFinite(Number(resolvedCvss)) ? Number(resolvedCvss) : null,
        cvss_source: f.cvss != null ? 'provider' : taxonomy ? 'baseline' : null,
        attribution_confidence: String(f.attribution_confidence || '').trim() || null,
        evidence_summary: toTextSummary(f.evidence),
        created_at: f.created_at || null,
      };
      const findingKey = [
        String(normalizedFinding.finding_type || '').toLowerCase(),
        String(normalizedFinding.title || '').trim().toLowerCase(),
        normalizeAssetLabel(String(normalizedFinding.affected_asset || normalizedFinding.affected_url || '')),
        String(normalizedFinding.ip || '').trim().toLowerCase(),
        String(normalizedFinding.port || ''),
        String(normalizedFinding.protocol || '').trim().toLowerCase(),
        String(normalizedFinding.severity || '').trim().toLowerCase(),
        cves.join(','),
        cweMerged.join(','),
        String(normalizedFinding.owasp || ''),
      ].join('|');
      const existing = findingDedupMap.get(findingKey);
      if (existing) {
        existing.occurrence_count = Number(existing.occurrence_count || 1) + 1;
        continue;
      }
      findingDedupMap.set(findingKey, {
        ...normalizedFinding,
        occurrence_count: 1,
      });
    }
    const findings = Array.from(findingDedupMap.values()).sort((a, b) => {
      const sevDelta = (SEV_RANK[String(b?.severity || '').toLowerCase()] ?? 0) - (SEV_RANK[String(a?.severity || '').toLowerCase()] ?? 0);
      if (sevDelta !== 0) return sevDelta;
      return String(a?.affected_asset || a?.affected_url || '').localeCompare(String(b?.affected_asset || b?.affected_url || ''));
    });
    const intelScoped = (rawIntelAll || []).filter((entry: any) => {
      const target = String(entry?.target || '').trim().toLowerCase();
      if (!target) return true;
      if (isIpv4(target) || isIpv6(target)) {
        return isIpWithinScopeRules(target, ipScopeRules);
      }
      const targetHost = parseHostname(target) || target;
      return classifyHostScopeReason(targetHost, scopeDomains) === null;
    });
    const intelDedupMap = new Map<string, any>();
    for (const entry of intelScoped) {
      const summaryText = toTextSummary(entry.summary);
      if (isPlaceholderSummary(summaryText)) continue;
      const summaryObj = entry?.summary && typeof entry.summary === 'object' ? entry.summary as Record<string, any> : {};
      const resolvedTarget = resolveSpecificAssetTarget(
        entry?.target,
        summaryObj?.host,
        summaryObj?.hostname,
        summaryObj?.domain,
        summaryObj?.url,
        summaryObj?.ip,
        summaryObj?.ip_address,
      ) || 'n/d';
      const key = [
        String(entry?.provider || '').toLowerCase(),
        resolvedTarget,
        summaryText,
      ].join('|');
      if (!intelDedupMap.has(key)) {
        intelDedupMap.set(key, {
          ...entry,
          category: mapIntelCategory(String(entry.provider || '')),
          target: resolvedTarget,
          summary_text: summaryText,
          confidence: entry.confidence || null,
        });
      }
    }
    const intel = Array.from(intelDedupMap.values()).map((entry: any) => ({
      category: mapIntelCategory(String(entry.provider || '')),
      target: entry.target,
      summary_text: entry.summary_text || '',
      confidence: entry.confidence || null,
    })).filter((entry: any) => !isPlaceholderSummary(entry.summary_text));
    const syntheticOpenPortObservations = (rawOpenPortsAll || []).map((row: any) => ({
      module: 'port_scanner',
      observation_type: 'open_port',
      title: `${row.host || 'host'}:${row.port || ''}`,
      value: {
        host: row.host || null,
        ip: row.ip || null,
        open_ports: [row.port].filter(Boolean),
        data: [row],
      },
      severity: row.exposure_level === 'critical' || row.exposure_level === 'high' ? 'high' : 'info',
      created_at: row.last_seen_at || null,
      scan_job_id: row.scan_job_id,
    }));

    const syntheticTechObservations = (rawWebTechAll || []).map((row: any) => ({
      module: 'website_recon',
      observation_type: 'technologies',
      title: row.url || row.host || 'technology',
      value: {
        url: row.url || null,
        host: row.host || null,
        technologies: [row],
      },
      severity: 'info',
      created_at: row.created_at || null,
      scan_job_id: row.scan_job_id,
    }));

    const syntheticSslObservations = (rawSslAll || []).map((row: any) => ({
      module: 'ssl_scan',
      observation_type: 'tls_snapshot',
      title: row.url || row.host || 'tls',
      value: {
        url: row.url || null,
        host: row.host || null,
        port: row.port || null,
        grade: row.grade || null,
        weak_protocols: row.weak_protocols || [],
        weak_ciphers: row.weak_ciphers || [],
        certificate_subject: row.certificate_subject || null,
        certificate_issuer: row.certificate_issuer || null,
      },
      severity: (Array.isArray(row.weak_protocols) && row.weak_protocols.length > 0) || (Array.isArray(row.weak_ciphers) && row.weak_ciphers.length > 0) ? 'medium' : 'info',
      created_at: row.created_at || null,
      scan_job_id: row.scan_job_id,
    }));

    const mergedObservations = [
      ...(rawObservationsAll || []),
      ...syntheticOpenPortObservations,
      ...syntheticTechObservations,
      ...syntheticSslObservations,
    ];

    const observationMap = new Map<string, any>();
    for (const observation of mergedObservations) {
      const key = [
        String(observation?.module || '').toLowerCase(),
        String(observation?.observation_type || '').toLowerCase(),
        String(observation?.title || '').trim().toLowerCase(),
        JSON.stringify(observation?.value || {}),
      ].join('|');
      if (!observationMap.has(key)) {
        observationMap.set(key, observation);
      }
    }
    const observations = Array.from(observationMap.values());

    const addToSetMap = (map: Map<string, Set<string>>, key: string, value: string) => {
      const k = String(key || '').trim();
      const v = String(value || '').trim();
      if (!k || !v) return;
      if (!map.has(k)) map.set(k, new Set<string>());
      map.get(k)!.add(v);
    };

    const hostToIps = new Map<string, Set<string>>();
    const ipToHosts = new Map<string, Set<string>>();

    const matrixMap = new Map<string, {
      asset: string;
      asset_type: string;
      related_ips: Set<string>;
      findings_total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
      cve_set: Set<string>;
      open_port_keys: Set<string>;
    }>();

    const ensureMatrixRow = (assetLabel: string, hintType?: string | null) => {
      const label = normalizeAssetLabel(assetLabel);
      if (!label) return null;
      const inferred = inferAssetType(assetLabel, hintType);
      const key = `${inferred}:${label}`;
      if (!matrixMap.has(key)) {
        matrixMap.set(key, {
          asset: label,
          asset_type: inferred,
          related_ips: new Set<string>(),
          findings_total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
          cve_set: new Set<string>(),
          open_port_keys: new Set<string>(),
        });
      }
      return matrixMap.get(key)!;
    };

    const linkHostIp = (hostLike: string, ipLike: string) => {
      const host = parseHostname(hostLike) || (isIpv4(hostLike) ? '' : normalizeAssetLabel(hostLike));
      const ip = String(ipLike || '').trim();
      if (!host || !ip || !isIpv4(ip)) return;
      addToSetMap(hostToIps, host, ip);
      addToSetMap(ipToHosts, ip, host);
      const hostRow = ensureMatrixRow(host, inferAssetType(host));
      if (hostRow) hostRow.related_ips.add(ip);
      const ipRow = ensureMatrixRow(ip, 'ip');
      if (ipRow) ipRow.related_ips.add(ip);
    };

    const registerAsset = (assetLabel: string, hintType?: string | null, ipLike?: string | null) => {
      const row = ensureMatrixRow(assetLabel, hintType);
      if (!row) return;
      const ip = String(ipLike || '').trim();
      if (ip && isIpv4(ip)) {
        row.related_ips.add(ip);
        if (row.asset_type !== 'ip') linkHostIp(row.asset, ip);
        else addToSetMap(ipToHosts, ip, row.asset);
      }
      if (row.asset_type === 'ip') {
        row.related_ips.add(row.asset);
      } else {
        const host = parseHostname(row.asset) || row.asset;
        const knownIps = hostToIps.get(host);
        if (knownIps) knownIps.forEach((knownIp) => row.related_ips.add(knownIp));
      }
    };

    for (const scopedJob of scopedJobs) {
      const jobTargetHost =
        parseHostname(String(scopedJob?.raw_target || '')) ||
        parseHostname(String(scopedJob?.normalized_target || '')) ||
        '';
      const jobTargetIp = isIpv4(jobTargetHost) ? jobTargetHost : '';
      if (jobTargetHost) registerAsset(jobTargetHost, inferAssetType(jobTargetHost), jobTargetIp || null);
      if (jobTargetIp) registerAsset(jobTargetIp, 'ip', jobTargetIp);
    }

    for (const asset of assets) {
      const assetType = String(asset?.asset_type || '').toLowerCase();
      const rawIp = String(asset?.ip || (asset as any)?.raw?.ip || '').trim();
      const baseLabel =
        assetType === 'open_port'
          ? String(asset?.hostname || rawIp || String(asset?.asset_value || '').split(':')[0] || '').trim()
          : String(asset?.hostname || asset?.asset_value || rawIp || '').trim();
      registerAsset(baseLabel, assetType || null, rawIp || null);
      if (assetType === 'open_port') {
        const ipFromValue = String(asset?.asset_value || '').split(':')[0];
        if (isIpv4(ipFromValue)) {
          registerAsset(ipFromValue, 'ip', ipFromValue);
          if (baseLabel && !isIpv4(baseLabel)) linkHostIp(baseLabel, ipFromValue);
        }
      }
    }

    for (const scopeRow of monitored_scope) {
      const entryType = String(scopeRow?.entry_type || '').toLowerCase();
      if (entryType === 'domain') {
        registerAsset(String(scopeRow?.input_value || ''), 'domain', null);
      } else if (entryType === 'single') {
        const singleIp = String(scopeRow?.ip_start || scopeRow?.input_value || '').trim();
        if (isIpv4(singleIp)) registerAsset(singleIp, 'ip', singleIp);
      } else if (entryType === 'range') {
        const value = `${String(scopeRow?.ip_start || '').trim()}-${String(scopeRow?.ip_end || '').trim()}`.replace(/\s+/g, '');
        registerAsset(value, 'range', null);
      }
    }

    for (const dump of subdomain_dumps) {
      const root = String(dump?.root_domain || '').trim();
      if (root) registerAsset(root, 'domain', null);
      const results = Array.isArray(dump?.results) ? dump.results : [];
      for (const item of results) {
        const host = String(item?.subdomain || '').trim();
        const ip = String(item?.ip || '').trim();
        if (!host) continue;
        registerAsset(host, 'subdomain', ip || null);
        if (ip && isIpv4(ip)) registerAsset(ip, 'ip', ip);
      }
    }

    for (const intelEntry of intelScoped) {
      const summaryObj = intelEntry?.summary && typeof intelEntry.summary === 'object'
        ? intelEntry.summary as Record<string, any>
        : {};
      const target = resolveSpecificAssetTarget(
        intelEntry?.target,
        summaryObj?.host,
        summaryObj?.hostname,
        summaryObj?.domain,
        summaryObj?.url,
        summaryObj?.ip,
        summaryObj?.ip_address,
      );
      if (!target) continue;
      const targetType = isIpv4(target) ? 'ip' : inferAssetType(target);
      registerAsset(target, targetType, isIpv4(target) ? target : null);
    }

    const cveByAsset = new Map<string, Set<string>>();
    const cveSet = new Set<string>();
    const primaryJobTarget = normalizeAssetLabel(
      String(anchorJob?.raw_target || anchorJob?.normalized_target || ''),
    );
    findings.forEach((finding: any) => {
      const rawAsset = String(finding.affected_asset || finding.affected_url || '').trim();
      const asset = normalizeAssetLabel(rawAsset)
        || (isValidCveAssetLabel(primaryJobTarget) ? primaryJobTarget : '')
        || 'Asset principale';
      registerAsset(asset, inferAssetType(asset), String(finding.ip || '').trim() || null);
      const ipFromFinding = String(finding.ip || finding.evidence?.ip || '').trim();
      if (ipFromFinding && isIpv4(ipFromFinding)) {
        registerAsset(ipFromFinding, 'ip', ipFromFinding);
        if (asset && !isIpv4(asset)) linkHostIp(asset, ipFromFinding);
      }
      const matrixRow = ensureMatrixRow(asset, inferAssetType(asset));
      if (matrixRow) {
        matrixRow.findings_total += 1;
        const sev = String(finding.severity || '').toLowerCase();
        if (sev === 'critical') matrixRow.critical += 1;
        else if (sev === 'high') matrixRow.high += 1;
        else if (sev === 'medium') matrixRow.medium += 1;
        else if (sev === 'low') matrixRow.low += 1;
        else matrixRow.info += 1;
      }
      const cves = Array.isArray(finding.cve) ? finding.cve : [];
      if (cves.length === 0) return;
      for (const cve of cves) {
        const cveId = String(cve || '').toUpperCase().trim();
        if (!cveId) continue;
        cveSet.add(cveId);
        if (!cveByAsset.has(cveId)) cveByAsset.set(cveId, new Set<string>());
        if (isValidCveAssetLabel(asset)) {
          cveByAsset.get(cveId)!.add(asset);
        } else {
          const ipFallback = normalizeAssetLabel(String(finding.ip || finding.evidence?.ip || ''));
          if (isValidCveAssetLabel(ipFallback)) cveByAsset.get(cveId)!.add(ipFallback);
          const hostFallback = normalizeAssetLabel(String(finding.affected_url || finding.affected_asset || scopeTargetLabel || ''));
          if (isValidCveAssetLabel(hostFallback)) cveByAsset.get(cveId)!.add(hostFallback);
        }
        if (matrixRow) matrixRow.cve_set.add(cveId);
      }
      const portCandidate = Number(finding.port || finding.evidence?.port || 0);
      if (matrixRow && Number.isFinite(portCandidate) && portCandidate > 0) {
        const ipKey = ipFromFinding && isIpv4(ipFromFinding) ? ipFromFinding : 'n/a';
        matrixRow.open_port_keys.add(`${ipKey}:${portCandidate}`);
      }
    });
    const cveIds = Array.from(cveSet);

    const cveIntelById = new Map<string, any>();
    if (cveIds.length > 0) {
      const { data: cveIntelRows } = await supabase
        .from('cve_intel_cache')
        .select('cve_id, description, cvss_v3_score, cvss_v3_severity, cvss_v2_score, cwe_ids, references_json, cpe_json, exploit_links, epss_score, epss_percentile, cisa_kev, kev_date_added, kev_due_date, kev_required_action, published_at, last_modified_at, refreshed_at')
        .in('cve_id', cveIds.slice(0, 500));
      (cveIntelRows ?? []).forEach((row: any) => cveIntelById.set(String(row.cve_id || '').toUpperCase(), row));
    }

    const cve_catalog = cveIds
      .map((cveId) => {
        const intelRow = cveIntelById.get(cveId);
        const fallbackCvss = findings.find((f: any) => Array.isArray(f.cve) && f.cve.includes(cveId))?.cvss ?? null;
        const references = Array.isArray(intelRow?.references_json)
          ? intelRow.references_json
              .map((entry: any) => {
                if (typeof entry === 'string') return entry;
                if (entry && typeof entry === 'object') return String(entry.url || entry.href || '').trim();
                return '';
              })
              .filter(Boolean)
              .slice(0, 8)
          : [];
        const cwes = Array.isArray(intelRow?.cwe_ids)
          ? intelRow.cwe_ids.map((c: unknown) => String(c || '').trim()).filter(Boolean).slice(0, 12)
          : [];
        const affectedAssets = Array.from(cveByAsset.get(cveId) ?? []).filter((asset) => isValidCveAssetLabel(asset));
        const relatedIps = new Set<string>();
        const relatedDomains = new Set<string>();
        for (const rawAsset of affectedAssets) {
          const normalizedAsset = normalizeAssetLabel(rawAsset);
          if (!normalizedAsset) continue;
          if (isIpv4(normalizedAsset)) {
            relatedIps.add(normalizedAsset);
            continue;
          }
          relatedDomains.add(normalizedAsset);
          const mappedIps = hostToIps.get(normalizedAsset);
          if (mappedIps) mappedIps.forEach((ip) => relatedIps.add(ip));
        }
        return {
          cve_id: cveId,
          description: redactTechnologyMentions(String(intelRow?.description || 'Descrizione non disponibile nel cache CVE.')),
          cvss: intelRow?.cvss_v3_score ?? fallbackCvss ?? intelRow?.cvss_v2_score ?? null,
          cvss_severity: intelRow?.cvss_v3_severity || null,
          epss: intelRow?.epss_score ?? null,
          epss_percentile: intelRow?.epss_percentile ?? null,
          cisa_kev: Boolean(intelRow?.cisa_kev),
          kev_due_date: intelRow?.kev_due_date || null,
          kev_required_action: intelRow?.kev_required_action ? redactTechnologyMentions(String(intelRow.kev_required_action)) : null,
          cwe: cwes,
          references,
          affected_assets: affectedAssets.slice(0, 20),
          related_ips: Array.from(relatedIps).slice(0, 20),
          related_domains: Array.from(relatedDomains).slice(0, 20),
          published_at: intelRow?.published_at || null,
          last_modified_at: intelRow?.last_modified_at || null,
          refreshed_at: intelRow?.refreshed_at || null,
        };
      })
      .sort((a, b) => {
        const aCvss = Number(a.cvss ?? -1);
        const bCvss = Number(b.cvss ?? -1);
        if (a.cisa_kev !== b.cisa_kev) return a.cisa_kev ? -1 : 1;
        return bCvss - aCvss;
      })
      .filter((entry) => Array.isArray(entry.affected_assets) && entry.affected_assets.length > 0);

    const sevCount = findings.reduce((acc: Record<string, number>, f) => { acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc; }, {});
    const topFindings = findings.slice(0, 25).map((f) => ({
      severity: f.severity, module: f.module, title: f.title,
      asset: f.affected_asset || f.affected_url, cve: f.cve, cvss: f.cvss, remediation: f.remediation,
    }));

    // ---- AI correlation ----
    const systemPrompt = `Sei un CISO esperto in cybersecurity. Analizzi i risultati di una scansione Attack Surface esterna.
Produci un report STRUTTURATO in italiano, formato JSON con campi:
{
  "executive_summary": "string (max 6 frasi, no emoji, no liste, severità con [CRITICO]/[ALTO]/[MEDIO]/[BASSO])",
  "risk_score": number (0-100, 100=ottimo),
  "risk_level": "Critico"|"Alto"|"Medio"|"Basso",
  "top_recommendations": [ { "priority": 1-10, "title": "string", "rationale": "string", "action": "string", "affected_assets": ["..."], "severity": "critical|high|medium|low|info" } ] (esattamente 10 elementi, ordinati per priorità),
  "correlations": [ "string (correlazioni tra findings/intel/asset, max 5 bullet)" ],
  "compliance_notes": "string (riferimenti NIS2/GDPR se rilevanti, max 4 frasi)"
}
Regole: usa solo dati forniti, NON inventare CVE/asset. Bullet stretti. NESSUN emoji.`;

    const userPayload = {
      organization: { name: org?.name, legal_name: profile?.legal_name, sector: profile?.business_sector, nis2: profile?.nis2_classification },
      scan: {
        job_id: anchorJob.id,
        target: scopeTargetLabel,
        normalized_target: anchorJob.normalized_target,
        target_type: normalizedScopeMode === 'single_job' ? anchorJob.target_type : 'mixed_scope',
        scan_profile: scopeProfiles.length === 1 ? scopeProfiles[0] : 'multi_profile',
        hosting_context: normalizedScopeMode === 'single_job' ? anchorJob.hosting_context : 'mixed_scope',
        status: 'completed',
        started_at: scopeStartedAt,
        completed_at: scopeCompletedAt,
        overall_score: Number(anchorJob?.summary?.overall_score ?? 0),
        risk_level: String(anchorJob?.summary?.risk_level || '').trim() || null,
        score_breakdown: anchorJob?.summary?.score_breakdown || null,
        scope_mode: normalizedScopeMode,
        scope_jobs_total: scopedJobIds.length,
        scope_job_ids: scopedJobIds,
        scope_targets_total: scopeTargets.length,
        scope_targets: scopeTargets,
        scope_target_types: scopeTargetTypes,
        scope_profiles: scopeProfiles,
      },
      asset_count: assets.length,
      assets_sample: assets.slice(0, 30),
      subdomain_evidence: discoveredSubdomainAssets.map((a: any) => ({ host: a.hostname, ip: a.ip, root_domain: a.root_domain, depth: a.depth })).slice(0, 50),
      findings_by_severity: sevCount,
      top_findings: topFindings,
      intel_summary: intel.slice(0, 40),
      key_observations: observations.slice(0, 80),
      monitored_scope: monitored_scope.slice(0, 200),
      scope_guard_summary,
      cve_catalog: cve_catalog.slice(0, 80).map((item: any) => ({
        cve_id: item.cve_id,
        cvss: item.cvss,
        epss: item.epss,
        cisa_kev: item.cisa_kev,
        affected_assets: item.affected_assets,
      })),
    };

    let aiReport: any = null;
    let aiError: string | null = null;
    const fallbackAiReport = buildFallbackAiReport({
      orgName: org?.name || profile?.legal_name || 'organizzazione',
      target: scopeTargetLabel,
      sevCount,
      findings,
      assets,
      monitoredScope: monitored_scope,
      discoveredSubdomains: discoveredSubdomainAssets,
    });
    try {
      if (OPENAI_API_KEY) {
        const raw = await callOpenAi(systemPrompt, JSON.stringify(userPayload).slice(0, 60_000));
        aiReport = JSON.parse(raw);
      } else {
        aiError = 'OPENAI_API_KEY non configurata';
      }
    } catch (e) {
      aiError = (e as Error).message;
    }
    aiReport = sanitizeAiReport(aiReport, fallbackAiReport, sevCount);
    aiError = null;

    // ---- Auto-genera azioni di remediation per CVE KEV (se non esistono già) ----
    const kevGen = await generateKevRemediations(supabase, organization_id, findings).catch((e) => {
      console.warn('generateKevRemediations error', (e as Error).message);
      return { created: 0, total_kev: 0, existing: 0 };
    });

    // ---- Carica tutte le remediation_tasks attive dell'organizzazione ----
    const { data: remediationRows } = await supabase
      .from('remediation_tasks')
      .select('id, task, category, start_date, end_date, progress, priority, assignee, color, source, source_ref, budget')
      .eq('organization_id', organization_id)
      .eq('is_deleted', false)
      .order('priority', { ascending: true })
      .order('start_date', { ascending: true })
      .limit(500);
    const remediation_tasks = (remediationRows ?? []).map((t: any) => ({
      ...t,
      status: (t.progress ?? 0) >= 100 ? 'completato' : 'pianificato',
    }));

    const assetsForReportMap = new Map<string, any>();
    const upsertAssetForReport = (candidate: any) => {
      const assetType = String(candidate?.asset_type || '').trim().toLowerCase() || inferAssetType(String(candidate?.asset_value || candidate?.hostname || candidate?.ip || ''));
      const assetValue = String(candidate?.asset_value || candidate?.hostname || candidate?.ip || '').trim();
      const hostname = String(candidate?.hostname || '').trim() || null;
      const ip = String(candidate?.ip || '').trim() || null;
      const key = `${assetType}|${normalizeAssetLabel(assetValue || hostname || ip || '')}|${String(ip || '').trim()}`;
      if (!assetValue && !hostname && !ip) return;
      const normalized = {
        asset_type: assetType || null,
        asset_value: assetValue || hostname || ip || null,
        hostname,
        ip,
        source: candidate?.source || null,
        root_domain: candidate?.root_domain || null,
        depth: candidate?.depth ?? null,
        discovered_at: candidate?.discovered_at || candidate?.last_seen || candidate?.first_seen || candidate?.created_at || null,
        evidence: candidate?.evidence || null,
      };
      const existing = assetsForReportMap.get(key);
      if (!existing) {
        assetsForReportMap.set(key, normalized);
        return;
      }
      const existingTs = new Date(String(existing?.discovered_at || 0)).getTime() || 0;
      const incomingTs = new Date(String(normalized?.discovered_at || 0)).getTime() || 0;
      if (incomingTs >= existingTs) {
        assetsForReportMap.set(key, { ...existing, ...normalized });
      }
    };
    for (const asset of assets) {
      upsertAssetForReport({
        asset_type: asset?.asset_type || null,
        asset_value: asset?.asset_value || null,
        hostname: asset?.hostname || null,
        ip: asset?.ip || asset?.raw?.ip || null,
        source: asset?.source || null,
        root_domain: asset?.root_domain || asset?.raw?.root_domain || null,
        depth: asset?.depth ?? null,
        discovered_at: asset?.discovered_at || asset?.last_seen || asset?.first_seen || null,
        evidence: asset?.evidence || null,
      });
    }
    for (const scopeRow of monitored_scope) {
      const entryType = String(scopeRow?.entry_type || '').trim().toLowerCase();
      if (entryType === 'domain') {
        upsertAssetForReport({
          asset_type: 'domain',
          asset_value: String(scopeRow?.input_value || '').trim(),
          hostname: String(scopeRow?.input_value || '').trim(),
          source: 'scope_rule',
          discovered_at: null,
        });
      } else if (entryType === 'single') {
        const scopeIp = String(scopeRow?.ip_start || scopeRow?.input_value || '').trim();
        upsertAssetForReport({
          asset_type: 'ip',
          asset_value: scopeIp,
          ip: scopeIp,
          source: 'scope_rule',
          discovered_at: null,
        });
      } else if (entryType === 'range') {
        const rangeValue = `${String(scopeRow?.ip_start || '').trim()}-${String(scopeRow?.ip_end || '').trim()}`.replace(/\s+/g, '');
        upsertAssetForReport({
          asset_type: 'range',
          asset_value: rangeValue,
          source: 'scope_rule',
          discovered_at: null,
        });
      } else if (entryType === 'cidr') {
        upsertAssetForReport({
          asset_type: 'cidr',
          asset_value: String(scopeRow?.input_value || '').trim(),
          source: 'scope_rule',
          discovered_at: null,
        });
      }
    }
    for (const target of scopeTargets) {
      const targetHost = parseHostname(target) || target;
      const inferredType = inferAssetType(targetHost);
      upsertAssetForReport({
        asset_type: inferredType,
        asset_value: target,
        hostname: inferredType === 'ip' ? null : targetHost,
        ip: inferredType === 'ip' ? targetHost : null,
        source: 'scan_target',
        discovered_at: scopeCompletedAt,
      });
    }
    const assetsForReport = Array.from(assetsForReportMap.values());
    const observationsForReport = observations.map((observation: any) => {
      const rawValue = observation?.value && typeof observation.value === 'object' ? observation.value as Record<string, any> : {};
      const compactValue: Record<string, unknown> = {};
      const passKeys = ['host', 'hostname', 'domain', 'target', 'url', 'ip', 'ip_address', 'host_ip', 'asn', 'org', 'type', 'policy'];
      for (const key of passKeys) {
        if (rawValue?.[key] != null && String(rawValue[key]).trim() !== '') {
          compactValue[key] = rawValue[key];
        }
      }
      if (Array.isArray(rawValue?.ports)) {
        compactValue.ports = Array.from(new Set(rawValue.ports.map((entry: any) => Number(entry)).filter((entry: number) => Number.isFinite(entry)))).slice(0, 40);
      }
      if (Array.isArray(rawValue?.open_ports)) {
        compactValue.open_ports = Array.from(new Set(rawValue.open_ports.map((entry: any) => Number(entry)).filter((entry: number) => Number.isFinite(entry)))).slice(0, 40);
      }
      if (Array.isArray(rawValue?.hostnames)) {
        compactValue.hostnames = rawValue.hostnames.map((entry: any) => String(entry || '').trim()).filter(Boolean).slice(0, 25);
      }
      if (Array.isArray(rawValue?.data)) {
        compactValue.data = rawValue.data.slice(0, 30).map((entry: any) => ({
          port: Number.isFinite(Number(entry?.port)) ? Number(entry.port) : null,
          transport: entry?.transport || entry?.protocol || null,
          service: entry?.service || entry?.product || null,
          product: entry?.product || null,
          version: entry?.version || null,
        }));
      }
      if (Object.keys(compactValue).length === 0) {
        compactValue.summary = toTextSummary(rawValue);
      }
      return {
        module: observation?.module || null,
        observation_type: observation?.observation_type || null,
        title: observation?.title || null,
        severity: observation?.severity || 'info',
        created_at: observation?.created_at || null,
        value: compactValue,
      };
    });

    const reportBrandTitle = surfaceScanBrandTitle(Boolean(org?.hicompliance_enabled));
    const reportRepositoryTitle = isOrganizationScope ? reportBrandTitle : `${reportBrandTitle} - ${scopeTargetLabel}`;

    const reportPayload = {
      generated_at: new Date().toISOString(),
      report_repository: {
        trigger_source: triggerSource,
        auto_generated: triggerSource === 'auto_on_complete' || triggerSource === 'cron_weekly_repository',
        generated_by_user_id: actorUserId,
        generated_via: isInternalCall ? 'internal_call' : 'manual_call',
        mode: isOrganizationScope ? 'organization_scope_canonical' : 'single_job',
        pdf_compression: 'optimized',
      },
      organization: {
        id: organization_id,
        name: org?.name,
        hicompliance_enabled: Boolean(org?.hicompliance_enabled),
        has_hicompliance: Boolean(org?.hicompliance_enabled),
        report_brand_title: reportBrandTitle,
        legal_name: profile?.legal_name,
        vat_number: profile?.vat_number,
        fiscal_code: profile?.fiscal_code,
        legal_address: profile?.legal_address,
        operational_address: profile?.operational_address,
        pec: profile?.pec,
        email: profile?.email,
        phone: profile?.phone,
        business_sector: profile?.business_sector,
        nis2_classification: profile?.nis2_classification,
      },
      scan: {
        job_id: anchorJob.id,
        target: scopeTargetLabel,
        normalized_target: anchorJob.normalized_target,
        target_type: normalizedScopeMode === 'single_job' ? anchorJob.target_type : 'mixed_scope',
        scan_profile: scopeProfiles.length === 1 ? scopeProfiles[0] : 'multi_profile',
        hosting_context: normalizedScopeMode === 'single_job' ? anchorJob.hosting_context : 'mixed_scope',
        status: 'completed',
        started_at: scopeStartedAt,
        completed_at: scopeCompletedAt,
        scope_mode: normalizedScopeMode,
        scope_jobs_total: scopedJobIds.length,
        scope_job_ids: scopedJobIds,
        scope_targets_total: scopeTargets.length,
        scope_targets: scopeTargets,
        scope_target_types: scopeTargetTypes,
        scope_profiles: scopeProfiles,
      },
      assets_in_scope: assetsForReport,
      findings,
      findings_by_severity: sevCount,
      cve_catalog,
      intel,
      observations: observationsForReport,
      monitored_scope,
      scope_guard_summary,
      subdomain_dumps,
      remediation_tasks,
      kev_generation: kevGen,
      ai: aiReport,
      ai_error: aiError,
    };

    // Persisti il report (best-effort)
    let repositoryId: string | null = null;
    try {
      if (isOrganizationScope && existingCanonicalRow) {
        const { data: updated } = await supabase
          .from('surface_scan_ai_reports')
          .update({
            title: reportRepositoryTitle,
            payload: reportPayload as any,
            scan_job_id: anchorJob.id,
            created_by: actorUserId,
            created_at: new Date().toISOString(),
          })
          .eq('id', existingCanonicalRow.id)
          .select('id')
          .maybeSingle();
        repositoryId = updated?.id ?? existingCanonicalRow.id;
      } else if (isOrganizationScope) {
        const { data: inserted } = await supabase
          .from('surface_scan_ai_reports')
          .insert({
            organization_id,
            scan_job_id: anchorJob.id,
            title: reportRepositoryTitle,
            payload: reportPayload as any,
            created_by: actorUserId,
          })
          .select('id')
          .maybeSingle();
        repositoryId = inserted?.id ?? null;
      } else if (latestSingleReportRow && triggerSource === 'auto_on_complete') {
        const { data: updated } = await supabase
          .from('surface_scan_ai_reports')
          .update({
            title: reportRepositoryTitle,
            payload: reportPayload as any,
            created_by: actorUserId,
            created_at: new Date().toISOString(),
          })
          .eq('id', latestSingleReportRow.id)
          .select('id')
          .maybeSingle();
        repositoryId = updated?.id ?? latestSingleReportRow.id;
      } else {
        const { data: inserted } = await supabase
          .from('surface_scan_ai_reports')
          .insert({
            organization_id,
            scan_job_id: anchorJob.id,
            title: reportRepositoryTitle,
            payload: reportPayload as any,
            created_by: actorUserId,
          })
          .select('id')
          .maybeSingle();
        repositoryId = inserted?.id ?? null;
      }
    } catch (e) { console.warn('persist report failed', e); }

    return json({ ok: true, repository_id: repositoryId, report: reportPayload });
  } catch (e) {
    console.error('ai-report error', e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
