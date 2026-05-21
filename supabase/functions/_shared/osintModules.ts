// Moduli di enrichment OSINT per SurfaceScan360 (safe_recon).
// Tutti i moduli sono funzioni pure (ctx) => Promise<ModuleResult>.

import type { ParsedTarget } from './targetParser.ts';

export interface ScanContext {
  job_id: string;
  organization_id: string;
  parsed: ParsedTarget;
}

export interface Observation {
  module: string;
  observation_type: string;
  title?: string;
  value: Record<string, unknown>;
  severity?: string;
  confidence?: string;
}

export interface Finding {
  module: string;
  finding_type: string;
  title: string;
  description?: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  affected_asset?: string;
  affected_url?: string;
  remediation?: string;
  evidence?: Record<string, unknown>;
  attribution_confidence?: string;
}

export interface AssetRow {
  asset_type: string;
  asset_value: string;
  hostname?: string;
  root_domain?: string;
  ip?: string;
  source: string;
  confidence?: string;
  raw?: Record<string, unknown>;
}

export interface ModuleResult {
  observations: Observation[];
  findings: Finding[];
  assets: AssetRow[];
}

const DOH_URL = 'https://cloudflare-dns.com/dns-query';
const FETCH_TIMEOUT_MS = 10_000;

async function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function doh(name: string, type: string): Promise<{ Answer?: Array<{ name: string; type: number; data: string; TTL?: number }> }> {
  const u = new URL(DOH_URL);
  u.searchParams.set('name', name);
  u.searchParams.set('type', type);
  try {
    const res = await timedFetch(u.toString(), { headers: { accept: 'application/dns-json' } });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

// ----- DNS ENRICHMENT -----
export async function runDns(ctx: ScanContext): Promise<ModuleResult> {
  const out: ModuleResult = { observations: [], findings: [], assets: [] };
  const host = ctx.parsed.hostname;
  if (ctx.parsed.target_type === 'ipv4' || ctx.parsed.target_type === 'ipv6') return out;

  const [a, aaaa, mx, txt, ns, cname, caa] = await Promise.all([
    doh(host, 'A'), doh(host, 'AAAA'), doh(host, 'MX'),
    doh(host, 'TXT'), doh(host, 'NS'), doh(host, 'CNAME'), doh(host, 'CAA'),
  ]);

  const aIps = (a.Answer || []).filter((r) => r.type === 1).map((r) => r.data);
  const aaaaIps = (aaaa.Answer || []).filter((r) => r.type === 28).map((r) => r.data);
  const mxRecords = (mx.Answer || []).filter((r) => r.type === 15).map((r) => r.data);
  const txtRecords = (txt.Answer || []).filter((r) => r.type === 16).map((r) => r.data.replace(/^"|"$/g, ''));
  const nsRecords = (ns.Answer || []).filter((r) => r.type === 2).map((r) => r.data);
  const caaRecords = (caa.Answer || []).filter((r) => r.type === 257).map((r) => r.data);

  out.observations.push({
    module: 'dns', observation_type: 'records',
    title: 'DNS records',
    value: { A: aIps, AAAA: aaaaIps, MX: mxRecords, TXT: txtRecords, NS: nsRecords, CNAME: (cname.Answer || []).map((r) => r.data), CAA: caaRecords },
  });

  for (const ip of aIps) {
    out.assets.push({ asset_type: 'ipv4', asset_value: ip, hostname: host, root_domain: ctx.parsed.root_domain ?? undefined, ip, source: 'dns_a', confidence: 'high' });
  }
  for (const ip of aaaaIps) {
    out.assets.push({ asset_type: 'ipv6', asset_value: ip, hostname: host, ip, source: 'dns_aaaa', confidence: 'high' });
  }

  if (aIps.length === 0 && aaaaIps.length === 0) {
    out.findings.push({ module: 'dns', finding_type: 'no_a_record', title: 'Nessun record A/AAAA per il dominio', severity: 'low', affected_asset: host });
  }
  if (caaRecords.length === 0) {
    out.findings.push({ module: 'dns', finding_type: 'missing_caa', title: 'Record CAA assente', severity: 'low', affected_asset: host, remediation: 'Aggiungere record CAA per limitare le CA autorizzate.' });
  }

  return out;
}

// ----- HTTP STATUS + HEADERS + SECURITY HEADERS + HSTS + REDIRECT CHAIN -----
export async function runHttp(ctx: ScanContext): Promise<ModuleResult> {
  const out: ModuleResult = { observations: [], findings: [], assets: [] };
  if (ctx.parsed.target_type === 'ipv4' || ctx.parsed.target_type === 'ipv6') return out;

  const target = ctx.parsed.normalized_target;
  const chain: Array<{ url: string; status: number; location?: string }> = [];
  let current = target;
  let finalRes: Response | null = null;

  try {
    for (let i = 0; i < 10; i++) {
      const res = await timedFetch(current, { redirect: 'manual', headers: { 'user-agent': 'SurfaceScan360/1.0' } });
      const location = res.headers.get('location') ?? undefined;
      chain.push({ url: current, status: res.status, location });
      if (res.status >= 300 && res.status < 400 && location) {
        try {
          current = new URL(location, current).toString();
        } catch { break; }
        continue;
      }
      finalRes = res;
      break;
    }
  } catch (e) {
    out.observations.push({ module: 'http_status', observation_type: 'error', value: { error: String(e), target } });
    return out;
  }

  out.observations.push({ module: 'redirect_chain', observation_type: 'chain', title: 'Redirect chain', value: { hops: chain, hop_count: chain.length } });

  if (chain.length > 5) {
    out.findings.push({ module: 'redirect_chain', finding_type: 'long_redirect_chain', title: `Redirect chain lunga (${chain.length} hop)`, severity: 'low', affected_url: target });
  }
  // http -> https downgrade detection
  for (let i = 0; i < chain.length - 1; i++) {
    if (chain[i].url.startsWith('https://') && (chain[i].location || '').startsWith('http://')) {
      out.findings.push({ module: 'redirect_chain', finding_type: 'https_to_http_downgrade', title: 'Redirect da HTTPS a HTTP', severity: 'medium', affected_url: chain[i].url });
    }
  }

  if (!finalRes) return out;

  const headers = finalRes.headers;
  const headerMap: Record<string, string> = {};
  headers.forEach((v, k) => { headerMap[k] = v; });

  out.observations.push({
    module: 'http_status', observation_type: 'response',
    value: { status: finalRes.status, url: finalRes.url, content_type: headers.get('content-type'), server: headers.get('server') },
  });
  out.observations.push({ module: 'http_headers', observation_type: 'headers', value: { headers: headerMap } });

  if (finalRes.status >= 500) {
    out.findings.push({ module: 'http_status', finding_type: 'server_error', title: `Risposta HTTP ${finalRes.status}`, severity: 'medium', affected_url: finalRes.url });
  } else if (finalRes.status >= 400) {
    out.findings.push({ module: 'http_status', finding_type: 'client_error', title: `Risposta HTTP ${finalRes.status}`, severity: 'low', affected_url: finalRes.url });
  }

  // Security headers
  const has = (n: string) => Boolean(headers.get(n));
  const isHttps = (finalRes.url || target).startsWith('https://');

  if (!has('content-security-policy')) {
    out.findings.push({ module: 'security_headers', finding_type: 'missing_csp', title: 'Content-Security-Policy mancante', severity: 'medium', affected_url: finalRes.url, remediation: 'Definire una CSP per ridurre il rischio di XSS e injection.' });
  }
  if (isHttps && !has('strict-transport-security')) {
    out.findings.push({ module: 'security_headers', finding_type: 'missing_hsts', title: 'HSTS mancante', severity: 'medium', affected_url: finalRes.url, remediation: 'Abilitare Strict-Transport-Security con max-age adeguato.' });
  } else if (has('strict-transport-security')) {
    const hsts = headers.get('strict-transport-security')!;
    const m = hsts.match(/max-age=(\d+)/i);
    const maxAge = m ? parseInt(m[1], 10) : 0;
    if (maxAge < 15552000) {
      out.findings.push({ module: 'security_headers', finding_type: 'hsts_low_maxage', title: `HSTS max-age basso (${maxAge}s)`, severity: 'low', affected_url: finalRes.url, evidence: { header: hsts } });
    }
  }
  if (!has('x-content-type-options')) {
    out.findings.push({ module: 'security_headers', finding_type: 'missing_xcto', title: 'X-Content-Type-Options mancante', severity: 'low', affected_url: finalRes.url, remediation: 'Impostare X-Content-Type-Options: nosniff.' });
  }
  if (!has('x-frame-options') && !(headers.get('content-security-policy') || '').includes('frame-ancestors')) {
    out.findings.push({ module: 'security_headers', finding_type: 'missing_xfo', title: 'X-Frame-Options o frame-ancestors mancante', severity: 'low', affected_url: finalRes.url });
  }
  if (!has('referrer-policy')) {
    out.findings.push({ module: 'security_headers', finding_type: 'missing_referrer_policy', title: 'Referrer-Policy mancante', severity: 'low', affected_url: finalRes.url });
  }
  if (has('x-powered-by')) {
    out.findings.push({ module: 'security_headers', finding_type: 'tech_disclosure', title: 'Header X-Powered-By espone tecnologie', severity: 'low', affected_url: finalRes.url, evidence: { 'x-powered-by': headers.get('x-powered-by') }, remediation: 'Rimuovere o sopprimere X-Powered-By.' });
  }
  // Cookie analysis
  const setCookie = headers.get('set-cookie');
  if (setCookie) {
    const lower = setCookie.toLowerCase();
    if (isHttps && !lower.includes('secure')) {
      out.findings.push({ module: 'security_headers', finding_type: 'cookie_missing_secure', title: 'Cookie senza flag Secure', severity: 'medium', affected_url: finalRes.url });
    }
    if (!lower.includes('httponly')) {
      out.findings.push({ module: 'security_headers', finding_type: 'cookie_missing_httponly', title: 'Cookie senza flag HttpOnly', severity: 'medium', affected_url: finalRes.url });
    }
    if (!lower.includes('samesite')) {
      out.findings.push({ module: 'security_headers', finding_type: 'cookie_missing_samesite', title: 'Cookie senza attributo SameSite', severity: 'low', affected_url: finalRes.url });
    }
  }

  return out;
}

// ----- ROBOTS.TXT / SECURITY.TXT / SITEMAP -----
async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string } | null> {
  try {
    const res = await timedFetch(url, { headers: { 'user-agent': 'SurfaceScan360/1.0' } });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch {
    return null;
  }
}

export async function runWellKnown(ctx: ScanContext): Promise<ModuleResult> {
  const out: ModuleResult = { observations: [], findings: [], assets: [] };
  if (ctx.parsed.target_type === 'ipv4' || ctx.parsed.target_type === 'ipv6') return out;
  const base = `${ctx.parsed.protocol}//${ctx.parsed.hostname}`;

  const [robots, secTxt1, secTxt2, sitemap] = await Promise.all([
    fetchText(`${base}/robots.txt`),
    fetchText(`${base}/.well-known/security.txt`),
    fetchText(`${base}/security.txt`),
    fetchText(`${base}/sitemap.xml`),
  ]);

  // robots
  if (robots?.ok) {
    const disallow = robots.text.split(/\r?\n/).filter((l) => /^disallow:/i.test(l)).map((l) => l.split(':')[1]?.trim()).filter(Boolean);
    const sitemaps = robots.text.split(/\r?\n/).filter((l) => /^sitemap:/i.test(l)).map((l) => l.split(':').slice(1).join(':').trim());
    out.observations.push({ module: 'robots_txt', observation_type: 'parsed', value: { exists: true, status: robots.status, disallow, sitemaps } });
    const sensitive = ['/admin', '/backup', '/.git', '/.env', '/private', '/wp-admin', '/staging', '/test'];
    const matches = disallow.filter((p) => sensitive.some((s) => p?.toLowerCase().startsWith(s)));
    if (matches.length) {
      out.findings.push({ module: 'robots_txt', finding_type: 'sensitive_paths', title: 'robots.txt espone path sensibili', severity: 'low', affected_url: `${base}/robots.txt`, evidence: { paths: matches } });
    }
  } else {
    out.observations.push({ module: 'robots_txt', observation_type: 'parsed', value: { exists: false, status: robots?.status ?? 0 } });
  }

  // security.txt
  const secTxt = (secTxt1?.ok ? secTxt1 : (secTxt2?.ok ? secTxt2 : null));
  if (secTxt) {
    const lines = secTxt.text.split(/\r?\n/);
    const parsed: Record<string, string[]> = {};
    for (const line of lines) {
      const m = line.match(/^([A-Za-z-]+):\s*(.+)$/);
      if (m) {
        parsed[m[1].toLowerCase()] = [...(parsed[m[1].toLowerCase()] || []), m[2].trim()];
      }
    }
    out.observations.push({ module: 'security_txt', observation_type: 'parsed', value: { exists: true, fields: parsed } });
    const expires = parsed['expires']?.[0];
    if (expires) {
      const exp = Date.parse(expires);
      if (!isNaN(exp) && exp < Date.now()) {
        out.findings.push({ module: 'security_txt', finding_type: 'security_txt_expired', title: 'security.txt scaduto', severity: 'low', affected_url: `${base}/.well-known/security.txt`, evidence: { expires } });
      }
    }
  } else {
    out.observations.push({ module: 'security_txt', observation_type: 'parsed', value: { exists: false } });
    out.findings.push({ module: 'security_txt', finding_type: 'missing_security_txt', title: 'security.txt non presente', severity: 'info', affected_url: `${base}/.well-known/security.txt`, remediation: 'Pubblicare /.well-known/security.txt con contatto di sicurezza.' });
  }

  // sitemap
  if (sitemap?.ok) {
    const urls = Array.from(sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]).slice(0, 200);
    out.observations.push({ module: 'sitemap', observation_type: 'parsed', value: { exists: true, count: urls.length, sample: urls.slice(0, 20) } });
  } else {
    out.observations.push({ module: 'sitemap', observation_type: 'parsed', value: { exists: false } });
  }

  return out;
}

// ----- MAIL SECURITY -----
export async function runMail(ctx: ScanContext): Promise<ModuleResult> {
  const out: ModuleResult = { observations: [], findings: [], assets: [] };
  if (ctx.parsed.target_type === 'ipv4' || ctx.parsed.target_type === 'ipv6') return out;
  const domain = ctx.parsed.root_domain || ctx.parsed.hostname;

  const [mx, spf, dmarc, bimi] = await Promise.all([
    doh(domain, 'MX'),
    doh(domain, 'TXT'),
    doh(`_dmarc.${domain}`, 'TXT'),
    doh(`default._bimi.${domain}`, 'TXT'),
  ]);

  const mxRecords = (mx.Answer || []).filter((r) => r.type === 15).map((r) => r.data);
  const txtAll = (spf.Answer || []).filter((r) => r.type === 16).map((r) => r.data.replace(/^"|"$/g, ''));
  const spfRecords = txtAll.filter((t) => /^v=spf1/i.test(t));
  const dmarcRecords = (dmarc.Answer || []).filter((r) => r.type === 16).map((r) => r.data.replace(/^"|"$/g, '')).filter((t) => /^v=DMARC1/i.test(t));
  const bimiRecords = (bimi.Answer || []).filter((r) => r.type === 16).map((r) => r.data.replace(/^"|"$/g, '')).filter((t) => /^v=BIMI1/i.test(t));

  out.observations.push({ module: 'mail_security', observation_type: 'records', value: { mx: mxRecords, spf: spfRecords, dmarc: dmarcRecords, bimi: bimiRecords } });

  const hasMx = mxRecords.length > 0;
  if (hasMx && spfRecords.length === 0) {
    out.findings.push({ module: 'mail_security', finding_type: 'missing_spf', title: 'SPF mancante con MX presente', severity: 'medium', affected_asset: domain, remediation: 'Pubblicare un record SPF (TXT v=spf1 ...).' });
  }
  if (spfRecords.length > 1) {
    out.findings.push({ module: 'mail_security', finding_type: 'multiple_spf', title: 'Record SPF multipli', severity: 'medium', affected_asset: domain });
  }
  if (spfRecords.some((s) => /\+all/i.test(s))) {
    out.findings.push({ module: 'mail_security', finding_type: 'spf_all_permissive', title: 'SPF +all (troppo permissivo)', severity: 'high', affected_asset: domain });
  }
  if (hasMx && dmarcRecords.length === 0) {
    out.findings.push({ module: 'mail_security', finding_type: 'missing_dmarc', title: 'DMARC mancante con MX presente', severity: 'medium', affected_asset: domain, remediation: 'Pubblicare _dmarc TXT v=DMARC1; p=quarantine; ...' });
  } else if (dmarcRecords.some((d) => /p=none/i.test(d))) {
    out.findings.push({ module: 'mail_security', finding_type: 'dmarc_p_none', title: 'DMARC policy p=none', severity: 'low', affected_asset: domain });
  }
  if (bimiRecords.length === 0) {
    out.findings.push({ module: 'mail_security', finding_type: 'missing_bimi', title: 'BIMI non configurato', severity: 'info', affected_asset: domain });
  }

  return out;
}

export const SAFE_RECON_MODULES = [runDns, runHttp, runWellKnown, runMail] as const;
