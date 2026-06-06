// Cron weekly Surface Scan: per ogni organization con regole monitorate,
// esegue scan Shodan e salva snapshot su `surface_scan_history`.
// Invocato da pg_cron. Auth: x-cron-secret oppure service role.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dispatchSurfaceScanQueue } from '../_shared/surface-scan-engine.ts';
import { evaluateOrganizationServiceGate } from '../_shared/surface-scan-utils.ts';

interface MonitoredRule {
  id: string;
  organization_id: string;
  entry_type: 'single' | 'range' | 'cidr' | 'domain';
  input_value: string;
  ip_start: string;
  ip_end: string;
  discovered_via?: string | null;
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
const EXPOSURE_SCOPE_AUTOSCAN_TIMEOUT = 30_000;
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
      // 'single' (IP) e 'domain' (hostname) → 1 asset (host risolto)
      // 'range' → scan CIDR via shodanSearch (limitato)
      if (r.entry_type === 'range' && r.ip_start && r.ip_end) {
        const banners = await shodanSearch(`net:${r.ip_start}-${r.ip_end}`, shodanKey);
        const hosts = bannersToHosts(banners);
        if (hosts.length > MAX_IPS_PER_RULE) truncated.push(r.input_value);
        hosts.slice(0, MAX_IPS_PER_RULE).forEach(h => assets.push(aggregateAsset(h)));
        perRule.push({ rule: r, host: hosts[0] ?? null, ip: hosts[0]?.ip_str ?? null });
      } else {
        let ip = r.input_value;
        if (!isIp(ip)) {
          const resolved = await shodanResolve(ip, shodanKey);
          if (!resolved) { perRule.push({ rule: r, host: null, ip: null }); continue; }
          ip = resolved;
        }
        const host = await shodanHost(ip, shodanKey);
        if (host) assets.push(aggregateAsset(host));
        perRule.push({ rule: r, host, ip });
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

const AUTO_VAL_MAX_RETRIES = 3;
const AUTO_VAL_BASE_DELAY = 1000;
const AUTO_VAL_TIMEOUT = 20_000;

async function callOrchestratorWithRetry(
  supabaseUrl: string,
  serviceRoleKey: string,
  internalSecret: string | null,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: any; attempts: number; error?: string }> {
  let lastErr: string | undefined;
  for (let attempt = 0; attempt <= AUTO_VAL_MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), AUTO_VAL_TIMEOUT);
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/pentest-tools-orchestrator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
          ...(internalSecret ? { 'x-surface-internal-secret': internalSecret } : {}),
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const body = await resp.json().catch(() => ({}));
      // 200 (anche con skipped per rate-limit settimanale) → terminale
      // 4xx (no 429) → terminale, non riprovare
      if (resp.status < 500 && resp.status !== 429) {
        return { ok: resp.ok, status: resp.status, body, attempts: attempt + 1 };
      }
      lastErr = `HTTP ${resp.status}: ${body?.error ?? 'transient'}`;
    } catch (e) {
      clearTimeout(t);
      const isAbort = (e as any)?.name === 'AbortError';
      lastErr = isAbort ? 'timeout' : `network: ${(e as Error).message}`;
    }
    if (attempt === AUTO_VAL_MAX_RETRIES) break;
    const wait = Math.min(AUTO_VAL_BASE_DELAY * Math.pow(2, attempt), 15_000) + Math.floor(Math.random() * 300);
    console.warn(`[auto-validation] retry in ${wait}ms (attempt ${attempt + 1}/${AUTO_VAL_MAX_RETRIES}) reason: ${lastErr}`);
    await new Promise((r) => setTimeout(r, wait));
  }
  return { ok: false, status: 0, body: null, attempts: AUTO_VAL_MAX_RETRIES + 1, error: lastErr };
}

