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
  calculateFindingRiskScore,
  inferCompromiseType,
  inferRiskDimensions,
} from '../_shared/darkrisk-scoring.ts';
import {
  detectSensitiveIndicators,
  extractSensitiveValueHits,
  hasSensitiveIndicators,
  type SensitiveIndicators,
} from '../_shared/darkrisk-sensitive-detection.ts';
import {
  type DarkRiskSelectorType,
  validateDarkRiskSelector,
} from '../_shared/darkrisk-selector-validation.ts';
import {
  maskPotentialSecrets,
  normalizeAssetValue,
  normalizeText,
} from '../_shared/darkrisk-utils.ts';
import { isEmailSelectorCoverageKind } from '../_shared/darkrisk-query-kind.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const INTERNAL_FUNCTIONS_API_KEY = String(
  Deno.env.get('SUPABASE_ANON_KEY')
    || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    || Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
    || SERVICE_ROLE
    || '',
).trim();

const DARKRISK_INTERNAL_SECRET = String(Deno.env.get('DARKRISK360_INTERNAL_SECRET') || '').trim();
const SURFACESCAN_INTERNAL_SECRET = String(
  Deno.env.get('SURFACESCAN_CRON_INTERNAL_SECRET')
    || Deno.env.get('SURFACESCAN_INTERNAL_SECRET')
    || '',
).trim();

const ESTESO_SEARCH_API_URL = String(
  Deno.env.get('INTELX_ESTESO_SEARCH_API_URL') || 'https://2.intelx.io',
).replace(/\/+$/, '');
const ESTESO_LEAKS_API_URL = String(
  Deno.env.get('INTELX_ESTESO_LEAKS_API_URL') || 'https://3.intelx.io',
).replace(/\/+$/, '');
const ESTESO_SEARCH_API_KEY = String(Deno.env.get('INTELX_API_KEY') || '').trim();
const ESTESO_LEAKS_API_KEY = String(Deno.env.get('INTELX_LEAKS_API_KEY') || ESTESO_SEARCH_API_KEY).trim();

const ESTESO_IDENTITY_VALID_UNTIL = String(
  Deno.env.get('DARKRISK_ESTESO_IDENTITY_VALID_UNTIL') || '2026-06-10',
).trim();

const INTELX_MAX_POLL_ROUNDS = Math.max(
  2,
  Math.min(24, Number(Deno.env.get('DARKRISK_ESTESO_INTELX_MAX_POLL_ROUNDS') || 10)),
);
const INTELX_REQUEST_INTERVAL_MS = Math.max(
  800,
  Math.min(2500, Number(Deno.env.get('DARKRISK_ESTESO_INTELX_REQUEST_INTERVAL_MS') || 850)),
);
const INTELX_MAX_QUERY_TERMS_PER_RUN = Math.max(
  5,
  Math.min(120, Number(Deno.env.get('DARKRISK_ESTESO_MAX_QUERY_TERMS_PER_RUN') || 40)),
);
const INTELX_MAX_RESULTS_PER_QUERY = Math.max(
  5,
  Math.min(200, Number(Deno.env.get('DARKRISK_ESTESO_MAX_RESULTS_PER_QUERY') || 40)),
);
const INTELX_MAX_RECORDS_PER_RUN = Math.max(
  20,
  Math.min(2500, Number(Deno.env.get('DARKRISK_ESTESO_MAX_RECORDS_PER_RUN') || 600)),
);
const INTELX_HTTP_TIMEOUT_MS = Math.max(
  6_000,
  Math.min(120_000, Number(Deno.env.get('DARKRISK_ESTESO_HTTP_TIMEOUT_MS') || 35_000)),
);
const INTELX_MAX_SELECTORS_PER_RUN = Math.max(
  5,
  Math.min(120, Number(Deno.env.get('DARKRISK_ESTESO_MAX_SELECTORS_PER_RUN') || 40)),
);
const INTELX_PHONEBOOK_TARGET = Math.max(
  0,
  Math.min(3, Number(Deno.env.get('DARKRISK_ESTESO_PHONEBOOK_TARGET') || 0)),
);
const INTELX_PHONEBOOK_MAX_TERMS = Math.max(
  1,
  Math.min(20, Number(Deno.env.get('DARKRISK_ESTESO_PHONEBOOK_MAX_TERMS') || 8)),
);
// Timeout ridotto: 5 domini × 8s = 40s max — permette completamento entro il limite Supabase (150s)
const SURFACE_AUTOSTART_TIMEOUT_MS = Math.max(
  5_000,
  Math.min(15_000, Number(Deno.env.get('SURFACESCAN_SCOPE_AUTOSTART_TIMEOUT_MS') || 8_000)),
);

type Json = Record<string, unknown>;

type IntelxSearchResponse = {
  id?: string;
  status?: number;
  records?: Array<Record<string, unknown>>;
  text?: string;
};

type SelectorDef = {
  type: DarkRiskSelectorType;
  normalized: string;
  source: 'scope' | 'manual' | 'existing' | 'surface';
};

