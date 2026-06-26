/**
 * connectsecure-scan — Edge Function
 *
 * Azioni:
 *  test_auth   → verifica configurazione CS (solo diagnostica admin)
 *  scan        → trigger Attack Surface Mapper per una org specifica
 *  weekly_all  → sweep di tutte le org abilitate (dal cron)
 *  poll_pending → singolo ciclo persistente di raccolta risultati
 *
 * Auth: service-role key | x-surface-internal-secret | JWT utente Supabase valido
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  csAuthorize,
  csExtractSubdomains,
  csGetResults,
  csGetOrCreateDomain,
  csMapToFindings,
  csNormalizeClientAuthToken,
  csScanNow,
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
  let isInternal      = Boolean(INTERNAL_SECRET && internalToken === INTERNAL_SECRET);

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  if (!isServiceRole && !isInternal && internalToken) {
    const { data: validInternalToken } = await adminClient.rpc(
      'surface_scan_validate_internal_secret',
      { candidate: internalToken },
    );
    isInternal = validInternalToken === true;
  }

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

    // ── Persistent one-shot result poll ────────────────────────────────────
    if (action === 'poll_pending') {
      const maxJobs = Math.min(100, Math.max(1, toPositiveInt(body.max_jobs, 25)));
      const result = await pollPendingConnectSecureJobs(adminClient, {
        organizationId: orgId,
        maxJobs,
        resolveConfig,
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SERVICE_ROLE_KEY,
        internalSecret: INTERNAL_SECRET,
      });
      return json({ ok: true, ...result });
    }

    // ── Weekly sweep ────────────────────────────────────────────────────────
    if (action === 'weekly_all') {
      const configs = await listWeeklyConfigs(adminClient, hasGlobalCfg, resolveConfig);
      const results = await Promise.all(configs.map(async (cfg) => {
        try {
          const queued = await enqueueAttackSurfaceForOrg(adminClient, cfg.organization_id);
          return {
            org_id: cfg.organization_id,
            queued: queued.queued,
            domains: queued.domains,
            skipped_active: queued.skippedActive,
          };
        } catch (err) {
          return {
            org_id: cfg.organization_id,
            queued: 0,
            domains: 0,
            skipped_active: 0,
            error: safeConnectSecureError(err),
          };
        }
      }));
      return json({
        ok: true,
        status: 'queued',
        persistent_polling: true,
        orgs_swept: results.length,
        domains_queued: results.reduce((sum, row) => sum + row.queued, 0),
        results,
      });
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
    return json({
      ok: true,
      organization_id: orgId,
      status: 'triggered',
      message: 'Attack Surface Mapper avviato. Il poller persistente raccoglierà i risultati in background.',
      triggered: trigger.triggered,
      domains: trigger.domains.map(d => d.domain),
      skipped_active: trigger.skippedActive,
      persistent_polling: true,
    });

  } catch (err) {
    console.error('[connectsecure-scan] errore:', err);
    return json({ ok: false, error: safeConnectSecureError(err) }, 500);
  }
});

// ── Attack Surface Mapper Engine ──────────────────────────────────────────────

type AdminClient = any;
type CsOrgConfig = CsConfig & { organization_id: string; config_source: ConfigSource };
type TriggeredDomain = { domain: string; id: number; jobId: string | null; requestedAt: string };

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

async function enqueueAttackSurfaceForOrg(
  adminClient: AdminClient,
  orgId: string,
): Promise<{ queued: number; domains: number; skippedActive: number }> {
  const domains = await resolveScopeDomains(adminClient, orgId);
  if (domains.length === 0) return { queued: 0, domains: 0, skippedActive: 0 };

  const { data: activeJobs, error: activeError } = await adminClient
    .from('surface_scan_jobs')
    .select('normalized_target')
    .eq('organization_id', orgId)
    .eq('scan_type', 'connectsecure_asm')
    .in('status', ['queued', 'pending', 'running', 'polling'])
    .in('normalized_target', domains);
  if (activeError) throw activeError;

  const activeTargets = new Set(
    (activeJobs || []).map((row: any) => normalizeDomain(String(row.normalized_target || ''))).filter(Boolean),
  );
  const queuedDomains = domains.filter(domain => !activeTargets.has(domain));
  if (queuedDomains.length === 0) {
    return { queued: 0, domains: domains.length, skippedActive: domains.length };
  }

  const now = new Date().toISOString();
  const { data: insertedJobs, error: insertError } = await adminClient
    .from('surface_scan_jobs')
    .insert(queuedDomains.map(domain => ({
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
      scan_name: `External ASM - ${domain}`,
      scan_type: 'connectsecure_asm',
      status: 'queued',
      authorization_confirmed: true,
      started_at: null,
      config: {
        connectsecure: {
          background: true,
          trigger_pending: true,
        },
      },
      summary: {
        provider: 'connectsecure',
        status: 'queued',
      },
    })))
    .select('id, normalized_target');
  if (insertError) throw insertError;

  const inserted = insertedJobs || [];
  if (inserted.length > 0) {
    const { error: moduleError } = await adminClient
      .from('surface_scan_module_results')
      .insert(inserted.map((job: any) => ({
        organization_id: orgId,
        tenant_id: orgId,
        customer_id: orgId,
        scan_job_id: job.id,
        module_key: 'connectsecure',
        module_label: 'Attack Surface Mapper',
        status: 'queued',
        severity: 'info',
        source: 'connectsecure',
        started_at: null,
        normalized: {
          domain: job.normalized_target,
          status: 'queued',
        },
        raw: {},
      })));
    if (moduleError) throw moduleError;
  }

  console.info('[connectsecure-scan] queued organization scope', {
    organization_id: orgId,
    domains: domains.length,
    queued: inserted.length,
    skipped_active: domains.length - inserted.length,
    queued_at: now,
  });
  return {
    queued: inserted.length,
    domains: domains.length,
    skippedActive: domains.length - inserted.length,
  };
}

async function triggerAttackSurfaceForOrg(
  adminClient: AdminClient,
  cfg: CsConfig & { organization_id: string },
  forceDomain?: string,
): Promise<{ triggered: number; domains: TriggeredDomain[]; skippedActive: number }> {
  const orgId = cfg.organization_id;
  const domains = await resolveScopeDomains(adminClient, orgId, forceDomain);
  if (domains.length === 0) return { triggered: 0, domains: [], skippedActive: 0 };

  const session = { current: await csAuthorize(cfg) };
  const scanRequestedAt = new Date(Date.now() - 5_000).toISOString();
  const domainObjs: TriggeredDomain[] = [];
  let skippedActive = 0;
  for (const domain of domains) {
    const { data: activeJob } = await adminClient
      .from('surface_scan_jobs')
      .select('id')
      .eq('organization_id', orgId)
      .eq('scan_type', 'connectsecure_asm')
      .eq('normalized_target', domain)
      .in('status', ['queued', 'pending', 'running', 'polling'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeJob?.id) {
      skippedActive += 1;
      continue;
    }

    const id = await csGetOrCreateDomain(cfg, session, domain, adminClient, orgId);
    const jobId = await createConnectSecureJob(adminClient, orgId, domain, id);
    if (!jobId) {
      skippedActive += 1;
      continue;
    }
    domainObjs.push({ domain, id, jobId, requestedAt: scanRequestedAt });
  }

  try {
    await csScanNow(
      cfg,
      session,
      domainObjs.map(d => ({ name: d.domain, domain: d.domain, company_id: cfg.company_id, id: d.id })),
    );
  } catch (err) {
    await Promise.all(domainObjs.map(d =>
      d.jobId
        ? markConnectSecureJobFailed(adminClient, d.jobId, orgId, d.domain, d.id, err)
        : Promise.resolve()
    ));
    throw err;
  }

  for (const d of domainObjs) {
    await logQueryError('unable to update connectsecure registry scan timestamp', adminClient
      .from('connectsecure_domain_registry')
      .upsert({
        organization_id: orgId,
        domain: d.domain,
        cs_domain_id: d.id,
        last_scanned_at: scanRequestedAt,
      }, { onConflict: 'organization_id,domain' }));
  }

  return { triggered: domainObjs.length, domains: domainObjs, skippedActive };
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
      scan_name: `External ASM - ${domain}`,
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
    if (String(error?.code || '') === '23505') return null;
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

function scheduleBackground(task: Promise<unknown>): boolean {
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task.catch(err => console.error('[connectsecure-scan] background task failed:', safeConnectSecureError(err))));
    return true;
  }
  task.catch(err => console.error('[connectsecure-scan] background task failed:', safeConnectSecureError(err)));
  return false;
}

type PendingConnectSecureJob = {
  id: string;
  organization_id: string;
  normalized_target: string;
  status: string;
  started_at: string | null;
  created_at: string;
  updated_at: string;
  config: Record<string, any> | null;
  summary: Record<string, any> | null;
};

type PollPendingOptions = {
  organizationId?: string;
  maxJobs: number;
  resolveConfig: (dbCfg?: Partial<CsConfig>) => { cfg: CsConfig; source: ConfigSource };
  supabaseUrl: string;
  serviceRoleKey: string;
  internalSecret: string;
};

async function pollPendingConnectSecureJobs(
  adminClient: AdminClient,
  options: PollPendingOptions,
) {
  const selectJobs = (statuses: string[], limit: number) => {
    let query = adminClient
      .from('surface_scan_jobs')
      .select('id, organization_id, normalized_target, status, started_at, created_at, updated_at, config, summary')
      .eq('scan_type', 'connectsecure_asm')
      .in('status', statuses)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (options.organizationId) query = query.eq('organization_id', options.organizationId);
    return query;
  };

  const queuedLimit = Math.min(options.maxJobs, Math.max(1, Math.ceil(options.maxJobs * 0.6)));
  const activeLimit = Math.max(0, options.maxJobs - queuedLimit);
  const [queuedResult, activeResult] = await Promise.all([
    selectJobs(['queued'], queuedLimit),
    activeLimit > 0
      ? selectJobs(['pending', 'running', 'polling'], activeLimit)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (queuedResult.error) throw queuedResult.error;
  if (activeResult.error) throw activeResult.error;

  const jobs = [
    ...(queuedResult.data || []),
    ...(activeResult.data || []),
  ] as PendingConnectSecureJob[];
  const maxAgeMinutes = toPositiveInt(Deno.env.get('CONNECTSECURE_POLL_MAX_AGE_MINUTES'), 24 * 60);
  const maxAgeMs = maxAgeMinutes * 60 * 1000;
  const leaseMs = Math.max(60_000, toPositiveInt(Deno.env.get('CONNECTSECURE_POLL_LEASE_SECONDS'), 300) * 1000);
  const runtimeByOrg = new Map<string, Promise<{
    cfg: CsConfig;
    session: { current: Awaited<ReturnType<typeof csAuthorize>> };
  }>>();
  const completedOrganizations = new Set<string>();
  const stats = {
    examined: jobs.length,
    claimed: 0,
    triggered: 0,
    completed: 0,
    pending: 0,
    failed: 0,
    skipped_leased: 0,
    skipped_claimed: 0,
    errors: [] as Array<{ job_id: string; organization_id: string; target: string; error: string }>,
  };

  const getRuntime = (organizationId: string) => {
    const existing = runtimeByOrg.get(organizationId);
    if (existing) return existing;
    const pending = (async () => {
      const { data: dbCfg } = await adminClient
        .from('connectsecure_config')
        .select('pod_host, client_auth_token, company_id, enabled')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (dbCfg?.enabled === false) throw new Error('connectsecure_disabled_for_organization');
      const { cfg } = options.resolveConfig(dbCfg || {});
      if (!cfg.pod_host || !cfg.client_auth_token || !cfg.company_id) {
        throw new Error('missing_connectsecure_config');
      }
      return { cfg, session: { current: await csAuthorize(cfg) } };
    })();
    runtimeByOrg.set(organizationId, pending);
    return pending;
  };

  for (const job of jobs) {
    const updatedMs = Date.parse(job.updated_at || job.created_at);
    if (job.status === 'polling' && Number.isFinite(updatedMs) && Date.now() - updatedMs < leaseMs) {
      stats.skipped_leased += 1;
      continue;
    }

    const { data: claimed, error: claimError } = await adminClient
      .from('surface_scan_jobs')
      .update({ status: 'polling' })
      .eq('id', job.id)
      .eq('status', job.status)
      .select('id')
      .maybeSingle();
    if (claimError) {
      stats.errors.push({
        job_id: job.id,
        organization_id: job.organization_id,
        target: job.normalized_target,
        error: safeConnectSecureError(claimError),
      });
      continue;
    }
    if (!claimed?.id) {
      stats.skipped_claimed += 1;
      continue;
    }
    stats.claimed += 1;

    const releaseForNextPoll = async () => {
      await logQueryError('unable to release ConnectSecure poll lease', adminClient
        .from('surface_scan_jobs')
        .update({ status: job.status === 'queued' ? 'queued' : 'running' })
        .eq('id', job.id)
        .eq('status', 'polling'));
    };

    try {
      const { cfg, session } = await getRuntime(job.organization_id);
      const shouldTrigger = job.status === 'queued' && (
        job.config?.connectsecure?.trigger_pending === true ||
        !job.started_at
      );
      let domainId = Number(
        job.config?.connectsecure?.attack_surface_domain_id ??
        job.summary?.attack_surface_domain_id ??
        0
      );
      if (!domainId) {
        const { data: registry } = await adminClient
          .from('connectsecure_domain_registry')
          .select('cs_domain_id')
          .eq('organization_id', job.organization_id)
          .eq('domain', job.normalized_target)
          .maybeSingle();
        domainId = Number(registry?.cs_domain_id || 0);
      }
      if (shouldTrigger) {
        if (!domainId) {
          domainId = await csGetOrCreateDomain(
            cfg,
            session,
            job.normalized_target,
            adminClient,
            job.organization_id,
          );
        }

        const scanRequestedAt = new Date(Date.now() - 5_000).toISOString();
        const triggeringConfig = {
          ...(job.config || {}),
          connectsecure: {
            ...(job.config?.connectsecure || {}),
            attack_surface_domain_id: domainId,
            background: true,
            trigger_pending: false,
            trigger_started_at: scanRequestedAt,
          },
        };
        const triggeringSummary = {
          ...(job.summary || {}),
          provider: 'connectsecure',
          status: 'triggering',
          attack_surface_domain_id: domainId,
        };
        const { error: prepareError } = await adminClient
          .from('surface_scan_jobs')
          .update({
            started_at: scanRequestedAt,
            config: triggeringConfig,
            summary: triggeringSummary,
          })
          .eq('id', job.id)
          .eq('status', 'polling');
        if (prepareError) throw prepareError;

        try {
          await csScanNow(cfg, session, [{
            name: job.normalized_target,
            domain: job.normalized_target,
            company_id: cfg.company_id,
            id: domainId,
          }]);
        } catch (err) {
          await logQueryError('unable to restore queued ConnectSecure trigger', adminClient
            .from('surface_scan_jobs')
            .update({
              status: 'queued',
              started_at: null,
              config: {
                ...triggeringConfig,
                connectsecure: {
                  ...triggeringConfig.connectsecure,
                  trigger_pending: true,
                },
              },
              summary: {
                ...triggeringSummary,
                status: 'queued',
              },
            })
            .eq('id', job.id));
          throw err;
        }

        await Promise.all([
          logQueryError('unable to mark ConnectSecure trigger running', adminClient
            .from('surface_scan_jobs')
            .update({
              status: 'running',
              summary: {
                ...triggeringSummary,
                status: 'running',
              },
            })
            .eq('id', job.id)
            .eq('status', 'polling')),
          logQueryError('unable to mark ConnectSecure module running', adminClient
            .from('surface_scan_module_results')
            .upsert({
              organization_id: job.organization_id,
              tenant_id: job.organization_id,
              customer_id: job.organization_id,
              scan_job_id: job.id,
              module_key: 'connectsecure',
              module_label: 'Attack Surface Mapper',
              status: 'running',
              severity: 'info',
              source: 'connectsecure',
              started_at: scanRequestedAt,
              normalized: {
                domain: job.normalized_target,
                attack_surface_domain_id: domainId,
                status: 'running',
              },
              raw: {},
            }, { onConflict: 'scan_job_id,module_key' })),
          logQueryError('unable to update connectsecure registry scan timestamp', adminClient
            .from('connectsecure_domain_registry')
            .upsert({
              organization_id: job.organization_id,
              domain: job.normalized_target,
              cs_domain_id: domainId,
              last_scanned_at: scanRequestedAt,
            }, { onConflict: 'organization_id,domain' })),
        ]);
        stats.triggered += 1;
        continue;
      }
      if (!domainId) throw new Error('missing_connectsecure_domain_id');

      const requestedAtMs = Date.parse(job.started_at || job.created_at);
      const freshAfter = Number.isFinite(requestedAtMs)
        ? new Date(requestedAtMs - 10_000).toISOString()
        : undefined;
      const result = await csGetResults(cfg, session, domainId, freshAfter);

      if (result) {
        await saveResult(adminClient, job.organization_id, job.normalized_target, result, job.id);
        stats.completed += 1;
        completedOrganizations.add(job.organization_id);
        continue;
      }

      const ageMs = Number.isFinite(requestedAtMs) ? Date.now() - requestedAtMs : 0;
      if (ageMs > maxAgeMs) {
        await markConnectSecureJobFailed(
          adminClient,
          job.id,
          job.organization_id,
          job.normalized_target,
          domainId,
          new Error(`ConnectSecure result not available after ${maxAgeMinutes} minutes`),
        );
        stats.failed += 1;
        continue;
      }

      await releaseForNextPoll();
      stats.pending += 1;
    } catch (err) {
      const message = safeConnectSecureError(err);
      const requestedAtMs = Date.parse(job.started_at || job.created_at);
      const ageMs = Number.isFinite(requestedAtMs) ? Date.now() - requestedAtMs : 0;
      const terminal = /scan failed|missing_connectsecure_domain_id/i.test(message) || ageMs > maxAgeMs;
      if (terminal) {
        const domainId = Number(
          job.config?.connectsecure?.attack_surface_domain_id ??
          job.summary?.attack_surface_domain_id ??
          0
        );
        await markConnectSecureJobFailed(
          adminClient,
          job.id,
          job.organization_id,
          job.normalized_target,
          domainId,
          err,
        );
        stats.failed += 1;
      } else {
        await releaseForNextPoll();
        stats.pending += 1;
      }
      stats.errors.push({
        job_id: job.id,
        organization_id: job.organization_id,
        target: job.normalized_target,
        error: message,
      });
    }
  }

  const postProcessingScheduled = completedOrganizations.size > 0 && scheduleBackground(
    runPostIngestionTasks(options, [...completedOrganizations])
  );
  return {
    ...stats,
    organizations_completed: [...completedOrganizations],
    max_age_minutes: maxAgeMinutes,
    post_processing_scheduled: postProcessingScheduled,
  };
}

async function runPostIngestionTasks(
  options: Pick<PollPendingOptions, 'supabaseUrl' | 'serviceRoleKey' | 'internalSecret'>,
  organizationIds: string[],
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${options.serviceRoleKey}`,
  };
  if (options.internalSecret) headers['x-surface-internal-secret'] = options.internalSecret;

  await Promise.allSettled(organizationIds.map(organizationId =>
    fetch(`${options.supabaseUrl}/functions/v1/surface-scan-cron`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        organization_id: organizationId,
        dispatch_only: true,
        triggered_by: 'connectsecure_result_ingested',
      }),
    })
  ));

  const reportQueue = [...organizationIds];
  const reportWorkers = Array.from({ length: Math.min(2, reportQueue.length) }, async () => {
    while (reportQueue.length > 0) {
      const organizationId = reportQueue.shift();
      if (!organizationId) return;
      await postInternalJsonWithRetry(
        `${options.supabaseUrl}/functions/v1/surfacescan360-ai-report`,
        headers,
        {
          organization_id: organizationId,
          scope_mode: 'organization_scope',
          trigger_source: 'connectsecure_result_ingested',
          force_regenerate: true,
          created_by: null,
        },
        `SurfaceScan report ${organizationId}`,
      );
    }
  });
  await Promise.allSettled(reportWorkers);

  await fetch(`${options.supabaseUrl}/functions/v1/cve-enrichment`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      trigger: 'connectsecure_result_ingested',
      max_per_run: Math.max(1, organizationIds.length),
      drain_all: false,
    }),
  }).catch(() => undefined);
}

async function postInternalJsonWithRetry(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  label: string,
): Promise<void> {
  const retryable = new Set([409, 425, 429, 500, 502, 503, 504]);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (response.ok) return;
      const responseText = await response.text().catch(() => '');
      if (!retryable.has(response.status) || attempt === 3) {
        console.warn(`[connectsecure-scan] ${label} failed`, {
          status: response.status,
          response: responseText.substring(0, 240),
          attempt,
        });
        return;
      }
    } catch (err) {
      if (attempt === 3) {
        console.warn(`[connectsecure-scan] ${label} request failed`, safeConnectSecureError(err));
        return;
      }
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 2_000));
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

  if (scanJobId) {
    await Promise.all([
      logQueryError('unable to reset ConnectSecure findings before ingest', adminClient
        .from('surface_findings')
        .delete()
        .eq('scan_job_id', scanJobId)
        .eq('provider', 'connectsecure')),
      logQueryError('unable to reset ConnectSecure observations before ingest', adminClient
        .from('surface_observations')
        .delete()
        .eq('scan_job_id', scanJobId)),
      logQueryError('unable to reset ConnectSecure open ports before ingest', adminClient
        .from('surface_open_ports')
        .delete()
        .eq('scan_job_id', scanJobId)
        .eq('source', 'connectsecure')),
      logQueryError('unable to reset ConnectSecure sensitive data before ingest', adminClient
        .from('connectsecure_sensitive_data')
        .delete()
        .eq('scan_job_id', scanJobId)),
    ]);
  }

  const subdomainQueueStats = await enqueueConnectSecureSubdomainJobs(adminClient, orgId, domain, result, scanJobId);

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
        raw:             {
          source: 'connectsecure',
          scope_target_host: domain,
          root_domain: domain,
          attack_surface_domain_id: result.attack_surface_domain_id,
        },
      }, { onConflict: 'scan_job_id,host,port,protocol' }));
  }

  for (const obs of observations) {
    const moduleKey = String(obs.module || '').trim() || 'connectsecure';
    await logQueryError('unable to insert surface observation', adminClient.from('surface_observations').insert({
      organization_id: orgId,
      customer_id:     orgId,
      tenant_id:       orgId,
      scan_job_id:     scanJobId,
      module:          moduleKey,
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
        subdomain_child_queue: subdomainQueueStats,
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
        subdomain_child_queue: subdomainQueueStats,
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

type SubdomainQueueStats = {
  discovered: number;
  eligible: number;
  inserted: number;
  skippedExisting: number;
  skippedLimit: number;
  limit: number;
  surface_scan_extended: boolean;
};

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

async function enqueueConnectSecureSubdomainJobs(
  adminClient: AdminClient,
  orgId: string,
  rootDomain: string,
  result: CsResult,
  parentScanJobId: string | null,
): Promise<SubdomainQueueStats> {
  const normalizedRoot = normalizeDomain(rootDomain);
  const discovered = csExtractSubdomains(result, normalizedRoot)
    .map((entry) => normalizeDomain(entry))
    .filter((entry) => entry && entry !== normalizedRoot && entry.endsWith(`.${normalizedRoot}`));
  const uniqueDiscovered = Array.from(new Set(discovered)).sort();

  const { data: orgRuntime } = await adminClient
    .from('organizations')
    .select('surface_scan_extended')
    .eq('id', orgId)
    .maybeSingle();
  const surfaceScanExtended = Boolean(orgRuntime?.surface_scan_extended);
  const configuredLimit = toPositiveInt(Deno.env.get('SURFACESCAN_SUBDOMAIN_CHILD_JOB_LIMIT'), surfaceScanExtended ? 75 : 10);
  const limit = surfaceScanExtended ? configuredLimit : Math.min(configuredLimit, 10);
  const cooldownHours = toPositiveInt(Deno.env.get('SURFACESCAN_SUBDOMAIN_CHILD_COOLDOWN_HOURS'), 24);
  const cooldownIso = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
  const selected = uniqueDiscovered.slice(0, limit);
  let inserted = 0;
  let skippedExisting = 0;

  for (const subdomain of selected) {
    const { count: existingCount } = await adminClient
      .from('surface_scan_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('normalized_target', subdomain)
      .in('status', ['queued', 'pending', 'running', 'completed'])
      .gte('created_at', cooldownIso);

    if ((existingCount || 0) > 0) {
      skippedExisting += 1;
      continue;
    }

    const { error } = await adminClient.from('surface_scan_jobs').insert({
      organization_id: orgId,
      tenant_id: orgId,
      customer_id: orgId,
      requested_by: null,
      raw_target: subdomain,
      normalized_target: subdomain,
      target_type: 'subdomain',
      hostname: subdomain,
      root_domain: normalizedRoot,
      resolved_ips: [],
      scan_profile: 'domain_exposure',
      scan_type: 'subdomain_enrichment',
      scan_name: `Subdomain enrichment - ${subdomain}`,
      status: 'queued',
      authorization_confirmed: true,
      config: {
        parent_scan_job_id: parentScanJobId,
        parent_target: normalizedRoot,
        parent_depth: 0,
        subdomain_depth: 1,
        subdomain_max_depth: 10,
        subdomain_child_job_limit: limit,
        subdomain_source: 'connectsecure',
        discovered_from: 'connectsecure',
        discovered_parent: normalizedRoot,
        auto_expand_subdomains: true,
        no_connectsecure: true,
      },
      summary: {
        parent_scan_job_id: parentScanJobId,
        root_domain: normalizedRoot,
        parent_depth: 0,
        subdomain_depth: 1,
        subdomain_max_depth: 10,
        discovered_from: 'connectsecure',
      },
    });

    if (error) {
      console.warn('[connectsecure-scan] unable to enqueue subdomain enrichment:', error.message || error);
      continue;
    }
    inserted += 1;
  }

  const stats = {
    discovered: uniqueDiscovered.length,
    eligible: uniqueDiscovered.length,
    inserted,
    skippedExisting,
    skippedLimit: Math.max(0, uniqueDiscovered.length - selected.length),
    limit,
    surface_scan_extended: surfaceScanExtended,
  };

  if (parentScanJobId && (uniqueDiscovered.length > 0 || inserted > 0)) {
    await logQueryError('unable to insert connectsecure subdomain queue observation', adminClient.from('surface_observations').insert({
      organization_id: orgId,
      customer_id: orgId,
      tenant_id: orgId,
      scan_job_id: parentScanJobId,
      module: 'connectsecure',
      observation_type: 'connectsecure_subdomain_child_jobs',
      title: 'Scanner esterno: sottodomini accodati per arricchimento interno',
      value: {
        ...stats,
        root_domain: normalizedRoot,
        max_depth: 10,
        cooldown_hours: cooldownHours,
        sample: selected.slice(0, 30),
      },
      severity: 'info',
      confidence: 'high',
    }));
  }

  return stats;
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