async function maybeTriggerAutoValidation(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  internalSecret: string | null,
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
      found: true, hostnames, ports, vulns,
      last_update: host.last_update, asn: host.asn, org: host.org,
    } : { found: false, hostnames: [], ports: [], vulns: [] };

    const startedAt = new Date().toISOString();
    const result = await callOrchestratorWithRetry(supabaseUrl, serviceRoleKey, internalSecret, {
      organization_id: orgId,
      target,
      profile: 'recon_safe',
      triggered_by: 'auto_from_shodan',
      resolved_ips: r.ip ? [r.ip] : [],
      shodan_snapshot: snapshot,
    });

    const baseDetails = {
      target,
      triggered_by: 'auto_from_shodan',
      attempts: result.attempts,
      http_status: result.status,
      resolved_ip: r.ip,
      requested_at: startedAt,
      shodan_found: snapshot.found,
    };

    try {
      if (result.ok) {
        console.log(`[auto-validation] org=${orgId} target=${target} OK job=${result.body?.job_id ?? '-'} attempts=${result.attempts}`);
        await supabase.from('external_scan_audit_log').insert({
          organization_id: orgId,
          scan_job_id: result.body?.job_id ?? null,
          actor_email: 'system:cron',
          action: 'auto_trigger_accepted',
          details: { ...baseDetails, job_id: result.body?.job_id ?? null, tasks: result.body?.tasks?.length ?? 0 },
        });
      } else if (result.status === 200 && result.body?.skipped) {
        console.warn(`[auto-validation] org=${orgId} target=${target} skipped: ${result.body?.error}`);
        await supabase.from('external_scan_audit_log').insert({
          organization_id: orgId,
          actor_email: 'system:cron',
          action: 'auto_trigger_skipped',
          details: { ...baseDetails, reason: result.body?.error ?? 'weekly_limit' },
        });
      } else if (result.status === 403) {
        console.warn(`[auto-validation] org=${orgId} target=${target} blocked: ${result.body?.error}`);
        await supabase.from('external_scan_audit_log').insert({
          organization_id: orgId,
          actor_email: 'system:cron',
          action: 'auto_trigger_blocked',
          details: { ...baseDetails, reason: result.body?.error ?? 'plan_blocked' },
        });
      } else if (result.status === 429) {
        console.warn(`[auto-validation] org=${orgId} target=${target} rate-limited`);
        await supabase.from('external_scan_audit_log').insert({
          organization_id: orgId,
          actor_email: 'system:cron',
          action: 'auto_trigger_rate_limited',
          details: { ...baseDetails, reason: result.body?.error ?? 'concurrency_limit' },
        });
      } else {
        const errorMsg = result.error ?? result.body?.error ?? 'unknown';
        console.error(`[auto-validation] org=${orgId} target=${target} FAILED dopo ${result.attempts} tentativi: ${errorMsg}`);
        await supabase.from('external_scan_audit_log').insert({
          organization_id: orgId,
          actor_email: 'system:cron',
          action: 'auto_trigger_failed',
          details: { ...baseDetails, error: errorMsg },
        });
      }
    } catch (e) {
      console.error(`[auto-validation] audit log insert failed for org=${orgId} target=${target}:`, e);
    }
  }
}

// --- Shodan-based exposure sync (replaces PentestTools for port/tech data) ---

const SENSITIVE_PORTS = new Set([21, 22, 23, 25, 110, 135, 139, 143, 445, 1433, 1521, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 8888, 9200, 11211, 27017]);
const WEB_PORTS = new Set([80, 443, 8000, 8080, 8443, 8888]);

function portExposureLevel(port: number, hasCve: boolean): string {
  if (hasCve) return 'critical';
  if (SENSITIVE_PORTS.has(port)) return 'high';
  if (!WEB_PORTS.has(port)) return 'medium';
  return 'info';
}

