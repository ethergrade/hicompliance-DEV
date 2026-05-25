import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from '../_shared/surface-scan-utils.ts';
import {
  mapSurfaceSeverity,
  maskPotentialSecrets,
  normalizeAssetValue,
  normalizeText,
} from '../_shared/darkrisk-utils.ts';
import {
  calculateFindingRiskScore,
  inferCompromiseType,
  inferRiskDimensions,
} from '../_shared/darkrisk-scoring.ts';
import {
  detectSensitiveIndicators,
  hasSensitiveIndicators,
} from '../_shared/darkrisk-sensitive-detection.ts';
import {
  type DarkRiskSelectorType,
  validateDarkRiskSelector,
} from '../_shared/darkrisk-selector-validation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const INTELX_API_KEY = Deno.env.get('INTELX_API_KEY') || '';
const INTELX_API_URL = String(
  Deno.env.get('INTELX_API_URL') ||
  Deno.env.get('INTELX_BASE_URL') ||
  'https://2.intelx.io',
).replace(/\/+$/, '');
const INTELX_MAX_SELECTORS_PER_RUN = Math.max(
  1,
  Math.min(10, Number(Deno.env.get('INTELX_MAX_SELECTORS_PER_RUN') || 5)),
);
const INTELX_MAX_RESULTS_PER_SELECTOR = Math.max(
  5,
  Math.min(80, Number(Deno.env.get('INTELX_MAX_RESULTS_PER_SELECTOR') || 20)),
);
const INTELX_MAX_POLL_ROUNDS = Math.max(
  2,
  Math.min(18, Number(Deno.env.get('INTELX_MAX_POLL_ROUNDS') || 8)),
);
const INTELX_REQUEST_INTERVAL_MS = Math.max(
  300,
  Math.min(2000, Number(Deno.env.get('INTELX_REQUEST_INTERVAL_MS') || 1000)),
);
const INTELX_MAX_QUERY_TERMS_PER_RUN = Math.max(
  5,
  Math.min(120, Number(Deno.env.get('INTELX_MAX_QUERY_TERMS_PER_RUN') || 40)),
);

type SurfaceAssetRow = {
  id: string;
  asset_type: string | null;
  asset_value: string | null;
  source: string | null;
  raw: Record<string, unknown> | null;
};

type ScopeRuleRow = {
  entry_type: string | null;
  input_value: string | null;
  ip_start?: string | null;
  ip_end?: string | null;
};

type SurfaceFindingRow = {
  id: string;
  finding_type: string | null;
  title: string | null;
  description: string | null;
  severity: string | null;
  module: string | null;
  affected_asset: string | null;
  affected_url: string | null;
  status: string | null;
  evidence: Record<string, unknown> | null;
  created_at: string | null;
};

type ExposureFindingRow = {
  id: string;
  finding_type: string | null;
  title: string | null;
  description: string | null;
  severity: string | null;
  source: string | null;
  affected_host: string | null;
  affected_url: string | null;
  status: string | null;
  evidence: string | null;
  raw: Record<string, unknown> | null;
  created_at: string | null;
};

type CanonicalFinding = {
  origin: 'surface_findings' | 'surface_exposure_findings';
  source_id: string;
  finding_type: string;
  title: string;
  description: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  module: string;
  status: string;
  affected_asset: string;
  created_at: string | null;
  payload: Record<string, unknown>;
};

type IntelxSearchResponse = {
  id?: string;
  status?: number;
  records?: Array<Record<string, unknown>>;
};

type IntelxSelectorDefinition = {
  raw: string;
  normalized: string;
  type: DarkRiskSelectorType;
};

type IntelxQueryTerm = {
  term: string;
  kind: 'selector' | 'at_domain_tld';
  selectorNormalized: string | null;
  linkedAssetNormalized: string | null;
};

const intelxAllowedSelectorTypes = new Set([
  'email',
  'domain',
  'wildcard_domain',
  'url',
  'ipv4',
  'ipv6',
  'cidrv4',
  'cidrv6',
]);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isIntelxConfigured(): boolean {
  return Boolean(INTELX_API_KEY && INTELX_API_URL);
}

function severityFromIntelxScore(score: number | null): 'info' | 'low' | 'medium' | 'high' | 'critical' {
  if (score == null || !Number.isFinite(score)) return 'medium';
  if (score >= 90) return 'critical';
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 30) return 'low';
  return 'info';
}

const severityRank: Record<'info' | 'low' | 'medium' | 'high' | 'critical', number> = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

function boostSeverityForSensitiveData(
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical',
  indicators: ReturnType<typeof detectSensitiveIndicators>,
): 'info' | 'low' | 'medium' | 'high' | 'critical' {
  let minSeverity: 'info' | 'low' | 'medium' | 'high' | 'critical' = 'info';
  if (indicators.credit_cards > 0 || indicators.passwords > 0) minSeverity = 'high';
  else if (indicators.addresses > 0 || indicators.phone_numbers > 0) minSeverity = 'medium';
  else if (indicators.domains > 0) minSeverity = 'low';

  return severityRank[severity] >= severityRank[minSeverity] ? severity : minSeverity;
}

function intelxFindingTypeFromRecord(record: Record<string, unknown>, selector: string): string {
  const text = `${String(selector || '')} ${String(record?.name || '')} ${String(record?.description || '')}`.toLowerCase();
  if (/credential|password|stealer|combo|leak/.test(text)) return 'intelx_credential_exposure';
  if (/email|mailbox|account/.test(text)) return 'intelx_identity_exposure';
  if (/domain|subdomain|host|whois/.test(text)) return 'intelx_domain_exposure';
  return 'intelx_exposure_signal';
}

function normalizeIntelxRecordKey(selector: string, record: Record<string, unknown>): string {
  const systemId = normalizeText(String(record?.systemid || ''));
  const storageId = normalizeText(String(record?.storageid || ''));
  if (systemId) return `${selector}|systemid:${systemId}`;
  if (storageId) return `${selector}|storageid:${storageId}`;
  const fallback = normalizeText(String(record?.name || record?.description || '')).slice(0, 120);
  return `${selector}|fallback:${fallback || crypto.randomUUID()}`;
}

