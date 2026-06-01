import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  classifyTargetScope,
  corsHeaders,
  evaluateOrganizationServiceGate,
  getCallerProfile,
  makeSupabaseClients,
  normalizeTargetInput,
  splitMonitoredScopeRules,
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
  extractSensitiveValueHits,
  hasSensitiveIndicators,
} from '../_shared/darkrisk-sensitive-detection.ts';
import {
  type DarkRiskSelectorType,
  validateDarkRiskSelector,
} from '../_shared/darkrisk-selector-validation.ts';
import {
  buildFirecrawlTargets,
  firecrawlScrape,
  getFirecrawlSourceTemplates,
  intelxDeepFetch,
} from '../_shared/darkrisk-dti-enrichment.ts';
import { isEmailSelectorCoverageKind } from '../_shared/darkrisk-query-kind.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SUPABASE_SECRET_KEYS = String(Deno.env.get('SUPABASE_SECRET_KEYS') || '').trim();
const INTERNAL_FUNCTIONS_API_KEY = String(
  Deno.env.get('SUPABASE_ANON_KEY')
  || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  || Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  || SERVICE_ROLE
  || '',
).trim();
const DARKRISK_INTERNAL_SECRET = String(Deno.env.get('DARKRISK360_INTERNAL_SECRET') || '').trim();
const DARKRISK_OPERATOR_SECRET = String(Deno.env.get('DARKRISK360_OPERATOR_SECRET') || '').trim();
const INTELX_API_KEY = String(Deno.env.get('INTELX_API_KEY') || '').trim();
const INTELX_API_URL = String(
  Deno.env.get('INTELX_API_URL') ||
  Deno.env.get('INTELX_BASE_URL') ||
  'https://2.intelx.io',
).replace(/\/+$/, '');
const INTELX_MAX_SELECTORS_PER_RUN = Math.max(
  1,
  Math.min(60, Number(Deno.env.get('INTELX_MAX_SELECTORS_PER_RUN') || 20)),
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
const INTELX_MAX_RECORDS_PER_RUN = Math.max(
  20,
  Math.min(1500, Number(Deno.env.get('INTELX_MAX_RECORDS_PER_RUN') || 120)),
);
const INTELX_DEEP_FETCH_ENABLED = String(Deno.env.get('INTELX_DEEP_FETCH_ENABLED') || 'true').toLowerCase() !== 'false';
const INTELX_DEEP_FETCH_MAX_PER_RUN = Math.max(
  0,
  Math.min(240, Number(Deno.env.get('INTELX_DEEP_FETCH_MAX_PER_RUN') || 70)),
);
const INTELX_DEEP_FETCH_TIMEOUT_MS = Math.max(
  2_000,
  Math.min(30_000, Number(Deno.env.get('INTELX_DEEP_FETCH_TIMEOUT_MS') || 7_500)),
);
const INTELX_DEEP_FETCH_MAX_CHARS = Math.max(
  800,
  Math.min(80_000, Number(Deno.env.get('INTELX_DEEP_FETCH_MAX_CHARS') || 16_000)),
);
const INTELX_HEALTHCHECK_TERM = normalizeText(String(
  Deno.env.get('INTELX_HEALTHCHECK_TERM') || '@example.com',
)) || '@example.com';
const FIRECRAWL_API_KEY = String(Deno.env.get('FIRECRAWL_API_KEY') || '').trim();
const FIRECRAWL_ENABLED = String(Deno.env.get('DARKRISK_FIRECRAWL_ENABLED') || 'true').toLowerCase() !== 'false';
const FIRECRAWL_TIMEOUT_MS = Math.max(
  2_500,
  Math.min(40_000, Number(Deno.env.get('DARKRISK_FIRECRAWL_TIMEOUT_MS') || 15_000)),
);
const FIRECRAWL_RETRIES = Math.max(
  0,
  Math.min(4, Number(Deno.env.get('DARKRISK_FIRECRAWL_RETRIES') || 2)),
);
const FIRECRAWL_MAX_TARGETS = Math.max(
  1,
  Math.min(500, Number(Deno.env.get('DARKRISK_FIRECRAWL_MAX_TARGETS') || 200)),
);
const FIRECRAWL_MAX_MARKDOWN_CHARS = Math.max(
  2_000,
  Math.min(100_000, Number(Deno.env.get('DARKRISK_FIRECRAWL_MAX_MARKDOWN_CHARS') || 25_000)),
);
const FIRECRAWL_SOURCE_CONFIG = String(Deno.env.get('DARKRISK_FIRECRAWL_SOURCES') || '').trim();
const SURFACESCAN_INTERNAL_SECRET = String(
  Deno.env.get('SURFACESCAN_CRON_INTERNAL_SECRET')
  || Deno.env.get('SURFACESCAN_INTERNAL_SECRET')
  || '',
).trim();
const SURFACESCAN_SCOPE_AUTOSTART_TIMEOUT_MS = Math.max(
  10_000,
  Math.min(90_000, Number(Deno.env.get('SURFACESCAN_SCOPE_AUTOSTART_TIMEOUT_MS') || 35_000)),
);
const DARKRISK_RUNNING_GUARD_MINUTES = Math.max(
  1,
  Math.min(30, Number(Deno.env.get('DARKRISK_RUNNING_GUARD_MINUTES') || 4)),
);
const DARKRISK_STALE_RUN_MINUTES = Math.max(
  5,
  Math.min(180, Number(Deno.env.get('DARKRISK_STALE_RUN_MINUTES') || 20)),
);
const DARKRISK_RUN_BUDGET_MS = Math.max(
  30_000,
  Math.min(300_000, Number(Deno.env.get('DARKRISK_RUN_BUDGET_MS') || 120_000)),
);
const DARKRISK_INTERNAL_CHAIN_TIMEOUT_MS = Math.max(
  5_000,
  Math.min(90_000, Number(Deno.env.get('DARKRISK_INTERNAL_CHAIN_TIMEOUT_MS') || 30_000)),
);

function extractBearerToken(req: Request): string {
  const auth = String(req.headers.get('authorization') || '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return String(match?.[1] || '').trim();
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

function isActionableFindingStatus(status: string | null | undefined): boolean {
  const normalized = normalizeText(String(status || 'new')).toLowerCase();
  return !(
    normalized === 'resolved'
    || normalized === 'suppressed'
    || normalized === 'false_positive'
    || normalized === 'accepted_risk'
  );
}

type DarkRiskFindingUpsertPayload = Record<string, unknown> & {
  organization_id: string;
  source_record_key?: string | null;
};

async function upsertDarkRiskFinding(
  adminClient: any,
  payload: DarkRiskFindingUpsertPayload,
): Promise<{ id: string }> {
  const organizationId = normalizeText(String(payload.organization_id || ''));
  const sourceRecordKey = normalizeText(String(payload.source_record_key || ''));

  if (!organizationId) throw new Error('darkrisk finding missing organization_id');

  if (sourceRecordKey) {
    const { data: existing, error: existingErr } = await adminClient
      .from('darkrisk_findings' as any)
      .select('id')
      .eq('organization_id', organizationId)
      .eq('source_record_key', sourceRecordKey)
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (existingErr) throw existingErr;

    if (existing?.id) {
      const { data: updated, error: updateErr } = await adminClient
        .from('darkrisk_findings' as any)
        .update(payload)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (updateErr || !updated?.id) throw updateErr || new Error('darkrisk finding update failed');
      return { id: String(updated.id) };
    }
  }

  const { data: inserted, error: insertErr } = await adminClient
    .from('darkrisk_findings' as any)
    .insert(payload)
    .select('id')
    .single();
  if (insertErr || !inserted?.id) throw insertErr || new Error('darkrisk finding insert failed');
  return { id: String(inserted.id) };
}

type IntelxSelectorDefinition = {
  raw: string;
  normalized: string;
  type: DarkRiskSelectorType;
  source: 'surfacescan360' | 'manual' | 'existing';
};

type IntelxQueryTerm = {
  term: string;
  kind: 'selector' | 'at_domain_tld' | 'email_selector';
  selectorNormalized: string | null;
  linkedAssetNormalized: string | null;
};

type DtiSourceRunStatus = 'completed' | 'partial' | 'failed' | 'skipped';

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

async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = DARKRISK_INTERNAL_CHAIN_TIMEOUT_MS,
): Promise<Response> {
  const timeout = Math.max(1_000, Number(timeoutMs || 0));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (err: any) {
    if (String(err?.name || '').toLowerCase() === 'aborterror') {
      const target = typeof input === 'string' ? input : String((input as URL)?.toString?.() || 'request');
      throw new Error(`Request timeout after ${timeout}ms: ${target.slice(0, 180)}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isIntelxConfigured(): boolean {
  return Boolean(INTELX_API_KEY && INTELX_API_URL);
}

function isAuthzLikeError(message: string | null | undefined): boolean {
  const text = String(message || '').toLowerCase();
  return text.includes(' 401')
    || text.includes('(401)')
    || text.includes('401:')
    || text.includes(' 403')
    || text.includes('(403)')
    || text.includes('403:')
    || text.includes('unauthorized')
    || text.includes('forbidden');
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
  return normalizedDomains.map((domain) => `@${domain}`);
}

function buildIntelxQueryTerms(
  selectors: IntelxSelectorDefinition[],
  scopeDomains: string[],
): IntelxQueryTerm[] {
  const terms: IntelxQueryTerm[] = [];
  const dedupe = new Set<string>();

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

  if (terms.length >= INTELX_MAX_QUERY_TERMS_PER_RUN) {
    return terms.slice(0, INTELX_MAX_QUERY_TERMS_PER_RUN);
  }

  for (const selector of selectors) {
    if (selector.type === 'domain' || selector.type === 'wildcard_domain') {
      continue;
    }
    const term = normalizeText(selector.normalized);
    if (!term) continue;
    const queryKind: IntelxQueryTerm['kind'] = selector.type === 'email' ? 'email_selector' : 'selector';
    const key = `${queryKind}:${term.toLowerCase()}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    terms.push({
      term,
      kind: queryKind,
      selectorNormalized: selector.normalized,
      linkedAssetNormalized: selector.normalized,
    });
    if (terms.length >= INTELX_MAX_QUERY_TERMS_PER_RUN) break;
  }

  return terms;
}

function ensureIdentityEmailQueryTerms(
  terms: IntelxQueryTerm[],
  manualIdentityEmails: string[],
  selectorDefinitions: IntelxSelectorDefinition[],
): IntelxQueryTerm[] {
  const result = [...terms];
  const existingKeys = new Set(
    result.map((entry) => `${entry.kind}:${normalizeText(entry.term).toLowerCase()}`),
  );

  const candidates = [
    ...manualIdentityEmails,
    ...selectorDefinitions
      .filter((selector) => selector.type === 'email')
      .map((selector) => normalizeText(selector.normalized).toLowerCase()),
  ]
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter(Boolean);

  for (const email of Array.from(new Set(candidates))) {
    const key = `email_selector:${email}`;
    if (existingKeys.has(key)) continue;
    result.push({
      term: email,
      kind: 'email_selector',
      selectorNormalized: email,
      linkedAssetNormalized: email,
    });
    existingKeys.add(key);
  }

  return result.slice(0, INTELX_MAX_QUERY_TERMS_PER_RUN);
}

function prioritizeIntelxSelectorDefinitions(
  selectors: IntelxSelectorDefinition[],
  maxSelectors: number,
): IntelxSelectorDefinition[] {
  const queryEligible = selectors.filter((selector) =>
    selector.type !== 'domain' && selector.type !== 'wildcard_domain'
  );

  const ranked = queryEligible
    .map((selector, index) => {
      const normalized = normalizeText(selector.normalized).toLowerCase();
      const isEmail = selector.type === 'email';
      let priority = 100;

      if (isEmail && selector.source === 'manual') priority = 0;
      else if (isEmail && selector.source === 'existing') priority = 1;
      else if (isEmail && selector.source === 'surfacescan360') priority = 2;
      else if (selector.source === 'manual') priority = 3;
      else if (selector.source === 'existing') priority = 4;
      else priority = 5;

      return { selector, priority, index, normalized };
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.index !== b.index) return a.index - b.index;
      return a.normalized.localeCompare(b.normalized);
    })
    .map((entry) => entry.selector);

  return ranked.slice(0, Math.max(1, maxSelectors));
}

function parseIdentityEmailSelectors(value: unknown): string[] {
  const normalized = Array.isArray(value)
    ? value.map((entry) => normalizeText(String(entry || '')).toLowerCase())
    : String(value || '')
        .split(/[\n,;\s]+/)
        .map((entry) => normalizeText(String(entry || '')).toLowerCase());

  const deduped = Array.from(new Set(normalized.filter(Boolean)));
  const emails: string[] = [];
  for (const token of deduped) {
    const validation = validateDarkRiskSelector(token);
    if (!validation.valid || validation.type !== 'email' || !validation.normalized) continue;
    emails.push(validation.normalized);
  }
  return emails.slice(0, 80);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const invalidPasswordTokens = new Set([
  'query',
  'selector',
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'metadata',
  'unknown',
  'null',
  'none',
  'n/a',
  'na',
  'true',
  'false',
  '&#39',
  '&apos;',
  '&quot;',
]);

function isValidStrictPasswordValue(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length < 4 || normalized.length > 120) return false;
  if (invalidPasswordTokens.has(normalized.toLowerCase())) return false;
  if (/^&#\d{1,6};?$/i.test(normalized)) return false;
  if (/^&[a-z]{2,8};$/i.test(normalized)) return false;
  if (normalized.includes('@')) return false;
  if (/[=:]/.test(normalized)) return false;
  if (/^https?:\/\//i.test(normalized)) return false;
  if (/^[*_#\-.]+$/.test(normalized)) return false;
  return true;
}

function hasTightEmailPasswordContext(sourceText: string, email: string, password: string): boolean {
  const safeEmail = escapeRegex(normalizeText(email).toLowerCase());
  const safePassword = escapeRegex(normalizeText(password));
  if (!safeEmail || !safePassword) return false;

  const lines = sourceText.split(/\r?\n/).slice(0, 2000);
  for (const line of lines) {
    const lowered = line.toLowerCase();
    if (!lowered.includes(email.toLowerCase())) continue;
    if (!lowered.includes(password.toLowerCase())) continue;
    const emailIdx = lowered.indexOf(email.toLowerCase());
    const pwdIdx = lowered.indexOf(password.toLowerCase());
    if (emailIdx >= 0 && pwdIdx >= 0 && Math.abs(emailIdx - pwdIdx) <= 180) {
      return true;
    }
  }

  const nearRegex = new RegExp(
    `(?:${safeEmail}[\\s\\S]{0,180}${safePassword}|${safePassword}[\\s\\S]{0,180}${safeEmail})`,
    'i',
  );
  return nearRegex.test(sourceText);
}

function indicatorsFromSensitiveHits(
  hits: ReturnType<typeof extractSensitiveValueHits>,
): ReturnType<typeof detectSensitiveIndicators> {
  const counters = {
    domains: 0,
    passwords: 0,
    addresses: 0,
    credit_cards: 0,
    phone_numbers: 0,
    total_hits: 0,
    tags: [] as string[],
  };

  const byTag = new Map<string, Set<string>>();
  for (const hit of hits) {
    const tag = normalizeText(String(hit.tag || '')).toLowerCase();
    const value = normalizeText(String(hit.value || '')).toLowerCase();
    if (!tag || !value) continue;
    if (!byTag.has(tag)) byTag.set(tag, new Set());
    byTag.get(tag)!.add(value);
  }

  const readCount = (tag: string): number => byTag.get(tag)?.size || 0;
  counters.domains = readCount('domains');
  counters.passwords = readCount('passwords');
  counters.addresses = readCount('addresses');
  counters.credit_cards = readCount('credit_cards');
  counters.phone_numbers = readCount('phone_numbers');
  counters.total_hits =
    counters.domains +
    counters.passwords +
    counters.addresses +
    counters.credit_cards +
    counters.phone_numbers;

  if (counters.domains > 0) counters.tags.push('domains');
  if (counters.passwords > 0) counters.tags.push('passwords');
  if (counters.addresses > 0) counters.tags.push('addresses');
  if (counters.credit_cards > 0) counters.tags.push('credit_cards');
  if (counters.phone_numbers > 0) counters.tags.push('phone_numbers');

  return counters;
}

function applyStrictSensitivePolicy(params: {
  queryKind: string | null | undefined;
  queryTerm: string | null | undefined;
  extractionSource: string;
  sourceText: string;
  hits: ReturnType<typeof extractSensitiveValueHits>;
}): {
  hits: ReturnType<typeof extractSensitiveValueHits>;
  strictPasswordHits: number;
  metadataOnlyHits: number;
  matchPolicy: 'strict_pair' | 'standard';
  extractionConfidence: 'low' | 'medium' | 'high';
  evidenceScope: 'identity' | 'domain';
} {
  const isIdentity = isEmailSelectorCoverageKind(params.queryKind, params.queryTerm);
  const evidenceScope: 'identity' | 'domain' = isIdentity ? 'identity' : 'domain';
  const extractionSource = normalizeText(params.extractionSource).toLowerCase();
  const extractionConfidence: 'low' | 'medium' | 'high' =
    extractionSource === 'metadata'
      ? 'low'
      : extractionSource === 'preview' || extractionSource === 'view'
      ? 'medium'
      : 'high';

  let strictPasswordHits = 0;
  let metadataOnlyHits = 0;

  if (!isIdentity) {
    const cleaned = params.hits.filter((hit) => {
      if (hit.tag !== 'passwords') return true;
      return isValidStrictPasswordValue(hit.value);
    });
    strictPasswordHits = cleaned.filter((hit) => hit.tag === 'passwords').length;
    return {
      hits: cleaned,
      strictPasswordHits,
      metadataOnlyHits,
      matchPolicy: 'standard',
      extractionConfidence,
      evidenceScope,
    };
  }

  const email = normalizeText(String(params.queryTerm || '')).toLowerCase();
  const filtered = params.hits.filter((hit) => {
    if (hit.tag !== 'passwords') return true;
    if (!isValidStrictPasswordValue(hit.value)) return false;
    const isTight = hasTightEmailPasswordContext(params.sourceText, email, hit.value);
    if (isTight) {
      strictPasswordHits += 1;
      return true;
    }
    metadataOnlyHits += 1;
    return false;
  });

  return {
    hits: filtered,
    strictPasswordHits,
    metadataOnlyHits,
    matchPolicy: 'strict_pair',
    extractionConfidence,
    evidenceScope,
  };
}

function normalizeDtiStatus(value: string | null | undefined): DtiSourceRunStatus {
  const normalized = normalizeText(value || '').toLowerCase();
  if (normalized === 'completed') return 'completed';
  if (normalized === 'partial' || normalized === 'completed_with_warnings') return 'partial';
  if (normalized === 'skipped') return 'skipped';
  return 'failed';
}

function domainFromQueryTerm(queryTerm: string): string {
  const normalized = normalizeText(queryTerm).toLowerCase();
  if (!normalized) return '';
  if (normalized.startsWith('@')) return normalized.slice(1);
  if (normalized.includes('@')) return normalized.split('@')[1] || normalized;
  return normalized.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

async function createDtiSourceRun(
  adminClient: any,
  payload: Record<string, unknown>,
): Promise<{ id: string; started_at: string } | null> {
  const { data, error } = await adminClient
    .from('darkrisk_dti_source_runs' as any)
    .insert(payload as any)
    .select('id, started_at')
    .single();
  if (error || !data?.id) return null;
  return {
    id: String(data.id),
    started_at: String(data.started_at || new Date().toISOString()),
  };
}

async function finalizeDtiSourceRun(
  adminClient: any,
  sourceRunId: string,
  sourceRunStartedAt: string | null,
  status: DtiSourceRunStatus,
  resultCount: number,
  warning: string | null,
  errorMessage: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  const completedAt = new Date().toISOString();
  const startedAtMs = Number.isFinite(Date.parse(String(sourceRunStartedAt || '')))
    ? Date.parse(String(sourceRunStartedAt))
    : Date.now();
  const durationMs = Math.max(0, Date.now() - startedAtMs);
  await adminClient
    .from('darkrisk_dti_source_runs' as any)
    .update({
      status,
      result_count: Math.max(0, Number(resultCount || 0)),
      warning: warning ? maskPotentialSecrets(warning).slice(0, 400) : null,
      error_message: errorMessage ? maskPotentialSecrets(errorMessage).slice(0, 700) : null,
      completed_at: completedAt,
      duration_ms: durationMs,
      metadata: metadata || {},
      updated_at: completedAt,
    })
    .eq('id', sourceRunId);
}

async function persistSensitiveHits(
  adminClient: any,
  params: {
    organizationId: string;
    scanRunId: string;
    sourceRunId: string | null;
    sourceRecordId: string | null;
    evidenceId: string | null;
    findingId: string | null;
    source: 'intelx' | 'firecrawl';
    sourceLabel: string;
    queryKind: string | null;
    queryTerm: string | null;
    assetScope: string | null;
    selectorValue: string | null;
    extractionSource: string;
    hits: ReturnType<typeof extractSensitiveValueHits>;
    matchPolicy: 'strict_pair' | 'standard';
    extractionConfidence: 'low' | 'medium' | 'high';
    evidenceScope: 'identity' | 'domain';
    warnings?: string[];
  },
): Promise<number> {
  const rows = params.hits
    .map((hit) => ({
      organization_id: params.organizationId,
      tenant_id: params.organizationId,
      scan_run_id: params.scanRunId,
      source_run_id: params.sourceRunId,
      source_record_id: params.sourceRecordId,
      evidence_id: params.evidenceId,
      finding_id: params.findingId,
      source: params.source,
      source_label: params.sourceLabel,
      query_kind: params.queryKind,
      query_term: params.queryTerm,
      asset_scope: params.assetScope,
      selector_value: params.selectorValue,
      tag: hit.tag,
      clear_value: hit.value,
      masked_value: hit.masked_value,
      match_type: 'regex',
      match_policy: params.matchPolicy,
      extraction_source: params.extractionSource,
      extraction_confidence: params.extractionConfidence,
      evidence_scope: params.evidenceScope,
      context_excerpt: maskPotentialSecrets(hit.context).slice(0, 500),
      confidence: hit.tag === 'credit_cards' || hit.tag === 'passwords' ? 'high' : 'medium',
      metadata: {
        raw_value_len: String(hit.value || '').length,
      },
    }))
    .slice(0, 250);

  if (rows.length === 0) return 0;
  const { error } = await adminClient
    .from('darkrisk_dti_sensitive_hits' as any)
    .insert(rows as any);
  if (error) {
    const msg = `sensitive_hits_insert_failed: ${maskPotentialSecrets(String(error?.message || 'unknown')).slice(0, 120)}`;
    if (Array.isArray(params.warnings)) params.warnings.push(msg);
    return 0;
  }
  return rows.length;
}

async function intelxFetchWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message || '');
      const is429 = msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('too many');
      if (is429 && attempt < maxRetries - 1) {
        await wait(1000 * Math.pow(2, attempt));
        continue;
      }
      throw e;
    }
  }
  throw new Error('intelx_max_retries_exceeded');
}

const INTELX_SERVER_TIMEOUT_S = Math.max(
  3,
  Math.ceil((INTELX_MAX_POLL_ROUNDS * INTELX_REQUEST_INTERVAL_MS) / 1000),
);
const INTELX_HTTP_TIMEOUT_MS = Math.max(
  5_000,
  Math.min(
    120_000,
    Number(
      Deno.env.get('INTELX_HTTP_TIMEOUT_MS')
      || (INTELX_SERVER_TIMEOUT_S * 1000 + 8_000),
    ),
  ),
);

async function intelxSubmitSearch(term: string): Promise<string | null> {
  const payload = {
    term,
    buckets: [],
    lookuplevel: 0,
    maxresults: INTELX_MAX_RESULTS_PER_SELECTOR,
    timeout: INTELX_SERVER_TIMEOUT_S,
    datefrom: '',
    dateto: '',
    sort: 2,
    media: 0,
    terminate: [],
  };

  return intelxFetchWithBackoff(async () => {
    const response = await fetchWithTimeout(`${INTELX_API_URL}/intelligent/search`, {
      method: 'POST',
      headers: {
        'x-key': INTELX_API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'HICONSOLE-DarkRisk360/1.0',
      },
      body: JSON.stringify(payload),
    }, INTELX_HTTP_TIMEOUT_MS);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DarkRisk360 intelligence search submit failed (${response.status}): ${errorText.slice(0, 180)}`);
    }

    const data = (await response.json()) as IntelxSearchResponse;
    if (Number(data?.status) === 1) return null;
    return normalizeText(String(data?.id || '')) || null;
  });
}

async function intelxFetchSearchResult(searchId: string): Promise<IntelxSearchResponse> {
  const url = new URL(`${INTELX_API_URL}/intelligent/search/result`);
  url.searchParams.set('id', searchId);
  url.searchParams.set('limit', String(INTELX_MAX_RESULTS_PER_SELECTOR));

  return intelxFetchWithBackoff(async () => {
    const response = await fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: {
        'x-key': INTELX_API_KEY,
        'User-Agent': 'HICONSOLE-DarkRisk360/1.0',
      },
    }, INTELX_HTTP_TIMEOUT_MS);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DarkRisk360 intelligence search result failed (${response.status}): ${errorText.slice(0, 180)}`);
    }
    return (await response.json()) as IntelxSearchResponse;
  });
}

async function intelxTerminateSearch(searchId: string): Promise<void> {
  const url = new URL(`${INTELX_API_URL}/intelligent/search/terminate`);
  url.searchParams.set('id', searchId);
  await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: {
      'x-key': INTELX_API_KEY,
      'User-Agent': 'HICONSOLE-DarkRisk360/1.0',
    },
  }, Math.min(INTELX_HTTP_TIMEOUT_MS, 8_000)).catch(() => undefined);
}

