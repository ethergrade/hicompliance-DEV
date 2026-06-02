import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').trim();
const SERVICE_ROLE = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const DARKRISK_INTERNAL_SECRET = String(Deno.env.get('DARKRISK360_INTERNAL_SECRET') || '').trim();
const ESTESO_IDENTITY_VALID_UNTIL = String(
  Deno.env.get('DARKRISK_ESTESO_IDENTITY_VALID_UNTIL') || '2026-06-10',
).trim().slice(0, 10);

const FIRE_TIMEOUT_MS = 18_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-darkrisk-esteso-cron-secret',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  // Verify internal secret (sent by pg_cron or internal callers)
  const cronSecret = req.headers.get('x-darkrisk-esteso-cron-secret');
  const authHeader = req.headers.get('Authorization') || '';
  const bearerKey = authHeader.replace(/^Bearer\s+/i, '').trim();

  const isTrustedCron = Boolean(
    DARKRISK_INTERNAL_SECRET
    && cronSecret
    && cronSecret === DARKRISK_INTERNAL_SECRET,
  );
  const isTrustedServiceRole = Boolean(SERVICE_ROLE && bearerKey === SERVICE_ROLE);

  if (!isTrustedCron && !isTrustedServiceRole) {
    return jsonResponse({ ok: false, error: 'Unauthorized: cron secret required' }, 401);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return jsonResponse({ ok: false, error: 'Supabase credentials not configured' }, 503);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const today = new Date().toISOString().slice(0, 10);

  // Load all profiles where cron_enabled = true
  const { data: profiles, error: profilesErr } = await adminClient
    .from('darkrisk_esteso_profiles' as any)
    .select('organization_id, enabled, cron_enabled, identity_model_valid_until, last_cron_run_at')
    .eq('cron_enabled', true)
    .eq('enabled', true);

  if (profilesErr) {
    return jsonResponse({ ok: false, error: String(profilesErr.message || 'DB error') }, 500);
  }

  const candidates = ((profiles || []) as Array<Record<string, unknown>>).filter((p) => {
    const validUntil = String(p.identity_model_valid_until || ESTESO_IDENTITY_VALID_UNTIL).slice(0, 10);
    if (today > validUntil) return false;
    return true;
  });

  if (candidates.length === 0) {
    return jsonResponse({ ok: true, triggered: 0, message: 'No eligible clients for cron run.' });
  }

  const triggeredIds: string[] = [];
  const failedIds: string[] = [];

  // Fire scans concurrently, with per-client short timeout (fire-and-forget pattern)
  const promises = candidates.map(async (profile) => {
    const orgId = String(profile.organization_id || '');
    if (!orgId) return;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FIRE_TIMEOUT_MS);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/darkrisk-esteso-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'x-darkrisk-esteso-cron-secret': DARKRISK_INTERNAL_SECRET,
        },
        body: JSON.stringify({
          customer_id: orgId,
          trigger_type: 'cron',
          include_surface_sync: true,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        triggeredIds.push(orgId);
      } else {
        failedIds.push(orgId);
      }
    } catch {
      clearTimeout(timer);
      // Timeout or network error — scan may still be running in the background
      triggeredIds.push(orgId);
    }

    // Update last_cron_run_at regardless of outcome
    await adminClient
      .from('darkrisk_esteso_profiles' as any)
      .update({ last_cron_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .catch(() => undefined);
  });

  await Promise.allSettled(promises);

  return jsonResponse({
    ok: true,
    triggered: triggeredIds.length,
    failed: failedIds.length,
    triggered_ids: triggeredIds,
    failed_ids: failedIds,
    today,
  });
});