type QueryTerm = {
  term: string;
  kind: 'at_domain_tld' | 'selector' | 'email_selector';
  selectorNormalized: string | null;
  assetScope: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isInvalidSearchIdLike(input: unknown): boolean {
  const msg = String(input || '').toLowerCase();
  return msg.includes('invalid search id') || msg.includes('search id not found');
}

function pushWarningUnique(warnings: string[], message: string): void {
  const normalized = normalizeText(message);
  if (!normalized) return;
  if (!warnings.includes(normalized)) warnings.push(normalized);
}

async function intelxFetchWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      const retryable =
        msg.includes('429')
        || msg.includes('too many')
        || msg.includes('rate limit')
        || msg.includes('max concurrent searches');
      if (retryable && attempt < maxRetries - 1) {
        await wait(600 * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error('IntelX max retries exceeded');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseIdentityEmailSelectors(input: unknown): string[] {
  const tokens = Array.isArray(input)
    ? input.map((entry) => String(entry || ''))
    : String(input || '').split(/[\n,;\s]+/);

  const out = new Set<string>();
  for (const token of tokens) {
    const normalized = normalizeText(token).toLowerCase();
    if (!normalized) continue;
    const validation = validateDarkRiskSelector(normalized);
    if (!validation.valid || validation.type !== 'email' || !validation.normalized) continue;
    out.add(validation.normalized);
  }
  return Array.from(out).slice(0, 120);
}

function normalizeScopeDomain(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

function isDomainLike(value: string): boolean {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value);
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

function inferConfidenceByScore(score: number | null): 'low' | 'medium' | 'high' {
  if (!Number.isFinite(Number(score))) return 'medium';
  if (Number(score) >= 75) return 'high';
  if (Number(score) >= 40) return 'medium';
  return 'low';
}

function severityFromScore(score: number | null): 'info' | 'low' | 'medium' | 'high' | 'critical' {
  if (!Number.isFinite(Number(score))) return 'medium';
  if (Number(score) >= 90) return 'critical';
  if (Number(score) >= 75) return 'high';
  if (Number(score) >= 50) return 'medium';
  if (Number(score) >= 30) return 'low';
  return 'info';
}

function determineLeakSeverity(indicators: SensitiveIndicators): 'info' | 'low' | 'medium' | 'high' | 'critical' {
  if ((indicators.passwords || 0) > 0 || (indicators.credit_cards || 0) > 0) return 'high';
  if ((indicators.addresses || 0) > 0 || (indicators.phone_numbers || 0) > 0) return 'medium';
  if ((indicators.domains || 0) > 0) return 'low';
  return 'info';
}

function intelxFindingTypeFromRecord(record: Record<string, unknown>, selector: string): string {
  const text = `${String(selector || '')} ${String(record?.name || '')} ${String(record?.description || '')}`.toLowerCase();
  if (/credential|password|stealer|combo|leak/.test(text)) return 'intelx_credential_exposure';
  if (/email|mailbox|account/.test(text)) return 'intelx_identity_exposure';
  if (/domain|subdomain|host|whois|rdap/.test(text)) return 'intelx_domain_exposure';
  return 'intelx_exposure_signal';
}

function leaksFindingTypeFromRecord(queryKind: string, queryTerm: string): string {
  if (isEmailSelectorCoverageKind(queryKind, queryTerm)) return 'intelx_identity_leak';
  return 'intelx_domain_leak';
}

function normalizeIntelxRecordKey(selector: string, record: Record<string, unknown>): string {
  const systemId = normalizeText(String(record?.systemid || ''));
  const storageId = normalizeText(String(record?.storageid || ''));
  if (systemId) return `${selector}|systemid:${systemId}`;
  if (storageId) return `${selector}|storageid:${storageId}`;
  const fallback = normalizeText(String(record?.name || record?.description || record?.id || ''));
  return `${selector}|fallback:${fallback.slice(0, 140) || crypto.randomUUID()}`;
}

function parseEndpoint(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error(`Invalid endpoint URL: ${url}`);
  }
}

function validateIntelxEndpoints(): { ok: true } | { ok: false; code: string; message: string } {
  const searchUrl = parseEndpoint(ESTESO_SEARCH_API_URL);
  const leaksUrl = parseEndpoint(ESTESO_LEAKS_API_URL);

  const searchHost = searchUrl.hostname.toLowerCase();
  const leaksHost = leaksUrl.hostname.toLowerCase();

  if (searchHost === '4.intelx.io' || leaksHost === '4.intelx.io') {
    return {
      ok: false,
      code: 'darkrisk_esteso_invalid_programmatic_endpoint',
      message: 'Endpoint 4.intelx.io non consentito per accesso programmatico.',
    };
  }

  if (searchHost !== '2.intelx.io') {
    return {
      ok: false,
      code: 'darkrisk_esteso_invalid_search_endpoint',
      message: `Search API endpoint non valido (${searchHost}). Richiesto: 2.intelx.io`,
    };
  }

  if (leaksHost !== '3.intelx.io') {
    return {
      ok: false,
      code: 'darkrisk_esteso_invalid_leaks_endpoint',
      message: `Leaks API endpoint non valido (${leaksHost}). Richiesto: 3.intelx.io`,
    };
  }

  return { ok: true };
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs = INTELX_HTTP_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1_000, timeoutMs));
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (err: any) {
    if (String(err?.name || '').toLowerCase() === 'aborterror') {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${String(input).slice(0, 160)}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  await wait(INTELX_REQUEST_INTERVAL_MS);
  return fn();
}

async function intelxSearchSubmit(term: string): Promise<string | null> {
  const payload = {
    term,
    buckets: [],
    lookuplevel: 0,
    maxresults: INTELX_MAX_RESULTS_PER_QUERY,
    timeout: Math.max(3, Math.ceil((INTELX_MAX_POLL_ROUNDS * INTELX_REQUEST_INTERVAL_MS) / 1000)),
    datefrom: '',
    dateto: '',
    sort: 2,
    media: 0,
    terminate: [],
  };

  return intelxFetchWithBackoff(async () => {
    const response = await withRateLimit(() =>
      fetchWithTimeout(`${ESTESO_SEARCH_API_URL}/intelligent/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'HICONSOLE-DARKRISK-ESTESO/1.0',
          'x-key': ESTESO_SEARCH_API_KEY,
        },
        body: JSON.stringify(payload),
      }),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`IntelX search submit failed (${response.status}): ${text.slice(0, 180)}`);
    }

    const data = (await response.json()) as IntelxSearchResponse;
    const status = Number(data?.status ?? Number.NaN);
    if (Number.isFinite(status)) {
      if (status === 1) return null; // invalid selector
      if (status === 2) {
        throw new Error('IntelX search submit rejected: max concurrent searches per API key');
      }
      if (status !== 0) {
        throw new Error(`IntelX search submit returned unexpected status ${status}`);
      }
    }

    const id = normalizeText(String(data?.id || ''));
    if (!id) return null;
    if (!isUuidLike(id)) {
      throw new Error(`IntelX search submit returned invalid search id: ${id.slice(0, 80)}`);
    }
    return id;
  });
}

async function intelxSearchResult(searchId: string, endpoint: 'intelligent/search/result' | 'phonebook/search/result'):
  Promise<IntelxSearchResponse> {
  const url = new URL(`${ESTESO_SEARCH_API_URL}/${endpoint}`);
  url.searchParams.set('id', searchId);
  url.searchParams.set('limit', String(INTELX_MAX_RESULTS_PER_QUERY));

  return intelxFetchWithBackoff(async () => {
    const response = await withRateLimit(() =>
      fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'HICONSOLE-DARKRISK-ESTESO/1.0',
          'x-key': ESTESO_SEARCH_API_KEY,
        },
      }),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`IntelX result failed (${response.status}): ${text.slice(0, 180)}`);
    }
    return (await response.json()) as IntelxSearchResponse;
  });
}

async function intelxSearchTerminate(searchId: string): Promise<void> {
  const url = new URL(`${ESTESO_SEARCH_API_URL}/intelligent/search/terminate`);
  url.searchParams.set('id', searchId);
  await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': 'HICONSOLE-DARKRISK-ESTESO/1.0',
      'x-key': ESTESO_SEARCH_API_KEY,
    },
  }, 8_000).catch(() => undefined);
}

async function runIntelxSearch(term: string): Promise<Array<Record<string, unknown>>> {
  const searchId = await intelxSearchSubmit(term);
  if (!searchId) return [];

  const out: Array<Record<string, unknown>> = [];
  const dedupe = new Set<string>();

  try {
    for (let i = 0; i < INTELX_MAX_POLL_ROUNDS; i += 1) {
      const res = await intelxSearchResult(searchId, 'intelligent/search/result');
      const status = Number(res?.status ?? 3);
      const records = Array.isArray(res?.records) ? res.records : [];

      for (const record of records) {
        const key = normalizeIntelxRecordKey(term, record);
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        out.push(record);
      }

      if (status === 1 || status === 2) break;
      if (status === 0 && records.length === 0) break;
    }
  } finally {
    await intelxSearchTerminate(searchId);
  }

  return out.slice(0, INTELX_MAX_RESULTS_PER_QUERY);
}

async function intelxPhonebookSubmit(term: string): Promise<string | null> {
  const timeoutSec = Math.max(3, Math.ceil((INTELX_MAX_POLL_ROUNDS * INTELX_REQUEST_INTERVAL_MS) / 1000));
  const url = new URL(`${ESTESO_SEARCH_API_URL}/phonebook/search`);
  url.searchParams.set('term', term);
  url.searchParams.set('target', String(INTELX_PHONEBOOK_TARGET));
  url.searchParams.set('maxresults', String(INTELX_MAX_RESULTS_PER_QUERY));
  url.searchParams.set('timeout', String(timeoutSec));
  url.searchParams.set('media', '0');

  return intelxFetchWithBackoff(async () => {
    const response = await withRateLimit(() =>
      fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'HICONSOLE-DARKRISK-ESTESO/1.0',
          'x-key': ESTESO_SEARCH_API_KEY,
        },
      }),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`IntelX phonebook submit failed (${response.status}): ${text.slice(0, 180)}`);
    }

    const data = (await response.json()) as IntelxSearchResponse;
    const status = Number(data?.status ?? Number.NaN);
    if (Number.isFinite(status)) {
      if (status === 1) return null; // invalid selector
      if (status === 2) {
        throw new Error('IntelX phonebook submit rejected: max concurrent searches per API key');
      }
      if (status !== 0) {
        throw new Error(`IntelX phonebook submit returned unexpected status ${status}`);
      }
    }

    const id = normalizeText(String(data?.id || ''));
    if (!id) return null;
    if (!isUuidLike(id)) {
      throw new Error(`IntelX phonebook submit returned invalid search id: ${id.slice(0, 80)}`);
    }
    return id;
  });
}

async function runIntelxPhonebook(term: string): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const dedupe = new Set<string>();
  let retriedAfterInvalidId = false;

  while (true) {
    const searchId = await intelxPhonebookSubmit(term);
    if (!searchId) return out.slice(0, INTELX_MAX_RESULTS_PER_QUERY);

    try {
      for (let i = 0; i < INTELX_MAX_POLL_ROUNDS; i += 1) {
        const res = await intelxSearchResult(searchId, 'phonebook/search/result');
        const status = Number(res?.status ?? 3);
        const records = Array.isArray(res?.records) ? res.records : [];

        for (const record of records) {
          const key = normalizeIntelxRecordKey(term, record);
          if (dedupe.has(key)) continue;
          dedupe.add(key);
          out.push(record);
        }

        if (status === 1 || status === 2) break;
        if (status === 0 && records.length === 0) break;
      }
      return out.slice(0, INTELX_MAX_RESULTS_PER_QUERY);
    } catch (err) {
      if (!retriedAfterInvalidId && isInvalidSearchIdLike(err)) {
        retriedAfterInvalidId = true;
        continue;
      }
      throw err;
    } finally {
      await intelxSearchTerminate(searchId);
    }
  }
}

async function leaksSubmit(selector: string): Promise<string | null> {
  const url = new URL(`${ESTESO_LEAKS_API_URL}/live/search/internal`);
  url.searchParams.set('selector', selector);
  url.searchParams.set('limit', String(Math.min(INTELX_MAX_RESULTS_PER_QUERY, 120)));
  url.searchParams.set('bucket', '');
  url.searchParams.set('skipinvalid', 'true');
  url.searchParams.set('analyze', 'false');

  const response = await withRateLimit(() =>
    fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'HICONSOLE-DARKRISK-ESTESO/1.0',
        'x-key': ESTESO_LEAKS_API_KEY,
      },
    }),
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IntelX leaks submit failed (${response.status}): ${text.slice(0, 180)}`);
  }

  const data = (await response.json()) as IntelxSearchResponse;
  if (Number(data?.status ?? 0) === 2) return null;
  return normalizeText(String(data?.id || '')) || null;
}

async function leaksResult(searchId: string): Promise<IntelxSearchResponse> {
  const url = new URL(`${ESTESO_LEAKS_API_URL}/live/search/result`);
  url.searchParams.set('id', searchId);
  url.searchParams.set('format', '1');
  url.searchParams.set('limit', String(Math.min(INTELX_MAX_RESULTS_PER_QUERY, 120)));

  return intelxFetchWithBackoff(async () => {
    const response = await withRateLimit(() =>
      fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'HICONSOLE-DARKRISK-ESTESO/1.0',
          'x-key': ESTESO_LEAKS_API_KEY,
        },
      }),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`IntelX leaks result failed (${response.status}): ${text.slice(0, 180)}`);
    }

    return (await response.json()) as IntelxSearchResponse;
  });
}

async function leaksTerminate(searchId: string): Promise<void> {
  const url = new URL(`${ESTESO_LEAKS_API_URL}/live/search/terminate`);
  url.searchParams.set('id', searchId);

  await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': 'HICONSOLE-DARKRISK-ESTESO/1.0',
      'x-key': ESTESO_LEAKS_API_KEY,
    },
  }, 8_000).catch(() => undefined);
}

