import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from '../_shared/surface-scan-utils.ts';
import { isEmailSelectorCoverageKind } from '../_shared/darkrisk-query-kind.ts';
import {
  resolveDarkRiskCapabilities,
} from '../_shared/darkrisk-access-policy.ts';

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
type CoverageStatus = 'completed' | 'partial' | 'error' | 'not_run' | 'planned';

type FindingLite = {
  id: string;
  severity: string | null;
  title: string | null;
  finding_type: string | null;
  module?: string | null;
  source?: string | null;
  created_at: string | null;
  status?: string | null;
  affected_asset?: string | null;
  affected_host?: string | null;
  affected_url?: string | null;
  attribution_confidence?: string | null;
};

type ModuleResultLite = {
  module_key: string;
  module_label: string;
  status: string;
  completed_at: string | null;
  created_at: string | null;
};

type CoverageControl = {
  key: string;
  control: string;
  status: CoverageStatus;
  last_execution: string | null;
  source: string;
};

type IntelxCoverageInfo = {
  has_run: boolean;
  run_status: string;
  selectors_considered: number;
  query_terms_considered: number;
  searches_run: number;
  email_queries_run: number;
  strict_password_hits: number;
  metadata_only_hits: number;
  at_domain_tld_queries: number;
  phonebook_searches_run: number;
  last_execution: string | null;
};

type DtiSensitiveTag = 'domains' | 'passwords' | 'addresses' | 'credit_cards' | 'phone_numbers';

type DtiSensitiveHitRow = {
  id?: string | null;
  source_run_id?: string | null;
  source_record_id?: string | null;
  finding_id?: string | null;
  source: string | null;
  source_label: string | null;
  query_kind: string | null;
  query_term: string | null;
  asset_scope: string | null;
  tag: string | null;
  masked_value: string | null;
  clear_value: string | null;
  match_policy?: string | null;
  extraction_confidence?: string | null;
  evidence_scope?: string | null;
  created_at: string | null;
};

function presentDarkRiskLabel(value: string | null | undefined): string {
  const text = String(value || '').trim();
  if (!text) return 'DarkRisk360';
  return text.replace(/intelligence\s*x|intelx/gi, 'DarkRisk360');
}

const severityRank: Record<Severity, number> = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

const activeStatuses = new Set([
  'new',
  'triaged',
  'validated',
  'remediation_in_progress',
]);

const goodSurfaceSnapshotStatuses = ['completed', 'partial', 'completed_with_warnings'];

function normalizeFindingStatus(status: string | null | undefined): string {
  const normalized = String(status || 'new').toLowerCase();
  if (normalized === 'open') return 'new';
  if (normalized === 'investigating') return 'triaged';
  return normalized;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  });
}

function normalizeSeverity(value: string | null | undefined): Severity {
  const normalized = String(value || 'info').toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'low') return 'low';
  return 'info';
}

function normalizeCoverageStatus(status: string | null | undefined): CoverageStatus {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'success' || normalized === 'completed' || normalized === 'finished') {
    return 'completed';
  }
  if (normalized === 'running' || normalized === 'queued' || normalized === 'waiting') {
    return 'partial';
  }
  if (normalized === 'error' || normalized === 'timeout' || normalized === 'failed') {
    return 'error';
  }
  if (normalized === 'skipped') {
    return 'partial';
  }
  return 'not_run';
}

function isActiveFinding(status: string | null | undefined): boolean {
  const normalized = normalizeFindingStatus(status);
  if (activeStatuses.has(normalized)) return true;
  return !(normalized === 'resolved' || normalized === 'suppressed' || normalized === 'false_positive' || normalized === 'accepted_risk');
}

function statusPenaltyWeight(status: string | null | undefined): number {
  const s = normalizeFindingStatus(status);
  if (s === 'validated' || s === 'remediation_in_progress') return 1.2;
  if (s === 'new') return 1.0;
  if (s === 'triaged') return 0.9;
  return 1.0;
}

function riskFromFindings(findings: FindingLite[]): { score: number; level: 'Basso' | 'Medio' | 'Alto' | 'Critico' } {
  let penalty = 0;

  for (const finding of findings) {
    const sev = normalizeSeverity(finding.severity);
    const weight = statusPenaltyWeight(finding.status);
    const base = sev === 'critical' ? 12 : sev === 'high' ? 7 : sev === 'medium' ? 3 : sev === 'low' ? 1 : 0.25;
    penalty += base * weight;
  }

  const score = Math.max(5, Math.min(100, Math.round(100 - penalty)));

  if (score <= 30) return { score, level: 'Critico' };
  if (score <= 50) return { score, level: 'Alto' };
  if (score <= 75) return { score, level: 'Medio' };
  return { score, level: 'Basso' };
}