async function intelxSearchHealthCheck(
  term = INTELX_HEALTHCHECK_TERM,
): Promise<{ ok: boolean; warning?: string }> {
  let searchId: string | null = null;
  try {
    searchId = await intelxSubmitSearch(term);
    if (!searchId) {
      return { ok: false, warning: 'DarkRisk360 health check: search ID non restituito dal provider.' };
    }

    const url = new URL(`${INTELX_API_URL}/intelligent/search/result`);
    url.searchParams.set('id', searchId);
    url.searchParams.set('limit', '10');
    url.searchParams.set('statistics', '1');
    url.searchParams.set('previewlines', '8');

    const response = await fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: {
        'x-key': INTELX_API_KEY,
        'User-Agent': 'HICONSOLE-DarkRisk360/1.0',
      },
    }, INTELX_HTTP_TIMEOUT_MS);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        warning: `DarkRisk360 health check result failed (${response.status}): ${maskPotentialSecrets(errorText).slice(0, 140)}`,
      };
    }

    const payload = (await response.json()) as IntelxSearchResponse;
    if (Number(payload?.status) !== 0) {
      return {
        ok: false,
        warning: `DarkRisk360 health check result non valido (status=${String(payload?.status ?? 'n/a')}).`,
      };
    }

    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      warning: maskPotentialSecrets(String(err?.message || 'DarkRisk360 health check failed')).slice(0, 160),
    };
  } finally {
    if (searchId) {
      await intelxTerminateSearch(searchId).catch(() => undefined);
    }
  }
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