async function runLeaksSearch(selector: string): Promise<Array<Record<string, unknown>>> {
  const searchId = await leaksSubmit(selector);
  if (!searchId) return [];

  const out: Array<Record<string, unknown>> = [];
  const dedupe = new Set<string>();

  try {
    for (let i = 0; i < INTELX_MAX_POLL_ROUNDS; i += 1) {
      const res = await leaksResult(searchId);
      const status = Number(res?.status ?? 3);
      const records = Array.isArray(res?.records) ? res.records : [];

      for (const record of records) {
        const key = normalizeIntelxRecordKey(selector, record);
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        out.push(record);
      }

      if (status === 1 || status === 2) break;
      if (status === 4) throw new Error(`IntelX leaks API returned status 4 for selector ${selector}`);
      if (status === 0 && records.length === 0) break;
    }
  } finally {
    await leaksTerminate(searchId);
  }

  return out.slice(0, Math.min(INTELX_MAX_RESULTS_PER_QUERY, 120));
}

async function upsertDarkRiskFinding(adminClient: any, payload: Record<string, unknown>): Promise<{ id: string }> {
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

async function createSourceRun(
  adminClient: any,
  payload: Record<string, unknown>,
): Promise<{ id: string; started_at: string } | null> {
  const { data, error } = await adminClient
    .from('darkrisk_dti_source_runs' as any)
    .insert(payload)
    .select('id, started_at')
    .single();
  if (error || !data?.id) return null;
  return {
    id: String(data.id),
    started_at: String(data.started_at || new Date().toISOString()),
  };
}

async function finalizeSourceRun(
  adminClient: any,
  sourceRunId: string,
  sourceRunStartedAt: string | null,
  status: 'completed' | 'partial' | 'failed' | 'skipped',
  resultCount: number,
  warning: string | null,
  errorMessage: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  const completedAt = new Date().toISOString();
  const startedAtMs = Number.isFinite(Date.parse(String(sourceRunStartedAt || '')))
    ? Date.parse(String(sourceRunStartedAt))
    : Date.now();

  await adminClient
    .from('darkrisk_dti_source_runs' as any)
    .update({
      status,
      result_count: Math.max(0, Number(resultCount || 0)),
      warning: warning ? maskPotentialSecrets(warning).slice(0, 400) : null,
      error_message: errorMessage ? maskPotentialSecrets(errorMessage).slice(0, 700) : null,
      completed_at: completedAt,
      duration_ms: Math.max(0, Date.now() - startedAtMs),
      metadata,
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
    source: 'intelx';
    sourceLabel: string;
    queryKind: string | null;
    queryTerm: string | null;
    assetScope: string | null;
    selectorValue: string | null;
    extractionSource: string;
    hits: ReturnType<typeof extractSensitiveValueHits>;
    warnings: string[];
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
      extraction_source: params.extractionSource,
      context_excerpt: maskPotentialSecrets(hit.context).slice(0, 500),
      confidence: hit.tag === 'credit_cards' || hit.tag === 'passwords' ? 'high' : 'medium',
      metadata: {
        raw_value_len: String(hit.value || '').length,
      },
    }))
    .slice(0, 350);

  if (rows.length === 0) return 0;
  const { error } = await adminClient.from('darkrisk_dti_sensitive_hits' as any).insert(rows as any);
  if (error) {
    params.warnings.push(`sensitive_hits_insert_failed: ${maskPotentialSecrets(String(error.message || 'unknown')).slice(0, 120)}`);
    return 0;
  }
  return rows.length;
}

function buildAtDomainTerms(scopeDomains: string[]): string[] {
  const normalizedDomains = Array.from(
    new Set(
      scopeDomains
        .map((entry) => {
          const n = normalizeScopeDomain(entry);
          // Stripping www. per generare @apex (es. www.cereriaterenzi.it → @cereriaterenzi.it)
          return n.startsWith('www.') ? n.slice(4) : n;
        })
        .filter((entry) => Boolean(entry && isDomainLike(entry))),
    ),
  );
  return normalizedDomains.map((domain) => `@${domain}`);
}

function buildQueryTerms(selectors: SelectorDef[], scopeDomains: string[]): QueryTerm[] {
  const out: QueryTerm[] = [];
  const seen = new Set<string>();

  // Bare domain terms: www.cereriaterenzi.it → [www.cereriaterenzi.it, cereriaterenzi.it]
  for (const rawDomain of scopeDomains) {
    const cleaned = normalizeScopeDomain(rawDomain);
    if (!cleaned || !isDomainLike(cleaned)) continue;
    for (const term of Array.from(new Set([cleaned, cleaned.startsWith('www.') ? cleaned.slice(4) : null].filter(Boolean) as string[]))) {
      const key = `selector:${term}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ term, kind: 'selector', selectorNormalized: term, assetScope: term.startsWith('www.') ? term.slice(4) : term });
    }
  }

  for (const atDomain of buildAtDomainTerms(scopeDomains)) {
    const clean = normalizeText(atDomain).toLowerCase();
    if (!clean) continue;
    const key = `at_domain_tld:${clean}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      term: clean,
      kind: 'at_domain_tld',
      selectorNormalized: null,
      assetScope: clean.slice(1),
    });
  }

  for (const selector of selectors) {
    if (selector.type === 'domain' || selector.type === 'wildcard_domain') continue;
    const clean = normalizeText(selector.normalized).toLowerCase();
    if (!clean) continue;
    const kind: QueryTerm['kind'] = selector.type === 'email' ? 'email_selector' : 'selector';
    const key = `${kind}:${clean}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      term: clean,
      kind,
      selectorNormalized: clean,
      assetScope: clean.includes('@') ? clean.split('@')[1] || clean : clean.replace(/^@/, ''),
    });

    if (out.length >= INTELX_MAX_QUERY_TERMS_PER_RUN) break;
  }

  return out.slice(0, INTELX_MAX_QUERY_TERMS_PER_RUN);
}

function ensureIdentityTerms(terms: QueryTerm[], emails: string[]): QueryTerm[] {
  const out = [...terms];
  const seen = new Set(out.map((entry) => `${entry.kind}:${normalizeText(entry.term).toLowerCase()}`));

  for (const email of emails) {
    const clean = normalizeText(email).toLowerCase();
    if (!clean) continue;
    const key = `email_selector:${clean}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      term: clean,
      kind: 'email_selector',
      selectorNormalized: clean,
      assetScope: clean.split('@')[1] || clean,
    });
  }

  return out.slice(0, INTELX_MAX_QUERY_TERMS_PER_RUN);
}

function prioritySelectorScore(selector: SelectorDef): number {
  if (selector.type === 'email' && selector.source === 'manual') return 0;
  if (selector.type === 'email' && selector.source === 'existing') return 1;
  if (selector.type === 'email' && selector.source === 'scope') return 2;
  if (selector.source === 'manual') return 3;
  if (selector.source === 'existing') return 4;
  return 5;
}

