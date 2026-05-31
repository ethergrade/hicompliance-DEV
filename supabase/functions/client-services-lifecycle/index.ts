import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from '../_shared/surface-scan-utils.ts';

type LifecycleAction = 'pause_all_services' | 'resume_all_services' | 'delete_client';

interface LifecycleRequest {
  action: LifecycleAction;
  organization_id: string;
  reason?: string;
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
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const caller = await getCallerProfile(adminClient, authData.user.id);
    if (!caller.isAdminLike) {
      return jsonResponse({ error: 'Only admin users can manage client lifecycle' }, 403);
    }

    const body = (await req.json()) as LifecycleRequest;
    const action = String(body?.action || '').trim() as LifecycleAction;
    const organizationId = String(body?.organization_id || '').trim();
    const reason = String(body?.reason || '').trim();

    if (!organizationId) return jsonResponse({ error: 'organization_id is required' }, 400);
    if (!['pause_all_services', 'resume_all_services', 'delete_client'].includes(action)) {
      return jsonResponse({ error: 'Invalid action' }, 400);
    }

    assertCustomerAccess(caller, organizationId);

    if (action === 'pause_all_services') {
      const pauseReason = reason || 'paused_by_admin';

      const { error: orgErr } = await adminClient
        .from('organizations' as any)
        .update({
          services_paused: true,
          services_paused_at: new Date().toISOString(),
          services_pause_reason: pauseReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', organizationId);
      if (orgErr) throw orgErr;

      await Promise.all([
        adminClient
          .from('organization_services' as any)
          .update({ status: 'inactive', last_updated: new Date().toISOString() })
          .eq('organization_id', organizationId),
        adminClient
          .from('surface_scan_jobs' as any)
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: `services_paused:${pauseReason}`,
          })
          .eq('organization_id', organizationId)
          .in('status', ['queued', 'pending', 'running']),
        adminClient
          .from('external_scan_jobs' as any)
          .update({
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            error_message: `services_paused:${pauseReason}`,
          })
          .eq('organization_id', organizationId)
          .in('status', ['queued', 'running', 'partial']),
        adminClient
          .from('pentest_tools_scans' as any)
          .update({
            status: 'failed',
            error_message: `services_paused:${pauseReason}`,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
          .in('status', ['queued', 'running', 'waiting', 'retry']),
        adminClient
          .from('darkrisk_scan_runs' as any)
          .update({
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            error_message: `services_paused:${pauseReason}`,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
          .in('status', ['queued', 'running']),
        adminClient
          .from('darkrisk_scan_locks' as any)
          .delete()
          .eq('organization_id', organizationId),
      ]);

      await adminClient.from('surface_scan_audit_log' as any).insert({
        organization_id: organizationId,
        user_id: caller.authUserId,
        action: 'client_services_paused',
        details: {
          reason: pauseReason,
          paused_at: new Date().toISOString(),
        },
      });

      return jsonResponse({ ok: true, action, organization_id: organizationId });
    }

    if (action === 'resume_all_services') {
      const { error: orgErr } = await adminClient
        .from('organizations' as any)
        .update({
          services_paused: false,
          services_paused_at: null,
          services_pause_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', organizationId);
      if (orgErr) throw orgErr;

      await adminClient.from('surface_scan_audit_log' as any).insert({
        organization_id: organizationId,
        user_id: caller.authUserId,
        action: 'client_services_resumed',
        details: {
          resumed_at: new Date().toISOString(),
        },
      });

      return jsonResponse({ ok: true, action, organization_id: organizationId });
    }

    const { data: deleteResult, error: deleteErr } = await adminClient.rpc('admin_delete_organization_robust', {
      _organization_id: organizationId,
      _actor_id: caller.authUserId,
    });
    if (deleteErr) throw deleteErr;

    return jsonResponse({ ok: true, action, organization_id: organizationId, result: deleteResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
