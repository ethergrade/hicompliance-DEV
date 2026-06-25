/**
 * connectsecure-scan — Edge Function
 *
 * Azioni:
 *  test_auth   → verifica configurazione CS (solo diagnostica admin)
 *  scan        → trigger Attack Surface Mapper per una org specifica + ingest async
 *  weekly_all  → sweep di tutte le org abilitate (dal cron)
 *
 * Auth: service-role key | x-surface-internal-secret | JWT utente Supabase valido
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  csAuthorize,
  csGetOrCreateDomain,
  csMapToFindings,
  csScanNow,
  csWaitForResults,
  type CsConfig,
  type CsResult,
} from '../_shared/connectsecure-adapter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-surface-internal-secret',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const INTERNAL_SECRET  = Deno.env.get('SURFACE_SCAN_CRON_INTERNAL_SECRET') || '';

  const authHeader    = req.headers.get('Authorization') || '';
  const internalToken = req.headers.get('x-surface-internal-secret') || '';
  const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE_KEY}`;
  const isInternal    = INTERNAL_SECRET && internalToken === INTERNAL_SECRET;

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Accetta anche JWT utente Supabase valido
  if (!isServiceRole && !isInternal) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) return unauthorized();
    const { data: { user }, error } = await adminClient.auth.getUser(token);
    if (error || !user) return unauthorized();
  }

  // Secrets globali CS (override per-org)
  const GLOBAL_POD_HOST = Deno.env.get('CS_POD_HOST');
  const GLOBAL_TOKEN    = Deno.env.get('CS_CLIENT_AUTH_TOKEN');
  const GLOBAL_COMPANY  = Deno.env.get('CS_COMPANY_ID');
  const hasGlobalCfg    = !!(GLOBAL_POD_HOST && GLOBAL_TOKEN && GLOBAL_COMPANY);

  function mergeWithGlobal(dbCfg: Partial<CsConfig> = {}): CsConfig {
    return {
      pod_host:          (GLOBAL_POD_HOST || dbCfg.pod_host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
      client_auth_token: (GLOBAL_TOKEN    || dbCfg.client_auth_token || '').trim(),
      company_id:        GLOBAL_COMPANY  ? parseInt(GLOBAL_COMPANY.trim(), 10) : (dbCfg.company_id ?? 0),
    };
  }

  try {
    const body      = await req.json().catch(() => ({}));
    const action    = String(body.action || 'scan');
    const orgId     = body.organization_id as string | undefined;
    const inputDomain = body.domain as string | undefined;

    // ── Test auth ───────────────────────────────────────────────────────────
    if (action === 'test_auth') {
      let cfgBase: Partial<CsConfig> = {};
      if (orgId) {
        const { data } = await adminClient
          .from('connectsecure_config')
          .select('pod_host, client_auth_token, company_id')
          .eq('organization_id', orgId)
          .maybeSingle();
        cfgBase = data || {};
      }
      const cfg = mergeWithGlobal(cfgBase);
      if (!cfg.pod_host || !cfg.client_auth_token) return jsonErr('nessuna configurazione ConnectSecure disponibile', 404);
      const session = await csAuthorize(cfg);
      return json({ ok: true, user_id: session.userId, pod_host: cfg.pod_host, global_cfg: hasGlobalCfg });
    }

    // ── Weekly sweep ────────────────────────────────────────────────────────
    if (action === 'weekly_all') {
      const configs = await listWeeklyConfigs(adminClient, hasGlobalCfg, mergeWithGlobal);
      const results: Array<{ org_id: string; triggered: number; domains: number; background: boolean; error?: string }> = [];
      for (const cfg of configs) {
        try {
          const trigger = await triggerAttackSurfaceForOrg(adminClient, cfg, undefined);
          const background = runInBackground(
            ingestAttackSurfaceResults(adminClient, cfg, trigger.domains)
          );
          results.push({
            org_id: cfg.organization_id,
            triggered: trigger.triggered,
            domains: trigger.domains.length,
            background,
          });
        } catch (err) {
          results.push({ org_id: cfg.organization_id, triggered: 0, domains: 0, background: false, error: String(err) });
        }
      }
      return json({ ok: true, orgs_swept: results.length, results });
    }

    // ── Single org scan ─────────────────────────────────────────────────────
    if (!orgId) return jsonErr('organization_id obbligatorio', 400);

    const { data: dbCfg } = await adminClient
      .from('connectsecure_config')
      .select('pod_host, client_auth_token, company_id, enabled')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (dbCfg?.enabled === false) return jsonErr('ConnectSecure disabilitato per questa org', 409);

    const cfg = mergeWithGlobal(dbCfg || {});
    if (!cfg.pod_host || !cfg.client_auth_token) return jsonErr('nessuna configurazione ConnectSecure per questa org', 404);

    const trigger = await triggerAttackSurfaceForOrg(adminClient, { ...cfg, organization_id: orgId }, inputDomain);
    const background = runInBackground(
      ingestAttackSurfaceResults(adminClient, { ...cfg, organization_id: orgId }, trigger.domains)
    );
    return json({
      ok: true,
      organization_id: orgId,
      status: 'triggered',
      message: 'Attack Surface Mapper avviato. Polling e salvataggio risultati continuano in background.',
      triggered: trigger.triggered,
      domains: trigger.domains.map(d => d.domain),
      background,
    });

  } catch (err) {
    console.error('[connectsecure-scan] errore:', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

// ── Attack Surface Mapper Engine ──────────────────────────────────────────────

type AdminClient = any;
type CsOrgConfig = CsConfig & { organization_id: string };
type TriggeredDomain = { domain: string; id: number };

async function listWeeklyConfigs(
  adminClient: AdminClient,
  hasGlobalCfg: boolean,
  mergeWithGlobal: (dbCfg?: Partial<CsConfig>) => CsConfig,
): Promise<CsOrgConfig[]> {
  if (!hasGlobalCfg) {
    const { data } = await adminClient
      .from('connectsecure_config')
      .select('organization_id, pod_host, client_auth_token, company_id')
      .eq('enabled', true);
    return (data || []).map((cfg: any) => ({
      ...mergeWithGlobal(cfg as Partial<CsConfig>),
      organization_id: String(cfg.organization_id),
    })).filter((cfg: CsOrgConfig) => Boolean(cfg.organization_id && cfg.pod_host && cfg.client_auth_token && cfg.company_id));
  }

  const [{ data: orgs }, { data: overrides }] = await Promise.all([
    adminClient
      .from('organizations')
      .select('id, surface_scan360_enabled, services_paused')
      .eq('surface_scan360_enabled', true)
      .neq('services_paused', true),
    adminClient
      .from('connectsecure_config')
      .select('organization_id, pod_host, client_auth_token, company_id, enabled'),
  ]);

  const overrideByOrg = new Map<string, any>((overrides || []).map((row: any) => [String(row.organization_id), row]));
  return (orgs || [])
    .map((org: any) => {
      const override = overrideByOrg.get(String(org.id));
      if (override?.enabled === false) return null;
      return {
        ...mergeWithGlobal(override || {}),
        organization_id: String(org.id),
      };
    })
    .filter((cfg: CsOrgConfig | null): cfg is CsOrgConfig =>
      Boolean(cfg?.organization_id && cfg.pod_host && cfg.client_auth_token && cfg.company_id)
    );
}

async function triggerAttackSurfaceForOrg(
  adminClient: AdminClient,
  cfg: CsConfig & { organization_id: string },
  forceDomain?: string,
): Promise<{ triggered: number; domains: TriggeredDomain[] }> {
  const orgId = cfg.organization_id;
  const domains = await resolveScopeDomains(adminClient, orgId, forceDomain);
  if (domains.length === 0) return { triggered: 0, domains: [] };

  const session = { current: await csAuthorize(cfg) };
  const domainObjs: TriggeredDomain[] = [];
  for (const domain of domains) {
    const id = await csGetOrCreateDomain(cfg, session, domain, adminClient, orgId);
    domainObjs.push({ domain, id });
  }

  await csScanNow(
    cfg,
    session,
    domainObjs.map(d => ({ name: d.domain, domain: d.domain, company_id: cfg.company_id, id: d.id })),
  );

  return { triggered: domainObjs.length, domains: domainObjs };
}

async function resolveScopeDomains(
  adminClient: AdminClient,
  orgId: string,
  forceDomain?: string,
): Promise<string[]> {
  if (forceDomain) {
    const normalized = normalizeDomain(forceDomain);
    return normalized ? [normalized] : [];
  }

  const { data } = await adminClient
    .from('surface_scan_monitored_ips')
    .select('entry_type, input_value')
    .eq('organization_id', orgId)
    .eq('entry_type', 'domain');

  return Array.from(new Set((data || [])
    .map((r: any) => normalizeDomain(String(r.input_value || '')))
    .filter(Boolean)));
}

function normalizeDomain(value: string): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const withoutScheme = raw.replace(/^https?:\/\//i, '');
  const hostname = withoutScheme.split('/')[0].split(':')[0].replace(/\.$/, '');
  if (!hostname || !hostname.includes('.') || hostname.includes('*')) return '';
  return hostname;
}

function runInBackground(task: Promise<unknown>): boolean {
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task.catch(err => console.error('[connectsecure-scan] background ingest failed:', err)));
    return true;
  }
  task.catch(err => console.error('[connectsecure-scan] background ingest failed:', err));
  return false;
}

async function ingestAttackSurfaceResults(
  adminClient: AdminClient,
  cfg: CsOrgConfig,
  domains: TriggeredDomain[],
): Promise<void> {
  if (domains.length === 0) return;
  const session = { current: await csAuthorize(cfg) };
  for (const d of domains) {
    try {
      const result = await csWaitForResults(cfg, session, d.id, d.domain, 420_000);
      await saveResult(adminClient, cfg.organization_id, d.domain, result);
    } catch (err) {
      console.warn('[connectsecure-scan] result ingest failed:', d.domain, err);
    }
  }
}

async function saveResult(
  adminClient: AdminClient,
  orgId: string,
  domain: string,
  result: CsResult,
): Promise<void> {
  const { assets: mappedAssets, findings, ports: mappedPorts, observations, sensitiveData } = csMapToFindings(result, domain, 0);
  const now = new Date().toISOString();

  for (const a of mappedAssets) {
    await adminClient.from('surface_assets').upsert({
        organization_id: orgId,
        customer_id:     orgId,
        tenant_id:       orgId,
        asset_type:      a.asset_type,
        asset_value:     a.asset_value,
        hostname:        a.hostname  || null,
        root_domain:     a.root_domain || null,
        ip:              a.ip        || null,
        source:          a.source,
        confidence:      a.confidence,
        raw:             a.raw || {},
        first_seen:      now,
        last_seen:       now,
      }, { onConflict: 'organization_id,asset_type,asset_value' }).catch(console.warn);
  }

  for (const f of findings) {
    await adminClient.from('surface_findings').insert({
        organization_id: orgId,
        customer_id:     orgId,
        tenant_id:       orgId,
        provider:        f.provider,
        module:          f.module,
        finding_type:    f.finding_type,
        severity:        f.severity,
        title:           f.title,
        description:     f.description,
        affected_asset:  f.affected_asset,
        ip:              f.ip        || null,
        port:            f.port      || null,
        protocol:        f.protocol  || null,
        cve:             f.cve       || [],
        cwe:             f.cwe       || [],
        cvss:            f.cvss      || null,
        evidence:        f.evidence  || {},
        remediation:     f.remediation || null,
        status:          'open',
        first_seen_at:   now,
        last_seen_at:    now,
      }).catch(console.warn);
  }

  for (const p of mappedPorts) {
    await adminClient.from('surface_open_ports').upsert({
        organization_id: orgId,
        customer_id:     orgId,
        tenant_id:       orgId,
        scan_job_id:     null,
        host:            p.host,
        ip:              p.ip,
        port:            p.port,
        protocol:        p.protocol,
        state:           'open',
        service_name:    p.serviceName    || null,
        service_version: p.serviceVersion || null,
        banner:          p.banner         || null,
        is_web:          [80, 443, 8080, 8443, 8888, 9000, 3000].includes(p.port),
        is_tls:          [443, 8443, 993, 995, 465].includes(p.port),
        exposure_level:  'info',
        source:          'connectsecure',
        first_seen_at:   now,
        last_seen_at:    now,
        raw:             { source: 'connectsecure', attack_surface_domain_id: result.attack_surface_domain_id },
      }, { onConflict: 'customer_id,host,port,protocol' }).catch(console.warn);
  }

  for (const obs of observations) {
    await adminClient.from('surface_observations').insert({
      organization_id: orgId,
      customer_id:     orgId,
      tenant_id:       orgId,
      scan_job_id:     null,
      module:          'connectsecure',
      observation_type: obs.type,
      title:           obs.title,
      value:           obs.value,
      severity:        obs.severity,
      confidence:      'high',
    }).catch(console.warn);
  }

  if ((sensitiveData.creds?.length || 0) + (sensitiveData.hashes?.length || 0) > 0) {
    await adminClient.from('connectsecure_sensitive_data').insert({
      organization_id: orgId,
      scan_job_id:     null,
      domain:          sensitiveData.domain,
      creds_count:     sensitiveData.creds?.length || 0,
      hashes_count:    sensitiveData.hashes?.length || 0,
      creds:           sensitiveData.creds || null,
      hashes:          sensitiveData.hashes || null,
    }).catch(console.warn);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unauthorized() {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonErr(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
