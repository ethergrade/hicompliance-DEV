/**
 * darkrisk-esteso-admin-cron
 *
 * Orchestratore settimanale DarkRisk360 — gestisce ENTRAMBI i tier (standard + extended).
 * Schedulo: ogni lunedì 02:00 UTC via pg_cron.
 *
 * Scalabilità 100+ clienti:
 *   - Processa i clienti in batch da BATCH_SIZE (default 5)
 *   - Stagger di BATCH_DELAY_MS (default 60s) tra batch
 *   - IntelX vede max 5 clienti concorrenti = ~5 req/sec
 *   - 100 clienti / 5 batch / 60s = ~19 minuti totali
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').trim();
const SERVICE_ROLE = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const DARKRISK_INTERNAL_SECRET = String(Deno.env.get('DARKRISK360_INTERNAL_SECRET') || '').trim();

// Configurabili via env per tuning in produzione
const FIRE_TIMEOUT_MS = 20_000;
const BATCH_SIZE = Math.max(1, Number(Deno.env.get('DARKRISK_CRON_BATCH_SIZE') ?? '5'));
const BATCH_DELAY_MS = Math.max(5000, Number(Deno.env.get('DARKRISK_CRON_BATCH_DELAY_MS') ?? '60000'));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-darkrisk-esteso-cron-secret',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return jsonResponse({ ok: false, error: 'Supabase credentials not configured' }, 503);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Auth: secret interno o service role o db_trigger_id (one-shot nonce da darkrisk360_scan_triggers)
  const cronSecret = req.headers.get('x-darkrisk-esteso-cron-secret');
  const authHeader = req.headers.get('Authorization') || '';
  const bearerKey = authHeader.replace(/^Bearer\s+/i, '').trim();

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ok, body opzionale */ }

  const dbTriggerId = String(body?.db_trigger_id || '').trim();

  const isTrustedCron = Boolean(DARKRISK_INTERNAL_SECRET && cronSecret && cronSecret === DARKRISK_INTERNAL_SECRET);
  const isTrustedServiceRole = Boolean(SERVICE_ROLE && bearerKey === SERVICE_ROLE);

  // db_trigger_id: nonce one-shot inserito via SQL con service_role (sicuro: richiede accesso DB)
  let isTrustedDbNonce = false;
  if (!isTrustedCron && !isTrustedServiceRole && dbTriggerId) {
    const { data: nonceRow } = await adminClient
      .from('darkrisk360_scan_triggers' as any)
      .select('id, status')
      .eq('id', dbTriggerId)
      .eq('status', 'pending')
      .maybeSingle();
    isTrustedDbNonce = Boolean(nonceRow);
  }

  if (!isTrustedCron && !isTrustedServiceRole && !isTrustedDbNonce) {
    return jsonResponse({ ok: false, error: 'Unauthorized: cron secret required' }, 401);
  }

  const today = new Date().toISOString().slice(0, 10);

  // --- Raccogli candidati da ENTRAMBE le sorgenti ---

  // 1. Profili esteso (tier=extended con cron_enabled)
  const { data: estosoProfiles } = await adminClient
    .from('darkrisk_esteso_profiles' as any)
    .select('organization_id, enabled, cron_enabled, identity_model_valid_until')
    .eq('cron_enabled', true)
    .eq('enabled', true);

  const estosoOrgIds = new Set<string>(
    ((estosoProfiles || []) as Array<Record<string, unknown>>)
      .map((p) => String(p.organization_id || ''))
      .filter(Boolean),
  );

  // 2. Tutti i clienti con DarkRisk360 abilitato (sia standard che extended)
  const { data: entitlements } = await adminClient
    .from('darkrisk_entitlements' as any)
    .select('organization_id, tier, enabled')
    .eq('enabled', true);

  const allEnabledOrgIds = Array.from(new Set<string>(
    ((entitlements || []) as Array<Record<string, unknown>>)
      .map((e) => String(e.organization_id || ''))
      .filter(Boolean),
  ));

  // 3. Raccoglie trigger manuali one-shot da darkrisk360_scan_triggers
  const { data: pendingTriggers } = await adminClient
    .from('darkrisk360_scan_triggers' as any)
    .select('id, organization_id, trigger_type, include_surface_sync')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(20);

  const manualOrgIds = ((pendingTriggers || []) as Array<Record<string, unknown>>)
    .map((t) => String(t.organization_id || ''))
    .filter(Boolean);

  // Merge: unifica profili esteso + entitlements abilitati + trigger manuali
  const allCandidates = Array.from(new Set([...estosoOrgIds, ...allEnabledOrgIds, ...manualOrgIds]));

  // Segna i trigger come picked_up
  if ((pendingTriggers || []).length > 0) {
    await adminClient
      .from('darkrisk360_scan_triggers' as any)
      .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
      .eq('status', 'pending');
  }

  if (allCandidates.length === 0) {
    return jsonResponse({ ok: true, triggered: 0, message: 'No eligible clients for cron run.' });
  }

  const triggeredIds: string[] = [];
  const failedIds: string[] = [];

  // Funzione per triggerare un singolo client
  const fireScanForOrg = async (orgId: string): Promise<void> => {
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
          trigger_type: 'weekly_cron',
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
      // Timeout = scan probabilmente avviato, lo contiamo come triggered
      triggeredIds.push(orgId);
    }

    // Aggiorna last_cron_run_at su profilo esteso se esiste
    if (estosoOrgIds.has(orgId)) {
      await adminClient
        .from('darkrisk_esteso_profiles' as any)
        .update({ last_cron_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .catch(() => undefined);
    }
  };

  // --- Batch processing con stagger ---
  for (let batchStart = 0; batchStart < allCandidates.length; batchStart += BATCH_SIZE) {
    const batch = allCandidates.slice(batchStart, batchStart + BATCH_SIZE);
    await Promise.allSettled(batch.map(fireScanForOrg));

    // Stagger tra batch (non sull'ultimo)
    if (batchStart + BATCH_SIZE < allCandidates.length) {
      await wait(BATCH_DELAY_MS);
    }
  }

  // --- Orchestrate coverage per tutti i clienti triggered ---
  // Stagger 5s tra le call per non sovraccaricare SurfaceScan360
  if (DARKRISK_INTERNAL_SECRET) {
    for (const orgId of triggeredIds.slice(0, 50)) { // max 50 in un cron
      void fetch(`${SUPABASE_URL}/functions/v1/darkrisk360-orchestrate-coverage`, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'Content-Type': 'application/json',
          'x-darkrisk360-internal-secret': DARKRISK_INTERNAL_SECRET,
        },
        body: JSON.stringify({ organization_id: orgId }),
      }).catch(() => undefined);
      // piccolo stagger
      await wait(5_000);
    }
  }

  // --- Weekly summary email per tutti i clienti con summary abilitata ---
  if (DARKRISK_INTERNAL_SECRET) {
    const { data: summaryConfigs } = await adminClient
      .from('darkrisk360_notification_configs' as any)
      .select('organization_id, weekly_summary_enabled, recipient_emails')
      .eq('weekly_summary_enabled', true);

    for (const cfg of (summaryConfigs || []) as Array<Record<string, unknown>>) {
      const orgId = String(cfg.organization_id || '');
      const emails = (cfg.recipient_emails as string[]) ?? [];
      if (!orgId || emails.length === 0) continue;

      void fetch(`${SUPABASE_URL}/functions/v1/darkrisk360-notify`, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'x-darkrisk360-internal-secret': DARKRISK_INTERNAL_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: orgId,
          notify_type: 'weekly_summary',
        }),
      }).catch(() => undefined);
    }
  }

  return jsonResponse({
    ok: true,
    triggered: triggeredIds.length,
    failed: failedIds.length,
    triggered_ids: triggeredIds,
    failed_ids: failedIds,
    total_candidates: allCandidates.length,
    batch_size: BATCH_SIZE,
    today,
  });
});