async function intelxSubmitPhonebookSearch(term: string): Promise<string | null> {
  return intelxFetchWithBackoff(async () => {
    const response = await fetchWithTimeout(`${INTELX_API_URL}/phonebook/search`, {
      method: 'POST',
      headers: {
        'x-key': INTELX_API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'HICONSOLE-DarkRisk360/1.0',
      },
      body: JSON.stringify({
        term,
        maxresults: INTELX_MAX_RESULTS_PER_SELECTOR,
        timeout: INTELX_SERVER_TIMEOUT_S,
        target: 2,
      }),
    }, INTELX_HTTP_TIMEOUT_MS);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DarkRisk360 phonebook search submit failed (${response.status}): ${errorText.slice(0, 180)}`);
    }
    const data = (await response.json()) as IntelxSearchResponse;
    if (Number(data?.status) === 1) return null;
    return normalizeText(String(data?.id || '')) || null;
  });
}

async function intelxFetchPhonebookResult(searchId: string): Promise<IntelxSearchResponse> {
  const url = new URL(`${INTELX_API_URL}/phonebook/search/result`);
  url.searchParams.set('id', searchId);
  url.searchParams.set('limit', String(INTELX_MAX_RESULTS_PER_SELECTOR));
  return intelxFetchWithBackoff(async () => {
    const response = await fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: { 'x-key': INTELX_API_KEY, 'User-Agent': 'HICONSOLE-DarkRisk360/1.0' },
    }, INTELX_HTTP_TIMEOUT_MS);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DarkRisk360 phonebook result failed (${response.status}): ${errorText.slice(0, 180)}`);
    }
    return (await response.json()) as IntelxSearchResponse;
  });
}

