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

// --- Shodan host lookup (enricher: CVE+CVSS, services, fingerprinting) ----
const SENSITIVE_PORTS: Record<number, string> = {
  21: 'FTP', 23: 'Telnet', 25: 'SMTP', 110: 'POP3', 135: 'RPC', 139: 'NetBIOS',
  445: 'SMB', 1433: 'MSSQL', 1521: 'Oracle', 2049: 'NFS', 3306: 'MySQL',
  3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis',
  9200: 'Elasticsearch', 11211: 'Memcached', 27017: 'MongoDB',
};

const sevFromCvss = (c?: number): 'info' | 'low' | 'medium' | 'high' | 'critical' => {
  if (c == null) return 'medium';
  if (c >= 9.0) return 'critical';
  if (c >= 7.0) return 'high';
  if (c >= 4.0) return 'medium';
  if (c > 0)    return 'low';
  return 'info';
};

interface ShodanService {
  port: number;
  transport?: string;
  product?: string;
  version?: string;
  module?: string;
  cpe?: string[];
  ssl?: { cert?: { subject?: any; issuer?: any; expires?: string }; versions?: string[]; cipher?: any };
  hostnames?: string[];
  banner_preview?: string;
}

function extractServices(data: any[]): ShodanService[] {
  if (!Array.isArray(data)) return [];
  return data.map((d) => ({
    port: d.port,
    transport: d.transport,
    product: d.product,
    version: d.version,
    module: d._shodan?.module,
    cpe: d.cpe23 || d.cpe,
    ssl: d.ssl ? { versions: d.ssl.versions, cipher: d.ssl.cipher, cert: d.ssl.cert ? { subject: d.ssl.cert.subject, issuer: d.ssl.cert.issuer, expires: d.ssl.cert.expires } : undefined } : undefined,
    hostnames: d.hostnames,
    banner_preview: typeof d.data === 'string' ? d.data.slice(0, 200) : undefined,
  })).filter((s) => s.port != null);
}

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
      const services = extractServices(j.data);

      // vulns: può essere array di CVE o oggetto { CVE: { cvss, ... } }
      const vulnEntries: Array<{ cve: string; cvss?: number; summary?: string }> = [];
      if (j.vulns) {
        if (Array.isArray(j.vulns)) {
          for (const cve of j.vulns) vulnEntries.push({ cve: String(cve) });
        } else {
          for (const [cve, info] of Object.entries(j.vulns as Record<string, any>)) {
            vulnEntries.push({ cve, cvss: typeof info?.cvss === 'number' ? info.cvss : undefined, summary: info?.summary });
          }
        }
      }
      // Ordina per CVSS desc per la top-list
      vulnEntries.sort((a, b) => (b.cvss ?? 0) - (a.cvss ?? 0));

      // Fingerprint riassuntivo
      const fingerprint = {
        os: j.os || null,
        org: j.org || null,
        isp: j.isp || null,
        asn: j.asn || null,
        country: j.country_name || null,
        tags: Array.isArray(j.tags) ? j.tags : [],
        products: Array.from(new Set(services.map((s) => s.product).filter(Boolean))),
        cpes: Array.from(new Set(services.flatMap((s) => s.cpe || []).filter(Boolean))).slice(0, 30),
      };

      const summary = {
        ports, hostnames,
        services: services.map((s) => ({ port: s.port, transport: s.transport, product: s.product, version: s.version, module: s.module, ssl: !!s.ssl })),
        fingerprint,
        vulns_count: vulnEntries.length,
        vulns_top: vulnEntries.slice(0, 10),
        last_update: j.last_update,
      };

      out.intel.push({ provider: 'shodan', target: ip, found: true, summary, raw_response: j, confidence: 'high' });
      out.observations.push({
        module: 'shodan', observation_type: 'host_banner',
        title: `Shodan ${ip}: ${ports.length} porte, ${services.length} servizi, ${vulnEntries.length} CVE`,
        value: summary, severity: vulnEntries.some((v) => (v.cvss ?? 0) >= 7) ? 'high' : (vulnEntries.length ? 'medium' : 'info'),
        confidence: 'high',
      });

      // Observation dettagliata per ogni servizio (fingerprinting)
      for (const s of services) {
        out.observations.push({
          module: 'shodan', observation_type: 'service_fingerprint',
          title: `Servizio ${s.product || s.module || s.transport || 'unknown'} su ${ip}:${s.port}`,
          value: { ip, ...s }, severity: 'info', confidence: 'high',
        });
      }

      // Finding: porte sensibili esposte
      for (const p of ports) {
        const name = SENSITIVE_PORTS[p];
        if (!name) continue;
        const svc = services.find((s) => s.port === p);
        out.findings.push({
          module: 'shodan', finding_type: 'sensitive_port_exposed',
          title: `Porta sensibile esposta ${p}/${name}`,
          description: `Servizio ${name} accessibile pubblicamente su ${ip}:${p}${svc?.product ? ` (${svc.product}${svc.version ? ' ' + svc.version : ''})` : ''}.`,
          severity: [3389, 23, 445, 6379, 27017, 9200, 11211].includes(p) ? 'high' : 'medium',
          affected_asset: ip,
          port: p, protocol: svc?.transport || 'tcp',
          attribution_confidence: 'high',
          remediation: 'Limitare l\'accesso via firewall/VPN, disabilitare il servizio se non necessario, abilitare autenticazione forte.',
          evidence: { ip, port: p, product: svc?.product, version: svc?.version, banner: svc?.banner_preview },
        });
      }

      // Findings per CVE con severità da CVSS
      for (const v of vulnEntries.slice(0, 25)) {
        const svc = services.find((s) => (s.cpe || []).some((c) => /./.test(c))); // associazione best-effort
        out.findings.push({
          module: 'shodan', finding_type: 'known_cve',
          title: `${v.cve}${v.cvss != null ? ` (CVSS ${v.cvss.toFixed(1)})` : ''} su ${ip}`,
          description: v.summary || `Shodan ha rilevato ${v.cve} su ${ip}. Da validare con scan attivo.`,
          severity: sevFromCvss(v.cvss),
          affected_asset: ip,
          port: svc?.port, protocol: svc?.transport,
          cve: [v.cve],
          cvss: v.cvss,
          attribution_confidence: 'medium',
          evidence: { cve: v.cve, cvss: v.cvss, ip, org: j.org, ports, products: fingerprint.products },
        });
      }

      // Finding: certificato SSL scaduto/in scadenza dai servizi
      const now = Date.now();
      for (const s of services) {
        const expStr = s.ssl?.cert?.expires;
        if (!expStr) continue;
        const exp = Date.parse(expStr);
        if (isNaN(exp)) continue;
        const days = Math.floor((exp - now) / 86_400_000);
        if (days < 0) {
          out.findings.push({
            module: 'shodan', finding_type: 'tls_cert_expired',
            title: `Certificato TLS scaduto su ${ip}:${s.port}`,
            severity: 'high', affected_asset: ip, port: s.port,
            attribution_confidence: 'high', evidence: { expires: expStr, product: s.product },
          });
        } else if (days < 30) {
          out.findings.push({
            module: 'shodan', finding_type: 'tls_cert_expiring',
            title: `Certificato TLS in scadenza tra ${days}g su ${ip}:${s.port}`,
            severity: 'medium', affected_asset: ip, port: s.port,
            attribution_confidence: 'high', evidence: { expires: expStr },
          });
        }
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

// ASN/org noti per shared hosting o cloud multi-tenant (heuristics)
const SHARED_ASN_KEYWORDS = [
  /aruba/i, /ovh/i, /hetzner/i, /hostinger/i, /godaddy/i, /siteground/i,
  /bluehost/i, /dreamhost/i, /ionos/i, /1&1/i, /namecheap/i, /register\.it/i,
  /serverplan/i, /keliweb/i, /netsons/i, /tophost/i, /vhosting/i,
];
const CLOUD_ASN_KEYWORDS = [
  /amazon|aws/i, /google|gcp/i, /microsoft|azure/i, /digitalocean/i,
  /linode/i, /vultr/i, /oracle cloud/i,
];

// Reverse DNS lookup via DoH per arricchire la lista di co-hosted hostnames
async function reverseDns(ip: string): Promise<string[]> {
  try {
    const parts = ip.split('.');
    if (parts.length !== 4) return [];
    const arpa = `${parts.reverse().join('.')}.in-addr.arpa`;
    const r = await timedFetch(`https://dns.google/resolve?name=${arpa}&type=PTR`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.Answer ?? []).map((a: any) => String(a.data).replace(/\.$/, '')).filter(Boolean);
  } catch { return []; }
}

export async function hostingContextModule(
  ctx: ScanContext,
  shodanIntel: IntelRow[],
  httpObs: Observation[],
  resolvedIps: string[] = [],
): Promise<IntelResult> {
  const out: IntelResult = { intel: [], observations: [], findings: [] };
  const target = ctx.parsed.hostname ?? ctx.parsed.normalized_target;

  // Raccolta segnali tipizzati con peso
  type Signal = { source: string; value: string; weight: number; verdict: HostingType };
  const collected: Signal[] = [];

  // 1) HTTP server header
  for (const o of httpObs) {
    const v: any = o.value;
    const sv = v?.headers?.server || v?.server;
    if (sv) {
      const d = detectHostingFromText(String(sv));
      collected.push({ source: 'http_server_header', value: String(sv), weight: d.type === 'unknown' ? 5 : 25, verdict: d.type });
    }
    // Header tipici di shared hosting (cPanel, Plesk)
    const hdrs = v?.headers ?? {};
    for (const [k, val] of Object.entries(hdrs)) {
      const blob = `${k}: ${val}`;
      if (/x-(powered-by|cpanel|plesk|served-by|host)/i.test(k) || /cpanel|plesk/i.test(String(val))) {
        const d = detectHostingFromText(blob);
        collected.push({ source: `http_header:${k}`, value: blob, weight: /cpanel|plesk/i.test(blob) ? 30 : 10, verdict: d.type === 'unknown' && /cpanel|plesk/i.test(blob) ? 'shared_hosting' : d.type });
      }
    }
  }

  // 2) Shodan: org/isp/asn + hostnames co-locati sull'IP
  const coHostedSet = new Set<string>();
  let asnText = '';
  for (const s of shodanIntel) {
    if (s.provider !== 'shodan') continue;
    const sum: any = s.summary;
    const fp = sum?.fingerprint ?? {};
    const orgIsp = [fp.org, fp.isp, sum?.org, sum?.isp].filter(Boolean).join(' / ');
    if (orgIsp) {
      asnText += ' ' + orgIsp;
      const d = detectHostingFromText(orgIsp);
      let verdict: HostingType = d.type;
      if (verdict === 'unknown') {
        if (SHARED_ASN_KEYWORDS.some((re) => re.test(orgIsp))) verdict = 'shared_hosting';
        else if (CLOUD_ASN_KEYWORDS.some((re) => re.test(orgIsp))) verdict = 'cdn_proxy';
      }
      collected.push({ source: 'shodan_org_isp', value: orgIsp, weight: verdict === 'unknown' ? 5 : 20, verdict });
    }
    if (Array.isArray(sum?.hostnames)) for (const h of sum.hostnames) coHostedSet.add(String(h));
  }

  // 3) Reverse DNS PTR sui resolvedIps (max 3)
  for (const ip of resolvedIps.slice(0, 3)) {
    const ptrs = await reverseDns(ip);
    for (const p of ptrs) coHostedSet.add(p);
  }

  const targetLower = target.toLowerCase();
  const coHosted = Array.from(coHostedSet).filter((h) => h && !h.toLowerCase().includes(targetLower));
  const coHostedCount = coHosted.length;

  if (coHostedCount > 0) {
    let weight = 10;
    if (coHostedCount >= 50) weight = 60;
    else if (coHostedCount >= 10) weight = 40;
    else if (coHostedCount >= 3) weight = 25;
    collected.push({
      source: 'co_hosted_hostnames',
      value: `${coHostedCount} hostname distinti co-locati`,
      weight,
      verdict: coHostedCount >= 3 ? 'shared_hosting' : 'unknown',
    });
  }

  // Scoring multi-tenant 0-100
  let sharedScore = 0;
  let cdnScore = 0;
  let dedicatedSignals = 0;
  for (const c of collected) {
    if (c.verdict === 'shared_hosting') sharedScore += c.weight;
    else if (c.verdict === 'cdn_proxy') cdnScore += c.weight;
    else if (c.verdict === 'dedicated') dedicatedSignals += c.weight;
  }
  sharedScore = Math.min(100, sharedScore);
  cdnScore = Math.min(100, cdnScore);

  let detected: { type: HostingType; label?: string };
  if (sharedScore >= 40 && sharedScore >= cdnScore) {
    detected = { type: 'shared_hosting', label: coHostedCount >= 3 ? `${coHostedCount} domini co-locati` : (collected.find((c) => c.verdict === 'shared_hosting')?.value ?? 'segnali multi-tenant') };
  } else if (cdnScore >= 25) {
    detected = { type: 'cdn_proxy', label: collected.find((c) => c.verdict === 'cdn_proxy')?.value ?? 'CDN/proxy rilevato' };
  } else if (sharedScore >= 20) {
    detected = { type: 'shared_hosting', label: 'segnali deboli di multi-tenancy' };
  } else if (dedicatedSignals > 0 || (resolvedIps.length === 1 && coHostedCount === 0)) {
    detected = { type: 'dedicated' };
  } else {
    detected = { type: 'unknown' };
  }

  const confidence: 'high' | 'medium' | 'low' =
    sharedScore >= 60 || cdnScore >= 50 ? 'high'
    : sharedScore >= 25 || cdnScore >= 25 ? 'medium'
    : 'low';

  const summary = {
    type: detected.type,
    label: detected.label,
    shared_score: sharedScore,
    cdn_score: cdnScore,
    multi_tenant: detected.type === 'shared_hosting',
    co_hosted_count: coHostedCount,
    co_hosted_sample: coHosted.slice(0, 15),
    signals: collected.map((c) => ({ source: c.source, value: c.value.slice(0, 200), weight: c.weight, verdict: c.verdict })),
    resolved_ips: resolvedIps,
  };

  out.intel.push({
    provider: 'hosting_context', target,
    found: detected.type !== 'unknown',
    summary,
    raw_response: { collected, coHosted, asnText: asnText.trim() },
    confidence,
  });
  out.observations.push({
    module: 'hosting_context', observation_type: 'attribution',
    title: detected.type === 'unknown'
      ? `Contesto hosting non determinato per ${target}`
      : `Hosting: ${detected.type}${detected.label ? ` (${detected.label})` : ''} · shared=${sharedScore} cdn=${cdnScore}`,
    value: summary,
    severity: detected.type === 'shared_hosting' ? 'low' : 'info',
    confidence,
  });
  if (detected.type === 'shared_hosting') {
    out.findings.push({
      module: 'hosting_context', finding_type: 'shared_hosting_detected',
      title: `Infrastruttura multi-tenant rilevata (score ${sharedScore}/100)`,
      description: `${target} sembra ospitato su infrastruttura condivisa${coHostedCount ? ` con almeno ${coHostedCount} altri hostname sullo stesso IP` : ''}. Le CVE/banner a livello IP NON sono direttamente attribuibili al target.`,
      severity: 'low',
      affected_asset: target,
      attribution_confidence: 'low',
      remediation: 'Valida le CVE con scan attivi a livello applicativo (recon_safe / cve_web). Considera hosting dedicato per ridurre rischio side-channel e abuso reputazionale.',
      evidence: {
        shared_score: sharedScore,
        co_hosted_count: coHostedCount,
        co_hosted_sample: coHosted.slice(0, 20),
        top_signals: collected.filter((c) => c.verdict === 'shared_hosting').slice(0, 5),
        resolved_ips: resolvedIps,
      },
    });
  } else if (detected.type === 'cdn_proxy') {
    out.findings.push({
      module: 'hosting_context', finding_type: 'cdn_proxy_detected',
      title: `Target dietro CDN/proxy: ${detected.label ?? 'unknown'}`,
      description: `L'IP risolto appartiene a un CDN/proxy. I banner Shodan riflettono il provider, non il backend reale.`,
      severity: 'info',
      affected_asset: target,
      attribution_confidence: 'low',
      remediation: 'Per analisi del backend reale usa scan attivi sul dominio o ricerca origin IP (passive DNS storico).',
      evidence: { cdn_score: cdnScore, top_signals: collected.filter((c) => c.verdict === 'cdn_proxy').slice(0, 5) },
    });
  }
  return out;
}
