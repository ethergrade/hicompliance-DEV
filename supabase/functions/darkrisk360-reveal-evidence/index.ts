import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from '../_shared/surface-scan-utils.ts';
import { maskPotentialSecrets, normalizeText } from '../_shared/darkrisk-utils.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function sanitize(value: string | null | undefined, max = 500): string {
  return normalizeText(maskPotentialSecrets(String(value || ''))).slice(0, max);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const requestedCustomerId = sanitize(body?.customer_id, 120);
    const evidenceId = sanitize(body?.evidence_id, 120);
    const reason = sanitize(body?.reason, 400);
    const expiresIn = Math.max(60, Math.min(900, Number(body?.expires_in || 300)));

    if (!evidenceId) return jsonResponse({ ok: false, error: 'evidence_id is required' }, 400);
    if (reason.length < 8) {
      return jsonResponse({ ok: false, error: 'reason is required (min 8 chars)' }, 400);
    }

    const caller = await getCallerProfile(adminClient, authData.user.id);

    const evidenceRes = await adminClient
      .from('darkrisk_evidence' as any)
      .select('id, organization_id, title, evidence_class, visibility, contains_sensitive_data, raw_evidence_ref')
      .eq('id', evidenceId)
      .maybeSingle();

    if (evidenceRes.error) throw evidenceRes.error;
    if (!evidenceRes.data?.id) return jsonResponse({ ok: false, error: 'Evidence not found' }, 404);

    const evidence = evidenceRes.data as Record<string, unknown>;
    const customerId = requestedCustomerId || sanitize(String(evidence.organization_id || ''), 120);
    if (!customerId) return jsonResponse({ ok: false, error: 'Unable to resolve customer scope' }, 400);

    assertCustomerAccess(caller, customerId);

    const evidenceOrg = sanitize(String(evidence.organization_id || ''), 120);
    if (evidenceOrg !== customerId) {
      return jsonResponse({ ok: false, error: 'evidence_id not in selected customer scope' }, 403);
    }

    const isAnalyst = caller.canManageAllOrganizations || caller.isAdminLike;
    if (!isAnalyst) {
      await adminClient.from('darkrisk_audit_log' as any).insert({
        organization_id: customerId,
        tenant_id: customerId,
        actor_id: authData.user.id,
        action: 'darkrisk_raw_evidence_reveal_denied',
        entity_type: 'darkrisk_evidence',
        entity_id: evidenceId,
        reason: reason.slice(0, 240),
        metadata: {
          denial_reason: 'insufficient_role',
        },
      });
      return jsonResponse({ ok: false, error: 'Raw evidence reveal is allowed only for analyst/admin roles' }, 403);
    }

    const entitlementRes = await adminClient
      .from('darkrisk_entitlements' as any)
      .select('enabled, tier, enable_raw_evidence')
      .eq('organization_id', customerId)
      .maybeSingle();

    if (entitlementRes.error) throw entitlementRes.error;

    const entitlement = entitlementRes.data as {
      enabled?: boolean;
      tier?: string;
      enable_raw_evidence?: boolean;
    } | null;

    if (!entitlement?.enabled) {
      return jsonResponse({ ok: false, error: 'DarkRisk360 not enabled for customer' }, 403);
    }

    const tier = String(entitlement.tier || 'standard').toLowerCase();
    if (tier !== 'extended' || entitlement.enable_raw_evidence !== true) {
      await adminClient.from('darkrisk_audit_log' as any).insert({
        organization_id: customerId,
        tenant_id: customerId,
        actor_id: authData.user.id,
        action: 'darkrisk_raw_evidence_reveal_denied',
        entity_type: 'darkrisk_evidence',
        entity_id: evidenceId,
        reason: reason.slice(0, 240),
        metadata: {
          denial_reason: 'tier_or_entitlement_disabled',
          tier,
          enable_raw_evidence: Boolean(entitlement.enable_raw_evidence),
        },
      });
      return jsonResponse({ ok: false, error: 'Raw evidence is disabled for this customer tier' }, 403);
    }

    const rawRefRes = await adminClient
      .from('darkrisk_raw_evidence_refs' as any)
      .select('id, storage_provider, storage_path, retention_until, reveal_count')
      .eq('organization_id', customerId)
      .eq('evidence_id', evidenceId)
      .maybeSingle();

    if (rawRefRes.error) throw rawRefRes.error;
    if (!rawRefRes.data?.id) {
      await adminClient.from('darkrisk_audit_log' as any).insert({
        organization_id: customerId,
        tenant_id: customerId,
        actor_id: authData.user.id,
        action: 'darkrisk_raw_evidence_reveal_denied',
        entity_type: 'darkrisk_evidence',
        entity_id: evidenceId,
        reason: reason.slice(0, 240),
        metadata: {
          denial_reason: 'raw_evidence_unavailable',
        },
      });
      return jsonResponse({ ok: false, code: 'raw_evidence_unavailable', error: 'Raw evidence not available' }, 404);
    }

    const rawRef = rawRefRes.data as Record<string, unknown>;
    const storagePath = sanitize(String(rawRef.storage_path || ''), 500);
    if (!storagePath) {
      return jsonResponse({ ok: false, error: 'Invalid raw evidence storage path' }, 500);
    }

    const { data: signedData, error: signErr } = await adminClient.storage
      .from('darkrisk-evidence-private')
      .createSignedUrl(storagePath, expiresIn);

    if (signErr || !signedData?.signedUrl) {
      throw signErr || new Error('Unable to generate signed URL');
    }

    await adminClient
      .from('darkrisk_raw_evidence_refs' as any)
      .update({
        reveal_count: Number(rawRef.reveal_count || 0) + 1,
        last_revealed_at: new Date().toISOString(),
        last_revealed_by: authData.user.id,
        last_reveal_reason: reason.slice(0, 400),
      })
      .eq('id', rawRef.id);

    await adminClient
      .from('darkrisk_audit_log' as any)
      .insert({
        organization_id: customerId,
        tenant_id: customerId,
        actor_id: authData.user.id,
        action: 'darkrisk_raw_evidence_revealed',
        entity_type: 'darkrisk_evidence',
        entity_id: evidenceId,
        reason: reason.slice(0, 240),
        metadata: {
          storage_provider: sanitize(String(rawRef.storage_provider || 'supabase'), 80),
          storage_path: storagePath,
          evidence_class: sanitize(String(evidence.evidence_class || ''), 80),
          contains_sensitive_data: Boolean(evidence.contains_sensitive_data),
          visibility: sanitize(String(evidence.visibility || 'customer'), 40),
          expires_in: expiresIn,
        },
      });

    return jsonResponse({
      ok: true,
      customer_id: customerId,
      evidence_id: evidenceId,
      title: sanitize(String(evidence.title || 'Raw evidence'), 180),
      expires_in: expiresIn,
      signed_url: signedData.signedUrl,
      retention_until: rawRef.retention_until || null,
    });
  } catch (error: any) {
    return jsonResponse({ ok: false, error: sanitize(error?.message || 'Internal error', 500) }, 500);
  }
});