async function syncExposureFromShodanAssets(
  supabase: any,
  orgId: string,
  assets: any[],
): Promise<{ ports: number; techs: number }> {
  if (!assets.length) return { ports: 0, techs: 0 };

  const now = new Date().toISOString();
  const portRows: any[] = [];
  const techRows: any[] = [];

  for (const asset of assets) {
    const host = String(asset.ip || asset.hostname || '').trim();
    if (!host) continue;
    const ip = isIp(host) ? host : String(asset.ip || '').trim();
    const hasCve = (asset.cves_high ?? 0) > 0;

    for (const port of (asset.ports as number[] | undefined) ?? []) {
      if (!Number.isFinite(port)) continue;
      portRows.push({
        organization_id: orgId,
        tenant_id: orgId,
        customer_id: orgId,
        scan_job_id: null,
        host,
        ip: ip || null,
        port,
        protocol: 'tcp',
        state: 'open',
        service_name: null,
        is_web: WEB_PORTS.has(port),
        is_tls: port === 443 || port === 8443,
        exposure_level: portExposureLevel(port, hasCve),
        source: 'shodan',
        last_seen_at: now,
        first_seen_at: now,
        raw: { ip, port, hostname: asset.hostname },
      });
    }

    for (const svc of (asset.services as string[] | undefined) ?? []) {
      if (!svc) continue;
      techRows.push({
        organization_id: orgId,
        tenant_id: orgId,
        customer_id: orgId,
        scan_job_id: null,
        url: `https://${host}`,
        host,
        technology_name: svc,
        category: 'service',
        confidence: 80,
        source_provider: 'shodan',
        raw: { ip, hostname: asset.hostname, service: svc },
      });
    }
  }

  let ports = 0;
  let techs = 0;

  if (portRows.length > 0) {
    const { error } = await supabase
      .from('surface_open_ports')
      .upsert(portRows, { onConflict: 'customer_id,host,port,protocol', ignoreDuplicates: false });
    if (!error) ports = portRows.length;
    else console.warn('[shodan-exposure-sync] port upsert failed:', error.message);
  }

  if (techRows.length > 0) {
    const { error } = await supabase
      .from('surface_web_technologies')
      .upsert(techRows, { onConflict: 'customer_id,host,technology_name', ignoreDuplicates: false });
    if (!error) techs = techRows.length;
    else console.warn('[shodan-exposure-sync] tech upsert failed:', error.message);
  }

  return { ports, techs };
}

// ---------------------------------------------------------------------------

function splitScopeTargetsForExposure(rules: MonitoredRule[]): { domains: string[]; publicIps: string[] } {
  const domains = new Set<string>();
  const publicIps = new Set<string>();
  for (const rule of rules) {
    const entryType = String(rule.entry_type || '').toLowerCase();
    const input = String(rule.input_value || '').trim().toLowerCase();
    if (!input) continue;
    if (entryType === 'domain') {
      domains.add(input);
      continue;
    }
    if (entryType === 'single' && isIp(input)) {
      publicIps.add(input);
    }
  }
  return { domains: Array.from(domains), publicIps: Array.from(publicIps) };
}

