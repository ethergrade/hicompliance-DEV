// darkrisk-dti-esteso-report: Generates the full DTI Esteso content-rich report.
// Mirrors structure of the HiSolution DTI Esteso document.
// Pulls: IntelX leaks/credentials, DNS analysis, port data, surface scan findings.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').trim();
const SERVICE_ROLE = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const INTERNAL_SECRET = String(
  Deno.env.get('DARKRISK360_INTERNAL_SECRET') || Deno.env.get('DARKRISK_INTERNAL_SECRET') || ''
).trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-darkrisk-internal-secret, x-darkrisk-esteso-cron-secret',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function escHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(v: unknown): string {
  const s = String(v || '');
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10) || '—';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(v: unknown): string {
  const s = String(v || '');
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 16) || '—';
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sevBadge(sev: string): string {
  const map: Record<string, string> = {
    critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#2563eb', info: '#6b7280',
  };
  const color = map[sev?.toLowerCase()] ?? '#6b7280';
  return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase">${escHtml(sev)}</span>`;
}

function tr(...cells: string[]): string {
  return `<tr>${cells.map((c, i) => `<td style="padding:6px 10px;border:1px solid #374151;${i === 0 ? 'font-weight:600;background:#1e293b' : ''}">${c}</td>`).join('')}</tr>`;
}

function trh(...cells: string[]): string {
  return `<tr>${cells.map((c) => `<th style="padding:8px 10px;background:#1e3a5f;color:#93c5fd;border:1px solid #374151;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${c}</th>`).join('')}</tr>`;
}

function table(header: string[], rows: string[][]): string {
  if (rows.length === 0) return `<p style="color:#6b7280;font-style:italic">Nessun dato disponibile.</p>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0">
    <thead>${trh(...header)}</thead>
    <tbody>${rows.map((r) => tr(...r.map(escHtml))).join('')}</tbody>
  </table>`;
}

function section(title: string, content: string, level = 2): string {
  const tag = `h${level}`;
  return `<${tag} style="color:#60a5fa;margin-top:28px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #374151">${escHtml(title)}</${tag}>${content}`;
}

function subsection(title: string, content: string): string {
  return section(title, content, 3);
}

function para(text: string): string {
  return `<p style="color:#d1d5db;line-height:1.6;margin:8px 0">${text}</p>`;
}

function ul(items: string[]): string {
  return `<ul style="color:#d1d5db;padding-left:20px;margin:8px 0">${items.map((i) => `<li style="margin:4px 0">${i}</li>`).join('')}</ul>`;
}

