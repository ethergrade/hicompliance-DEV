// Cron weekly Surface Scan: per ogni organization con regole monitorate,
// esegue scan Shodan e salva snapshot su `surface_scan_history`.
// Invocato da pg_cron. Auth: x-cron-secret oppure service role.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dispatchSurfaceScanQueue } from '../_shared/surface-scan-engine.ts';

interface MonitoredRule {
  id: string;
  organization_id: string;
  entry_type: 'single' | 'range' | 'cidr' | 'domain';
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
const REPORT_SCOPE_REFRESH_TIMEOUT = 45_000;
const DARKRISK_WEEKLY_SYNC_TIMEOUT = 45_000;

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
  const portsRaw = Array.isArray(host?.ports)
    ? host.ports.filter((p: unknown): p is number => typeof p === 'number' && Number.isFinite(p))
    : [];
  const ports: number[] = Array.from(new Set<number>(portsRaw)).sort((a, b) => a - b);
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

async function scanOrganization(orgId: string, rules: MonitoredRule[], shodanKey: string) {
  const assets: any[] = [];
  const truncated: string[] = [];
  for (const r of rules) {
    try {
      // 'single' (IP) e 'domain' (hostname) → 1 asset (host risolto)
      // 'range' → scan CIDR via shodanSearch (limitato)
      if (r.entry_type === 'range' && r.ip_start && r.ip_end) {
        const banners = await shodanSearch(`net:${r.ip_start}-${r.ip_end}`, shodanKey);
        const hosts = bannersToHosts(banners);
        if (hosts.length > MAX_IPS_PER_RULE) truncated.push(r.input_value);
        hosts.slice(0, MAX_IPS_PER_RULE).forEach(h => assets.push(aggregateAsset(h)));
      } else {
        let ip = r.input_value;
        if (!isIp(ip)) {
          const resolved = await shodanResolve(ip, shodanKey);
          if (!resolved) continue;
          ip = resolved;
        }
        const host = await shodanHost(ip, shodanKey);
        if (host) assets.push(aggregateAsset(host));
      }
    } catch (e) {
      console.error(`Rule ${r.input_value} failed:`, e);
    }
  }
  // Dedup
  const dedup = new Map<string, any>();
  assets.forEach(a => dedup.set(a.ip, a));
  return { assets: Array.from(dedup.values()), truncated };
}

async function refreshWeeklyScopeRepositoryReport(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  internalSecret: string | null,
  orgId: string,
) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REPORT_SCOPE_REFRESH_TIMEOUT);
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/surfacescan360-ai-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        ...(internalSecret ? { 'x-surface-internal-secret': internalSecret } : {}),
      },
      body: JSON.stringify({
        organization_id: orgId,
        scope_mode: 'organization_scope',
        trigger_source: 'cron_weekly_repository',
        force_regenerate: true,
        created_by: null,
      }),
      signal: ctrl.signal,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error) {
      await supabase.from('external_scan_audit_log').insert({
        organization_id: orgId,
        actor_email: 'system:cron',
        action: 'auto_scope_report_failed',
        details: {
          http_status: response.status,
          error: body?.error || 'unknown',
        },
      });
      return;
    }

    await supabase.from('external_scan_audit_log').insert({
      organization_id: orgId,
      scan_job_id: body?.report?.scan?.job_id ?? null,
      actor_email: 'system:cron',
      action: 'auto_scope_report_generated',
      details: {
        repository_id: body?.repository_id || null,
        mode: body?.report?.report_repository?.mode || null,
        generated_at: body?.report?.generated_at || null,
      },
    });
  } catch (error) {
    await supabase.from('external_scan_audit_log').insert({
      organization_id: orgId,
      actor_email: 'system:cron',
      action: 'auto_scope_report_failed',
      details: {
        error: (error as Error)?.message || 'network_error',
      },
    });
  } finally {
    clearTimeout(t);
  }
}