async function triggerWeeklyScopeExposureScan(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  internalSecret: string | null,
  orgId: string,
  rules: MonitoredRule[],
) {
  const { domains, publicIps } = splitScopeTargetsForExposure(rules);
  if (domains.length === 0 && publicIps.length === 0) {
    await supabase.from('external_scan_audit_log').insert({
      organization_id: orgId,
      actor_email: 'system:cron',
      action: 'auto_scope_exposure_skipped',
      details: { reason: 'no_supported_scope_targets' },
    });
    return;
  }

  const { count: activeExposureJobs } = await supabase
    .from('surface_scan_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('scan_type', 'exposure_port_technology')
    .in('status', ['queued', 'pending', 'running']);

  if ((activeExposureJobs || 0) > 0) {
    await supabase.from('external_scan_audit_log').insert({
      organization_id: orgId,
      actor_email: 'system:cron',
      action: 'auto_scope_exposure_skipped',
      details: { reason: 'active_exposure_job_exists', active_jobs: activeExposureJobs || 0 },
    });
    return;
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), EXPOSURE_SCOPE_AUTOSCAN_TIMEOUT);
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ptools-start-exposure-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        ...(internalSecret ? { 'x-surface-internal-secret': internalSecret } : {}),
      },
      body: JSON.stringify({
        tenant_id: orgId,
        customer_id: orgId,
        scan_name: `Exposure Weekly Scope Auto · ${new Date().toISOString().slice(0, 16)}`,
        root_domains: domains,
        subdomains: [],
        public_ips: publicIps,
        include_subdomain_discovery: true,
        include_port_scan: true,
        include_web_technology_detection: true,
        include_ssl_scan: true,
        include_network_vuln_scan: false,
        scan_depth: 'deep',
        protocol: 'tcp',
        custom_ports: 'top1000',
        check_alive: true,
        detect_service_version: true,
        detect_os: true,
        traceroute: false,
      }),
      signal: ctrl.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.job_id) {
      await supabase.from('external_scan_audit_log').insert({
        organization_id: orgId,
        actor_email: 'system:cron',
        action: 'auto_scope_exposure_failed',
        details: {
          http_status: response.status,
          error: body?.error || 'unknown',
          domains_count: domains.length,
          public_ips_count: publicIps.length,
        },
      });
      return;
    }

    await supabase.from('external_scan_audit_log').insert({
      organization_id: orgId,
      scan_job_id: body.job_id,
      actor_email: 'system:cron',
      action: 'auto_scope_exposure_started',
      details: {
        job_id: body.job_id,
        domains_count: domains.length,
        public_ips_count: publicIps.length,
        queue_total: Number(body?.queue?.total || 0),
      },
    });
  } catch (error) {
    await supabase.from('external_scan_audit_log').insert({
      organization_id: orgId,
      actor_email: 'system:cron',
      action: 'auto_scope_exposure_failed',
      details: {
        error: (error as Error)?.message || 'network_error',
        domains_count: domains.length,
        public_ips_count: publicIps.length,
      },
    });
  } finally {
    clearTimeout(t);
  }
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
    const responseCode = String(body?.code || '').trim().toLowerCase();
    const scopePending = response.status === 409 && responseCode === 'scope_incomplete_pending_targets';
    if (scopePending) {
      await supabase.from('external_scan_audit_log').insert({
        organization_id: orgId,
        actor_email: 'system:cron',
        action: 'auto_scope_report_skipped',
        details: {
          reason: 'scope_incomplete_pending_targets',
          pending_targets: Array.isArray(body?.pending_targets) ? body.pending_targets.slice(0, 50) : [],
          required_targets_total: Number(body?.required_targets_total || 0),
          completed_targets_total: Number(body?.completed_targets_total || 0),
        },
      });
      return;
    }
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

