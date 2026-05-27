import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from '../_shared/surface-scan-utils.ts';

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

    const qaRes = await adminClient.rpc('darkrisk_qa_security_snapshot' as any, { _org_id: customerId });
    if (qaRes.error) throw qaRes.error;

    const snapshot = (qaRes.data || {}) as Record<string, any>;
    const checks = (snapshot.checks || {}) as Record<string, boolean>;
    const counts = (snapshot.counts || {}) as Record<string, number>;

    const [{ count: scanRuns = 0 }, { count: findings = 0 }, { count: reports = 0 }, { count: recommendations = 0 }] = await Promise.all([
      adminClient
        .from('darkrisk_scan_runs' as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', customerId),
      adminClient
        .from('darkrisk_findings' as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', customerId),
      adminClient
        .from('darkrisk_report_snapshots' as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', customerId),
      adminClient
        .from('darkrisk_recommendations' as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', customerId),
    ] as any);

    const checklist = [
      { id: 'api_key_not_in_report', passed: checks.report_secrets_absent === true },
      { id: 'scan_run_completed', passed: scanRuns > 0 },
      { id: 'findings_generated', passed: findings > 0 },
      { id: 'report_generated', passed: reports > 0 },
      { id: 'recommendations_generated', passed: recommendations > 0 },
      { id: 'sensitive_customer_data_hidden', passed: checks.no_sensitive_customer_evidence === true },
      { id: 'reveal_audited', passed: checks.audit_reveal_present === true },
      { id: 'openai_audited', passed: checks.audit_ai_present === true },
      { id: 'scan_audited', passed: checks.audit_scan_present === true },
      { id: 'export_audited', passed: checks.audit_export_present === true },
      { id: 'rls_enabled', passed: checks.rls_enabled_all_tables === true },
    ];

    const passed = checklist.filter((item) => item.passed).length;
    const total = checklist.length;

    return jsonResponse({
      ok: true,
      customer_id: customerId,
      score: Math.round((passed / total) * 100),
      passed,
      total,
      checklist,
      counts,
      generated_at: snapshot.generated_at || new Date().toISOString(),
      notes: [
        'Per validare bundle/frontend secrets, eseguire localmente: npm run qa:no-secrets',
      ],
    });
  } catch (error: any) {
    return jsonResponse({ ok: false, error: normalizeText(error?.message || 'Internal error') }, 500);
  }
});