async function triggerWeeklyDarkRiskStandardScan(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  internalSecret: string | null,
  orgId: string,
) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DARKRISK_WEEKLY_SYNC_TIMEOUT);
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/darkrisk360-sync-surfacescan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        ...(internalSecret ? { 'x-darkrisk-internal-secret': internalSecret } : {}),
      },
      body: JSON.stringify({
        customer_id: orgId,
        trigger_type: 'cron_weekly',
        include_dti_extended: false,
        auto_scope_scan: true,
        force_scope_refresh: false,
      }),
      signal: ctrl.signal,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error) {
      const errorMessage = String(body?.error || `HTTP_${response.status}`);
      const action =
        response.status === 403 || /not enabled/i.test(errorMessage)
          ? 'darkrisk_weekly_skipped'
          : 'darkrisk_weekly_failed';
      await supabase.from('external_scan_audit_log').insert({
        organization_id: orgId,
        actor_email: 'system:cron',
        action,
        details: {
          http_status: response.status,
          error: errorMessage,
          include_dti_extended: false,
        },
      });
      return;
    }

    await supabase.from('external_scan_audit_log').insert({
      organization_id: orgId,
      actor_email: 'system:cron',
      action: 'darkrisk_weekly_started',
      details: {
        scan_run_id: body?.scan_run_id || null,
        status: body?.status || 'accepted',
        include_dti_extended: false,
      },
    });
  } catch (error) {
    await supabase.from('external_scan_audit_log').insert({
      organization_id: orgId,
      actor_email: 'system:cron',
      action: 'darkrisk_weekly_failed',
      details: {
        error: (error as Error)?.message || 'network_error',
        include_dti_extended: false,
      },
    });
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const bearerToken = String(req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const internalToken = String(req.headers.get('x-surface-internal-secret') || '').trim();
  const configuredInternalSecret =
    Deno.env.get('SURFACESCAN_CRON_INTERNAL_SECRET') ||
    Deno.env.get('SURFACESCAN_INTERNAL_SECRET') ||
    '';
  const isServiceRole = Boolean(serviceRoleKey && bearerToken === serviceRoleKey);
  let isInternal = Boolean(
    configuredInternalSecret &&
    internalToken === configuredInternalSecret
  );
  if (!isServiceRole && !isInternal && internalToken) {
    const { data: validInternalToken } = await supabase.rpc(
      'surface_scan_validate_internal_secret',
      { candidate: internalToken },
    );
    isInternal = validInternalToken === true;
  }
  if (!isServiceRole && !isInternal) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const orgFilter: string | undefined = body.organization_id;
    const triggeredBy: string = body.triggered_by ?? 'cron';
    const dispatchOnly = Boolean(body.dispatch_only);
    const SHODAN_API_KEY = Deno.env.get('SHODAN_API_KEY');
    if (!dispatchOnly && !SHODAN_API_KEY) {
      return new Response(JSON.stringify({ error: 'SHODAN_API_KEY missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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
    if (dispatchOnly) {
      let queuedQuery = supabase
        .from('surface_scan_jobs')
        .select('organization_id')
        .eq('status', 'queued');
      if (orgFilter) queuedQuery = queuedQuery.eq('organization_id', orgFilter);
      const { data: queuedJobs, error: queuedJobsError } = await queuedQuery;
      if (queuedJobsError) throw queuedJobsError;
      for (const queuedJob of queuedJobs || []) {
        const queuedOrgId = String(queuedJob.organization_id || '');
        if (queuedOrgId && !byOrg.has(queuedOrgId)) byOrg.set(queuedOrgId, []);
      }
    }

    const results: any[] = [];

    const internalSecret =
      Deno.env.get('SURFACESCAN_CRON_INTERNAL_SECRET') ||
      Deno.env.get('SURFACESCAN_INTERNAL_SECRET') ||
      null;
    const darkriskInternalSecret =
      Deno.env.get('DARKRISK360_INTERNAL_SECRET') ||
      Deno.env.get('DARKRISK_INTERNAL_SECRET') ||
      internalSecret;

    for (const [orgId, orgRules] of byOrg.entries()) {
      let queuedClassicStarted = 0;
      try {
        const startedClassicJobs = await dispatchSurfaceScanQueue(supabase as any, orgId, {
          initiatedByUserId: null,
          maxToStart: 3,
        });
        queuedClassicStarted = startedClassicJobs.length;
      } catch (queueErr) {
        console.error(`Classic SurfaceScan queue dispatch failed for org ${orgId}:`, queueErr);
        await supabase.from('external_scan_audit_log').insert({
          organization_id: orgId,
          actor_email: 'system:cron',
          action: 'auto_classic_queue_dispatch_failed',
          details: {
            error: queueErr instanceof Error ? queueErr.message : String(queueErr),
          },
        });
      }

      if (dispatchOnly) {
        results.push({
          orgId,
          ok: true,
          mode: 'dispatch_only',
          queued_classic_started: queuedClassicStarted,
        });
        continue;
      }

      const { assets, truncated } = await scanOrganization(orgId, orgRules, SHODAN_API_KEY!);

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
        results.push({ orgId, ok: false, error: insErr.message, queued_classic_started: queuedClassicStarted });
      } else {
        results.push({ orgId, ok: true, total_assets: total, critical, warning, safe, queued_classic_started: queuedClassicStarted });
      }

      // Report repository canonico SurfaceScan360: refresh automatico settimanale.
      await refreshWeeklyScopeRepositoryReport(supabase, supabaseUrl, serviceRoleKey, internalSecret, orgId);
      // DarkRisk360 standard weekly sync: DTI esteso escluso dai run cron.
      await triggerWeeklyDarkRiskStandardScan(supabase, supabaseUrl, serviceRoleKey, darkriskInternalSecret, orgId);

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
