/**
 * surfacescan360-monthly-report
 *
 * Aggrega 4+ snapshot settimanali (surface_scan_history) di un mese in un
 * report mensile con trend, AI summary e payload PDF.
 *
 * POST { organization_id?, month_key?, triggered_by? }
 *  - organization_id: se omesso → tutti le org attive
 *  - month_key: '2026-06' (default: mese precedente)
 *  - triggered_by: 'cron_monthly' | 'manual' (default 'manual')
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-surface-internal-secret',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const INTERNAL_SECRET  = Deno.env.get('SURFACE_SCAN_CRON_INTERNAL_SECRET') || '';
  const OPENAI_KEY       = Deno.env.get('OPENAI_API_KEY') || '';

  const authHeader    = req.headers.get('Authorization') || '';
  const internalToken = req.headers.get('x-surface-internal-secret') || '';
  const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE_KEY}`;
  const isInternal    = INTERNAL_SECRET && internalToken === INTERNAL_SECRET;

  if (!isServiceRole && !isInternal) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body        = await req.json().catch(() => ({}));
    const triggeredBy = String(body.triggered_by || 'manual');
    const monthKey    = body.month_key ? String(body.month_key) : prevMonthKey();

    // Determina orgs da processare
    let orgIds: string[] = [];
    if (body.organization_id) {
      orgIds = [String(body.organization_id)];
    } else {
      const { data: orgs } = await adminClient
        .from('organizations')
        .select('id')
        .eq('surface_scan360_enabled', true);
      orgIds = (orgs || []).map((o: any) => String(o.id));
    }

    const results: Array<{ org_id: string; month_key: string; ok: boolean; error?: string }> = [];

    for (const orgId of orgIds) {
      try {
        const report = await buildMonthlyReport(adminClient, orgId, monthKey, OPENAI_KEY);
        await adminClient.from('surface_scan_monthly_reports').upsert({
          organization_id: orgId,
          month_key:       monthKey,
          month_start:     monthKey + '-01',
          payload:         report,
          triggered_by:    triggeredBy,
          updated_at:      new Date().toISOString(),
        }, { onConflict: 'organization_id,month_key' });
        results.push({ org_id: orgId, month_key: monthKey, ok: true });
      } catch (err) {
        console.error(`[monthly-report] org=${orgId} month=${monthKey} error:`, err);
        results.push({ org_id: orgId, month_key: monthKey, ok: false, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ ok: true, month_key: monthKey, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[surfacescan360-monthly-report] unhandled:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── Report builder ────────────────────────────────────────────────────────────

async function buildMonthlyReport(
  adminClient: ReturnType<typeof createClient>,
  orgId: string,
  monthKey: string,
  openaiKey: string,
): Promise<Record<string, unknown>> {
  // 1. Carica snapshot settimanali del mese
  const [yearStr, monthStr] = monthKey.split('-');
  const year  = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const startDate = new Date(year, month - 1, 1);
  const endDate   = new Date(year, month, 1);   // inizio mese successivo

  const { data: snapshots } = await adminClient
    .from('surface_scan_history')
    .select('*')
    .eq('organization_id', orgId)
    .gte('scanned_at', startDate.toISOString())
    .lt('scanned_at', endDate.toISOString())
    .order('scanned_at', { ascending: true });

  const weeks = (snapshots || []) as Array<{
    scanned_at: string;
    avg_score: number;
    total_assets: number;
    critical_count: number;
    warning_count: number;
    safe_count: number;
    high_cves: number;
    medium_cves: number;
    low_cves: number;
    assets_snapshot?: any[];
  }>;

  // 2. Carica findings del mese
  const { data: findings } = await adminClient
    .from('surface_findings')
    .select('severity, finding_type, cve, status, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString());

  const findingRows = (findings || []) as Array<{
    severity: string; finding_type: string; cve?: string[]; status: string; created_at: string;
  }>;

  // 3. Carica ConnectSecure sensitive data del mese
  const { data: csData } = await adminClient
    .from('connectsecure_sensitive_data')
    .select('domain, creds_count, hashes_count, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString());

  // 4. Calcola aggregazioni
  const scoreHistory   = weeks.map(w => ({ date: w.scanned_at.slice(0, 10), score: w.avg_score }));
  const scoreStart     = weeks[0]?.avg_score ?? 0;
  const scoreEnd       = weeks[weeks.length - 1]?.avg_score ?? 0;
  const scoreDelta     = Math.round((scoreEnd - scoreStart) * 100) / 100;

  const totalFindings  = findingRows.length;
  const criticalCount  = findingRows.filter(f => f.severity === 'critical').length;
  const highCount      = findingRows.filter(f => f.severity === 'high').length;
  const medCount       = findingRows.filter(f => f.severity === 'medium').length;
  const lowCount       = findingRows.filter(f => f.severity === 'low').length;
  const resolvedCount  = findingRows.filter(f => ['resolved', 'suppressed'].includes(f.status)).length;

  const allCves = findingRows.flatMap(f => f.cve || []);
  const cveCounts = new Map<string, number>();
  allCves.forEach(c => cveCounts.set(c, (cveCounts.get(c) || 0) + 1));
  const topCves = [...cveCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => ({ id, count }));

  const findingsByType = findingRows.reduce<Record<string, number>>((acc, f) => {
    acc[f.finding_type] = (acc[f.finding_type] || 0) + 1;
    return acc;
  }, {});

  const totalCreds  = (csData || []).reduce((s: number, r: any) => s + (r.creds_count || 0), 0);
  const totalHashes = (csData || []).reduce((s: number, r: any) => s + (r.hashes_count || 0), 0);

  const peakCritical = Math.max(0, ...weeks.map(w => w.critical_count));
  const avgScore     = weeks.length > 0
    ? Math.round(weeks.reduce((s, w) => s + w.avg_score, 0) / weeks.length * 100) / 100
    : 0;

  // 5. AI executive summary (opzionale)
  let aiSummary: string | null = null;
  let aiRecs:    string[] = [];
  if (openaiKey && weeks.length > 0) {
    try {
      const prompt = buildAiPrompt({ monthKey, weeks: weeks.length, scoreStart, scoreEnd, scoreDelta, criticalCount, highCount, totalCves: allCves.length, resolvedCount, totalFindings, topCves, totalCreds, totalHashes });
      const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
      });
      if (aiResp.ok) {
        const aiBody = await aiResp.json();
        const parsed = JSON.parse(aiBody.choices?.[0]?.message?.content || '{}');
        aiSummary = parsed.executive_summary || null;
        aiRecs    = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
      }
    } catch (err) {
      console.warn('[monthly-report] AI summary failed:', err);
    }
  }

  return {
    generated_at:      new Date().toISOString(),
    month_key:         monthKey,
    organization_id:   orgId,
    weekly_snapshots:  weeks.length,
    trend: {
      score_history:   scoreHistory,
      score_start:     scoreStart,
      score_end:       scoreEnd,
      score_delta:     scoreDelta,
      avg_score:       avgScore,
      peak_critical:   peakCritical,
    },
    findings_summary: {
      total:    totalFindings,
      critical: criticalCount,
      high:     highCount,
      medium:   medCount,
      low:      lowCount,
      resolved: resolvedCount,
      by_type:  findingsByType,
    },
    cve_summary: {
      total_unique: cveCounts.size,
      top_cves:     topCves,
    },
    breach_intel: {
      creds_found:  totalCreds,
      hashes_found: totalHashes,
      domains:      (csData || []).map((r: any) => r.domain),
    },
    ai: {
      executive_summary: aiSummary,
      recommendations:   aiRecs,
    },
  };
}

function buildAiPrompt(data: {
  monthKey: string; weeks: number; scoreStart: number; scoreEnd: number; scoreDelta: number;
  criticalCount: number; highCount: number; totalCves: number; resolvedCount: number;
  totalFindings: number; topCves: Array<{ id: string; count: number }>;
  totalCreds: number; totalHashes: number;
}): string {
  return `Sei un analista di sicurezza informatica. Scrivi un executive summary mensile del report SurfaceScan360.

DATI MESE ${data.monthKey}:
- Snapshot settimanali analizzati: ${data.weeks}
- Score sicurezza: da ${data.scoreStart} a ${data.scoreEnd} (delta: ${data.scoreDelta > 0 ? '+' : ''}${data.scoreDelta})
- Finding critici rilevati: ${data.criticalCount}
- Finding high: ${data.highCount}
- Total CVE univoci: ${data.totalCves}
- Finding risolti: ${data.resolvedCount} su ${data.totalFindings}
- CVE più frequenti: ${data.topCves.slice(0, 5).map(c => c.id).join(', ') || 'nessuno'}
- Credenziali breach trovate: ${data.totalCreds}
- Hash breach trovati: ${data.totalHashes}

Rispondi in italiano con JSON: { "executive_summary": "2-3 paragrafi", "recommendations": ["azione 1", "azione 2", "azione 3", "azione 4", "azione 5"] }
Non menzionare nomi di prodotti/vendor tecnici (es. Shodan, ConnectSecure, OpenAI). Usa linguaggio adatto ad un CISO.`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function prevMonthKey(): string {
  const now   = new Date();
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}
