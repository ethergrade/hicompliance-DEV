import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from '../_shared/surface-scan-utils.ts';
import { normalizeText } from '../_shared/darkrisk-utils.ts';

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
type Confidence = 'low' | 'medium' | 'high';
type Tier = 'standard' | 'extended';
type Classification = 'public' | 'private' | 'confidential';

type FindingRow = {
  id: string;
  title: string | null;
  finding_type: string | null;
  description: string | null;
  severity: Severity | null;
  confidence: Confidence | null;
  risk_score: number | null;
  status: string | null;
  affected_asset_id: string | null;
  affected_selector_id: string | null;
  evidence_ids: string[] | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

type RecommendationRow = {
  id: string;
  finding_id: string | null;
  title: string | null;
  priority: string | null;
  why_it_matters: string | null;
  actions: unknown;
  expected_outcome: string | null;
  confidence: string | null;
  model: string | null;
  prompt_version: string | null;
  output_schema_version: string | null;
};

type AssetRow = {
  id: string;
  asset_type: string | null;
  value: string | null;
  normalized_value: string | null;
  scope_status: string | null;
};

type SelectorRow = {
  id: string;
  selector_type: string | null;
  normalized_value: string | null;
  status: string | null;
};

type EvidenceRow = {
  id: string;
  title: string | null;
  summary: string | null;
  masked_value: string | null;
};

type SourceRecordRow = {
  source: string | null;
  source_type: string | null;
  source_media: string | null;
  asset_id: string | null;
  selector_id: string | null;
};

type DtiSourceRunRow = {
  source: string | null;
  source_label: string | null;
  source_key: string | null;
  query_kind: string | null;
  query_term: string | null;
  asset_scope: string | null;
  status: string | null;
  result_count: number | null;
  warning: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
};

type DtiSensitiveHitRow = {
  source: string | null;
  source_label: string | null;
  query_kind: string | null;
  query_term: string | null;
  asset_scope: string | null;
  tag: string | null;
  masked_value: string | null;
  clear_value: string | null;
};

type ReportFinding = {
  id: string;
  title: string;
  type: string;
  severity: string;
  confidence: string;
  risk_score: number;
  affected_asset: string;
  affected_selector_masked?: string;
  first_seen_at: string;
  last_seen_at: string;
  source_names: string[];
  evidence_summary: string[];
  interpretation: string;
  status: string;
};

type ReportRecommendation = {
  finding_id: string;
  priority: 'immediate' | 'short_term' | 'mid_term' | 'long_term';
  title: string;
  why_it_matters: string;
  actions: string[];
  expected_outcome: string;
};

type DarkRiskReportJson = {
  report_id: string;
  customer_id: string;
  tier: Tier;
  classification: Classification;
  generated_at: string;
  generated_by: string;
  scan_run_id: string;
  document_metadata: {
    product_name: string;
    document_type: string;
    report_title: string;
    status: string;
    version: string;
    owner: string;
    reviewed_by?: string[];
    customer_name: string;
    hicompliance_enabled?: boolean;
  };
  scope: {
    authorized_assets: string[];
    excluded_assets: string[];
    discovered_candidate_assets: string[];
    limitations: string[];
  };
  executive_summary: {
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    risk_score: number;
    text: string;
    top_drivers: string[];
  };
  coverage: {
    surfacescan360: Record<string, unknown>;
    darkrisk360: Record<string, unknown>;
    openai: Record<string, unknown>;
  };
  findings: ReportFinding[];
  recommendations: ReportRecommendation[];
  statistics: {
    by_source: Array<{ source: string; count: number; percentage: number }>;
    by_file_type: Array<{ file_type: string; count: number; percentage: number }>;
    by_severity: Array<{ severity: string; count: number }>;
    by_finding_type: Array<{ finding_type: string; count: number }>;
  };
  dti_intelligence: {
    query_coverage: Record<string, number>;
    source_execution: Array<{ source: string; query_kind: string; query_term: string; asset_scope: string; status: string; result_count: number; note: string | null }>;
    sensitive_summary: {
      domains: number;
      passwords: number;
      addresses: number;
      credit_cards: number;
      phone_numbers: number;
      total: number;
    };
    sensitive_by_asset: Array<{
      asset_scope: string;
      domains: number;
      passwords: number;
      addresses: number;
      credit_cards: number;
      phone_numbers: number;
      total: number;
    }>;
    sensitive_samples: Array<{
      source: string;
      query_kind: string;
      query_term: string;
      asset_scope: string;
      tag: string;
      value: string;
      masked_value: string;
    }>;
    source_distribution: Array<{ source: string; count: number; percentage: number }>;
    file_distribution: Array<{ file_type: string; count: number; percentage: number }>;
  };
  appendices: Record<string, unknown>;
};

const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const INTERNAL_SECRET = Deno.env.get('DARKRISK360_INTERNAL_SECRET') || '';
const OPERATOR_SECRET = Deno.env.get('DARKRISK360_OPERATOR_SECRET') || '';
const SUPABASE_SECRET_KEYS = Deno.env.get('SUPABASE_SECRET_KEYS') || '';
const REPORT_SCHEMA_VERSION = '1.0.0';
const REPORT_NOTICE = 'Il presente documento contiene informazioni riservate. Non distribuire a soggetti non autorizzati. Le evidenze sensibili sono mascherate salvo diversa autorizzazione.';
const DARKRISK_BRAND_TITLE_HICOMPLIANCE = 'HICOMPLIANCE · DARKRISK360';
const DARKRISK_BRAND_TITLE_HICONSOLE = 'HiConsole - DARKRISK360';

const severityRank: Record<Severity, number> = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

const standardSections = [
  'Frontespizio',
  'Executive summary',
  'Perimetro monitorato',
  'Copertura controlli',
  'KPI rischio',
  'Finding principali',
  'Evidenze mascherate',
  'Raccomandazioni operative',
  'Limitazioni e note',
  'Appendice asset',
];

const extendedSections = [
  'Frontespizio',
  'Classificazione documento',
  'Accordo di servizio e scope',
  'OSINT e CLOSINT',
  'Standard HiSolution',
  'Perimetro concordato',
  'Domini collaterali e asset osservabili',
  'DNS, WHOIS/RDAP e domain health',
  'Email security',
  'Provider, hosting e blast radius',
  'Porte, servizi, TLS e tecnologie',
  'CVE e posture SurfaceScan360',
  'Contesto Domain Threat Intelligence',
  'DarkRisk360 intelligence results per data source',
  'DarkRisk360 intelligence results per file type',
  'Identity exposure e credential risk',
  'Stealer log e compromissioni indirette',
  'Risk assessment',
  'Raccomandazioni operative',
  'Appendici tecniche',
  'Glossario',
  'Limitazioni',
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function parseSecretKeySet(...rawValues: string[]): Set<string> {
  const keys = new Set<string>();
  const add = (value: unknown) => {
    const normalized = normalizeText(String(value || ''));
    if (normalized) keys.add(normalized);
  };

  for (const rawValue of rawValues) {
    const raw = String(rawValue || '').trim();
    if (!raw) continue;
    add(raw);
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) add(entry);
      } else if (parsed && typeof parsed === 'object') {
        for (const value of Object.values(parsed as Record<string, unknown>)) add(value);
      }
    } catch {
      for (const entry of raw.split(/[\n,\s]+/)) add(entry);
    }
  }

  return keys;
}

