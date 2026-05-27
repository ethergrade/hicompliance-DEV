import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from '../_shared/surface-scan-utils.ts';
import { maskPotentialSecrets, normalizeText } from '../_shared/darkrisk-utils.ts';

type ReportFormat = 'html' | 'json' | 'pdf';

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

function normalizeFormat(value: unknown): ReportFormat | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'html') return 'html';
  if (normalized === 'json') return 'json';
  if (normalized === 'pdf') return 'pdf';
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const reportId = sanitize(body?.report_id, 120);
    const requestedCustomerId = sanitize(body?.customer_id, 120);
    const reason = sanitize(body?.reason, 240) || 'manual_report_export';
    const format = normalizeFormat(body?.format);
    const expiresIn = Math.max(60, Math.min(3600, Number(body?.expires_in || 900)));

    if (!reportId) return jsonResponse({ ok: false, error: 'report_id is required' }, 400);
    if (!format) return jsonResponse({ ok: false, error: 'format must be html, json or pdf' }, 400);

    const caller = await getCallerProfile(adminClient, authData.user.id);
    const reportRes = await adminClient
      .from('darkrisk_report_snapshots' as any)
      .select('id, organization_id, title, classification, html_storage_path, json_storage_path, pdf_storage_path')
      .eq('id', reportId)
      .maybeSingle();

    if (reportRes.error) throw reportRes.error;
    if (!reportRes.data?.id) return jsonResponse({ ok: false, error: 'Report not found' }, 404);

    const report = reportRes.data as Record<string, unknown>;
    const customerId = requestedCustomerId || sanitize(report.organization_id as string, 120);
    if (!customerId) return jsonResponse({ ok: false, error: 'Unable to resolve customer scope' }, 400);

    assertCustomerAccess(caller, customerId);

    const reportOrg = sanitize(String(report.organization_id || ''), 120);
    if (reportOrg !== customerId) {
      return jsonResponse({ ok: false, error: 'report_id not in selected customer scope' }, 403);
    }

    let storagePath = '';
    if (format === 'html') storagePath = sanitize(report.html_storage_path as string, 300);
    if (format === 'pdf') storagePath = sanitize(report.pdf_storage_path as string, 300);
    if (format === 'json') {
      storagePath = sanitize(report.json_storage_path as string, 300);
      if (!storagePath) storagePath = `${customerId}/${reportId}.json`;
    }

    if (!storagePath) {
      return jsonResponse({
        ok: false,
        error: `${format.toUpperCase()} export not available for this report snapshot`,
      }, 404);
    }

    const { data: signedData, error: signErr } = await adminClient.storage
      .from('darkrisk-reports')
      .createSignedUrl(storagePath, expiresIn);

    if (signErr || !signedData?.signedUrl) {
      throw signErr || new Error('Unable to generate signed URL');
    }

    await adminClient
      .from('darkrisk_audit_log' as any)
      .insert({
        organization_id: customerId,
        tenant_id: customerId,
        actor_id: authData.user.id,
        action: 'darkrisk_report_exported',
        entity_type: 'darkrisk_report_snapshot',
        entity_id: reportId,
        reason,
        metadata: {
          format,
          storage_path: storagePath,
          expires_in: expiresIn,
          classification: sanitize(String(report.classification || ''), 80),
        },
      });

    return jsonResponse({
      ok: true,
      customer_id: customerId,
      report_id: reportId,
      format,
      expires_in: expiresIn,
      signed_url: signedData.signedUrl,
    });
  } catch (error: any) {
    return jsonResponse({
      ok: false,
      error: sanitize(error?.message || 'Internal error', 500),
    }, 500);
  }
});