function collectIntelxSelectors(
  assetRows: Array<Record<string, unknown>>,
  canonicalFindings: CanonicalFinding[],
  scopeDomains: string[] = [],
): string[] {
  const candidates = new Set<string>();

  for (const row of assetRows) {
    const normalized = normalizeText(String((row as any)?.normalized_value || (row as any)?.value || ''));
    if (normalized) candidates.add(normalized);
  }

  for (const finding of canonicalFindings) {
    const asset = normalizeText(finding.affected_asset);
    if (asset) candidates.add(asset);
  }

  for (const scopeDomain of scopeDomains) {
    const normalizedScopeDomain = normalizeText(scopeDomain).toLowerCase();
    if (normalizedScopeDomain) candidates.add(normalizedScopeDomain);
  }

  const selectors: string[] = [];
  for (const candidate of candidates) {
    const validation = validateDarkRiskSelector(candidate);
    if (!validation.valid || !validation.type || !validation.normalized) continue;
    if (!intelxAllowedSelectorTypes.has(validation.type)) continue;
    selectors.push(validation.normalized);
  }

  return [...new Set(selectors)].slice(0, INTELX_MAX_SELECTORS_PER_RUN);
}

function isDomainLike(value: string): boolean {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value);
}

function normalizeScopeDomain(value: string): string {
  return normalizeText(value).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

function buildAtDomainTldTerms(scopeDomains: string[]): string[] {
  const normalizedDomains = [...new Set(scopeDomains.map((entry) => normalizeScopeDomain(entry)).filter(isDomainLike))];
  const direct = normalizedDomains.map((domain) => `@${domain}`);

  const tlds = [...new Set(normalizedDomains.map((domain) => domain.split('.').slice(1).join('.')).filter(Boolean))];
  const bases = [...new Set(normalizedDomains.map((domain) => domain.split('.')[0]).filter(Boolean))];
  const crossTld: string[] = [];
  for (const base of bases) {
    for (const tld of tlds) {
      crossTld.push(`@${base}.${tld}`);
    }
  }

  return [...new Set([...direct, ...crossTld])];
}

function buildIntelxQueryTerms(
  selectors: IntelxSelectorDefinition[],
  scopeDomains: string[],
): IntelxQueryTerm[] {
  const terms: IntelxQueryTerm[] = [];
  const dedupe = new Set<string>();

  for (const selector of selectors) {
    const term = normalizeText(selector.normalized);
    if (!term) continue;
    const key = `selector:${term.toLowerCase()}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    terms.push({
      term,
      kind: 'selector',
      selectorNormalized: selector.normalized,
      linkedAssetNormalized: selector.normalized,
    });
  }

  const atDomainTerms = buildAtDomainTldTerms(scopeDomains);
  for (const atTerm of atDomainTerms) {
    const clean = normalizeText(atTerm).toLowerCase();
    if (!clean) continue;
    const key = `at_domain_tld:${clean}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    terms.push({
      term: clean,
      kind: 'at_domain_tld',
      selectorNormalized: null,
      linkedAssetNormalized: clean.replace(/^@/, ''),
    });
  }

  return terms.slice(0, INTELX_MAX_QUERY_TERMS_PER_RUN);
}

async function intelxSubmitSearch(term: string): Promise<string | null> {
  const payload = {
    term,
    buckets: [],
    lookuplevel: 0,
    maxresults: INTELX_MAX_RESULTS_PER_SELECTOR,
    timeout: 5,
    datefrom: '',
    dateto: '',
    sort: 2,
    media: 0,
    terminate: [],
  };

  const response = await fetch(`${INTELX_API_URL}/intelligent/search`, {
    method: 'POST',
    headers: {
      'X-Key': INTELX_API_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'HICONSOLE-DarkRisk360/1.0',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DarkRisk360 intelligence search submit failed (${response.status}): ${errorText.slice(0, 180)}`);
  }

  const data = (await response.json()) as IntelxSearchResponse;
  if (Number(data?.status) === 1) return null;
  return normalizeText(String(data?.id || '')) || null;
}

async function intelxFetchSearchResult(searchId: string): Promise<IntelxSearchResponse> {
  const url = new URL(`${INTELX_API_URL}/intelligent/search/result`);
  url.searchParams.set('id', searchId);
  url.searchParams.set('limit', String(INTELX_MAX_RESULTS_PER_SELECTOR));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-Key': INTELX_API_KEY,
      'User-Agent': 'HICONSOLE-DarkRisk360/1.0',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DarkRisk360 intelligence search result failed (${response.status}): ${errorText.slice(0, 180)}`);
  }
  return (await response.json()) as IntelxSearchResponse;
}

async function intelxTerminateSearch(searchId: string): Promise<void> {
  const url = new URL(`${INTELX_API_URL}/intelligent/search/terminate`);
  url.searchParams.set('id', searchId);
  await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-Key': INTELX_API_KEY,
      'User-Agent': 'HICONSOLE-DarkRisk360/1.0',
    },
  }).catch(() => undefined);
}

async function runIntelxSearch(selector: string): Promise<Array<Record<string, unknown>>> {
  const searchId = await intelxSubmitSearch(selector);
  if (!searchId) return [];

  const collected: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  try {
    for (let round = 0; round < INTELX_MAX_POLL_ROUNDS; round += 1) {
      await wait(INTELX_REQUEST_INTERVAL_MS);
      const result = await intelxFetchSearchResult(searchId);
      const status = Number(result?.status ?? 3);
      const records = Array.isArray(result?.records) ? result.records : [];

      for (const record of records) {
        const dedupeKey = normalizeIntelxRecordKey(selector, record);
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        collected.push(record);
      }

      if (status === 1 || status === 2) break;
      if (status === 0 && records.length === 0) break;
    }
  } finally {
    await wait(250);
    await intelxTerminateSearch(searchId);
  }

  return collected.slice(0, INTELX_MAX_RESULTS_PER_SELECTOR);
}

function daysSince(value: string | null | undefined): number | null {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) return null;
  const diff = Date.now() - parsed;
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function inferAssetCriticality(input: string): 'low' | 'medium' | 'high' {
  const text = normalizeText(input).toLowerCase();
  if (!text) return 'medium';
  if (/admin|login|vpn|gateway|mail|mx|auth|panel|firewall|domain controller/.test(text)) return 'high';
  if (/staging|dev|test|sandbox/.test(text)) return 'low';
  return 'medium';
}

