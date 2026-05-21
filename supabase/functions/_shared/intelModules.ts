// Phase 2 intel modules: Shodan host lookup, urlscan.io search,
// shared-hosting / CDN detector. Tutti restituiscono dati pronti
// per essere inseriti in surface_external_intel + opzionali findings.

import type { ScanContext, Observation, Finding } from './osintModules.ts';

const TIMEOUT_MS = 12_000;

async function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

export interface IntelRow {
  provider: 'shodan' | 'urlscan' | 'hosting_context';
  target: string;
  found: boolean;
  summary: Record<string, unknown>;
  raw_response: unknown;
  confidence: 'high' | 'medium' | 'low';
}

export interface IntelResult {
  intel: IntelRow[];
  observations: Observation[];
  findings: Finding[];
}

// --- CDN / shared-hosting fingerprints -------------------------------------
const CDN_FINGERPRINTS = [
  { match: /cloudflare/i, label: 'Cloudflare', type: 'cdn_proxy' as const },
  { match: /akamai/i, label: 'Akamai', type: 'cdn_proxy' as const },
  { match: /fastly/i, label: 'Fastly', type: 'cdn_proxy' as const },
  { match: /cloudfront|amazonaws/i, label: 'AWS CloudFront/EC2', type: 'cdn_proxy' as const },
  { match: /vercel/i, label: 'Vercel', type: 'cdn_proxy' as const },
  { match: /netlify/i, label: 'Netlify', type: 'cdn_proxy' as const },
  { match: /github\.io|githubusercontent/i, label: 'GitHub Pages', type: 'shared_hosting' as const },
  { match: /heroku/i, label: 'Heroku', type: 'shared_hosting' as const },
  { match: /shopify/i, label: 'Shopify', type: 'shared_hosting' as const },
  { match: /squarespace/i, label: 'Squarespace', type: 'shared_hosting' as const },
  { match: /wixsite|wix\.com/i, label: 'Wix', type: 'shared_hosting' as const },
  { match: /aruba/i, label: 'Aruba', type: 'shared_hosting' as const },
];

export type HostingType = 'dedicated' | 'shared_hosting' | 'cdn_proxy' | 'unknown';

function detectHostingFromText(s: string | undefined | null): { type: HostingType; label?: string } {
  if (!s) return { type: 'unknown' };
  for (const f of CDN_FINGERPRINTS) if (f.match.test(s)) return { type: f.type, label: f.label };
  return { type: 'unknown' };
}

// --- Shodan host lookup ----------------------------------------------------
export async function shodanHostModule(ctx: ScanContext, ips: string[]): Promise<IntelResult> {
  const key = Deno.env.get('SHODAN_API_KEY');
  const out: IntelResult = { intel: [], observations: [], findings: [] };
  if (!key) {
    out.observations.push({
      module: 'shodan', observation_type: 'config_missing',
      title: 'SHODAN_API_KEY non configurata',
      value: { reason: 'missing_secret' }, severity: 'info', confidence: 'high',
    });
    return out;
  }
  if (!ips.length) return out;

  for (const ip of ips.slice(0, 5)) {
    try {
      const r = await timedFetch(`https://api.shodan.io/shodan/host/${ip}?key=${key}`);
      if (r.status === 404) {
        out.intel.push({ provider: 'shodan', target: ip, found: false, summary: { reason: 'not_found' }, raw_response: null, confidence: 'high' });
        out.observations.push({
          module: 'shodan', observation_type: 'host_not_found',
          title: `Shodan: nessun banner per ${ip}`,
          value: { ip }, severity: 'info', confidence: 'high',
        });
        continue;
      }
      if (!r.ok) throw new Error(`shodan ${r.status}`);
      const j = await r.json();
      const ports: number[] = Array.isArray(j.ports) ? j.ports : [];
      const hostnames: string[] = Array.isArray(j.hostnames) ? j.hostnames : [];
      const vulns: string[] = j.vulns ? (Array.isArray(j.vulns) ? j.vulns : Object.keys(j.vulns)) : [];
      const summary = { ports, hostnames, vulns, org: j.org, asn: j.asn, isp: j.isp, last_update: j.last_update };

      out.intel.push({ provider: 'shodan', target: ip, found: true, summary, raw_response: j, confidence: 'high' });
      out.observations.push({
        module: 'shodan', observation_type: 'host_banner',
        title: `Shodan ${ip}: ${ports.length} porte, ${vulns.length} CVE note`,
        value: summary, severity: vulns.length ? 'medium' : 'info', confidence: 'high',
      });

      // Findings per CVE già conosciute (basso attribution_confidence se contesto è cdn/shared)
      for (const cve of vulns.slice(0, 20)) {
        out.findings.push({
          module: 'shodan', finding_type: 'known_cve',
          title: `${cve} segnalata su ${ip}`,
          description: `Shodan ha rilevato la vulnerabilità ${cve} sull'IP ${ip}. Da validare con scan attivo.`,
          severity: 'medium',
          affected_asset: ip,
          attribution_confidence: 'medium',
          evidence: { cve, ip, org: j.org, ports },
        });
      }
    } catch (e) {
      out.observations.push({
        module: 'shodan', observation_type: 'lookup_failed',
        title: `Errore Shodan per ${ip}`,
        value: { ip, error: (e as Error).message }, severity: 'info', confidence: 'low',
      });
    }
  }
  return out;
}

