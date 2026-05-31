import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_PROFILES = [
  "safe_recon",
  "domain_exposure",
  "ip_exposure",
  "cve_api_validation",
] as const;

export type ScanProfile = (typeof ALLOWED_PROFILES)[number];
export type TargetType = "domain" | "subdomain" | "url" | "ipv4" | "ipv6";

export interface NormalizedTarget {
  raw_target: string;
  normalized_target: string;
  target_type: TargetType;
  hostname: string | null;
  root_domain: string | null;
  protocol: string | null;
  port: number | null;
}

export interface CallerProfile {
  authUserId: string;
  email: string;
  userType: string;
  organizationId: string | null;
  canManageAllOrganizations: boolean;
  isSuperAdmin: boolean;
  isAdminLike: boolean;
}

export type OrganizationServiceKind = "hicompliance" | "surface_scan360" | "dark_risk360";

export interface OrganizationServiceRuntimeFlags {
  hicompliance_enabled?: boolean | null;
  surface_scan360_enabled?: boolean | null;
  dark_risk360_enabled?: boolean | null;
  services_paused?: boolean | null;
  services_paused_at?: string | null;
  services_pause_reason?: string | null;
  hicompliance_contract_start?: string | null;
  hicompliance_contract_years?: number | null;
  surface_scan_contract_start?: string | null;
  surface_scan_contract_years?: number | null;
  dark_risk_contract_start?: string | null;
  dark_risk_contract_years?: number | null;
}

export interface OrganizationServiceGateDecision {
  allowed: boolean;
  code:
    | "ok"
    | "service_disabled"
    | "services_paused"
    | "contract_not_started"
    | "contract_expired";
  reason: string;
  contract_start: string | null;
  contract_end: string | null;
}

export interface HostScopeClassification {
  host: string;
  normalizedHost: string;
  inScope: boolean;
  isLikelySharedNoise: boolean;
  blocked: boolean;
  reason: string | null;
}

export interface MonitoredScopeRule {
  entry_type: string;
  input_value: string;
  ip_start: string;
  ip_end: string;
}

export type ScopeExclusionReason =
  | "scope_excluded_domain"
  | "scope_excluded_ip"
  | "scope_excluded_shared_noise";

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const BLOCKED_HOSTS = new Set(["localhost"]);
const BLOCKED_SCHEMES = new Set(["file:", "ftp:", "ws:", "wss:"]);
const SALES_LOCK_EMAIL = "sales@sales.com";
const SALES_LOCK_ORG_CODE = "cliente1";

export const isAllowedProfile = (profile: string): profile is ScanProfile =>
  (ALLOWED_PROFILES as readonly string[]).includes(profile);