function inferConfidence(finding: CanonicalFinding): 'low' | 'medium' | 'high' {
  const text = `${finding.finding_type} ${finding.title} ${finding.module}`.toLowerCase();
  if (/cve|credential|verified|critical|high/.test(text)) return 'high';
  if (/candidate|possible|unknown/.test(text)) return 'low';
  return 'medium';
}

function classifyThreatCategoryText(input: string): string {
  const sourceText = normalizeText(input).toLowerCase();
  if (/credential|credenzial|password|stealer|compromis/.test(sourceText)) return 'Credenziali compromesse';
  if (/mail|email/.test(sourceText) && /leak|expos|compromis/.test(sourceText)) return 'Email esposte';
  if (/database|dump|db /.test(sourceText)) return 'Database leak';
  if (/phish|brand|impersonation/.test(sourceText)) return 'Phishing e brand abuse';
  if (/open_port|open port|service_fingerprint|ports|pentest_tool|shodan/.test(sourceText)) return 'Servizi esposti';
  if (/dmarc|spf|dkim|mail_security|mx|bimi/.test(sourceText)) return 'Email security';
  if (/dns|tls|ssl|hsts|whois|rdap|http_security|headers/.test(sourceText)) return 'DNS e TLS';
  if (/safe_browsing|urlhaus|phishtank|reputation|dnsbl|threat/.test(sourceText)) return 'Reputation';
  return 'Minacce rilevate';
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function resolveAssetType(value: string): string {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return 'unknown';
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return 'ip';
  if (normalized.includes('/')) return 'cidr';
  if (normalized.includes('@')) return 'email';
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return 'url';
  const labels = normalized.split('.').filter(Boolean);
  if (labels.length >= 3) return 'subdomain';
  if (labels.length === 2) return 'domain';
  return 'host';
}

function normalizeSurfaceFinding(row: SurfaceFindingRow): CanonicalFinding {
  const affected = normalizeText(row.affected_asset) || normalizeText(row.affected_url);
  return {
    origin: 'surface_findings',
    source_id: row.id,
    finding_type: normalizeText(row.finding_type) || 'surface_finding',
    title: normalizeText(row.title) || normalizeText(row.finding_type) || 'Surface finding',
    description: normalizeText(row.description),
    severity: mapSurfaceSeverity(row.severity),
    module: normalizeText(row.module) || 'surface_scan_engine',
    status: normalizeText(row.status) || 'new',
    affected_asset: affected,
    created_at: row.created_at,
    payload: {
      evidence: row.evidence || {},
      module: row.module,
      affected_url: row.affected_url,
      affected_asset: row.affected_asset,
    },
  };
}

function normalizeExposureFinding(row: ExposureFindingRow): CanonicalFinding {
  const affected = normalizeText(row.affected_host) || normalizeText(row.affected_url);
  return {
    origin: 'surface_exposure_findings',
    source_id: row.id,
    finding_type: normalizeText(row.finding_type) || 'surface_exposure_finding',
    title: normalizeText(row.title) || normalizeText(row.finding_type) || 'Surface exposure finding',
    description: normalizeText(row.description),
    severity: mapSurfaceSeverity(row.severity),
    module: normalizeText(row.source) || 'surface_exposure_engine',
    status: normalizeText(row.status) || 'new',
    affected_asset: affected,
    created_at: row.created_at,
    payload: {
      evidence: row.evidence,
      raw: row.raw || {},
      affected_host: row.affected_host,
      affected_url: row.affected_url,
    },
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const startedAt = new Date().toISOString();
  let scanRunId: string | null = null;

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const requestedCustomerId = normalizeText(body?.customer_id);
    const requestedScanJobId = normalizeText(body?.scan_job_id);
    const triggerType = normalizeText(body?.trigger_type) || 'manual';

    const caller = await getCallerProfile(adminClient, authData.user.id);
    const customerId = requestedCustomerId || caller.organizationId || '';
    if (!customerId) return jsonResponse({ error: 'customer_id is required' }, 400);
    assertCustomerAccess(caller, customerId);

    const entitlementRes = await adminClient
      .from('darkrisk_entitlements' as any)
      .select('id, enabled, tier, enable_ai_recommendations')
      .eq('organization_id', customerId)
      .maybeSingle();

    if (entitlementRes.error) {
      const missingTable = String((entitlementRes.error as any)?.code || '') === '42P01';
      if (missingTable) {
        return jsonResponse({ error: 'darkrisk_entitlements table missing. Apply migrations first.' }, 412);
      }
      throw entitlementRes.error;
    }

    const entitlement = entitlementRes.data as {
      id: string;
      enabled: boolean;
      tier: string;
      enable_ai_recommendations?: boolean | null;
    } | null;
    if (!entitlement?.enabled) {
      return jsonResponse({ error: 'DarkRisk360 not enabled for customer' }, 403);
    }

    const scanJobQuery = adminClient
      .from('surface_scan_jobs' as any)
      .select('id, customer_id, organization_id, status, created_at, completed_at, scan_profile')
      .or(`customer_id.eq.${customerId},organization_id.eq.${customerId}`)
      .order('created_at', { ascending: false })
      .limit(1);

    const scanJobRes = requestedScanJobId
      ? await adminClient
          .from('surface_scan_jobs' as any)
          .select('id, customer_id, organization_id, status, created_at, completed_at, scan_profile')
          .eq('id', requestedScanJobId)
          .maybeSingle()
      : await scanJobQuery.maybeSingle();

    if (scanJobRes.error) throw scanJobRes.error;
    const scanJob = scanJobRes.data as any;
    if (!scanJob) return jsonResponse({ error: 'No SurfaceScan360 job found for customer' }, 404);

    const scanOwner = normalizeText(scanJob.customer_id || scanJob.organization_id);
    if (scanOwner !== customerId) {
      return jsonResponse({ error: 'scan_job_id not in selected customer scope' }, 403);
    }

    const { data: scanRunData, error: scanRunErr } = await adminClient
      .from('darkrisk_scan_runs' as any)
      .insert({
        organization_id: customerId,
        tenant_id: customerId,
        tier: String(entitlement.tier || 'standard').toLowerCase() === 'extended' ? 'extended' : 'standard',
        status: 'running',
        trigger_type: triggerType,
        requested_by: authData.user.id,
        surface_scan_job_id: scanJob.id,
        started_at: new Date().toISOString(),
        sources: ['surfacescan360'],
        stats: {},
      })
      .select('id')
      .single();

    if (scanRunErr || !scanRunData?.id) throw scanRunErr || new Error('Unable to create darkrisk scan run');
    scanRunId = scanRunData.id;

    await adminClient
      .from('darkrisk_audit_log' as any)
      .insert({
        organization_id: customerId,
        tenant_id: customerId,
        actor_id: authData.user.id,
        action: 'darkrisk_scan_started',
        entity_type: 'darkrisk_scan_run',
        entity_id: scanRunId,
        reason: triggerType,
        metadata: {
          source: 'surfacescan360',
          surface_scan_job_id: scanJob.id,
          started_at: startedAt,
        },
      });

    const [assetsRes, findingsRes, exposureFindingsRes, scopeRulesRes] = await Promise.all([
      adminClient
        .from('surface_assets' as any)
        .select('id, asset_type, asset_value, source, raw')
        .eq('scan_job_id', scanJob.id),
      adminClient
        .from('surface_findings' as any)
        .select('id, finding_type, title, description, severity, module, affected_asset, affected_url, status, evidence, created_at')
        .eq('scan_job_id', scanJob.id),
      adminClient
        .from('surface_exposure_findings' as any)
        .select('id, finding_type, title, description, severity, source, affected_host, affected_url, status, evidence, raw, created_at')
        .eq('scan_job_id', scanJob.id),
      adminClient
        .from('surface_scan_monitored_ips' as any)
        .select('entry_type, input_value, ip_start, ip_end')
        .eq('organization_id', customerId),
    ]);

    if (assetsRes.error) throw assetsRes.error;
    if (findingsRes.error) throw findingsRes.error;
    if (exposureFindingsRes.error) throw exposureFindingsRes.error;
    if (scopeRulesRes.error) throw scopeRulesRes.error;

    const assets = (assetsRes.data || []) as SurfaceAssetRow[];
    const surfaceFindings = (findingsRes.data || []) as SurfaceFindingRow[];
    const exposureFindings = (exposureFindingsRes.data || []) as ExposureFindingRow[];
    const scopeRules = (scopeRulesRes.data || []) as ScopeRuleRow[];
    const scopeDomains = Array.from(
      new Set(
        scopeRules
          .filter((row) => String(row.entry_type || '').toLowerCase() === 'domain')
          .map((row) => normalizeScopeDomain(String(row.input_value || '')))
          .filter(isDomainLike),
      ),
    );
    const scopeIps = Array.from(
      new Set(
        scopeRules
          .filter((row) => String(row.entry_type || '').toLowerCase() === 'single')
          .map((row) => normalizeText(String(row.input_value || '')))
          .filter((value) => Boolean(value)),
      ),
    );

    const scopeAssetRows: Array<Record<string, unknown>> = [
      ...scopeDomains.map((domain) => ({
        organization_id: customerId,
        tenant_id: customerId,
        asset_type: 'domain',
        value: domain,
        normalized_value: normalizeAssetValue(domain),
        source: 'manual',
        scope_status: 'approved',
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        metadata: {
          discovered_by: 'darkrisk360-sync-surfacescan',
          source_scope_rule: 'domain',
          source_scan_job_id: scanJob.id,
        },
      })),
      ...scopeIps.map((ip) => ({
        organization_id: customerId,
        tenant_id: customerId,
        asset_type: 'ip',
        value: ip,
        normalized_value: normalizeAssetValue(ip),
        source: 'manual',
        scope_status: 'approved',
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        metadata: {
          discovered_by: 'darkrisk360-sync-surfacescan',
          source_scope_rule: 'single',
          source_scan_job_id: scanJob.id,
        },
      })),
    ];

    const assetRows = [
      ...scopeAssetRows,
      ...assets
      .map((asset) => {
        const value = normalizeText(asset.asset_value);
        if (!value) return null;
        const normalizedValue = normalizeAssetValue(value);
        const assetType = normalizeText(asset.asset_type) || resolveAssetType(normalizedValue);

        return {
          organization_id: customerId,
          tenant_id: customerId,
          asset_type: assetType,
          value,
          normalized_value: normalizedValue,
          source: 'surfacescan360',
          scope_status: 'approved',
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          metadata: {
            source_asset_id: asset.id,
            source: asset.source,
            raw: asset.raw || {},
          },
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>,
    ];

    if (assetRows.length > 0) {
      const { error: assetsUpsertErr } = await adminClient
        .from('darkrisk_assets' as any)
        .upsert(assetRows as any, {
          onConflict: 'organization_id,asset_type,normalized_value',
          ignoreDuplicates: false,
        });
      if (assetsUpsertErr) throw assetsUpsertErr;
    }

    const assetValues = Array.from(new Set(assetRows.map((row) => String(row.normalized_value))));
    const darkriskAssetsRes = assetValues.length > 0
      ? await adminClient
          .from('darkrisk_assets' as any)
          .select('id, asset_type, normalized_value')
          .eq('organization_id', customerId)
          .in('normalized_value', assetValues)
      : { data: [], error: null } as any;

    if ((darkriskAssetsRes as any).error) throw (darkriskAssetsRes as any).error;

    const assetByNormalized = new Map<string, { id: string; asset_type: string }>();
    for (const row of ((darkriskAssetsRes as any).data || []) as Array<{ id: string; asset_type: string; normalized_value: string }>) {
      assetByNormalized.set(String(row.normalized_value), { id: row.id, asset_type: row.asset_type });
    }

    const canonicalFindings: CanonicalFinding[] = [
      ...surfaceFindings.map((row) => normalizeSurfaceFinding(row)),
      ...exposureFindings.map((row) => normalizeExposureFinding(row)),
    ];

    const intelxSelectorDefinitions: IntelxSelectorDefinition[] = [];
    for (const selectorValue of collectIntelxSelectors(assetRows, canonicalFindings, scopeDomains)) {
      const validation = validateDarkRiskSelector(selectorValue);
      if (!validation.valid || !validation.type || !validation.normalized) continue;
      intelxSelectorDefinitions.push({
        raw: selectorValue,
        normalized: validation.normalized,
        type: validation.type,
      });
    }

    if (intelxSelectorDefinitions.length > 0) {
      const selectorUpsertRows = intelxSelectorDefinitions.map((selector) => {
        const relatedAsset = assetByNormalized.get(normalizeAssetValue(selector.normalized));
        return {
          organization_id: customerId,
          tenant_id: customerId,
          asset_id: relatedAsset?.id || null,
          selector_type: selector.type,
          value: selector.raw,
          normalized_value: selector.normalized,
          source: 'surfacescan360',
          status: 'approved',
          metadata: {
            discovered_by: 'darkrisk360-sync-surfacescan',
            source_scan_job_id: scanJob.id,
          },
        };
      });

      const { error: selectorUpsertError } = await adminClient
        .from('darkrisk_selectors' as any)
        .upsert(selectorUpsertRows as any, {
          onConflict: 'organization_id,selector_type,normalized_value',
          ignoreDuplicates: false,
        });
      if (selectorUpsertError) throw selectorUpsertError;
    }

    const selectorValues = [...new Set(intelxSelectorDefinitions.map((entry) => entry.normalized))];
    const selectorsRes = selectorValues.length > 0
      ? await adminClient
          .from('darkrisk_selectors' as any)
          .select('id, normalized_value')
          .eq('organization_id', customerId)
          .in('normalized_value', selectorValues)
      : { data: [], error: null } as any;
    if ((selectorsRes as any).error) throw (selectorsRes as any).error;

    const selectorByNormalized = new Map<string, string>();
    for (const row of ((selectorsRes as any).data || []) as Array<{ id: string; normalized_value: string }>) {
      selectorByNormalized.set(String(row.normalized_value), String(row.id));
    }

    const intelxQueryTerms = buildIntelxQueryTerms(intelxSelectorDefinitions, scopeDomains);

    let recordsCreated = 0;
    let evidenceCreated = 0;
    let findingsCreated = 0;
    let alertsCreated = 0;
    let intelxRecordsCreated = 0;
    let intelxEvidenceCreated = 0;
    let intelxFindingsCreated = 0;
    let intelxAlertsCreated = 0;
    let intelxSearchesRun = 0;
    let intelxAtDomainQueries = 0;
    const intelxWarnings: string[] = [];

    for (const finding of canonicalFindings) {
      const affectedNormalized = normalizeAssetValue(finding.affected_asset);
      const existingAssetRef = affectedNormalized ? assetByNormalized.get(affectedNormalized) : undefined;

      let affectedAssetId = existingAssetRef?.id || null;

      if (!affectedAssetId && affectedNormalized) {
        const inferredType = resolveAssetType(affectedNormalized);
        const upsertPayload = {
          organization_id: customerId,
          tenant_id: customerId,
          asset_type: inferredType,
          value: finding.affected_asset,
          normalized_value: affectedNormalized,
          source: 'surfacescan360',
          scope_status: 'approved',
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          metadata: { inferred_from_finding: true },
        };

        const { error: upsertErr } = await adminClient
          .from('darkrisk_assets' as any)
          .upsert(upsertPayload as any, { onConflict: 'organization_id,asset_type,normalized_value' });

        if (upsertErr) throw upsertErr;

        const { data: fetchedAsset } = await adminClient
          .from('darkrisk_assets' as any)
          .select('id')
          .eq('organization_id', customerId)
          .eq('asset_type', inferredType)
          .eq('normalized_value', affectedNormalized)
          .maybeSingle();

        if (fetchedAsset?.id) {
          affectedAssetId = fetchedAsset.id;
          assetByNormalized.set(affectedNormalized, { id: fetchedAsset.id, asset_type: inferredType });
        }
      }

      const sourceRecordKey = `${scanJob.id}:${finding.origin}:${finding.source_id}`;
      const { data: sourceRecord, error: sourceRecordErr } = await adminClient
        .from('darkrisk_source_records' as any)
        .insert({
          organization_id: customerId,
          tenant_id: customerId,
          scan_run_id: scanRunId,
          source: 'surfacescan360',
          asset_id: affectedAssetId,
          source_record_key: sourceRecordKey,
          source_type: finding.origin,
          title: finding.title,
          description: maskPotentialSecrets(finding.description),
          raw_metadata: finding.payload,
          safe_preview: maskPotentialSecrets(`${finding.title}\n${finding.description}`),
          preview_hash: sourceRecordKey,
        })
        .select('id')
        .single();

      if (sourceRecordErr || !sourceRecord?.id) throw sourceRecordErr || new Error('source record insert failed');
      recordsCreated += 1;

      const sensitiveIndicators = detectSensitiveIndicators(
        `${finding.title}\n${finding.description}\n${finding.affected_asset}\n${JSON.stringify(finding.payload || {})}`.slice(0, 4000),
      );

      const { data: evidence, error: evidenceErr } = await adminClient
        .from('darkrisk_evidence' as any)
        .insert({
          organization_id: customerId,
          tenant_id: customerId,
          scan_run_id: scanRunId,
          source_record_id: sourceRecord.id,
          source: 'surfacescan360',
          evidence_class: finding.module || 'surface_scan',
          asset_id: affectedAssetId,
          title: finding.title,
          summary: maskPotentialSecrets(finding.description),
          masked_value: finding.affected_asset ? maskPotentialSecrets(finding.affected_asset) : null,
          severity_hint: finding.severity,
          confidence: 'medium',
          observed_at: finding.created_at || new Date().toISOString(),
          first_seen_at: finding.created_at || new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          visibility: 'customer',
          contains_sensitive_data: hasSensitiveIndicators(sensitiveIndicators),
          metadata: {
            origin: finding.origin,
            source_id: finding.source_id,
            module: finding.module,
            status: finding.status,
            sensitive_indicators: sensitiveIndicators,
          },
        })
        .select('id')
        .single();

      if (evidenceErr || !evidence?.id) throw evidenceErr || new Error('evidence insert failed');
      evidenceCreated += 1;

      const confidence = inferConfidence(finding);
      const freshnessDays = daysSince(finding.created_at);
      const recurrenceCount = canonicalFindings.filter((candidate) =>
        candidate.finding_type === finding.finding_type &&
        normalizeAssetValue(candidate.affected_asset) === normalizeAssetValue(finding.affected_asset),
      ).length;
      const compromiseType = inferCompromiseType({
        findingType: finding.finding_type,
        title: finding.title,
        module: finding.module,
      });
      const riskDimensions = inferRiskDimensions({
        findingType: finding.finding_type,
        title: finding.title,
        module: finding.module,
        confidence,
        freshnessDays,
      });
      if (hasSensitiveIndicators(sensitiveIndicators)) {
        riskDimensions.identity_exposure = Math.min(100, (Number(riskDimensions.identity_exposure || 0) + 20));
        riskDimensions.surface_posture = Math.min(100, (Number(riskDimensions.surface_posture || 0) + 10));
      }
      const riskScore = calculateFindingRiskScore({
        severity: finding.severity,
        confidence,
        freshnessDays,
        recurrenceCount,
        affectedAssetCriticality: inferAssetCriticality(finding.affected_asset),
        isDirectCompromise: compromiseType === 'direct',
        isThirdPartyOnly: compromiseType === 'indirect',
      });

      const { data: darkFinding, error: findingErr } = await adminClient
        .from('darkrisk_findings' as any)
        .insert({
          organization_id: customerId,
          tenant_id: customerId,
          scan_run_id: scanRunId,
          finding_type: finding.finding_type,
          title: finding.title,
          description: maskPotentialSecrets(finding.description),
          affected_asset_id: affectedAssetId,
          severity: finding.severity,
          confidence,
          status: 'new',
          risk_score: riskScore,
          risk_dimensions: riskDimensions,
          evidence_ids: [evidence.id],
          first_seen_at: finding.created_at || new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          metadata: {
                source_scan_job_id: scanJob.id,
                source_origin: finding.origin,
                source_finding_id: finding.source_id,
                source_module: finding.module,
                compromise_type: compromiseType,
                third_party_involved: compromiseType === 'indirect',
                requires_validation: compromiseType !== 'misconfiguration',
                recurrence_count: recurrenceCount,
                category_hint: classifyThreatCategoryText(`${finding.title} ${finding.finding_type} ${finding.module}`),
                sensitive_indicators: sensitiveIndicators,
                sensitive_data_detected: hasSensitiveIndicators(sensitiveIndicators),
              },
            })
            .select('id')
            .single();

      if (findingErr || !darkFinding?.id) throw findingErr || new Error('darkrisk finding insert failed');
      findingsCreated += 1;

      if (finding.severity === 'high' || finding.severity === 'critical') {
        const { error: alertErr } = await adminClient
          .from('darkrisk_alerts' as any)
          .insert({
            organization_id: customerId,
            tenant_id: customerId,
            finding_id: darkFinding.id,
            alert_type: 'new_finding',
            title: finding.title,
            message: maskPotentialSecrets(finding.description),
            severity: finding.severity,
            status: 'open',
            occurred_at: finding.created_at || new Date().toISOString(),
            metadata: {
              source: 'surfacescan360',
                  source_scan_job_id: scanJob.id,
                  module: finding.module,
                },
              });

        if (!alertErr) alertsCreated += 1;
      }
    }

    if (isIntelxConfigured()) {
      for (const queryTerm of intelxQueryTerms) {
        try {
          await wait(INTELX_REQUEST_INTERVAL_MS);
          const records = await runIntelxSearch(queryTerm.term);
          intelxSearchesRun += 1;
          if (queryTerm.kind === 'at_domain_tld') intelxAtDomainQueries += 1;
          if (records.length === 0) continue;

          const selectorId = queryTerm.selectorNormalized
            ? selectorByNormalized.get(queryTerm.selectorNormalized) || null
            : null;
          const linkedAssetKey = normalizeAssetValue(queryTerm.linkedAssetNormalized || queryTerm.term.replace(/^@/, ''));
          const assetRef = linkedAssetKey ? assetByNormalized.get(linkedAssetKey) : undefined;
          const linkedAssetId = assetRef?.id || null;

          for (const record of records) {
            const sourceRecordKey = normalizeIntelxRecordKey(queryTerm.term, record);
            const title = normalizeText(String(record?.name || '')) || `DarkRisk360 signal on ${queryTerm.term}`;
            const description = normalizeText(String(record?.description || '')) || `Segnale exposure rilevato su query ${queryTerm.term}.`;
            const previewText = maskPotentialSecrets(`${title}\n${description}`.slice(0, 1400));
            const observedAtCandidate = normalizeText(String(record?.date || record?.added || ''));
            const observedAt = Number.isFinite(Date.parse(observedAtCandidate))
              ? new Date(observedAtCandidate).toISOString()
              : new Date().toISOString();
            const xscore = Number(record?.xscore);
            const sensitiveIndicators = detectSensitiveIndicators(
              `${title}\n${description}\n${queryTerm.term}\n${JSON.stringify(record || {})}`.slice(0, 6000),
            );
            const severityBase = severityFromIntelxScore(Number.isFinite(xscore) ? xscore : null);
            const severity = boostSeverityForSensitiveData(severityBase, sensitiveIndicators);
            const findingType = intelxFindingTypeFromRecord(record, queryTerm.term);
            const compromiseType = inferCompromiseType({
              findingType,
              title,
              module: 'intelx',
            });
            const confidence: 'low' | 'medium' | 'high' = Number.isFinite(xscore)
              ? xscore >= 70 ? 'high' : xscore >= 40 ? 'medium' : 'low'
              : 'medium';
            const riskDimensions = inferRiskDimensions({
              findingType,
              title,
              module: 'intelx',
              confidence,
              freshnessDays: daysSince(observedAt),
            });
            if (hasSensitiveIndicators(sensitiveIndicators)) {
              riskDimensions.identity_exposure = Math.min(100, (Number(riskDimensions.identity_exposure || 0) + 30));
              riskDimensions.surface_posture = Math.min(100, (Number(riskDimensions.surface_posture || 0) + 10));
            }
            const riskScore = calculateFindingRiskScore({
              severity,
              confidence,
              freshnessDays: daysSince(observedAt),
              recurrenceCount: 1,
              affectedAssetCriticality: inferAssetCriticality(queryTerm.linkedAssetNormalized || queryTerm.term),
              isDirectCompromise: compromiseType === 'direct',
              isThirdPartyOnly: compromiseType === 'indirect',
            });

            const { data: sourceRecord, error: sourceRecordErr } = await adminClient
              .from('darkrisk_source_records' as any)
              .insert({
                organization_id: customerId,
                tenant_id: customerId,
                scan_run_id: scanRunId,
                source: 'intelx',
                asset_id: linkedAssetId,
                selector_id: selectorId,
                source_record_key: sourceRecordKey,
                source_system_id: normalizeText(String(record?.systemid || '')) || null,
                source_storage_id: normalizeText(String(record?.storageid || '')) || null,
                source_bucket: normalizeText(String(record?.bucket || '')) || null,
                source_media: normalizeText(String(record?.mediah || record?.media || '')) || null,
                source_type: normalizeText(String(record?.typeh || record?.type || '')) || 'intelx_record',
                source_score: Number.isFinite(xscore) ? xscore : null,
                source_date: observedAt,
                source_added_at: observedAt,
                source_simhash: normalizeText(String(record?.simhash || '')) || null,
                title: maskPotentialSecrets(title),
                description: maskPotentialSecrets(description),
                raw_metadata: {
                  selector: queryTerm.selectorNormalized || null,
                  query_term: queryTerm.term,
                  query_kind: queryTerm.kind,
                  sensitive_indicators: sensitiveIndicators,
                  record: {
                    systemid: record?.systemid || null,
                    storageid: record?.storageid || null,
                    bucket: record?.bucket || null,
                    xscore: Number.isFinite(xscore) ? xscore : null,
                    date: record?.date || null,
                    added: record?.added || null,
                    mediah: record?.mediah || null,
                    typeh: record?.typeh || null,
                    tags: record?.tags || [],
                  },
                },
                safe_preview: previewText,
                preview_hash: sourceRecordKey,
              })
              .select('id')
              .single();
            if (sourceRecordErr || !sourceRecord?.id) throw sourceRecordErr || new Error('darkrisk360 source record insert failed');
            recordsCreated += 1;
            intelxRecordsCreated += 1;

            const { data: evidence, error: evidenceErr } = await adminClient
              .from('darkrisk_evidence' as any)
              .insert({
                organization_id: customerId,
                tenant_id: customerId,
                scan_run_id: scanRunId,
                source_record_id: sourceRecord.id,
                source: 'intelx',
                evidence_class: 'intelx_record',
                asset_id: linkedAssetId,
                selector_id: selectorId,
                title: maskPotentialSecrets(title),
                summary: maskPotentialSecrets(description),
                masked_value: maskPotentialSecrets(queryTerm.term),
                severity_hint: severity,
                confidence,
                observed_at: observedAt,
                first_seen_at: observedAt,
                last_seen_at: new Date().toISOString(),
                visibility: 'customer',
                contains_sensitive_data: hasSensitiveIndicators(sensitiveIndicators),
                metadata: {
                  bucket: normalizeText(String(record?.bucket || '')) || null,
                  mediah: normalizeText(String(record?.mediah || '')) || null,
                  typeh: normalizeText(String(record?.typeh || '')) || null,
                  xscore: Number.isFinite(xscore) ? xscore : null,
                  query_kind: queryTerm.kind,
                  sensitive_indicators: sensitiveIndicators,
                },
              })
              .select('id')
              .single();
            if (evidenceErr || !evidence?.id) throw evidenceErr || new Error('darkrisk360 evidence insert failed');
            evidenceCreated += 1;
            intelxEvidenceCreated += 1;

            const { data: darkFinding, error: findingErr } = await adminClient
              .from('darkrisk_findings' as any)
              .insert({
                organization_id: customerId,
                tenant_id: customerId,
                scan_run_id: scanRunId,
                finding_type: findingType,
                title: maskPotentialSecrets(title),
                description: maskPotentialSecrets(description),
                affected_asset_id: linkedAssetId,
                affected_selector_id: selectorId,
                severity,
                confidence,
                status: 'new',
                risk_score: riskScore,
                risk_dimensions: riskDimensions,
                evidence_ids: [evidence.id],
                first_seen_at: observedAt,
                last_seen_at: new Date().toISOString(),
                metadata: {
                  source_scan_job_id: scanJob.id,
                  source_origin: 'intelx',
                  source_module: 'intelx',
                  source_record_key: sourceRecordKey,
                  compromise_type: compromiseType,
                  third_party_involved: compromiseType === 'indirect',
                  requires_validation: compromiseType !== 'misconfiguration',
                  selector: queryTerm.selectorNormalized || null,
                  query_term: queryTerm.term,
                  query_kind: queryTerm.kind,
                  category_hint: classifyThreatCategoryText(`${title} ${findingType} intelx`),
                  sensitive_indicators: sensitiveIndicators,
                  sensitive_data_detected: hasSensitiveIndicators(sensitiveIndicators),
                },
              })
              .select('id')
              .single();
            if (findingErr || !darkFinding?.id) throw findingErr || new Error('darkrisk360 finding insert failed');
            findingsCreated += 1;
            intelxFindingsCreated += 1;

            if (severity === 'high' || severity === 'critical') {
              const { error: alertErr } = await adminClient
                .from('darkrisk_alerts' as any)
                .insert({
                  organization_id: customerId,
                  tenant_id: customerId,
                  finding_id: darkFinding.id,
                  alert_type: 'intelx_signal',
                  title: maskPotentialSecrets(title),
                  message: maskPotentialSecrets(description),
                  severity,
                  status: 'open',
                  occurred_at: observedAt,
                  metadata: {
                    source: 'intelx',
                    selector: queryTerm.selectorNormalized || null,
                    query_term: queryTerm.term,
                    source_scan_job_id: scanJob.id,
                  },
                });
              if (!alertErr) {
                alertsCreated += 1;
                intelxAlertsCreated += 1;
              }
            }
          }
        } catch (intelxErr: any) {
          intelxWarnings.push(maskPotentialSecrets(normalizeText(intelxErr?.message) || `DarkRisk360 intelligence failed on ${queryTerm.term}`));
        }
      }
    } else {
      intelxWarnings.push('DarkRisk360 intelligence non configurata: impostare la chiave provider nelle Edge Function secrets.');
    }

    let recommendationMode: 'not_requested' | 'generated' | 'failed' | 'disabled' = 'not_requested';
    let recommendationWarning: string | null = null;
    let reportMode: 'not_requested' | 'generated' | 'reused' | 'failed' | 'disabled' = 'not_requested';
    let reportWarning: string | null = null;

    const completedAt = new Date().toISOString();
    const scanSources = new Set<string>(['surfacescan360']);
    if (intelxSearchesRun > 0 || intelxRecordsCreated > 0) {
      scanSources.add('intelx');
    }
    await adminClient
      .from('darkrisk_scan_runs' as any)
      .update({
        status: 'completed',
        completed_at: completedAt,
        sources: Array.from(scanSources),
        warnings: intelxWarnings,
        stats: {
          surface_scan_job_id: scanJob.id,
          sources: Array.from(scanSources),
          source_records_created: recordsCreated,
          evidence_created: evidenceCreated,
          findings_created: findingsCreated,
          alerts_created: alertsCreated,
          assets_synced: assetRows.length,
          intelx: {
            selectors_considered: intelxSelectorDefinitions.length,
            query_terms_considered: intelxQueryTerms.length,
            searches_run: intelxSearchesRun,
            at_domain_tld_queries: intelxAtDomainQueries,
            source_records_created: intelxRecordsCreated,
            evidence_created: intelxEvidenceCreated,
            findings_created: intelxFindingsCreated,
            alerts_created: intelxAlertsCreated,
          },
        },
      })
      .eq('id', scanRunId);

    const aiEnabled = entitlement?.enable_ai_recommendations !== false;
    if (aiEnabled && SUPABASE_URL && SERVICE_ROLE) {
      try {
        const recoRes = await fetch(`${SUPABASE_URL}/functions/v1/darkrisk360-generate-recommendations`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer_id: customerId,
            scan_run_id: scanRunId,
            trigger_type: 'auto_after_sync',
          }),
        });

        if (!recoRes.ok) {
          const text = await recoRes.text();
          recommendationMode = 'failed';
          recommendationWarning = maskPotentialSecrets(`AI recommendation generation failed: ${text.slice(0, 280)}`);
        } else {
          recommendationMode = 'generated';
        }
      } catch (recoErr: any) {
        recommendationMode = 'failed';
        recommendationWarning = maskPotentialSecrets(normalizeText(recoErr?.message) || 'AI recommendation generation failed');
      }
    } else if (!aiEnabled) {
      recommendationMode = 'disabled';
    }

    if (SUPABASE_URL && SERVICE_ROLE) {
      try {
        const reportRes = await fetch(`${SUPABASE_URL}/functions/v1/darkrisk360-generate-report`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer_id: customerId,
            scan_run_id: scanRunId,
            classification: 'confidential',
          }),
        });
        if (!reportRes.ok) {
          const text = await reportRes.text();
          reportMode = 'failed';
          reportWarning = maskPotentialSecrets(`DarkRisk report generation failed: ${text.slice(0, 280)}`);
        } else {
          const payload = await reportRes.json().catch(() => ({}));
          reportMode = payload?.reused ? 'reused' : 'generated';
        }
      } catch (reportErr: any) {
        reportMode = 'failed';
        reportWarning = maskPotentialSecrets(normalizeText(reportErr?.message) || 'DarkRisk report generation failed');
      }
    } else {
      reportMode = 'disabled';
    }

    const allWarnings = [recommendationWarning, reportWarning, ...intelxWarnings].filter(Boolean);
    if (allWarnings.length > 0) {
      await adminClient
        .from('darkrisk_scan_runs' as any)
        .update({
          status: 'completed_with_warnings',
          warnings: allWarnings,
        })
        .eq('id', scanRunId);
    }

    await adminClient
      .from('darkrisk_audit_log' as any)
      .insert({
        organization_id: customerId,
        tenant_id: customerId,
        actor_id: authData.user.id,
        action: allWarnings.length > 0 ? 'darkrisk_scan_completed_with_warnings' : 'darkrisk_scan_completed',
        entity_type: 'darkrisk_scan_run',
        entity_id: scanRunId,
        reason: triggerType,
        metadata: {
          source: Array.from(scanSources),
          surface_scan_job_id: scanJob.id,
          assets_synced: assetRows.length,
          source_records_created: recordsCreated,
          evidence_created: evidenceCreated,
          findings_created: findingsCreated,
          alerts_created: alertsCreated,
          intelx: {
            selectors_considered: intelxSelectorDefinitions.length,
            query_terms_considered: intelxQueryTerms.length,
            searches_run: intelxSearchesRun,
            at_domain_tld_queries: intelxAtDomainQueries,
            source_records_created: intelxRecordsCreated,
            evidence_created: intelxEvidenceCreated,
            findings_created: intelxFindingsCreated,
            alerts_created: intelxAlertsCreated,
          },
          recommendation_mode: recommendationMode,
          report_mode: reportMode,
          warning: allWarnings,
        },
      });

    return jsonResponse({
      ok: true,
      customer_id: customerId,
      scan_run_id: scanRunId,
      source: Array.from(scanSources),
      tier: entitlement.tier,
      started_at: startedAt,
      completed_at: completedAt,
      stats: {
        assets_synced: assetRows.length,
        source_records_created: recordsCreated,
        evidence_created: evidenceCreated,
        findings_created: findingsCreated,
        alerts_created: alertsCreated,
        intelx: {
          selectors_considered: intelxSelectorDefinitions.length,
          query_terms_considered: intelxQueryTerms.length,
          searches_run: intelxSearchesRun,
          at_domain_tld_queries: intelxAtDomainQueries,
          source_records_created: intelxRecordsCreated,
          evidence_created: intelxEvidenceCreated,
          findings_created: intelxFindingsCreated,
          alerts_created: intelxAlertsCreated,
        },
        recommendation_mode: recommendationMode,
        report_mode: reportMode,
      },
      warning: allWarnings.join(' | ') || null,
    });
  } catch (error: any) {
    if (scanRunId) {
      try {
        const { adminClient } = makeSupabaseClients(req);
        const { data: runScope } = await adminClient
          .from('darkrisk_scan_runs' as any)
          .select('organization_id, requested_by')
          .eq('id', scanRunId)
          .maybeSingle();

        await adminClient
          .from('darkrisk_scan_runs' as any)
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: normalizeText(error?.message) || 'Unknown error',
          })
          .eq('id', scanRunId);

        await adminClient
          .from('darkrisk_audit_log' as any)
          .insert({
            organization_id: runScope?.organization_id || null,
            tenant_id: runScope?.organization_id || null,
            actor_id: runScope?.requested_by || null,
            action: 'darkrisk_scan_failed',
            entity_type: 'darkrisk_scan_run',
            entity_id: scanRunId,
            reason: 'sync_surfacescan_failed',
            metadata: {
              error: maskPotentialSecrets(normalizeText(error?.message) || 'Unknown error'),
            },
          });
      } catch {
        // no-op
      }
    }

    return jsonResponse({
      ok: false,
      error: normalizeText(error?.message) || 'Internal error',
      scan_run_id: scanRunId,
    }, 500);
  }
});
