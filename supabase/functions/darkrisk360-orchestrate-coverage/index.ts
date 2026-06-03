/**
 * darkrisk360-orchestrate-coverage
 *
 * Orchestratore automatico dei Coverage Controls DarkRisk360.
 * Triggerato da: darkrisk360-snapshot (post-scan) e darkrisk-esteso-admin-cron (weekly).
 *
 * Per ogni org, controlla lo stato di ciascun controllo e triggera automaticamente
 * i scan mancanti (SurfaceScan360 e IntelX).
 *
 * Idempotente: non ri-triggera scan già in corso o completati di recente.
 *
 * Scan profiles mappati per controllo:
 *   DNS / WHOIS / Email / Porte → domain_exposure (domini) + ip_exposure (IP)
 *   Phonebook → gestito da darkrisk-esteso-sync con trigger_type='coverage_retry'
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DARKRISK_INTERNAL_SECRET = String(Deno.env.get('DARKRISK360_INTERNAL_SECRET') || '').trim();
const SURFACESCAN_INTERNAL_SECRET = String(Deno.env.get('SURFACESCAN_INTERNAL_SECRET') || '').trim();

// Cooldown: non ri-triggera se il controllo è stato aggiornato nelle ultime N ore
const CONTROL_COOLDOWN_HOURS = 6;
// Timeout singola chiamata surface-scan
const SURFACE_CALL_TIMEOUT_MS = 20_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-darkrisk360-internal-secret',
};

// Moduli SurfaceScan360 che servono per ogni tipo di controllo
const CONTROL_TO_MODULES: Record<string, string[]> = {
  dns:            ['dns', 'dnssec', 'dns_blocklists'],
  whois:          ['whois'],
  email_security: ['mail_security', 'mail_config'],
  ports_services: ['open_ports', 'shodan'],
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const secret = req.headers.get('x-darkrisk360-internal-secret') ?? '';
  if (!DARKRISK_INTERNAL_SECRET || secret !== DARKRISK_INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { organization_id?: string; scan_run_id?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* ok */ }

  const { organization_id: orgId, force = false } = body;
  if (!orgId) {
    return new Response(JSON.stringify({ error: 'organization_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await orchestrateCoverage(adminClient, orgId, force);

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function orchestrateCoverage(
  adminClient: ReturnType<typeof createClient>,
  orgId: string,
  force: boolean,
) {
  const triggered: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // 1. Carica scope (domini + IP)
  const { data: scopeRows } = await adminClient
    .from('surface_scan_monitored_ips' as any)
    .select('entry_type, input_value')
    .eq('organization_id', orgId);

  // Se nessun scope SS360, prova da manual_targets DarkRisk360
  let domains: string[] = [];
  let ips: string[] = [];

  if ((scopeRows?.length ?? 0) > 0) {
    const rows = scopeRows as Array<{ entry_type: string; input_value: string }>;
    domains = rows.filter((r) => r.entry_type === 'domain').map((r) => r.input_value).filter(Boolean);
    ips = rows.filter((r) => r.entry_type === 'single').map((r) => r.input_value).filter(Boolean);
  } else {
    const { data: manualRows } = await adminClient
      .from('darkrisk360_manual_targets' as any)
      .select('target_type, value')
      .eq('organization_id', orgId)
      .eq('enabled', true);
    if (manualRows?.length) {
      const mr = manualRows as Array<{ target_type: string; value: string }>;
      domains = mr.filter((r) => r.target_type === 'domain').map((r) => r.value);
      ips = mr.filter((r) => r.target_type === 'ip').map((r) => r.value);
    }
  }

  if (!domains.length && !ips.length) {
    return { triggered, skipped: ['no_scope'], errors };
  }

  // 2. Controlla quali moduli SurfaceScan360 sono stale/mancanti
  const staleControls = await getStaleControls(adminClient, orgId, force);

  // 3. Trigger SurfaceScan360 per ogni dominio/IP con i profili necessari
  const needsDomainExposure = staleControls.some((c) => ['dns', 'whois', 'email_security', 'ports_services'].includes(c));
  const needsIpExposure = staleControls.includes('ports_services');

  if (needsDomainExposure) {
    for (const domain of domains.slice(0, 10)) { // max 10 domini
      const ok = await triggerSurfaceScan(orgId, domain, 'domain_exposure');
      if (ok) triggered.push(`domain_exposure:${domain}`);
      else errors.push(`domain_exposure:${domain}`);
    }
  }

  if (needsIpExposure) {
    for (const ip of ips.slice(0, 5)) { // max 5 IP
      const ok = await triggerSurfaceScan(orgId, ip, 'ip_exposure');
      if (ok) triggered.push(`ip_exposure:${ip}`);
      else errors.push(`ip_exposure:${ip}`);
    }
  }

  if (!needsDomainExposure && !needsIpExposure) {
    skipped.push('all_surface_controls_current');
  }

  // 4. Phonebook mancante: triggera un retry DarkRisk scan
  if (staleControls.includes('phonebook')) {
    const ok = await triggerDarkRiskPhonebookRetry(orgId);
    if (ok) triggered.push('phonebook_retry');
    else errors.push('phonebook_retry');
  }

  // 5. Log su audit
  await adminClient
    .from('darkrisk_audit_log' as any)
    .insert({
      organization_id: orgId,
      tenant_id: orgId,
      actor_id: null,
      action: 'darkrisk360_coverage_orchestration',
      entity_type: 'coverage_controls',
      entity_id: orgId,
      reason: 'automatic_orchestration',
      metadata: { triggered, skipped, errors, stale_controls: staleControls, force },
    })
    .catch(() => undefined);

  return { triggered, skipped, errors, stale_controls: staleControls };
}

async function getStaleControls(
  adminClient: ReturnType<typeof createClient>,
  orgId: string,
  force: boolean,
): Promise<string[]> {
  if (force) return ['dns', 'whois', 'email_security', 'ports_services', 'phonebook'];

  const stale: string[] = [];
  const cutoff = new Date(Date.now() - CONTROL_COOLDOWN_HOURS * 3_600_000).toISOString();

  // Check: esiste un scan_job completato recentemente con module results?
  const { data: recentJob } = await (adminClient as any)
    .from('surface_scan_jobs')
    .select('id, status, created_at, scan_profile')
    .eq('organization_id', orgId)
    .in('status', ['completed', 'completed_with_warnings', 'partial'])
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!recentJob) {
    // Nessun job recente — tutti i controlli SS360 sono stale
    stale.push('dns', 'whois', 'email_security', 'ports_services');
  } else {
    // Controlla quali moduli mancano nel job più recente
    const { data: moduleRows } = await (adminClient as any)
      .from('surface_scan_module_results')
      .select('module_key, status')
      .eq('scan_job_id', recentJob.id);

    const completedModules = new Set(
      ((moduleRows ?? []) as Array<{ module_key: string; status: string }>)
        .filter((r) => ['completed', 'success', 'finished'].includes(r.status))
        .map((r) => r.module_key),
    );

    for (const [control, modules] of Object.entries(CONTROL_TO_MODULES)) {
      const hasAny = modules.some((m) => completedModules.has(m));
      if (!hasAny) stale.push(control);
    }
  }

  // Check phonebook: cerca nel scan_runs recente
  const { data: latestRun } = await (adminClient as any)
    .from('darkrisk_scan_runs')
    .select('stats')
    .eq('organization_id', orgId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const phonebookRuns = Number((latestRun as any)?.stats?.intelx?.phonebook_searches_run ?? 0);
  if (phonebookRuns === 0) stale.push('phonebook');

  return [...new Set(stale)];
}

async function triggerSurfaceScan(
  orgId: string,
  target: string,
  profile: 'domain_exposure' | 'ip_exposure',
): Promise<boolean> {
  if (!SUPABASE_URL) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SURFACE_CALL_TIMEOUT_MS);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/surfacescan360-start-scan`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        ...(DARKRISK_INTERNAL_SECRET ? { 'x-darkrisk360-internal-secret': DARKRISK_INTERNAL_SECRET } : {}),
        ...(SURFACESCAN_INTERNAL_SECRET ? { 'x-surface-internal-secret': SURFACESCAN_INTERNAL_SECRET } : {}),
      },
      body: JSON.stringify({
        target,
        customer_id: orgId,
        scan_profile: profile,
        authorization_confirmed: true,
        ownership_proof: 'darkrisk360_coverage',
        force_refresh: false, // rispetta cooldown SurfaceScan
      }),
    });
    clearTimeout(t);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`[orchestrate-coverage] ${profile} ${target} HTTP=${res.status} ${txt.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[orchestrate-coverage] ${profile} ${target} err=${String(err).slice(0, 200)}`);
    return false;
  }
}

async function triggerDarkRiskPhonebookRetry(orgId: string): Promise<boolean> {
  if (!SUPABASE_URL || !DARKRISK_INTERNAL_SECRET) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SURFACE_CALL_TIMEOUT_MS);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/darkrisk-esteso-sync`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        'x-darkrisk-esteso-cron-secret': DARKRISK_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        customer_id: orgId,
        trigger_type: 'coverage_phonebook_retry',
        include_surface_sync: false, // solo IntelX, non ri-triggerare SS360
      }),
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}