async function runIntelxPhonebookSearch(selector: string): Promise<Array<Record<string, unknown>>> {
  const searchId = await intelxSubmitPhonebookSearch(selector);
  if (!searchId) return [];

  const collected: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  try {
    for (let round = 0; round < INTELX_MAX_POLL_ROUNDS; round += 1) {
      await wait(INTELX_REQUEST_INTERVAL_MS);
      const result = await intelxFetchPhonebookResult(searchId);
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
    await intelxTerminateSearch(searchId).catch(() => undefined);
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

const allowedDarkRiskAssetTypes = new Set([
  'domain',
  'subdomain',
  'url',
  'ip',
  'cidr',
  'email',
  'mx',
  'ns',
  'host',
  'service',
  'certificate',
  'unknown',
]);

function normalizeDarkRiskAssetType(rawType: string | null | undefined, normalizedValue: string): string {
  const candidate = normalizeText(rawType).toLowerCase().replace(/\s+/g, '_');
  if (candidate && allowedDarkRiskAssetTypes.has(candidate)) return candidate;

  if (candidate === 'mx_host' || candidate === 'mx_record') return 'mx';
  if (candidate === 'ns_host' || candidate === 'ns_record') return 'ns';
  if (candidate === 'tls' || candidate === 'ssl' || candidate === 'x509' || candidate === 'cert') return 'certificate';
  if (candidate.includes('port') || candidate.includes('service') || candidate.includes('tech')) return 'service';
  if (candidate === 'ipv4' || candidate === 'ipv6' || candidate === 'a_record' || candidate === 'aaaa_record') return 'ip';

  return resolveAssetType(normalizedValue);
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
    const body = await req.json().catch(() => ({}));
    const bearerToken = extractBearerToken(req);
    const relayAuthorization = String(
      req.headers.get('authorization')
      || (INTERNAL_FUNCTIONS_API_KEY ? `Bearer ${INTERNAL_FUNCTIONS_API_KEY}` : ''),
    ).trim();
    const relayApiKey = String(
      req.headers.get('apikey')
      || INTERNAL_FUNCTIONS_API_KEY
      || '',
    ).trim();
    const internalHeaderSecret = String(
      req.headers.get('x-darkrisk-internal-secret')
      || req.headers.get('x-darkrisk360-internal')
      || '',
    ).trim();
    const serviceInvocationKeys = parseSecretKeySet(SERVICE_ROLE, SUPABASE_SECRET_KEYS);
    const isServiceRoleInvocation = Boolean(bearerToken && serviceInvocationKeys.has(bearerToken));
    const internalInvocationKeys = parseSecretKeySet(DARKRISK_INTERNAL_SECRET, DARKRISK_OPERATOR_SECRET);
    const isInternalSecretInvocation = Boolean(internalHeaderSecret && internalInvocationKeys.has(internalHeaderSecret));

    let actorUserId = normalizeText((body as any)?.requested_by) || null;
    let caller: Awaited<ReturnType<typeof getCallerProfile>> | null = null;

    if (!isServiceRoleInvocation && !isInternalSecretInvocation) {
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);
      actorUserId = authData.user.id;
      caller = await getCallerProfile(adminClient, authData.user.id);
    }

    const requestedCustomerId = normalizeText(body?.customer_id);
    const requestedScanJobId = normalizeText(body?.scan_job_id);
    const triggerType = normalizeText(body?.trigger_type) || 'manual';
    const includeDtiExtendedRequested = body?.include_dti_extended === undefined
      ? !triggerType.startsWith('cron_weekly')
      : Boolean(body?.include_dti_extended);
    const manualIdentityEmails = parseIdentityEmailSelectors(body?.identity_emails);

    const customerId = requestedCustomerId || caller?.organizationId || '';
    if (!customerId) return jsonResponse({ error: 'customer_id is required' }, 400);
    if (caller) {
      assertCustomerAccess(caller, customerId);
    }

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

    const normalizedTier = String(entitlement.tier || 'standard').toLowerCase() === 'extended'
      ? 'extended'
      : 'standard';
    const hasExtendedEntitlement = normalizedTier === 'extended';
    const includeDtiExtended = includeDtiExtendedRequested && hasExtendedEntitlement;

    const autoScopeScan = body?.auto_scope_scan !== false;
    const forceScopeRefresh = body?.force_scope_refresh === undefined
      ? triggerType === 'manual'
      : Boolean(body?.force_scope_refresh);
    const allowParallelRuns = Boolean(body?.allow_parallel_runs);

    const nowIso = new Date().toISOString();
    const staleThresholdIso = new Date(Date.now() - DARKRISK_STALE_RUN_MINUTES * 60_000).toISOString();
    const guardThresholdIso = new Date(Date.now() - DARKRISK_RUNNING_GUARD_MINUTES * 60_000).toISOString();

    // Recover stuck runs to keep UI/status coherent.
    await adminClient
      .from('darkrisk_scan_runs' as any)
      .update({
        status: 'failed',
        completed_at: nowIso,
        warnings: ['Run chiuso automaticamente: timeout/stale run guard.'],
      })
      .eq('organization_id', customerId)
      .eq('status', 'running')
      .lt('started_at', staleThresholdIso);

    // Evict stale locks older than DARKRISK_STALE_RUN_MINUTES so a crashed scan
    // never blocks a future run permanently.
    await adminClient
      .from('darkrisk_scan_locks' as any)
      .delete()
      .eq('organization_id', customerId)
      .lt('locked_at', staleThresholdIso);

    if (!allowParallelRuns) {
      // Atomic lock: INSERT fails with PK violation if scan already running.
      let lockErr: any = null;
      const firstLockAttempt = await adminClient
        .from('darkrisk_scan_locks' as any)
        .insert({ organization_id: customerId, locked_at: nowIso });
      lockErr = firstLockAttempt.error;

      if (lockErr) {
        const alreadyLocked = String((lockErr as any)?.code || '') === '23505';
        const tableNotFound = String((lockErr as any)?.code || '') === '42P01';
        if (!alreadyLocked && !tableNotFound) throw lockErr;

        if (alreadyLocked) {
          const runningGuardRes = await adminClient
            .from('darkrisk_scan_runs' as any)
            .select('id, started_at')
            .eq('organization_id', customerId)
            .eq('status', 'running')
            .gte('started_at', guardThresholdIso)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (runningGuardRes.error) throw runningGuardRes.error;
          if (runningGuardRes.data?.id) {
            return jsonResponse({
              ok: true,
              customer_id: customerId,
              status: 'running',
              message: 'Scan DarkRisk360 già in esecuzione per questa organizzazione.',
            });
          }

          // No active running scan but lock still present -> recover stale/orphan lock.
          await adminClient
            .from('darkrisk_scan_locks' as any)
            .delete()
            .eq('organization_id', customerId);

          const secondLockAttempt = await adminClient
            .from('darkrisk_scan_locks' as any)
            .insert({ organization_id: customerId, locked_at: new Date().toISOString() });

          if (secondLockAttempt.error) {
            const secondConflict = String((secondLockAttempt.error as any)?.code || '') === '23505';
            if (secondConflict) {
              return jsonResponse({
                ok: true,
                customer_id: customerId,
                status: 'running',
                message: 'Scan DarkRisk360 già in esecuzione per questa organizzazione.',
              });
            }
            throw secondLockAttempt.error;
          }

          lockErr = null;
        }
      }

      // Legacy guard retained as fallback when lock table is unavailable.
      if (lockErr) {
        const runningGuardRes = await adminClient
          .from('darkrisk_scan_runs' as any)
          .select('id, started_at')
          .eq('organization_id', customerId)
          .eq('status', 'running')
          .gte('started_at', guardThresholdIso)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (runningGuardRes.error) throw runningGuardRes.error;
        if (runningGuardRes.data?.id) {
          return jsonResponse({
            ok: true,
            reused_running_scan_run_id: String(runningGuardRes.data.id),
            customer_id: customerId,
            status: 'running',
            message: 'Scan DarkRisk360 già in esecuzione: riutilizzato run recente.',
          });
        }
      }
    }

    const [orgFlagsRes, scopeRulesRes] = await Promise.all([
      adminClient
        .from('organizations' as any)
        .select(
          'surface_scan360_enabled, dark_risk360_enabled, services_paused, services_paused_at, services_pause_reason, surface_scan_contract_start, surface_scan_contract_years, dark_risk_contract_start, dark_risk_contract_years',
        )
        .eq('id', customerId)
        .maybeSingle(),
      adminClient
        .from('surface_scan_monitored_ips' as any)
        .select('entry_type, input_value, ip_start, ip_end')
        .eq('organization_id', customerId),
    ]);
    if (orgFlagsRes.error) throw orgFlagsRes.error;
    if (scopeRulesRes.error) throw scopeRulesRes.error;

    const orgFlags = (orgFlagsRes.data || {}) as {
      surface_scan360_enabled?: boolean;
      dark_risk360_enabled?: boolean;
      services_paused?: boolean;
      services_pause_reason?: string | null;
      surface_scan_contract_start?: string | null;
      surface_scan_contract_years?: number | null;
      dark_risk_contract_start?: string | null;
      dark_risk_contract_years?: number | null;
    };
    const darkRiskGate = evaluateOrganizationServiceGate(orgFlags as any, 'dark_risk360');
    if (!darkRiskGate.allowed) {
      return jsonResponse(
        {
          ok: false,
          status: 'blocked',
          error: `DarkRisk360 non eseguibile: ${darkRiskGate.reason}`,
          code: darkRiskGate.code,
          contract_start: darkRiskGate.contract_start,
          contract_end: darkRiskGate.contract_end,
        },
        403,
      );
    }
    const surfaceGate = evaluateOrganizationServiceGate(orgFlags as any, 'surface_scan360');

    const scopeRules = (scopeRulesRes.data || []) as ScopeRuleRow[];
    const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules((scopeRules || []) as any[]);
    const scopeIps = Array.from(
      new Set(
        scopeRules
          .filter((row) => String(row.entry_type || '').toLowerCase() === 'single')
          .map((row) => normalizeText(String(row.input_value || '')))
          .filter((value) => Boolean(value)),
      ),
    );

    let autoClassicQueued = 0;
    let autoClassicFailed = 0;
    let autoExposureStarted = false;
    let autoExposureError: string | null = null;

    const shouldAutoQueueScope =
      autoScopeScan
      && surfaceGate.allowed
      && Boolean(SUPABASE_URL && SERVICE_ROLE)
      && (scopeDomains.length > 0 || scopeIps.length > 0);

    if (shouldAutoQueueScope) {
      const scopeTargets = [
        ...scopeDomains.map((domain) => ({ target: domain, profile: 'domain_exposure' })),
        ...scopeIps.map((ip) => ({ target: ip, profile: 'ip_exposure' })),
      ].slice(0, 120);

      const SCOPE_QUEUE_CHUNK = 5;
      for (let si = 0; si < scopeTargets.length; si += SCOPE_QUEUE_CHUNK) {
        const chunk = scopeTargets.slice(si, si + SCOPE_QUEUE_CHUNK);
        const chunkResults = await Promise.allSettled(
          chunk.map(async (item) => {
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), SURFACESCAN_SCOPE_AUTOSTART_TIMEOUT_MS);
            try {
              const startRes = await fetch(`${SUPABASE_URL}/functions/v1/surfacescan360-start-scan`, {
                method: 'POST',
                headers: {
                  Authorization: relayAuthorization,
                  apikey: relayApiKey,
                  'Content-Type': 'application/json',
                  ...(SURFACESCAN_INTERNAL_SECRET ? { 'x-surface-internal-secret': SURFACESCAN_INTERNAL_SECRET } : {}),
                },
                body: JSON.stringify({
                  target: item.target,
                  customer_id: customerId,
                  scan_profile: item.profile,
                  authorization_confirmed: true,
                  ownership_proof: `darkrisk360:auto_scope:${triggerType}`,
                  force_refresh: forceScopeRefresh,
                  requested_by: actorUserId,
                }),
                signal: ctrl.signal,
              });
              clearTimeout(timeout);
              const startPayload = await startRes.json().catch(() => ({}));
              return startRes.ok && !startPayload?.error ? 'queued' : 'failed';
            } catch {
              clearTimeout(timeout);
              return 'failed';
            }
          }),
        );
        for (const r of chunkResults) {
          if (r.status === 'fulfilled' && r.value === 'queued') autoClassicQueued += 1;
          else autoClassicFailed += 1;
        }
      }

      const exposureCtrl = new AbortController();
      const exposureTimeout = setTimeout(() => exposureCtrl.abort(), SURFACESCAN_SCOPE_AUTOSTART_TIMEOUT_MS);
      try {
        const exposureRes = await fetch(`${SUPABASE_URL}/functions/v1/ptools-start-exposure-scan`, {
          method: 'POST',
          headers: {
            Authorization: relayAuthorization,
            apikey: relayApiKey,
            'Content-Type': 'application/json',
            ...(SURFACESCAN_INTERNAL_SECRET ? { 'x-surface-internal-secret': SURFACESCAN_INTERNAL_SECRET } : {}),
            ...(DARKRISK_INTERNAL_SECRET ? { 'x-darkrisk-internal-secret': DARKRISK_INTERNAL_SECRET } : {}),
          },
          body: JSON.stringify({
            tenant_id: customerId,
            customer_id: customerId,
            scan_name: `DarkRisk360 Scope Auto · ${new Date().toISOString().slice(0, 16)}`,
            root_domains: scopeDomains,
            subdomains: [],
            public_ips: scopeIps,
            include_subdomain_discovery: true,
            include_port_scan: true,
            include_web_technology_detection: true,
            include_ssl_scan: true,
            include_network_vuln_scan: false,
            scan_depth: 'deep',
            protocol: 'tcp',
            custom_ports: 'top1000',
            check_alive: true,
            detect_service_version: true,
            detect_os: true,
            traceroute: false,
          }),
          signal: exposureCtrl.signal,
        });
        const exposurePayload = await exposureRes.json().catch(() => ({}));
        if (!exposureRes.ok || exposurePayload?.error) {
          autoExposureError = normalizeText(
            exposurePayload?.error || `HTTP_${exposureRes.status}_ptools_start_exposure`,
          ) || 'ptools_start_exposure_failed';
        } else {
          autoExposureStarted = true;
        }
      } catch (exposureErr: any) {
        autoExposureError = normalizeText(exposureErr?.message) || 'ptools_start_exposure_failed';
      } finally {
        clearTimeout(exposureTimeout);
      }
    }

    const completedScopeJobsRes = await adminClient
      .from('surface_scan_jobs' as any)
      .select('id, organization_id, status, created_at, completed_at, scan_profile, scan_type, raw_target, normalized_target, hostname, target_type')
      .eq('organization_id', customerId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(800);
    if (completedScopeJobsRes.error) throw completedScopeJobsRes.error;

    const latestByScopeTarget = new Map<string, any>();
    for (const row of (completedScopeJobsRes.data || []) as Array<Record<string, any>>) {
      const candidateTarget = normalizeText(String(row.normalized_target || row.raw_target || row.hostname || ''));
      if (!candidateTarget) continue;
      try {
        const normalizedTarget = normalizeTargetInput(candidateTarget);
        const scopeDecision = classifyTargetScope(normalizedTarget, scopeDomains, ipScopeRules as any);
        if (!scopeDecision.allowed) continue;
        const targetKey = `${normalizedTarget.target_type}|${normalizedTarget.normalized_target}`;
        if (!latestByScopeTarget.has(targetKey)) {
          latestByScopeTarget.set(targetKey, row);
        }
      } catch {
        continue;
      }
    }

    const scopeJobs = Array.from(latestByScopeTarget.values()).sort(
      (a, b) => Date.parse(String(b.created_at || 0)) - Date.parse(String(a.created_at || 0)),
    );
    const scopeJobIds = scopeJobs.map((row) => String(row.id)).filter(Boolean);

    const fallbackScanJobRes = requestedScanJobId
      ? await adminClient
          .from('surface_scan_jobs' as any)
          .select('id, organization_id, status, created_at, completed_at, scan_profile, scan_type, raw_target, normalized_target, hostname, target_type')
          .eq('id', requestedScanJobId)
          .maybeSingle()
      : await adminClient
          .from('surface_scan_jobs' as any)
          .select('id, organization_id, status, created_at, completed_at, scan_profile, scan_type, raw_target, normalized_target, hostname, target_type')
          .eq('organization_id', customerId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
    if (fallbackScanJobRes.error) throw fallbackScanJobRes.error;

    const scanJob = (scopeJobs[0] || fallbackScanJobRes.data || null) as any;
    const sourceScanJobId = scanJob?.id ? String(scanJob.id) : null;
    const dataJobIds = scopeJobIds.length > 0
      ? scopeJobIds
      : sourceScanJobId
        ? [sourceScanJobId]
        : [];

    const { data: scanRunData, error: scanRunErr } = await adminClient
      .from('darkrisk_scan_runs' as any)
      .insert({
        organization_id: customerId,
        tenant_id: customerId,
        tier: normalizedTier,
        status: 'running',
        trigger_type: triggerType,
        requested_by: actorUserId,
        surface_scan_job_id: sourceScanJobId,
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
        actor_id: actorUserId,
        action: 'darkrisk_scan_started',
        entity_type: 'darkrisk_scan_run',
        entity_id: scanRunId,
        reason: triggerType,
        metadata: {
          source: 'surfacescan360',
          surface_scan_job_id: sourceScanJobId,
          scope_jobs_used: dataJobIds.length,
          auto_scope_queue: {
            enabled: shouldAutoQueueScope,
            queued_classic: autoClassicQueued,
            failed_classic: autoClassicFailed,
            exposure_started: autoExposureStarted,
            exposure_error: autoExposureError,
            surface_internal_secret_configured: Boolean(SURFACESCAN_INTERNAL_SECRET),
            darkrisk_internal_secret_configured: Boolean(DARKRISK_INTERNAL_SECRET),
            internal_functions_key_kind: INTERNAL_FUNCTIONS_API_KEY.startsWith('eyJ') ? 'jwt' : 'opaque',
          },
          started_at: startedAt,
        },
      });

    const [assetsRes, findingsRes, exposureFindingsRes] = dataJobIds.length > 0
      ? await Promise.all([
          adminClient
            .from('surface_assets' as any)
            .select('id, asset_type, asset_value, source, raw')
            .in('scan_job_id', dataJobIds),
          adminClient
            .from('surface_findings' as any)
            .select('id, finding_type, title, description, severity, module, affected_asset, affected_url, status, evidence, created_at')
            .in('scan_job_id', dataJobIds),
          adminClient
            .from('surface_exposure_findings' as any)
            .select('id, finding_type, title, description, severity, source, affected_host, affected_url, status, evidence, raw, created_at')
            .in('scan_job_id', dataJobIds),
        ])
      : [
          { data: [], error: null } as any,
          { data: [], error: null } as any,
          { data: [], error: null } as any,
        ];

    if (assetsRes.error) throw assetsRes.error;
    if (findingsRes.error) throw findingsRes.error;
    if (exposureFindingsRes.error) throw exposureFindingsRes.error;

    const assets = (assetsRes.data || []) as SurfaceAssetRow[];
    const surfaceFindings = ((findingsRes.data || []) as SurfaceFindingRow[])
      .filter((row) => isActionableFindingStatus(row.status));
    const exposureFindings = ((exposureFindingsRes.data || []) as ExposureFindingRow[])
      .filter((row) => isActionableFindingStatus(row.status));
    const normalizedScopeDomains = Array.from(new Set(scopeDomains.map((entry) => normalizeScopeDomain(entry)).filter(isDomainLike)));

    const scopeAssetRows: Array<Record<string, unknown>> = [
      ...normalizedScopeDomains.map((domain) => ({
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
          source_scan_job_id: sourceScanJobId,
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
          source_scan_job_id: sourceScanJobId,
        },
      })),
    ];

    const assetRowsRaw = [
      ...scopeAssetRows,
      ...assets
      .map((asset) => {
        const value = normalizeText(asset.asset_value);
        if (!value) return null;
        const normalizedValue = normalizeAssetValue(value);
        const assetType = normalizeDarkRiskAssetType(asset.asset_type, normalizedValue);

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

    const dedupedAssetRowsMap = new Map<string, Record<string, unknown>>();
    for (const row of assetRowsRaw) {
      const org = String(row.organization_id || customerId);
      const type = String(row.asset_type || 'unknown');
      const normalized = String(row.normalized_value || '');
      if (!normalized) continue;
      const dedupKey = `${org}|${type}|${normalized}`;
      dedupedAssetRowsMap.set(dedupKey, row);
    }
    const assetRows = Array.from(dedupedAssetRowsMap.values());

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

    if (manualIdentityEmails.length > 0) {
      const manualSelectorRows = manualIdentityEmails.map((email) => ({
        organization_id: customerId,
        tenant_id: customerId,
        selector_type: 'email',
        value: email,
        normalized_value: email,
        source: 'manual',
        status: 'approved',
        metadata: {
          discovered_by: 'darkrisk360-sync-surfacescan',
          input_mode: 'identity_email_manual',
          source_scan_job_id: sourceScanJobId,
        },
      }));
      const { error: manualSelectorErr } = await adminClient
        .from('darkrisk_selectors' as any)
        .upsert(manualSelectorRows as any, {
          onConflict: 'organization_id,selector_type,normalized_value',
          ignoreDuplicates: false,
        });
      if (manualSelectorErr) throw manualSelectorErr;
    }

    const selectorDefinitionsByNormalized = new Map<string, IntelxSelectorDefinition>();
    const addSelectorDefinition = (
      raw: string,
      normalized: string,
      type: DarkRiskSelectorType,
      source: 'surfacescan360' | 'manual' | 'existing',
    ) => {
      const key = normalizeText(normalized).toLowerCase();
      if (!key || selectorDefinitionsByNormalized.has(key)) return;
      selectorDefinitionsByNormalized.set(key, {
        raw,
        normalized,
        type,
        source,
      });
    };

    for (const selectorValue of collectIntelxSelectors(assetRows, canonicalFindings, scopeDomains)) {
      const validation = validateDarkRiskSelector(selectorValue);
      if (!validation.valid || !validation.type || !validation.normalized) continue;
      addSelectorDefinition(selectorValue, validation.normalized, validation.type, 'surfacescan360');
    }

    for (const email of manualIdentityEmails) {
      addSelectorDefinition(email, email, 'email', 'manual');
    }

    const allowedSelectorTypes = Array.from(intelxAllowedSelectorTypes);
    const existingSelectorsRes = await adminClient
      .from('darkrisk_selectors' as any)
      .select('selector_type, value, normalized_value, status')
      .eq('organization_id', customerId)
      .in('selector_type', allowedSelectorTypes)
      .in('status', ['approved', 'candidate'])
      .limit(600);
    if (existingSelectorsRes.error) throw existingSelectorsRes.error;

    for (const selectorRow of ((existingSelectorsRes.data || []) as Array<Record<string, any>>)) {
      const selectorType = normalizeText(String(selectorRow.selector_type || '')) as DarkRiskSelectorType;
      if (!selectorType || !intelxAllowedSelectorTypes.has(selectorType)) continue;
      const normalized = normalizeText(String(selectorRow.normalized_value || '')).toLowerCase();
      if (!normalized) continue;
      const raw = normalizeText(String(selectorRow.value || normalized));
      addSelectorDefinition(raw || normalized, normalized, selectorType, 'existing');
    }

    const selectorDefinitionsAll = Array.from(selectorDefinitionsByNormalized.values());
    const intelxSelectorDefinitions = prioritizeIntelxSelectorDefinitions(
      selectorDefinitionsAll,
      INTELX_MAX_SELECTORS_PER_RUN,
    );

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
          source: selector.source === 'manual' ? 'manual' : 'surfacescan360',
          status: 'approved',
          metadata: {
            discovered_by: 'darkrisk360-sync-surfacescan',
            source_scan_job_id: sourceScanJobId,
            selector_source: selector.source,
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

    const intelxQueryTerms = ensureIdentityEmailQueryTerms(
      buildIntelxQueryTerms(intelxSelectorDefinitions, scopeDomains),
      manualIdentityEmails,
      intelxSelectorDefinitions,
    );
    const identityEmailSelectorsUsed = new Set(
      [
        ...intelxSelectorDefinitions
          .filter((entry) => entry.type === 'email')
          .map((entry) => normalizeText(entry.normalized).toLowerCase()),
        ...manualIdentityEmails.map((entry) => normalizeText(entry).toLowerCase()),
      ].filter(Boolean),
    ).size;
    const firecrawlEmailSelectors = Array.from(
      new Set([
        ...manualIdentityEmails,
        ...intelxSelectorDefinitions
          .filter((entry) => entry.type === 'email')
          .map((entry) => normalizeText(entry.normalized).toLowerCase())
          .filter(Boolean),
      ]),
    );
    const firecrawlTemplates = getFirecrawlSourceTemplates(FIRECRAWL_SOURCE_CONFIG);
    const firecrawlTargets = buildFirecrawlTargets({
      sourceTemplates: firecrawlTemplates,
      scopeDomains,
      emailSelectors: firecrawlEmailSelectors,
      maxTargets: FIRECRAWL_MAX_TARGETS,
    });

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
    let intelxPhonebookSearchesRun = 0;
    let intelxDeepFetchesRun = 0;
    let intelxDeepFetchWarnings = 0;
    let dtiSourceRunsCompleted = 0;
    let dtiSourceRunsPartial = 0;
    let dtiSourceRunsFailed = 0;
    let dtiSensitiveHitsCreated = 0;
    let firecrawlSourcesRun = 0;
    let firecrawlSourcesCompleted = 0;
    let firecrawlSourcesPartial = 0;
    let firecrawlSourcesFailed = 0;
    let firecrawlEvidenceCreated = 0;
    let firecrawlFindingsCreated = 0;
    let firecrawlSensitiveHitsCreated = 0;
    let identityEmailQueriesRun = 0;
    let strictPasswordHits = 0;
    let metadataOnlyHits = 0;
    let intelxRecordsProcessedTotal = 0;
    const intelxWarnings: string[] = [];
    const runDeadlineTs = Date.now() + DARKRISK_RUN_BUDGET_MS;
    let runBudgetStage: string | null = null;
    const shouldStopForRunBudget = (stage: string, minRemainingMs = 0): boolean => {
      const remainingMs = runDeadlineTs - Date.now();
      if (remainingMs > minRemainingMs) return false;
      if (!runBudgetStage) {
        runBudgetStage = normalizeText(stage) || 'pipeline';
        intelxWarnings.push(
          `Run budget raggiunto (${Math.round(DARKRISK_RUN_BUDGET_MS / 1000)}s) in ${runBudgetStage}: scan finalizzata con risultati parziali.`,
        );
      }
      return true;
    };
    let intelxSearchHealthy = false;
    let intelxPhonebookDegraded = false;

    // Pre-compute recurrence counts to avoid O(n²) filter per finding
    const recurrenceMap = new Map<string, number>();
    for (const f of canonicalFindings) {
      const k = `${f.finding_type}|${normalizeAssetValue(f.affected_asset)}`;
      recurrenceMap.set(k, (recurrenceMap.get(k) ?? 0) + 1);
    }

    for (const finding of canonicalFindings) {
      if (shouldStopForRunBudget('surface_ingestion')) break;
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

      const sourceRecordKey = `${sourceScanJobId || 'scope_only'}:${finding.origin}:${finding.source_id}`;
      const { data: sourceRecord, error: sourceRecordErr } = await adminClient
        .from('darkrisk_source_records' as any)
        .upsert({
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
        }, { onConflict: 'organization_id,source,source_record_key', ignoreDuplicates: false })
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
      const recurrenceCount = recurrenceMap.get(`${finding.finding_type}|${normalizeAssetValue(finding.affected_asset)}`) ?? 1;
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

      const surfaceFindingSourceKey = `${sourceScanJobId || 'scope_only'}:${finding.origin}:${finding.source_id}`;
      const darkFinding = await upsertDarkRiskFinding(adminClient, {
          organization_id: customerId,
          tenant_id: customerId,
          scan_run_id: scanRunId,
          source_record_key: surfaceFindingSourceKey,
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
                source_scan_job_id: sourceScanJobId,
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
            });
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
                  source_scan_job_id: sourceScanJobId,
                  module: finding.module,
                },
              });

        if (!alertErr) alertsCreated += 1;
      }
    }

    if (includeDtiExtendedRequested && !hasExtendedEntitlement) {
      intelxWarnings.push('DTI esteso richiesto ma non abilitato sul cliente: eseguito run standard settimanale.');
    }

    if (includeDtiExtended && isIntelxConfigured()) {
      const health = await intelxSearchHealthCheck();
      intelxSearchHealthy = health.ok;
      if (!health.ok) {
        intelxWarnings.push(maskPotentialSecrets(String(health.warning || 'DarkRisk360 health check IntelX non superato.')).slice(0, 180));
      }
    }

    if (includeDtiExtended && isIntelxConfigured() && intelxSearchHealthy) {
      for (const queryTerm of intelxQueryTerms) {
        if (shouldStopForRunBudget('intelx_search')) break;
        if (isEmailSelectorCoverageKind(queryTerm.kind, queryTerm.term)) identityEmailQueriesRun += 1;
        const sourceRunStartedAt = new Date().toISOString();
        const sourceRun = await createDtiSourceRun(adminClient, {
          organization_id: customerId,
          tenant_id: customerId,
          scan_run_id: scanRunId,
          source: 'intelx',
          source_key: `intelx:${queryTerm.kind}:${queryTerm.term}`,
          source_label: 'DarkRisk360 DTI',
          source_kind: 'domain_threat_intelligence',
          query_kind: queryTerm.kind,
          query_term: queryTerm.term,
          asset_scope: queryTerm.linkedAssetNormalized || domainFromQueryTerm(queryTerm.term),
          selector_value: queryTerm.selectorNormalized || null,
          status: 'running',
          started_at: sourceRunStartedAt,
          metadata: {
            stage: 'intelx_search',
          },
        });

        try {
          await wait(INTELX_REQUEST_INTERVAL_MS);
          const records = await runIntelxSearch(queryTerm.term);
          intelxSearchesRun += 1;
          if (queryTerm.kind === 'at_domain_tld') intelxAtDomainQueries += 1;

          if (records.length === 0) {
            if (sourceRun?.id) {
              await finalizeDtiSourceRun(
                adminClient,
                sourceRun.id,
                sourceRun.started_at || sourceRunStartedAt,
                'completed',
                0,
                null,
                null,
                {
                  stage: 'intelx_search',
                  query_term: queryTerm.term,
                  query_kind: queryTerm.kind,
                  records_count: 0,
                },
              );
            }
            dtiSourceRunsCompleted += 1;
            continue;
          }

          let runWarnings: string[] = [];
          let runSensitiveHits = 0;
          let runRecordsProcessed = 0;

          const perQueryCap = queryTerm.kind === 'email_selector'
            ? Math.min(INTELX_MAX_RESULTS_PER_SELECTOR, 12)
            : Math.min(INTELX_MAX_RESULTS_PER_SELECTOR, 4);
          const recordsToProcess = records.slice(0, perQueryCap);
          if (records.length > recordsToProcess.length) {
            runWarnings.push(`Record IntelX troncati (${recordsToProcess.length}/${records.length}) per query ${queryTerm.term}.`);
          }

          const selectorId = queryTerm.selectorNormalized
            ? selectorByNormalized.get(queryTerm.selectorNormalized) || null
            : null;
          const linkedAssetKey = normalizeAssetValue(queryTerm.linkedAssetNormalized || queryTerm.term.replace(/^@/, ''));
          const assetRef = linkedAssetKey ? assetByNormalized.get(linkedAssetKey) : undefined;
          const linkedAssetId = assetRef?.id || null;

          for (const record of recordsToProcess) {
            if (shouldStopForRunBudget('intelx_record_processing')) {
              runWarnings.push('Run budget raggiunto durante processing IntelX.');
              break;
            }
            if (intelxRecordsProcessedTotal >= INTELX_MAX_RECORDS_PER_RUN) {
              runWarnings.push(`Limite record IntelX per run raggiunto (${INTELX_MAX_RECORDS_PER_RUN}).`);
              break;
            }
            intelxRecordsProcessedTotal += 1;
            runRecordsProcessed += 1;
            const sourceRecordKey = normalizeIntelxRecordKey(queryTerm.term, record);
            const title = normalizeText(String(record?.name || '')) || `DarkRisk360 signal on ${queryTerm.term}`;
            const description = normalizeText(String(record?.description || '')) || `Segnale exposure rilevato su query ${queryTerm.term}.`;
            const observedAtCandidate = normalizeText(String(record?.date || record?.added || ''));
            const observedAt = Number.isFinite(Date.parse(observedAtCandidate))
              ? new Date(observedAtCandidate).toISOString()
              : new Date().toISOString();
            const xscore = Number(record?.xscore);
            const systemId = normalizeText(String(record?.systemid || '')) || null;
            const storageId = normalizeText(String(record?.storageid || '')) || null;
            const bucket = normalizeText(String(record?.bucket || '')) || null;
            let deepExtractionSource: 'metadata' | 'preview' | 'read' | 'view' | 'preview_read' = 'metadata';
            let deepExtractionText = '';
            let deepWarning: string | null = null;
            let deepMetadata: Record<string, unknown> = {};

            const remainingBudgetMs = runDeadlineTs - Date.now();
            const allowDeepFetchForTerm = queryTerm.kind === 'email_selector';
            if (
              INTELX_DEEP_FETCH_ENABLED
              && allowDeepFetchForTerm
              && remainingBudgetMs > (INTELX_DEEP_FETCH_TIMEOUT_MS + 1000)
              && intelxDeepFetchesRun < INTELX_DEEP_FETCH_MAX_PER_RUN
              && (systemId || storageId)
            ) {
              const deepRes = await intelxDeepFetch({
                apiKey: INTELX_API_KEY,
                apiUrl: INTELX_API_URL,
                systemId,
                storageId,
                bucket,
                timeoutMs: INTELX_DEEP_FETCH_TIMEOUT_MS,
                retries: 1,
                maxChars: INTELX_DEEP_FETCH_MAX_CHARS,
              });
              intelxDeepFetchesRun += 1;
              deepExtractionSource = deepRes.extractionSource;
              deepExtractionText = deepRes.extractedText;
              deepWarning = deepRes.warning;
              deepMetadata = deepRes.metadata || {};
              if (deepWarning) {
                intelxDeepFetchWarnings += 1;
                runWarnings.push(deepWarning);
              }
            }

            const sensitiveInput = `${title}\n${description}\n${queryTerm.term}\n${deepExtractionText}\n${JSON.stringify(record || {})}`.slice(0, 14_000);
            const sensitiveRawHits = extractSensitiveValueHits(sensitiveInput, 20);
            const strictPolicy = applyStrictSensitivePolicy({
              queryKind: queryTerm.kind,
              queryTerm: queryTerm.term,
              extractionSource: deepExtractionSource,
              sourceText: sensitiveInput,
              hits: sensitiveRawHits,
            });
            strictPasswordHits += strictPolicy.strictPasswordHits;
            metadataOnlyHits += strictPolicy.metadataOnlyHits;
            const sensitiveValueHits = strictPolicy.hits;
            const sensitiveIndicators = indicatorsFromSensitiveHits(sensitiveValueHits);
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
            const intelxRecurrenceKey = `${findingType}|${normalizeAssetValue(queryTerm.linkedAssetNormalized || queryTerm.term.replace(/^@/, ''))}`;
            const intelxRecurrenceCount = recurrenceMap.get(intelxRecurrenceKey) ?? 1;
            const riskScore = calculateFindingRiskScore({
              severity,
              confidence,
              freshnessDays: daysSince(observedAt),
              recurrenceCount: intelxRecurrenceCount,
              affectedAssetCriticality: inferAssetCriticality(queryTerm.linkedAssetNormalized || queryTerm.term),
              isDirectCompromise: compromiseType === 'direct',
              isThirdPartyOnly: compromiseType === 'indirect',
            });

            const previewText = maskPotentialSecrets(`${title}\n${description}\n${deepExtractionText.slice(0, 500)}`.slice(0, 1600));
            const { data: sourceRecord, error: sourceRecordErr } = await adminClient
              .from('darkrisk_source_records' as any)
              .upsert({
                organization_id: customerId,
                tenant_id: customerId,
                scan_run_id: scanRunId,
                source: 'intelx',
                asset_id: linkedAssetId,
                selector_id: selectorId,
                source_record_key: sourceRecordKey,
                source_system_id: systemId,
                source_storage_id: storageId,
                source_bucket: bucket,
                source_media: normalizeText(String(record?.mediah || record?.media || '')) || null,
                source_type: normalizeText(String(record?.typeh || record?.type || '')) || 'intelx_record',
                source_score: Number.isFinite(xscore) ? xscore : null,
                source_date: observedAt,
                source_added_at: observedAt,
                source_simhash: normalizeText(String(record?.simhash || '')) || null,
                query_kind: queryTerm.kind,
                query_term: queryTerm.term,
                asset_scope: queryTerm.linkedAssetNormalized || domainFromQueryTerm(queryTerm.term),
                source_url: null,
                extraction_source: deepExtractionSource,
                extraction_status: deepWarning ? 'partial' : 'completed',
                extraction_error: deepWarning,
                title: maskPotentialSecrets(title),
                description: maskPotentialSecrets(description),
                raw_metadata: {
                  selector: queryTerm.selectorNormalized || null,
                  query_term: queryTerm.term,
                  query_kind: queryTerm.kind,
                  match_policy: strictPolicy.matchPolicy,
                  extraction_confidence: strictPolicy.extractionConfidence,
                  evidence_scope: strictPolicy.evidenceScope,
                  sensitive_indicators: sensitiveIndicators,
                  deep_fetch: {
                    extraction_source: deepExtractionSource,
                    warning: deepWarning,
                    metadata: deepMetadata,
                  },
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
              }, { onConflict: 'organization_id,source,source_record_key', ignoreDuplicates: false })
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
                summary: maskPotentialSecrets(`${description}${deepExtractionText ? `\n${deepExtractionText.slice(0, 1200)}` : ''}`),
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
                  query_term: queryTerm.term,
                  match_policy: strictPolicy.matchPolicy,
                  extraction_confidence: strictPolicy.extractionConfidence,
                  evidence_scope: strictPolicy.evidenceScope,
                  extraction_source: deepExtractionSource,
                  sensitive_indicators: sensitiveIndicators,
                },
              })
              .select('id')
              .single();
            if (evidenceErr || !evidence?.id) throw evidenceErr || new Error('darkrisk360 evidence insert failed');
            evidenceCreated += 1;
            intelxEvidenceCreated += 1;

            const darkFinding = await upsertDarkRiskFinding(adminClient, {
                organization_id: customerId,
                tenant_id: customerId,
                scan_run_id: scanRunId,
                source_record_key: sourceRecordKey,
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
                  source_scan_job_id: sourceScanJobId,
                  source_origin: 'intelx',
                  source_module: 'intelx',
                  source_record_key: sourceRecordKey,
                  compromise_type: compromiseType,
                  third_party_involved: compromiseType === 'indirect',
                  requires_validation: compromiseType !== 'misconfiguration',
                  selector: queryTerm.selectorNormalized || null,
                  query_term: queryTerm.term,
                  query_kind: queryTerm.kind,
                  match_policy: strictPolicy.matchPolicy,
                  extraction_confidence: strictPolicy.extractionConfidence,
                  evidence_scope: strictPolicy.evidenceScope,
                  category_hint: classifyThreatCategoryText(`${title} ${findingType} intelx`),
                  sensitive_indicators: sensitiveIndicators,
                  sensitive_data_detected: hasSensitiveIndicators(sensitiveIndicators),
                },
              });
            findingsCreated += 1;
            intelxFindingsCreated += 1;

            const persistedHits = await persistSensitiveHits(adminClient, {
              organizationId: customerId,
              scanRunId: String(scanRunId || scanRunData.id),
              sourceRunId: sourceRun?.id || null,
              sourceRecordId: String(sourceRecord.id),
              evidenceId: String(evidence.id),
              findingId: String(darkFinding.id),
              source: 'intelx',
              sourceLabel: 'DarkRisk360',
              queryKind: queryTerm.kind,
              queryTerm: queryTerm.term,
              assetScope: queryTerm.linkedAssetNormalized || domainFromQueryTerm(queryTerm.term),
              selectorValue: queryTerm.selectorNormalized || null,
              extractionSource: deepExtractionSource,
              hits: sensitiveValueHits,
              matchPolicy: strictPolicy.matchPolicy,
              extractionConfidence: strictPolicy.extractionConfidence,
              evidenceScope: strictPolicy.evidenceScope,
              warnings: runWarnings,
            });
            runSensitiveHits += persistedHits;
            dtiSensitiveHitsCreated += persistedHits;

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
                    source_scan_job_id: sourceScanJobId,
                  },
                });
              if (!alertErr) {
                alertsCreated += 1;
                intelxAlertsCreated += 1;
              }
            }
          }

          const runStatus: DtiSourceRunStatus = runWarnings.length > 0 ? 'partial' : 'completed';
          if (sourceRun?.id) {
            await finalizeDtiSourceRun(
              adminClient,
              sourceRun.id,
              sourceRun.started_at || sourceRunStartedAt,
              runStatus,
              runRecordsProcessed,
              runWarnings[0] || null,
              null,
              {
                query_term: queryTerm.term,
                query_kind: queryTerm.kind,
                records_count: runRecordsProcessed,
                sensitive_hits: runSensitiveHits,
                warnings: runWarnings.slice(0, 8),
              },
            );
          }
          if (runStatus === 'completed') dtiSourceRunsCompleted += 1;
          else dtiSourceRunsPartial += 1;
        } catch (intelxErr: any) {
          const message = maskPotentialSecrets(normalizeText(intelxErr?.message) || `DarkRisk360 intelligence failed on ${queryTerm.term}`);
          intelxWarnings.push(message);
          if (sourceRun?.id) {
            await finalizeDtiSourceRun(
              adminClient,
              sourceRun.id,
              sourceRun.started_at || sourceRunStartedAt,
              'failed',
              0,
              null,
              message,
              {
                query_term: queryTerm.term,
                query_kind: queryTerm.kind,
              },
            );
          }
          dtiSourceRunsFailed += 1;
        }
      }
    } else if (includeDtiExtended && !isIntelxConfigured()) {
      intelxWarnings.push('DarkRisk360 intelligence non configurata: impostare la chiave provider nelle Edge Function secrets.');
    } else if (includeDtiExtended && isIntelxConfigured() && !intelxSearchHealthy) {
      intelxWarnings.push('DarkRisk360 intelligence degradato: search API non disponibile in questo ciclo.');
    }

    // Phonebook searches — extended tier only
    if (includeDtiExtended && isIntelxConfigured() && intelxSearchHealthy && entitlement.tier === 'extended') {
      const phonebookTerms = intelxQueryTerms.filter(
        (qt) => qt.kind === 'at_domain_tld' || qt.kind === 'selector' || qt.kind === 'email_selector',
      ).slice(0, Math.min(10, INTELX_MAX_QUERY_TERMS_PER_RUN));

      for (const queryTerm of phonebookTerms) {
        if (shouldStopForRunBudget('intelx_phonebook')) break;
        if (isEmailSelectorCoverageKind(queryTerm.kind, queryTerm.term)) identityEmailQueriesRun += 1;
        const sourceRunStartedAt = new Date().toISOString();
        const sourceRun = await createDtiSourceRun(adminClient, {
          organization_id: customerId,
          tenant_id: customerId,
          scan_run_id: scanRunId,
          source: 'intelx',
          source_key: `intelx:phonebook:${queryTerm.kind}:${queryTerm.term}`,
          source_label: 'DarkRisk360 Phonebook',
          source_kind: 'phonebook_intelligence',
          query_kind: queryTerm.kind,
          query_term: queryTerm.term,
          asset_scope: queryTerm.linkedAssetNormalized || domainFromQueryTerm(queryTerm.term),
          selector_value: queryTerm.selectorNormalized || null,
          status: 'running',
          started_at: sourceRunStartedAt,
          metadata: { stage: 'intelx_phonebook' },
        });

        try {
          await wait(INTELX_REQUEST_INTERVAL_MS);
          const records = await runIntelxPhonebookSearch(queryTerm.term);
          intelxPhonebookSearchesRun += 1;

          const runStatus: DtiSourceRunStatus = records.length > 0 ? 'completed' : 'completed';
          if (sourceRun?.id) {
            await finalizeDtiSourceRun(
              adminClient, sourceRun.id, sourceRun.started_at || sourceRunStartedAt,
              runStatus, records.length, null, null,
              { query_term: queryTerm.term, query_kind: queryTerm.kind, records_count: records.length, stage: 'phonebook' },
            );
          }
          if (runStatus === 'completed') dtiSourceRunsCompleted += 1;
        } catch (pbErr: any) {
          const message = maskPotentialSecrets(normalizeText(pbErr?.message) || `Phonebook search failed on ${queryTerm.term}`);
          intelxWarnings.push(message);
          if (isAuthzLikeError(message)) {
            intelxPhonebookDegraded = true;
            if (sourceRun?.id) {
              await finalizeDtiSourceRun(
                adminClient, sourceRun.id, sourceRun.started_at || sourceRunStartedAt,
                'partial', 0, 'Phonebook degraded (401/403)', message,
                { query_term: queryTerm.term, query_kind: queryTerm.kind, degraded: true, stage: 'phonebook' },
              );
            }
            dtiSourceRunsPartial += 1;
            break;
          }
          if (sourceRun?.id) {
            await finalizeDtiSourceRun(
              adminClient, sourceRun.id, sourceRun.started_at || sourceRunStartedAt,
              'failed', 0, null, message,
              { query_term: queryTerm.term, query_kind: queryTerm.kind },
            );
          }
          dtiSourceRunsFailed += 1;
        }
      }
    }

    if (includeDtiExtended && FIRECRAWL_ENABLED && FIRECRAWL_API_KEY && firecrawlTargets.length > 0) {
      for (const target of firecrawlTargets) {
        if (shouldStopForRunBudget('firecrawl_ingestion', FIRECRAWL_TIMEOUT_MS + 1_500)) break;
        if (isEmailSelectorCoverageKind(target.queryKind, target.queryTerm)) identityEmailQueriesRun += 1;
        firecrawlSourcesRun += 1;
        const sourceRun = await createDtiSourceRun(adminClient, {
          organization_id: customerId,
          tenant_id: customerId,
          scan_run_id: scanRunId,
          source: 'firecrawl',
          source_key: `firecrawl:${target.sourceKey}:${target.queryKind}:${target.queryTerm}`,
          source_label: target.sourceLabel,
          source_kind: 'dti_guideline_source',
          query_kind: target.queryKind,
          query_term: target.queryTerm,
          asset_scope: target.assetScope,
          selector_value: target.selectorValue,
          target_url: target.targetUrl,
          status: 'running',
          metadata: {
            source_key: target.sourceKey,
          },
        });

        try {
          const scrape = await firecrawlScrape({
            apiKey: FIRECRAWL_API_KEY,
            targetUrl: target.targetUrl,
            timeoutMs: FIRECRAWL_TIMEOUT_MS,
            retries: FIRECRAWL_RETRIES,
            maxMarkdownChars: FIRECRAWL_MAX_MARKDOWN_CHARS,
          });

          const combinedText = `${scrape.title}\n${scrape.summary}\n${scrape.markdown}`.slice(0, 20_000);
          const rawSensitiveHits = extractSensitiveValueHits(combinedText, 20);
          const strictPolicy = applyStrictSensitivePolicy({
            queryKind: target.queryKind,
            queryTerm: target.queryTerm,
            extractionSource: 'firecrawl_scrape',
            sourceText: combinedText,
            hits: rawSensitiveHits,
          });
          strictPasswordHits += strictPolicy.strictPasswordHits;
          metadataOnlyHits += strictPolicy.metadataOnlyHits;
          const sensitiveHits = strictPolicy.hits;
          const sensitiveIndicators = indicatorsFromSensitiveHits(sensitiveHits);
          const severityBase: 'info' | 'low' | 'medium' | 'high' | 'critical' = scrape.ok
            ? (hasSensitiveIndicators(sensitiveIndicators) ? 'medium' : 'info')
            : 'low';
          const severity = boostSeverityForSensitiveData(severityBase, sensitiveIndicators);
          const confidence: 'low' | 'medium' | 'high' = scrape.ok ? 'medium' : 'low';
          // Deterministic key — no UUID — to prevent duplicate records on repeated scans
          const sourceRecordKey = `firecrawl:${target.sourceKey}:${target.queryKind}:${normalizeText(target.queryTerm).toLowerCase()}`;

          const linkedAssetKey = normalizeAssetValue(target.assetScope);
          const assetRef = linkedAssetKey ? assetByNormalized.get(linkedAssetKey) : undefined;
          const linkedAssetId = assetRef?.id || null;
          const selectorId = target.selectorValue
            ? selectorByNormalized.get(normalizeText(target.selectorValue).toLowerCase()) || null
            : null;

          const { data: sourceRecord, error: sourceRecordErr } = await adminClient
            .from('darkrisk_source_records' as any)
            .upsert({
              organization_id: customerId,
              tenant_id: customerId,
              scan_run_id: scanRunId,
              source: 'firecrawl',
              asset_id: linkedAssetId,
              selector_id: selectorId,
              source_record_key: sourceRecordKey,
              source_type: 'dti_guideline_source',
              source_media: 'web_page',
              source_url: target.targetUrl,
              query_kind: target.queryKind,
              query_term: target.queryTerm,
              asset_scope: target.assetScope,
              extraction_source: 'firecrawl_scrape',
              extraction_status: scrape.ok ? (scrape.warning ? 'partial' : 'completed') : 'failed',
              extraction_error: scrape.error,
              title: maskPotentialSecrets(scrape.title || `DarkRisk360 source ${target.sourceLabel}`),
              description: maskPotentialSecrets(scrape.summary || scrape.error || `Source ${target.sourceLabel}`),
              raw_metadata: {
                source_key: target.sourceKey,
                links: scrape.links,
                metadata: scrape.metadata,
                warning: scrape.warning,
                error: scrape.error,
                match_policy: strictPolicy.matchPolicy,
                extraction_confidence: strictPolicy.extractionConfidence,
                evidence_scope: strictPolicy.evidenceScope,
                sensitive_indicators: sensitiveIndicators,
              },
              safe_preview: maskPotentialSecrets(combinedText.slice(0, 1200)),
              preview_hash: sourceRecordKey,
            }, { onConflict: 'organization_id,source,source_record_key', ignoreDuplicates: false })
            .select('id')
            .single();
          if (sourceRecordErr || !sourceRecord?.id) throw sourceRecordErr || new Error('firecrawl source record insert failed');
          recordsCreated += 1;

          const { data: evidence, error: evidenceErr } = await adminClient
            .from('darkrisk_evidence' as any)
            .insert({
              organization_id: customerId,
              tenant_id: customerId,
              scan_run_id: scanRunId,
              source_record_id: sourceRecord.id,
              source: 'firecrawl',
              evidence_class: 'dti_guideline_source',
              asset_id: linkedAssetId,
              selector_id: selectorId,
              title: maskPotentialSecrets(scrape.title || `DarkRisk360 source ${target.sourceLabel}`),
              summary: maskPotentialSecrets(scrape.summary || scrape.error || 'Source ingestion result'),
              masked_value: maskPotentialSecrets(target.queryTerm),
              severity_hint: severity,
              confidence,
              observed_at: new Date().toISOString(),
              first_seen_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
              visibility: 'customer',
              contains_sensitive_data: hasSensitiveIndicators(sensitiveIndicators),
              metadata: {
                source_key: target.sourceKey,
                query_kind: target.queryKind,
                query_term: target.queryTerm,
                source_url: target.targetUrl,
                links_count: scrape.links.length,
                match_policy: strictPolicy.matchPolicy,
                extraction_confidence: strictPolicy.extractionConfidence,
                evidence_scope: strictPolicy.evidenceScope,
                sensitive_indicators: sensitiveIndicators,
              },
            })
            .select('id')
            .single();
          if (evidenceErr || !evidence?.id) throw evidenceErr || new Error('firecrawl evidence insert failed');
          evidenceCreated += 1;
          firecrawlEvidenceCreated += 1;

          const riskDimensions = inferRiskDimensions({
            findingType: 'darkrisk_dti_signal',
            title: `${target.sourceLabel} ${target.queryTerm}`,
            module: 'firecrawl',
            confidence,
            freshnessDays: 0,
          });
          if (hasSensitiveIndicators(sensitiveIndicators)) {
            riskDimensions.identity_exposure = Math.min(100, Number(riskDimensions.identity_exposure || 0) + 25);
          }
          const riskScore = calculateFindingRiskScore({
            severity,
            confidence,
            freshnessDays: 0,
            recurrenceCount: 1,
            affectedAssetCriticality: inferAssetCriticality(target.assetScope),
            isDirectCompromise: hasSensitiveIndicators(sensitiveIndicators),
            isThirdPartyOnly: false,
          });

          const darkFinding = await upsertDarkRiskFinding(adminClient, {
              organization_id: customerId,
              tenant_id: customerId,
              scan_run_id: scanRunId,
              source_record_key: sourceRecordKey,
              finding_type: 'darkrisk_dti_source_signal',
              title: maskPotentialSecrets(scrape.title || `${target.sourceLabel} · ${target.queryTerm}`),
              description: maskPotentialSecrets(scrape.summary || scrape.error || `Sorgente ${target.sourceLabel} completata`),
              affected_asset_id: linkedAssetId,
              affected_selector_id: selectorId,
              severity,
              confidence,
              status: 'new',
              risk_score: riskScore,
              risk_dimensions: riskDimensions,
              evidence_ids: [evidence.id],
              first_seen_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
              metadata: {
                source_origin: 'firecrawl',
                source_module: 'firecrawl',
                query_term: target.queryTerm,
                query_kind: target.queryKind,
                source_url: target.targetUrl,
                source_label: target.sourceLabel,
                match_policy: strictPolicy.matchPolicy,
                extraction_confidence: strictPolicy.extractionConfidence,
                evidence_scope: strictPolicy.evidenceScope,
                category_hint: classifyThreatCategoryText(`${target.sourceLabel} dti source`),
                sensitive_indicators: sensitiveIndicators,
                sensitive_data_detected: hasSensitiveIndicators(sensitiveIndicators),
              },
            });
          findingsCreated += 1;
          firecrawlFindingsCreated += 1;

          const firecrawlRunWarnings: string[] = [];
          const persistedHits = await persistSensitiveHits(adminClient, {
            organizationId: customerId,
            scanRunId: String(scanRunId || scanRunData.id),
            sourceRunId: sourceRun?.id || null,
            sourceRecordId: String(sourceRecord.id),
            evidenceId: String(evidence.id),
            findingId: String(darkFinding.id),
            source: 'firecrawl',
            sourceLabel: target.sourceLabel,
            queryKind: target.queryKind,
            queryTerm: target.queryTerm,
            assetScope: target.assetScope,
            selectorValue: target.selectorValue,
            extractionSource: 'firecrawl_scrape',
            hits: sensitiveHits,
            matchPolicy: strictPolicy.matchPolicy,
            extractionConfidence: strictPolicy.extractionConfidence,
            evidenceScope: strictPolicy.evidenceScope,
            warnings: firecrawlRunWarnings,
          });
          if (firecrawlRunWarnings.length > 0) intelxWarnings.push(...firecrawlRunWarnings);
          dtiSensitiveHitsCreated += persistedHits;
          firecrawlSensitiveHitsCreated += persistedHits;

          const runStatus = scrape.ok ? (scrape.warning ? 'partial' : 'completed') : 'failed';
          if (sourceRun?.id) {
            await finalizeDtiSourceRun(
              adminClient,
              sourceRun.id,
              sourceRun.started_at || null,
              normalizeDtiStatus(runStatus),
              scrape.ok ? 1 : 0,
              scrape.warning,
              scrape.error,
              {
                source_key: target.sourceKey,
                source_url: target.targetUrl,
                links_count: scrape.links.length,
                sensitive_hits: persistedHits,
              },
            );
          }

          if (runStatus === 'completed') {
            dtiSourceRunsCompleted += 1;
            firecrawlSourcesCompleted += 1;
          } else if (runStatus === 'partial') {
            dtiSourceRunsPartial += 1;
            firecrawlSourcesPartial += 1;
          } else {
            dtiSourceRunsFailed += 1;
            firecrawlSourcesFailed += 1;
          }
        } catch (firecrawlErr: any) {
          const message = maskPotentialSecrets(normalizeText(firecrawlErr?.message) || `Firecrawl DTI source failed on ${target.targetUrl}`);
          intelxWarnings.push(message);
          if (sourceRun?.id) {
            await finalizeDtiSourceRun(
              adminClient,
              sourceRun.id,
              sourceRun.started_at || null,
              'failed',
              0,
              null,
              message,
              {
                source_key: target.sourceKey,
                source_url: target.targetUrl,
              },
            );
          }
          dtiSourceRunsFailed += 1;
          firecrawlSourcesFailed += 1;
        }
      }
    } else if (includeDtiExtended && !FIRECRAWL_API_KEY) {
      intelxWarnings.push('Firecrawl non configurato: impostare FIRECRAWL_API_KEY nelle Edge Function secrets per la raccolta DTI estesa.');
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
    if (firecrawlSourcesRun > 0 || firecrawlEvidenceCreated > 0 || firecrawlFindingsCreated > 0) {
      scanSources.add('firecrawl');
    }
    await adminClient
      .from('darkrisk_scan_runs' as any)
      .update({
        status: 'completed',
        completed_at: completedAt,
        sources: Array.from(scanSources),
        warnings: intelxWarnings,
        stats: {
          surface_scan_job_id: sourceScanJobId,
          sources: Array.from(scanSources),
          source_records_created: recordsCreated,
          evidence_created: evidenceCreated,
          findings_created: findingsCreated,
          alerts_created: alertsCreated,
          assets_synced: assetRows.length,
          intelx: {
            selectors_considered: intelxSelectorDefinitions.length,
            identity_email_selectors_used: identityEmailSelectorsUsed,
            query_terms_considered: intelxQueryTerms.length,
            searches_run: intelxSearchesRun,
            email_queries_run: identityEmailQueriesRun,
            strict_password_hits: strictPasswordHits,
            metadata_only_hits: metadataOnlyHits,
            at_domain_tld_queries: intelxAtDomainQueries,
            phonebook_searches_run: intelxPhonebookSearchesRun,
            phonebook_degraded: intelxPhonebookDegraded,
            deep_fetches_run: intelxDeepFetchesRun,
            deep_fetch_warnings: intelxDeepFetchWarnings,
            source_records_created: intelxRecordsCreated,
            evidence_created: intelxEvidenceCreated,
            findings_created: intelxFindingsCreated,
            alerts_created: intelxAlertsCreated,
          },
          dti: {
            extended_enabled: includeDtiExtended,
            source_runs: {
              completed: dtiSourceRunsCompleted,
              partial: dtiSourceRunsPartial,
              failed: dtiSourceRunsFailed,
            },
            sensitive_hits_created: dtiSensitiveHitsCreated,
            firecrawl: {
              templates_considered: firecrawlTemplates.length,
              targets_considered: firecrawlTargets.length,
              sources_run: firecrawlSourcesRun,
              completed: firecrawlSourcesCompleted,
              partial: firecrawlSourcesPartial,
              failed: firecrawlSourcesFailed,
              evidence_created: firecrawlEvidenceCreated,
              findings_created: firecrawlFindingsCreated,
              sensitive_hits_created: firecrawlSensitiveHitsCreated,
            },
          },
        },
      })
      .eq('id', scanRunId);

    const aiEnabled = entitlement?.enable_ai_recommendations !== false;
    if (aiEnabled && SUPABASE_URL && SERVICE_ROLE) {
      const recommendationTimeoutMs = Math.min(
        DARKRISK_INTERNAL_CHAIN_TIMEOUT_MS,
        Math.max(0, runDeadlineTs - Date.now() - 750),
      );
      if (recommendationTimeoutMs < 3_000) {
        recommendationMode = 'failed';
        recommendationWarning = 'AI recommendation generation skipped: insufficient run budget window.';
      } else {
        try {
          const recoRes = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/darkrisk360-generate-recommendations`, {
            method: 'POST',
            headers: {
              Authorization: relayAuthorization,
              apikey: relayApiKey,
              'Content-Type': 'application/json',
              ...(DARKRISK_INTERNAL_SECRET ? { 'x-darkrisk-internal-secret': DARKRISK_INTERNAL_SECRET } : {}),
            },
            body: JSON.stringify({
              customer_id: customerId,
              scan_run_id: scanRunId,
              trigger_type: 'auto_after_sync',
            }),
          }, recommendationTimeoutMs);

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
      }
    } else if (!aiEnabled) {
      recommendationMode = 'disabled';
    }

    if (SUPABASE_URL && SERVICE_ROLE) {
      const reportTimeoutMs = Math.min(
        DARKRISK_INTERNAL_CHAIN_TIMEOUT_MS,
        Math.max(0, runDeadlineTs - Date.now() - 750),
      );
      if (reportTimeoutMs < 3_000) {
        reportMode = 'failed';
        reportWarning = 'DarkRisk report generation skipped: insufficient run budget window.';
      } else {
        try {
          const reportRes = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/darkrisk360-generate-report`, {
            method: 'POST',
            headers: {
              Authorization: relayAuthorization,
              apikey: relayApiKey,
              'Content-Type': 'application/json',
              ...(DARKRISK_INTERNAL_SECRET ? { 'x-darkrisk-internal-secret': DARKRISK_INTERNAL_SECRET } : {}),
            },
            body: JSON.stringify({
              customer_id: customerId,
              scan_run_id: scanRunId,
              classification: 'confidential',
              report_mode: includeDtiExtended ? 'extended' : 'weekly',
            }),
          }, reportTimeoutMs);
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
        actor_id: actorUserId,
        action: allWarnings.length > 0 ? 'darkrisk_scan_completed_with_warnings' : 'darkrisk_scan_completed',
        entity_type: 'darkrisk_scan_run',
        entity_id: scanRunId,
        reason: triggerType,
        metadata: {
          source: Array.from(scanSources),
          surface_scan_job_id: sourceScanJobId,
          assets_synced: assetRows.length,
          source_records_created: recordsCreated,
          evidence_created: evidenceCreated,
          findings_created: findingsCreated,
          alerts_created: alertsCreated,
          intelx: {
            selectors_considered: intelxSelectorDefinitions.length,
            identity_email_selectors_used: identityEmailSelectorsUsed,
            query_terms_considered: intelxQueryTerms.length,
            searches_run: intelxSearchesRun,
            email_queries_run: identityEmailQueriesRun,
            strict_password_hits: strictPasswordHits,
            metadata_only_hits: metadataOnlyHits,
            at_domain_tld_queries: intelxAtDomainQueries,
            phonebook_searches_run: intelxPhonebookSearchesRun,
            phonebook_degraded: intelxPhonebookDegraded,
            deep_fetches_run: intelxDeepFetchesRun,
            deep_fetch_warnings: intelxDeepFetchWarnings,
            source_records_created: intelxRecordsCreated,
            evidence_created: intelxEvidenceCreated,
            findings_created: intelxFindingsCreated,
            alerts_created: intelxAlertsCreated,
          },
          dti: {
            extended_enabled: includeDtiExtended,
            source_runs: {
              completed: dtiSourceRunsCompleted,
              partial: dtiSourceRunsPartial,
              failed: dtiSourceRunsFailed,
            },
            sensitive_hits_created: dtiSensitiveHitsCreated,
            firecrawl: {
              templates_considered: firecrawlTemplates.length,
              targets_considered: firecrawlTargets.length,
              sources_run: firecrawlSourcesRun,
              completed: firecrawlSourcesCompleted,
              partial: firecrawlSourcesPartial,
              failed: firecrawlSourcesFailed,
              evidence_created: firecrawlEvidenceCreated,
              findings_created: firecrawlFindingsCreated,
              sensitive_hits_created: firecrawlSensitiveHitsCreated,
            },
          },
          recommendation_mode: recommendationMode,
          report_mode: reportMode,
          warning: allWarnings,
        },
      });

    // Release scan lock so subsequent scans can proceed.
    try {
      await adminClient
        .from('darkrisk_scan_locks' as any)
        .delete()
        .eq('organization_id', customerId);
    } catch {
      // ignore lock release failures
    }

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
          identity_email_selectors_used: identityEmailSelectorsUsed,
          query_terms_considered: intelxQueryTerms.length,
          searches_run: intelxSearchesRun,
          email_queries_run: identityEmailQueriesRun,
          strict_password_hits: strictPasswordHits,
          metadata_only_hits: metadataOnlyHits,
          at_domain_tld_queries: intelxAtDomainQueries,
          deep_fetches_run: intelxDeepFetchesRun,
          deep_fetch_warnings: intelxDeepFetchWarnings,
          source_records_created: intelxRecordsCreated,
          evidence_created: intelxEvidenceCreated,
          findings_created: intelxFindingsCreated,
          alerts_created: intelxAlertsCreated,
        },
        dti: {
          extended_enabled: includeDtiExtended,
          source_runs: {
            completed: dtiSourceRunsCompleted,
            partial: dtiSourceRunsPartial,
            failed: dtiSourceRunsFailed,
          },
          sensitive_hits_created: dtiSensitiveHitsCreated,
          firecrawl: {
            templates_considered: firecrawlTemplates.length,
            targets_considered: firecrawlTargets.length,
            sources_run: firecrawlSourcesRun,
            completed: firecrawlSourcesCompleted,
            partial: firecrawlSourcesPartial,
            failed: firecrawlSourcesFailed,
            evidence_created: firecrawlEvidenceCreated,
            findings_created: firecrawlFindingsCreated,
            sensitive_hits_created: firecrawlSensitiveHitsCreated,
          },
        },
        recommendation_mode: recommendationMode,
        report_mode: reportMode,
      },
      warning: allWarnings.join(' | ') || null,
    });
  } catch (error: any) {
    if (scanRunId) {
      try {
        const { adminClient: errAdminClient } = makeSupabaseClients(req);
        const { data: runScope } = await errAdminClient
          .from('darkrisk_scan_runs' as any)
          .select('organization_id, requested_by')
          .eq('id', scanRunId)
          .maybeSingle();

        await errAdminClient
          .from('darkrisk_scan_runs' as any)
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: normalizeText(error?.message) || 'Unknown error',
          })
          .eq('id', scanRunId);

        // Release scan lock on failure so the next attempt is not blocked.
        const failedOrg = runScope?.organization_id;
        if (failedOrg) {
          try {
            await errAdminClient
              .from('darkrisk_scan_locks' as any)
              .delete()
              .eq('organization_id', failedOrg);
          } catch {
            // ignore lock release failures
          }
        }

        await errAdminClient
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
