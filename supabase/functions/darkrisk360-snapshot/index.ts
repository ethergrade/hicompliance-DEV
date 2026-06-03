/**
 * darkrisk360-snapshot
 *
 * Calcola e salva il weekly snapshot per un'organizzazione dopo ogni scan run.
 * Aggrega darkrisk_source_records → darkrisk360_weekly_snapshots.
 * Chiamata fire-and-forget da darkrisk-esteso-sync al termine di ogni scan.
 *
 * Input: POST { organization_id, scan_run_id }
 * Auth:  header x-darkrisk360-internal-secret = DARKRISK360_INTERNAL_SECRET
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
import {
  calculatePortfolioRiskIndex,
  isoWeekKey,
  weekStartDate,
  mediaLabel,
  type ActiveFinding,
} from '../_shared/darkrisk-portfolio-risk.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const INTERNAL_SECRET = String(Deno.env.get('DARKRISK360_INTERNAL_SECRET') || '').trim();
const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-darkrisk360-internal-secret',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: solo chiamate interne autorizzate
  const secret = req.headers.get('x-darkrisk360-internal-secret') ?? '';
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { organization_id?: string; scan_run_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { organization_id: orgId, scan_run_id: scanRunId } = body;
  if (!orgId) {
    return new Response(JSON.stringify({ error: 'organization_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase credentials' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const now = new Date();
    const currentWeekKey = isoWeekKey(now);
    const currentWeekStart = weekStartDate(currentWeekKey);

    // 1. Conta totale record IntelX per questa org
    const { count: totalCount } = await adminClient
      .from('darkrisk_source_records' as any)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('source', 'intelx');

    // 2. Record creati questa settimana
    const { count: newThisWeek } = await adminClient
      .from('darkrisk_source_records' as any)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('source', 'intelx')
      .gte('created_at', `${currentWeekStart}T00:00:00Z`);

    // 3. Aggrega per bucket (results_by_source)
    const { data: bucketRows } = await adminClient
      .from('darkrisk_source_records' as any)
      .select('source_bucket')
      .eq('organization_id', orgId)
      .eq('source', 'intelx')
      .not('source_bucket', 'is', null);

    const resultsBySource: Record<string, number> = {};
    for (const row of (bucketRows ?? []) as Array<{ source_bucket: string }>) {
      const b = row.source_bucket || 'other';
      resultsBySource[b] = (resultsBySource[b] ?? 0) + 1;
    }

    // 4. Aggrega per media type (results_by_filetype)
    // source_media è text in DB (es. "1", "2", "0") — convertiamo a number prima del mapping
    const { data: mediaRows } = await adminClient
      .from('darkrisk_source_records' as any)
      .select('source_media')
      .eq('organization_id', orgId)
      .eq('source', 'intelx')
      .not('source_media', 'is', null)
      .neq('source_media', '');

    const resultsByFiletype: Record<string, number> = {};
    for (const row of (mediaRows ?? []) as Array<{ source_media: string }>) {
      const raw = row.source_media;
      // Tenta conversione numerica (IntelX restituisce interi: 0=unknown,1=html,2=text,4=csv...)
      const asNum = Number(raw);
      const label = Number.isFinite(asNum) ? mediaLabel(asNum) : (raw || 'unknown');
      // Raggruppa media=0 (unknown) in bucket esplicito solo se è l'unico tipo
      const displayLabel = (label === 'unknown' && asNum === 0) ? 'other' : label;
      resultsByFiletype[displayLabel] = (resultsByFiletype[displayLabel] ?? 0) + 1;
    }

    // 5. Aggrega per giorno — ultimi 365gg (usa source_date per data reale del leak)
    const cutoff365 = new Date(now.getTime() - 365 * 86_400_000).toISOString();
    const { data: dayRows } = await adminClient
      .from('darkrisk_source_records' as any)
      .select('source_date')
      .eq('organization_id', orgId)
      .eq('source', 'intelx')
      .gte('source_date', cutoff365)
      .not('source_date', 'is', null);

    const resultsByDay: Record<string, number> = {};
    for (const row of (dayRows ?? []) as Array<{ source_date: string }>) {
      const day = String(row.source_date).slice(0, 10);
      if (day) resultsByDay[day] = (resultsByDay[day] ?? 0) + 1;
    }

    // 5b. Aggrega per asset scope (per breakdown collassabile per dominio)
    const { data: assetRows } = await adminClient
      .from('darkrisk_source_records' as any)
      .select('asset_scope, source_bucket, source_media')
      .eq('organization_id', orgId)
      .eq('source', 'intelx')
      .not('asset_scope', 'is', null)
      .neq('asset_scope', '');

    const resultsByAsset: Record<string, { total: number; by_source: Record<string, number>; by_filetype: Record<string, number> }> = {};
    for (const row of (assetRows ?? []) as Array<{ asset_scope: string; source_bucket: string | null; source_media: string | null }>) {
      const asset = row.asset_scope;
      if (!resultsByAsset[asset]) resultsByAsset[asset] = { total: 0, by_source: {}, by_filetype: {} };
      resultsByAsset[asset].total += 1;
      if (row.source_bucket) {
        const b = row.source_bucket;
        resultsByAsset[asset].by_source[b] = (resultsByAsset[asset].by_source[b] ?? 0) + 1;
      }
      if (row.source_media) {
        const asNum = Number(row.source_media);
        const label = Number.isFinite(asNum) ? mediaLabel(asNum) : (row.source_media || 'unknown');
        const displayLabel = (label === 'unknown' && asNum === 0) ? 'other' : label;
        resultsByAsset[asset].by_filetype[displayLabel] = (resultsByAsset[asset].by_filetype[displayLabel] ?? 0) + 1;
      }
    }

    // 6. Distribuzione severity dai finding attivi
    const { data: findingsData } = await adminClient
      .from('darkrisk_findings' as any)
      .select('severity, risk_score, confidence, last_seen_at, status')
      .eq('organization_id', orgId);

    const findings = (findingsData ?? []) as ActiveFinding[];
    const severityDistribution: Record<string, number> = {};
    for (const f of findings) {
      const sev = f.severity ?? 'info';
      severityDistribution[sev] = (severityDistribution[sev] ?? 0) + 1;
    }

    // 7. Risk Index
    const riskIndex = calculatePortfolioRiskIndex(findings);

    // 8. Leggi snapshot precedente per delta
    const { data: prevSnapshot } = await adminClient
      .from('darkrisk360_weekly_snapshots' as any)
      .select('total_records, risk_index, results_by_source, severity_distribution, week_key')
      .eq('organization_id', orgId)
      .neq('week_key', currentWeekKey)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevTotal = (prevSnapshot as any)?.total_records ?? 0;
    const prevRisk = (prevSnapshot as any)?.risk_index ?? 0;
    const prevSources = (prevSnapshot as any)?.results_by_source ?? {};
    const newBuckets = Object.keys(resultsBySource).filter((b) => !(b in prevSources));

    const deltaVsPrev = {
      total_records: (totalCount ?? 0) - prevTotal,
      risk_index: riskIndex - prevRisk,
      new_buckets: newBuckets,
      severity_delta: Object.fromEntries(
        Object.entries(severityDistribution).map(([sev, count]) => [
          sev,
          count - ((prevSnapshot as any)?.severity_distribution?.[sev] ?? 0),
        ]),
      ),
    };

    // 9. Leggi tier dal entitlement
    const { data: entitlement } = await adminClient
      .from('darkrisk_entitlements' as any)
      .select('tier')
      .eq('organization_id', orgId)
      .maybeSingle();
    const tier = String((entitlement as any)?.tier ?? 'standard');

    // 10. Upsert snapshot
    const { data: snapshotRow, error: upsertError } = await adminClient
      .from('darkrisk360_weekly_snapshots' as any)
      .upsert(
        {
          organization_id: orgId,
          scan_run_id: scanRunId ?? null,
          week_key: currentWeekKey,
          week_start_date: currentWeekStart,
          tier,
          total_records: totalCount ?? 0,
          new_records_this_week: newThisWeek ?? 0,
          risk_index: riskIndex,
          results_by_source: resultsBySource,
          results_by_filetype: resultsByFiletype,
          results_by_day: resultsByDay,
          results_by_asset: resultsByAsset,
          delta_vs_prev: deltaVsPrev,
          severity_distribution: severityDistribution,
          computed_at: now.toISOString(),
        },
        { onConflict: 'organization_id,week_key' },
      )
      .select('id')
      .maybeSingle();

    if (upsertError) {
      console.error('[darkrisk360-snapshot] upsert error:', upsertError);
    }

    // 11. Fire-and-forget notify se ci sono nuovi findings da questo run
    if (scanRunId && SUPABASE_FUNCTIONS_URL && INTERNAL_SECRET) {
      const hasNewFindings = (newThisWeek ?? 0) > 0 || deltaVsPrev.total_records > 0;
      if (hasNewFindings) {
        void fetch(`${SUPABASE_FUNCTIONS_URL}/darkrisk360-notify`, {
          method: 'POST',
          signal: AbortSignal.timeout(12_000),
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'x-darkrisk360-internal-secret': INTERNAL_SECRET,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organization_id: orgId,
            scan_run_id: scanRunId,
            notify_type: 'alert',
          }),
        }).catch((err) => {
          console.warn('[darkrisk360-snapshot] notify fire failed:', String(err));
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        snapshot_id: (snapshotRow as any)?.id ?? null,
        week_key: currentWeekKey,
        risk_index: riskIndex,
        total_records: totalCount ?? 0,
        new_records_this_week: newThisWeek ?? 0,
        delta_vs_prev: deltaVsPrev,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[darkrisk360-snapshot] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
