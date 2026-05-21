// Shodan API scanner — fetches host data for given IPs/hostnames and parses
// it into a normalized "asset" shape used by SurfaceScan360.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface ShodanHost {
  ip_str: string;
  hostnames?: string[];
  ports?: number[];
  vulns?: string[] | Record<string, { cvss?: number; summary?: string }>;
  data?: Array<{
    port?: number;
    transport?: string;
    product?: string;
    version?: string;
    _shodan?: { module?: string };
  }>;
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
  org?: string;
  os?: string;
  country?: string;
  last_update?: string;
  raw_service_count: number;
}

const severityFromCvss = (cvss?: number): 'low' | 'medium' | 'high' => {
  if (cvss == null) return 'low';
  if (cvss >= 7) return 'high';
  if (cvss >= 4) return 'medium';
  return 'low';
};

// Parser: converte risposta Shodan in asset normalizzato
export function parseShodanHost(host: ShodanHost): ParsedAsset {
  const ports = Array.from(new Set(host.ports ?? [])).sort((a, b) => a - b);

  const services = Array.from(
    new Set(
      (host.data ?? [])
        .map((d) => d.product || d._shodan?.module || d.transport)
        .filter(Boolean) as string[]
    )
  );

  const cves: ParsedAsset['cves'] = [];
  if (host.vulns) {
    if (Array.isArray(host.vulns)) {
      for (const id of host.vulns) {
        cves.push({ id, severity: 'medium', description: 'CVE rilevata da Shodan' });
      }
    } else {
      for (const [id, info] of Object.entries(host.vulns)) {
        cves.push({
          id,
          severity: severityFromCvss(info?.cvss),
          description: info?.summary ?? 'CVE rilevata da Shodan',
        });
      }
    }
  }

  // Score: 100 - penalità per CVE e porte sensibili
  const highCves = cves.filter((c) => c.severity === 'high').length;
  const medCves = cves.filter((c) => c.severity === 'medium').length;
  const lowCves = cves.filter((c) => c.severity === 'low').length;
  const sensitivePorts = ports.filter((p) => [21, 23, 445, 3389, 3306, 5432, 1433, 6379, 27017].includes(p)).length;

  let score = 100 - highCves * 15 - medCves * 7 - lowCves * 2 - sensitivePorts * 4;
  score = Math.max(0, Math.min(100, score));

  let risk: ParsedAsset['risk'] = 'Basso';
  let status: ParsedAsset['status'] = 'Sicuro';
  if (score < 60) { risk = 'Alto'; status = 'Critico'; }
  else if (score < 80) { risk = 'Medio'; status = 'Attenzione'; }

  return {
    ip: host.ip_str,
    hostname: host.hostnames?.[0] ?? host.ip_str,
    ports,
    services,
    score,
    risk,
    status,
    cves,
    org: host.org,
    os: host.os,
    country: host.country_name,
    last_update: host.last_update,
    raw_service_count: (host.data ?? []).length,
  };
}

async function shodanHost(ip: string, apiKey: string): Promise<ShodanHost | null> {
  const url = `https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${apiKey}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Shodan host ${ip} fallito [${res.status}]: ${txt}`);
  }
  return await res.json();
}

async function shodanResolve(hostname: string, apiKey: string): Promise<string | null> {
  const url = `https://api.shodan.io/dns/resolve?hostnames=${encodeURIComponent(hostname)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  return j?.[hostname] ?? null;
}

function isIp(value: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SHODAN_API_KEY = Deno.env.get('SHODAN_API_KEY');
    if (!SHODAN_API_KEY) {
      return new Response(JSON.stringify({ error: 'SHODAN_API_KEY non configurata' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: authErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (authErr || !claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targets: string[] = Array.isArray(body.targets) ? body.targets : [];
    if (targets.length === 0) {
      return new Response(JSON.stringify({ error: 'targets richiesto (array di IP o hostname)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (targets.length > 50) {
      return new Response(JSON.stringify({ error: 'Massimo 50 target per richiesta' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const assets: ParsedAsset[] = [];
    const errors: Array<{ target: string; error: string }> = [];

    for (const target of targets) {
      try {
        let ip = target.trim();
        let resolvedHostname: string | null = null;
        if (!isIp(ip)) {
          resolvedHostname = ip;
          const resolved = await shodanResolve(ip, SHODAN_API_KEY);
          if (!resolved) { errors.push({ target, error: 'DNS non risolto' }); continue; }
          ip = resolved;
        }
        const host = await shodanHost(ip, SHODAN_API_KEY);
        if (!host) {
          // Nessuna info Shodan: asset minimale "non esposto"
          assets.push({
            ip, hostname: resolvedHostname ?? ip, ports: [], services: [],
            score: 100, risk: 'Basso', status: 'Sicuro', cves: [], raw_service_count: 0,
          });
          continue;
        }
        const parsed = parseShodanHost(host);
        if (resolvedHostname) parsed.hostname = resolvedHostname;
        assets.push(parsed);
      } catch (e) {
        errors.push({ target, error: e instanceof Error ? e.message : 'unknown' });
      }
    }

    return new Response(JSON.stringify({ assets, errors, scanned_at: new Date().toISOString() }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('shodan-scan error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
