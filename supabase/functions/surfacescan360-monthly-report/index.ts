import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-surface-internal-secret',
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type RequestBody = {
  organization_id?: string;
  month_key?: string;
  triggered_by?: string;
};

type MonthlyResult = {
  org_id: string;
  month_key: string;
  ok: boolean;
  error?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const internalSecret = Deno.env.get('SURFACE_SCAN_CRON_INTERNAL_SECRET') || '';
  const openAiKey = Deno.env.get('OPENAI_API_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'server_configuration_error' }, 500);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({})) as RequestBody;
    const requestedOrganizationId = String(body.organization_id || '').trim();
    const monthKey = String(body.month_key || prevMonthKey()).trim();
    if (!MONTH_KEY_PATTERN.test(monthKey)) return json({ error: 'invalid_month_key' }, 400);

    const authHeader = req.headers.get('authorization') || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const internalToken = req.headers.get('x-surface-internal-secret') || '';
    const isServiceRole = bearerToken === serviceRoleKey;
    const isInternal = Boolean(internalSecret && internalToken === internalSecret);
    const isInternalCaller = isServiceRole || isInternal;

    if (!isInternalCaller) {
      if (!bearerToken) return json({ error: 'authentication_required' }, 401);
      if (!requestedOrganizationId) return json({ error: 'organization_id_required' }, 400);

      const { data: userData, error: userError } = await adminClient.auth.getUser(bearerToken);
      const authUser = userData?.user;
      if (userError || !authUser) return json({ error: 'invalid_token' }, 401);

      const [{ data: appUser }, { data: roleRows }] = await Promise.all([
        adminClient
          .from('users')
          .select('organization_id, user_type')
          .eq('auth_user_id', authUser.id)
          .maybeSingle(),
        adminClient
          .from('user_roles')
          .select('role')
          .eq('user_id', authUser.id),
      ]);

      const roles = new Set((roleRows || []).map((row: { role?: string }) => String(row.role || '')));
      const isGlobalOperator = roles.has('super_admin') || roles.has('sales');
      const isOrganizationAdmin =
        String(appUser?.user_type || '') === 'admin'
        && String(appUser?.organization_id || '') === requestedOrganizationId;
      if (!isGlobalOperator && !isOrganizationAdmin) return json({ error: 'forbidden' }, 403);
    }

    const triggeredBy = isInternalCaller
      ? String(body.triggered_by || 'cron_monthly').trim().slice(0, 64)
      : 'manual';

    let organizationIds: string[] = [];
    if (requestedOrganizationId) {
      organizationIds = [requestedOrganizationId];
    } else if (isInternalCaller) {
      const { data: organizations, error } = await adminClient
        .from('organizations')
        .select('id')
        .eq('surface_scan360_enabled', true);
      if (error) throw error;
      organizationIds = (organizations || []).map((organization: { id: string }) => String(organization.id));
    }

    const results: MonthlyResult[] = [];
    for (const organizationId of organizationIds) {
      try {
        const { data: organization } = await adminClient
          .from('organizations')
          .select('id')
          .eq('id', organizationId)
          .maybeSingle();
        if (!organization) throw new Error('organization_not_found');

        const report = await buildMonthlyReport(adminClient, organizationId, monthKey, openAiKey);
        const { error } = await adminClient.from('surface_scan_monthly_reports').upsert({
          organization_id: organizationId,
          month_key: monthKey,
          month_start: `${monthKey}-01`,
          payload: report,
          triggered_by: triggeredBy,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,month_key' });
        if (error) throw error;
        results.push({ org_id: organizationId, month_key: monthKey, ok: true });
      } catch (error) {
        console.error(`[monthly-report] org=${organizationId} month=${monthKey}:`, error);
        results.push({
          org_id: organizationId,
          month_key: monthKey,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return json({
      ok: results.every((result) => result.ok),
      month_key: monthKey,
      results,
    });
  } catch (error) {
    console.error('[surfacescan360-monthly-report] unhandled:', error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

async function buildMonthlyReport(
  adminClient: SupabaseClient,
  organizationId: string,
  monthKey: string,
  openAiKey: string,
): Promise<Record<string, unknown>> {
  const [yearString, monthString] = monthKey.split('-');
  const year = Number.parseInt(yearString, 10);
  const month = Number.parseInt(monthString, 10);
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));

  const [snapshotResult, findingResult, sensitiveDataResult] = await Promise.all([
    adminClient
      .from('surface_scan_history')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('scanned_at', startDate.toISOString())
      .lt('scanned_at', endDate.toISOString())
      .order('scanned_at', { ascending: true }),
    adminClient
      .from('surface_findings')
      .select('severity, finding_type, cve, status, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString()),
    adminClient
      .from('connectsecure_sensitive_data')
      .select('domain, creds_count, hashes_count, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString()),
  ]);

  if (snapshotResult.error) throw snapshotResult.error;
  if (findingResult.error) throw findingResult.error;
  if (sensitiveDataResult.error) throw sensitiveDataResult.error;

  const weeks = (snapshotResult.data || []) as Array<{
    scanned_at: string;
    avg_score: number;
    total_assets: number;
    critical_count: number;
    warning_count: number;
    safe_count: number;
    high_cves: number;
    medium_cves: number;
    low_cves: number;
    assets_snapshot?: unknown[];
  }>;
  const findings = (findingResult.data || []) as Array<{
    severity: string;
    finding_type: string;
    cve?: string[];
    status: string;
    created_at: string;
  }>;
  const sensitiveData = sensitiveDataResult.data || [];

  const scoreHistory = weeks.map((week) => ({
    date: week.scanned_at.slice(0, 10),
    score: week.avg_score,
  }));
  const scoreStart = weeks[0]?.avg_score ?? 0;
  const scoreEnd = weeks[weeks.length - 1]?.avg_score ?? 0;
  const scoreDelta = Math.round((scoreEnd - scoreStart) * 100) / 100;
  const criticalCount = findings.filter((finding) => finding.severity === 'critical').length;
  const highCount = findings.filter((finding) => finding.severity === 'high').length;
  const mediumCount = findings.filter((finding) => finding.severity === 'medium').length;
  const lowCount = findings.filter((finding) => finding.severity === 'low').length;
  const resolvedCount = findings.filter((finding) => ['resolved', 'suppressed'].includes(finding.status)).length;

  const allCves = findings.flatMap((finding) => finding.cve || []);
  const cveCounts = new Map<string, number>();
  for (const cve of allCves) cveCounts.set(cve, (cveCounts.get(cve) || 0) + 1);
  const topCves = [...cveCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ id, count }));
  const findingsByType = findings.reduce<Record<string, number>>((accumulator, finding) => {
    accumulator[finding.finding_type] = (accumulator[finding.finding_type] || 0) + 1;
    return accumulator;
  }, {});
  const totalCredentials = sensitiveData.reduce((sum, row) => sum + Number(row.creds_count || 0), 0);
  const totalHashes = sensitiveData.reduce((sum, row) => sum + Number(row.hashes_count || 0), 0);
  const peakCritical = Math.max(0, ...weeks.map((week) => Number(week.critical_count || 0)));
  const averageScore = weeks.length > 0
    ? Math.round((weeks.reduce((sum, week) => sum + Number(week.avg_score || 0), 0) / weeks.length) * 100) / 100
    : 0;

  let executiveSummary: string | null = null;
  let recommendations: string[] = [];
  if (openAiKey && weeks.length > 0) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey.trim()}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: buildAiPrompt({
              monthKey,
              weeks: weeks.length,
              scoreStart,
              scoreEnd,
              scoreDelta,
              criticalCount,
              highCount,
              totalCves: allCves.length,
              resolvedCount,
              totalFindings: findings.length,
              topCves,
              totalCredentials,
              totalHashes,
            }),
          }],
        }),
      });
      if (response.ok) {
        const responseBody = await response.json();
        const parsed = JSON.parse(responseBody.choices?.[0]?.message?.content || '{}');
        executiveSummary = parsed.executive_summary || null;
        recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
      }
    } catch (error) {
      console.warn('[monthly-report] AI summary unavailable:', error);
    }
  }

  return {
    generated_at: new Date().toISOString(),
    month_key: monthKey,
    organization_id: organizationId,
    weekly_snapshots: weeks.length,
    trend: {
      score_history: scoreHistory,
      score_start: scoreStart,
      score_end: scoreEnd,
      score_delta: scoreDelta,
      avg_score: averageScore,
      peak_critical: peakCritical,
    },
    findings_summary: {
      total: findings.length,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount,
      resolved: resolvedCount,
      by_type: findingsByType,
    },
    cve_summary: {
      total_unique: cveCounts.size,
      top_cves: topCves,
    },
    breach_intel: {
      creds_found: totalCredentials,
      hashes_found: totalHashes,
      domains: Array.from(new Set(sensitiveData.map((row) => row.domain).filter(Boolean))),
    },
    ai: {
      executive_summary: executiveSummary,
      recommendations,
    },
  };
}

