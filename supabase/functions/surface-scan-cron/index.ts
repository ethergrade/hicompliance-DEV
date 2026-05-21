// Cron weekly Surface Scan: per ogni organization con regole monitorate,
// esegue scan Shodan e salva snapshot su `surface_scan_history`.
// Invocato da pg_cron. Auth: x-cron-secret oppure service role.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface MonitoredRule {
  id: string;
  organization_id: string;
  entry_type: 'single' | 'range' | 'cidr';
  input_value: string;
  ip_start: string;
  ip_end: string;
}

interface ShodanBanner {
  ip_str?: string;
  port?: number;
  hostnames?: string[];
  product?: string;
  transport?: string;
  vulns?: string[] | Record<string, { cvss?: number }>;
  _shodan?: { module?: string };
  org?: string;
  os?: string;
  timestamp?: string;
}

const MAX_IPS_PER_RULE = 256;

const sev = (c?: number) => (c == null ? 'low' : c >= 7 ? 'high' : c >= 4 ? 'medium' : 'low');
const isIp = (v: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v);

async function shodanHost(ip: string, key: string) {
  const r = await fetch(`https://api.shodan.io/shodan/host/${ip}?key=${key}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`host ${ip} [${r.status}]`);
  return await r.json();
}
async function shodanResolve(h: string, key: string) {
  const r = await fetch(`https://api.shodan.io/dns/resolve?hostnames=${encodeURIComponent(h)}&key=${key}`);
  if (!r.ok) return null;
  return (await r.json())?.[h] ?? null;
}
async function shodanSearch(q: string, key: string): Promise<ShodanBanner[]> {
  const r = await fetch(`https://api.shodan.io/shodan/host/search?key=${key}&query=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error(`search [${r.status}]`);
  return (await r.json())?.matches ?? [];
}

function aggregateAsset(host: any) {
  const ports: number[] = Array.from(new Set(host.ports ?? [])).sort((a: number, b: number) => a - b) as number[];
  const cves: Array<{ id: string; severity: 'low' | 'medium' | 'high' }> = [];
  if (host.vulns) {
    if (Array.isArray(host.vulns)) host.vulns.forEach((id: string) => cves.push({ id, severity: 'medium' }));
    else for (const [id, info] of Object.entries(host.vulns as Record<string, { cvss?: number }>))
      cves.push({ id, severity: sev(info?.cvss) });
  }
  const high = cves.filter(c => c.severity === 'high').length;
  const med = cves.filter(c => c.severity === 'medium').length;
  const low = cves.filter(c => c.severity === 'low').length;
  const sens = ports.filter(p => [21, 23, 445, 3389, 3306, 5432, 1433, 6379, 27017].includes(p)).length;
  let score = 100 - high * 15 - med * 7 - low * 2 - sens * 4;
  score = Math.max(0, Math.min(100, score));
  let status: 'Sicuro' | 'Attenzione' | 'Critico' = 'Sicuro';
  if (score < 60) status = 'Critico'; else if (score < 80) status = 'Attenzione';
  return {
    ip: host.ip_str,
    hostname: host.hostnames?.[0] ?? host.ip_str,
    ports, score, status,
    cves_high: high, cves_medium: med, cves_low: low,
    services: Array.from(new Set((host.data ?? []).map((d: any) => d.product || d._shodan?.module || d.transport).filter(Boolean))),
  };
}

function bannersToHosts(banners: ShodanBanner[]) {
  const map = new Map<string, any>();
  for (const b of banners) {
    if (!b.ip_str) continue;
    let h = map.get(b.ip_str);
    if (!h) { h = { ip_str: b.ip_str, hostnames: [], ports: [], data: [], vulns: {} }; map.set(b.ip_str, h); }
    if (b.port) h.ports.push(b.port);
    h.data.push(b);
    if (b.vulns) {
      if (Array.isArray(b.vulns)) b.vulns.forEach(v => (h.vulns[v] = {}));
      else Object.assign(h.vulns, b.vulns);
    }
    if (b.hostnames?.length) h.hostnames = Array.from(new Set([...h.hostnames, ...b.hostnames]));
  }
  return Array.from(map.values());
}

interface RuleScanResult {
  rule: MonitoredRule;
  host: any | null;
  ip: string | null;
}

async function scanOrganization(orgId: string, rules: MonitoredRule[], shodanKey: string) {
  const assets: any[] = [];
  const truncated: string[] = [];
  const perRule: RuleScanResult[] = [];
  for (const r of rules) {
    try {
      if (r.entry_type === 'single') {
        let ip = r.input_value;
        if (!isIp(ip)) {
          const resolved = await shodanResolve(ip, shodanKey);
          if (!resolved) { perRule.push({ rule: r, host: null, ip: null }); continue; }
          ip = resolved;
        }
        const host = await shodanHost(ip, shodanKey);
        if (host) assets.push(aggregateAsset(host));
        perRule.push({ rule: r, host, ip });
      } else {
        const banners = await shodanSearch(`net:${r.ip_start}-${r.ip_end}`, shodanKey);
        const hosts = bannersToHosts(banners);
        if (hosts.length > MAX_IPS_PER_RULE) truncated.push(r.input_value);
        hosts.slice(0, MAX_IPS_PER_RULE).forEach(h => assets.push(aggregateAsset(h)));
        perRule.push({ rule: r, host: hosts[0] ?? null, ip: hosts[0]?.ip_str ?? null });
      }
    } catch (e) {
      console.error(`Rule ${r.input_value} failed:`, e);
      perRule.push({ rule: r, host: null, ip: null });
    }
  }
  // Dedup
  const dedup = new Map<string, any>();
  assets.forEach(a => dedup.set(a.ip, a));
  return { assets: Array.from(dedup.values()), truncated, perRule };
}

async function maybeTriggerAutoValidation(
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  perRule: RuleScanResult[],
) {
  for (const r of perRule) {
    const target = r.rule.input_value;
    const host = r.host;
    const hostnames: string[] = host?.hostnames ?? [];
    const ports: number[] = host?.ports ?? [];
    const vulns: string[] = host?.vulns
      ? Array.isArray(host.vulns) ? host.vulns : Object.keys(host.vulns)
      : [];
    const snapshot = host ? {
      found: true,
      hostnames,
      ports,
      vulns,
      last_update: host.last_update,
      asn: host.asn,
      org: host.org,
    } : { found: false, hostnames: [], ports: [], vulns: [] };

    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/pentest-tools-orchestrator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          organization_id: orgId,
          target,
          profile: 'recon_safe',
          triggered_by: 'auto_from_shodan',
          resolved_ips: r.ip ? [r.ip] : [],
          shodan_snapshot: snapshot,
        }),
      });
      const j = await resp.json().catch(() => ({}));
      console.log(`Auto-validation org=${orgId} target=${target}: ${resp.status}`, j?.error ?? j?.job_id ?? 'ok');
    } catch (e) {
      console.error(`Auto-validation failed for ${target}:`, e);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SHODAN_API_KEY = Deno.env.get('SHODAN_API_KEY');
    if (!SHODAN_API_KEY) {
      return new Response(JSON.stringify({ error: 'SHODAN_API_KEY missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const orgFilter: string | undefined = body.organization_id;
    const triggeredBy: string = body.triggered_by ?? 'cron';

    // 1) Carica regole monitorate (filtra opzionalmente per org)
    let query = supabase.from('surface_scan_monitored_ips').select('*');
    if (orgFilter) query = query.eq('organization_id', orgFilter);
    const { data: rules, error: rulesErr } = await query;
    if (rulesErr) throw rulesErr;

    // 2) Raggruppa per organization
    const byOrg = new Map<string, MonitoredRule[]>();
    for (const r of (rules ?? []) as MonitoredRule[]) {
      const arr = byOrg.get(r.organization_id) ?? [];
      arr.push(r);
      byOrg.set(r.organization_id, arr);
    }

    const results: any[] = [];

    for (const [orgId, orgRules] of byOrg.entries()) {
      const { assets, truncated } = await scanOrganization(orgId, orgRules, SHODAN_API_KEY);

      const total = assets.length;
      const critical = assets.filter(a => a.status === 'Critico').length;
      const warning = assets.filter(a => a.status === 'Attenzione').length;
      const safe = assets.filter(a => a.status === 'Sicuro').length;
      const avg = total === 0 ? 0 : assets.reduce((s, a) => s + a.score, 0) / total;
      const high = assets.reduce((s, a) => s + a.cves_high, 0);
      const med = assets.reduce((s, a) => s + a.cves_medium, 0);
      const low = assets.reduce((s, a) => s + a.cves_low, 0);

      const { error: insErr } = await supabase.from('surface_scan_history').insert({
        organization_id: orgId,
        total_assets: total,
        critical_count: critical,
        warning_count: warning,
        safe_count: safe,
        avg_score: Math.round(avg * 100) / 100,
        high_cves: high,
        medium_cves: med,
        low_cves: low,
        truncated_rules: truncated,
        assets_snapshot: assets,
        triggered_by: triggeredBy,
      });
      if (insErr) {
        console.error(`Insert failed for org ${orgId}:`, insErr);
        results.push({ orgId, ok: false, error: insErr.message });
      } else {
        results.push({ orgId, ok: true, total_assets: total, critical, warning, safe });
      }
    }

    return new Response(
      JSON.stringify({ scanned_at: new Date().toISOString(), organizations: results.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('surface-scan-cron error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