function classifyThreatCategory(finding: FindingLite): string {
  const sourceText = [
    finding.module || '',
    String(finding.finding_type || '').replace(/^intelx_/i, 'darkrisk_'),
    finding.title || '',
    finding.source || '',
  ]
    .join(' ')
    .toLowerCase();

  if (/credential|credenzial|password|stealer|compromis/.test(sourceText)) return 'Credenziali compromesse';
  if (/mail|email/.test(sourceText) && /leak|expos|compromis/.test(sourceText)) return 'Email esposte';
  if (/database|dump|db /.test(sourceText)) return 'Database leak';
  if (/phish|brand|impersonation/.test(sourceText)) return 'Phishing e brand abuse';
  if (/open_port|open port|service_fingerprint|ports|shodan/.test(sourceText)) return 'Servizi esposti';
  if (/dmarc|spf|dkim|mail_security|mx|bimi/.test(sourceText)) return 'Email security';
  if (/dns|tls|ssl|hsts|whois|rdap|http_security|headers/.test(sourceText)) return 'DNS e TLS';
  if (/safe_browsing|urlhaus|phishtank|reputation|dnsbl|threat/.test(sourceText)) return 'Reputation';
  return 'Minacce rilevate';
}

function categoryDescription(category: string): string {
  switch (category) {
    case 'Credenziali compromesse':
      return 'Account e credenziali con segnali di esposizione o riuso potenziale.';
    case 'Email esposte':
      return 'Identità email aziendali con segnali di esposizione su fonti esterne.';
    case 'Database leak':
      return 'Riferimenti a dump, dataset o archivi potenzialmente pubblicati.';
    case 'Phishing e brand abuse':
      return 'Possibili segnali di abuso brand, impersonazione o phishing mirato.';
    case 'Servizi esposti':
      return 'Porte e servizi pubblici che aumentano la superficie di attacco.';
    case 'Email security':
      return 'Controlli SPF, DKIM, DMARC e postura del canale email.';
    case 'DNS e TLS':
      return 'Misconfigurazioni DNS/HTTP/TLS che impattano integrità e trasporto.';
    case 'Reputation':
      return 'Segnali da feed reputazionali e threat intelligence esterna.';
    default:
      return 'Finding tecnici aggregati dall’ultimo ciclo di analisi.';
  }
}

