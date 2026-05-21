// Moduli OSINT aggiuntivi: SSL/CT, DNSSEC, tech/trackers, performance.
import type { ScanContext, ModuleResult } from './osintModules.ts';

const FETCH_TIMEOUT_MS = 12_000;
async function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// ----- SSL/TLS via crt.sh (Certificate Transparency) -----
export async function runSslCt(ctx: ScanContext): Promise<ModuleResult> {
  const out: ModuleResult = { observations: [], findings: [], assets: [] };
  if (ctx.parsed.target_type === 'ipv4' || ctx.parsed.target_type === 'ipv6') return out;
  const domain = ctx.parsed.root_domain || ctx.parsed.hostname;
  try {
    const res = await timedFetch(`https://crt.sh/?q=${encodeURIComponent('%.' + domain)}&output=json`);
    if (!res.ok) return out;
    const data = await res.json() as Array<{ name_value: string; not_before: string; not_after: string; issuer_name: string }>;
    const subs = new Set<string>();
    const certs = data.slice(0, 200);
    for (const c of certs) {
      for (const n of (c.name_value || '').split(/\n/)) {
        const v = n.trim().toLowerCase();
        if (v && !v.startsWith('*') && v.endsWith(domain)) subs.add(v);
      }
    }
    out.observations.push({
      module: 'ssl_ct', observation_type: 'subdomains',
      title: 'Sottodomini da Certificate Transparency',
      value: { domain, total_certs: data.length, subdomains_found: subs.size, sample: Array.from(subs).slice(0, 50) },
    });
    for (const sub of Array.from(subs).slice(0, 100)) {
      if (sub === domain) continue;
      out.assets.push({ asset_type: 'hostname', asset_value: sub, hostname: sub, root_domain: domain, source: 'crt_sh', confidence: 'medium' });
    }
    // Check expired/soon-to-expire certs for primary host
    const now = Date.now();
    const recent = certs.filter((c) => (c.name_value || '').split(/\n/).some((n) => n.trim().toLowerCase() === ctx.parsed.hostname.toLowerCase()));
    if (recent.length) {
      const latest = recent.sort((a, b) => Date.parse(b.not_after) - Date.parse(a.not_after))[0];
      const exp = Date.parse(latest.not_after);
      const days = Math.floor((exp - now) / 86_400_000);
      out.observations.push({ module: 'ssl_ct', observation_type: 'cert', value: { hostname: ctx.parsed.hostname, latest_not_after: latest.not_after, days_to_expiry: days, issuer: latest.issuer_name } });
      if (days < 0) out.findings.push({ module: 'ssl_ct', finding_type: 'cert_expired', title: 'Certificato TLS scaduto (ultimo CT log)', severity: 'high', affected_asset: ctx.parsed.hostname, evidence: { not_after: latest.not_after } });
      else if (days < 30) out.findings.push({ module: 'ssl_ct', finding_type: 'cert_expiring_soon', title: `Certificato TLS in scadenza tra ${days}g`, severity: 'medium', affected_asset: ctx.parsed.hostname, evidence: { not_after: latest.not_after } });
    }
  } catch (e) {
    out.observations.push({ module: 'ssl_ct', observation_type: 'error', value: { error: String(e) } });
  }
  return out;
}

// ----- DNSSEC -----
const DOH_URL = 'https://cloudflare-dns.com/dns-query';
async function doh(name: string, type: string): Promise<{ AD?: boolean; Answer?: Array<{ type: number; data: string }> }> {
  try {
    const u = new URL(DOH_URL);
    u.searchParams.set('name', name); u.searchParams.set('type', type); u.searchParams.set('do', '1');
    const r = await timedFetch(u.toString(), { headers: { accept: 'application/dns-json' } });
    if (!r.ok) return {};
    return await r.json();
  } catch { return {}; }
}

export async function runDnssec(ctx: ScanContext): Promise<ModuleResult> {
  const out: ModuleResult = { observations: [], findings: [], assets: [] };
  if (ctx.parsed.target_type === 'ipv4' || ctx.parsed.target_type === 'ipv6') return out;
  const domain = ctx.parsed.root_domain || ctx.parsed.hostname;
  const [ds, dnskey] = await Promise.all([doh(domain, 'DS'), doh(domain, 'DNSKEY')]);
  const hasDs = (ds.Answer || []).some((r) => r.type === 43);
  const hasDnskey = (dnskey.Answer || []).some((r) => r.type === 48);
  const adFlag = Boolean(ds.AD || dnskey.AD);
  out.observations.push({ module: 'dnssec', observation_type: 'status', value: { domain, has_ds: hasDs, has_dnskey: hasDnskey, ad_flag: adFlag, enabled: hasDs && hasDnskey } });
  if (!hasDs || !hasDnskey) {
    out.findings.push({ module: 'dnssec', finding_type: 'dnssec_disabled', title: 'DNSSEC non abilitato', severity: 'low', affected_asset: domain, remediation: 'Abilitare DNSSEC presso il registrar e firmare la zona.' });
  }
  return out;
}

