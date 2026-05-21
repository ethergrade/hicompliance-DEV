// Avvia un job di scan SurfaceScan360 (Fase 1 - safe_recon).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseTarget } from '../_shared/targetParser.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Invalid token' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { organization_id, target, scan_profile = 'safe_recon', authorization_confirmed = false } = body || {};

    if (!organization_id || !target) return json({ error: 'organization_id e target richiesti' }, 400);
    if (!authorization_confirmed) return json({ error: 'authorization_confirmed deve essere true' }, 400);
    if (!['safe_recon'].includes(scan_profile)) return json({ error: `scan_profile non supportato in v1: ${scan_profile}` }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verifica ownership: utente deve appartenere all'org, o essere sales/admin globale
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId);
    const globalRoles = (roles || []).map((r: any) => r.role);
    const isGlobal = globalRoles.includes('super_admin') || globalRoles.includes('sales');

    if (!isGlobal) {
      const { data: u } = await supabase.from('users').select('organization_id, user_type').eq('auth_user_id', userId).maybeSingle();
      if (!u || u.organization_id !== organization_id) return json({ error: 'Accesso negato all\'organizzazione' }, 403);
      if (u.user_type !== 'admin') return json({ error: 'Solo admin organizzazione possono avviare scan' }, 403);
    }

    // Parse target
    let parsed;
    try { parsed = parseTarget(target); } catch (e) { return json({ error: String((e as Error).message) }, 400); }

    // Concurrency guard
    const { count } = await supabase.from('surface_scan_jobs').select('*', { count: 'exact', head: true })
      .eq('organization_id', organization_id).in('status', ['queued', 'running']);
    if ((count ?? 0) >= 3) return json({ error: 'Limite 3 scan concorrenti raggiunto per questa organizzazione' }, 429);

    // Insert job
    const { data: job, error: insErr } = await supabase.from('surface_scan_jobs').insert({
      organization_id,
      requested_by: userId,
      raw_target: parsed.raw_target,
      normalized_target: parsed.normalized_target,
      target_type: parsed.target_type,
      hostname: parsed.hostname,
      root_domain: parsed.root_domain,
      protocol: parsed.protocol,
      port: parsed.port,
      scan_profile,
      authorization_confirmed: true,
      status: 'queued',
    }).select('*').single();

    if (insErr || !job) return json({ error: insErr?.message || 'Insert failed' }, 500);

    await supabase.from('surface_scan_audit_log').insert({
      organization_id, scan_job_id: job.id, user_id: userId, user_email: userData.user.email, action: 'scan_started',
      details: { profile: scan_profile, target: parsed.normalized_target },
    });

    // Fire & forget run-enrichment
    EdgeRuntime.waitUntil(
      fetch(`${SUPABASE_URL}/functions/v1/surfacescan360-run-enrichment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ job_id: job.id }),
      }).catch((e) => console.error('run-enrichment trigger failed', e)),
    );

    return json({ ok: true, job_id: job.id });
  } catch (e) {
    console.error('start-scan error', e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