type AiPromptData = {
  monthKey: string;
  weeks: number;
  scoreStart: number;
  scoreEnd: number;
  scoreDelta: number;
  criticalCount: number;
  highCount: number;
  totalCves: number;
  resolvedCount: number;
  totalFindings: number;
  topCves: Array<{ id: string; count: number }>;
  totalCredentials: number;
  totalHashes: number;
};

function buildAiPrompt(data: AiPromptData): string {
  return `Sei un analista di sicurezza informatica. Scrivi un executive summary mensile SurfaceScan360.

DATI MESE ${data.monthKey}:
- Snapshot settimanali: ${data.weeks}
- Indice postura: da ${data.scoreStart} a ${data.scoreEnd} (delta ${data.scoreDelta >= 0 ? '+' : ''}${data.scoreDelta})
- Finding critici: ${data.criticalCount}
- Finding alti: ${data.highCount}
- CVE rilevate: ${data.totalCves}
- Finding risolti: ${data.resolvedCount} su ${data.totalFindings}
- CVE piu frequenti: ${data.topCves.slice(0, 5).map((entry) => entry.id).join(', ') || 'nessuna'}
- Credenziali esposte: ${data.totalCredentials}
- Hash esposti: ${data.totalHashes}

Rispondi in italiano con JSON: { "executive_summary": "2-3 paragrafi", "recommendations": ["azione 1", "azione 2", "azione 3", "azione 4", "azione 5"] }.
Non menzionare nomi di prodotti, provider o tecnologie interne. Usa linguaggio adatto a un CISO.`;
}

function prevMonthKey(): string {
  const now = new Date();
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, '0')}`;
}