// Subdomain discovery automatica: per ogni dominio ROOT in scope (non già
// scoperto via subdomain_dump) lancia subdomain-dump che enumera i sottodomini
// (crt.sh + hackertarget + passive DNS) e li AUTO-AGGIUNGE allo scope.
// Al ciclo successivo (o nello stesso, dopo refresh rules) vengono scansionati.
async function triggerSubdomainDiscovery(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  rules: MonitoredRule[],
): Promise<{ dumped: number; scope_added: number; skipped: number }> {
  // Verifica che il modulo sia abilitato per l'org
  const { data: org } = await supabase
    .from('organizations')
    .select('subdomain_dump_enabled')
    .eq('id', orgId)
    .maybeSingle();
  if (org && org.subdomain_dump_enabled === false) {
    return { dumped: 0, scope_added: 0, skipped: 0 };
  }

  // Solo domini root/manuali (evita di ri-dumpare i sottodomini già scoperti)
  const rootDomains = Array.from(new Set(
    rules
      .filter((r) => r.entry_type === 'domain'
        && String(r.discovered_via || 'manual') !== 'subdomain_dump'
        && r.input_value)
      .map((r) => String(r.input_value).trim().toLowerCase())
      .filter(Boolean)
  )).slice(0, 15);
  if (rootDomains.length === 0) return { dumped: 0, scope_added: 0, skipped: 0 };

  // Non ri-dumpare domini già processati negli ultimi 7 giorni
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentDumps } = await supabase
    .from('subdomain_dumps')
    .select('root_domain')
    .eq('organization_id', orgId)
    .gte('created_at', sevenDaysAgo);
  const recentSet = new Set(((recentDumps || []) as any[]).map((d: any) => String(d.root_domain || '').toLowerCase()));

  let dumped = 0, scope_added = 0, skipped = 0;
  for (const domain of rootDomains) {
    if (recentSet.has(domain)) { skipped++; continue; }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/subdomain-dump`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ organization_id: orgId, root_domain: domain, triggered_by: 'cron_surface' }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const body = await res.json().catch(() => ({}));
      if (res.ok && !body?.error) {
        dumped++;
        scope_added += Number(body?.scope_added || 0);
      } else {
        skipped++;
      }
    } catch {
      clearTimeout(t);
      skipped++;
    }
  }
  return { dumped, scope_added, skipped };
}

// Ensures all scope domains have a recent classic surface scan job.
// Creates new scan jobs for domains not scanned in the last 7 days, so the
// full engine (DNS, RDAP, OTX, CVE-MITRE+CIRCL, BGP, Tor, crt.sh, etc.) runs weekly.
async function triggerWeeklyClassicScopeScans(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  internalSecret: string | null,
  orgId: string,
  rules: MonitoredRule[],
): Promise<{ queued: number; skipped: number; failed: number }> {
  const domains = rules
    .filter((r) => r.entry_type === 'domain' && r.input_value)
    .map((r) => String(r.input_value).trim().toLowerCase())
    .filter(Boolean);
  const ips = rules
    .filter((r) => r.entry_type === 'single' && isIp(String(r.input_value || '')))
    .map((r) => String(r.input_value).trim())
    .filter(Boolean);

  const targets = [
    ...domains.map((t) => ({ target: t, profile: 'domain_exposure' })),
    ...ips.map((t) => ({ target: t, profile: 'ip_exposure' })),
  ].slice(0, 80);

  if (targets.length === 0) return { queued: 0, skipped: 0, failed: 0 };

  // Check which targets have a recent scan (last 7 days) to avoid duplicates
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentJobs } = await supabase
    .from('surface_scan_jobs')
    .select('normalized_target, status, completed_at')
    .eq('organization_id', orgId)
    .in('status', ['completed', 'running', 'pending', 'queued'])
    .gte('created_at', sevenDaysAgo)
    .limit(200);

  const recentTargets = new Set<string>(
    ((recentJobs || []) as any[]).map((j: any) => String(j.normalized_target || '').toLowerCase())
  );

  let queued = 0, skipped = 0, failed = 0;

  // Orchestratore interno fidato: inserisce i job 'queued' DIRETTAMENTE in
  // surface_scan_jobs, bypassando il rate-limit/cooldown di surfacescan360-start-scan
  // (pensati per l'uso manuale UI). Così TUTTI i subdomain in scope vengono accodati.
  const rootOf = (host: string): string => {
    const labels = host.split('.').filter(Boolean);
    return labels.length <= 2 ? host : labels.slice(-2).join('.');
  };
  const jobRows: any[] = [];
  for (const item of targets) {
    const normalizedTarget = item.target.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
    if (recentTargets.has(normalizedTarget)) { skipped++; continue; }
    recentTargets.add(normalizedTarget);
    const isIpTarget = item.profile === 'ip_exposure';
    jobRows.push({
      organization_id: orgId,
      tenant_id: orgId,
      customer_id: orgId,
      requested_by: null,
      raw_target: item.target,
      normalized_target: normalizedTarget,
      target_type: isIpTarget ? 'ip' : 'domain',
      hostname: isIpTarget ? null : normalizedTarget,
      root_domain: isIpTarget ? null : rootOf(normalizedTarget),
      scan_profile: item.profile,
      status: 'queued',
      authorization_confirmed: true,
    });
  }

  if (jobRows.length > 0) {
    const { error: insErr } = await supabase.from('surface_scan_jobs').insert(jobRows);
    if (insErr) {
      console.error('[cron] bulk job insert failed:', insErr.message);
      failed = jobRows.length;
    } else {
      queued = jobRows.length;
    }
  }

  return { queued, skipped, failed };
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
    const dispatchOnly = Boolean(body.dispatch_only);

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

    const orgIds = Array.from(byOrg.keys());
    const { data: orgRuntimeRows, error: orgRuntimeErr } = orgIds.length > 0
      ? await supabase
          .from('organizations' as any)
          .select(
            'id, surface_scan360_enabled, dark_risk360_enabled, services_paused, services_paused_at, services_pause_reason, surface_scan_contract_start, surface_scan_contract_years, dark_risk_contract_start, dark_risk_contract_years',
          )
          .in('id', orgIds)
      : { data: [], error: null };
    if (orgRuntimeErr) throw orgRuntimeErr;
    const orgRuntimeById = new Map<string, any>(
      (orgRuntimeRows || []).map((row: any) => [String(row.id), row]),
    );

    const results: any[] = [];

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalSecret =
      Deno.env.get('SURFACESCAN_CRON_INTERNAL_SECRET') ||
      Deno.env.get('SURFACESCAN_INTERNAL_SECRET') ||
      null;
    const darkriskInternalSecret =
      Deno.env.get('DARKRISK360_INTERNAL_SECRET') ||
      Deno.env.get('DARKRISK_INTERNAL_SECRET') ||
      internalSecret;

    for (const [orgId, orgRules] of byOrg.entries()) {
      const orgRuntime = orgRuntimeById.get(orgId) || null;
      const surfaceGate = evaluateOrganizationServiceGate(orgRuntime, 'surface_scan360');
      const darkRiskGate = evaluateOrganizationServiceGate(orgRuntime, 'dark_risk360');

      if (!surfaceGate.allowed && !darkRiskGate.allowed) {
        await supabase.from('external_scan_audit_log').insert({
          organization_id: orgId,
          actor_email: 'system:cron',
          action: 'auto_scope_cron_skipped',
          details: {
            surface_gate: {
              code: surfaceGate.code,
              reason: surfaceGate.reason,
              contract_start: surfaceGate.contract_start,
              contract_end: surfaceGate.contract_end,
            },
            darkrisk_gate: {
              code: darkRiskGate.code,
              reason: darkRiskGate.reason,
              contract_start: darkRiskGate.contract_start,
              contract_end: darkRiskGate.contract_end,
            },
          },
        });

        results.push({
          orgId,
          ok: true,
          skipped: true,
          reason: 'all_services_blocked',
          surface_gate: surfaceGate.code,
          darkrisk_gate: darkRiskGate.code,
        });
        continue;
      }

      let queuedClassicStarted = 0;
      let effectiveRules = orgRules;
      if (surfaceGate.allowed) {
        // Step -1: Subdomain discovery — enumera sottodomini e li auto-aggiunge a scope.
        // Eseguito PRIMA della scansione classica così i nuovi sub entrano subito in coda.
        try {
          const subResult = await triggerSubdomainDiscovery(
            supabase, supabaseUrl, serviceRoleKey, orgId, orgRules,
          );
          if (subResult.dumped > 0 || subResult.scope_added > 0) {
            await supabase.from('external_scan_audit_log').insert({
              organization_id: orgId,
              actor_email: 'system:cron',
              action: 'auto_subdomain_discovery',
              details: subResult,
            });
            // Re-fetch rules: includi i sottodomini appena aggiunti allo scope
            const { data: refreshed } = await supabase
              .from('surface_scan_monitored_ips')
              .select('*')
              .eq('organization_id', orgId);
            if (Array.isArray(refreshed) && refreshed.length > 0) {
              effectiveRules = refreshed as MonitoredRule[];
            }
          }
        } catch (subErr) {
          console.error(`Subdomain discovery failed for org ${orgId}:`, subErr);
        }

        // Step 0: Create new scan jobs for scope domains not scanned in the last 7 days.
        // This ensures all engine modules run weekly (DNS, RDAP/WHOIS, OTX, CVE-MITRE+CIRCL,
        // BGP/ASN, Tor exit node, crt.sh, IP-geo, DNSDumpster, HTTP headers, etc.)
        try {
          const scanTriggerResult = await triggerWeeklyClassicScopeScans(
            supabase, supabaseUrl, serviceRoleKey, internalSecret, orgId, effectiveRules,
          );
          if (scanTriggerResult.queued > 0 || scanTriggerResult.failed > 0) {
            await supabase.from('external_scan_audit_log').insert({
              organization_id: orgId,
              actor_email: 'system:cron',
              action: 'auto_classic_scope_scans_triggered',
              details: scanTriggerResult,
            });
          }
        } catch (triggerErr) {
          console.error(`Weekly scope scan trigger failed for org ${orgId}:`, triggerErr);
        }

        // Step 1: Dispatch any existing queued jobs (including newly created ones)
        try {
          const startedClassicJobs = await dispatchSurfaceScanQueue(supabase, orgId, {
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

      let assets: any[] = [];
      let truncated: string[] = [];
      let perRule: RuleScanResult[] = [];
      if (surfaceGate.allowed) {
        const scanRes = await scanOrganization(orgId, effectiveRules, SHODAN_API_KEY);
        assets = scanRes.assets;
        truncated = scanRes.truncated;
        perRule = scanRes.perRule;
      }

      const total = assets.length;
      const critical = assets.filter(a => a.status === 'Critico').length;
      const warning = assets.filter(a => a.status === 'Attenzione').length;
      const safe = assets.filter(a => a.status === 'Sicuro').length;
      const avg = total === 0 ? 0 : assets.reduce((s, a) => s + a.score, 0) / total;
      const high = assets.reduce((s, a) => s + a.cves_high, 0);
      const med = assets.reduce((s, a) => s + a.cves_medium, 0);
      const low = assets.reduce((s, a) => s + a.cves_low, 0);

      let insErr: any = null;
      if (surfaceGate.allowed) {
        const insertRes = await supabase.from('surface_scan_history').insert({
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
        insErr = insertRes.error;
      }
      if (surfaceGate.allowed && insErr) {
        console.error(`Insert failed for org ${orgId}:`, insErr);
        results.push({ orgId, ok: false, error: insErr.message, queued_classic_started: queuedClassicStarted });
      } else {
        results.push({
          orgId,
          ok: true,
          total_assets: total,
          critical,
          warning,
          safe,
          queued_classic_started: queuedClassicStarted,
          surface_gate: surfaceGate.code,
          darkrisk_gate: darkRiskGate.code,
        });
      }

      if (surfaceGate.allowed) {
        // Esposizione porte/servizi/tech: SOLO da Shodan + moduli interni.
        // Pentest-Tools eliminato (provider 401 -> job exposure tutti falliti).
        if (assets.length > 0) {
          const syncResult = await syncExposureFromShodanAssets(supabase, orgId, assets);
          console.log(`[shodan-exposure-sync] org=${orgId} ports=${syncResult.ports} techs=${syncResult.techs}`);
          await supabase.from('external_scan_audit_log').insert({
            organization_id: orgId,
            actor_email: 'system:cron',
            action: 'auto_shodan_exposure_synced',
            details: { ports_synced: syncResult.ports, techs_synced: syncResult.techs, assets_count: assets.length },
          });
        }

        // Report repository canonico SurfaceScan360: refresh automatico settimanale.
        await refreshWeeklyScopeRepositoryReport(supabase, supabaseUrl, serviceRoleKey, internalSecret, orgId);
      }

      // DarkRisk360 standard weekly sync: DTI esteso escluso dai run cron.
      if (darkRiskGate.allowed) {
        await triggerWeeklyDarkRiskStandardScan(supabase, supabaseUrl, serviceRoleKey, darkriskInternalSecret, orgId);
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