function domainFromQueryTerm(queryTerm: string): string {
  const normalized = normalizeText(queryTerm).toLowerCase();
  if (!normalized) return '';
  if (normalized.startsWith('@')) return normalized.slice(1);
  if (normalized.includes('@')) return normalized.split('@')[1] || normalized;
  return normalized.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function recordTitle(record: Record<string, unknown>, fallback: string): string {
  return normalizeText(String(record?.name || record?.title || record?.description || fallback)).slice(0, 220);
}

function recordDescription(record: Record<string, unknown>, queryTerm: string, sourceKind: string): string {
  const base = normalizeText(String(record?.description || record?.name || `Signal ${sourceKind} su ${queryTerm}`));
  return base.slice(0, 1600);
}

function observedAtFromRecord(record: Record<string, unknown>): string {
  const raw = normalizeText(String(record?.date || record?.added || record?.created_at || ''));
  if (!raw) return new Date().toISOString();
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function isAuthzLikeError(message: string | null | undefined): boolean {
  const text = String(message || '').toLowerCase();
  return text.includes('401') || text.includes('403') || text.includes('unauthorized') || text.includes('forbidden');
}

async function upsertAssetsAndSelectors(
  adminClient: any,
  customerId: string,
  sourceScanJobId: string | null,
  scopeDomains: string[],
  scopeIps: string[],
  manualIdentityEmails: string[],
): Promise<{
  selectorDefs: SelectorDef[];
  selectorByNormalized: Map<string, string>;
  assetByNormalized: Map<string, { id: string; asset_type: string }>;
}> {
  const nowIso = new Date().toISOString();

  const scopeAssetRows: Array<Record<string, unknown>> = [
    ...scopeDomains.map((domain) => ({
      organization_id: customerId,
      tenant_id: customerId,
      asset_type: 'domain',
      value: domain,
      normalized_value: normalizeAssetValue(domain),
      source: 'manual',
      scope_status: 'approved',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      metadata: {
        discovered_by: 'darkrisk-esteso-sync',
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
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      metadata: {
        discovered_by: 'darkrisk-esteso-sync',
        source_scope_rule: 'single',
        source_scan_job_id: sourceScanJobId,
      },
    })),
  ];

  if (scopeAssetRows.length > 0) {
    const { error } = await adminClient
      .from('darkrisk_assets' as any)
      .upsert(scopeAssetRows as any, {
        onConflict: 'organization_id,asset_type,normalized_value',
        ignoreDuplicates: false,
      });
    if (error) throw error;
  }

  const assetValues = Array.from(
    new Set(scopeAssetRows.map((row) => String(row.normalized_value || '')).filter(Boolean)),
  );

  const assetByNormalized = new Map<string, { id: string; asset_type: string }>();
  if (assetValues.length > 0) {
    const { data, error } = await adminClient
      .from('darkrisk_assets' as any)
      .select('id, asset_type, normalized_value')
      .eq('organization_id', customerId)
      .in('normalized_value', assetValues);
    if (error) throw error;

    for (const row of (data || []) as Array<{ id: string; asset_type: string; normalized_value: string }>) {
      assetByNormalized.set(String(row.normalized_value), {
        id: String(row.id),
        asset_type: String(row.asset_type || 'unknown'),
      });
    }
  }

  if (manualIdentityEmails.length > 0) {
    const rows = manualIdentityEmails.map((email) => ({
      organization_id: customerId,
      tenant_id: customerId,
      selector_type: 'email',
      value: email,
      normalized_value: email,
      source: 'manual',
      status: 'approved',
      metadata: {
        discovered_by: 'darkrisk-esteso-sync',
        input_mode: 'manual_identity_esteso',
      },
    }));

    const { error } = await adminClient
      .from('darkrisk_selectors' as any)
      .upsert(rows as any, {
        onConflict: 'organization_id,selector_type,normalized_value',
        ignoreDuplicates: false,
      });
    if (error) throw error;
  }

  const selectorDefsByNormalized = new Map<string, SelectorDef>();

  for (const domain of scopeDomains) {
    const validation = validateDarkRiskSelector(domain);
    if (validation.valid && validation.type && validation.normalized) {
      selectorDefsByNormalized.set(validation.normalized, {
        type: validation.type,
        normalized: validation.normalized,
        source: 'scope',
      });
    }
  }

  for (const email of manualIdentityEmails) {
    selectorDefsByNormalized.set(email, {
      type: 'email',
      normalized: email,
      source: 'manual',
    });
  }

  const allowedTypes = ['email', 'domain', 'wildcard_domain', 'url', 'ipv4', 'ipv6', 'cidrv4', 'cidrv6'];
  const { data: existingSelectors, error: selectorErr } = await adminClient
    .from('darkrisk_selectors' as any)
    .select('selector_type, normalized_value, value, status')
    .eq('organization_id', customerId)
    .in('selector_type', allowedTypes)
    .in('status', ['approved', 'candidate'])
    .limit(1000);
  if (selectorErr) throw selectorErr;

  for (const row of (existingSelectors || []) as Array<Record<string, unknown>>) {
    const type = normalizeText(String(row.selector_type || '')) as DarkRiskSelectorType;
    const normalized = normalizeText(String(row.normalized_value || '')).toLowerCase();
    if (!normalized || !type) continue;
    if (!selectorDefsByNormalized.has(normalized)) {
      selectorDefsByNormalized.set(normalized, {
        type,
        normalized,
        source: 'existing',
      });
    }
  }

  const selectorDefs = Array.from(selectorDefsByNormalized.values())
    .sort((a, b) => prioritySelectorScore(a) - prioritySelectorScore(b))
    .slice(0, INTELX_MAX_SELECTORS_PER_RUN);

  if (selectorDefs.length > 0) {
    const selectorRows = selectorDefs.map((selector) => ({
      organization_id: customerId,
      tenant_id: customerId,
      selector_type: selector.type,
      value: selector.normalized,
      normalized_value: selector.normalized,
      source: selector.source === 'manual' ? 'manual' : 'surfacescan360',
      status: 'approved',
      metadata: {
        discovered_by: 'darkrisk-esteso-sync',
        selector_source: selector.source,
      },
    }));

    const { error } = await adminClient
      .from('darkrisk_selectors' as any)
      .upsert(selectorRows as any, {
        onConflict: 'organization_id,selector_type,normalized_value',
        ignoreDuplicates: false,
      });
    if (error) throw error;
  }

  const selectorValues = selectorDefs.map((selector) => selector.normalized);
  const selectorByNormalized = new Map<string, string>();

  if (selectorValues.length > 0) {
    const { data, error } = await adminClient
      .from('darkrisk_selectors' as any)
      .select('id, normalized_value')
      .eq('organization_id', customerId)
      .in('normalized_value', selectorValues);
    if (error) throw error;

    for (const row of (data || []) as Array<{ id: string; normalized_value: string }>) {
      selectorByNormalized.set(String(row.normalized_value || ''), String(row.id));
    }
  }

  return { selectorDefs, selectorByNormalized, assetByNormalized };
}

async function maybeAutoQueueSurfaceScope(
  params: {
    includeSurfaceSync: boolean;
    orgFlags: Record<string, unknown>;
    scopeDomains: string[];
    scopeIps: string[];
    customerId: string;
    actorUserId: string;
  },
): Promise<{ queuedClassic: number; failedClassic: number; warnings: string[] }> {
  const warnings: string[] = [];
  if (!params.includeSurfaceSync) {
    return { queuedClassic: 0, failedClassic: 0, warnings };
  }

  const surfaceGate = evaluateOrganizationServiceGate(params.orgFlags as any, 'surface_scan360');
  if (!surfaceGate.allowed) {
    warnings.push(`Auto-scope SurfaceScan saltato: ${surfaceGate.reason}`);
    return { queuedClassic: 0, failedClassic: 0, warnings };
  }

  if (!SUPABASE_URL || !INTERNAL_FUNCTIONS_API_KEY) {
    warnings.push('Auto-scope SurfaceScan non disponibile: chiavi interne non configurate.');
    return { queuedClassic: 0, failedClassic: 0, warnings };
  }

  const targets = [
    ...params.scopeDomains.map((domain) => ({ target: domain, profile: 'domain_exposure' })),
    ...params.scopeIps.map((ip) => ({ target: ip, profile: 'ip_exposure' })),
  ].slice(0, 120);

  if (targets.length === 0) {
    return { queuedClassic: 0, failedClassic: 0, warnings };
  }

  let queuedClassic = 0;
  let failedClassic = 0;

  for (const item of targets) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), SURFACE_AUTOSTART_TIMEOUT_MS);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/surfacescan360-start-scan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${INTERNAL_FUNCTIONS_API_KEY}`,
          apikey: INTERNAL_FUNCTIONS_API_KEY,
          'Content-Type': 'application/json',
          // Header DarkRisk360 — bypassa il gate contratto SurfaceScan360
          ...(DARKRISK_INTERNAL_SECRET ? { 'x-darkrisk360-internal-secret': DARKRISK_INTERNAL_SECRET } : {}),
          ...(SURFACESCAN_INTERNAL_SECRET ? { 'x-surface-internal-secret': SURFACESCAN_INTERNAL_SECRET } : {}),
        },
        body: JSON.stringify({
          target: item.target,
          customer_id: params.customerId,
          scan_profile: item.profile,
          authorization_confirmed: true,
          ownership_proof: 'darkrisk360_coverage',
          force_refresh: true,
          requested_by: params.actorUserId,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      let payload: Record<string, unknown> = {};
      try { payload = await response.json(); } catch { /* body non-JSON, ignora */ }
      if (response.ok && !payload?.error) {
        queuedClassic += 1;
      } else {
        console.warn(
          `[maybeAutoQueueSurfaceScope] target=${item.target} HTTP=${response.status} error=${
            String(payload?.error || payload?.code || 'unknown').slice(0, 200)
          }`,
        );
        failedClassic += 1;
      }
    } catch (err) {
      clearTimeout(timeout);
      console.warn(`[maybeAutoQueueSurfaceScope] target=${item.target} exception=${String(err).slice(0, 200)}`);
      failedClassic += 1;
    }
  }

  if (failedClassic > 0) {
    warnings.push(`Auto-scope SurfaceScan: ${failedClassic} target non avviati.`);
  }

  return { queuedClassic, failedClassic, warnings };
}

function maskedError(err: unknown, fallback = 'Unknown error'): string {
  const msg = err instanceof Error ? err.message : String(err || fallback);
  return maskPotentialSecrets(normalizeText(msg) || fallback);
}

async function writeAudit(
  adminClient: any,
  customerId: string,
  actorId: string,
  action: string,
  entityId: string | null,
  reason: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await adminClient
    .from('darkrisk_audit_log' as any)
    .insert({
      organization_id: customerId,
      tenant_id: customerId,
      actor_id: actorId,
      action,
      entity_type: 'darkrisk_esteso_run',
      entity_id: entityId,
      reason,
      metadata,
    });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  let scanRunId: string | null = null;
  let lockAcquired = false;
  let lockOrganizationId = '';
  let lockAdminClient: any = null;

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    lockAdminClient = adminClient;

    // Parse body first so we can use it in both cron and user paths
    const body = await req.json().catch(() => ({}));

    // ── Auth: cron secret, service role bearer, o user session ──
    const cronSecretHeader = req.headers.get('x-darkrisk-esteso-cron-secret');
    const authorizationHeader = req.headers.get('Authorization') || '';
    const bearerToken = authorizationHeader.replace(/^Bearer\s+/i, '').trim();

    const isCronMode = Boolean(
      cronSecretHeader
      && DARKRISK_INTERNAL_SECRET
      && cronSecretHeader === DARKRISK_INTERNAL_SECRET,
    );

    let actorUserId: string;

    if (isCronMode) {
      actorUserId = 'system:darkrisk-esteso-cron';
    } else {
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      actorUserId = authData.user.id;

      const caller = await getCallerProfile(adminClient, actorUserId);
      if (!caller.canManageAllOrganizations) {
        return jsonResponse({ ok: false, error: 'Only super admin can use DARKRISK_ESTESO.' }, 403);
      }
      assertCustomerAccess(caller, normalizeText(String(body?.customer_id || caller.organizationId || '')));
    }
    // ── End auth ─────────────────────────────────────────────────────────────────

    const requestedCustomerId = normalizeText(String(body?.customer_id || ''));
    if (!requestedCustomerId) {
      return jsonResponse({ ok: false, error: 'customer_id is required' }, 400);
    }

    // In cron mode: permetti al body di specificare 'manual' per chiamate interne privilegiate
    const triggerType = isCronMode
      ? (normalizeText(String(body?.trigger_type || '')) === 'manual' ? 'manual' : 'cron')
      : normalizeText(String(body?.trigger_type || 'manual'));

    if (!isCronMode && triggerType !== 'manual') {
      return jsonResponse({
        ok: false,
        code: 'darkrisk_esteso_manual_only',
        error: 'DARKRISK_ESTESO MVP supporta solo trigger manuale.',
      }, 400);
    }

    const includeSurfaceSync = body?.include_surface_sync !== false;
    const manualIdentityEmails = parseIdentityEmailSelectors(body?.identity_emails);

    const endpointValidation = validateIntelxEndpoints();
    if (!endpointValidation.ok) {
      await writeAudit(
        adminClient,
        requestedCustomerId,
        actorUserId,
        'darkrisk_esteso_blocked_invalid_endpoint',
        null,
        endpointValidation.code,
        {
          search_api_url: ESTESO_SEARCH_API_URL,
          leaks_api_url: ESTESO_LEAKS_API_URL,
          message: endpointValidation.message,
        },
      );
      return jsonResponse({
        ok: false,
        code: endpointValidation.code,
        error: endpointValidation.message,
      }, 400);
    }

    if (!ESTESO_SEARCH_API_KEY || !ESTESO_LEAKS_API_KEY) {
      return jsonResponse({
        ok: false,
        code: 'darkrisk_esteso_missing_api_key',
        error: 'INTELX API key non configurata per DARKRISK_ESTESO.',
      }, 503);
    }

    const [orgRes, profileRes, entitlementRes, scopeRes] = await Promise.all([
      adminClient
        .from('organizations' as any)
        .select('id, darkrisk_esteso_enabled, surface_scan360_enabled, dark_risk360_enabled, services_paused, services_paused_at, services_pause_reason, surface_scan_contract_start, surface_scan_contract_years, dark_risk_contract_start, dark_risk_contract_years')
        .eq('id', requestedCustomerId)
        .maybeSingle(),
      adminClient
        .from('darkrisk_esteso_profiles' as any)
        .select('organization_id, enabled, manual_only, identity_model_valid_until')
        .eq('organization_id', requestedCustomerId)
        .maybeSingle(),
      adminClient
        .from('darkrisk_entitlements' as any)
        .select('id, enabled, tier')
        .eq('organization_id', requestedCustomerId)
        .maybeSingle(),
      adminClient
        .from('surface_scan_monitored_ips' as any)
        .select('entry_type, input_value, ip_start, ip_end')
        .eq('organization_id', requestedCustomerId),
    ]);

    if (orgRes.error) throw orgRes.error;
    if (profileRes.error && String(profileRes.error.code || '') !== '42P01') throw profileRes.error;
    if (entitlementRes.error && String(entitlementRes.error.code || '') !== '42P01') throw entitlementRes.error;
    if (scopeRes.error) throw scopeRes.error;

    const orgFlags = (orgRes.data || {}) as Record<string, unknown>;
    const darkRiskEnabled = Boolean(entitlementRes.data?.enabled ?? orgFlags?.dark_risk360_enabled);
    // Tier gate: 'extended' abilita Leaks API e Phonebook IntelX
    const isExtendedTier = String(entitlementRes.data?.tier ?? 'standard') === 'extended';
    if (!darkRiskEnabled) {
      return jsonResponse({
        ok: false,
        code: 'darkrisk_not_enabled',
        error: 'DarkRisk360 non abilitato sul cliente.',
      }, 403);
    }

    const estesoFlag = Boolean(orgFlags?.darkrisk_esteso_enabled);
    const profile = (profileRes.data || null) as null | {
      enabled?: boolean;
      manual_only?: boolean;
      identity_model_valid_until?: string | null;
    };

    const estesoEnabled = Boolean(profile?.enabled ?? estesoFlag);
    if (!estesoEnabled) {
      return jsonResponse({
        ok: false,
        code: 'darkrisk_esteso_not_enabled',
        error: 'DARKRISK_ESTESO non abilitato per questo cliente.',
      }, 403);
    }

    const manualOnly = profile?.manual_only !== false;
    if (manualOnly && triggerType !== 'manual') {
      return jsonResponse({
        ok: false,
        code: 'darkrisk_esteso_manual_only',
        error: 'Profilo DARKRISK_ESTESO impostato in modalità manual_only.',
      }, 400);
    }

    const validUntil = normalizeText(String(profile?.identity_model_valid_until || ESTESO_IDENTITY_VALID_UNTIL)).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (validUntil && today > validUntil) {
      await writeAudit(
        adminClient,
        requestedCustomerId,
        actorUserId,
        'darkrisk_esteso_blocked_expiry',
        null,
        'identity_model_expired',
        {
          today,
          valid_until: validUntil,
        },
      );

      return jsonResponse({
        ok: false,
        code: 'darkrisk_esteso_identity_model_expired',
        error: `Modello identity DARKRISK_ESTESO scaduto il ${validUntil}.`,
      }, 403);
    }

    lockOrganizationId = requestedCustomerId;
    const lockInsert = await adminClient
      .from('darkrisk_scan_locks' as any)
      .insert({ organization_id: requestedCustomerId, locked_at: new Date().toISOString() });

    if (lockInsert.error) {
      const alreadyRunning = String(lockInsert.error.code || '') === '23505';
      if (alreadyRunning) {
        return jsonResponse({
          ok: true,
          status: 'running',
          code: 'darkrisk_esteso_run_already_running',
          message: 'Scan DARKRISK_ESTESO già in esecuzione per questo cliente.',
        }, 200);
      }
      throw lockInsert.error;
    }
    lockAcquired = true;

    const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules((scopeRes.data || []) as any[]);
    const scopeIps = Array.from(
      new Set(
        ((scopeRes.data || []) as Array<Record<string, unknown>>)
          .filter((row) => String(row.entry_type || '').toLowerCase() === 'single')
          .map((row) => normalizeText(String(row.input_value || '')))
          .filter(Boolean),
      ),
    );

    let normalizedScopeDomains = Array.from(new Set(scopeDomains.map((entry) => normalizeScopeDomain(entry)).filter(isDomainLike)));
    let effectiveScopeIps = [...scopeIps];

    // Fallback manuale: se no SurfaceScan360 attivo e nessun dato scope, usa darkrisk360_manual_targets
    const hasSurfaceScopeData = (scopeRes.data?.length ?? 0) > 0;
    const isSurfaceScanEnabled = Boolean(orgFlags?.surface_scan360_enabled);
    if (!hasSurfaceScopeData && !isSurfaceScanEnabled) {
      const manualRes = await adminClient
        .from('darkrisk360_manual_targets' as any)
        .select('target_type, value, normalized_value')
        .eq('organization_id', requestedCustomerId)
        .eq('enabled', true);
      if (!manualRes.error && manualRes.data?.length) {
        const manualData = manualRes.data as Array<{ target_type: string; value: string; normalized_value: string }>;
        normalizedScopeDomains = Array.from(new Set(
          manualData
            .filter((r) => r.target_type === 'domain')
            .map((r) => normalizeScopeDomain(r.normalized_value || r.value))
            .filter(isDomainLike),
        ));
        effectiveScopeIps = Array.from(new Set(
          manualData
            .filter((r) => r.target_type === 'ip' || r.target_type === 'cidr')
            .map((r) => normalizeText(r.normalized_value || r.value))
            .filter(Boolean),
        ));
      }
    }

    const surfaceSyncRes = await maybeAutoQueueSurfaceScope({
      includeSurfaceSync,
      orgFlags,
      scopeDomains: normalizedScopeDomains,
      scopeIps: effectiveScopeIps,
      customerId: requestedCustomerId,
      actorUserId,
    });

    const latestCompletedJobsRes = await adminClient
      .from('surface_scan_jobs' as any)
      .select('id, status, created_at, normalized_target, raw_target, hostname, target_type')
      .eq('organization_id', requestedCustomerId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(300);
    if (latestCompletedJobsRes.error) throw latestCompletedJobsRes.error;

    const latestByScopeTarget = new Map<string, any>();
    for (const row of (latestCompletedJobsRes.data || []) as Array<Record<string, any>>) {
      const candidateTarget = normalizeText(String(row.normalized_target || row.raw_target || row.hostname || ''));
      if (!candidateTarget) continue;
      try {
        const normalizedTarget = normalizeTargetInput(candidateTarget);
        const scopeDecision = classifyTargetScope(normalizedTarget, normalizedScopeDomains, ipScopeRules as any);
        if (!scopeDecision.allowed) continue;
        const targetKey = `${normalizedTarget.target_type}|${normalizedTarget.normalized_target}`;
        if (!latestByScopeTarget.has(targetKey)) latestByScopeTarget.set(targetKey, row);
      } catch {
        continue;
      }
    }

    const scopeJobs = Array.from(latestByScopeTarget.values()).sort(
      (a, b) => Date.parse(String(b.created_at || 0)) - Date.parse(String(a.created_at || 0)),
    );
    const scopeJobIds = scopeJobs.map((row) => String(row.id || '')).filter(Boolean);
    const sourceScanJobId = scopeJobIds[0] || null;

    // requested_by è UUID nel DB — passa null per chiamate di sistema (cron/service)
    const requestedByUuid = (() => {
      if (!actorUserId) return null;
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return UUID_RE.test(actorUserId) ? actorUserId : null;
    })();

    const scanRunInsert = await adminClient
      .from('darkrisk_scan_runs' as any)
      .insert({
        organization_id: requestedCustomerId,
        tenant_id: requestedCustomerId,
        tier: 'extended',
        status: 'running',
        trigger_type: 'darkrisk_esteso_manual',
        requested_by: requestedByUuid,
        surface_scan_job_id: sourceScanJobId,
        started_at: new Date().toISOString(),
        sources: ['surfacescan360', 'intelx'],
        stats: {},
      })
      .select('id')
      .single();

    if (scanRunInsert.error || !scanRunInsert.data?.id) throw scanRunInsert.error || new Error('Unable to create scan run');
    scanRunId = String(scanRunInsert.data.id);

    await writeAudit(
      adminClient,
      requestedCustomerId,
      actorUserId,
      'darkrisk_esteso_scan_started',
      scanRunId,
      triggerType,
      {
        include_surface_sync: includeSurfaceSync,
        identity_emails: manualIdentityEmails.length,
        scope_domains: normalizedScopeDomains.length,
        scope_ips: effectiveScopeIps.length,
        surface_auto_queue: {
          queued_classic: surfaceSyncRes.queuedClassic,
          failed_classic: surfaceSyncRes.failedClassic,
        },
      },
    );

    const upsertCtx = await upsertAssetsAndSelectors(
      adminClient,
      requestedCustomerId,
      sourceScanJobId,
      normalizedScopeDomains,
      effectiveScopeIps,
      manualIdentityEmails,
    );

    let queryTerms = buildQueryTerms(upsertCtx.selectorDefs, normalizedScopeDomains);
    queryTerms = ensureIdentityTerms(queryTerms, manualIdentityEmails);

    const warnings: string[] = [...surfaceSyncRes.warnings];

    let recordsCreated = 0;
    let evidenceCreated = 0;
    let findingsCreated = 0;
    let alertsCreated = 0;
    let sensitiveHitsCreated = 0;
    let searchesRun = 0;
    let phonebookRun = 0;
    let leaksRun = 0;
    let searchRecordsIngested = 0;
    let phonebookRecordsIngested = 0;
    let leaksRecordsIngested = 0;

    const perFindingRecurrence = new Map<string, number>();

    const ingestRecord = async (params: {
      sourceKind: 'search' | 'phonebook' | 'leaks';
      sourceRunId: string | null;
      query: QueryTerm;
      record: Record<string, unknown>;
    }) => {
      if (recordsCreated >= INTELX_MAX_RECORDS_PER_RUN) return;

      const queryTerm = params.query.term;
      const queryKind = params.query.kind;
      const sourceKind = params.sourceKind;

      const sourceRecordKey = `${sourceKind}:${normalizeIntelxRecordKey(queryTerm, params.record)}`;
      const selectorId = params.query.selectorNormalized
        ? upsertCtx.selectorByNormalized.get(params.query.selectorNormalized) || null
        : null;
      const assetScope = params.query.assetScope || domainFromQueryTerm(queryTerm);
      const assetRef = upsertCtx.assetByNormalized.get(normalizeAssetValue(assetScope));
      const assetId = assetRef?.id || null;

      const title = recordTitle(params.record, `DARKRISK_ESTESO ${sourceKind} signal`);
      const description = recordDescription(params.record, queryTerm, sourceKind);
      const observedAt = observedAtFromRecord(params.record);
      const xscoreRaw = Number(params.record?.xscore);
      const xscore = Number.isFinite(xscoreRaw) ? xscoreRaw : null;
      const extractionText = `${title}\n${description}\n${JSON.stringify(params.record || {})}`.slice(0, 12_000);
      const sensitiveHits = extractSensitiveValueHits(extractionText, 30);
      const indicators = detectSensitiveIndicators(extractionText);

      const baseSeverity = sourceKind === 'leaks'
        ? determineLeakSeverity(indicators)
        : severityFromScore(xscore);
      const confidence: 'low' | 'medium' | 'high' = sourceKind === 'leaks'
        ? (hasSensitiveIndicators(indicators) ? 'high' : 'medium')
        : inferConfidenceByScore(xscore);

      const findingType = sourceKind === 'leaks'
        ? leaksFindingTypeFromRecord(queryKind, queryTerm)
        : intelxFindingTypeFromRecord(params.record, queryTerm);

      const compromiseType = inferCompromiseType({
        findingType,
        title,
        module: sourceKind === 'leaks' ? 'intelx_leaks' : 'intelx_search',
      });

      const recurrenceKey = `${findingType}|${normalizeAssetValue(assetScope)}`;
      const recurrenceCount = (perFindingRecurrence.get(recurrenceKey) || 0) + 1;
      perFindingRecurrence.set(recurrenceKey, recurrenceCount);

      const riskDimensions = inferRiskDimensions({
        findingType,
        title,
        module: sourceKind === 'leaks' ? 'intelx_leaks' : 'intelx_search',
        confidence,
        freshnessDays: daysSince(observedAt),
      });

      if (hasSensitiveIndicators(indicators)) {
        riskDimensions.identity_exposure = Math.min(100, Number(riskDimensions.identity_exposure || 0) + 20);
      }

      const riskScore = calculateFindingRiskScore({
        severity: baseSeverity,
        confidence,
        freshnessDays: daysSince(observedAt),
        recurrenceCount,
        affectedAssetCriticality: inferAssetCriticality(assetScope),
        isDirectCompromise: compromiseType === 'direct',
        isThirdPartyOnly: compromiseType === 'indirect',
      });

      const sourceMedia = normalizeText(String(params.record?.mediah || params.record?.media || '')) || null;
      const sourceType = normalizeText(String(params.record?.typeh || params.record?.type || sourceKind)) || sourceKind;
      const systemId = normalizeText(String(params.record?.systemid || '')) || null;
      const storageId = normalizeText(String(params.record?.storageid || '')) || null;
      const bucket = normalizeText(String(params.record?.bucket || '')) || null;

      const sourceRecordRes = await adminClient
        .from('darkrisk_source_records' as any)
        .upsert({
          organization_id: requestedCustomerId,
          tenant_id: requestedCustomerId,
          scan_run_id: scanRunId,
          source: 'intelx',
          asset_id: assetId,
          selector_id: selectorId,
          source_record_key: sourceRecordKey,
          source_system_id: systemId,
          source_storage_id: storageId,
          source_bucket: bucket,
          source_media: sourceMedia,
          source_type: sourceType,
          source_score: xscore,
          source_date: observedAt,
          source_added_at: observedAt,
          query_kind: queryKind,
          query_term: queryTerm,
          asset_scope: assetScope,
          extraction_source: sourceKind,
          extraction_status: 'completed',
          title: maskPotentialSecrets(title),
          description: maskPotentialSecrets(description),
          raw_metadata: {
            source_kind: sourceKind,
            query_kind: queryKind,
            query_term: queryTerm,
            record: {
              systemid: systemId,
              storageid: storageId,
              bucket,
              xscore,
              date: params.record?.date || null,
              added: params.record?.added || null,
              mediah: sourceMedia,
              typeh: sourceType,
              status: params.record?.status || null,
            },
            sensitive_indicators: indicators,
          },
          safe_preview: maskPotentialSecrets(extractionText.slice(0, 1200)),
          preview_hash: sourceRecordKey,
        }, {
          onConflict: 'organization_id,source,source_record_key',
          ignoreDuplicates: false,
        })
        .select('id')
        .single();

      if (sourceRecordRes.error || !sourceRecordRes.data?.id) throw sourceRecordRes.error || new Error('source record insert failed');
      recordsCreated += 1;

      const evidenceRes = await adminClient
        .from('darkrisk_evidence' as any)
        .insert({
          organization_id: requestedCustomerId,
          tenant_id: requestedCustomerId,
          scan_run_id: scanRunId,
          source_record_id: sourceRecordRes.data.id,
          source: 'intelx',
          evidence_class: sourceKind === 'leaks' ? 'intelx_leaks_record' : 'intelx_search_record',
          asset_id: assetId,
          selector_id: selectorId,
          title: maskPotentialSecrets(title),
          summary: maskPotentialSecrets(description),
          masked_value: maskPotentialSecrets(queryTerm),
          severity_hint: baseSeverity,
          confidence,
          observed_at: observedAt,
          first_seen_at: observedAt,
          last_seen_at: new Date().toISOString(),
          visibility: 'customer',
          contains_sensitive_data: hasSensitiveIndicators(indicators),
          metadata: {
            source_kind: sourceKind,
            query_kind: queryKind,
            query_term: queryTerm,
            source_record_key: sourceRecordKey,
            sensitive_indicators: indicators,
          },
        })
        .select('id')
        .single();

      if (evidenceRes.error || !evidenceRes.data?.id) throw evidenceRes.error || new Error('evidence insert failed');
      evidenceCreated += 1;

      const findingRes = await upsertDarkRiskFinding(adminClient, {
        organization_id: requestedCustomerId,
        tenant_id: requestedCustomerId,
        scan_run_id: scanRunId,
        source_record_key: sourceRecordKey,
        finding_type: findingType,
        title: maskPotentialSecrets(title),
        description: maskPotentialSecrets(description),
        affected_asset_id: assetId,
        affected_selector_id: selectorId,
        severity: baseSeverity,
        confidence,
        status: 'new',
        risk_score: riskScore,
        risk_dimensions: riskDimensions,
        evidence_ids: [evidenceRes.data.id],
        first_seen_at: observedAt,
        last_seen_at: new Date().toISOString(),
        metadata: {
          source_origin: 'intelx',
          source_kind: sourceKind,
          query_term: queryTerm,
          query_kind: queryKind,
          compromise_type: compromiseType,
          recurrence_count: recurrenceCount,
          sensitive_indicators: indicators,
        },
      });
      findingsCreated += 1;

      const persistedHits = await persistSensitiveHits(adminClient, {
        organizationId: requestedCustomerId,
        scanRunId: scanRunId!,
        sourceRunId: params.sourceRunId,
        sourceRecordId: String(sourceRecordRes.data.id),
        evidenceId: String(evidenceRes.data.id),
        findingId: findingRes.id,
        source: 'intelx',
        sourceLabel: sourceKind === 'leaks' ? 'DARKRISK_ESTESO Leaks' : 'DARKRISK_ESTESO Search',
        queryKind,
        queryTerm,
        assetScope,
        selectorValue: params.query.selectorNormalized,
        extractionSource: sourceKind,
        hits: sensitiveHits,
        warnings,
      });
      sensitiveHitsCreated += persistedHits;

      if (baseSeverity === 'high' || baseSeverity === 'critical') {
        const { error: alertErr } = await adminClient
          .from('darkrisk_alerts' as any)
          .insert({
            organization_id: requestedCustomerId,
            tenant_id: requestedCustomerId,
            finding_id: findingRes.id,
            alert_type: sourceKind === 'leaks' ? 'intelx_identity_leak' : 'intelx_signal',
            title: maskPotentialSecrets(title),
            message: maskPotentialSecrets(description),
            severity: baseSeverity,
            status: 'open',
            occurred_at: observedAt,
            metadata: {
              source: 'intelx',
              source_kind: sourceKind,
              query_term: queryTerm,
              query_kind: queryKind,
            },
          });
        if (!alertErr) alertsCreated += 1;
      }
    };

    for (const query of queryTerms) {
      if (recordsCreated >= INTELX_MAX_RECORDS_PER_RUN) {
        pushWarningUnique(warnings, `Limite record per run raggiunto (${INTELX_MAX_RECORDS_PER_RUN}).`);
        break;
      }

      const sourceRun = await createSourceRun(adminClient, {
        organization_id: requestedCustomerId,
        tenant_id: requestedCustomerId,
        scan_run_id: scanRunId,
        source: 'intelx',
        source_key: `intelx:search:${query.kind}:${query.term}`,
        source_label: 'DARKRISK_ESTESO Search',
        source_kind: 'domain_threat_intelligence',
        query_kind: query.kind,
        query_term: query.term,
        asset_scope: query.assetScope,
        selector_value: query.selectorNormalized,
        status: 'running',
        metadata: { stage: 'search' },
      });

      let recordsCount = 0;
      const runWarnings: string[] = [];
      try {
        const records = await runIntelxSearch(query.term);
        searchesRun += 1;

        for (const record of records) {
          if (recordsCreated >= INTELX_MAX_RECORDS_PER_RUN) break;
          await ingestRecord({
            sourceKind: 'search',
            sourceRunId: sourceRun?.id || null,
            query,
            record,
          });
          recordsCount += 1;
          searchRecordsIngested += 1;
        }

        const runStatus = runWarnings.length > 0 ? 'partial' : 'completed';
        if (sourceRun?.id) {
          await finalizeSourceRun(
            adminClient,
            sourceRun.id,
            sourceRun.started_at,
            runStatus,
            recordsCount,
            runWarnings[0] || null,
            null,
            { stage: 'search', records: recordsCount },
          );
        }
      } catch (err) {
        const message = maskedError(err, `Search failed on ${query.term}`);
        pushWarningUnique(warnings, message);
        if (sourceRun?.id) {
          await finalizeSourceRun(
            adminClient,
            sourceRun.id,
            sourceRun.started_at,
            'failed',
            recordsCount,
            null,
            message,
            { stage: 'search', query_term: query.term, query_kind: query.kind },
          );
        }
      }
    }

    // Phonebook: solo per tier extended
    const phonebookTerms = isExtendedTier
      ? queryTerms
          .filter((query) => query.kind === 'at_domain_tld' || query.kind === 'email_selector' || query.kind === 'selector')
          .slice(0, Math.min(INTELX_PHONEBOOK_MAX_TERMS, queryTerms.length))
      : [];
    let phonebookDegraded = false;

    for (const query of phonebookTerms) {
      if (phonebookDegraded) break;
      if (recordsCreated >= INTELX_MAX_RECORDS_PER_RUN) break;

      const sourceRun = await createSourceRun(adminClient, {
        organization_id: requestedCustomerId,
        tenant_id: requestedCustomerId,
        scan_run_id: scanRunId,
        source: 'intelx',
        source_key: `intelx:phonebook:${query.kind}:${query.term}`,
        source_label: 'DARKRISK_ESTESO Phonebook',
        source_kind: 'phonebook_intelligence',
        query_kind: query.kind,
        query_term: query.term,
        asset_scope: query.assetScope,
        selector_value: query.selectorNormalized,
        status: 'running',
        metadata: { stage: 'phonebook' },
      });

      let recordsCount = 0;
      try {
        const records = await runIntelxPhonebook(query.term);
        phonebookRun += 1;

        for (const record of records) {
          if (recordsCreated >= INTELX_MAX_RECORDS_PER_RUN) break;
          await ingestRecord({
            sourceKind: 'phonebook',
            sourceRunId: sourceRun?.id || null,
            query,
            record,
          });
          recordsCount += 1;
          phonebookRecordsIngested += 1;
        }

        if (sourceRun?.id) {
          await finalizeSourceRun(
            adminClient,
            sourceRun.id,
            sourceRun.started_at,
            'completed',
            recordsCount,
            null,
            null,
            { stage: 'phonebook', records: recordsCount },
          );
        }
      } catch (err) {
        const message = maskedError(err, `Phonebook failed on ${query.term}`);
        const isInvalidSearchId = isInvalidSearchIdLike(message);
        if (isInvalidSearchId) {
          pushWarningUnique(
            warnings,
            'IntelX Phonebook disattivato in questa run: provider ha restituito Search ID non valido.',
          );
          phonebookDegraded = true;
        } else {
          pushWarningUnique(warnings, message);
        }

        if (sourceRun?.id) {
          const status = (isAuthzLikeError(message) || isInvalidSearchId) ? 'partial' : 'failed';
          await finalizeSourceRun(
            adminClient,
            sourceRun.id,
            sourceRun.started_at,
            status,
            recordsCount,
            (isAuthzLikeError(message) || isInvalidSearchId) ? 'Phonebook degraded' : null,
            message,
            { stage: 'phonebook', query_term: query.term, query_kind: query.kind },
          );
        }

        if (isAuthzLikeError(message) || isInvalidSearchId) break;
      }
    }

    // Leaks API (3.intelx.io): solo per tier extended
    const leaksTerms = isExtendedTier
      ? queryTerms
          .filter((query) => query.kind === 'email_selector' || query.kind === 'at_domain_tld')
          .slice(0, Math.min(20, queryTerms.length))
      : [];

    for (const query of leaksTerms) {
      if (recordsCreated >= INTELX_MAX_RECORDS_PER_RUN) break;

      const sourceRun = await createSourceRun(adminClient, {
        organization_id: requestedCustomerId,
        tenant_id: requestedCustomerId,
        scan_run_id: scanRunId,
        source: 'intelx',
        source_key: `intelx:leaks:${query.kind}:${query.term}`,
        source_label: 'DARKRISK_ESTESO Leaks',
        source_kind: 'identity_leaks',
        query_kind: query.kind,
        query_term: query.term,
        asset_scope: query.assetScope,
        selector_value: query.selectorNormalized,
        status: 'running',
        metadata: { stage: 'leaks' },
      });

      let recordsCount = 0;
      try {
        const selector = query.kind === 'at_domain_tld' ? query.term.replace(/^@/, '') : query.term;
        const records = await runLeaksSearch(selector);
        leaksRun += 1;

        for (const record of records) {
          if (recordsCreated >= INTELX_MAX_RECORDS_PER_RUN) break;
          await ingestRecord({
            sourceKind: 'leaks',
            sourceRunId: sourceRun?.id || null,
            query,
            record,
          });
          recordsCount += 1;
          leaksRecordsIngested += 1;
        }

        if (sourceRun?.id) {
          await finalizeSourceRun(
            adminClient,
            sourceRun.id,
            sourceRun.started_at,
            'completed',
            recordsCount,
            null,
            null,
            { stage: 'leaks', records: recordsCount },
          );
        }
      } catch (err) {
        const message = maskedError(err, `Leaks failed on ${query.term}`);
        pushWarningUnique(warnings, message);

        if (sourceRun?.id) {
          await finalizeSourceRun(
            adminClient,
            sourceRun.id,
            sourceRun.started_at,
            'failed',
            recordsCount,
            null,
            message,
            { stage: 'leaks', query_term: query.term, query_kind: query.kind },
          );
        }
      }
    }

    const runStats = {
      mode: 'darkrisk_esteso_mvp',
      include_surface_sync: includeSurfaceSync,
      identity_model_valid_until: validUntil,
      selectors_considered: upsertCtx.selectorDefs.length,
      query_terms_considered: queryTerms.length,
      identity_email_selectors_used: new Set(
        upsertCtx.selectorDefs
          .filter((selector) => selector.type === 'email')
          .map((selector) => selector.normalized.toLowerCase()),
      ).size,
      intelx: {
        searches_run: searchesRun,
        phonebook_searches_run: phonebookRun,
        phonebook_degraded: phonebookDegraded,
        leaks_searches_run: leaksRun,
        search_records_ingested: searchRecordsIngested,
        phonebook_records_ingested: phonebookRecordsIngested,
        leaks_records_ingested: leaksRecordsIngested,
      },
      ingestion: {
        source_records_created: recordsCreated,
        evidence_created: evidenceCreated,
        findings_created: findingsCreated,
        alerts_created: alertsCreated,
        sensitive_hits_created: sensitiveHitsCreated,
      },
      surface_auto_queue: {
        queued_classic: surfaceSyncRes.queuedClassic,
        failed_classic: surfaceSyncRes.failedClassic,
      },
    };

    // ── Fire subdomain discovery for all scope domains (engine orchestration) ──
    if (normalizedScopeDomains.length > 0 && SUPABASE_URL && INTERNAL_FUNCTIONS_API_KEY) {
      const subdomainPromises = normalizedScopeDomains.slice(0, 10).map((domain) =>
        fetchWithTimeout(
          `${SUPABASE_URL}/functions/v1/subdomain-dump`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${INTERNAL_FUNCTIONS_API_KEY}`,
              apikey: INTERNAL_FUNCTIONS_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              organization_id: requestedCustomerId,
              root_domain: domain,
              triggered_by: 'darkrisk_esteso_sync',
            }),
          },
          15_000,
        ).catch(() => undefined),
      );
      Promise.allSettled(subdomainPromises).catch(() => undefined);
    }

    // ── Generate DTI Esteso Report (content-rich) ────────────────────────────
    let dtiEstesoReportUrl: string | null = null;
    if (SUPABASE_URL && INTERNAL_FUNCTIONS_API_KEY) {
      try {
        const dtiReportResponse = await fetchWithTimeout(
          `${SUPABASE_URL}/functions/v1/darkrisk-dti-esteso-report`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${SERVICE_ROLE}`,
              'Content-Type': 'application/json',
              ...(DARKRISK_INTERNAL_SECRET ? { 'x-darkrisk-internal-secret': DARKRISK_INTERNAL_SECRET } : {}),
            },
            body: JSON.stringify({
              customer_id: requestedCustomerId,
              scan_run_id: scanRunId,
            }),
          },
          55_000,
        );
        if (dtiReportResponse.ok) {
          const dtiReportData = await dtiReportResponse.json().catch(() => ({}));
          dtiEstesoReportUrl = dtiReportData?.signed_url || null;
        } else {
          const errText = await dtiReportResponse.text().catch(() => '');
          pushWarningUnique(warnings, `DTI Esteso report generation failed: ${maskPotentialSecrets(errText).slice(0, 200)}`);
        }
      } catch (dtiErr) {
        pushWarningUnique(warnings, `DTI Esteso report generation failed: ${maskedError(dtiErr).slice(0, 200)}`);
      }
      if (dtiEstesoReportUrl) {
        (runStats as Record<string, unknown>).dti_esteso_report_url = dtiEstesoReportUrl;
      }
    }

    let reportMode: 'generated' | 'failed' | 'skipped' = 'skipped';
    if (SUPABASE_URL && INTERNAL_FUNCTIONS_API_KEY) {
      try {
        const reportResponse = await fetchWithTimeout(
          `${SUPABASE_URL}/functions/v1/darkrisk360-generate-report`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${INTERNAL_FUNCTIONS_API_KEY}`,
              apikey: INTERNAL_FUNCTIONS_API_KEY,
              'Content-Type': 'application/json',
              ...(DARKRISK_INTERNAL_SECRET ? { 'x-darkrisk-internal-secret': DARKRISK_INTERNAL_SECRET } : {}),
            },
            body: JSON.stringify({
              customer_id: requestedCustomerId,
              scan_run_id: scanRunId,
              classification: 'confidential',
              report_mode: 'extended',
            }),
          },
          50_000,
        );

        if (!reportResponse.ok) {
          const text = await reportResponse.text();
          reportMode = 'failed';
          pushWarningUnique(warnings, `Report generation failed: ${maskPotentialSecrets(text).slice(0, 220)}`);
        } else {
          reportMode = 'generated';
        }
      } catch (err) {
        reportMode = 'failed';
        pushWarningUnique(warnings, `Report generation failed: ${maskedError(err).slice(0, 220)}`);
      }
    }

    (runStats as Record<string, unknown>).report_mode = reportMode;

    await adminClient
      .from('darkrisk_scan_runs' as any)
      .update({
        status: warnings.length > 0 ? 'completed_with_warnings' : 'completed',
        completed_at: new Date().toISOString(),
        warnings,
        stats: runStats,
        sources: ['surfacescan360', 'intelx'],
        updated_at: new Date().toISOString(),
      })
      .eq('id', scanRunId);

    // Post-scan: fire-and-forget snapshot (aggrega stats + triggera notify se nuovi finding)
    if (SUPABASE_URL && SERVICE_ROLE && DARKRISK_INTERNAL_SECRET) {
      void fetch(`${SUPABASE_URL}/functions/v1/darkrisk360-snapshot`, {
        method: 'POST',
        signal: AbortSignal.timeout(12_000),
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          'x-darkrisk360-internal-secret': DARKRISK_INTERNAL_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ organization_id: requestedCustomerId, scan_run_id: scanRunId }),
      }).catch((err) => {
        console.warn('[darkrisk-esteso-sync] snapshot hook failed:', String(err));
      });
    }

    await writeAudit(
      adminClient,
      requestedCustomerId,
      actorUserId,
      'darkrisk_esteso_scan_completed',
      scanRunId,
      warnings.length > 0 ? 'completed_with_warnings' : 'completed',
      {
        warnings_count: warnings.length,
        stats: runStats,
      },
    );

    return jsonResponse({
      ok: true,
      scan_run_id: scanRunId,
      status: warnings.length > 0 ? 'completed_with_warnings' : 'completed',
      warnings,
      stats: runStats,
      code: warnings.length > 0 ? 'darkrisk_esteso_completed_with_warnings' : 'darkrisk_esteso_completed',
    }, 200);
  } catch (err) {
    const message = maskedError(err, 'Internal error');

    if (scanRunId && lockAdminClient) {
      await lockAdminClient
        .from('darkrisk_scan_runs' as any)
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', scanRunId);
    }

    if (scanRunId && lockAdminClient && lockOrganizationId) {
      await lockAdminClient.from('darkrisk_audit_log' as any).insert({
        organization_id: lockOrganizationId,
        tenant_id: lockOrganizationId,
        actor_id: null,
        action: 'darkrisk_esteso_scan_failed',
        entity_type: 'darkrisk_esteso_run',
        entity_id: scanRunId,
        reason: 'runtime_error',
        metadata: { error: message },
      });
    }

    return jsonResponse({
      ok: false,
      code: 'darkrisk_esteso_sync_failed',
      error: message,
      scan_run_id: scanRunId,
      status: 'failed',
      warnings: [],
      stats: {},
    }, 500);
  } finally {
    if (lockAcquired && lockAdminClient && lockOrganizationId) {
      await lockAdminClient
        .from('darkrisk_scan_locks' as any)
        .delete()
        .eq('organization_id', lockOrganizationId)
        .catch(() => undefined);
    }
  }
});