function parseDateOnly(value: string | null | undefined): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const asIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
  const parsed = new Date(asIsoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function addYearsSafe(value: Date, years: number): Date {
  const copy = new Date(value.getTime());
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

export function evaluateOrganizationServiceGate(
  org: OrganizationServiceRuntimeFlags | null | undefined,
  service: OrganizationServiceKind,
  now: Date = new Date(),
): OrganizationServiceGateDecision {
  const row = (org || {}) as OrganizationServiceRuntimeFlags;
  if (Boolean(row.services_paused)) {
    return {
      allowed: false,
      code: "services_paused",
      reason: row.services_pause_reason
        ? `Servizi in pausa: ${row.services_pause_reason}`
        : "Servizi in pausa per questo cliente",
      contract_start: null,
      contract_end: null,
    };
  }

  const isEnabled = (() => {
    if (service === "hicompliance") return Boolean(row.hicompliance_enabled);
    if (service === "surface_scan360") return Boolean(row.surface_scan360_enabled);
    return Boolean(row.dark_risk360_enabled);
  })();

  if (!isEnabled) {
    return {
      allowed: false,
      code: "service_disabled",
      reason: "Servizio disabilitato per questo cliente",
      contract_start: null,
      contract_end: null,
    };
  }

  const contractStartRaw = (() => {
    if (service === "hicompliance") return row.hicompliance_contract_start;
    if (service === "surface_scan360") return row.surface_scan_contract_start;
    return row.dark_risk_contract_start;
  })();
  const contractYearsRaw = (() => {
    if (service === "hicompliance") return row.hicompliance_contract_years;
    if (service === "surface_scan360") return row.surface_scan_contract_years;
    return row.dark_risk_contract_years;
  })();

  const contractStartDate = parseDateOnly(contractStartRaw);
  const contractYears = Number(contractYearsRaw ?? 0);

  // Backward compatibility: legacy customers without explicit contract window remain active.
  if (!contractStartDate || !Number.isFinite(contractYears) || contractYears <= 0) {
    return {
      allowed: true,
      code: "ok",
      reason: "Servizio attivo (finestra legacy senza scadenza esplicita)",
      contract_start: null,
      contract_end: null,
    };
  }

  const contractEndDate = addYearsSafe(contractStartDate, Math.floor(contractYears));
  const contractStartIso = contractStartDate.toISOString();
  const contractEndIso = contractEndDate.toISOString();

  if (now.getTime() < contractStartDate.getTime()) {
    return {
      allowed: false,
      code: "contract_not_started",
      reason: "Contratto non ancora avviato",
      contract_start: contractStartIso,
      contract_end: contractEndIso,
    };
  }

  if (now.getTime() >= contractEndDate.getTime()) {
    return {
      allowed: false,
      code: "contract_expired",
      reason: "Contratto scaduto",
      contract_start: contractStartIso,
      contract_end: contractEndIso,
    };
  }

  return {
    allowed: true,
    code: "ok",
    reason: "Servizio attivo in finestra contrattuale",
    contract_start: contractStartIso,
    contract_end: contractEndIso,
  };
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function isValidIPv4(value: string): boolean {
  return IPV4_REGEX.test(value);
}

function normalizeIp(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function ipv4ToNumber(ip: string): number | null {
  if (!isValidIPv4(ip)) return null;
  const [a, b, c, d] = ip.split(".").map((entry) => Number(entry));
  if ([a, b, c, d].some((entry) => Number.isNaN(entry))) return null;
  return (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
}

export function isIpInRange(ip: string, ipStart: string, ipEnd: string): boolean {
  const normalizedIp = normalizeIp(ip);
  const normalizedStart = normalizeIp(ipStart);
  const normalizedEnd = normalizeIp(ipEnd);
  if (!normalizedIp || !normalizedStart || !normalizedEnd) return false;

  if (normalizedIp.includes(":") || normalizedStart.includes(":") || normalizedEnd.includes(":")) {
    return normalizedIp === normalizedStart && normalizedIp === normalizedEnd;
  }

  const current = ipv4ToNumber(normalizedIp);
  const start = ipv4ToNumber(normalizedStart);
  const end = ipv4ToNumber(normalizedEnd);
  if (current === null || start === null || end === null) return false;
  return current >= start && current <= end;
}

export function isIpWithinMonitoredScope(ip: string, scopeRules: MonitoredScopeRule[]): boolean {
  const candidate = normalizeIp(ip);
  if (!candidate) return false;

  for (const rule of scopeRules) {
    const entryType = String(rule?.entry_type || "").toLowerCase();
    const inputValue = normalizeIp(rule?.input_value || "");
    const ipStart = normalizeIp(rule?.ip_start || "");
    const ipEnd = normalizeIp(rule?.ip_end || "");

    if (!["single", "range", "cidr"].includes(entryType)) continue;

    if (candidate.includes(":")) {
      if (entryType === "single" && (candidate === inputValue || candidate === ipStart)) {
        return true;
      }
      continue;
    }

    if (entryType === "single") {
      if (candidate === ipStart || candidate === inputValue) return true;
      continue;
    }

    if (isIpInRange(candidate, ipStart, ipEnd)) return true;
  }

  return false;
}

export function splitMonitoredScopeRules(rows: MonitoredScopeRule[]): {
  scopeDomains: string[];
  ipScopeRules: MonitoredScopeRule[];
} {
  const scopeDomains: string[] = [];
  const ipScopeRules: MonitoredScopeRule[] = [];

  for (const row of rows || []) {
    const entryType = String(row?.entry_type || "").toLowerCase();
    const inputValue = String(row?.input_value || "").trim().toLowerCase();
    if (entryType === "domain" && inputValue) {
      scopeDomains.push(inputValue);
      continue;
    }
    if (["single", "range", "cidr"].includes(entryType)) {
      ipScopeRules.push({
        entry_type: entryType,
        input_value: inputValue,
        ip_start: String(row?.ip_start || "").trim().toLowerCase(),
        ip_end: String(row?.ip_end || "").trim().toLowerCase(),
      });
    }
  }

  return {
    scopeDomains: [...new Set(scopeDomains)],
    ipScopeRules,
  };
}

export function classifyTargetScope(
  target: NormalizedTarget,
  scopeDomains: string[],
  ipScopeRules: MonitoredScopeRule[],
): {
  allowed: boolean;
  code: "ok" | "target_out_of_scope_domain" | "target_out_of_scope_ip" | "target_out_of_scope_shared_noise";
  reason: ScopeExclusionReason | null;
} {
  const host = normalizeHost(target.hostname || "");
  if (!host) {
    return {
      allowed: false,
      code: "target_out_of_scope_domain",
      reason: "scope_excluded_domain",
    };
  }

  const isIpLikeHost = isValidIPv4(host) || host.includes(":");
  if (target.target_type === "ipv4" || target.target_type === "ipv6" || isIpLikeHost) {
    const allowedIp = isIpWithinMonitoredScope(host, ipScopeRules);
    return {
      allowed: allowedIp,
      code: allowedIp ? "ok" : "target_out_of_scope_ip",
      reason: allowedIp ? null : "scope_excluded_ip",
    };
  }

  const hostClassification = classifyHostForScope(host, scopeDomains);
  if (hostClassification.blocked) {
    return {
      allowed: false,
      code: "target_out_of_scope_shared_noise",
      reason: "scope_excluded_shared_noise",
    };
  }

  if (!hostClassification.inScope) {
    return {
      allowed: false,
      code: "target_out_of_scope_domain",
      reason: "scope_excluded_domain",
    };
  }

  return {
    allowed: true,
    code: "ok",
    reason: null,
  };
}

function ipv4ToOctets(ip: string): number[] {
  return ip.split(".").map((v) => Number(v));
}

function isPrivateOrBlockedIpv4(ip: string): boolean {
  if (!isValidIPv4(ip)) return false;
  const [a, b] = ipv4ToOctets(ip);

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 224) return true;
  if (a >= 240) return true;
  if (ip === "169.254.169.254") return true;
  return false;
}

function isLikelyIpv6(value: string): boolean {
  return value.includes(":");
}

function isPrivateOrBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  return false;
}

function isWildcardDomain(value: string): boolean {
  return value.startsWith("*.");
}

function hasCidr(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.includes("://")) return false;
  return /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(trimmed) || /^[a-fA-F0-9:]+\/\d{1,3}$/.test(trimmed);
}

function isDomainLike(value: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
}

function normalizeHost(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "");
}

function normalizeScopeDomain(value: string): string {
  return normalizeHost(value).replace(/^www\./, "");
}

const SHARED_NOISE_PATTERNS: RegExp[] = [
  /^net-\d{1,3}(?:-\d{1,3}){3}\./i,
  /^host-\d{1,3}(?:-\d{1,3}){3}\./i,
  /^dyn-\d{1,3}(?:-\d{1,3}){3}\./i,
  /^webx\d+\./i,
  /\bcust\b/i,
  /\bdsl\b/i,
  /\bpppoe\b/i,
  /\bpool\b/i,
  /\bdynamic\b/i,
];

const SHARED_NOISE_SUFFIXES = [
  "aruba.it",
  "vodafonedsl.it",
  "teletu.it",
  "fastwebnet.it",
  "alice.it",
  "tim.it",
  "tiscali.it",
];

export function isHostWithinScope(hostname: string, scopeDomains: string[]): boolean {
  const host = normalizeScopeDomain(hostname);
  if (!host) return false;
  for (const rawDomain of scopeDomains) {
    const scopeDomain = normalizeScopeDomain(rawDomain);
    if (!scopeDomain) continue;
    if (host === scopeDomain || host.endsWith(`.${scopeDomain}`)) {
      return true;
    }
  }
  return false;
}

export function classifyHostForScope(
  hostname: string,
  scopeDomains: string[] = [],
): HostScopeClassification {
  const normalizedHost = normalizeHost(hostname);
  const inScope = isHostWithinScope(normalizedHost, scopeDomains);
  const matchesPattern = SHARED_NOISE_PATTERNS.some((pattern) => pattern.test(normalizedHost));
  const matchesSuffix = SHARED_NOISE_SUFFIXES.some(
    (suffix) => normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`),
  );
  const isLikelySharedNoise = matchesPattern || matchesSuffix;
  const blocked = isLikelySharedNoise && !inScope;
  const reason = blocked ? "shared_or_noise_host_out_of_scope" : null;
  return {
    host: hostname,
    normalizedHost,
    inScope,
    isLikelySharedNoise,
    blocked,
    reason,
  };
}

function getRootDomain(hostname: string): string | null {
  const parts = hostname.split(".");
  if (parts.length < 2) return null;

  const twoLabelPublicSuffixes = new Set([
    "co.uk",
    "org.uk",
    "gov.uk",
    "ac.uk",
    "com.au",
    "com.br",
    "co.jp",
    "co.in",
  ]);

  const suffix2 = parts.slice(-2).join(".");
  const suffix3 = parts.slice(-3).join(".");

  if (parts.length >= 3 && twoLabelPublicSuffixes.has(suffix2)) {
    return suffix3;
  }

  return suffix2;
}

function parsePotentialUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function normalizeTargetInput(rawInput: string): NormalizedTarget {
  const raw = (rawInput || "").trim();
  if (!raw) {
    throw new Error("Target obbligatorio");
  }

  if (isWildcardDomain(raw)) {
    throw new Error("Wildcard domain non supportato in v1");
  }
  if (hasCidr(raw)) {
    throw new Error("CIDR non supportato in v1");
  }

  let directUrl = parsePotentialUrl(raw);
  if (!directUrl && !raw.includes("://") && /[\/:?]/.test(raw)) {
    directUrl = parsePotentialUrl(`https://${raw}`);
  }
  if (directUrl) {
    if (BLOCKED_SCHEMES.has(directUrl.protocol)) {
      throw new Error("Schema non consentito");
    }
    if (directUrl.protocol !== "http:" && directUrl.protocol !== "https:") {
      throw new Error("Sono consentiti solo target HTTP/HTTPS");
    }

    const hostname = normalizeHostname(directUrl.hostname);
    if (BLOCKED_HOSTS.has(hostname)) {
      throw new Error("Target localhost non consentito");
    }

    if (isValidIPv4(hostname) && isPrivateOrBlockedIpv4(hostname)) {
      throw new Error("Target IPv4 privato/interno non consentito");
    }
    if (isLikelyIpv6(hostname) && isPrivateOrBlockedIpv6(hostname)) {
      throw new Error("Target IPv6 privato/interno non consentito");
    }

    const targetType: TargetType = isValidIPv4(hostname)
      ? "ipv4"
      : isLikelyIpv6(hostname)
        ? "ipv6"
        : (hostname.split(".").length > 2 ? "subdomain" : "domain");

    return {
      raw_target: raw,
      normalized_target: directUrl.toString(),
      target_type: "url",
      hostname,
      root_domain: isDomainLike(hostname) ? getRootDomain(hostname) : null,
      protocol: directUrl.protocol,
      port: directUrl.port ? Number(directUrl.port) : null,
    };
  }

  const bare = normalizeHostname(raw);
  if (BLOCKED_HOSTS.has(bare)) {
    throw new Error("Target localhost non consentito");
  }

  if (isValidIPv4(bare)) {
    if (isPrivateOrBlockedIpv4(bare)) {
      throw new Error("Target IPv4 privato/interno non consentito");
    }
    return {
      raw_target: raw,
      normalized_target: `https://${bare}/`,
      target_type: "ipv4",
      hostname: bare,
      root_domain: null,
      protocol: "https:",
      port: null,
    };
  }

  if (isLikelyIpv6(bare)) {
    if (isPrivateOrBlockedIpv6(bare)) {
      throw new Error("Target IPv6 privato/interno non consentito");
    }
    return {
      raw_target: raw,
      normalized_target: `https://[${bare}]/`,
      target_type: "ipv6",
      hostname: bare,
      root_domain: null,
      protocol: "https:",
      port: null,
    };
  }

  if (!isDomainLike(bare)) {
    throw new Error("Formato target non valido");
  }

  const url = new URL(`https://${bare}`);
  return {
    raw_target: raw,
    normalized_target: `${url.toString()}`,
    target_type: bare.split(".").length > 2 ? "subdomain" : "domain",
    hostname: bare,
    root_domain: getRootDomain(bare),
    protocol: "https:",
    port: null,
  };
}

export function makeSupabaseClients(req: Request): {
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
} {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: { persistSession: false },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return { userClient, adminClient };
}

export async function getCallerProfile(
  adminClient: SupabaseClient,
  authUserId: string,
): Promise<CallerProfile> {
  const { data: userRow, error: userError } = await adminClient
    .from("users")
    .select("auth_user_id, email, user_type, organization_id")
    .eq("auth_user_id", authUserId)
    .single();

  if (userError || !userRow) {
    throw new Error("Profilo utente non trovato");
  }

  const [manageRes, roleRes] = await Promise.all([
    adminClient.rpc("can_manage_all_organizations", { _user_id: authUserId }),
    adminClient.rpc("has_role", { _user_id: authUserId, _role: "super_admin" }),
  ]);

  let callerOrganizationId = userRow.organization_id;
  const normalizedEmail = String(userRow.email || "").toLowerCase();
  if (normalizedEmail === SALES_LOCK_EMAIL) {
    const { data: salesOrg } = await adminClient
      .from("organizations")
      .select("id")
      .eq("code", SALES_LOCK_ORG_CODE)
      .maybeSingle();
    if (salesOrg?.id) {
      callerOrganizationId = salesOrg.id;
    }
  }

  return {
    authUserId,
    email: normalizedEmail,
    userType: userRow.user_type,
    organizationId: callerOrganizationId,
    canManageAllOrganizations: Boolean(manageRes.data),
    isSuperAdmin: Boolean(roleRes.data),
    isAdminLike: userRow.user_type === "admin" || Boolean(roleRes.data),
  };
}

export function assertCustomerAccess(
  caller: CallerProfile,
  customerId: string,
): void {
  const normalizedCustomerId = String(customerId || "").trim();
  const callerOrgId = String(caller.organizationId || "").trim();
  const isLockedSalesUser = caller.email === SALES_LOCK_EMAIL;

  if (isLockedSalesUser && callerOrgId !== normalizedCustomerId) {
    throw new Error("Accesso cliente non autorizzato");
  }

  const canAccess = caller.canManageAllOrganizations || callerOrgId === normalizedCustomerId;
  if (!canAccess) {
    throw new Error("Accesso cliente non autorizzato");
  }
}

export async function resolveWithDnsOverHttps(
  hostname: string,
  type: string,
): Promise<string[]> {
  const endpoint = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${encodeURIComponent(type)}`;
  const res = await fetch(endpoint, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) return [];
  const payload = await res.json();
  const answers = Array.isArray(payload?.Answer) ? payload.Answer : [];
  return answers
    .map((answer: any) => String(answer?.data || "").trim())
    .filter(Boolean)
    .map((value: string) => value.replace(/\.$/, ""));
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

interface SafeFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
}

interface SafeFetchResult {
  response: Response;
  finalUrl: string;
  redirects: string[];
}

type DnsJsonAnswer = {
  type?: number;
  data?: string;
};

type DnsJsonPayload = {
  AD?: boolean;
  Answer?: DnsJsonAnswer[];
  Authority?: DnsJsonAnswer[];
};

export interface DnssecStatusSummary {
  dnskey_present: boolean;
  ds_present: boolean;
  rrsig_present: boolean;
  authenticated_data: boolean;
  dnskey_records: DnsJsonAnswer[];
  ds_records: DnsJsonAnswer[];
}

export interface WhoisRdapSummary {
  domain: string | null;
  registrar: string | null;
  created: string | null;
  updated: string | null;
  expires: string | null;
  days_to_expiry: number | null;
  registration_valid: boolean;
  nameservers: string[];
  dnssec: "signed" | "unsigned" | null;
}

export interface HttpSecurityHeaderSummary {
  content_security_policy: boolean;
  strict_transport_security: boolean;
  x_content_type_options: boolean;
  x_frame_options_or_frame_ancestors: boolean;
  referrer_policy: boolean;
  permissions_policy: boolean;
  all_present: boolean;
  missing: string[];
}

export interface ThreatSignalSummary {
  safe_browsing_unsafe: boolean;
  urlhaus_listed: boolean;
  phishtank_verified: boolean;
  has_threat_match: boolean;
}

function isHostBlockedForSsrf(hostname: string): boolean {
  const normalizedHost = normalizeHostname(hostname);
  if (!normalizedHost) return true;
  if (BLOCKED_HOSTS.has(normalizedHost)) return true;
  if (isValidIPv4(normalizedHost)) {
    return isPrivateOrBlockedIpv4(normalizedHost);
  }
  if (isLikelyIpv6(normalizedHost)) {
    return isPrivateOrBlockedIpv6(normalizedHost);
  }
  return false;
}

async function assertHostResolvableToPublicIps(hostname: string): Promise<void> {
  if (!hostname || isHostBlockedForSsrf(hostname)) {
    throw new Error(`SSRF guard blocked hostname: ${hostname || "empty"}`);
  }

  if (isValidIPv4(hostname) || isLikelyIpv6(hostname)) {
    return;
  }

  const [aRecords, aaaaRecords] = await Promise.all([
    resolveWithDnsOverHttps(hostname, "A"),
    resolveWithDnsOverHttps(hostname, "AAAA"),
  ]);
  const resolvedIps = [...aRecords, ...aaaaRecords].map((entry) => normalizeIp(entry)).filter(Boolean);
  for (const ip of resolvedIps) {
    if (isHostBlockedForSsrf(ip)) {
      throw new Error(`SSRF guard blocked private resolution for ${hostname}: ${ip}`);
    }
  }
}

export async function fetchWithSsrfGuard(
  url: string,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, Number(options.timeoutMs)) : 10000;
  const maxRedirects = Number.isFinite(options.maxRedirects) ? Math.max(0, Number(options.maxRedirects)) : 10;
  const maxResponseBytes =
    Number.isFinite(options.maxResponseBytes) && Number(options.maxResponseBytes) > 0
      ? Number(options.maxResponseBytes)
      : 600000;

  const visited = new Set<string>();
  const redirects: string[] = [];
  let currentUrl = String(url || "").trim();

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (!currentUrl) throw new Error("SSRF guard: empty URL");
    if (visited.has(currentUrl)) throw new Error("SSRF guard: redirect loop detected");
    visited.add(currentUrl);

    const parsed = new URL(currentUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`SSRF guard blocked scheme: ${parsed.protocol}`);
    }

    await assertHostResolvableToPublicIps(parsed.hostname);

    const response = await fetchWithTimeout(currentUrl, { ...init, redirect: "manual" }, timeoutMs);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      throw new Error(`Response too large (${contentLength} bytes > ${maxResponseBytes})`);
    }

    const location = response.headers.get("location");
    const isRedirectStatus = [301, 302, 303, 307, 308].includes(response.status);
    if (isRedirectStatus && location) {
      if (hop >= maxRedirects) {
        throw new Error("SSRF guard: max redirects exceeded");
      }
      const nextUrl = new URL(location, currentUrl).toString();
      redirects.push(nextUrl);
      currentUrl = nextUrl;
      continue;
    }

    return {
      response,
      finalUrl: currentUrl,
      redirects,
    };
  }

  throw new Error("SSRF guard: redirect resolution failed");
}

function asDnsAnswers(payload: unknown): DnsJsonAnswer[] {
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as DnsJsonPayload).Answer;
  return Array.isArray(value) ? value : [];
}

function asDnsAuthority(payload: unknown): DnsJsonAnswer[] {
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as DnsJsonPayload).Authority;
  return Array.isArray(value) ? value : [];
}

function parseRdapEventDate(events: unknown, eventAction: string | string[]): string | null {
  if (!Array.isArray(events)) return null;
  const accepted = (Array.isArray(eventAction) ? eventAction : [eventAction])
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean);
  if (accepted.length === 0) return null;

  const row = events.find((entry: any) =>
    accepted.includes(String(entry?.eventAction || "").trim().toLowerCase())
  ) as Record<string, unknown> | undefined;
  const rawDate = String(row?.eventDate || "").trim();
  return rawDate || null;
}

function extractWhoisValue(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = String(match?.[1] || "").trim();
    if (value) return value;
  }
  return null;
}

function normalizeWhoisDate(value: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\s+\(.*?\)\s*$/, "").trim();
  const parsedMs = Date.parse(cleaned);
  if (!Number.isFinite(parsedMs)) return cleaned || null;
  return new Date(parsedMs).toISOString();
}

function normalizeHeaderMap(
  headers: Record<string, string | null | undefined>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (!key) continue;
    const normalizedKey = key.trim().toLowerCase();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    normalized[normalizedKey] = normalizedValue;
  }
  return normalized;
}

export function summarizeDnssecStatus(
  dnskeyPayload: unknown,
  dsPayload: unknown,
  aPayload: unknown = {},
): DnssecStatusSummary {
  const dnskeyAnswers = asDnsAnswers(dnskeyPayload).filter((row) => Number(row?.type) === 48);
  const dsAnswers = asDnsAnswers(dsPayload).filter((row) => Number(row?.type) === 43);
  const rrsigPresent =
    [...asDnsAnswers(dnskeyPayload), ...asDnsAnswers(dsPayload), ...asDnsAnswers(aPayload), ...asDnsAuthority(aPayload)]
      .some((row) => Number(row?.type) === 46);
  const authenticatedData =
    Boolean((dnskeyPayload as DnsJsonPayload)?.AD) ||
    Boolean((dsPayload as DnsJsonPayload)?.AD) ||
    Boolean((aPayload as DnsJsonPayload)?.AD);

  return {
    dnskey_present: dnskeyAnswers.length > 0,
    ds_present: dsAnswers.length > 0,
    rrsig_present: rrsigPresent,
    authenticated_data: authenticatedData,
    dnskey_records: dnskeyAnswers.slice(0, 10),
    ds_records: dsAnswers.slice(0, 10),
  };
}

export function summarizeWhoisRdap(payload: unknown, nowMs = Date.now()): WhoisRdapSummary {
  const data = (payload && typeof payload === "object") ? payload as Record<string, unknown> : {};
  const events = Array.isArray(data.events) ? data.events : [];

  const nameservers = Array.isArray(data.nameservers)
    ? data.nameservers
      .map((entry: any) => String(entry?.ldhName || entry?.unicodeName || "").trim().toLowerCase())
      .filter(Boolean)
    : [];

  const registrarEntity = (Array.isArray(data.entities) ? data.entities : []).find((entry: any) =>
    Array.isArray(entry?.roles) && entry.roles.some((role: any) => String(role || "").toLowerCase() === "registrar")
  );

  const registrarName = (() => {
    const fallbackRegistrarText = String(data?.registrar || data?.name || "").trim();
    const vcard = Array.isArray((registrarEntity as any)?.vcardArray) ? (registrarEntity as any).vcardArray[1] : [];
    if (!Array.isArray(vcard)) return fallbackRegistrarText || null;
    const fnEntry = vcard.find((entry: any) => Array.isArray(entry) && String(entry?.[0] || "").toLowerCase() === "fn");
    if (!Array.isArray(fnEntry)) return fallbackRegistrarText || null;
    const candidate = String(fnEntry?.[3] || "").trim();
    return candidate || fallbackRegistrarText || null;
  })();

  const created = parseRdapEventDate(events, ["registration", "registered", "creation", "created"]);
  const updated = parseRdapEventDate(events, ["last changed", "last changed date", "last update"]);
  const expires = parseRdapEventDate(events, ["expiration", "expiry", "expires", "expiration date"]);
  const expirationMs = expires ? Date.parse(expires) : Number.NaN;
  const daysToExpiry = Number.isFinite(expirationMs)
    ? Math.round((expirationMs - nowMs) / 86400000)
    : null;

  const secureDnsSigned = (data.secureDNS as Record<string, unknown> | undefined)?.delegationSigned;
  const rootDomain = String(data.ldhName || data.handle || "").trim().toLowerCase() || null;

  return {
    domain: rootDomain,
    registrar: registrarName,
    created,
    updated,
    expires,
    days_to_expiry: daysToExpiry,
    registration_valid: daysToExpiry === null ? false : daysToExpiry >= 0,
    nameservers,
    dnssec: secureDnsSigned === true ? "signed" : secureDnsSigned === false ? "unsigned" : null,
  };
}

export function summarizeWhoisText(
  rawText: string,
  fallbackDomain: string | null = null,
  nowMs = Date.now(),
): WhoisRdapSummary {
  const text = String(rawText || "").replace(/\r/g, "\n");
  const domain = (() => {
    const domainRaw = extractWhoisValue(text, [
      /^\s*Domain Name:\s*(.+)$/im,
      /^\s*domain:\s*(.+)$/im,
      /^\s*Domain:\s*(.+)$/im,
    ]) || fallbackDomain;
    const cleaned = String(domainRaw || "").trim().toLowerCase().replace(/\.$/, "");
    return cleaned || null;
  })();

  const registrar = extractWhoisValue(text, [
    /^\s*Registrar:\s*(.+)$/im,
    /^\s*Sponsoring Registrar:\s*(.+)$/im,
    /^\s*registrar:\s*(.+)$/im,
  ]);

  const created = normalizeWhoisDate(extractWhoisValue(text, [
    /^\s*Domain Creation Date:\s*(.+)$/im,
    /^\s*Creation Date:\s*(.+)$/im,
    /^\s*Created On:\s*(.+)$/im,
    /^\s*created:\s*(.+)$/im,
  ]));

  const updated = normalizeWhoisDate(extractWhoisValue(text, [
    /^\s*Domain Updated Date:\s*(.+)$/im,
    /^\s*Updated Date:\s*(.+)$/im,
    /^\s*Last Updated On:\s*(.+)$/im,
    /^\s*changed:\s*(.+)$/im,
  ]));

  const expires = normalizeWhoisDate(extractWhoisValue(text, [
    /^\s*Domain Registry Expiration Date:\s*(.+)$/im,
    /^\s*Registrar Registration Expiration Date:\s*(.+)$/im,
    /^\s*Registry Expiry Date:\s*(.+)$/im,
    /^\s*Expiration Date:\s*(.+)$/im,
    /^\s*Expiry Date:\s*(.+)$/im,
    /^\s*Expires On:\s*(.+)$/im,
    /^\s*paid-till:\s*(.+)$/im,
    /^\s*expire:\s*(.+)$/im,
  ]));

  const nameservers = Array.from(
    text.matchAll(/^\s*(?:Name Server|Nameserver):\s*([^\s#]+)\s*$/gim),
  )
    .map((match) => String(match?.[1] || "").trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);

  const dnssecRaw = extractWhoisValue(text, [
    /^\s*DNSSEC:\s*(.+)$/im,
    /^\s*dnssec:\s*(.+)$/im,
  ]);

  let dnssec: "signed" | "unsigned" | null = null;
  if (dnssecRaw) {
    const normalized = dnssecRaw.toLowerCase();
    if (normalized.includes("unsigned") || normalized.includes("not signed") || normalized === "false") {
      dnssec = "unsigned";
    } else if (normalized.includes("signed")) {
      dnssec = "signed";
    }
  }

  const expirationMs = expires ? Date.parse(expires) : Number.NaN;
  const daysToExpiry = Number.isFinite(expirationMs)
    ? Math.round((expirationMs - nowMs) / 86400000)
    : null;

  return {
    domain,
    registrar: registrar || null,
    created,
    updated,
    expires,
    days_to_expiry: daysToExpiry,
    registration_valid: daysToExpiry === null ? false : daysToExpiry >= 0,
    nameservers,
    dnssec,
  };
}

export function evaluateHttpSecurityHeaders(
  headers: Record<string, string | null | undefined>,
): HttpSecurityHeaderSummary {
  const normalized = normalizeHeaderMap(headers);
  const csp = normalized["content-security-policy"] || "";
  const xfo = normalized["x-frame-options"] || "";
  const hasCsp = Boolean(csp);
  const hasHsts = Boolean(normalized["strict-transport-security"]);
  const hasXcto = Boolean(normalized["x-content-type-options"]);
  const hasFrameProtection = Boolean(xfo) || /frame-ancestors/i.test(csp);
  const hasReferrer = Boolean(normalized["referrer-policy"]);
  const hasPermissions = Boolean(normalized["permissions-policy"]);

  const missing: string[] = [];
  if (!hasCsp) missing.push("content-security-policy");
  if (!hasHsts) missing.push("strict-transport-security");
  if (!hasXcto) missing.push("x-content-type-options");
  if (!hasFrameProtection) missing.push("x-frame-options/frame-ancestors");
  if (!hasReferrer) missing.push("referrer-policy");
  if (!hasPermissions) missing.push("permissions-policy");

  return {
    content_security_policy: hasCsp,
    strict_transport_security: hasHsts,
    x_content_type_options: hasXcto,
    x_frame_options_or_frame_ancestors: hasFrameProtection,
    referrer_policy: hasReferrer,
    permissions_policy: hasPermissions,
    all_present: missing.length === 0,
    missing,
  };
}

export function summarizeThreatSignals(input: {
  safeBrowsingMatches?: unknown[];
  urlHausListed?: boolean;
  phishTank?: {
    inDatabase?: boolean;
    valid?: boolean;
    verified?: boolean;
  } | null;
}): ThreatSignalSummary {
  const safeBrowsingUnsafe = Array.isArray(input.safeBrowsingMatches) && input.safeBrowsingMatches.length > 0;
  const urlhausListed = Boolean(input.urlHausListed);
  const phishtankVerified =
    Boolean(input.phishTank?.verified) ||
    (Boolean(input.phishTank?.inDatabase) && Boolean(input.phishTank?.valid));
  const hasThreatMatch = safeBrowsingUnsafe || urlhausListed || phishtankVerified;

  return {
    safe_browsing_unsafe: safeBrowsingUnsafe,
    urlhaus_listed: urlhausListed,
    phishtank_verified: phishtankVerified,
    has_threat_match: hasThreatMatch,
  };
}

export function toSeverity(value: string): "info" | "low" | "medium" | "high" | "critical" {
  const normalized = (value || "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  if (normalized === "low") return "low";
  return "info";
}
