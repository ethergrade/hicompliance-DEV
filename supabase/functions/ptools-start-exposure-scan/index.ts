import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { corsHeaders, makeSupabaseClients, getCallerProfile, assertCustomerAccess } from '../_shared/surface-scan-utils.ts';
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
  buildNetworkScannerParams,
  buildPortScannerParams,
  buildSubdomainFinderParams,
} from '../_shared/pentestToolsParamMapper.ts';
import { startQueuedScansForJob } from '../_shared/exposureQueue.ts';

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
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const raw = (await req.json()) as Partial<SurfacePortTechScanRequest>;
    const input = resolveRequestDefaults(raw || {});

    if (!input.customer_id) {
      return jsonResponse({ error: 'customer_id is required' }, 400);
    }
    if (!input.tenant_id) {
      input.tenant_id = input.customer_id;
    }

    const caller = await getCallerProfile(adminClient, authData.user.id);
    assertCustomerAccess(caller, input.customer_id);
    if (!caller.isAdminLike) {
      return jsonResponse({ error: 'Only admin users can start exposure scans' }, 403);
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
        requested_by: authData.user.id,
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

    if (input.include_network_vuln_scan) {
      const params = buildNetworkScannerParams(input);
      for (const target of targets) {
        const key = `${target.type}|${target.value.toLowerCase()}`;
        queueRows.push({
          scan_job_id: job.id,
          target_id: targetIdByKey.get(key) || null,
          organization_id: input.customer_id,
          tenant_id: input.tenant_id,
          customer_id: input.customer_id,
          tool_id: PENTEST_TOOL_IDS.NETWORK_SCANNER,
          tool_name: toolNameById(PENTEST_TOOL_IDS.NETWORK_SCANNER),
          phase: 'network_scan',
          target_name: hostFromTargetValue(target.value) || target.value,
          tool_params: params,
          status: 'queued',
        });
      }
    }

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
      user_id: authData.user.id,
      action: 'ptools_exposure_scan_started',
      details: {
        scan_name: input.scan_name,
        targets_total: targets.length,
        rejected_total: rejected.length,
        queue_total: queueRows.length,
        queue_started: kicked.started,
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
    return jsonResponse({ error: error?.message || 'Internal error' }, 500);
  }
});