function clampText(value: string, max = 1200): string {
  return normalizeText(value).slice(0, max);
}

function safeText(value: string, max = 1200): string {
  return clampText(value, max);
}

function presentDarkRiskLabel(value: string | null | undefined): string {
  const normalized = String(value || '').trim();
  if (!normalized) return 'DarkRisk360';
  return normalized.replace(/intelligence\s*x|intelx/gi, 'DarkRisk360');
}

function presentFindingType(value: string | null | undefined): string {
  const normalized = String(value || '').trim();
  if (!normalized) return 'darkrisk_signal';
  return presentDarkRiskLabel(normalized.replace(/^intelx_/i, 'darkrisk_'));
}

function toArray<T = string>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeTier(value: string | null | undefined): Tier {
  return String(value || '').toLowerCase() === 'extended' ? 'extended' : 'standard';
}

function normalizeClassification(value: string | null | undefined): Classification {
  const normalized = String(value || 'confidential').toLowerCase();
  if (normalized === 'public') return 'public';
  if (normalized === 'private') return 'private';
  return 'confidential';
}

function normalizeSeverity(value: string | null | undefined): Severity {
  const normalized = String(value || 'info').toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'low') return 'low';
  return 'info';
}

function normalizePriority(value: string | null | undefined): ReportRecommendation['priority'] {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'immediate' || normalized === 'short_term' || normalized === 'mid_term' || normalized === 'long_term') {
    return normalized;
  }
  return 'short_term';
}

function normalizeConfidence(value: string | null | undefined): Confidence {
  const normalized = String(value || 'medium').toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'medium';
}

function normalizeSensitiveTag(value: string | null | undefined): 'domains' | 'passwords' | 'addresses' | 'credit_cards' | 'phone_numbers' | null {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'domains') return 'domains';
  if (normalized === 'passwords') return 'passwords';
  if (normalized === 'addresses') return 'addresses';
  if (normalized === 'credit_cards') return 'credit_cards';
  if (normalized === 'phone_numbers') return 'phone_numbers';
  return null;
}

function isAllZeroCreditCardValue(value: string | null | undefined): boolean {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= 13 && /^0+$/.test(digits)) return true;
  const masked = String(value || '').replace(/\s+/g, '');
  const maskedDigits = masked.replace(/\D/g, '');
  return Boolean(masked.includes('*') && maskedDigits.length >= 8 && /^0+$/.test(maskedDigits) && /^[0*]+$/.test(masked.replace(/[^0-9*]/g, '')));
}

function shouldIgnoreSensitiveHit(hit: DtiSensitiveHitRow): boolean {
  const tag = normalizeSensitiveTag(hit.tag);
  if (tag !== 'credit_cards') return false;
  return isAllZeroCreditCardValue(hit.clear_value) || isAllZeroCreditCardValue(hit.masked_value);
}

function isoOrNow(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function riskLevelFromFindings(findings: ReportFinding[]): 'low' | 'medium' | 'high' | 'critical' {
  const maxRank = findings.reduce((acc, finding) => Math.max(acc, severityRank[normalizeSeverity(finding.severity)]), 1);
  if (maxRank >= severityRank.critical) return 'critical';
  if (maxRank >= severityRank.high) return 'high';
  if (maxRank >= severityRank.medium) return 'medium';
  return 'low';
}

function averageRiskScore(findings: ReportFinding[]): number {
  if (!findings.length) return 0;
  const sum = findings.reduce((acc, finding) => acc + Number(finding.risk_score || 0), 0);
  return Math.max(0, Math.min(100, Math.round(sum / findings.length)));
}

function toPercentRows(counts: Map<string, number>): Array<{ label: string; count: number; percentage: number }> {
  const total = Array.from(counts.values()).reduce((acc, value) => acc + value, 0);
  if (total <= 0) return [];
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, percentage: Number(((count / total) * 100).toFixed(2)) }))
    .sort((a, b) => b.count - a.count);
}

