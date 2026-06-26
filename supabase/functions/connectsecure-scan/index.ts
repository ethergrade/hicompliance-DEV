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
  csNormalizeClientAuthToken,
  csScanNow,
  csWaitForResults,
  type CsConfig,
  type CsResult,
} from '../_shared/connectsecure-adapter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-surface-internal-secret',
};

type ConfigSource = 'global' | 'org' | 'missing';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const INTERNAL_SECRET  = Deno.env.get('SURFACE_SCAN_CRON_INTERNAL_SECRET') || Deno.env.get('SURFACESCAN_CRON_INTERNAL_SECRET') || '';

  const authHeader    = req.headers.get('Authorization') || '';
  const bearerToken   = authHeader.replace(/^Bearer\s+/i, '').trim();
  const internalToken = req.headers.get('x-surface-internal-secret') || '';
  const isServiceRole = !!SERVICE_ROLE_KEY && bearerToken === SERVICE_ROLE_KEY;
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

  function resolveConfig(dbCfg: Partial<CsConfig> = {}): { cfg: CsConfig; source: ConfigSource } {
    const hasOrgCfg = !!(dbCfg.pod_host && dbCfg.client_auth_token && dbCfg.company_id);
    const cfg = {
      pod_host:          (GLOBAL_POD_HOST || dbCfg.pod_host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
      client_auth_token: csNormalizeClientAuthToken(GLOBAL_TOKEN || dbCfg.client_auth_token || ''),
      company_id:        GLOBAL_COMPANY  ? parseInt(GLOBAL_COMPANY.trim(), 10) : (dbCfg.company_id ?? 0),
    };
    const source: ConfigSource = hasGlobalCfg ? 'global' : hasOrgCfg ? 'org' : 'missing';
    return { cfg, source };
  }

  try {
    const body      = await req.json().catch(() => ({}));
    const action    = String(body.action || 'scan');
    const orgId     = body.organization_id as string | undefined;
    const inputDomain = body.domain as string | undefined;

    // ── Test / diagnose auth ────────────────────────────────────────────────
    if (action === 'test_auth' || action === 'diagnose_auth') {
      let cfgBase: Partial<CsConfig> = {};
      if (orgId) {
        const { data } = await adminClient
          .from('connectsecure_config')
          .select('pod_host, client_auth_token, company_id')
          .eq('organization_id', orgId)
          .maybeSingle();
        cfgBase = data || {};
      }
      const { cfg, source } = resolveConfig(cfgBase);
      const diagnostic = await diagnoseConnectSecureAuth(cfg, source);
      if (action === 'diagnose_auth') return json({ ok: diagnostic.auth_ok, diagnostic });
      if (!diagnostic.token_present) return jsonErr('nessuna configurazione ConnectSecure disponibile', 404, { diagnostic });
      if (!diagnostic.auth_ok) return jsonAuthFailed(diagnostic);
      return json({ ok: true, user_id: diagnostic.user_id, pod_host: cfg.pod_host, global_cfg: hasGlobalCfg });
    }

    // ── Weekly sweep ────────────────────────────────────────────────────────
    if (action === 'weekly_all') {
      const configs = await listWeeklyConfigs(adminClient, hasGlobalCfg, resolveConfig);
      const results: Array<{ org_id: string; triggered: number; domains: number; background: boolean; error?: string }> = [];
      for (const cfg of configs) {
        try {
          const diagnostic = await diagnoseConnectSecureAuth(cfg, cfg.config_source);
          if (!diagnostic.auth_ok) {
            results.push({ org_id: cfg.organization_id, triggered: 0, domains: 0, background: false, error: 'auth_failed_config_diagnostic' });
            continue;
          }
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
          results.push({ org_id: cfg.organization_id, triggered: 0, domains: 0, background: false, error: safeConnectSecureError(err) });
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

    const { cfg, source } = resolveConfig(dbCfg || {});
    if (!cfg.pod_host || !cfg.client_auth_token) return jsonErr('nessuna configurazione ConnectSecure per questa org', 404);
    const diagnostic = await diagnoseConnectSecureAuth(cfg, source);
    if (!diagnostic.auth_ok) return jsonAuthFailed(diagnostic);

    const trigger = await triggerAttackSurfaceForOrg(adminClient, { ...cfg, organization_id: orgId }, inputDomain);
    const background = runInBackground(
      ingestAttackSurfaceResults(adminClient, { ...cfg, organization_id: orgId, config_source: source }, trigger.domains)
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
    return json({ ok: false, error: safeConnectSecureError(err) }, 500);
  }
});

// ── Attack Surface Mapper Engine ──────────────────────────────────────────────

type AdminClient = any;
type CsOrgConfig = CsConfig & { organization_id: string; config_source: ConfigSource };
type TriggeredDomain = { domain: string; id: number; jobId: string | null };

async function listWeeklyConfigs(
  adminClient: AdminClient,
  hasGlobalCfg: boolean,
  resolveConfig: (dbCfg?: Partial<CsConfig>) => { cfg: CsConfig; source: ConfigSource },
): Promise<CsOrgConfig[]> {
  if (!hasGlobalCfg) {
    const { data } = await adminClient
      .from('connectsecure_config')
      .select('organization_id, pod_host, client_auth_token, company_id')
      .eq('enabled', true);
    return (data || []).map((cfg: any) => ({
      ...resolveConfig(cfg as Partial<CsConfig>).cfg,
      config_source: resolveConfig(cfg as Partial<CsConfig>).source,
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
      const resolved = resolveConfig(override || {});
      return {
        ...resolved.cfg,
        config_source: resolved.source,
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
    const jobId = await createConnectSecureJob(adminClient, orgId, domain, id);
    domainObjs.push({ domain, id, jobId });
  }

  await csScanNow(
    cfg,
    session,
    domainObjs.map(d => ({ name: d.domain, domain: d.domain, company_id: cfg.company_id, id: d.id })),
  );

  return { triggered: domainObjs.length, domains: domainObjs };
}

async function createConnectSecureJob(
  adminClient: AdminClient,
  orgId: string,
  domain: string,
  domainId: number,
): Promise<string | null> {
  const now = new Date().toISOString();
  const { data, error } = await adminClient
    .from('surface_scan_jobs')
    .insert({
      organization_id: orgId,
      tenant_id: orgId,
      customer_id: orgId,
      requested_by: null,
      raw_target: domain,
      normalized_target: domain,
      target_type: 'domain',
      hostname: domain,
      root_domain: domain,
      resolved_ips: [],
      scan_profile: 'domain_exposure',
      scan_name: `ConnectSecure ASM - ${domain}`,
      scan_type: 'connectsecure_asm',
      status: 'running',
      authorization_confirmed: true,
      started_at: now,
      config: {
        connectsecure: {
          attack_surface_domain_id: domainId,
          background: true,
        },
      },
      summary: {
        provider: 'connectsecure',
        status: 'running',
        attack_surface_domain_id: domainId,
      },
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    console.warn('[connectsecure-scan] unable to create surface_scan_jobs row:', error?.message || error);
    return null;
  }

  await logQueryError('unable to create running module result', adminClient.from('surface_scan_module_results').upsert({
    organization_id: orgId,
    tenant_id: orgId,
    customer_id: orgId,
    scan_job_id: data.id,
    module_key: 'connectsecure',
    module_label: 'Attack Surface Mapper',
    status: 'running',
    severity: 'info',
    source: 'connectsecure',
    started_at: now,
    normalized: {
      domain,
      attack_surface_domain_id: domainId,
      status: 'running',
    },
    raw: {},
  }, { onConflict: 'scan_job_id,module_key' }));

  return String(data.id);
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
      await saveResult(adminClient, cfg.organization_id, d.domain, result, d.jobId);
    } catch (err) {
      if (d.jobId) await markConnectSecureJobFailed(adminClient, d.jobId, cfg.organization_id, d.domain, d.id, err);
      console.warn('[connectsecure-scan] result ingest failed:', d.domain, err);
    }
  }
}

async function saveResult(
  adminClient: AdminClient,
  orgId: string,
  domain: string,
  result: CsResult,
  scanJobId: string | null,
): Promise<void> {
  const { assets: mappedAssets, findings, ports: mappedPorts, observations, sensitiveData } = csMapToFindings(result, domain, 0);
  const now = new Date().toISOString();

  for (const a of mappedAssets) {
    await logQueryError('unable to upsert surface asset', adminClient.from('surface_assets').upsert({
        organization_id: orgId,
        customer_id:     orgId,
        tenant_id:       orgId,
        scan_job_id:     scanJobId,
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
      }, { onConflict: 'organization_id,asset_type,asset_value' }));
  }

  for (const f of findings) {
    await logQueryError('unable to insert surface finding', adminClient.from('surface_findings').insert({
        organization_id: orgId,
        customer_id:     orgId,
        tenant_id:       orgId,
        scan_job_id:     scanJobId,
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
      }));
  }

  for (const p of mappedPorts) {
    await logQueryError('unable to upsert open port', adminClient.from('surface_open_ports').upsert({
        organization_id: orgId,
        customer_id:     orgId,
        tenant_id:       orgId,
        scan_job_id:     scanJobId,
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
      }, { onConflict: 'customer_id,host,port,protocol' }));
  }

  for (const obs of observations) {
    await logQueryError('unable to insert surface observation', adminClient.from('surface_observations').insert({
      organization_id: orgId,
      customer_id:     orgId,
      tenant_id:       orgId,
      scan_job_id:     scanJobId,
      module:          'connectsecure',
      observation_type: obs.type,
      title:           obs.title,
      value:           obs.value,
      severity:        obs.severity,
      confidence:      'high',
    }));
  }

  if ((sensitiveData.creds?.length || 0) + (sensitiveData.hashes?.length || 0) > 0) {
    await logQueryError('unable to insert sensitive-data summary', adminClient.from('connectsecure_sensitive_data').insert({
      organization_id: orgId,
      scan_job_id:     scanJobId,
      domain:          sensitiveData.domain,
      creds_count:     sensitiveData.creds?.length || 0,
      hashes_count:    sensitiveData.hashes?.length || 0,
      creds:           sensitiveData.creds || null,
      hashes:          sensitiveData.hashes || null,
    }));
  }

  if (scanJobId) {
    const severityCounts = findings.reduce((acc: Record<string, number>, finding) => {
      const severity = String(finding.severity || 'info');
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, { critical: 0, high: 0, medium: 0, low: 0, info: 0 });
    const moduleSeverity = (['critical', 'high', 'medium', 'low'] as const)
      .find(severity => (severityCounts[severity] || 0) > 0) || 'info';
    await logQueryError('unable to complete module result', adminClient.from('surface_scan_module_results').upsert({
      organization_id: orgId,
      tenant_id: orgId,
      customer_id: orgId,
      scan_job_id: scanJobId,
      module_key: 'connectsecure',
      module_label: 'Attack Surface Mapper',
      status: 'success',
      severity: moduleSeverity,
      source: 'connectsecure',
      completed_at: now,
      normalized: {
        domain,
        attack_surface_domain_id: result.attack_surface_domain_id,
        assets: mappedAssets.length,
        findings: findings.length,
        ports: mappedPorts.length,
        observations: observations.length,
        severity_counts: severityCounts,
      },
      raw: {
        status: result.status,
        updated: result.updated,
      },
    }, { onConflict: 'scan_job_id,module_key' }));

    await logQueryError('unable to complete scan job', adminClient.from('surface_scan_jobs').update({
      status: 'completed',
      completed_at: now,
      error_message: null,
      summary: {
        provider: 'connectsecure',
        status: 'completed',
        attack_surface_domain_id: result.attack_surface_domain_id,
        assets: mappedAssets.length,
        findings: findings.length,
        ports: mappedPorts.length,
        observations: observations.length,
        severity_counts: severityCounts,
        updated: result.updated || now,
      },
    }).eq('id', scanJobId));
  }
}

async function markConnectSecureJobFailed(
  adminClient: AdminClient,
  scanJobId: string,
  orgId: string,
  domain: string,
  domainId: number,
  err: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  const message = err instanceof Error ? err.message : String(err);
  await logQueryError('unable to fail module result', adminClient.from('surface_scan_module_results').upsert({
    organization_id: orgId,
    tenant_id: orgId,
    customer_id: orgId,
    scan_job_id: scanJobId,
    module_key: 'connectsecure',
    module_label: 'Attack Surface Mapper',
    status: 'error',
    severity: 'medium',
    source: 'connectsecure',
    completed_at: now,
    error_message: message,
    normalized: {
      domain,
      attack_surface_domain_id: domainId,
      status: 'error',
    },
    raw: {},
  }, { onConflict: 'scan_job_id,module_key' }));

  await logQueryError('unable to fail scan job', adminClient.from('surface_scan_jobs').update({
    status: 'failed',
    completed_at: now,
    error_message: message,
    summary: {
      provider: 'connectsecure',
      status: 'failed',
      attack_surface_domain_id: domainId,
      error: message,
    },
  }).eq('id', scanJobId));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type AuthDiagnostic = {
  config_source: ConfigSource;
  pod_host: string;
  company_id: number;
  token_present: boolean;
  token_length: number;
  token_sha256_prefix: string | null;
  auth_ok: boolean;
  user_id?: string;
  auth_error?: string;
};

async function diagnoseConnectSecureAuth(cfg: CsConfig, source: ConfigSource): Promise<AuthDiagnostic> {
  const token = csNormalizeClientAuthToken(cfg.client_auth_token || '');
  const base: AuthDiagnostic = {
    config_source: source,
    pod_host: cfg.pod_host || '',
    company_id: Number(cfg.company_id || 0),
    token_present: Boolean(token),
    token_length: token.length,
    token_sha256_prefix: token ? await sha256Prefix(token) : null,
    auth_ok: false,
  };

  if (!cfg.pod_host || !token || !cfg.company_id) {
    return { ...base, auth_error: 'missing_connectsecure_config' };
  }

  try {
    const session = await csAuthorize({ ...cfg, client_auth_token: token });
    return { ...base, auth_ok: true, user_id: session.userId };
  } catch (err) {
    return { ...base, auth_error: safeConnectSecureError(err) };
  }
}

async function sha256Prefix(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

function safeConnectSecureError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/Failed to authorize|authorize failed|auth failed/i.test(message)) {
    return 'auth_failed_config_diagnostic';
  }
  return message.substring(0, 300);
}

function jsonAuthFailed(diagnostic: AuthDiagnostic) {
  return json({
    ok: false,
    error: 'auth_failed_config_diagnostic',
    message: 'Secret ConnectSecure non valido o non aggiornato in Supabase',
    diagnostic,
  }, 401);
}

async function logQueryError(context: string, query: PromiseLike<{ error?: { message?: string } | null }>): Promise<void> {
  const { error } = await query;
  if (error) console.warn(`[connectsecure-scan] ${context}:`, error.message || error);
}

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

function jsonErr(msg: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: msg, ...extra }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
