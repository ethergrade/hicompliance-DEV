import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
import { corsHeaders, makeSupabaseClients, getCallerProfile, assertCustomerAccess } from '../_shared/surface-scan-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function jsonResponse(body: unknown, status = 200) {
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

    const body = await req.json();
    const jobId = String(body?.job_id || '').trim();
    if (!jobId) return jsonResponse({ error: 'job_id is required' }, 400);

    const { data: job, error: jobError } = await adminClient
      .from('surface_scan_jobs' as any)
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) return jsonResponse({ error: 'Job not found' }, 404);

    const customerId = String(job.customer_id || job.organization_id || '').trim();
    if (!customerId) return jsonResponse({ error: 'Job customer not resolved' }, 500);

    const caller = await getCallerProfile(adminClient, authData.user.id);
    assertCustomerAccess(caller, customerId);
    if (!caller.isAdminLike) {
      return jsonResponse({ error: 'Only admin users can resync jobs' }, 403);
    }

    await Promise.all([
      adminClient.from('surface_open_ports' as any).delete().eq('scan_job_id', jobId),
      adminClient.from('surface_web_technologies' as any).delete().eq('scan_job_id', jobId),
      adminClient.from('surface_ssl_results' as any).delete().eq('scan_job_id', jobId),
      adminClient.from('surface_exposure_findings' as any).delete().eq('scan_job_id', jobId),
      adminClient
        .from('surface_findings' as any)
        .delete()
        .eq('scan_job_id', jobId)
        .eq('provider', 'pentest_tools'),
      adminClient
        .from('surface_observations' as any)
        .delete()
        .eq('scan_job_id', jobId)
        .in('module', ['port_scanner', 'website_recon', 'ssl_scan']),
    ]);

    const { data: tasks } = await adminClient
      .from('pentest_tools_scans' as any)
      .select('id, remote_scan_id')
      .eq('scan_job_id', jobId);

    const taskIds = (tasks || []).map((row: any) => String(row.id || '')).filter(Boolean);
    if (taskIds.length > 0) {
      const nowIso = new Date().toISOString();
      for (const task of tasks || []) {
        const hasRemote = Number.isFinite(Number((task as any).remote_scan_id || 0));
        await adminClient
          .from('pentest_tools_scans' as any)
          .update({
            status: hasRemote ? 'running' : 'queued',
            progress: 0,
            retry_count: 0,
            next_retry_at: null,
            finished_at: null,
            error_message: null,
            updated_at: nowIso,
          })
          .eq('id', (task as any).id);
      }
    }

    await adminClient
      .from('surface_scan_jobs' as any)
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        completed_at: null,
        error_message: null,
      })
      .eq('id', jobId);

    await adminClient.from('surface_scan_audit_log' as any).insert({
      scan_job_id: jobId,
      user_id: authData.user.id,
      action: 'ptools_resync_requested',
      details: {
        reset_tasks: taskIds.length,
      },
    });

    if (SUPABASE_URL && SERVICE_ROLE) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/ptools-poll-scans`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ trigger: 'resync', job_id: jobId }),
        });
      } catch (error) {
        console.warn('[ptools-resync-job] poll trigger failed:', error);
      }
    }

    return jsonResponse({
      ok: true,
      job_id: jobId,
      tasks_reset: taskIds.length,
      status: 'running',
    });
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Internal error' }, 500);
  }
});

