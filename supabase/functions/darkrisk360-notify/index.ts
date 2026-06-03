/**
 * darkrisk360-notify
 *
 * Invia notifiche email per DarkRisk360:
 *   - 'alert':          email immediata quando ci sono nuovi finding (soglia configurabile)
 *   - 'weekly_summary': digest settimanale con stats dal weekly snapshot
 *
 * Input: POST { organization_id, scan_run_id?, notify_type: 'alert' | 'weekly_summary' }
 * Auth:  header x-darkrisk360-internal-secret = DARKRISK360_INTERNAL_SECRET
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
import { Resend } from 'npm:resend@2.0.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const INTERNAL_SECRET = String(Deno.env.get('DARKRISK360_INTERNAL_SECRET') || '').trim();
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.hicompliance.it';
const FROM_EMAIL = 'DarkRisk360 <noreply@hiconsole.io>';

const ONE_HOUR_MS = 60 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-darkrisk360-internal-secret',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const secret = req.headers.get('x-darkrisk360-internal-secret') ?? '';
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { organization_id?: string; scan_run_id?: string; notify_type?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { organization_id: orgId, scan_run_id: scanRunId, notify_type: notifyType } = body;
  if (!orgId || !notifyType) {
    return new Response(
      JSON.stringify({ error: 'organization_id and notify_type required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase credentials' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!RESEND_API_KEY) {
    console.warn('[darkrisk360-notify] RESEND_API_KEY not set — skip send');
    return new Response(JSON.stringify({ ok: true, skipped: 'no_resend_key' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const resend = new Resend(RESEND_API_KEY);

  // Carica config notifiche
  const { data: configData } = await adminClient
    .from('darkrisk360_notification_configs' as any)
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  const config = configData as {
    recipient_emails: string[];
    alert_on_new_findings: boolean;
    alert_severity_threshold: string;
    min_new_findings_to_alert: number;
    weekly_summary_enabled: boolean;
    last_alert_sent_at: string | null;
    last_summary_sent_at: string | null;
  } | null;

  if (!config || (config.recipient_emails?.length ?? 0) === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_recipients_configured' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Carica nome organizzazione
  const { data: orgData } = await adminClient
    .from('organizations' as any)
    .select('name')
    .eq('id', orgId)
    .maybeSingle();
  const orgName = String((orgData as any)?.name ?? orgId);

  if (notifyType === 'alert') {
    return await handleAlert(adminClient, resend, config, orgId, orgName, scanRunId);
  }

  if (notifyType === 'weekly_summary') {
    return await handleWeeklySummary(adminClient, resend, config, orgId, orgName);
  }

  return new Response(
    JSON.stringify({ error: `Unknown notify_type: ${notifyType}` }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

// ---------------------------------------------------------------------------
// Alert path
// ---------------------------------------------------------------------------

async function handleAlert(
  adminClient: ReturnType<typeof createClient>,
  resend: InstanceType<typeof Resend>,
  config: NonNullable<Awaited<ReturnType<typeof loadConfig>>>,
  orgId: string,
  orgName: string,
  scanRunId: string | undefined,
) {
  if (!config.alert_on_new_findings) {
    return jsonResponse({ ok: true, skipped: 'alerts_disabled' });
  }

  // Rate-limit: max 1 alert / ora
  if (config.last_alert_sent_at) {
    const lastMs = Date.parse(config.last_alert_sent_at);
    if (Date.now() - lastMs < ONE_HOUR_MS) {
      return jsonResponse({ ok: true, skipped: 'rate_limited' });
    }
  }

  const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
  const thresholdIdx = severityOrder.indexOf(config.alert_severity_threshold);
  const allowedSeverities = severityOrder.slice(0, thresholdIdx + 1);

  // Nuovi finding da questo scan run con severity >= soglia
  let query = (adminClient as any)
    .from('darkrisk_findings')
    .select('id, title, severity, finding_type, status, last_seen_at')
    .eq('organization_id', orgId)
    .in('severity', allowedSeverities)
    .eq('status', 'new')
    .order('severity', { ascending: false })
    .limit(20);

  if (scanRunId) {
    query = query.eq('scan_run_id', scanRunId);
  }

  const { data: newFindings } = await query;
  const findings = (newFindings ?? []) as Array<{
    id: string;
    title: string;
    severity: string;
    finding_type: string;
    status: string;
    last_seen_at: string;
  }>;

  if (findings.length < config.min_new_findings_to_alert) {
    return jsonResponse({ ok: true, skipped: 'below_threshold', count: findings.length });
  }

  const dashboardUrl = `${APP_URL}/dark-risk`;
  const subject = `[DarkRisk360] ${findings.length} nuov${findings.length === 1 ? 'o finding' : 'i finding'} — ${orgName}`;

  const html = buildAlertHtml({
    orgName,
    findings,
    dashboardUrl,
    scanRunId,
  });

  await resend.emails.send({
    from: FROM_EMAIL,
    to: config.recipient_emails,
    subject,
    html,
  });

  // Aggiorna last_alert_sent_at
  await (adminClient as any)
    .from('darkrisk360_notification_configs')
    .update({ last_alert_sent_at: new Date().toISOString() })
    .eq('organization_id', orgId);

  return jsonResponse({ ok: true, sent: true, recipients: config.recipient_emails.length, findings_count: findings.length });
}

// ---------------------------------------------------------------------------
// Weekly summary path
// ---------------------------------------------------------------------------

async function handleWeeklySummary(
  adminClient: ReturnType<typeof createClient>,
  resend: InstanceType<typeof Resend>,
  config: NonNullable<Awaited<ReturnType<typeof loadConfig>>>,
  orgId: string,
  orgName: string,
) {
  if (!config.weekly_summary_enabled) {
    return jsonResponse({ ok: true, skipped: 'weekly_summary_disabled' });
  }

  // Carica snapshot più recente
  const { data: snapshotData } = await (adminClient as any)
    .from('darkrisk360_weekly_snapshots')
    .select('*')
    .eq('organization_id', orgId)
    .order('week_start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshot = snapshotData as {
    week_key: string;
    total_records: number;
    new_records_this_week: number;
    risk_index: number;
    delta_vs_prev: Record<string, unknown>;
    results_by_source: Record<string, number>;
    severity_distribution: Record<string, number>;
  } | null;

  // Top 5 finding critici/alti
  const { data: topFindings } = await (adminClient as any)
    .from('darkrisk_findings')
    .select('title, severity, finding_type, last_seen_at, status')
    .eq('organization_id', orgId)
    .in('severity', ['critical', 'high'])
    .not('status', 'in', '("resolved","suppressed","false_positive","accepted_risk")')
    .order('severity', { ascending: false })
    .limit(5);

  const subject = `DarkRisk360 — Sintesi settimanale ${snapshot?.week_key ?? ''} — ${orgName}`;
  const dashboardUrl = `${APP_URL}/dark-risk`;

  const html = buildWeeklySummaryHtml({
    orgName,
    snapshot,
    topFindings: (topFindings ?? []) as Array<{ title: string; severity: string; finding_type: string; last_seen_at: string; status: string }>,
    dashboardUrl,
  });

  await resend.emails.send({
    from: FROM_EMAIL,
    to: config.recipient_emails,
    subject,
    html,
  });

  await (adminClient as any)
    .from('darkrisk360_notification_configs')
    .update({ last_summary_sent_at: new Date().toISOString() })
    .eq('organization_id', orgId);

  return jsonResponse({ ok: true, sent: true, recipients: config.recipient_emails.length });
}

// ---------------------------------------------------------------------------
// HTML builders
// ---------------------------------------------------------------------------

function buildAlertHtml(params: {
  orgName: string;
  findings: Array<{ id: string; title: string; severity: string; finding_type: string; last_seen_at: string }>;
  dashboardUrl: string;
  scanRunId?: string;
}): string {
  const severityColor: Record<string, string> = {
    critical: '#dc2626',
    high:     '#ea580c',
    medium:   '#ca8a04',
    low:      '#2563eb',
    info:     '#6b7280',
  };

  const rows = params.findings
    .map(
      (f) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${severityColor[f.severity] ?? '#6b7280'};color:#fff;font-size:11px;font-weight:600;text-transform:uppercase;">${f.severity}</span>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${escHtml(f.title ?? '')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${escHtml(f.finding_type ?? '')}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#1e293b;padding:20px 24px;">
      <span style="font-size:18px;font-weight:700;color:#fff;">DarkRisk360</span>
      <span style="font-size:12px;color:#94a3b8;margin-left:8px;">Identity Leak Monitor</span>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 4px;font-size:16px;color:#111827;">Nuovi finding rilevati</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">Organizzazione: <strong>${escHtml(params.orgName)}</strong></p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#475569;font-weight:600;">Severity</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#475569;font-weight:600;">Titolo</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#475569;font-weight:600;">Tipo</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:12px;color:#6b7280;margin-bottom:16px;">
        I valori sensibili (password, credenziali) non sono inclusi in questa email per motivi di sicurezza.
        Accedi alla dashboard per dettagli completi.
      </p>
      <a href="${params.dashboardUrl}" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">
        Apri Dashboard DarkRisk360
      </a>
    </div>
    <div style="padding:12px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">HiCompliance — DarkRisk360 &mdash; email automatica, non rispondere</p>
    </div>
  </div>
</body>
</html>`;
}

function buildWeeklySummaryHtml(params: {
  orgName: string;
  snapshot: {
    week_key: string;
    total_records: number;
    new_records_this_week: number;
    risk_index: number;
    delta_vs_prev: Record<string, unknown>;
    results_by_source: Record<string, number>;
    severity_distribution: Record<string, number>;
  } | null;
  topFindings: Array<{ title: string; severity: string; finding_type: string; last_seen_at: string; status: string }>;
  dashboardUrl: string;
}): string {
  const { snapshot, topFindings, orgName, dashboardUrl } = params;

  const deltaTotal = (snapshot?.delta_vs_prev as any)?.total_records ?? 0;
  const deltaTotalStr = deltaTotal > 0 ? `+${deltaTotal}` : String(deltaTotal);
  const deltaRisk = (snapshot?.delta_vs_prev as any)?.risk_index ?? 0;
  const deltaRiskStr = deltaRisk > 0 ? `+${deltaRisk}` : String(deltaRisk);

  const riskColor = (ri: number) => ri >= 75 ? '#dc2626' : ri >= 50 ? '#ea580c' : ri >= 25 ? '#ca8a04' : '#16a34a';

  const sourceRows = Object.entries(snapshot?.results_by_source ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `<tr><td style="padding:4px 10px;font-size:12px;">${escHtml(k)}</td><td style="padding:4px 10px;font-size:12px;font-weight:600;">${v}</td></tr>`)
    .join('');

  const findingRows = topFindings
    .map((f) => `<tr><td style="padding:4px 10px;font-size:12px;font-weight:600;color:${f.severity === 'critical' ? '#dc2626' : '#ea580c'};">${f.severity.toUpperCase()}</td><td style="padding:4px 10px;font-size:12px;">${escHtml(f.title ?? '')}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#1e293b;padding:20px 24px;">
      <span style="font-size:18px;font-weight:700;color:#fff;">DarkRisk360</span>
      <span style="font-size:12px;color:#94a3b8;margin-left:8px;">Sintesi Settimanale</span>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 4px;font-size:16px;color:#111827;">Report Settimana ${escHtml(snapshot?.week_key ?? '')}</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:13px;">Organizzazione: <strong>${escHtml(orgName)}</strong></p>

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px;">
        ${kpiBox('Leak Totali', String(snapshot?.total_records ?? 0), '#1e293b')}
        ${kpiBox('Nuovi questa settimana', String(snapshot?.new_records_this_week ?? 0), '#1e293b')}
        ${kpiBox('Risk Index', `${snapshot?.risk_index ?? 0}/100`, riskColor(snapshot?.risk_index ?? 0))}
        ${kpiBox('Δ vs settimana prec.', deltaTotalStr, deltaTotal > 0 ? '#dc2626' : '#16a34a')}
      </div>

      ${sourceRows ? `
      <h3 style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">Top Sorgenti</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead><tr style="background:#f1f5f9;"><th style="padding:6px 10px;text-align:left;font-size:11px;color:#64748b;">Sorgente</th><th style="padding:6px 10px;text-align:left;font-size:11px;color:#64748b;">Conteggio</th></tr></thead>
        <tbody>${sourceRows}</tbody>
      </table>` : ''}

      ${findingRows ? `
      <h3 style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">Finding Critici / High</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead><tr style="background:#f1f5f9;"><th style="padding:6px 10px;text-align:left;font-size:11px;color:#64748b;">Severity</th><th style="padding:6px 10px;text-align:left;font-size:11px;color:#64748b;">Titolo</th></tr></thead>
        <tbody>${findingRows}</tbody>
      </table>` : ''}

      <p style="font-size:12px;color:#6b7280;margin-bottom:16px;">
        Risk Index Δ vs settimana precedente: <strong>${deltaRiskStr}</strong>
      </p>
      <a href="${dashboardUrl}" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">
        Apri Dashboard DarkRisk360
      </a>
    </div>
    <div style="padding:12px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">HiCompliance — DarkRisk360 &mdash; email automatica, non rispondere</p>
    </div>
  </div>
</body>
</html>`;
}

function kpiBox(label: string, value: string, color: string): string {
  return `<div style="border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;">
    <div style="font-size:11px;color:#64748b;margin-bottom:4px;">${escHtml(label)}</div>
    <div style="font-size:22px;font-weight:700;color:${color};">${escHtml(value)}</div>
  </div>`;
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Type helper (non usato a runtime, solo per leggibilità)
async function loadConfig(_adminClient: unknown, _orgId: string) {
  return null as {
    recipient_emails: string[];
    alert_on_new_findings: boolean;
    alert_severity_threshold: string;
    min_new_findings_to_alert: number;
    weekly_summary_enabled: boolean;
    last_alert_sent_at: string | null;
    last_summary_sent_at: string | null;
  } | null;
}