function findingInterpretation(finding: ReportFinding): string {
  const composed = `${finding.type} ${finding.title}`.toLowerCase();

  if (/credential|password|stealer|identity/.test(composed)) {
    return 'Evidenza di possibile compromissione identitaria: richiede verifica account, revoca sessioni e hardening IAM.';
  }
  if (/dmarc|spf|dkim|mail|mx/.test(composed)) {
    return 'Debolezza nel canale email che può favorire spoofing e phishing verso utenti e partner.';
  }
  if (/open_port|port|rdp|ssh|smb|service/.test(composed)) {
    return 'Esposizione di superficie esterna: ridurre i servizi Internet-facing ai soli necessari e proteggere accessi amministrativi.';
  }
  if (/tls|ssl|hsts|http|header|certificate/.test(composed)) {
    return 'Misconfigurazione applicativa/trasporto che può aumentare rischio MITM, downgrade o abuso sessione.';
  }
  return 'Finding da trattare con priorità proporzionata a severità, confidenza e contesto operativo.';
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildReportHtml(report: DarkRiskReportJson): string {
  const findingRows = report.findings.slice(0, 50).map((finding) => {
    return `<tr>
      <td>${escapeHtml(finding.severity.toUpperCase())}</td>
      <td>${escapeHtml(finding.title)}</td>
      <td>${escapeHtml(finding.affected_asset || '-')}</td>
      <td>${escapeHtml(String(finding.risk_score))}</td>
      <td>${escapeHtml(finding.status)}</td>
    </tr>`;
  }).join('\n');

  const recommendationRows = report.recommendations.slice(0, 50).map((recommendation) => {
    return `<tr>
      <td>${escapeHtml(recommendation.priority)}</td>
      <td>${escapeHtml(recommendation.title)}</td>
      <td>${escapeHtml(recommendation.actions.join('; '))}</td>
      <td>${escapeHtml(recommendation.expected_outcome)}</td>
    </tr>`;
  }).join('\n');

  const topDrivers = report.executive_summary.top_drivers.map((driver) => `<li>${escapeHtml(driver)}</li>`).join('');
  const dtiSourceRows = report.dti_intelligence.source_execution.slice(0, 80).map((row) => `<tr>
      <td>${escapeHtml(row.source)}</td>
      <td>${escapeHtml(row.query_kind)}</td>
      <td>${escapeHtml(row.query_term)}</td>
      <td>${escapeHtml(row.asset_scope)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(String(row.result_count))}</td>
      <td>${escapeHtml(String(row.note || '-'))}</td>
    </tr>`).join('\n');
  const dtiSensitiveRows = report.dti_intelligence.sensitive_by_asset.slice(0, 80).map((row) => `<tr>
      <td>${escapeHtml(row.asset_scope)}</td>
      <td>${escapeHtml(String(row.domains))}</td>
      <td>${escapeHtml(String(row.passwords))}</td>
      <td>${escapeHtml(String(row.addresses))}</td>
      <td>${escapeHtml(String(row.credit_cards))}</td>
      <td>${escapeHtml(String(row.phone_numbers))}</td>
      <td>${escapeHtml(String(row.total))}</td>
    </tr>`).join('\n');
  const dtiSensitiveSampleRows = report.dti_intelligence.sensitive_samples.slice(0, 120).map((row) => `<tr>
      <td>${escapeHtml(row.asset_scope || '-')}</td>
      <td>${escapeHtml(row.query_kind || '-')}</td>
      <td>${escapeHtml(row.query_term || '-')}</td>
      <td>${escapeHtml(row.tag || '-')}</td>
      <td>${escapeHtml(row.value || row.masked_value || '-')}</td>
      <td>${escapeHtml(row.source || 'DarkRisk360')}</td>
    </tr>`).join('\n');

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(report.document_metadata.report_title)} ${escapeHtml(report.document_metadata.customer_name)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
  h1, h2, h3 { margin-bottom: 8px; color: #0f172a; }
  p { line-height: 1.5; }
  .notice { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px; border-radius: 8px; margin-bottom: 16px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .brand-logo { width: 22px; height: 22px; border-radius: 6px; background: #3b82f6; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; }
  .brand-text { font-size: 13px; color: #475569; }
  .meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px 16px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; vertical-align: top; }
  th { background: #e2e8f0; }
  ul { margin-top: 6px; }
  .muted { color: #64748b; font-size: 12px; }
</style>
</head>
<body>
  <div class="brand">
    <span class="brand-logo">Hi</span>
    <span class="brand-text">HiSolution</span>
  </div>
  <h1>${escapeHtml(report.document_metadata.report_title)}</h1>
  <div class="notice">${escapeHtml(REPORT_NOTICE)}</div>

  <div class="meta">
    <div><strong>Cliente:</strong> ${escapeHtml(report.document_metadata.customer_name)}</div>
    <div><strong>Classificazione:</strong> ${escapeHtml(report.classification)}</div>
    <div><strong>Tier:</strong> ${escapeHtml(report.tier)}</div>
    <div><strong>Generato il:</strong> ${escapeHtml(new Date(report.generated_at).toLocaleString('it-IT'))}</div>
    <div><strong>Scan run:</strong> ${escapeHtml(report.scan_run_id)}</div>
    <div><strong>Schema report:</strong> ${escapeHtml(REPORT_SCHEMA_VERSION)}</div>
  </div>

  <h2>Executive Summary</h2>
  <p><strong>Risk level:</strong> ${escapeHtml(report.executive_summary.risk_level)} - <strong>Risk score:</strong> ${escapeHtml(String(report.executive_summary.risk_score))}</p>
  <p>${escapeHtml(report.executive_summary.text)}</p>
  <ul>${topDrivers}</ul>

  <h2>Scope & Coverage</h2>
  <p><strong>Asset autorizzati:</strong> ${escapeHtml(String(report.scope.authorized_assets.length))} | <strong>Esclusi:</strong> ${escapeHtml(String(report.scope.excluded_assets.length))}</p>
  <p class="muted">Limitazioni: ${escapeHtml(report.scope.limitations.join(' | ') || 'Nessuna limitazione dichiarata')}</p>

  <h2>Findings principali</h2>
  <table>
    <thead>
      <tr><th>Severity</th><th>Titolo</th><th>Asset</th><th>Risk score</th><th>Stato</th></tr>
    </thead>
    <tbody>
      ${findingRows || '<tr><td colspan="5">Nessun finding disponibile</td></tr>'}
    </tbody>
  </table>

  <h2>Raccomandazioni operative</h2>
  <table>
    <thead>
      <tr><th>Priorità</th><th>Titolo</th><th>Azioni</th><th>Outcome atteso</th></tr>
    </thead>
    <tbody>
      ${recommendationRows || '<tr><td colspan="4">Nessuna raccomandazione disponibile</td></tr>'}
    </tbody>
  </table>

  <h2>Domain Threat Intelligence</h2>
  <p><strong>Copertura query:</strong> @domain.tld=${escapeHtml(String(report.dti_intelligence.query_coverage.at_domain_tld || 0))},
  selector=${escapeHtml(String(report.dti_intelligence.query_coverage.selector || 0))},
  email=${escapeHtml(String(report.dti_intelligence.query_coverage.email_selector || 0))}</p>
  <p><strong>Evidenze sensibili aggregate:</strong> domini=${escapeHtml(String(report.dti_intelligence.sensitive_summary.domains))},
  password=${escapeHtml(String(report.dti_intelligence.sensitive_summary.passwords))},
  indirizzi=${escapeHtml(String(report.dti_intelligence.sensitive_summary.addresses))},
  carte=${escapeHtml(String(report.dti_intelligence.sensitive_summary.credit_cards))},
  telefoni=${escapeHtml(String(report.dti_intelligence.sensitive_summary.phone_numbers))}</p>

  <h3>Esecuzioni per sorgente/query</h3>
  <table>
    <thead>
      <tr><th>Sorgente</th><th>Query kind</th><th>Query term</th><th>Asset scope</th><th>Status</th><th>Result count</th><th>Note</th></tr>
    </thead>
    <tbody>
      ${dtiSourceRows || '<tr><td colspan="7">Nessuna esecuzione DTI disponibile</td></tr>'}
    </tbody>
  </table>

  <h3>Riepilogo evidenze sensibili per asset</h3>
  <table>
    <thead>
      <tr><th>Asset</th><th>Domini</th><th>Password</th><th>Indirizzi</th><th>Carte</th><th>Telefoni</th><th>Tot</th></tr>
    </thead>
    <tbody>
      ${dtiSensitiveRows || '<tr><td colspan="7">Nessuna evidenza sensibile rilevata</td></tr>'}
    </tbody>
  </table>

  <h3>Evidenze sensibili (dettaglio operativo)</h3>
  <table>
    <thead>
      <tr><th>Asset scope</th><th>Query kind</th><th>Query</th><th>Classe</th><th>Valore</th><th>Sorgente</th></tr>
    </thead>
    <tbody>
      ${dtiSensitiveSampleRows || '<tr><td colspan="6">Nessuna evidenza dettagliata disponibile</td></tr>'}
    </tbody>
  </table>

  <p class="muted">Report snapshot immutabile: i dati riflettono lo stato al momento della generazione.</p>
</body>
</html>`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);

    const authHeader = req.headers.get('authorization') || '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const internalSecret = req.headers.get('x-darkrisk-internal-secret') || '';
    const serviceKeys = parseSecretKeySet(SERVICE_ROLE, SUPABASE_SECRET_KEYS);
    const internalKeys = parseSecretKeySet(INTERNAL_SECRET, OPERATOR_SECRET);
    const isInternal = (bearer && serviceKeys.has(bearer)) || (internalSecret && internalKeys.has(internalSecret));

    const body = await req.json().catch(() => ({}));
    const requestedCustomerId = normalizeText(body?.customer_id || body?.organization_id);
    const requestedScanRunId = normalizeText(body?.scan_run_id);
    const requestedClassification = normalizeClassification(body?.classification);
    const forceRegenerate = Boolean(body?.force_regenerate);
    const includeHtml = body?.include_html !== false;

    let actorUserId = normalizeText(body?.generated_by);
    let customerId = requestedCustomerId;
    let callerProfile: Awaited<ReturnType<typeof getCallerProfile>> | null = null;

    if (!isInternal) {
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      }
      actorUserId = authData.user.id;

      const caller = await getCallerProfile(adminClient, authData.user.id);
      callerProfile = caller;
      customerId = requestedCustomerId || caller.organizationId || '';
      if (!customerId) {
        return jsonResponse({ ok: false, error: 'customer_id is required' }, 400);
      }
      assertCustomerAccess(caller, customerId);
    }

    if (!customerId && requestedScanRunId) {
      const { data: runOrg } = await adminClient
        .from('darkrisk_scan_runs' as any)
        .select('organization_id')
        .eq('id', requestedScanRunId)
        .maybeSingle();
      customerId = normalizeText(runOrg?.organization_id);
    }

    if (!customerId) {
      return jsonResponse({ ok: false, error: 'Unable to resolve customer scope' }, 400);
    }

    const { data: entitlement, error: entitlementErr } = await adminClient
      .from('darkrisk_entitlements' as any)
      .select('enabled, tier, enable_raw_evidence')
      .eq('organization_id', customerId)
      .maybeSingle();

    if (entitlementErr) {
      const missingTable = String((entitlementErr as any)?.code || '') === '42P01';
      if (missingTable) {
        return jsonResponse({ ok: false, error: 'darkrisk_entitlements table missing. Apply migrations first.' }, 412);
      }
      throw entitlementErr;
    }

    if (!entitlement?.enabled) {
      return jsonResponse({ ok: false, error: 'DarkRisk360 not enabled for customer' }, 403);
    }

    const tier = normalizeTier(entitlement?.tier);
    const allowClearSensitiveInReport = true;

    const scanRunRes = requestedScanRunId
      ? await adminClient
          .from('darkrisk_scan_runs' as any)
          .select('id, status, started_at, completed_at, warnings, stats, sources, organization_id')
          .eq('id', requestedScanRunId)
          .eq('organization_id', customerId)
          .maybeSingle()
      : await adminClient
          .from('darkrisk_scan_runs' as any)
          .select('id, status, started_at, completed_at, warnings, stats, sources, organization_id')
          .eq('organization_id', customerId)
          .in('status', ['completed', 'completed_with_warnings'])
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

    if (scanRunRes.error) throw scanRunRes.error;
    if (!scanRunRes.data?.id) {
      return jsonResponse({ ok: false, error: 'No completed scan run available for report generation' }, 404);
    }

    const scanRun = scanRunRes.data as any;

    if (!forceRegenerate) {
      const existingReportRes = await adminClient
        .from('darkrisk_report_snapshots' as any)
        .select('id, generated_at, title, classification, tier, html_storage_path, json_storage_path, pdf_storage_path')
        .eq('organization_id', customerId)
        .eq('scan_run_id', scanRun.id)
        .eq('tier', tier)
        .eq('classification', requestedClassification)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingReportRes.error) throw existingReportRes.error;
      if (existingReportRes.data?.id) {
        await adminClient
          .from('darkrisk_audit_log' as any)
          .insert({
            organization_id: customerId,
            tenant_id: customerId,
            actor_id: actorUserId || null,
            action: 'darkrisk_report_reused',
            entity_type: 'darkrisk_report_snapshot',
            entity_id: existingReportRes.data.id,
            reason: 'existing_snapshot_for_scan_run',
            metadata: {
              tier,
              classification: requestedClassification,
              scan_run_id: scanRun.id,
            },
          });

        return jsonResponse({
          ok: true,
          reused: true,
          report: existingReportRes.data,
        });
      }
    }

    const [orgRes, assetsRes, selectorsRes, findingsRes, sourceRes, dtiSourceRunRes, dtiSensitiveHitsRes] = await Promise.all([
      adminClient
        .from('organizations' as any)
        .select('id, name, hicompliance_enabled')
        .eq('id', customerId)
        .maybeSingle(),
      adminClient
        .from('darkrisk_assets' as any)
        .select('id, asset_type, value, normalized_value, scope_status')
        .eq('organization_id', customerId),
      adminClient
        .from('darkrisk_selectors' as any)
        .select('id, selector_type, normalized_value, status')
        .eq('organization_id', customerId),
      adminClient
        .from('darkrisk_findings' as any)
        .select('id, title, finding_type, description, severity, confidence, risk_score, status, affected_asset_id, affected_selector_id, evidence_ids, first_seen_at, last_seen_at, metadata, created_at')
        .eq('organization_id', customerId)
        .eq('scan_run_id', scanRun.id)
        .order('risk_score', { ascending: false })
        .limit(500),
      adminClient
        .from('darkrisk_source_records' as any)
        .select('source, source_type, source_media, asset_id, selector_id')
        .eq('organization_id', customerId)
        .eq('scan_run_id', scanRun.id),
      adminClient
        .from('darkrisk_dti_source_runs' as any)
        .select('source, source_label, source_key, query_kind, query_term, asset_scope, status, result_count, warning, error_message, metadata')
        .eq('organization_id', customerId)
        .eq('scan_run_id', scanRun.id)
        .order('created_at', { ascending: false })
        .limit(2000),
      adminClient
        .from('darkrisk_dti_sensitive_hits' as any)
        .select('source, source_label, query_kind, query_term, asset_scope, tag, masked_value, clear_value')
        .eq('organization_id', customerId)
        .eq('scan_run_id', scanRun.id)
        .order('created_at', { ascending: false })
        .limit(4000),
    ]);

    if (orgRes.error) throw orgRes.error;
    if (assetsRes.error) throw assetsRes.error;
    if (selectorsRes.error) throw selectorsRes.error;
    if (findingsRes.error) throw findingsRes.error;
    if (sourceRes.error) throw sourceRes.error;
    if (dtiSourceRunRes.error) throw dtiSourceRunRes.error;
    if (dtiSensitiveHitsRes.error) throw dtiSensitiveHitsRes.error;

    const findings = (findingsRes.data || []) as FindingRow[];
    const assets = (assetsRes.data || []) as AssetRow[];
    const selectors = (selectorsRes.data || []) as SelectorRow[];
    const sourceRows = (sourceRes.data || []) as SourceRecordRow[];
    const dtiSourceRuns = (dtiSourceRunRes.data || []) as DtiSourceRunRow[];
    const dtiSensitiveHits = ((dtiSensitiveHitsRes.data || []) as DtiSensitiveHitRow[])
      .filter((hit) => !shouldIgnoreSensitiveHit(hit));

    const findingIds = findings.map((finding) => finding.id);
    const evidenceIds = Array.from(new Set(findings.flatMap((finding) => toArray<string>(finding.evidence_ids))));

    const [recommendationsRes, evidenceRes] = await Promise.all([
      findingIds.length > 0
        ? adminClient
            .from('darkrisk_recommendations' as any)
            .select('id, finding_id, title, priority, why_it_matters, actions, expected_outcome, confidence, model, prompt_version, output_schema_version')
            .eq('organization_id', customerId)
            .in('finding_id', findingIds)
        : Promise.resolve({ data: [], error: null }),
      evidenceIds.length > 0
        ? adminClient
            .from('darkrisk_evidence' as any)
            .select('id, title, summary, masked_value')
            .eq('organization_id', customerId)
            .in('id', evidenceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if ((recommendationsRes as any).error) throw (recommendationsRes as any).error;
    if ((evidenceRes as any).error) throw (evidenceRes as any).error;

    const recommendations = ((recommendationsRes as any).data || []) as RecommendationRow[];
    const evidenceRows = ((evidenceRes as any).data || []) as EvidenceRow[];

    const assetById = new Map<string, AssetRow>();
    for (const asset of assets) {
      assetById.set(asset.id, asset);
    }

    const selectorById = new Map<string, SelectorRow>();
    for (const selector of selectors) {
      selectorById.set(selector.id, selector);
    }

    const evidenceById = new Map<string, EvidenceRow>();
    for (const evidence of evidenceRows) {
      evidenceById.set(evidence.id, evidence);
    }

    const recommendationByFinding = new Map<string, RecommendationRow[]>();
    for (const recommendation of recommendations) {
      const findingId = normalizeText(recommendation.finding_id);
      if (!findingId) continue;
      const bucket = recommendationByFinding.get(findingId) || [];
      bucket.push(recommendation);
      recommendationByFinding.set(findingId, bucket);
    }

    const reportFindings: ReportFinding[] = findings.map((finding) => {
      const findingAsset = finding.affected_asset_id ? assetById.get(finding.affected_asset_id) : null;
      const findingSelector = finding.affected_selector_id ? selectorById.get(finding.affected_selector_id) : null;

      const evidenceSummary = Array.from(new Set(
        toArray<string>(finding.evidence_ids)
          .flatMap((evidenceId) => {
            const evidence = evidenceById.get(evidenceId);
            if (!evidence) return [];
            return [
              safeText(String(evidence.title || ''), 180),
              safeText(String(evidence.summary || ''), 240),
              safeText(String(evidence.masked_value || ''), 120),
            ].filter(Boolean);
          }),
      )).slice(0, 5);

      const normalizedSeverity = normalizeSeverity(finding.severity);

      const base: ReportFinding = {
        id: finding.id,
        title: safeText(String(finding.title || finding.finding_type || 'Finding'), 180),
        type: safeText(presentFindingType(String(finding.finding_type || 'unknown')), 80),
        severity: normalizedSeverity,
        confidence: normalizeConfidence(finding.confidence),
        risk_score: Number(finding.risk_score || 0),
        affected_asset: safeText(String(findingAsset?.normalized_value || findingAsset?.value || 'n/a'), 160),
        affected_selector_masked: findingSelector?.normalized_value
          ? safeText(String(findingSelector.normalized_value), 120)
          : undefined,
        first_seen_at: isoOrNow(finding.first_seen_at || finding.created_at),
        last_seen_at: isoOrNow(finding.last_seen_at || finding.created_at),
        source_names: Array.from(new Set(sourceRows.map((row) => safeText(presentDarkRiskLabel(String(row.source || 'unknown')), 32)))),
        evidence_summary: evidenceSummary,
        interpretation: '',
        status: safeText(String(finding.status || 'new'), 32),
      };

      base.interpretation = findingInterpretation(base);
      return base;
    });

    const reportRecommendations: ReportRecommendation[] = [];
    for (const finding of reportFindings) {
      const sourceRecommendations = recommendationByFinding.get(finding.id) || [];

      if (sourceRecommendations.length === 0) {
        const fallbackPriority: ReportRecommendation['priority'] =
          finding.severity === 'critical' || finding.severity === 'high'
            ? 'immediate'
            : finding.severity === 'medium'
            ? 'short_term'
            : finding.severity === 'low'
            ? 'mid_term'
            : 'long_term';

        reportRecommendations.push({
          finding_id: finding.id,
          priority: fallbackPriority,
          title: `Ridurre rischio su ${finding.title}`,
          why_it_matters: finding.interpretation,
          actions: [
            'Confermare ownership tecnica del finding e priorità di remediation.',
            'Applicare fix/hardening e verificare con nuova scansione.',
            'Tracciare evidenza di chiusura e aggiornare stato operativo.',
          ],
          expected_outcome: 'Riduzione esposizione e miglioramento del risk score associato al finding.',
        });
        continue;
      }

      for (const recommendation of sourceRecommendations) {
        reportRecommendations.push({
          finding_id: finding.id,
          priority: normalizePriority(recommendation.priority),
          title: safeText(String(recommendation.title || finding.title), 180),
          why_it_matters: safeText(String(recommendation.why_it_matters || finding.interpretation), 700),
          actions: toArray<string>(recommendation.actions).map((entry) => safeText(String(entry), 200)).filter(Boolean).slice(0, 8),
          expected_outcome: safeText(String(recommendation.expected_outcome || 'Riduzione del rischio operativo sull’asset impattato.'), 400),
        });
      }
    }

    const findingsSorted = [...reportFindings].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
    const riskLevel = riskLevelFromFindings(findingsSorted);
    const riskScore = averageRiskScore(findingsSorted);
    const topDrivers = findingsSorted.slice(0, 5).map((finding) => `${finding.title} (${finding.severity})`);

    const bySourceCounts = new Map<string, number>();
    const byTypeCounts = new Map<string, number>();
    const bySeverityCounts = new Map<string, number>();
    const byFindingTypeCounts = new Map<string, number>();

    for (const source of sourceRows) {
      const sourceKey = safeText(presentDarkRiskLabel(String(source.source || 'unknown')), 40);
      bySourceCounts.set(sourceKey, (bySourceCounts.get(sourceKey) || 0) + 1);

      const typeKey = safeText(presentDarkRiskLabel(String(source.source_media || source.source_type || 'unknown')), 40);
      byTypeCounts.set(typeKey, (byTypeCounts.get(typeKey) || 0) + 1);
    }

    for (const finding of reportFindings) {
      const severity = safeText(String(finding.severity || 'info'), 20);
      bySeverityCounts.set(severity, (bySeverityCounts.get(severity) || 0) + 1);

      const findingType = safeText(presentFindingType(String(finding.type || 'unknown')), 80);
      byFindingTypeCounts.set(findingType, (byFindingTypeCounts.get(findingType) || 0) + 1);
    }

    const dtiQueryCoverage = {
      at_domain_tld: 0,
      selector: 0,
      email_selector: 0,
    };
    const dtiSourceRowsForReport = dtiSourceRuns.map((row) => {
      const queryKind = safeText(String(row.query_kind || ''), 40);
      if (queryKind === 'at_domain_tld') dtiQueryCoverage.at_domain_tld += 1;
      if (queryKind === 'selector') dtiQueryCoverage.selector += 1;
      if (queryKind === 'email_selector') dtiQueryCoverage.email_selector += 1;
      return {
        source: safeText(presentDarkRiskLabel(String(row.source_label || row.source || 'DarkRisk360')), 80),
        query_kind: queryKind || '-',
        query_term: safeText(String(row.query_term || '-'), 180),
        asset_scope: safeText(String(row.asset_scope || '-'), 160),
        status: safeText(String(row.status || 'unknown'), 40),
        result_count: Math.max(0, Number(row.result_count || 0)),
        note: safeText(String(row.warning || row.error_message || ''), 200) || null,
      };
    });

    const dtiSourceDist = new Map<string, number>();
    for (const row of dtiSourceRowsForReport) {
      dtiSourceDist.set(row.source, (dtiSourceDist.get(row.source) || 0) + 1);
    }

    const dtiFileDist = new Map<string, number>();
    for (const row of dtiSourceRuns) {
      const fileType = safeText(
        presentDarkRiskLabel(String((row.metadata || {})?.file_type || (row.metadata || {})?.content_type || row.source_key || 'unknown')),
        60,
      );
      dtiFileDist.set(fileType, (dtiFileDist.get(fileType) || 0) + 1);
    }

    const dtiSensitiveTotals = {
      domains: 0,
      passwords: 0,
      addresses: 0,
      credit_cards: 0,
      phone_numbers: 0,
      total: 0,
    };
    const dtiSensitiveByAssetMap = new Map<string, typeof dtiSensitiveTotals>();
    for (const hit of dtiSensitiveHits) {
      const tag = normalizeSensitiveTag(hit.tag);
      if (!tag) continue;
      dtiSensitiveTotals[tag] += 1;
      dtiSensitiveTotals.total += 1;
      const scopeKey = safeText(String(hit.asset_scope || hit.query_term || 'n/a'), 160).toLowerCase() || 'n/a';
      const current = dtiSensitiveByAssetMap.get(scopeKey) || {
        domains: 0,
        passwords: 0,
        addresses: 0,
        credit_cards: 0,
        phone_numbers: 0,
        total: 0,
      };
      current[tag] += 1;
      current.total += 1;
      dtiSensitiveByAssetMap.set(scopeKey, current);
    }

    const dtiSensitiveByAsset = Array.from(dtiSensitiveByAssetMap.entries())
      .map(([asset_scope, counters]) => ({
        asset_scope,
        ...counters,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 250);

    const dtiSensitiveSamples = dtiSensitiveHits
      .map((hit) => {
        const tag = normalizeSensitiveTag(hit.tag);
        if (!tag) return null;
        const clearValue = safeText(String(hit.clear_value || ''), 180);
        const maskedValue = safeText(String(hit.masked_value || ''), 180);
        const value = clearValue || maskedValue;
        return {
          source: safeText(presentDarkRiskLabel(String(hit.source_label || hit.source || 'DarkRisk360')), 80),
          query_kind: safeText(String(hit.query_kind || '-'), 40),
          query_term: safeText(String(hit.query_term || '-'), 180),
          asset_scope: safeText(String(hit.asset_scope || hit.query_term || 'n/a'), 160),
          tag,
          value: value || '-',
          masked_value: maskedValue || '-',
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .slice(0, 400);

    const scopeAuthorizedAssets = assets
      .filter((asset) => String(asset.scope_status || 'approved') === 'approved')
      .map((asset) => safeText(String(asset.normalized_value || asset.value || ''), 160))
      .filter(Boolean);

    const scopeExcludedAssets = assets
      .filter((asset) => String(asset.scope_status || '') === 'excluded')
      .map((asset) => safeText(String(asset.normalized_value || asset.value || ''), 160))
      .filter(Boolean);

    const scopeCandidates = assets
      .filter((asset) => ['candidate', 'discovered', 'pending'].includes(String(asset.scope_status || '').toLowerCase()))
      .map((asset) => safeText(String(asset.normalized_value || asset.value || ''), 160))
      .filter(Boolean);

    const runWarnings = toArray<string>((scanRun.warnings as unknown) || []).map((entry) => safeText(presentDarkRiskLabel(String(entry)), 200));
    const scopeLimitations = [
      'Report generato da snapshot persistito: nessuna chiamata live ai provider durante la generazione.',
      'Evidenze sensibili: visualizzazione in chiaro attiva per analisi operativa DarkRisk360.',
      ...runWarnings,
    ];

    const customerName = safeText(String(orgRes.data?.name || customerId), 120);
    const hasHiCompliance = Boolean((orgRes.data as any)?.hicompliance_enabled);
    const reportBrandTitle = hasHiCompliance ? DARKRISK_BRAND_TITLE_HICOMPLIANCE : DARKRISK_BRAND_TITLE_HICONSOLE;
    const generatedAt = new Date().toISOString();
    const reportId = crypto.randomUUID();

    const reportJson: DarkRiskReportJson = {
      report_id: reportId,
      customer_id: customerId,
      tier,
      classification: requestedClassification,
      generated_at: generatedAt,
      generated_by: actorUserId || 'system',
      scan_run_id: scanRun.id,
      document_metadata: {
        product_name: 'DarkRisk360',
        document_type: tier === 'extended' ? 'DarkRisk360 DTI Extended' : 'DarkRisk360 Standard Snapshot',
        report_title: reportBrandTitle,
        status: 'final',
        version: REPORT_SCHEMA_VERSION,
        owner: 'HiSolution',
        customer_name: customerName,
        hicompliance_enabled: hasHiCompliance,
      },
      scope: {
        authorized_assets: Array.from(new Set(scopeAuthorizedAssets)),
        excluded_assets: Array.from(new Set(scopeExcludedAssets)),
        discovered_candidate_assets: Array.from(new Set(scopeCandidates)),
        limitations: Array.from(new Set(scopeLimitations)).slice(0, 20),
      },
      executive_summary: {
        risk_level: riskLevel,
        risk_score: riskScore,
        text: safeText(
          `L'analisi DarkRisk360 sul perimetro autorizzato del cliente ${customerName} evidenzia rischio ${riskLevel}. La valutazione integra postura SurfaceScan360, segnali identity exposure e confidenza delle evidenze normalizzate.`,
          900,
        ),
        top_drivers: topDrivers,
      },
      coverage: {
        surfacescan360: {
          findings: reportFindings.length,
          sources: sourceRows.filter((row) => String(row.source || '').toLowerCase() === 'surfacescan360').length,
          controls_coverage_hint: scanRun?.stats?.controls_coverage || null,
        },
        darkrisk360: {
          records: sourceRows.filter((row) => String(row.source || '').toLowerCase() === 'intelx').length,
          selectors_monitored: selectors.length,
        },
        openai: {
          recommendations: recommendations.length,
        },
      },
      findings: reportFindings,
      recommendations: reportRecommendations,
      statistics: {
        by_source: toPercentRows(bySourceCounts).map((entry) => ({ source: entry.label, count: entry.count, percentage: entry.percentage })),
        by_file_type: toPercentRows(byTypeCounts).map((entry) => ({ file_type: entry.label, count: entry.count, percentage: entry.percentage })),
        by_severity: Array.from(bySeverityCounts.entries())
          .map(([severity, count]) => ({ severity, count }))
          .sort((a, b) => (severityRank[normalizeSeverity(b.severity)] - severityRank[normalizeSeverity(a.severity)])),
        by_finding_type: Array.from(byFindingTypeCounts.entries())
          .map(([finding_type, count]) => ({ finding_type, count }))
          .sort((a, b) => b.count - a.count),
      },
      dti_intelligence: {
        query_coverage: dtiQueryCoverage,
        source_execution: dtiSourceRowsForReport.slice(0, 600),
        sensitive_summary: dtiSensitiveTotals,
        sensitive_by_asset: dtiSensitiveByAsset,
        sensitive_samples: dtiSensitiveSamples,
        source_distribution: toPercentRows(dtiSourceDist).map((entry) => ({ source: entry.label, count: entry.count, percentage: entry.percentage })),
        file_distribution: toPercentRows(dtiFileDist).map((entry) => ({ file_type: entry.label, count: entry.count, percentage: entry.percentage })),
      },
      appendices: {
        confidentiality_notice: REPORT_NOTICE,
        report_schema_version: REPORT_SCHEMA_VERSION,
        section_plan: tier === 'extended' ? extendedSections : standardSections,
        asset_inventory: assets.map((asset) => ({
          type: safeText(String(asset.asset_type || 'unknown'), 30),
          value: safeText(String(asset.normalized_value || asset.value || ''), 160),
          scope_status: safeText(String(asset.scope_status || 'approved'), 30),
        })),
        selector_inventory: selectors.slice(0, 500).map((selector) => ({
          type: safeText(String(selector.selector_type || 'unknown'), 30),
          value: safeText(String(selector.normalized_value || ''), 120),
          status: safeText(String(selector.status || 'approved'), 30),
        })),
        dti_sensitive_samples_masked: dtiSensitiveHits
          .slice(0, 300)
          .map((hit) => ({
            source: safeText(presentDarkRiskLabel(String(hit.source_label || hit.source || 'DarkRisk360')), 60),
            query_kind: safeText(String(hit.query_kind || ''), 40),
            query_term: safeText(String(hit.query_term || ''), 120),
            asset_scope: safeText(String(hit.asset_scope || ''), 120),
            tag: safeText(String(hit.tag || ''), 40),
            value: safeText(String(hit.masked_value || ''), 120),
          })),
      },
    };

    const htmlStoragePath = includeHtml ? `${customerId}/${reportId}.html` : null;
    const jsonStoragePath = `${customerId}/${reportId}.json`;

    if (includeHtml) {
      const html = buildReportHtml(reportJson);
      const { error: htmlUploadErr } = await adminClient.storage
        .from('darkrisk-reports')
        .upload(htmlStoragePath as string, html, {
          upsert: true,
          contentType: 'text/html; charset=utf-8',
        });
      if (htmlUploadErr) throw htmlUploadErr;
    }

    const { error: jsonUploadErr } = await adminClient.storage
      .from('darkrisk-reports')
      .upload(jsonStoragePath, JSON.stringify(reportJson, null, 2), {
        upsert: true,
        contentType: 'application/json; charset=utf-8',
      });
    if (jsonUploadErr) throw jsonUploadErr;

    const primaryRecommendation = recommendations[0] || null;

    const { error: insertSnapshotErr } = await adminClient
      .from('darkrisk_report_snapshots' as any)
      .insert({
        id: reportId,
        organization_id: customerId,
        tenant_id: customerId,
        scan_run_id: scanRun.id,
        tier,
        title: `${reportBrandTitle} - ${customerName} - ${new Date(generatedAt).toLocaleDateString('it-IT')}`,
        classification: requestedClassification,
        status: 'completed',
        report_json: reportJson,
        html_storage_path: htmlStoragePath,
        json_storage_path: jsonStoragePath,
        pdf_storage_path: null,
        generated_by: actorUserId || null,
        generated_at: generatedAt,
        model_metadata: {
          report_schema_version: REPORT_SCHEMA_VERSION,
          prompt_version: primaryRecommendation?.prompt_version || null,
          model: primaryRecommendation?.model || null,
          output_schema_version: primaryRecommendation?.output_schema_version || null,
          scan_run_id: scanRun.id,
          finding_ids: findingIds,
          recommendation_ids: recommendations.map((entry) => entry.id),
          generated_at: generatedAt,
        },
      });

    if (insertSnapshotErr) throw insertSnapshotErr;

    await adminClient
      .from('darkrisk_audit_log' as any)
      .insert({
        organization_id: customerId,
        tenant_id: customerId,
        actor_id: actorUserId || null,
        action: 'darkrisk_report_generated',
        entity_type: 'darkrisk_report_snapshot',
        entity_id: reportId,
        reason: forceRegenerate ? 'force_regenerate' : 'generated',
        metadata: {
          tier,
          classification: requestedClassification,
          scan_run_id: scanRun.id,
          report_schema_version: REPORT_SCHEMA_VERSION,
        },
      });

    const htmlSignedUrl = includeHtml && htmlStoragePath
      ? (await adminClient.storage.from('darkrisk-reports').createSignedUrl(htmlStoragePath, 3600)).data?.signedUrl || null
      : null;

    const jsonSignedUrl = (await adminClient.storage.from('darkrisk-reports').createSignedUrl(jsonStoragePath, 3600)).data?.signedUrl || null;

    return jsonResponse({
      ok: true,
      report_id: reportId,
      customer_id: customerId,
      scan_run_id: scanRun.id,
      tier,
      classification: requestedClassification,
      generated_at: generatedAt,
      storage: {
        html_storage_path: htmlStoragePath,
        json_storage_path: jsonStoragePath,
        html_signed_url: htmlSignedUrl,
        json_signed_url: jsonSignedUrl,
      },
      stats: {
        findings: reportFindings.length,
        recommendations: reportRecommendations.length,
      },
    });
  } catch (error: any) {
    return jsonResponse({
      ok: false,
      error: safeText(error?.message || 'Internal error', 500),
    }, 500);
  }
});
