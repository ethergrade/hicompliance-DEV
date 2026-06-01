import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  corsHeaders,
  makeSupabaseClients,
  getCallerProfile,
  assertCustomerAccess,
  evaluateOrganizationServiceGate,
  toErrorResponsePayload,
} from '../_shared/surface-scan-utils.ts';
import {
  PENTEST_TOOL_IDS,
  type SurfacePortTechScanRequest,
} from '../_shared/pentestToolsTypes.ts';
import {
  normalizeTargets,
  resolveRequestDefaults,
  toolNameById,
  hostFromTargetValue,
} from '../_shared/exposureUtils.ts';
import {
  buildPortScannerParams,
  buildSubdomainFinderParams,
} from '../_shared/pentestToolsParamMapper.ts';
import { startQueuedScansForJob } from '../_shared/exposureQueue.ts';

const SERVICE_ROLE_KEY = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const INTERNAL_CRON_SECRET = String(
  Deno.env.get('SURFACESCAN_CRON_INTERNAL_SECRET')
  || Deno.env.get('SURFACESCAN_INTERNAL_SECRET')
  || '',
).trim();
const DARKRISK_INTERNAL_SECRET = String(
  Deno.env.get('DARKRISK360_INTERNAL_SECRET')
  || '',
).trim();

function extractBearerToken(req: Request): string {
  const auth = String(req.headers.get('authorization') || '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return String(match?.[1] || '').trim();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const bearerToken = extractBearerToken(req);
    const cronSecretHeader = String(
      req.headers.get('x-surface-internal-secret')
      || req.headers.get('x-cron-secret')
      || req.headers.get('x-darkrisk-internal-secret')
      || req.headers.get('x-darkrisk360-internal')
      || '',
    ).trim();
    const isServiceRoleToken =
      Boolean(SERVICE_ROLE_KEY)
      && bearerToken === SERVICE_ROLE_KEY;
    const isInternalSecretInvocation =
      Boolean(cronSecretHeader)
      && (
        (Boolean(INTERNAL_CRON_SECRET) && cronSecretHeader === INTERNAL_CRON_SECRET)
        || (Boolean(DARKRISK_INTERNAL_SECRET) && cronSecretHeader === DARKRISK_INTERNAL_SECRET)
      );
    const isServiceRoleInvocation = isServiceRoleToken || isInternalSecretInvocation;

    const raw = (await req.json()) as Partial<SurfacePortTechScanRequest>;
    const input = resolveRequestDefaults(raw || {});

    let requestedByUserId: string | null = null;
    let callerProfile: Awaited<ReturnType<typeof getCallerProfile>> | null = null;

    if (!isServiceRoleInvocation) {
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

      callerProfile = await getCallerProfile(adminClient, authData.user.id);
      if (!callerProfile.isAdminLike) {
        return jsonResponse({ error: 'Only admin users can start exposure scans' }, 403);
      }
      requestedByUserId = authData.user.id;
    } else {
      if (!input.customer_id) {
        return jsonResponse({ error: 'customer_id is required for internal cron invocation' }, 400);
      }
    }

    if (!input.customer_id) {
      return jsonResponse({ error: 'customer_id is required' }, 400);
    }
    if (!input.tenant_id) {
      input.tenant_id = input.customer_id;
    }
    if (!isServiceRoleInvocation && callerProfile) {
      assertCustomerAccess(callerProfile, input.customer_id);
    }

    const { data: orgRuntimeFlags, error: orgRuntimeError } = await adminClient
      .from('organizations' as any)
      .select(
        'surface_scan360_enabled, services_paused, services_paused_at, services_pause_reason, surface_scan_contract_start, surface_scan_contract_years',
      )
      .eq('id', input.customer_id)
      .maybeSingle();
    if (orgRuntimeError) throw new Error(orgRuntimeError.message || 'Unable to validate service contract');
    if (!orgRuntimeFlags) return jsonResponse({ error: 'Organization not found' }, 404);
    const serviceGate = evaluateOrganizationServiceGate(orgRuntimeFlags as any, 'surface_scan360');
    if (!serviceGate.allowed) {
      return jsonResponse({
        error: `SurfaceScan360 non eseguibile: ${serviceGate.reason}`,
        code: serviceGate.code,
        contract_start: serviceGate.contract_start,
        contract_end: serviceGate.contract_end,
      }, 403);
    }

    const { targets, rejected } = normalizeTargets(input);
    if (targets.length === 0) {
      return jsonResponse({
        error: 'No valid public targets after validation',
        rejected,
      }, 400);
    }

    const primary = targets[0];

    const { data: job, error: jobError } = await adminClient
      .from('surface_scan_jobs' as any)
      .insert({
        organization_id: input.customer_id,
        tenant_id: input.tenant_id,
        customer_id: input.customer_id,
        requested_by: requestedByUserId,
        raw_target: primary.value,
        normalized_target: primary.value,
        target_type: primary.type,
        hostname: hostFromTargetValue(primary.value) || null,
        root_domain: primary.root_domain || null,
        scan_profile: input.include_network_vuln_scan ? 'cve_api_validation' : 'domain_exposure',
        status: 'queued',
        authorization_confirmed: true,
        scan_name: input.scan_name,
        scan_type: 'exposure_port_technology',
        config: input,
        summary: {
          targets_total: targets.length,
          targets_rejected: rejected.length,
          include_subdomain_discovery: input.include_subdomain_discovery,
          include_port_scan: input.include_port_scan,
          include_web_technology_detection: input.include_web_technology_detection,
          include_ssl_scan: input.include_ssl_scan,
          include_network_vuln_scan: input.include_network_vuln_scan,
        },
      })
      .select('*')
      .single();

    if (jobError || !job) {
      throw new Error(jobError?.message || 'Unable to create surface exposure job');
    }

    const targetRows = targets.map((target) => ({
      scan_job_id: job.id,
      organization_id: input.customer_id,
      tenant_id: input.tenant_id,
      customer_id: input.customer_id,
      target_value: target.value,
      target_type: target.type,
      root_domain: target.root_domain || null,
      source: target.source,
      is_authorized: true,
    }));

    const { data: insertedTargets, error: targetError } = await adminClient
      .from('surface_scan_targets' as any)
      .insert(targetRows)
      .select('id, target_value, target_type');

    if (targetError) {
      throw new Error(targetError.message || 'Unable to persist scan targets');
    }

    const targetIdByKey = new Map<string, string>();
    for (const row of insertedTargets || []) {
      const key = `${String((row as any).target_type || '')}|${String((row as any).target_value || '').toLowerCase()}`;
      targetIdByKey.set(key, String((row as any).id));
    }

    const queueRows: any[] = [];

    if (input.include_subdomain_discovery) {
      const params = buildSubdomainFinderParams(input);
      const rootDomainTargets = targets.filter((target) => target.type === 'domain');
      for (const target of rootDomainTargets) {
        const key = `${target.type}|${target.value.toLowerCase()}`;
        queueRows.push({
          scan_job_id: job.id,
          target_id: targetIdByKey.get(key) || null,
          organization_id: input.customer_id,
          tenant_id: input.tenant_id,
          customer_id: input.customer_id,
          tool_id: PENTEST_TOOL_IDS.SUBDOMAIN_FINDER,
          tool_name: toolNameById(PENTEST_TOOL_IDS.SUBDOMAIN_FINDER),
          phase: 'subdomain_discovery',
          target_name: target.value,
          tool_params: params,
          status: 'queued',
        });
      }
    }

    if (input.include_port_scan) {
      const params = buildPortScannerParams(input);
      for (const target of targets) {
        const key = `${target.type}|${target.value.toLowerCase()}`;
        queueRows.push({
          scan_job_id: job.id,
          target_id: targetIdByKey.get(key) || null,
          organization_id: input.customer_id,
          tenant_id: input.tenant_id,
          customer_id: input.customer_id,
          tool_id: PENTEST_TOOL_IDS.PORT_SCANNER,
          tool_name: toolNameById(PENTEST_TOOL_IDS.PORT_SCANNER),
          phase: 'port_scan',
          target_name: hostFromTargetValue(target.value) || target.value,
          tool_params: params,
          status: 'queued',
        });
      }
    }

    // Network vulnerability scans are queued only after an actual open-port result
    // from the port scanner, to avoid unnecessary provider failures on blind targets.

    if (queueRows.length > 0) {
      const { error: queueInsertError } = await adminClient.from('pentest_tools_scans' as any).insert(queueRows);
      if (queueInsertError) {
        throw new Error(queueInsertError.message || 'Unable to queue Pentest-Tools scans');
      }
    }

    const kicked = await startQueuedScansForJob(adminClient, job.id);

    await adminClient.from('surface_scan_jobs' as any).update({
      status: kicked.started > 0 ? 'running' : 'queued',
      started_at: kicked.started > 0 ? new Date().toISOString() : null,
      summary: {
        ...(job.summary || {}),
        queue_total: queueRows.length,
        queue_started: kicked.started,
        queue_deferred: kicked.deferred,
        queue_failed: kicked.failed,
        targets_total: targets.length,
        targets_rejected: rejected.length,
      },
    }).eq('id', job.id);

    await adminClient.from('surface_scan_audit_log' as any).insert({
      organization_id: input.customer_id,
      scan_job_id: job.id,
      user_id: requestedByUserId,
      action: 'ptools_exposure_scan_started',
      details: {
        scan_name: input.scan_name,
        targets_total: targets.length,
        rejected_total: rejected.length,
        queue_total: queueRows.length,
        queue_started: kicked.started,
        triggered_by: isServiceRoleInvocation ? 'cron' : 'manual',
      },
    });

    return jsonResponse({
      job_id: job.id,
      status: kicked.started > 0 ? 'running' : 'queued',
      targets_total: targets.length,
      rejected,
      queue: {
        total: queueRows.length,
        started: kicked.started,
        deferred: kicked.deferred,
        failed: kicked.failed,
      },
    });
  } catch (error: any) {
    const { status, body } = toErrorResponsePayload(error, 'Internal error');
    return jsonResponse(body, status);
  }
});
