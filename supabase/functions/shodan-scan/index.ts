// Shodan API scanner — Engine v2
// - Accetta `targets: string[]` (compatibilità v1) OPPURE `rule: {entry_type,input_value,ip_start,ip_end}`
// - Per range/CIDR usa /shodan/host/search?query=net:start-end (1 query API per range)
// - Espone banners[] per IP multi-servizio
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface ShodanBanner {
  ip_str?: string;
  port?: number;
  transport?: string;
  product?: string;
  version?: string;
  hostnames?: string[];
  vulns?: string[] | Record<string, { cvss?: number; summary?: string }>;
  _shodan?: { module?: string };
  org?: string;
  os?: string;
  location?: { country_name?: string };
  timestamp?: string;
}

interface ShodanHost {
  ip_str: string;
  hostnames?: string[];
  ports?: number[];
  vulns?: string[] | Record<string, { cvss?: number; summary?: string }>;
  data?: ShodanBanner[];
  org?: string;
  os?: string;
  country_name?: string;
  last_update?: string;
}

interface ParsedAsset {
  ip: string;
  hostname: string;
  ports: number[];
  services: string[];
  score: number;
  risk: 'Basso' | 'Medio' | 'Alto';
  status: 'Sicuro' | 'Attenzione' | 'Critico';
  cves: Array<{ id: string; severity: 'low' | 'medium' | 'high'; description: string }>;
  banners: Array<{ port: number; transport?: string; product?: string; module?: string; version?: string }>;
  org?: string;
  os?: string;
  country?: string;
  last_update?: string;
  raw_service_count: number;
}

const MAX_IPS_PER_RULE = 256;

const severityFromCvss = (cvss?: number): 'low' | 'medium' | 'high' => {
  if (cvss == null) return 'low';
  if (cvss >= 7) return 'high';
  if (cvss >= 4) return 'medium';
  return 'low';
};

const isIp = (v: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v);

function parseHost(host: ShodanHost): ParsedAsset {
  const ports = Array.from(new Set(host.ports ?? [])).sort((a, b) => a - b);
  const banners = (host.data ?? []).map((d) => ({
    port: d.port ?? 0,
    transport: d.transport,
    product: d.product,
    module: d._shodan?.module,
    version: d.version,
  }));
  const services = Array.from(
    new Set(banners.map((b) => b.product || b.module || b.transport).filter(Boolean) as string[])
  );

  const cves: ParsedAsset['cves'] = [];
  if (host.vulns) {
    if (Array.isArray(host.vulns)) {
      for (const id of host.vulns) cves.push({ id, severity: 'medium', description: 'CVE rilevata da Shodan' });
    } else {
      for (const [id, info] of Object.entries(host.vulns)) {
        cves.push({ id, severity: severityFromCvss(info?.cvss), description: info?.summary ?? 'CVE rilevata da Shodan' });
      }
    }
  }

  const high = cves.filter((c) => c.severity === 'high').length;
  const med = cves.filter((c) => c.severity === 'medium').length;
  const low = cves.filter((c) => c.severity === 'low').length;
  const sensitive = ports.filter((p) => [21, 23, 445, 3389, 3306, 5432, 1433, 6379, 27017].includes(p)).length;
  let score = 100 - high * 15 - med * 7 - low * 2 - sensitive * 4;
  score = Math.max(0, Math.min(100, score));

  let risk: ParsedAsset['risk'] = 'Basso';
  let status: ParsedAsset['status'] = 'Sicuro';
  if (score < 60) { risk = 'Alto'; status = 'Critico'; }
  else if (score < 80) { risk = 'Medio'; status = 'Attenzione'; }

  return {
    ip: host.ip_str,
    hostname: host.hostnames?.[0] ?? host.ip_str,
    ports, services, score, risk, status, cves, banners,
    org: host.org, os: host.os, country: host.country_name,
    last_update: host.last_update,
    raw_service_count: banners.length,
  };
}

// Aggrega banner provenienti da host/search (un banner = un servizio) in un host completo per IP
function aggregateBannersToHosts(banners: ShodanBanner[]): ShodanHost[] {
  const map = new Map<string, ShodanHost>();
  for (const b of banners) {
    const ip = b.ip_str;
    if (!ip) continue;
    let h = map.get(ip);
    if (!h) {
      h = {
        ip_str: ip,
        hostnames: b.hostnames ?? [],
        ports: [],
        data: [],
        vulns: {},
        org: b.org,
        os: b.os,
        country_name: b.location?.country_name,
        last_update: b.timestamp,
      };
      map.set(ip, h);
    }
    if (b.port) h.ports!.push(b.port);
    h.data!.push(b);
    if (b.vulns) {
      if (Array.isArray(b.vulns)) {
        for (const v of b.vulns) (h.vulns as Record<string, any>)[v] = { summary: 'CVE rilevata' };
      } else {
        Object.assign(h.vulns as Record<string, any>, b.vulns);
      }
    }
    if (b.hostnames?.length) h.hostnames = Array.from(new Set([...(h.hostnames ?? []), ...b.hostnames]));
  }
  return Array.from(map.values());
}