// ─── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.5; }
  .container { max-width: 960px; margin: 0 auto; padding: 32px 24px; }
  .cover { text-align: center; padding: 60px 0 40px; border-bottom: 2px solid #1e3a5f; margin-bottom: 32px; }
  .cover h1 { font-size: 28px; color: #60a5fa; margin-bottom: 8px; }
  .cover .subtitle { font-size: 18px; color: #94a3b8; margin-bottom: 4px; }
  .cover .client { font-size: 22px; font-weight: 700; color: #f8fafc; margin: 16px 0; }
  .meta-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  .meta-table td { padding: 8px 12px; border: 1px solid #374151; }
  .meta-table td:first-child { background: #1e293b; font-weight: 600; width: 220px; }
  .toc { background: #1e293b; border-radius: 8px; padding: 20px 28px; margin: 24px 0; }
  .toc h2 { color: #60a5fa; margin-bottom: 12px; font-size: 16px; }
  .toc ol { padding-left: 20px; color: #94a3b8; }
  .toc li { margin: 6px 0; }
  .callout { border-left: 4px solid #ef4444; background: rgba(239,68,68,.08); padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 12px 0; }
  .callout.warn { border-color: #f59e0b; background: rgba(245,158,11,.08); }
  .callout.info { border-color: #3b82f6; background: rgba(59,130,246,.08); }
  .callout.ok   { border-color: #10b981; background: rgba(16,185,129,.08); }
  .callout-title { font-weight: 700; margin-bottom: 4px; }
  .badge { display:inline-block; padding:2px 10px; border-radius:12px; font-size:11px; font-weight:700; text-transform:uppercase; }
  .badge-crit  { background:#dc2626; color:#fff; }
  .badge-high  { background:#ea580c; color:#fff; }
  .badge-med   { background:#d97706; color:#fff; }
  .badge-low   { background:#2563eb; color:#fff; }
  .badge-info  { background:#4b5563; color:#e5e7eb; }
  .badge-ok    { background:#10b981; color:#fff; }
  .page-break  { page-break-before: always; margin-top: 40px; }
  .kpi-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(180px,1fr)); gap:12px; margin:16px 0; }
  .kpi-card { background:#1e293b; border:1px solid #374151; border-radius:8px; padding:14px 16px; text-align:center; }
  .kpi-val  { font-size:28px; font-weight:700; color:#60a5fa; }
  .kpi-lbl  { font-size:11px; color:#6b7280; text-transform:uppercase; margin-top:4px; }
  .cred-row-high { background:rgba(239,68,68,.06); }
  .cred-row-med  { background:rgba(245,158,11,.04); }
  @media print {
    body { background: #fff; color: #000; }
    .container { max-width: 100%; padding: 16px; }
    .page-break { page-break-before: always; }
    .cover { border-bottom: 2px solid #000; }
    table { font-size: 11px; }
  }
`;

// ─── Report assembly ────────────────────────────────────────────────────────────
async function buildDtiEstesoReport(
  adminClient: ReturnType<typeof createClient>,
  orgId: string,
  scanRunId: string | null,
): Promise<{ html: string; json: Record<string, unknown> }> {
  const genAt = new Date().toISOString();

  // ── 1. Org info ────────────────────────────────────────────────────────────
  const { data: orgRow } = await adminClient
    .from('organizations' as any)
    .select('id, name, code')
    .eq('id', orgId)
    .maybeSingle();
  const orgName = String((orgRow as any)?.name || orgId.slice(0, 8));

  // ── 2. Scope: selectors + monitored IPs ───────────────────────────────────
  const [selectorsRes, monitoredRes] = await Promise.all([
    adminClient.from('darkrisk_selectors' as any)
      .select('selector_type, normalized_value, status')
      .eq('organization_id', orgId)
      .in('status', ['approved', 'candidate'])
      .order('selector_type'),
    adminClient.from('surface_scan_monitored_ips' as any)
      .select('entry_type, input_value')
      .eq('organization_id', orgId),
  ]);
  const selectors = ((selectorsRes.data || []) as any[]);
  const monitored = ((monitoredRes.data || []) as any[]);
  const scopeDomains = Array.from(new Set([
    ...selectors.filter((s) => s.selector_type === 'domain' || s.selector_type === 'wildcard_domain').map((s) => String(s.normalized_value || '')),
    ...monitored.filter((m) => m.entry_type === 'domain').map((m) => String(m.input_value || '')),
  ].filter(Boolean)));
  const scopeEmails = selectors.filter((s) => s.selector_type === 'email').map((s) => String(s.normalized_value || '')).filter(Boolean);
  const scopeIps = monitored.filter((m) => m.entry_type === 'single' && /^(\d{1,3}\.){3}\d{1,3}$/.test(m.input_value)).map((m) => m.input_value);

  // ── 3. Latest scan run ─────────────────────────────────────────────────────
  const { data: scanRunRow } = await adminClient
    .from('darkrisk_scan_runs' as any)
    .select('id, status, started_at, completed_at, stats, trigger_type')
    .eq('organization_id', orgId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const scanRun = (scanRunRow as any) || null;
  const runStats = (scanRun?.stats as any) || {};
  const intelxStats = (runStats?.intelx as any) || {};

  // ── 4. DNS data ────────────────────────────────────────────────────────────
  const { data: dnsResultsRaw } = await adminClient
    .from('surface_dns_lookup_results' as any)
    .select('id, domain, score, grade, records, additional_records, summary, scanned_at')
    .eq('organization_id', orgId)
    .order('scanned_at', { ascending: false })
    .limit(100);
  const dnsResults = (dnsResultsRaw || []) as any[];

  // Latest DNS result per domain
  const dnsPerDomain = new Map<string, any>();
  for (const dr of dnsResults) {
    const d = String(dr.domain || '').toLowerCase();
    if (!dnsPerDomain.has(d)) dnsPerDomain.set(d, dr);
  }

  // DNS findings
  const dnsResultIds = [...new Set(dnsResults.map((dr) => dr.id))];
  const { data: dnsFindingsRaw } = dnsResultIds.length > 0
    ? await adminClient.from('surface_dns_lookup_findings' as any)
        .select('domain, finding_key, category, severity, status, title, description, recommendation')
        .in('dns_lookup_result_id', dnsResultIds)
        .in('status', ['fail', 'warn'])
        .order('severity')
        .limit(500)
    : { data: [] };
  const dnsFindings = (dnsFindingsRaw || []) as any[];

  // DNS findings per domain
  const dnsFindingsPerDomain = new Map<string, any[]>();
  for (const f of dnsFindings) {
    const d = String(f.domain || '').toLowerCase();
    if (!dnsFindingsPerDomain.has(d)) dnsFindingsPerDomain.set(d, []);
    dnsFindingsPerDomain.get(d)!.push(f);
  }

  // ── 5. Port data (from Shodan) ─────────────────────────────────────────────
  const { data: portsRaw } = await adminClient
    .from('surface_open_ports' as any)
    .select('host, ip, port, protocol, state, service_name, service_product, service_version, is_web, is_tls, exposure_level, source')
    .eq('customer_id', orgId)
    .order('exposure_level', { ascending: false })
    .limit(500);
  const ports = (portsRaw || []) as any[];

  // ── 6. Shodan history (latest) ─────────────────────────────────────────────
  const { data: shodanHistory } = await adminClient
    .from('surface_scan_history' as any)
    .select('assets_snapshot, total_assets, critical_count, avg_score, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const shodanAssets = ((shodanHistory as any)?.assets_snapshot || []) as any[];

  // ── 7. Surface findings ────────────────────────────────────────────────────
  const { data: surfaceFindingsRaw } = await adminClient
    .from('surface_findings' as any)
    .select('severity, title, finding_type, module, affected_asset, created_at')
    .or(`customer_id.eq.${orgId},organization_id.eq.${orgId}`)
    .in('status', ['open', 'new', 'confirmed'])
    .order('created_at', { ascending: false })
    .limit(200);
  const surfaceFindings = (surfaceFindingsRaw || []) as any[];

  // ── 8. IntelX findings ─────────────────────────────────────────────────────
  const { data: intelxFindingsRaw } = await adminClient
    .from('darkrisk_findings' as any)
    .select('id, finding_type, title, description, severity, confidence, risk_score, first_seen_at, last_seen_at, metadata')
    .eq('organization_id', orgId)
    .ilike('finding_type', '%intelx%')
    .order('risk_score', { ascending: false })
    .limit(200);
  const intelxFindings = (intelxFindingsRaw || []) as any[];

  // ── 9. Source runs (query stats) ───────────────────────────────────────────
  const { data: sourceRunsRaw } = await adminClient
    .from('darkrisk_dti_source_runs' as any)
    .select('source, source_label, source_key, query_kind, query_term, asset_scope, status, result_count, metadata, completed_at')
    .eq('organization_id', orgId)
    .order('completed_at', { ascending: false })
    .limit(500);
  const sourceRuns = (sourceRunsRaw || []) as any[];

  // Aggregate by source_kind
  const sourceKindCounts = new Map<string, number>();
  const sourceKindFileTypes = new Map<string, number>();
  for (const run of sourceRuns) {
    const sk = String(run.source_label || run.source_key || run.source || '');
    if (run.result_count > 0) {
      sourceKindCounts.set(sk, (sourceKindCounts.get(sk) || 0) + Number(run.result_count || 0));
    }
  }

  // ── 10. Credential / sensitive hits ───────────────────────────────────────
  // Join with source records for collection title + date
  const { data: sensitiveHitsRaw } = await adminClient
    .from('darkrisk_dti_sensitive_hits' as any)
    .select(`
      id, tag, masked_value, clear_value, context_excerpt,
      query_term, asset_scope, source_label, query_kind,
      source_record_id, created_at
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1500);
  const sensitiveHits = (sensitiveHitsRaw || []) as any[];

  // Gather source_record_ids and fetch titles/dates
  const srIds = [...new Set(sensitiveHits.map((h) => h.source_record_id).filter(Boolean))];
  const sourceRecordMap = new Map<string, { title: string; source_date: string }>();
  if (srIds.length > 0) {
    const { data: srRows } = await adminClient
      .from('darkrisk_source_records' as any)
      .select('id, title, source_date, source_added_at, extraction_source')
      .in('id', srIds.slice(0, 1000));
    for (const r of (srRows || []) as any[]) {
      sourceRecordMap.set(String(r.id), {
        title: String(r.title || '—'),
        source_date: String(r.source_date || r.source_added_at || ''),
      });
    }
  }

  // Enrich hits with source record data
  const enrichedHits = sensitiveHits.map((h) => {
    const sr = sourceRecordMap.get(String(h.source_record_id || '')) || { title: '—', source_date: '' };
    return { ...h, collection_title: sr.title, data_collection: sr.source_date };
  });

  // Group credentials by domain/asset_scope
  const credsByDomain = new Map<string, any[]>();
  for (const h of enrichedHits) {
    const scope = String(h.asset_scope || h.query_term || 'unknown').toLowerCase();
    if (!credsByDomain.has(scope)) credsByDomain.set(scope, []);
    credsByDomain.get(scope)!.push(h);
  }

  // Count total by tag
  const tagCounts: Record<string, number> = {};
  for (const h of enrichedHits) {
    const t = String(h.tag || 'unknown');
    tagCounts[t] = (tagCounts[t] || 0) + 1;
  }

  // Stealer logs detection
  const stealerHits = enrichedHits.filter((h) =>
    /stealer|autofill|infostealer|log.*machine|browser/i.test(h.context_excerpt || '') ||
    /leaks.*logs|logs.*leaks/i.test(h.source_label || '') ||
    h.query_kind === 'leaks_log' ||
    /\[sk\]|\[it\]|\[us\]|\[ng\]|freelog|chrome.*profile|autofill/i.test(h.collection_title || '')
  );

  // ── 11. Build JSON payload ─────────────────────────────────────────────────
  const json = {
    generated_at: genAt,
    organization_id: orgId,
    organization_name: orgName,
    scan_run_id: scanRunId,
    scope: { domains: scopeDomains, emails: scopeEmails, ips: scopeIps },
    intelx_stats: intelxStats,
    tag_counts: tagCounts,
    source_kind_counts: Object.fromEntries(sourceKindCounts),
    stealer_count: stealerHits.length,
    total_creds: enrichedHits.filter((h) => h.tag === 'passwords').length,
  };

  // ── 12. Build HTML ─────────────────────────────────────────────────────────
  const domainsToAnalyze = scopeDomains.length > 0 ? scopeDomains : ['(nessun dominio in scope)'];

  // ── Section: per-domain DNS + findings ────────────────────────────────────
  const perDomainSections = domainsToAnalyze.map((domain) => {
    const dns = dnsPerDomain.get(domain.toLowerCase());
    const dnsRecs = (dns?.records as any) || {};
    const addRecs = (dns?.additional_records as any) || {};
    const dnsGrade = dns?.grade || 'N/D';
    const findings = dnsFindingsPerDomain.get(domain.toLowerCase()) || [];
    const domainPorts = ports.filter((p) => p.host === domain || p.host?.includes(domain));
    const domainCreds = credsByDomain.get(domain.toLowerCase()) || credsByDomain.get(`@${domain.toLowerCase()}`) || [];
    const domainSourceRuns = sourceRuns.filter((r) => String(r.asset_scope || r.query_term || '').toLowerCase().includes(domain.toLowerCase()));

    // DNS records table
    const dnsRows: string[][] = [];
    const addDnsRow = (ttl: string, type: string, value: string) => dnsRows.push([ttl, type, value]);

    if (dns) {
      const aRecs = Array.isArray(dnsRecs.A) ? dnsRecs.A : (dnsRecs.A ? [dnsRecs.A] : []);
      aRecs.forEach((v: string) => addDnsRow('24h', 'A', v));
      const mxRecs = Array.isArray(dnsRecs.MX) ? dnsRecs.MX : [];
      mxRecs.forEach((m: any) => addDnsRow('1h', 'MX', `${m.exchange || m} (${m.priority ?? '?'})`));
      const nsRecs = Array.isArray(dnsRecs.NS) ? dnsRecs.NS : [];
      nsRecs.forEach((v: string) => addDnsRow('24h', 'NS', v));
      const txtRecs = Array.isArray(dnsRecs.TXT) ? dnsRecs.TXT : [];
      txtRecs.forEach((v: any) => addDnsRow('24h', 'TXT', String(v).slice(0, 120)));
      const spf = addRecs.SPF || dnsRecs.SPF;
      if (spf) addDnsRow('1h', 'SPF', String(spf).slice(0, 120));
      const dmarc = addRecs.DMARC || dnsRecs.DMARC;
      if (dmarc) addDnsRow('1h', 'DMARC', String(dmarc).slice(0, 120));
      const dkim = addRecs.DKIM || dnsRecs.DKIM;
      if (dkim) addDnsRow('1h', 'DKIM', dkim === null ? 'Non trovato' : String(dkim).slice(0, 100));
    }

    // Email security analysis
    const emailFindings = findings.filter((f) => f.category === 'email_security' || f.category === 'dmarc' || f.category === 'spf' || f.category === 'smtp');
    const dnsHealthFindings = findings.filter((f) => f.category === 'dns_health' || f.category === 'dnssec');

    // SPF/DKIM/DMARC status from DNS records
    const spfPresent = !!(addRecs.SPF || dnsRecs.SPF || (Array.isArray(dnsRecs.TXT) && dnsRecs.TXT.some((t: string) => /^v=spf1/i.test(t))));
    const dmarcPresent = !!(addRecs.DMARC || dnsRecs.DMARC);
    const dmarcValue = String(addRecs.DMARC || dnsRecs.DMARC || '');
    const dmarcEnforced = /p=(quarantine|reject)/i.test(dmarcValue);
    const dkimStatus = (addRecs.DKIM !== undefined && addRecs.DKIM !== null) ? 'Presente' : 'Non verificato';
    const emailProtectionPct = Math.round(
      (spfPresent ? 30 : 0) + (dmarcPresent ? (dmarcEnforced ? 40 : 20) : 0) + (dkimStatus === 'Presente' ? 30 : 0)
    );

    // Source stats for this domain
    const totalResults = domainSourceRuns.reduce((s: number, r: any) => s + Number(r.result_count || 0), 0);
    const searchResults = domainSourceRuns.filter((r: any) => r.query_kind === 'at_domain_tld' || r.query_kind === 'selector').reduce((s: number, r: any) => s + Number(r.result_count || 0), 0);
    const leaksResults = domainSourceRuns.filter((r: any) => r.source_label?.includes('Leaks') || r.query_kind === 'email_selector').reduce((s: number, r: any) => s + Number(r.result_count || 0), 0);
    const phonebookResults = domainSourceRuns.filter((r: any) => r.source_label?.includes('Phonebook')).reduce((s: number, r: any) => s + Number(r.result_count || 0), 0);

    const credsByTag: Record<string, number> = {};
    for (const h of domainCreds) {
      credsByTag[h.tag] = (credsByTag[h.tag] || 0) + 1;
    }

    return `
    <div class="page-break">
      <h2 style="color:#60a5fa;border-bottom:2px solid #1e3a5f;padding-bottom:8px;margin-bottom:16px">${escHtml(domain)}</h2>

      ${subsection('Inventario DNS', `
        ${dns
          ? `<p>Grading sicurezza DNS: ${dnsGrade === 'A' || dnsGrade === 'B' ? `<span class="badge badge-ok">${dnsGrade}</span>` : `<span class="badge badge-${dnsGrade === 'C' ? 'med' : 'high'}">${dnsGrade}</span>`} &nbsp; Score: ${dns.score}/100 &nbsp; <em style="color:#6b7280">Rilevato: ${fmtDate(dns.scanned_at)}</em></p>`
          : `<div class="callout warn"><p class="callout-title">DNS non scansionato</p><p>Nessun risultato di scansione DNS disponibile per questo dominio. Avviare una scansione SurfaceScan360 per ottenere i dati.</p></div>`}
        ${table(['TTL', 'Tipo', 'Valore'], dnsRows.length > 0 ? dnsRows : [['—', '—', 'Nessun record disponibile']])}
      `)}

      ${emailFindings.length > 0 || !dns ? subsection('Email Security — Problemi Rilevati', `
        ${table(
          ['Categoria', 'Risultato', 'Severità', 'Raccomandazione operativa'],
          emailFindings.length > 0
            ? emailFindings.map((f: any) => [
                f.category || '—',
                f.title || '—',
                f.severity?.toUpperCase() || '—',
                f.recommendation || '—',
              ])
            : [['—', 'Nessun problema rilevato', 'INFO', '—']]
        )}
        <br>
        ${table(
          ['Protocollo', 'Status', 'Implementazione'],
          [
            ['SPF', spfPresent ? 'Presente' : 'Assente', String(addRecs.SPF || dnsRecs.SPF || (Array.isArray(dnsRecs.TXT) ? dnsRecs.TXT.find((t: string) => /^v=spf1/i.test(t)) || '—' : '—')).slice(0, 120)],
            ['DKIM', dkimStatus, dkimStatus === 'Presente' ? 'Verificato' : 'Non verificato (richiede query selector)'],
            ['DMARC', dmarcPresent ? (dmarcEnforced ? 'Presente (enforcement)' : 'Presente (monitor)') : 'Assente', dmarcValue.slice(0, 100) || 'Nessun record DMARC trovato'],
            ['MTA-STS', 'Non rilevato', 'Verificare record _mta-sts e policy HTTPS'],
          ]
        )}
        <div class="callout ${emailProtectionPct >= 70 ? 'ok' : emailProtectionPct >= 40 ? 'warn' : ''}">
          <p class="callout-title">Livello Protezione Email (indicativo): ${emailProtectionPct}%</p>
          <p>Basato su: SPF ${spfPresent ? '✓' : '✗'}, DKIM ${dkimStatus === 'Presente' ? '✓' : '—'}, DMARC ${dmarcPresent ? (dmarcEnforced ? '✓ (enforcement)' : '⚠ (monitor)') : '✗'}, MTA-STS non rilevato.</p>
        </div>
      `) : ''}

      ${dnsHealthFindings.length > 0 ? subsection('DNS Health', `
        ${table(
          ['Categoria', 'Titolo', 'Severità', 'Raccomandazione'],
          dnsHealthFindings.map((f: any) => [f.category || '—', f.title || '—', f.severity || '—', f.recommendation?.slice(0, 100) || '—'])
        )}
      `) : ''}

      ${domainPorts.length > 0 ? subsection('Porte Aperte (Shodan)', `
        ${table(
          ['Porta', 'Protocollo', 'Servizio', 'Versione', 'Web', 'TLS', 'Esposizione'],
          domainPorts.map((p: any) => [
            String(p.port || '—'),
            String(p.protocol || 'tcp'),
            String(p.service_name || p.service_product || '—'),
            String(p.service_version || '—'),
            p.is_web ? 'Sì' : 'No',
            p.is_tls ? 'Sì' : 'No',
            String(p.exposure_level || '—').toUpperCase(),
          ])
        )}
      `) : ''}

      ${subsection('DTI: Rilevazioni IntelX', `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-val">${totalResults}</div><div class="kpi-lbl">Totale risultati</div></div>
          <div class="kpi-card"><div class="kpi-val">${searchResults}</div><div class="kpi-lbl">Search API</div></div>
          <div class="kpi-card"><div class="kpi-val">${leaksResults}</div><div class="kpi-lbl">Leaks API</div></div>
          <div class="kpi-card"><div class="kpi-val">${phonebookResults}</div><div class="kpi-lbl">Phonebook</div></div>
          <div class="kpi-card"><div class="kpi-val" style="color:${credsByTag.passwords > 0 ? '#ef4444' : '#10b981'}">${credsByTag.passwords || 0}</div><div class="kpi-lbl">Password esposte</div></div>
          <div class="kpi-card"><div class="kpi-val">${domainCreds.length}</div><div class="kpi-lbl">Hit sensibili totali</div></div>
        </div>
        ${domainSourceRuns.length > 0 ? table(
          ['Sorgente', 'Query Kind', 'Query Term', 'Risultati', 'Status'],
          domainSourceRuns.slice(0, 30).map((r: any) => [
            r.source_label || r.source || '—',
            r.query_kind || '—',
            String(r.query_term || '—').slice(0, 60),
            String(r.result_count || 0),
            r.status || '—',
          ])
        ) : '<p style="color:#6b7280">Nessuna query eseguita per questo dominio.</p>'}
      `)}

      ${domainCreds.filter((h: any) => h.tag === 'passwords').length > 0 ? subsection('Password in chiaro rilevate', `
        <div class="callout">
          <p class="callout-title">⚠ Dati sensibili — riservato. Mostrare solo a personale autorizzato.</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0">
          <thead>
            <tr>
              <th style="padding:8px 10px;background:#1e3a5f;color:#93c5fd;border:1px solid #374151;text-align:left;font-size:11px">Collection Title</th>
              <th style="padding:8px 10px;background:#1e3a5f;color:#93c5fd;border:1px solid #374151;text-align:left;font-size:11px">Data Collection</th>
              <th style="padding:8px 10px;background:#1e3a5f;color:#93c5fd;border:1px solid #374151;text-align:left;font-size:11px">Stringa Trovata</th>
              <th style="padding:8px 10px;background:#1e3a5f;color:#93c5fd;border:1px solid #374151;text-align:left;font-size:11px;width:40px">Ris.</th>
              <th style="padding:8px 10px;background:#1e3a5f;color:#93c5fd;border:1px solid #374151;text-align:left;font-size:11px">Note</th>
            </tr>
          </thead>
          <tbody>
            ${domainCreds.filter((h: any) => h.tag === 'passwords').slice(0, 200).map((h: any) => `
              <tr class="${/saintsrow|password|123456|qwerty|admin|presezzi/i.test(h.masked_value || h.clear_value || '') ? 'cred-row-high' : 'cred-row-med'}">
                <td style="padding:5px 10px;border:1px solid #374151;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(h.collection_title)}">${escHtml((h.collection_title || '—').slice(0, 70))}</td>
                <td style="padding:5px 10px;border:1px solid #374151;white-space:nowrap">${fmtDate(h.data_collection)}</td>
                <td style="padding:5px 10px;border:1px solid #374151;font-family:monospace;font-size:11px">${escHtml(h.clear_value || h.masked_value || '—')}</td>
                <td style="padding:5px 10px;border:1px solid #374151;text-align:center">1</td>
                <td style="padding:5px 10px;border:1px solid #374151;font-size:11px;color:#94a3b8">${escHtml((h.context_excerpt || '').slice(0, 80))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${domainCreds.filter((h: any) => h.tag === 'passwords').length > 200 ? `<p style="color:#6b7280;font-style:italic">Mostrate 200 di ${domainCreds.filter((h: any) => h.tag === 'passwords').length} credenziali.</p>` : ''}
      `) : ''}

      ${stealerHits.filter((h: any) => String(h.asset_scope || h.query_term || '').toLowerCase().includes(domain.toLowerCase())).length > 0 ? subsection('DTI Finding — Stealer Log', `
        <div class="callout">
          <p class="callout-title">Evidenza Stealer Log Rilevata</p>
          <p>Dati esfiltrati da browser compromessi (Chrome/Edge/Opera) rilevati in questo dominio. Struttura tipica malware infostealer (Redline, Vidar, Lumma, MetaStealer).</p>
        </div>
        ${table(
          ['Collection', 'Data', 'Tipo dato', 'Contesto'],
          stealerHits
            .filter((h: any) => String(h.asset_scope || h.query_term || '').toLowerCase().includes(domain.toLowerCase()))
            .slice(0, 20)
            .map((h: any) => [
              (h.collection_title || '—').slice(0, 60),
              fmtDate(h.data_collection),
              String(h.tag || '—'),
              (h.context_excerpt || '—').slice(0, 100),
            ])
        )}
      `) : ''}
    </div>`;
  }).join('');

  // ── Section: Surface findings ──────────────────────────────────────────────
  const surfaceSec = surfaceFindings.length > 0
    ? table(
        ['Severità', 'Tipo', 'Titolo', 'Asset', 'Data'],
        surfaceFindings.slice(0, 100).map((f: any) => [
          (f.severity || '—').toUpperCase(),
          String(f.finding_type || f.module || '—').slice(0, 30),
          String(f.title || '—').slice(0, 80),
          String(f.affected_asset || '—').slice(0, 40),
          fmtDate(f.created_at),
        ])
      )
    : '<p style="color:#6b7280">Nessun finding SurfaceScan attivo.</p>';

  // ── Section: IntelX findings ───────────────────────────────────────────────
  const intelxSec = intelxFindings.length > 0
    ? table(
        ['Severità', 'Tipo', 'Titolo', 'Confidenza', 'Score', 'Prima vista'],
        intelxFindings.slice(0, 100).map((f: any) => [
          (f.severity || '—').toUpperCase(),
          String(f.finding_type || '—').replace('intelx_', '').replace(/_/g, ' '),
          String(f.title || '—').slice(0, 80),
          String(f.confidence || '—'),
          String(f.risk_score ?? '—'),
          fmtDate(f.first_seen_at),
        ])
      )
    : '<p style="color:#6b7280">Nessun finding IntelX disponibile.</p>';

  // ── Recommendations ────────────────────────────────────────────────────────
  const hasHighCreds = (tagCounts.passwords || 0) > 0;
  const hasDmarcIssue = dnsFindings.some((f: any) => /dmarc/i.test(f.finding_key || f.category || ''));
  const hasOpenPorts = ports.some((p: any) => p.exposure_level === 'high' || p.exposure_level === 'critical');

  const recsImmediate = [
    hasHighCreds ? '🔴 Forzare reset password immediato per tutti gli account presenti nei leak. Verificare con l\'utente le password esposte e bloccare quelle riutilizzabili.' : null,
    hasHighCreds ? '🔴 Abilitare Multi-Factor Authentication (MFA) obbligatoria per tutti gli accessi esterni (Microsoft 365, VPN, portali applicativi).' : null,
    hasHighCreds ? '🔴 Revocare sessioni attive e token OAuth compromessi per gli utenti esposti.' : null,
    hasHighCreds ? '🔴 Implementare blocklist di password (HIBP o policy interna) per impedire utilizzo di password note compromesse.' : null,
    hasOpenPorts ? '🔴 Verificare e chiudere o limitare le porte di gestione esposte (FTP/22/8080) — consentire solo da IP autorizzati o VPN.' : null,
  ].filter(Boolean) as string[];

  const recs30d = [
    hasDmarcIssue ? 'Avviare rollout DMARC verso p=quarantine (→ p=reject): configurare reporting RUA/RUF, validare SPF con max 10 DNS lookup, abilitare DKIM.' : null,
    hasOpenPorts ? 'Hardening TLS su tutti i servizi web: abilitare HSTS, CSP, X-Frame-Options; aggiornare cipher suite; risolvere certificate mismatch.' : null,
    'Audit delle liste email aziendali nei database di leak pubblici: monitoraggio continuo (alerting su nuove esposizioni).' ,
    'Separare i domini collaterali su host/IP differenti per ridurre il blast radius in caso di compromissione.',
    'Implementare Conditional Access Policy per accessi geo-anomali o da device non conformi.',
  ].filter(Boolean) as string[];

  const recs90d = [
    'Implementare monitoraggio continuo e alerting su variazioni DNS, nuovi servizi esposti e nuove evidenze di reputazione negativa.',
    'Applicare processo di secure configuration management (CIS Benchmark per server Linux/web).',
    'Scan autenticato periodico su stack web (CMS/framework/librerie JS) per rilevare vulnerabilità applicative.',
    'Policy aziendale di non memorizzare credenziali nei browser (autofill) — comunicare ai partner EDR/anti-malware aggiornati per ridurre infostealer.',
    'Revisione periodicaMX/SPF/DKIM/DMARC report su tutti i domini del gruppo per rilevare anomalie di deliverability o spoofing.',
  ];

  // ── Final HTML assembly ────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DTI Esteso — ${escHtml(orgName)}</title>
  <style>${CSS}</style>
</head>
<body>
<div class="container">

  <!-- COVER -->
  <div class="cover">
    <div style="font-size:13px;color:#6b7280;margin-bottom:8px">HiSolution Srl · support@hisolution.it</div>
    <h1>Domain Threat Intelligence</h1>
    <div class="subtitle">Report DTI Esteso</div>
    <div class="client">${escHtml(orgName)}</div>
    <div style="color:#6b7280;font-size:13px;margin-top:8px">Generato il: ${fmtDateTime(genAt)}</div>
    <div style="margin-top:16px">
      <span class="badge badge-high" style="padding:4px 16px;font-size:13px">RISERVATO</span>
    </div>
  </div>

  <!-- METADATA TABLE -->
  <table class="meta-table">
    <tr><td>Nome del Prodotto / Servizio</td><td>DarkRisk360 Estesa — Domain Threat Intelligence</td></tr>
    <tr><td>Tipologia Documento</td><td>Relazione Domain Threat Intelligence</td></tr>
    <tr><td>Stato del documento</td><td>Generato automaticamente</td></tr>
    <tr><td>Data generazione</td><td>${fmtDateTime(genAt)}</td></tr>
    <tr><td>Proprietario del documento</td><td>HiSolution Srl</td></tr>
    <tr><td>Cliente</td><td>${escHtml(orgName)}</td></tr>
    <tr><td>Scan Run ID</td><td>${scanRunId || '—'}</td></tr>
    ${scanRun ? `<tr><td>Ultima run</td><td>${fmtDateTime(scanRun.started_at)} → ${fmtDateTime(scanRun.completed_at)} [${scanRun.status}]</td></tr>` : ''}
  </table>

  <!-- TOC -->
  <div class="toc">
    <h2>Indice del Documento</h2>
    <ol>
      <li>Accordo di Servizio & Premessa</li>
      <li>Scope of Work — OSINT / CLOSINT</li>
      <li>Perimetro Concordato (${scopeDomains.length} domini, ${scopeEmails.length} email)</li>
      <li>Analisi per Dominio — DNS, Email Security, Infrastruttura</li>
      <li>DTI: Credenziali & Leak (${(tagCounts.passwords || 0)} password, ${enrichedHits.length} hit totali)</li>
      <li>Stealer Log Findings (${stealerHits.length} evidenze)</li>
      <li>Surface Scan Findings (${surfaceFindings.length} findings)</li>
      <li>IntelX Findings (${intelxFindings.length} findings)</li>
      <li>Raccomandazioni Operative</li>
    </ol>
  </div>

  <!-- SECTION 1: SERVICE AGREEMENT -->
  ${section('1. Accordo di Servizio — DTI', `
    ${para('Il <strong>Cliente</strong> incarica il <strong>Fornitore</strong> (HiSolution s.r.l.) di condurre un security <strong>Domain Threat Intelligence</strong> sui domini indicati nel perimetro concordato.')}
    ${para('Il servizio <strong>DTI (Domain Threat Intelligence)</strong> effettua un\'analisi approfondita di fonti OSINT e di esposizioni note relative a domini aziendali e asset digitali. Oltre alla raccolta passiva di informazioni pubbliche (DNS, WHOIS, certificati, ecc.), il servizio sfrutta tool di intelligence specialistici per individuare credenziali compromesse, configurazioni malevoli o campagne di spoofing legate ai domini aziendali.')}
    <div class="callout info">
      <p class="callout-title">Classificazione documento</p>
      <p>Pubblico ○ &nbsp;·&nbsp; Privato ○ &nbsp;·&nbsp; <strong>Confidenziale ●</strong></p>
      <p style="margin-top:8px">Il seguente rapporto contiene informazioni riservate. Non distribuire senza autorizzazione.</p>
    </div>
  `)}

  <!-- SECTION 2: SCOPE OF WORK -->
  ${section('2. Scope of Work — Obiettivo DTI', `
    <p style="color:#d1d5db;margin-bottom:12px"><strong>OSINT (Open Source Intelligence)</strong> — Raccolta strutturata di informazioni da fonti pubbliche: DNS, WHOIS, certificati TLS, subdomain enumeration, feed di threat intelligence.</p>
    <p style="color:#d1d5db;margin-bottom:12px"><strong>CLOSINT (Close Source Intelligence)</strong> — Raccolta da fonti chiuse: database di credenziali compromesse (IntelX Search API, Leaks API), stealer log, dark web collections.</p>
    ${ul([
      'Individuare sottodomini e asset digitali associati ai domini target',
      'Rilevare credenziali compromesse presenti nel surface web, dark web e deep web',
      'Identificare configurazioni DNS malevoli e anomalie di sicurezza email (SPF/DKIM/DMARC)',
      'Analizzare la superficie di attacco e valutare il livello di esposizione',
      'Determinare il potenziale impatto su Riservatezza, Integrità e Disponibilità',
    ])}
  `)}

  <!-- SECTION 3: SCOPE CONCORDATO -->
  ${section('3. Perimetro Concordato', `
    ${table(
      ['ID', 'URL o Indirizzo IP', 'Tipo'],
      [
        ...scopeDomains.map((d, i) => [String(i + 1), d, 'Dominio']),
        ...scopeIps.map((ip, i) => [String(scopeDomains.length + i + 1), ip, 'IP']),
      ]
    )}
    ${scopeEmails.length > 0 ? `
      <br>
      <strong style="color:#93c5fd">Email identity in scope (IntelX Leaks):</strong>
      ${ul(scopeEmails.slice(0, 20))}
    ` : ''}
  `)}

  <!-- SECTION 4: PER-DOMAIN ANALYSIS -->
  ${section('4. Analisi per Dominio', '')}
  ${perDomainSections}

  <!-- SECTION 5: SURFACE SCAN FINDINGS -->
  <div class="page-break">
    ${section('5. SurfaceScan360 — Findings', surfaceSec)}
  </div>

  <!-- SECTION 6: INTELX FINDINGS -->
  ${section('6. DarkRisk360 — Findings IntelX', `
    <div class="kpi-grid">
      ${Object.entries(tagCounts).map(([tag, count]) => `
        <div class="kpi-card">
          <div class="kpi-val" style="color:${tag === 'passwords' ? '#ef4444' : '#60a5fa'}">${count}</div>
          <div class="kpi-lbl">${tag}</div>
        </div>
      `).join('')}
      <div class="kpi-card">
        <div class="kpi-val">${intelxStats.searches_run ?? '—'}</div>
        <div class="kpi-lbl">Search queries</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${intelxStats.leaks_searches_run ?? '—'}</div>
        <div class="kpi-lbl">Leaks queries</div>
      </div>
    </div>
    ${intelxSec}
  `)}

  <!-- SECTION 7: DTI RISK ASSESSMENT -->
  ${section('7. DTI: Risk Assessment', `
    ${table(
      ['Elemento', 'Valutazione'],
      [
        ['Leak di credenziali', (tagCounts.passwords || 0) > 5 ? 'ALTO' : (tagCounts.passwords || 0) > 0 ? 'MEDIO' : 'BASSO'],
        ['Stealer log implicazioni', stealerHits.length > 0 ? 'MEDIO' : 'BASSO'],
        ['Credential reuse/weak patterns', (tagCounts.passwords || 0) > 0 ? 'ALTO' : 'BASSO'],
        ['Esposizione infrastrutturale', ports.filter((p: any) => p.exposure_level === 'high' || p.exposure_level === 'critical').length > 0 ? 'ALTO' : 'MEDIO'],
        ['Email security posture', hasDmarcIssue ? 'MEDIO' : 'BASSO'],
        ['Cross-domain leakage', scopeDomains.length > 1 ? 'MEDIO' : 'BASSO'],
      ]
    )}
    <div class="callout ${(tagCounts.passwords || 0) > 5 ? '' : 'warn'}">
      <p class="callout-title">Threat Score complessivo: ${(tagCounts.passwords || 0) > 5 ? 'ALTO' : (tagCounts.passwords || 0) > 0 ? 'MEDIO' : 'BASSO'}</p>
      <p>Basato su ${enrichedHits.length} evidenze sensibili, ${intelxFindings.length} findings IntelX, ${surfaceFindings.length} findings SurfaceScan.</p>
    </div>
  `)}

  <!-- SECTION 8: RECOMMENDATIONS -->
  <div class="page-break">
    ${section('8. Raccomandazioni Operative DTI', `
      <h3 style="color:#ef4444;margin:16px 0 8px">Priorità IMMEDIATA (0–7 giorni)</h3>
      ${ul(recsImmediate.length > 0 ? recsImmediate : ['Nessuna azione critica immediata identificata.'])}

      <h3 style="color:#d97706;margin:20px 0 8px">Priorità 30 giorni</h3>
      ${ul(recs30d)}

      <h3 style="color:#2563eb;margin:20px 0 8px">Priorità 90 giorni</h3>
      ${ul(recs90d)}
    `)}
  </div>

  <!-- FOOTER -->
  <div style="margin-top:48px;padding-top:16px;border-top:1px solid #374151;text-align:center;color:#4b5563;font-size:12px">
    <p>DarkRisk360 DTI Esteso · HiSolution Srl · support@hisolution.it · Via Della Canapiglia 5, Vecchiano (PI)</p>
    <p>Generato automaticamente il ${fmtDateTime(genAt)} · Classificazione: RISERVATO</p>
  </div>

</div>
</body>
</html>`;

  return { html, json };
}

// ─── Main handler ───────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  // Auth: internal secret, service role bearer, db_trigger_id nonce, o user JWT
  const internalSecretHeader = req.headers.get('x-darkrisk-internal-secret') || req.headers.get('x-darkrisk-esteso-cron-secret');
  const isTrustedInternal = Boolean(INTERNAL_SECRET && internalSecretHeader === INTERNAL_SECRET);

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return jsonResponse({ ok: false, error: 'Supabase credentials not configured' }, 503);
  }

  const body = await req.json().catch(() => ({}));
  const orgId = String(body?.customer_id || body?.organization_id || '').trim();
  const scanRunId = String(body?.scan_run_id || '').trim() || null;
  const dbTriggerId = String(body?.db_trigger_id || '').trim();

  if (!isTrustedInternal) {
    const authHeader = req.headers.get('Authorization') || '';
    const bearerKey = authHeader.replace(/^Bearer\s+/i, '').trim();
    const isTrustedService = Boolean(SERVICE_ROLE && bearerKey === SERVICE_ROLE);

    // db_trigger_id: nonce one-shot su darkrisk360_scan_triggers (inserito via SQL con service_role)
    let isTrustedDbNonce = false;
    if (!isTrustedService && dbTriggerId) {
      const adminClientCheck = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
      const { data: nonceRow } = await adminClientCheck
        .from('darkrisk360_scan_triggers' as any)
        .select('id, status, organization_id')
        .eq('id', dbTriggerId)
        .eq('status', 'pending')
        .maybeSingle();
      if (nonceRow && (!orgId || String((nonceRow as any).organization_id) === orgId)) {
        isTrustedDbNonce = true;
        // Consuma il nonce
        await adminClientCheck
          .from('darkrisk360_scan_triggers' as any)
          .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
          .eq('id', dbTriggerId);
      }
    }

    if (!isTrustedService && !isTrustedDbNonce) {
      // Check user JWT
      const anonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
      const userClient = createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
    }
  }

  if (!orgId) return jsonResponse({ ok: false, error: 'customer_id required' }, 400);

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const { html, json } = await buildDtiEstesoReport(adminClient, orgId, scanRunId);

    // Store in Supabase Storage
    const bucketName = 'darkrisk-reports';
    const now = new Date();
    const dateSlug = now.toISOString().slice(0, 10).replace(/-/g, '');
    const htmlPath = `${orgId}/dti-esteso-${dateSlug}-${Date.now()}.html`;
    const jsonPath = `${orgId}/dti-esteso-${dateSlug}-${Date.now()}.json`;

    const [htmlUpload, jsonUpload] = await Promise.all([
      adminClient.storage.from(bucketName).upload(htmlPath, html, {
        contentType: 'text/html; charset=utf-8',
        upsert: true,
      }),
      adminClient.storage.from(bucketName).upload(jsonPath, JSON.stringify(json, null, 2), {
        contentType: 'application/json',
        upsert: true,
      }),
    ]);

    if (htmlUpload.error) throw htmlUpload.error;

    // Save report snapshot — report_json è NOT NULL, passiamo il summary del json
    const { data: snapshotRow, error: snapshotErr } = await adminClient
      .from('darkrisk_report_snapshots' as any)
      .insert({
        organization_id: orgId,
        tenant_id: orgId,
        scan_run_id: scanRunId,
        title: `HiConsole - DARKRISK360 - ${String((await adminClient.from('organizations' as any).select('name').eq('id', orgId).maybeSingle()).data?.name || orgId.slice(0, 8))} - ${now.toLocaleDateString('it-IT')}`,
        tier: 'extended',
        classification: 'confidential',
        status: 'published',
        generated_at: now.toISOString(),
        html_storage_path: htmlPath,
        json_storage_path: jsonPath,
        report_json: json,
        model_metadata: { generator: 'darkrisk-dti-esteso-report', version: '1.1' },
      })
      .select('id')
      .single();

    if (snapshotErr) console.warn('[dti-esteso-report] snapshot insert failed:', snapshotErr.message);

    // Get signed URL for immediate access
    const { data: signedUrl } = await adminClient.storage
      .from(bucketName)
      .createSignedUrl(htmlPath, 3600); // 1h

    return jsonResponse({
      ok: true,
      report_id: (snapshotRow as any)?.id || null,
      html_path: htmlPath,
      signed_url: signedUrl?.signedUrl || null,
      stats: {
        domains: json.scope ? (json.scope as any).domains?.length || 0 : 0,
        creds: (json as any).total_creds || 0,
        stealer_hits: (json as any).stealer_count || 0,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dti-esteso-report] error:', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
