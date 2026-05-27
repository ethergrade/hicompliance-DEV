import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { corsHeaders, getCallerProfile, makeSupabaseClients } from '../_shared/surface-scan-utils.ts';
import { maskPotentialSecrets, normalizeText } from '../_shared/darkrisk-utils.ts';

const INTERNAL_SECRET = Deno.env.get('DARKRISK360_INTERNAL_SECRET') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function sanitize(value: string | null | undefined, max = 400): string {
  return normalizeText(maskPotentialSecrets(String(value || ''))).slice(0, max);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const bearer = req.headers.get('Authorization')?.replace('Bearer ', '').trim() || '';
    const internal = req.headers.get('x-darkrisk360-internal') || '';

    const serviceRoleAuth = Boolean(SERVICE_ROLE && bearer && bearer === SERVICE_ROLE);
    const internalAuth = Boolean(INTERNAL_SECRET && internal && internal === INTERNAL_SECRET);

    const { userClient, adminClient } = makeSupabaseClients(req);

    let actorUserId: string | null = null;
    if (!serviceRoleAuth && !internalAuth) {
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);

      const caller = await getCallerProfile(adminClient, authData.user.id);
      if (!caller.canManageAllOrganizations && !caller.isAdminLike) {
        return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
      }
      actorUserId = authData.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const customerId = sanitize(body?.customer_id, 120) || null;

    const { data: cleanupResult, error: cleanupErr } = await adminClient
      .rpc('darkrisk_apply_retention' as any, { _org_id: customerId });

    if (cleanupErr) throw cleanupErr;

    const resultObj = (cleanupResult || {}) as Record<string, unknown>;

    await adminClient
      .from('darkrisk_audit_log' as any)
      .insert({
        organization_id: customerId,
        tenant_id: customerId,
        actor_id: actorUserId,
        action: 'darkrisk_retention_cleanup_invoked',
        entity_type: 'darkrisk_raw_evidence_refs',
        entity_id: null,
        reason: customerId ? 'manual_customer_scope' : 'global_retention_cycle',
        metadata: {
          invoked_via: serviceRoleAuth ? 'service_role' : internalAuth ? 'internal_secret' : 'authenticated_admin',
          rpc_result: resultObj,
        },
      });

    return jsonResponse({
      ok: true,
      customer_id: customerId,
      result: resultObj,
    });
  } catch (error: any) {
    return jsonResponse({ ok: false, error: sanitize(error?.message || 'Internal error', 500) }, 500);
  }
});
