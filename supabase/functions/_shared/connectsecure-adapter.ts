/**
 * ConnectSecure (CyberCNS) Attack Surface Mapper — API Adapter
 *
 * Auth flow: POST /w/authorize { Client-Auth-Token: base64(tenantId+clientId:secret) }
 *            → { access_token, user_id }
 * Re-autentica automaticamente su 401.
 *
 * Workflow: authorize → getOrCreateDomain → scanNow → waitForJob → getResults → mapToFindings
 */

export interface CsConfig {
  pod_host:           string;   // es. pod401.myconnectsecure.com
  client_auth_token:  string;   // già base64-encoded per header Client-Auth-Token
  company_id:         number;
}

export interface CsSession {
  token:  string;
  userId: string;
}

export function csNormalizeClientAuthToken(value: string): string {
  let token = String(value || '').trim();
  token = token.replace(/^['"]|['"]$/g, '').trim();
  token = token.replace(/^Client-Auth-Token\s*:\s*/i, '').trim();

  const compact = token.replace(/\s+/g, '');
  const looksBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(compact) && compact.length % 4 === 0;
  if (looksBase64) return compact;

  if (token.includes(':')) {
    return btoa(token);
  }

  return compact || token;
}

function normalizePodHost(podHost: string): string {
  return String(podHost || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function csUrl(cfg: CsConfig, path: string): string {
  return `https://${normalizePodHost(cfg.pod_host)}${path}`;
}

function safeErrorBody(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[redacted]"')
    .replace(/"Client-Auth-Token"\s*:\s*"[^"]+"/gi, '"Client-Auth-Token":"[redacted]"')
    .substring(0, 300);
}

export interface CsJob {
  id:          string | number;
  type:        string;
  status:      string;
  description: string;
  created_at?: string;
}

export interface CsTargetIp {
  'IP Address': string;
  ASN?:         string;
  Location?:    string;
  port_protocol?: string[] | string;
  Vulnerabities?: string; // CSV di CVE IDs (typo intenzionale nella loro API)
  Vulnerabilities?: string;
}

export interface CsSubdomain {
  subdomain:   string;
  dns_records?: Array<{ type: string; value: string }>;
}

export interface CsResult {
  id:                   number;
  name:                 string;
  website:              string;
  status:               string;
  attack_surface_domain_id: number;
  company_id:           number;
  assets?:              unknown;
  data?:                unknown;
  results?:             unknown;
  records?:             unknown;
  items?:               unknown;
  rows?:                unknown;
  target_ips?:          unknown;
  subdomains?:          unknown;
  sub_domains?:         unknown;
  subdomain_results?:   unknown;
  discovered_subdomains?: unknown;
  hosts?:               unknown;
  domains?:             unknown;
  dns_records?:         unknown;
  mx?:                  { hosts?: string[]; warnings?: string[]; error?: string };
  spf?:                 { valid?: boolean; record?: string; warnings?: string[]; dns_lookups?: number };
  dmarc?:               { valid?: boolean; record?: string; location?: string; warnings?: string[] };
  email_spoof_checks?:  Array<{ check: string; result: string; passed?: boolean }>;
  emails?:              unknown;
  guessed_emails?:      unknown;
  usernames?:           unknown;
  employees?:           unknown;
  raw_headers?:         Record<string, string>;
  s3buckets?:           unknown;
  creds?:               unknown;
  hashes?:              unknown;
  created?:             string;
  updated?:             string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function csAuthorize(cfg: CsConfig): Promise<CsSession> {
  const token = csNormalizeClientAuthToken(cfg.client_auth_token);
  const url = csUrl(cfg, '/w/authorize');
  const r = await fetch(url, {
    method:  'POST',
    headers: {
      accept:              'application/json',
      'Client-Auth-Token': token,
    },
    body: '',
  });
  const rawText = await r.text().catch(() => '');
  if (!r.ok) {
    throw new Error(`[ConnectSecure] authorize failed: ${r.status}${rawText ? ' - ' + safeErrorBody(rawText) : ''}`);
  }
  let body: any;
  try { body = JSON.parse(rawText); } catch {
    throw new Error(`[ConnectSecure] non-JSON response: ${safeErrorBody(rawText)}`);
  }
  // CS returns access_token both at root and inside data{}
  const accessToken = body?.data?.access_token ?? body?.access_token;
  const userId      = body?.data?.user_id      ?? body?.user_id;
  if (!accessToken) {
    throw new Error(`[ConnectSecure] auth failed — ${JSON.stringify(body).substring(0, 300)}`);
  }
  return { token: String(accessToken), userId: String(userId) };
}

function authHeaders(session: CsSession, mode: 'raw' | 'bearer' = 'raw'): Record<string, string> {
  return {
    accept:         'application/json',
    'Content-Type': 'application/json',
    Authorization:  mode === 'bearer' ? `Bearer ${session.token}` : session.token,
    'X-USER-ID':    session.userId,
  };
}

// Wrapper con retry su 401
async function csFetch<T>(
  cfg:     CsConfig,
  session: { current: CsSession },
  url:     string,
  options: RequestInit = {},
): Promise<T> {
  const extraHeaders = (options.headers as Record<string, string> || {});
  let r = await fetch(url, { ...options, headers: { ...authHeaders(session.current, 'raw'), ...extraHeaders } });
  if (r.status === 401) {
    session.current = await csAuthorize(cfg);
    r = await fetch(url, { ...options, headers: { ...authHeaders(session.current, 'raw'), ...extraHeaders } });
  }
  if (r.status === 401) {
    r = await fetch(url, { ...options, headers: { ...authHeaders(session.current, 'bearer'), ...extraHeaders } });
  }
  if (!r.ok) throw new Error(`[ConnectSecure] ${url} -> ${r.status} ${safeErrorBody(await r.text().catch(() => ''))}`);
  return await r.json() as T;
}

// ── Domain registry ───────────────────────────────────────────────────────────

export async function csGetOrCreateDomain(
  cfg:     CsConfig,
  session: { current: CsSession },
  domain:  string,
  adminClient: { from: (t: string) => any },
  orgId:   string,
): Promise<number> {
  // 1. Check locale (evita doppia creazione)
  const { data: existing } = await adminClient
    .from('connectsecure_domain_registry')
    .select('cs_domain_id')
    .eq('organization_id', orgId)
    .eq('domain', domain)
    .maybeSingle();
  if (existing?.cs_domain_id) return Number(existing.cs_domain_id);

  // 2. Crea il domain in ConnectSecure
  const url = csUrl(cfg, '/w/company/attack_surface_domain');
  const body = await csFetch<{ id?: string | number; status: boolean }>(cfg, session, url, {
    method: 'POST',
    body:   JSON.stringify({ data: { name: domain, domain, scanlater: false, company_id: cfg.company_id } }),
  });
  const domainId = Number(body.id);
  if (!domainId || !body.status) throw new Error(`[ConnectSecure] createDomain failed for ${domain}`);

  // 3. Salva nel registry
  await adminClient.from('connectsecure_domain_registry').upsert({
    organization_id: orgId,
    domain,
    cs_domain_id:    domainId,
  }, { onConflict: 'organization_id,domain' });

  return domainId;
}

// ── Scan trigger ──────────────────────────────────────────────────────────────

export async function csScanNow(
  cfg:     CsConfig,
  session: { current: CsSession },
  domains: Array<{ name: string; domain: string; company_id: number; id: number }>,
): Promise<void> {
  if (domains.length === 0) return;
  const url = csUrl(cfg, '/w/attack_surface/scan_now');
  const body = await csFetch<{ status: boolean; message: string }>(cfg, session, url, {
    method: 'POST',
    body:   JSON.stringify({ scan_data: domains.map(d => ({ name: d.name, domain: d.domain, company_id: d.company_id, id: d.id })) }),
  });
  if (!body.status) throw new Error(`[ConnectSecure] scan_now failed: ${body.message}`);
}

// ── Job polling ───────────────────────────────────────────────────────────────

export async function csWaitForJob(
  cfg:       CsConfig,
  session:   { current: CsSession },
  domain:    string,
  timeoutMs: number = 420_000,
): Promise<CsJob> {
  const deadline = Date.now() + timeoutMs;
  const pollMs   = 20_000;

  while (Date.now() < deadline) {
    const url = csUrl(cfg, `/r/company/jobs?condition=company_id=${cfg.company_id}&order_by=created desc&limit=30`);
    const body = await csFetch<{ data?: CsJob[]; status: boolean }>(cfg, session, url);
    const jobs: CsJob[] = Array.isArray(body.data) ? body.data : [];
    const job = jobs.find(j =>
      j.type === 'ATTACKSURFACESCAN' &&
      String(j.description || '').toLowerCase().includes(domain.toLowerCase())
    );
    if (job) {
      if (/completed/i.test(job.status)) return job;
      if (/failed/i.test(job.status)) throw new Error(`[ConnectSecure] scan failed for ${domain}: ${job.description}`);
    }
    await new Promise(res => setTimeout(res, pollMs));
  }
  throw new Error(`[ConnectSecure] scan timed out after ${timeoutMs}ms for ${domain}`);
}

// ── Results ───────────────────────────────────────────────────────────────────

export async function csGetResults(
  cfg:      CsConfig,
  session:  { current: CsSession },
  domainId: number,
): Promise<CsResult | null> {
  const url = csUrl(cfg, `/r/company/attack_surface_results?condition=attack_surface_domain_id=${domainId}&order_by=updated desc`);
  const body = await csFetch<{ data?: CsResult[]; status: boolean }>(cfg, session, url);
  const results = Array.isArray(body.data) ? body.data : [];
  if (results.length === 0) return null;
  const r = results[0];
  return /completed/i.test(r.status || '') ? r : null;
}

function parseConnectSecureTimestamp(value: unknown): number {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : 0;
}

function freshAfterMs(value?: string | number | Date | null): number {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime();
  return parseConnectSecureTimestamp(value);
}

function resultFreshnessMs(result: CsResult): number {
  return Math.max(
    parseConnectSecureTimestamp(result.updated),
    parseConnectSecureTimestamp(result.created),
  );
}

export async function csWaitForResults(
  cfg:       CsConfig,
  session:   { current: CsSession },
  domainId:  number,
  domain:    string,
  timeoutMs: number = 420_000,
  freshAfter?: string | number | Date,
  pollMs: number = 20_000,
): Promise<CsResult> {
  const deadline = Date.now() + timeoutMs;
  const minFreshMs = freshAfterMs(freshAfter);

  while (Date.now() < deadline) {
    const url = csUrl(cfg, `/r/company/attack_surface_results?condition=attack_surface_domain_id=${domainId}&order_by=updated desc`);
    const body = await csFetch<{ data?: CsResult[]; status: boolean }>(cfg, session, url);
    const results = Array.isArray(body.data) ? body.data : [];
    const result = results[0];

    if (result) {
      if (/completed/i.test(result.status || '')) {
        const resultMs = resultFreshnessMs(result);
        if (!minFreshMs || (resultMs && resultMs >= minFreshMs)) return result;
      }
      if (/failed|error/i.test(result.status || '')) {
        throw new Error(`[ConnectSecure] scan failed for ${domain}: ${result.status}`);
      }
    }

    await new Promise(res => setTimeout(res, pollMs));
  }

  throw new Error(`[ConnectSecure] result polling timed out after ${timeoutMs}ms for ${domain}`);
}

// ── Mapping ConnectSecure result → surface DB types ───────────────────────────

export interface CsMappedAsset {
  asset_type: 'subdomain' | 'ipv4' | 'ipv6' | 'domain';
  asset_value: string;
  hostname?: string;
  root_domain?: string;
  ip?: string;
  source: 'connectsecure';
  confidence: 'high';
  raw?: Record<string, unknown>;
}

export interface CsMappedFinding {
  provider:      'connectsecure';
  module:        string;
  finding_type:  string;
  severity:      'critical' | 'high' | 'medium' | 'low' | 'info';
  title:         string;
  description:   string;
  affected_asset: string;
  ip?:           string;
  port?:         number;
  protocol?:     string;
  cve?:          string[];
  cwe?:          string[];
  cvss?:         number;
  evidence?:     Record<string, unknown>;
  remediation?:  string;
}

export interface CsMappedPort {
  port:         number;
  host:         string;
  ip:           string;
  protocol:     string;
  serviceName?: string;
  serviceVersion?: string;
  banner?:      string;
}

export interface CsMapResult {
  assets:         CsMappedAsset[];
  findings:       CsMappedFinding[];
  ports:          CsMappedPort[];
  observations:   Array<{ type: string; title: string; value: Record<string, unknown>; severity: string }>;
  sensitiveData:  { creds?: Array<Record<string, unknown>>; hashes?: Array<Record<string, unknown>>; domain: string };
}

function parseCsvCves(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim().toUpperCase()).filter(s => /^CVE-\d{4}-\d+$/.test(s));
}

function sevFromCvss(cvss?: number): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  if (!cvss) return 'info';
  if (cvss >= 9.0) return 'critical';
  if (cvss >= 7.0) return 'high';
  if (cvss >= 4.0) return 'medium';
  return 'low';
}

const HIGH_RISK_PORTS = new Set([3389, 5900, 6379, 9200, 27017, 11211, 2375, 10250, 1521, 1433]);
const MEDIUM_RISK_PORTS = new Set([21, 23, 445, 3306, 5432, 8080, 8443, 8888, 9000, 22]);

function portSeverity(p: number): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  if (HIGH_RISK_PORTS.has(p)) return 'critical';
  if (MEDIUM_RISK_PORTS.has(p)) return 'medium';
  if ([80, 443].includes(p)) return 'info';
  return 'low';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function flattenList(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return [value];
  return value.flatMap(entry => flattenList(entry));
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value === true;
  if (Array.isArray(value)) return flattenList(value).some(hasMeaningfulValue);
  if (isRecord(value)) return Object.values(value).some(hasMeaningfulValue);
  return false;
}

function meaningfulRecords(value: unknown): Array<Record<string, unknown>> {
  return flattenList(value)
    .filter(isRecord)
    .filter(record => Object.values(record).some(hasMeaningfulValue));
}

function meaningfulStrings(value: unknown): string[] {
  return Array.from(new Set(flattenList(value)
    .map(entry => String(entry || '').trim())
    .filter(Boolean)));
}

function recordString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    normalized.set(key.toLowerCase().replace(/[\s_-]+/g, ''), value);
  }
  for (const key of keys) {
    const value = normalized.get(key.toLowerCase().replace(/[\s_-]+/g, ''));
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

const STORAGE_PLACEHOLDER_VALUES = new Set([
  'unknown',
  'sconosciuto',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  '-',
  '--',
  'not available',
  'non disponibile',
]);

function isUsableStorageIdentifier(value: string): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return !STORAGE_PLACEHOLDER_VALUES.has(normalized);
}

function storageBucketEvidence(record: Record<string, unknown>): { name: string; url: string; label: string; asset: string } | null {
  const rawName = recordString(record, ['name', 'bucket', 'bucket_name', 'bucketName']);
  const rawUrl = recordString(record, ['url', 'uri', 'endpoint', 'host', 'hostname']);
  const name = isUsableStorageIdentifier(rawName) ? rawName : '';
  const url = isUsableStorageIdentifier(rawUrl) ? rawUrl : '';
  if (!name && !url) return null;
  return {
    name,
    url,
    label: name || url,
    asset: url || name,
  };
}

function parsePortProtocols(value: unknown): Array<{ port: number; protocol: string }> {
  const seen = new Set<string>();
  const ports: Array<{ port: number; protocol: string }> = [];
  for (const entry of flattenList(value)) {
    const chunks = String(entry || '')
      .split(/[,\s;]+/)
      .map(chunk => chunk.trim())
      .filter(Boolean);
    for (const chunk of chunks) {
      const match = chunk.match(/^(\d{1,5})(?:\/([a-z0-9]+))?$/i);
      if (!match) continue;
      const port = Number(match[1]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
      const protocol = String(match[2] || 'tcp').toLowerCase();
      const key = `${port}/${protocol}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ports.push({ port, protocol });
    }
  }
  return ports;
}

function normalizeResultHostname(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname
      .toLowerCase()
      .replace(/\.$/, '');
  } catch {
    return raw
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .split(/[\s,;|]+/)[0]
      .toLowerCase()
      .replace(/\.$/, '');
  }
}

const SUBDOMAIN_SOURCE_KEYS = [
  'subdomains',
  'sub_domains',
  'subdomain_results',
  'discovered_subdomains',
  'discoveredSubdomains',
  'hosts',
  'hostnames',
  'domains',
  'assets',
  'attack_surface_assets',
  'attackSurfaceAssets',
  'attack_surface_results',
  'attackSurfaceResults',
  'domain_configurations',
  'domainConfigurations',
  'data',
  'results',
  'records',
  'items',
  'rows',
  'dns_records',
  'dnsRecords',
];

const SUBDOMAIN_HOST_FIELD_KEYS = [
  'subdomain',
  'sub_domain',
  'subDomain',
  'Sub Domain',
  'hostname',
  'host_name',
  'hostName',
  'host',
  'fqdn',
  'dns_name',
  'dnsName',
  'domain',
  'domain_name',
  'domainName',
  'name',
  'asset',
  'asset_name',
  'assetName',
  'asset_value',
  'assetValue',
  'config_name',
  'configName',
  'url',
  'uri',
  'website',
  'address',
  'target',
];

function normalizedObjectKey(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

const SUBDOMAIN_SOURCE_KEY_SET = new Set(SUBDOMAIN_SOURCE_KEYS.map(normalizedObjectKey));
const SUBDOMAIN_HOST_FIELD_KEY_SET = new Set(SUBDOMAIN_HOST_FIELD_KEYS.map(normalizedObjectKey));

function recordValueByKey(record: Record<string, unknown>, key: string): unknown {
  if (key in record) return record[key];
  const wanted = normalizedObjectKey(key);
  for (const [candidateKey, value] of Object.entries(record)) {
    if (normalizedObjectKey(candidateKey) === wanted) return value;
  }
  return undefined;
}

function trimHostCandidate(value: string): string {
  return value
    .trim()
    .replace(/^[<("'[\{]+/, '')
    .replace(/[>\)"'\]},.;]+$/, '');
}

function candidateStrings(value: unknown): string[] {
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)];
  if (typeof value !== 'string') return [];
  const raw = value.trim();
  if (!raw) return [];
  const cleaned = trimHostCandidate(raw);
  const chunks = cleaned
    .split(/[\s,;|]+/)
    .map(trimHostCandidate)
    .filter(Boolean);
  return chunks.length > 0 ? chunks : [cleaned];
}

function addSubdomainCandidate(
  value: unknown,
  raw: Record<string, unknown>,
  root: string,
  byDomain: Map<string, Record<string, unknown>>,
): void {
  for (const candidate of candidateStrings(value)) {
    if (candidate.includes('@') && !/^https?:\/\//i.test(candidate)) continue;
    const domain = normalizeResultHostname(candidate);
    if (!domain || !domain.includes('.') || domain.includes('*') || domain.includes('@')) continue;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(domain)) continue;
    if (root && (domain === root || !domain.endsWith(`.${root}`))) continue;
    if (!byDomain.has(domain)) byDomain.set(domain, raw);
  }
}

function collectSubdomainEntries(
  value: unknown,
  root: string,
  byDomain: Map<string, Record<string, unknown>>,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (value === null || value === undefined || depth > 10 || byDomain.size >= 5000) return;

  if (typeof value === 'string' || typeof value === 'number') {
    addSubdomainCandidate(value, { value }, root, byDomain);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectSubdomainEntries(entry, root, byDomain, depth + 1, seen);
    return;
  }

  if (!isRecord(value)) return;
  if (seen.has(value)) return;
  seen.add(value);

  for (const key of SUBDOMAIN_HOST_FIELD_KEYS) {
    const rawValue = recordValueByKey(value, key);
    if (rawValue !== undefined) addSubdomainCandidate(rawValue, value, root, byDomain);
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = normalizedObjectKey(key);
    if (
      SUBDOMAIN_SOURCE_KEY_SET.has(normalizedKey) ||
      SUBDOMAIN_HOST_FIELD_KEY_SET.has(normalizedKey) ||
      Array.isArray(nested) ||
      isRecord(nested)
    ) {
      collectSubdomainEntries(nested, root, byDomain, depth + 1, seen);
    }
  }
}

function extractSubdomainEntries(result: Record<string, unknown>, rootDomain?: string): Array<{ domain: string; raw: Record<string, unknown> }> {
  const root = normalizeResultHostname(rootDomain || '');
  const byDomain = new Map<string, Record<string, unknown>>();

  for (const key of SUBDOMAIN_SOURCE_KEYS) {
    const source = recordValueByKey(result, key);
    collectSubdomainEntries(source, root, byDomain);
  }

  return Array.from(byDomain.entries())
    .map(([domain, raw]) => ({ domain, raw }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

export function csExtractSubdomains(result: Pick<CsResult, 'subdomains'> | Record<string, unknown>, rootDomain?: string): string[] {
  const record = result as Record<string, unknown>;
  const inferredRoot = rootDomain || normalizeResultHostname(recordString(record, ['website', 'domain', 'root_domain', 'rootDomain', 'name']));
  const subdomains = new Set<string>();
  for (const { domain } of extractSubdomainEntries(record, inferredRoot)) {
    if (!domain || !domain.includes('.') || domain.includes('*')) continue;
    subdomains.add(domain);
  }
  return Array.from(subdomains).sort();
}

export function csMapToFindings(result: CsResult, rootDomain: string, depth: number): CsMapResult {
  const assets:       CsMappedAsset[]   = [];
  const findings:     CsMappedFinding[] = [];
  const ports:        CsMappedPort[]    = [];
  const observations: CsMapResult['observations'] = [];
  const subdomainEntries = extractSubdomainEntries(result as unknown as Record<string, unknown>, rootDomain);

  // ── Subdomains → assets ───────────────────────────────────────────────────
  for (const { domain, raw } of subdomainEntries) {
    assets.push({
      asset_type: 'subdomain',
      asset_value: domain,
      hostname: domain,
      root_domain: rootDomain,
      source: 'connectsecure',
      confidence: 'high',
      raw: { depth: depth + 1, parent_domain: rootDomain, dns_records: raw.dns_records || raw.dnsRecords || null },
    });
  }
  if (subdomainEntries.length > 0) {
    const subdomains = subdomainEntries.map(entry => entry.domain);
    observations.push({
      type:     'connectsecure_discovered_subdomains',
      title:    `Sottodomini rilevati dallo scanner esterno per ${rootDomain}`,
      value:    {
        root_domain: rootDomain,
        total: subdomains.length,
        max_depth: 10,
        source: 'connectsecure',
        subdomains,
      },
      severity: 'info',
    });
  }

  // ── target_ips → ports + CVE findings ────────────────────────────────────
  for (const target of meaningfulRecords(result.target_ips)) {
    const ip = recordString(target, ['IP Address', 'ip_address', 'ip']).trim();
    if (!ip) continue;
    assets.push({ asset_type: 'ipv4', asset_value: ip, ip, root_domain: rootDomain, source: 'connectsecure', confidence: 'high' });

    const cves = parseCsvCves(String(target.Vulnerabities || target.Vulnerabilities || ''));
    const portProtos = parsePortProtocols(target.port_protocol || target.ports || target.open_ports);

    for (const { port, protocol } of portProtos) {
      const proto = protocol || 'tcp';

      ports.push({ port, host: rootDomain, ip, protocol: proto.toLowerCase() });

      findings.push({
        provider:      'connectsecure',
        module:        'connectsecure',
        finding_type:  'open_port_exposed',
        severity:      portSeverity(port),
        title:         `Porta ${port}/${proto.toLowerCase()} esposta su ${rootDomain}`,
        description:   `Dominio ${rootDomain} risolve sull'IP ${ip}: porta ${port}/${proto.toLowerCase()} aperta.${cves.length ? ` CVE associati: ${cves.slice(0, 3).join(', ')}` : ''}`,
        affected_asset: rootDomain,
        ip,
        port,
        protocol:      proto.toLowerCase(),
        cve:           cves,
        evidence:      { source: 'connectsecure', scope_target_host: rootDomain, ip, port, asn: target.ASN, location: target.Location },
      });
    }

    // Vulnerabilità generali dell'IP (senza porta specifica)
    if (cves.length > 0 && portProtos.length === 0) {
      findings.push({
        provider:      'connectsecure',
        module:        'connectsecure',
        finding_type:  'vulnerability_detected',
        severity:      'high',
        title:         `Vulnerabilità rilevate su ${rootDomain}`,
        description:   `CVE associate all'IP ${ip} collegato a ${rootDomain}: ${cves.join(', ')}`,
        affected_asset: rootDomain,
        ip,
        cve:           cves,
        evidence:      { source: 'connectsecure', scope_target_host: rootDomain, asn: target.ASN },
      });
    }
  }

  // ── Mail security (SPF/DMARC/MX) ─────────────────────────────────────────
  const mailWarnings: string[] = [
    ...(result.mx?.warnings || []),
    ...(result.spf?.warnings || []),
    ...(result.dmarc?.warnings || []),
  ].filter(Boolean);

  if (mailWarnings.length > 0 || result.spf?.valid === false || result.dmarc?.valid === false) {
    const sevScore = (!result.spf?.valid ? 1 : 0) + (!result.dmarc?.valid ? 1 : 0) + (mailWarnings.length > 2 ? 1 : 0);
    findings.push({
      provider:      'connectsecure',
      module:        'connectsecure',
      finding_type:  'dns_mail_security',
      severity:      sevScore >= 2 ? 'high' : 'medium',
      title:         `Configurazione email non sicura per ${rootDomain}`,
      description:   `SPF valido: ${result.spf?.valid ?? 'N/A'}. DMARC valido: ${result.dmarc?.valid ?? 'N/A'}. Warning: ${mailWarnings.slice(0, 3).join('; ')}`,
      affected_asset: rootDomain,
      evidence:      { spf: result.spf, dmarc: result.dmarc, mx: result.mx },
      remediation:   'Configurare SPF, DMARC e DKIM per il dominio.',
    });
  }

  // ── Email spoofing ────────────────────────────────────────────────────────
  const failedSpoofChecks = (result.email_spoof_checks || []).filter(c => c.passed === false || /fail/i.test(c.result || ''));
  if (failedSpoofChecks.length > 0) {
    findings.push({
      provider:      'connectsecure',
      module:        'connectsecure',
      finding_type:  'email_spoofing',
      severity:      'high',
      title:         `Dominio ${rootDomain} vulnerabile a spoofing email`,
      description:   `${failedSpoofChecks.length} controlli anti-spoofing falliti: ${failedSpoofChecks.map(c => c.check).join(', ')}`,
      affected_asset: rootDomain,
      evidence:      { failed_checks: failedSpoofChecks },
      remediation:   'Configurare DMARC policy=reject e SPF ~all / -all.',
    });
  }

  // ── S3 Buckets esposti ────────────────────────────────────────────────────
  for (const bucket of meaningfulRecords(result.s3buckets)) {
    const storage = storageBucketEvidence(bucket);
    if (!storage) continue;
    findings.push({
      provider:      'connectsecure',
      module:        'connectsecure',
      finding_type:  'exposed_storage_bucket',
      severity:      'high',
      title:         `Bucket storage pubblico rilevato: ${storage.label}`,
      description:   `Il motore ASM esterno ha rilevato un bucket o endpoint storage pubblicamente accessibile collegato a ${rootDomain}. Evidenza: ${storage.label}.`,
      affected_asset: storage.asset || rootDomain,
      evidence:      {
        bucket,
        source:      'connectsecure',
        bucket_name: storage.name || null,
        bucket_url:  storage.url || null,
      },
      remediation:   'Verificare ownership del bucket, disabilitare accesso pubblico anonimo, restringere policy/ACL e ruotare eventuali credenziali o oggetti sensibili esposti.',
    });
  }

  // ── Observations: emails, employees, DNS ─────────────────────────────────
  const emails = meaningfulStrings(result.emails);
  const guessedEmails = meaningfulStrings(result.guessed_emails);
  const usernames = meaningfulStrings(result.usernames);
  if (emails.length + guessedEmails.length + usernames.length > 0) {
    observations.push({
      type:     'discovered_emails',
      title:    `Email scoperte per ${rootDomain}`,
      value:    { emails, guessed: guessedEmails, usernames },
      severity: 'info',
    });
  }
  const employees = meaningfulRecords(result.employees);
  if (employees.length > 0) {
    observations.push({
      type:     'osint_employees',
      title:    `Dipendenti rilevati via OSINT per ${rootDomain}`,
      value:    { employees },
      severity: 'info',
    });
  }
  const dnsRecords = flattenList(result.dns_records).filter(hasMeaningfulValue);
  if (dnsRecords.length > 0) {
    observations.push({
      type:     'dns_records',
      title:    `Record DNS per ${rootDomain}`,
      value:    { dns_records: dnsRecords },
      severity: 'info',
    });
  }
  if (result.raw_headers?.server) {
    observations.push({
      type:     'http_server_banner',
      title:    `Server HTTP rilevato per ${rootDomain}`,
      value:    { server: result.raw_headers.server, headers: result.raw_headers },
      severity: 'info',
    });
  }

  return {
    assets,
    findings,
    ports,
    observations,
    sensitiveData: {
      creds:  meaningfulRecords(result.creds),
      hashes: meaningfulRecords(result.hashes),
      domain: rootDomain,
    },
  };
}

// ── External Scan — Discovery Settings ───────────────────────────────────────

export interface CsDiscoverySetting {
  id:                       number;
  name:                     string;
  address:                  string;
  address_type:             string;
  company_id:               number;
  discovery_settings_type?: string;
}

export async function csGetDiscoverySettings(
  cfg:     CsConfig,
  session: { current: CsSession },
): Promise<CsDiscoverySetting[]> {
  const url = csUrl(cfg, `/r/company/discovery_settings?condition=company_id=${cfg.company_id}`);
  const body = await csFetch<{ data?: CsDiscoverySetting[]; status: boolean }>(cfg, session, url);
  return Array.isArray(body.data) ? body.data : [];
}

export async function csCreateDiscoverySetting(
  cfg:         CsConfig,
  session:     { current: CsSession },
  address:     string,
  addressType: 'domain' | 'ipaddress' = 'domain',
): Promise<number | null> {
  const url  = csUrl(cfg, '/w/company/discovery_settings');
  const body = await csFetch<{ status: boolean; id?: string }>(cfg, session, url, {
    method: 'POST',
    body:   JSON.stringify({
      data: {
        name:                    address,
        address_type:            addressType,
        address,
        company_id:              cfg.company_id,
        discovery_settings_type: 'External',
        scan_later:              false,
        is_excluded:             false,
      },
    }),
  });
  return body.id ? Number(body.id) : null;
}

// ── External Scan — Trigger ───────────────────────────────────────────────────

export async function csExternalScan(
  cfg:               CsConfig,
  session:           { current: CsSession },
  discoverySettings: number[],
): Promise<{ status: boolean; message?: string }> {
  const url = csUrl(cfg, '/w/company/external_scan');
  return await csFetch<{ status: boolean; message?: string }>(cfg, session, url, {
    method: 'POST',
    body:   JSON.stringify({ company_id: cfg.company_id, discovery_settings: discoverySettings }),
  });
}

// ── External Scan — Results ───────────────────────────────────────────────────

export interface CsExternalAsset {
  id:          number;
  name:        string;
  config_name: string;
  host_name:   string;
  ip:          string;
  grade:       string;
  critical:    string | number;
  high:        string | number;
  medium:      string | number;
  low:         string | number;
  vul_count:   number;
  created:     string;
  updated:     string;
}

export async function csGetExternalScanAssets(
  cfg:     CsConfig,
  session: { current: CsSession },
): Promise<CsExternalAsset[]> {
  const url = csUrl(cfg, `/r/report_queries/external_asset_externalscan?condition=company_id=${cfg.company_id}`);
  const body = await csFetch<{ data?: CsExternalAsset[]; status: boolean }>(cfg, session, url);
  return Array.isArray(body.data) ? body.data : [];
}

export interface CsExternalPort {
  asset_id:  number;
  port:      number;
  protocol:  string;
  service:   string;
  product:   string;
  extrainfo: string;
  status:    string;
}

export async function csGetExternalPorts(
  cfg:     CsConfig,
  session: { current: CsSession },
  assetId: number,
): Promise<CsExternalPort[]> {
  const url = csUrl(cfg, `/r/report_queries/external_asset_ports_data?condition=asset_id=${assetId}`);
  const body = await csFetch<{ data?: CsExternalPort[]; status: boolean }>(cfg, session, url);
  return Array.isArray(body.data) ? body.data : [];
}

export interface CsExternalVuln {
  asset_id: number;
  key:      string;
  value:    string;
}

export async function csGetExternalVulns(
  cfg:     CsConfig,
  session: { current: CsSession },
  assetId: number,
): Promise<CsExternalVuln[]> {
  const url = csUrl(cfg, `/r/report_queries/external_asset_vulnerabilities?condition=asset_id=${assetId}`);
  const body = await csFetch<{ data?: CsExternalVuln[]; status: boolean }>(cfg, session, url);
  return Array.isArray(body.data) ? body.data : [];
}

// ── Map external scan results → surface DB ────────────────────────────────────

export interface CsExternalMapResult {
  assets:   CsMappedAsset[];
  findings: CsMappedFinding[];
  ports:    CsMappedPort[];
}

export function csMapExternalToFindings(
  asset: CsExternalAsset,
  ports: CsExternalPort[],
  vulns: CsExternalVuln[],
): CsExternalMapResult {
  const assets:      CsMappedAsset[]   = [];
  const findings:    CsMappedFinding[] = [];
  const mappedPorts: CsMappedPort[]    = [];

  const hostname = asset.host_name || asset.name || '';
  const ip       = asset.ip || '';

  if (hostname) {
    assets.push({
      asset_type:  'subdomain',
      asset_value: hostname,
      hostname,
      ip:          ip || undefined,
      root_domain: hostname.split('.').slice(-2).join('.'),
      source:      'connectsecure',
      confidence:  'high',
      raw:         { grade: asset.grade, cs_id: asset.id },
    });
  }
  if (ip && ip !== hostname) {
    assets.push({
      asset_type:  'ipv4',
      asset_value: ip,
      ip,
      hostname:    hostname || undefined,
      source:      'connectsecure',
      confidence:  'high',
    });
  }

  for (const p of ports) {
    const port     = Number(p.port);
    const protocol = (p.protocol || 'tcp').toLowerCase();
    if (!port || isNaN(port)) continue;

    mappedPorts.push({
      port,
      host:           hostname || ip,
      ip:             ip || hostname,
      protocol,
      serviceName:    p.service || p.product || undefined,
      serviceVersion: p.extrainfo || undefined,
    });

    findings.push({
      provider:      'connectsecure',
      module:        'connectsecure',
      finding_type:  'open_port_exposed',
      severity:      portSeverity(port),
      title:         `Porta ${port}/${protocol} esposta su ${hostname || ip}`,
      description:   `${hostname || ip}: porta ${port}/${protocol} aperta${p.service ? ` — ${p.service}${p.product ? ' ' + p.product : ''}` : ''}.`,
      affected_asset: hostname || ip,
      ip:             ip || undefined,
      port,
      protocol,
      evidence:      { source: 'connectsecure', service: p.service, product: p.product, grade: asset.grade },
    });
  }

  const cveIds = vulns
    .map(v => v.key)
    .filter(k => /^CVE-\d{4}-\d+$/i.test(k))
    .map(k => k.toUpperCase());

  if (cveIds.length > 0) {
    findings.push({
      provider:      'connectsecure',
      module:        'connectsecure',
      finding_type:  'vulnerability_detected',
      severity:      gradeToSeverity(asset.grade),
      title:         `${cveIds.length} vulnerabilità rilevate su ${hostname || ip}`,
      description:   `Asset ${hostname || ip} (grade: ${asset.grade || 'N/A'}). CVE: ${cveIds.slice(0, 5).join(', ')}${cveIds.length > 5 ? ` +${cveIds.length - 5}` : ''}.`,
      affected_asset: hostname || ip,
      ip:             ip || undefined,
      cve:           cveIds,
      evidence:      {
        grade:     asset.grade,
        critical:  asset.critical,
        high:      asset.high,
        medium:    asset.medium,
        low:       asset.low,
        vul_count: asset.vul_count,
      },
    });
  }

  return { assets, findings, ports: mappedPorts };
}

function gradeToSeverity(grade?: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  if (!grade) return 'info';
  const g = grade.toUpperCase();
  if (g === 'F' || g === 'D') return 'critical';
  if (g === 'C')              return 'high';
  if (g === 'B')              return 'medium';
  return 'info';
}
