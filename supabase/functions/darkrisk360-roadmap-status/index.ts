import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from '../_shared/surface-scan-utils.ts';

type PhaseStatus = 'completed' | 'in_progress' | 'planned' | 'blocked';

interface PhaseRow {
  phase: number;
  key: string;
  title: string;
  status: PhaseStatus;
  score: number;
  evidence: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function statusFromProgress(progress: number, blocked = false): PhaseStatus {
  if (blocked) return 'blocked';
  if (progress >= 1) return 'completed';
  if (progress <= 0) return 'planned';
  return 'in_progress';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const requestedCustomerId = normalizeText(body?.customer_id);

    const caller = await getCallerProfile(adminClient, authData.user.id);
    const customerId = requestedCustomerId || caller.organizationId || '';
    if (!customerId) return jsonResponse({ ok: false, error: 'customer_id is required' }, 400);
    assertCustomerAccess(caller, customerId);

    const [
      entitlementRes,
      scanRunsRes,
      assetsCountRes,
      selectorsCountRes,
      sourceRecordsRes,
      findingsCountRes,
      recommendationsCountRes,
      alertsCountRes,
      reportCountRes,
      auditStatsRes,
      moduleResultsRes,
    ] = await Promise.all([
      adminClient
        .from('darkrisk_entitlements' as any)
        .select('enabled, tier, enable_ai_recommendations, raw_evidence_retention_days, enable_raw_evidence')
        .eq('organization_id', customerId)
        .maybeSingle(),
      adminClient
        .from('darkrisk_scan_runs' as any)
        .select('id, status, started_at, completed_at, sources', { count: 'exact' })
        .eq('organization_id', customerId)
        .order('created_at', { ascending: false })
        .limit(100),
      adminClient
        .from('darkrisk_assets' as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', customerId),
      adminClient
        .from('darkrisk_selectors' as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', customerId),
      adminClient
        .from('darkrisk_source_records' as any)
        .select('id, source', { count: 'exact' })
        .eq('organization_id', customerId)
        .limit(1000),
      adminClient
        .from('darkrisk_findings' as any)
        .select('id, risk_score, metadata', { count: 'exact' })
        .eq('organization_id', customerId)
        .limit(1000),
      adminClient
        .from('darkrisk_recommendations' as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', customerId),
      adminClient
        .from('darkrisk_alerts' as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', customerId),
      adminClient
        .from('darkrisk_report_snapshots' as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', customerId),
      adminClient
        .from('darkrisk_audit_log' as any)
        .select('id, action', { count: 'exact' })
        .eq('organization_id', customerId)
        .order('created_at', { ascending: false })
        .limit(500),
      adminClient
        .from('surface_scan_module_results' as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', customerId),
    ]);

    const allErrors = [
      entitlementRes.error,
      scanRunsRes.error,
      assetsCountRes.error,
      selectorsCountRes.error,
      sourceRecordsRes.error,
      findingsCountRes.error,
      recommendationsCountRes.error,
      alertsCountRes.error,
      reportCountRes.error,
      auditStatsRes.error,
      moduleResultsRes.error,
    ].filter(Boolean);

    if (allErrors.length > 0) {
      throw allErrors[0] as any;
    }

    const entitlement = entitlementRes.data as Record<string, any> | null;
    const enabled = Boolean(entitlement?.enabled);

    const scanRuns = (scanRunsRes.data || []) as Array<Record<string, any>>;
    const scanRunsTotal = Number(scanRunsRes.count || 0);
    const completedRuns = scanRuns.filter((row) => ['completed', 'completed_with_warnings'].includes(String(row.status || ''))).length;

    const assetsCount = Number(assetsCountRes.count || 0);
    const selectorsCount = Number(selectorsCountRes.count || 0);
    const sourceRecords = (sourceRecordsRes.data || []) as Array<Record<string, any>>;
    const sourceCount = Number(sourceRecordsRes.count || 0);
    const findings = (findingsCountRes.data || []) as Array<Record<string, any>>;
    const findingsCount = Number(findingsCountRes.count || 0);

    const sourceSurface = sourceRecords.filter((row) => String(row.source || '').toLowerCase() === 'surfacescan360').length;
    const sourceIntelx = sourceRecords.filter((row) => String(row.source || '').toLowerCase() === 'intelx').length;

    const highRiskFindings = findings.filter((row) => Number(row.risk_score || 0) >= 60).length;
    const intelxTaggedFindings = findings.filter((row) => String(row?.metadata?.source_origin || '').toLowerCase().includes('intelx')).length;

    const recoCount = Number(recommendationsCountRes.count || 0);
    const alertsCount = Number(alertsCountRes.count || 0);
    const reportCount = Number(reportCountRes.count || 0);
    const moduleResultsCount = Number(moduleResultsRes.count || 0);

    const auditRows = (auditStatsRes.data || []) as Array<Record<string, any>>;
    const auditActions = new Set(auditRows.map((row) => String(row.action || '').toLowerCase()));

    const phases: PhaseRow[] = [];

    const p0Progress = enabled ? 1 : 0;
    phases.push({
      phase: 0,
      key: 'repo_discovery',
      title: 'Fase 0 - Repository discovery',
      status: statusFromProgress(p0Progress),
      score: p0Progress,
      evidence: enabled ? 'Entitlement DarkRisk360 disponibile per il cliente.' : 'Entitlement non ancora attivo.',
    });

    const schemaIndicators = [assetsCountRes.count != null, selectorsCountRes.count != null, findingsCountRes.count != null, reportCountRes.count != null]
      .filter(Boolean).length;
    const p1Progress = schemaIndicators / 4;
    phases.push({
      phase: 1,
      key: 'schema',
      title: 'Fase 1 - Schema dati',
      status: statusFromProgress(p1Progress),
      score: p1Progress,
      evidence: `Indicatori schema disponibili: ${schemaIndicators}/4.`,
    });

    const p2Progress = Math.min(1, [assetsCount > 0, selectorsCount > 0].filter(Boolean).length / 2);
    phases.push({
      phase: 2,
      key: 'domain_services',
      title: 'Fase 2 - Domain services',
      status: statusFromProgress(p2Progress),
      score: p2Progress,
      evidence: `Asset: ${assetsCount}, Selector: ${selectorsCount}.`,
    });

    const p3Progress = Math.min(1, [sourceSurface > 0, findingsCount > 0, completedRuns > 0].filter(Boolean).length / 3);
    phases.push({
      phase: 3,
      key: 'surfacescan_adapter',
      title: 'Fase 3 - SurfaceScan360 adapter',
      status: statusFromProgress(p3Progress),
      score: p3Progress,
      evidence: `Source records Surface: ${sourceSurface}, finding: ${findingsCount}, run completate: ${completedRuns}.`,
    });

    const p4Progress = Math.min(1, [sourceIntelx > 0, Number(moduleResultsCount) > 0].filter(Boolean).length / 2);
    phases.push({
      phase: 4,
      key: 'intelx_client',
      title: 'Fase 4 - DarkRisk360 intelligence client backend',
      status: statusFromProgress(p4Progress),
      score: p4Progress,
      evidence: `Source DarkRisk360 intelligence: ${sourceIntelx}, moduli registrati: ${moduleResultsCount}.`,
    });

    const p5Progress = Math.min(1, [intelxTaggedFindings > 0, sourceIntelx > 0].filter(Boolean).length / 2);
    phases.push({
      phase: 5,
      key: 'intelx_finding_engine',
      title: 'Fase 5 - DarkRisk360 intelligence finding engine',
      status: statusFromProgress(p5Progress),
      score: p5Progress,
      evidence: `Finding DarkRisk360 intelligence tagged: ${intelxTaggedFindings}.`,
    });

    const p6Progress = Math.min(1, [findingsCount > 0, highRiskFindings > 0, alertsCount > 0].filter(Boolean).length / 3);
    phases.push({
      phase: 6,
      key: 'scoring_alerting',
      title: 'Fase 6 - Scoring e alerting',
      status: statusFromProgress(p6Progress),
      score: p6Progress,
      evidence: `Finding: ${findingsCount}, high risk: ${highRiskFindings}, alert: ${alertsCount}.`,
    });

    const p7Progress = Math.min(1, [scanRunsTotal > 0, findingsCount > 0, assetsCount > 0].filter(Boolean).length / 3);
    phases.push({
      phase: 7,
      key: 'ui_overview',
      title: 'Fase 7 - UI Overview',
      status: statusFromProgress(p7Progress),
      score: p7Progress,
      evidence: `Dati overview disponibili: run=${scanRunsTotal}, finding=${findingsCount}, asset=${assetsCount}.`,
    });

    const p8Progress = Math.min(1, [assetsCount > 0, findingsCount > 0, reportCount > 0].filter(Boolean).length / 3);
    phases.push({
      phase: 8,
      key: 'ui_dettaglio',
      title: 'Fase 8 - UI dettaglio',
      status: statusFromProgress(p8Progress),
      score: p8Progress,
      evidence: `Asset=${assetsCount}, finding=${findingsCount}, report=${reportCount}.`,
    });

    const aiEnabled = entitlement?.enable_ai_recommendations !== false;
    const p9Progress = aiEnabled ? Math.min(1, recoCount > 0 ? 1 : completedRuns > 0 ? 0.5 : 0) : 1;
    phases.push({
      phase: 9,
      key: 'openai_recommendations',
      title: 'Fase 9 - OpenAI recommendations',
      status: statusFromProgress(p9Progress),
      score: p9Progress,
      evidence: aiEnabled
        ? `AI attiva, recommendations generate: ${recoCount}.`
        : 'AI recommendation disabilitate da entitlement (considerato completato per policy).',
    });

    const p10Progress = Math.min(1, reportCount > 0 ? 1 : completedRuns > 0 ? 0.5 : 0);
    phases.push({
      phase: 10,
      key: 'report_generation',
      title: 'Fase 10 - Report generation',
      status: statusFromProgress(p10Progress),
      score: p10Progress,
      evidence: `Snapshot report disponibili: ${reportCount}.`,
    });

    const hardeningChecks = [
      auditActions.has('darkrisk_report_exported'),
      auditActions.has('darkrisk_ai_recommendations_generated'),
      auditActions.has('darkrisk_scan_completed') || auditActions.has('darkrisk_scan_completed_with_warnings'),
      entitlement?.raw_evidence_retention_days != null,
    ].filter(Boolean).length;

    const p11Progress = hardeningChecks / 4;
    phases.push({
      phase: 11,
      key: 'hardening',
      title: 'Fase 11 - Hardening',
      status: statusFromProgress(p11Progress),
      score: p11Progress,
      evidence: `Check hardening soddisfatti: ${hardeningChecks}/4.`,
    });

    const completed = phases.filter((p) => p.status === 'completed').length;
    const inProgress = phases.filter((p) => p.status === 'in_progress').length;
    const planned = phases.filter((p) => p.status === 'planned').length;
    const blocked = phases.filter((p) => p.status === 'blocked').length;

    const progressPercent = Math.round((phases.reduce((acc, p) => acc + p.score, 0) / phases.length) * 100);

    return jsonResponse({
      ok: true,
      customer_id: customerId,
      enabled,
      tier: String(entitlement?.tier || 'standard').toLowerCase() === 'extended' ? 'extended' : 'standard',
      counters: {
        scan_runs_total: scanRunsTotal,
        completed_runs: completedRuns,
        assets: assetsCount,
        selectors: selectorsCount,
        source_records: sourceCount,
        findings: findingsCount,
        recommendations: recoCount,
        alerts: alertsCount,
        reports: reportCount,
        audits: Number(auditStatsRes.count || 0),
      },
      summary: {
        progress_percent: progressPercent,
        completed,
        in_progress: inProgress,
        planned,
        blocked,
      },
      phases,
      generated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    return jsonResponse({ ok: false, error: normalizeText(error?.message || 'Internal error') }, 500);
  }
});