function normalizeSensitiveTag(value: string | null | undefined): DtiSensitiveTag | null {
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

const invalidPasswordEvidenceTokens = new Set([
  'query',
  'selector',
  'metadata',
  'record',
  'source',
  'field',
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'unknown',
  'null',
  'none',
  'n/a',
  'na',
  '&#39',
  '&apos;',
  '&quot;',
]);

function isInvalidPasswordEvidenceValue(value: string | null | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.length < 4 || normalized.length > 120) return true;
  if (invalidPasswordEvidenceTokens.has(normalized)) return true;
  if (/^&#\d{1,6};?$/i.test(normalized)) return true;
  if (/^&[a-z]{2,8};$/i.test(normalized)) return true;
  if (normalized.includes('@')) return true;
  if (/[=:]/.test(normalized)) return true;
  if (/^https?:\/\//.test(normalized)) return true;
  if (/^[*_#\-.]+$/.test(normalized)) return true;
  return false;
}

function shouldIgnoreSensitiveRow(row: DtiSensitiveHitRow): boolean {
  const tag = normalizeSensitiveTag(row.tag);
  if (tag === 'credit_cards') {
    return isAllZeroCreditCardValue(row.clear_value) || isAllZeroCreditCardValue(row.masked_value);
  }
  if (tag === 'passwords') {
    const rawValue = String(row.clear_value || row.masked_value || '');
    if (isInvalidPasswordEvidenceValue(rawValue)) return true;
    const policy = String((row as any).match_policy || '').toLowerCase();
    if (policy && policy !== 'strict_pair') return true;
    return false;
  }
  return false;
}

function buildCoverageControls(
  moduleRows: ModuleResultLite[],
  tier: 'standard' | 'extended',
  intelxInfo?: IntelxCoverageInfo | null,
): CoverageControl[] {
  const mapping: Array<{ key: string; control: string; modules: string[]; source: string }> = [
    { key: 'dns', control: 'DNS', modules: ['dns', 'dnssec', 'dns_blocklists'], source: 'SurfaceScan360' },
    { key: 'whois', control: 'WHOIS/RDAP', modules: ['whois'], source: 'SurfaceScan360' },
    { key: 'email_security', control: 'Email security', modules: ['mail_security', 'mail_config'], source: 'SurfaceScan360' },
    { key: 'ports_services', control: 'Porte e servizi', modules: ['open_ports', 'shodan'], source: 'SurfaceScan360' },
    { key: 'intelx_domain', control: 'DarkRisk360 dominio', modules: [], source: 'DarkRisk360' },
    { key: 'intelx_selectors', control: 'DarkRisk360 selector', modules: [], source: 'DarkRisk360' },
    { key: 'phonebook', control: 'Phonebook', modules: [], source: 'DarkRisk360' },
  ];

  const rowsByModule = new Map<string, ModuleResultLite>();
  for (const row of moduleRows) {
    const key = String(row.module_key || '').trim().toLowerCase();
    if (!key) continue;
    const current = rowsByModule.get(key);
    if (!current) {
      rowsByModule.set(key, row);
      continue;
    }
    const currentTime = Date.parse(String(current.completed_at || current.created_at || 0));
    const nextTime = Date.parse(String(row.completed_at || row.created_at || 0));
    if (Number.isFinite(nextTime) && nextTime > currentTime) {
      rowsByModule.set(key, row);
    }
  }

  return mapping.map((control) => {
    if (control.modules.length === 0) {
      const isExtendedOnly = control.key === 'phonebook';
      const controlSource = isExtendedOnly && tier !== 'extended'
        ? 'DarkRisk360 (solo Estesa)'
        : presentDarkRiskLabel(control.source);

      let controlStatus: CoverageStatus = 'not_run';
      if (isExtendedOnly && tier !== 'extended') {
        controlStatus = 'planned';
      } else if (intelxInfo?.has_run) {
        if (control.key === 'phonebook') {
          controlStatus = intelxInfo.phonebook_searches_run > 0 ? 'completed' : 'not_run';
        } else if (intelxInfo.searches_run > 0) {
          controlStatus = 'completed';
        } else if (intelxInfo.run_status === 'running' || intelxInfo.run_status === 'queued') {
          controlStatus = 'partial';
        }
      }

      return {
        key: control.key,
        control: control.control,
        status: controlStatus,
        last_execution: intelxInfo?.last_execution || null,
        source: controlSource,
      };
    }

    const moduleHits = control.modules
      .map((moduleKey) => rowsByModule.get(moduleKey))
      .filter((row): row is ModuleResultLite => Boolean(row));

    if (moduleHits.length === 0) {
      return {
        key: control.key,
        control: control.control,
        status: 'not_run' as CoverageStatus,
        last_execution: null,
        source: control.source,
      };
    }

    const statuses = moduleHits.map((hit) => normalizeCoverageStatus(hit.status));
    const hasError = statuses.includes('error');
    const hasCompleted = statuses.includes('completed');
    const hasPartial = statuses.includes('partial');

    let status: CoverageStatus = 'not_run';
    if (hasError && !hasCompleted) status = 'error';
    else if (hasCompleted && (hasPartial || hasError)) status = 'partial';
    else if (hasCompleted) status = 'completed';
    else if (hasPartial) status = 'partial';

    const lastExecution = moduleHits
      .map((hit) => hit.completed_at || hit.created_at)
      .filter((v): v is string => Boolean(v))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;

    return {
      key: control.key,
      control: control.control,
      status,
      last_execution: lastExecution,
      source: presentDarkRiskLabel(control.source),
    };
  });
}

function findImpactedAsset(finding: FindingLite): string | null {
  const candidate = [finding.affected_asset, finding.affected_host, finding.affected_url]
    .map((value) => String(value || '').trim())
    .find((value) => value.length > 0);
  return candidate || null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();

    if (authError || !authData.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const query = new URL(req.url).searchParams;

    const inputCustomerId = String(
      body?.customer_id || query.get('customer_id') || '',
    ).trim();

    const caller = await getCallerProfile(adminClient, authData.user.id);
    const customerId = inputCustomerId || caller.organizationId || '';

    if (!customerId) {
      return jsonResponse({ error: 'customer_id is required' }, 400);
    }

    assertCustomerAccess(caller, customerId);

    const [orgFlagsRes, entitlementRes, grantsRes] = await Promise.all([
      adminClient
        .from('organizations' as any)
        .select('hicompliance_enabled, dark_risk360_enabled')
        .eq('id', customerId)
        .maybeSingle(),
      adminClient
        .from('darkrisk_entitlements' as any)
        .select('enabled, tier, enable_raw_evidence')
        .eq('organization_id', customerId)
        .maybeSingle(),
      adminClient
        .from('darkrisk_capability_grants' as any)
        .select('capability, enabled')
        .eq('organization_id', customerId)
        .eq('enabled', true),
    ]);

    const orgFlags = orgFlagsRes.data || null;
    let entitlement: { enabled?: boolean | null; tier?: string | null; enable_raw_evidence?: boolean | null } | null = null;
    if (!entitlementRes.error) {
      entitlement = (entitlementRes.data || null) as any;
    } else {
      const missingRelation = String((entitlementRes.error as any)?.code || '') === '42P01';
      if (!missingRelation) {
        throw entitlementRes.error;
      }
    }

    if (grantsRes.error && String((grantsRes.error as any)?.code || '') !== '42P01') {
      throw grantsRes.error;
    }
    const grantRows = (grantsRes.data || []) as Array<{ capability?: string | null; enabled?: boolean | null }>;
    const darkRiskCapabilities = resolveDarkRiskCapabilities({
      grants: grantRows,
      legacyEnabled: Boolean(entitlement?.enabled || orgFlags?.hicompliance_enabled || orgFlags?.dark_risk360_enabled),
      legacyTier: entitlement?.tier,
    });
    const darkRiskEnabled = darkRiskCapabilities.has('standard_monitor');
    const darkRiskTier = darkRiskCapabilities.has('extended_identity')
      ? 'extended'
      : 'standard';
    // The overview is the Standard/count-only projection. Clear Identity data
    // is served only by the run-scoped Extended results boundary.
    const privilegedSensitiveView = false;

    const latestDarkriskRunRes = await adminClient
      .from('darkrisk_scan_runs' as any)
      .select('id, status, created_at, completed_at, stats')
      .eq('organization_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestDarkriskRunRes.error) throw latestDarkriskRunRes.error;
    const latestDarkriskRun = latestDarkriskRunRes.data as any;
    const latestDarkriskIntelxStats = latestDarkriskRun?.stats?.intelx || {};
    const intelxCoverage: IntelxCoverageInfo = {
      has_run: Boolean(latestDarkriskRun?.id),
      run_status: String(latestDarkriskRun?.status || '').toLowerCase(),
      selectors_considered: Number(latestDarkriskIntelxStats?.selectors_considered || 0),
      query_terms_considered: Number(latestDarkriskIntelxStats?.query_terms_considered || 0),
      searches_run: Number(latestDarkriskIntelxStats?.searches_run || 0),
      email_queries_run: Number(latestDarkriskIntelxStats?.email_queries_run || 0),
      strict_password_hits: Number(latestDarkriskIntelxStats?.strict_password_hits || 0),
      metadata_only_hits: Number(latestDarkriskIntelxStats?.metadata_only_hits || 0),
      at_domain_tld_queries: Number(latestDarkriskIntelxStats?.at_domain_tld_queries || 0),
      phonebook_searches_run: Number(latestDarkriskIntelxStats?.phonebook_searches_run || 0),
      last_execution: latestDarkriskRun?.completed_at || latestDarkriskRun?.created_at || null,
    };

    const latestLiveJobQuery = adminClient
      .from('surface_scan_jobs' as any)
      .select('id, created_at, completed_at, status, scan_profile, scan_type, summary')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const fallbackLatestLiveJobQuery = adminClient
      .from('surface_scan_jobs' as any)
      .select('id, created_at, completed_at, status, scan_profile, scan_type, summary')
      .eq('organization_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestSnapshotJobQuery = adminClient
      .from('surface_scan_jobs' as any)
      .select('id, created_at, completed_at, status, scan_profile, scan_type, summary')
      .eq('customer_id', customerId)
      .in('status', goodSurfaceSnapshotStatuses)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const fallbackLatestSnapshotJobQuery = adminClient
      .from('surface_scan_jobs' as any)
      .select('id, created_at, completed_at, status, scan_profile, scan_type, summary')
      .eq('organization_id', customerId)
      .in('status', goodSurfaceSnapshotStatuses)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const [latestLivePrimaryRes, latestLiveFallbackRes, latestSnapshotPrimaryRes, latestSnapshotFallbackRes] = await Promise.all([
      latestLiveJobQuery,
      fallbackLatestLiveJobQuery,
      latestSnapshotJobQuery,
      fallbackLatestSnapshotJobQuery,
    ]);

    const latestLiveJob = latestLivePrimaryRes.data || latestLiveFallbackRes.data || null;
    const latestSnapshotJob = latestSnapshotPrimaryRes.data || latestSnapshotFallbackRes.data || null;
    const dataJob = latestSnapshotJob || latestLiveJob || null;
    const usingLastGoodFallback = Boolean(
      latestLiveJob?.id &&
      dataJob?.id &&
      String(latestLiveJob.id) !== String(dataJob.id),
    );

    let previousDataJob: any = null;
    if (dataJob?.created_at) {
      const previousDataJobRes = await adminClient
        .from('surface_scan_jobs' as any)
        .select('id, created_at, completed_at, status, scan_profile, scan_type')
        .eq('customer_id', customerId)
        .in('status', goodSurfaceSnapshotStatuses)
        .lt('created_at', String(dataJob.created_at))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      previousDataJob = previousDataJobRes.data || null;
    }

    const dtiSensitiveHitFields = privilegedSensitiveView
      ? 'id, source_run_id, source_record_id, finding_id, source, source_label, query_kind, query_term, asset_scope, tag, masked_value, clear_value, match_policy, extraction_confidence, evidence_scope, created_at'
      : 'id, source_run_id, source_record_id, finding_id, source, source_label, query_kind, query_term, asset_scope, tag, masked_value, match_policy, extraction_confidence, evidence_scope, created_at';

    const [
      alertConfigsRes,
      monitoredDomainsRes,
      moduleRowsRes,
      latestFindingsRes,
      latestExposureFindingsRes,
      previousFindingsRes,
      previousExposureFindingsRes,
      openPortsRes,
      dtiSourceRunsRes,
      dtiSensitiveHitsRes,
    ] = await Promise.all([
      adminClient
        .from('dark_risk_alerts' as any)
        .select('id, is_active')
        .eq('organization_id', customerId),
      adminClient
        .from('surface_scan_monitored_ips' as any)
        .select('id, entry_type, input_value')
        .eq('organization_id', customerId),
      dataJob?.id
        ? adminClient
            .from('surface_scan_module_results' as any)
            .select('module_key, module_label, status, completed_at, created_at')
            .eq('scan_job_id', dataJob.id)
        : Promise.resolve({ data: [], error: null }),
      dataJob?.id
        ? adminClient
            .from('surface_findings' as any)
            .select('id, severity, title, finding_type, module, created_at, status, affected_asset, attribution_confidence')
            .eq('scan_job_id', dataJob.id)
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      dataJob?.id
        ? adminClient
            .from('surface_exposure_findings' as any)
            .select('id, severity, title, finding_type, source, created_at, status, affected_host, affected_url')
            .eq('scan_job_id', dataJob.id)
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      previousDataJob?.id
        ? adminClient
            .from('surface_findings' as any)
            .select('id, severity, title, finding_type, module, created_at, status, affected_asset, attribution_confidence')
            .eq('scan_job_id', previousDataJob.id)
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      previousDataJob?.id
        ? adminClient
            .from('surface_exposure_findings' as any)
            .select('id, severity, title, finding_type, source, created_at, status, affected_host, affected_url')
            .eq('scan_job_id', previousDataJob.id)
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      dataJob?.id
        ? adminClient
            .from('surface_open_ports' as any)
            .select('id, exposure_level')
            .eq('scan_job_id', dataJob.id)
        : Promise.resolve({ data: [], error: null }),
      latestDarkriskRun?.id
        ? adminClient
            .from('darkrisk_dti_source_runs' as any)
            .select('id, source, source_label, source_key, query_kind, query_term, asset_scope, selector_value, status, result_count, warning, error_message, completed_at, metadata')
            .eq('scan_run_id', latestDarkriskRun.id)
            .order('created_at', { ascending: false })
            .limit(1200)
        : Promise.resolve({ data: [], error: null }),
      latestDarkriskRun?.id
        ? adminClient
            .from('darkrisk_dti_sensitive_hits' as any)
            .select(dtiSensitiveHitFields)
            .eq('scan_run_id', latestDarkriskRun.id)
            .order('created_at', { ascending: false })
            .limit(3500)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (alertConfigsRes.error) throw alertConfigsRes.error;
    if (monitoredDomainsRes.error) throw monitoredDomainsRes.error;
    if ((moduleRowsRes as any).error) throw (moduleRowsRes as any).error;
    if ((latestFindingsRes as any).error) throw (latestFindingsRes as any).error;
    if ((latestExposureFindingsRes as any).error) throw (latestExposureFindingsRes as any).error;
    if ((previousFindingsRes as any).error) throw (previousFindingsRes as any).error;
    if ((previousExposureFindingsRes as any).error) throw (previousExposureFindingsRes as any).error;
    if ((openPortsRes as any).error) throw (openPortsRes as any).error;
    if ((dtiSourceRunsRes as any).error) throw (dtiSourceRunsRes as any).error;
    if ((dtiSensitiveHitsRes as any).error) throw (dtiSensitiveHitsRes as any).error;

    const moduleRows = ((moduleRowsRes as any).data || []) as ModuleResultLite[];
    const coverageControls = buildCoverageControls(moduleRows, darkRiskTier, intelxCoverage);

    const latestFindings = [
      ...(((latestFindingsRes as any).data || []) as FindingLite[]),
      ...(((latestExposureFindingsRes as any).data || []) as FindingLite[]),
    ];

    const previousFindings = [
      ...(((previousFindingsRes as any).data || []) as FindingLite[]),
      ...(((previousExposureFindingsRes as any).data || []) as FindingLite[]),
    ];

    const activeLatest = latestFindings.filter((finding) => isActiveFinding(finding.status));
    const activePrevious = previousFindings.filter((finding) => isActiveFinding(finding.status));

    const credentialsRegex = /credential|credenzial|password|stealer|compromis|leak/i;
    const credentialsLatest = latestFindings.filter((finding) => {
      const text = `${finding.finding_type || ''} ${finding.title || ''}`;
      return credentialsRegex.test(text);
    });
    const credentialsPrevious = previousFindings.filter((finding) => {
      const text = `${finding.finding_type || ''} ${finding.title || ''}`;
      return credentialsRegex.test(text);
    });

    const criticalLatestCount = latestFindings.filter((finding) => normalizeSeverity(finding.severity) === 'critical').length;
    const criticalPreviousCount = previousFindings.filter((finding) => normalizeSeverity(finding.severity) === 'critical').length;

    const highLatestCount = latestFindings.filter((finding) => normalizeSeverity(finding.severity) === 'high').length;
    const highPreviousCount = previousFindings.filter((finding) => normalizeSeverity(finding.severity) === 'high').length;

    const risk = riskFromFindings(activeLatest);

    const monitoredDomainRules = ((monitoredDomainsRes.data || []) as Array<{ entry_type?: string | null; input_value?: string | null }>)
      .filter((row) => {
        const entryType = String(row.entry_type || '').toLowerCase();
        const value = String(row.input_value || '').toLowerCase();
        return entryType === 'domain' || value.includes('.') && /[a-z]/i.test(value);
      }).length;

    const exposedServicesCount = (((openPortsRes as any).data || []) as Array<{ exposure_level?: string | null }>).filter((port) => {
      const level = String(port.exposure_level || '').toLowerCase();
      return level === 'critical' || level === 'high';
    }).length;

    const dtiSourceRuns = ((dtiSourceRunsRes as any).data || []) as Array<Record<string, unknown>>;
    const dtiSensitiveRows = ((dtiSensitiveHitsRes as any).data || []) as DtiSensitiveHitRow[];

    const dtiRunCounters = {
      completed: 0,
      partial: 0,
      failed: 0,
      skipped: 0,
      total: dtiSourceRuns.length,
    };
    for (const row of dtiSourceRuns) {
      const status = normalizeCoverageStatus(String(row.status || ''));
      if (status === 'completed') dtiRunCounters.completed += 1;
      else if (status === 'partial') dtiRunCounters.partial += 1;
      else if (status === 'error') dtiRunCounters.failed += 1;
      else dtiRunCounters.skipped += 1;
    }

    const coveredAtDomain = new Set<string>();
    const coveredSelector = new Set<string>();
    const coveredEmail = new Set<string>();
    for (const row of dtiSourceRuns) {
      const qt = String(row.query_term || '').toLowerCase();
      if (!qt) continue;
      const qk = String(row.query_kind || '').toLowerCase();
      if (qk === 'at_domain_tld') coveredAtDomain.add(qt);
      else if (isEmailSelectorCoverageKind(qk, qt)) coveredEmail.add(qt);
      else if (qk === 'selector') coveredSelector.add(qt);
    }
    const dtiQueryCoverage = {
      at_domain_tld: coveredAtDomain.size,
      selector: coveredSelector.size,
      email_selector: coveredEmail.size,
    };

    const sensitiveTotals: Record<DtiSensitiveTag, number> = {
      domains: 0,
      passwords: 0,
      addresses: 0,
      credit_cards: 0,
      phone_numbers: 0,
    };
    const sensitiveByAsset = new Map<string, Record<string, number>>();
    const sensitiveSampleRows: Array<Record<string, unknown>> = [];
    for (const row of dtiSensitiveRows) {
      if (shouldIgnoreSensitiveRow(row)) continue;
      const tag = normalizeSensitiveTag(row.tag);
      if (!tag) continue;
      sensitiveTotals[tag] += 1;
      const scopeKey = String(row.asset_scope || row.query_term || 'n/a').toLowerCase();
      const current = sensitiveByAsset.get(scopeKey) || {};
      current[tag] = Number(current[tag] || 0) + 1;
      sensitiveByAsset.set(scopeKey, current);
      if (sensitiveSampleRows.length < 120) {
        sensitiveSampleRows.push({
          id: String((row as any).id || ''),
          source_run_id: String((row as any).source_run_id || ''),
          source_record_id: String((row as any).source_record_id || ''),
          finding_id: String((row as any).finding_id || ''),
          source: presentDarkRiskLabel(String(row.source_label || row.source || 'DarkRisk360')),
          query_kind: String(row.query_kind || ''),
          query_term: String(row.query_term || ''),
          asset_scope: String(row.asset_scope || ''),
          tag,
          value: String(privilegedSensitiveView ? row.clear_value || row.masked_value || '' : row.masked_value || ''),
          masked_value: String(row.masked_value || ''),
          match_policy: String((row as any).match_policy || ''),
          extraction_confidence: String((row as any).extraction_confidence || ''),
          evidence_scope: String((row as any).evidence_scope || ''),
          created_at: row.created_at || null,
        });
      }
    }

    const sensitiveByAssetRows = Array.from(sensitiveByAsset.entries())
      .map(([asset_scope, values]) => ({
        asset_scope,
        domains: Number(values.domains || 0),
        passwords: Number(values.passwords || 0),
        addresses: Number(values.addresses || 0),
        credit_cards: Number(values.credit_cards || 0),
        phone_numbers: Number(values.phone_numbers || 0),
        total: Number(values.domains || 0) + Number(values.passwords || 0) + Number(values.addresses || 0) + Number(values.credit_cards || 0) + Number(values.phone_numbers || 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 120);

    const recentAlerts = [...activeLatest]
      .sort((a, b) => Date.parse(String(b.created_at || 0)) - Date.parse(String(a.created_at || 0)))
      .slice(0, 8)
      .map((finding) => {
        const category = classifyThreatCategory(finding);
        return {
          id: finding.id,
          severity: normalizeSeverity(finding.severity),
          title: finding.title || finding.finding_type || 'Nuova evidenza rilevata',
          asset: findImpactedAsset(finding),
          type: category,
          time: finding.created_at,
          status: normalizeFindingStatus(finding.status),
          confidence: String(finding.attribution_confidence || 'medium').toLowerCase(),
          source: presentDarkRiskLabel(String(finding.module || finding.source || 'surface_scan_engine')),
          finding_id: finding.id,
        };
      });

    const categoryMap = new Map<string, { count: number; severity_max: Severity }>();
    for (const finding of activeLatest) {
      const category = classifyThreatCategory(finding);
      const severity = normalizeSeverity(finding.severity);
      const current = categoryMap.get(category);
      if (!current) {
        categoryMap.set(category, { count: 1, severity_max: severity });
        continue;
      }

      current.count += 1;
      if (severityRank[severity] > severityRank[current.severity_max]) {
        current.severity_max = severity;
      }
    }

    const previousCategoryMap = new Map<string, number>();
    for (const finding of activePrevious) {
      const category = classifyThreatCategory(finding);
      previousCategoryMap.set(category, (previousCategoryMap.get(category) || 0) + 1);
    }

    const threatGroups = Array.from(categoryMap.entries())
      .map(([category, value]) => ({
        category,
        count: value.count,
        severity_max: value.severity_max,
        description: categoryDescription(category),
        trend_delta: value.count - (previousCategoryMap.get(category) || 0),
      }))
      .sort((a, b) => b.count - a.count);

    const coverageCompleted = coverageControls.filter((control) => control.status === 'completed').length;
    const coveragePartial = coverageControls.filter((control) => control.status === 'partial').length;

    const previousScanEnd = previousDataJob?.completed_at || previousDataJob?.created_at || null;
    const newAlertsSincePrevious = previousScanEnd
      ? activeLatest.filter((finding) => {
          if (!finding.created_at) return false;
          return Date.parse(finding.created_at) > Date.parse(String(previousScanEnd));
        }).length
      : activeLatest.length;

    const impactedIdentities = new Set(
      credentialsLatest
        .map((finding) => findImpactedAsset(finding))
        .filter((value): value is string => Boolean(value)),
    ).size;

    return jsonResponse({
      customer_id: customerId,
      enabled: Boolean(darkRiskEnabled),
      tier: darkRiskTier,
      latest_scan: latestLiveJob
        ? {
            id: latestLiveJob.id,
            status: String(latestLiveJob.status || 'unknown').toLowerCase(),
            profile: latestLiveJob.scan_profile || null,
            type: latestLiveJob.scan_type || null,
            started_at: latestLiveJob.created_at || null,
            completed_at: latestLiveJob.completed_at || null,
            data_scan_id: dataJob?.id || null,
            data_scan_status: dataJob?.status ? String(dataJob.status).toLowerCase() : null,
            data_scan_at: dataJob?.completed_at || dataJob?.created_at || null,
            using_last_good_fallback: usingLastGoodFallback,
          }
        : null,
      previous_scan: previousDataJob
        ? {
            id: previousDataJob.id,
            started_at: previousDataJob.created_at || null,
            completed_at: previousDataJob.completed_at || null,
          }
        : null,
      kpis: {
        active_threats: {
          value: activeLatest.length,
          delta: activeLatest.length - activePrevious.length,
        },
        credential_leaks: {
          value: credentialsLatest.length,
          delta: credentialsLatest.length - credentialsPrevious.length,
        },
        monitored_domains: {
          value: monitoredDomainRules,
          delta: null,
        },
        risk_score: {
          value: risk.score,
          level: risk.level,
          delta: risk.score - riskFromFindings(activePrevious).score,
        },
        last_scan: {
          value: dataJob?.completed_at || dataJob?.created_at || latestLiveJob?.completed_at || latestLiveJob?.created_at || null,
          delta: null,
        },
        controls_coverage: {
          value: coverageControls.length > 0 ? Math.round((coverageCompleted / coverageControls.length) * 100) : 0,
          completed: coverageCompleted,
          partial: coveragePartial,
          total: coverageControls.length,
        },
        critical_findings: {
          value: criticalLatestCount,
          delta: criticalLatestCount - criticalPreviousCount,
        },
        new_alerts: {
          value: newAlertsSincePrevious,
          delta: null,
        },
        high_priority_findings: {
          value: highLatestCount,
          delta: highLatestCount - highPreviousCount,
        },
        impacted_identities: {
          value: impactedIdentities,
          delta: null,
        },
        exposed_services: {
          value: exposedServicesCount,
          delta: null,
        },
      },
      coverage_controls: coverageControls,
      threat_groups: threatGroups,
      recent_alerts: recentAlerts,
      alert_config: {
        total: (alertConfigsRes.data || []).length,
        active: ((alertConfigsRes.data || []) as Array<{ is_active?: boolean }>).filter((alert) => Boolean(alert.is_active)).length,
      },
      dti: {
        privileged_sensitive_view: privilegedSensitiveView,
        source_runs: dtiRunCounters,
        query_coverage: dtiQueryCoverage,
        sensitive_totals: {
          ...sensitiveTotals,
          total: sensitiveTotals.domains + sensitiveTotals.passwords + sensitiveTotals.addresses + sensitiveTotals.credit_cards + sensitiveTotals.phone_numbers,
        },
        sensitive_by_asset: sensitiveByAssetRows,
        sensitive_samples: sensitiveSampleRows,
        latest_scan_run_id: latestDarkriskRun?.id || null,
        intelx_stats: {
          email_queries_run: intelxCoverage.email_queries_run,
          strict_password_hits: intelxCoverage.strict_password_hits,
          metadata_only_hits: intelxCoverage.metadata_only_hits,
        },
      },
    });
  } catch (error: any) {
    return jsonResponse({
      error: error?.message || 'Internal error',
    }, 500);
  }
});