// ----- Tech & Trackers (parsing leggero HTML) -----
const TECH_SIGNATURES: Array<{ name: string; re: RegExp; category: string }> = [
  { name: 'WordPress', re: /wp-content|wp-includes|\/wp-json/i, category: 'cms' },
  { name: 'Drupal', re: /drupal\.js|sites\/default\/files/i, category: 'cms' },
  { name: 'Joomla', re: /\/components\/com_|joomla/i, category: 'cms' },
  { name: 'Shopify', re: /cdn\.shopify\.com/i, category: 'ecommerce' },
  { name: 'Magento', re: /\/skin\/frontend|mage\.cookies/i, category: 'ecommerce' },
  { name: 'React', re: /react(\.production)?\.min\.js|__REACT_DEVTOOLS/i, category: 'js_framework' },
  { name: 'Vue.js', re: /vue(\.runtime)?\.min\.js/i, category: 'js_framework' },
  { name: 'jQuery', re: /jquery[.-]\d/i, category: 'js_library' },
  { name: 'Google Analytics', re: /google-analytics\.com|gtag\(|UA-\d{4,}|G-[A-Z0-9]{6,}/i, category: 'analytics' },
  { name: 'Google Tag Manager', re: /googletagmanager\.com\/gtm\.js/i, category: 'analytics' },
  { name: 'Facebook Pixel', re: /connect\.facebook\.net.*fbevents\.js|fbq\(/i, category: 'tracker' },
  { name: 'Hotjar', re: /static\.hotjar\.com/i, category: 'tracker' },
  { name: 'LinkedIn Insight', re: /snap\.licdn\.com\/li\.lms-analytics/i, category: 'tracker' },
  { name: 'Cloudflare', re: /cdnjs\.cloudflare\.com|cf-ray/i, category: 'cdn' },
];

export async function runTechTrackers(ctx: ScanContext): Promise<ModuleResult> {
  const out: ModuleResult = { observations: [], findings: [], assets: [] };
  if (ctx.parsed.target_type === 'ipv4' || ctx.parsed.target_type === 'ipv6') return out;
  const url = ctx.parsed.normalized_target;
  try {
    const t0 = Date.now();
    const res = await timedFetch(url, { headers: { 'user-agent': 'SurfaceScan360/1.0', 'accept': 'text/html,*/*' } });
    const ttfb = Date.now() - t0;
    const html = (await res.text()).slice(0, 500_000);
    const totalMs = Date.now() - t0;

    const detected: Array<{ name: string; category: string }> = [];
    for (const sig of TECH_SIGNATURES) if (sig.re.test(html)) detected.push({ name: sig.name, category: sig.category });
    const server = res.headers.get('server'); const xpb = res.headers.get('x-powered-by');
    if (server) detected.push({ name: server, category: 'server' });
    if (xpb) detected.push({ name: xpb, category: 'runtime' });

    const trackers = detected.filter((d) => d.category === 'tracker' || d.category === 'analytics');
    out.observations.push({ module: 'tech_stack', observation_type: 'detected', title: 'Tecnologie rilevate', value: { url, detected, trackers_count: trackers.length, page_bytes: html.length } });
    out.observations.push({ module: 'performance', observation_type: 'timing', title: 'Performance HTTP', value: { url, ttfb_ms: ttfb, total_ms: totalMs, status: res.status } });

    if (trackers.length >= 5) {
      out.findings.push({ module: 'tech_stack', finding_type: 'many_trackers', title: `Molti tracker rilevati (${trackers.length})`, severity: 'low', affected_url: url, evidence: { trackers } });
    }
    if (totalMs > 5000) {
      out.findings.push({ module: 'performance', finding_type: 'slow_response', title: `Risposta lenta (${totalMs}ms)`, severity: 'low', affected_url: url });
    }
    // Outdated jQuery
    const jq = html.match(/jquery[.-](\d+)\.(\d+)\.(\d+)/i);
    if (jq && parseInt(jq[1], 10) < 3) {
      out.findings.push({ module: 'tech_stack', finding_type: 'outdated_jquery', title: `jQuery datato ${jq[1]}.${jq[2]}.${jq[3]}`, severity: 'medium', affected_url: url, remediation: 'Aggiornare a jQuery 3.x o rimuovere se non necessario.' });
    }
  } catch (e) {
    out.observations.push({ module: 'tech_stack', observation_type: 'error', value: { error: String(e) } });
  }
  return out;
}

export const EXTRA_RECON_MODULES = [runSslCt, runDnssec, runTechTrackers] as const;