async function shodanHostGet(ip: string, key: string): Promise<ShodanHost | null> {
  const r = await fetch(`https://api.shodan.io/shodan/host/${ip}?key=${key}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`host ${ip} [${r.status}]: ${await r.text()}`);
  return await r.json();
}

async function shodanSearch(query: string, key: string): Promise<ShodanBanner[]> {
  // host/search restituisce un banner per servizio: 1 IP multi-porta = N banner
  const r = await fetch(`https://api.shodan.io/shodan/host/search?key=${key}&query=${encodeURIComponent(query)}&minify=false`);
  if (!r.ok) throw new Error(`search [${r.status}]: ${await r.text()}`);
  const j = await r.json();
  return (j?.matches ?? []) as ShodanBanner[];
}

async function shodanResolve(hostname: string, key: string): Promise<string | null> {
  const r = await fetch(`https://api.shodan.io/dns/resolve?hostnames=${encodeURIComponent(hostname)}&key=${key}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j?.[hostname] ?? null;
}

async function scanSingleTarget(target: string, key: string): Promise<{ assets: ParsedAsset[]; errors: any[] }> {
  const assets: ParsedAsset[] = [];
  const errors: any[] = [];
  try {
    let ip = target.trim();
    let resolvedHostname: string | null = null;
    if (!isIp(ip)) {
      resolvedHostname = ip;
      const r = await shodanResolve(ip, key);
      if (!r) { errors.push({ target, error: 'DNS non risolto' }); return { assets, errors }; }
      ip = r;
    }
    const host = await shodanHostGet(ip, key);
    if (!host) {
      assets.push({
        ip, hostname: resolvedHostname ?? ip, ports: [], services: [], score: 100,
        risk: 'Basso', status: 'Sicuro', cves: [], banners: [], raw_service_count: 0,
      });
    } else {
      const p = parseHost(host);
      if (resolvedHostname) p.hostname = resolvedHostname;
      assets.push(p);
    }
  } catch (e) {
    errors.push({ target, error: e instanceof Error ? e.message : 'unknown' });
  }
  return { assets, errors };
}

async function scanRange(ipStart: string, ipEnd: string, key: string): Promise<{ assets: ParsedAsset[]; errors: any[]; truncated: boolean }> {
  const errors: any[] = [];
  try {
    // 1 chiamata API per l'intero range
    const banners = await shodanSearch(`net:${ipStart}-${ipEnd}`, key);
    const hosts = aggregateBannersToHosts(banners);
    const truncated = hosts.length > MAX_IPS_PER_RULE;
    const sliced = hosts.slice(0, MAX_IPS_PER_RULE);
    return { assets: sliced.map(parseHost), errors, truncated };
  } catch (e) {
    errors.push({ target: `${ipStart}-${ipEnd}`, error: e instanceof Error ? e.message : 'unknown' });
    return { assets: [], errors, truncated: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SHODAN_API_KEY = Deno.env.get('SHODAN_API_KEY');
    if (!SHODAN_API_KEY) {
      return new Response(JSON.stringify({ error: 'SHODAN_API_KEY non configurata' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: authErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (authErr || !claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));

    // === Engine v2: rule singola (preferito per progressive scan) ===
    if (body.rule) {
      const rule = body.rule as { entry_type: 'single' | 'range' | 'cidr'; input_value: string; ip_start: string; ip_end: string };
      let result;
      if (rule.entry_type === 'single') {
        result = await scanSingleTarget(rule.input_value, SHODAN_API_KEY);
        return new Response(JSON.stringify({ ...result, truncated: false, rule_id: rule.input_value, scanned_at: new Date().toISOString() }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } else {
        result = await scanRange(rule.ip_start, rule.ip_end, SHODAN_API_KEY);
        return new Response(JSON.stringify({ ...result, rule_id: rule.input_value, scanned_at: new Date().toISOString() }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // === Compat v1: targets[] ===
    const targets: string[] = Array.isArray(body.targets) ? body.targets : [];
    if (targets.length === 0) {
      return new Response(JSON.stringify({ error: 'rule oppure targets[] richiesto' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (targets.length > 50) {
      return new Response(JSON.stringify({ error: 'Massimo 50 target per richiesta' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const assets: ParsedAsset[] = [];
    const errors: any[] = [];
    for (const t of targets) {
      const r = await scanSingleTarget(t, SHODAN_API_KEY);
      assets.push(...r.assets);
      errors.push(...r.errors);
    }

    return new Response(JSON.stringify({ assets, errors, scanned_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('shodan-scan error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