// --- urlscan.io search (public, no key) ------------------------------------
export async function urlscanModule(ctx: ScanContext): Promise<IntelResult> {
  const out: IntelResult = { intel: [], observations: [], findings: [] };
  const domain = ctx.parsed.root_domain ?? ctx.parsed.hostname;
  if (!domain) return out;
  try {
    const r = await timedFetch(`https://urlscan.io/api/v1/search/?q=${encodeURIComponent('domain:' + domain)}&size=20`);
    if (!r.ok) throw new Error(`urlscan ${r.status}`);
    const j = await r.json();
    const results = Array.isArray(j.results) ? j.results : [];
    const recent = results.slice(0, 10).map((x: any) => ({
      url: x?.page?.url, ip: x?.page?.ip, country: x?.page?.country,
      server: x?.page?.server, date: x?.task?.time, scan: x?.result,
    }));
    out.intel.push({
      provider: 'urlscan', target: domain, found: results.length > 0,
      summary: { total: j.total ?? results.length, recent }, raw_response: j, confidence: 'medium',
    });
    out.observations.push({
      module: 'urlscan', observation_type: 'public_scans',
      title: `urlscan.io: ${results.length} scan pubblici per ${domain}`,
      value: { total: j.total ?? results.length, recent }, severity: 'info', confidence: 'medium',
    });
  } catch (e) {
    out.observations.push({
      module: 'urlscan', observation_type: 'lookup_failed',
      title: `Errore urlscan.io per ${domain}`,
      value: { error: (e as Error).message }, severity: 'info', confidence: 'low',
    });
  }
  return out;
}

// --- Shared hosting / CDN detector -----------------------------------------
export async function hostingContextModule(
  ctx: ScanContext,
  shodanIntel: IntelRow[],
  httpObs: Observation[],
): Promise<IntelResult> {
  const out: IntelResult = { intel: [], observations: [], findings: [] };
  const target = ctx.parsed.hostname ?? ctx.parsed.normalized_target;

  // Aggrega segnali: server header, shodan org/isp, hostnames sull'IP
  const signals: string[] = [];
  for (const o of httpObs) {
    const v: any = o.value;
    if (v?.headers?.server) signals.push(String(v.headers.server));
    if (v?.server) signals.push(String(v.server));
  }
  let coHostedCount = 0;
  for (const s of shodanIntel) {
    if (s.provider !== 'shodan') continue;
    const sum: any = s.summary;
    if (sum?.org) signals.push(String(sum.org));
    if (sum?.isp) signals.push(String(sum.isp));
    if (Array.isArray(sum?.hostnames)) coHostedCount = Math.max(coHostedCount, sum.hostnames.length);
  }

  let detected: { type: HostingType; label?: string } = { type: 'unknown' };
  for (const s of signals) {
    const d = detectHostingFromText(s);
    if (d.type !== 'unknown') { detected = d; break; }
  }
  // Soglia co-hosting: molti hostname sullo stesso IP → probabile shared
  if (detected.type === 'unknown' && coHostedCount >= 5) {
    detected = { type: 'shared_hosting', label: `${coHostedCount} hostname sull'IP` };
  }

  const confidence: 'high' | 'medium' | 'low' = detected.type === 'unknown' ? 'low' : signals.length >= 2 ? 'high' : 'medium';

  out.intel.push({
    provider: 'hosting_context', target,
    found: detected.type !== 'unknown',
    summary: { type: detected.type, label: detected.label, signals: signals.slice(0, 5), coHostedCount },
    raw_response: { signals, coHostedCount },
    confidence,
  });
  out.observations.push({
    module: 'hosting_context', observation_type: 'attribution',
    title: detected.type === 'unknown'
      ? `Contesto hosting non determinato per ${target}`
      : `Contesto rilevato: ${detected.type}${detected.label ? ` (${detected.label})` : ''}`,
    value: { type: detected.type, label: detected.label, signals, coHostedCount },
    severity: detected.type === 'shared_hosting' || detected.type === 'cdn_proxy' ? 'low' : 'info',
    confidence,
  });
  if (detected.type === 'shared_hosting' || detected.type === 'cdn_proxy') {
    out.findings.push({
      module: 'hosting_context', finding_type: 'attribution_warning',
      title: `Attribution attenuata: ${detected.type}`,
      description: `Le CVE rilevate a livello IP non sono necessariamente attribuibili a ${target} perché il target è dietro ${detected.label ?? detected.type}.`,
      severity: 'low',
      affected_asset: target,
      attribution_confidence: 'low',
      remediation: 'Per validare le CVE a livello applicativo usa scan attivi mirati al dominio (recon_safe / cve_web).',
      evidence: { type: detected.type, label: detected.label, signals: signals.slice(0, 5) },
    });
  }
  return out;
}
