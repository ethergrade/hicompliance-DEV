import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import {
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from "../_shared/surface-scan-utils.ts";

type NucleiProfile =
  | "baseline_headers"
  | "exposure_medium"
  | "web_vuln_safe"
  | "web_cve_recent"
  | "web_cve_2026"
  | "web_cve_2025"
  | "web_cve_2024"
  | "web_cve_2023"
  | "web_cve_2022"
  | "web_vuln_authorized";

type NucleiAction =
  | "direct_scan"
  | "enqueue"
  | "start_lab_scan"
  | "list"
  | "get"
  | "retrieve_targets"
  | "process_queue"
  | "smoke_test";

type RequestBody = {
  action?: NucleiAction;
  organization_id?: string;
  job_id?: string;
  target_url?: string;
  targets?: string[];
  nmap_profile?: NmapProfile;
  include_surface_assets?: boolean;
  include_discovered_targets?: boolean;
  surface_asset_limit?: number;
  target_limit?: number;
  profile?: NucleiProfile;
  timeout_seconds?: number;
  rate_limit?: number;
  max_findings?: number;
  authorized_scan?: boolean;
  limit?: number;
  request_id?: string;
};

type NucleiFinding = {
  template_id?: string;
  name?: string | null;
  severity?: string | null;
  type?: string | null;
  matched_at?: string | null;
  matcher_name?: string | null;
  extracted_results?: unknown[];
  tags?: unknown[];
  [key: string]: unknown;
};

type NucleiResult = {
  target_url?: string;
  resolved_target_url?: string;
  profile?: NucleiProfile;
  findings?: NucleiFinding[];
  warnings?: unknown[];
  duration_ms?: number;
  nuclei_version?: string;
  templates_loaded_count?: number;
  templates_executed_count?: number;
  debug_summary?: Record<string, unknown>;
  [key: string]: unknown;
};

type NmapProfile = "web_top" | "tcp_top_100" | "service_light" | "custom_tcp";

type NmapPort = {
  host?: string | null;
  hostname?: string | null;
  protocol?: string | null;
  port?: number | string | null;
  state?: string | null;
  service?: string | null;
  product?: string | null;
  version?: string | null;
  extrainfo?: string | null;
  cpe?: unknown[];
  [key: string]: unknown;
};

type TechnologyFingerprint = {
  url?: string | null;
  host?: string | null;
  port?: number | string | null;
  protocol?: string | null;
  status_code?: number | string | null;
  title?: string | null;
  webserver?: string | null;
  content_type?: string | null;
  content_length?: number | string | null;
  response_time?: string | null;
  favicon_hash?: string | number | null;
  technologies?: Array<{
    name?: string | null;
    version?: string | null;
    source?: string | null;
    confidence?: "high" | "medium" | "low" | string | null;
    category?: string | null;
    evidence?: Record<string, unknown> | null;
    [key: string]: unknown;
  }>;
  raw?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type NmapHost = {
  address?: string | null;
  hostname?: string | null;
  open_ports?: NmapPort[];
  [key: string]: unknown;
};

type NmapResult = {
  target?: string;
  profile?: NmapProfile;
  hosts?: NmapHost[];
  open_ports?: NmapPort[];
  open_port_count?: number;
  warnings?: unknown[];
  duration_ms?: number;
  nmap_version?: string;
  httpx_version?: string;
  nmap_command_sanitized?: string;
  fingerprint_status?: string;
  fingerprint_duration_ms?: number;
  fingerprint_warnings?: unknown[];
  technology_fingerprints?: TechnologyFingerprint[];
  technology_count?: number;
  [key: string]: unknown;
};

type NiktoFinding = {
  nikto_id?: string | null;
  severity?: string | null;
  category?: string | null;
  method?: string | null;
  uri?: string | null;
  message?: string | null;
  references?: unknown[];
  host?: string | null;
  ip?: string | null;
  port?: number | string | null;
  tls?: boolean | null;
  raw_finding?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type NiktoResult = {
  target_url?: string;
  resolved_target_url?: string;
  target_host?: string;
  target_port?: number;
  profile?: string;
  tuning?: string;
  findings?: NiktoFinding[];
  findings_count?: number;
  summary?: Record<string, unknown>;
  warnings?: unknown[];
  duration_ms?: number;
  nikto_version?: string;
  nikto_command_sanitized?: string;
  raw_result?: Record<string, unknown>;
  [key: string]: unknown;
};

type NiktoAggregateResult = {
  target_urls: string[];
  results: NiktoResult[];
  findings: Array<NiktoFinding & { target_url?: string | null }>;
  findings_count: number;
  warnings: string[];
  duration_ms: number;
  nikto_version: string | null;
  status: "completed" | "completed_with_warnings" | "skipped" | "failed";
  summary: Record<string, unknown>;
};

type OpenPortRow = {
  id: string;
  job_id?: string;
  host?: string | null;
  hostname?: string | null;
  protocol?: string | null;
  port?: number | null;
  service?: string | null;
  product?: string | null;
  version?: string | null;
  extrainfo?: string | null;
  cpe?: string[] | null;
  url_candidates?: string[] | null;
  raw_port?: Record<string, unknown> | null;
};

type TechnologyRow = {
  id: string;
  job_id?: string;
  port_id?: string | null;
  url?: string | null;
  asset_host?: string | null;
  port?: number | null;
  name?: string | null;
  version?: string | null;
  source?: string | null;
  confidence?: string | null;
  cpe_candidates?: string[] | null;
  raw_technology?: Record<string, unknown> | null;
};

type NvdCveDetails = {
  cve_id: string;
  description: string | null;
  severity: string | null;
  cvss_score: number | null;
  cvss_vector: string | null;
  cvss_version: string | null;
  nvd_status: string | null;
  published_at: string | null;
  last_modified_at: string | null;
  cpe_json?: unknown[];
  references_json?: unknown[];
  raw?: unknown;
};

type ScanPayload = {
  target_url: string;
  profile: NucleiProfile;
  timeout_seconds: number;
  rate_limit: number;
  max_findings: number;
  authorized_scan: boolean;
};

type NucleiJob = {
  id: string;
  organization_id: string;
  customer_id: string;
  target_url: string;
  normalized_target_url: string;
  target_host?: string | null;
  target_input?: string | null;
  target_kind?: string | null;
  nmap_target?: string | null;
  nmap_profile?: NmapProfile | null;
  stage?: string | null;
  next_run_at?: string | null;
  raw_nmap_result?: Record<string, unknown> | null;
  profile: NucleiProfile;
  authorized_scan: boolean;
  timeout_seconds: number;
  rate_limit: number;
  max_findings: number;
  status: string;
  attempt_count: number;
  started_at?: string | null;
};

type PipelineTarget = {
  targetInput: string;
  targetUrl: string;
  normalizedTargetUrl: string;
  nmapTarget: string;
  targetHost: string;
  targetKind: "domain" | "subdomain" | "url" | "ipv4" | "ipv4_cidr";
};

type ScannableTarget = {
  target_url: string;
  value: string;
  host: string;
  kind: "domain" | "subdomain" | "url" | "ipv4" | "ipv4_cidr";
  source: string;
  label: string;
  confidence: "high" | "medium" | "low";
};

type TraceContext = {
  requestId: string;
  action: NucleiAction;
  organizationId: string;
  startedAt: number;
  profile?: NucleiProfile;
  targetCount: number;
};

type SmokeCheck = {
  name: string;
  ok: boolean;
  status?: number;
  message?: string;
  details?: Record<string, unknown>;
  duration_ms?: number;
};

const ALLOWED_PROFILES = new Set<NucleiProfile>([
  "baseline_headers",
  "exposure_medium",
  "web_vuln_safe",
  "web_cve_recent",
  "web_cve_2026",
  "web_cve_2025",
  "web_cve_2024",
  "web_cve_2023",
  "web_cve_2022",
  "web_vuln_authorized",
]);

const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
];

const HTTP_ACTION_TIMEOUT_SECONDS = 165;
const NUCLEI_WAIT_MINUTES = 8;
const NIKTO_ACTION_TIMEOUT_SECONDS = 150;
const NVD_CVES_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const NVD_MAX_CPE_QUERIES_PER_JOB = 8;
const NVD_MAX_CVES_PER_CPE = 20;
const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const IPV4_REGEX = /^(\d{1,3})(?:\.(\d{1,3})){3}$/;
const IPV4_CIDR_REGEX = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/;
const CVE_REGEX = /\bCVE-\d{4}-\d{4,}\b/gi;
const WEB_PORT_PROTOCOLS: Record<number, "http" | "https"> = {
  80: "http",
  443: "https",
  8080: "http",
  8443: "https",
  8000: "http",
  3000: "http",
  5000: "http",
  9443: "https",
};
const ALLOWED_NMAP_PROFILES = new Set<NmapProfile>(["web_top", "tcp_top_100", "service_light", "custom_tcp"]);
const INTERNAL_ALLOWED_ACTIONS = new Set<NucleiAction>([
  "process_queue",
  "smoke_test",
  "retrieve_targets",
  "list",
  "get",
  "start_lab_scan",
]);
const nucleiCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-nuclei-scan360-request-id`,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const SURFACE_TARGET_ASSET_TYPES = [
  "domain",
  "subdomain",
  "url",
  "hostname",
  "host",
  "fqdn",
  "ip",
  "ipv4",
  "ipv6",
  "mx",
  "mx_host",
  "ns",
  "ns_host",
  "cname",
  "cname_host",
  "a",
  "aaaa",
];
const DARKRISK_TARGET_ASSET_TYPES = [
  "domain",
  "subdomain",
  "url",
  "host",
  "ip",
  "mx",
  "ns",
];
const DARKRISK_SELECTOR_TARGET_TYPES = [
  "domain",
  "wildcard_domain",
  "url",
  "ipv4",
  "ipv6",
];
const MANUAL_TARGET_TYPES = [
  "domain",
  "subdomain",
  "url",
  "hostname",
  "ip",
  "ipv4",
];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...nucleiCorsHeaders },
  });

const sanitizeRequestId = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return crypto.randomUUID();
  return raw.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 96) || crypto.randomUUID();
};

const countRequestedTargets = (body: RequestBody) =>
  Number(Boolean(body.target_url)) + (Array.isArray(body.targets) ? body.targets.filter(Boolean).length : 0);

function parseQueryRequestBody(req: Request): RequestBody {
  const url = new URL(req.url);
  const body: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (["include_discovered_targets", "authorized_scan", "include_surface_assets"].includes(key)) {
      body[key] = /^(1|true|yes)$/i.test(value);
    } else if (["surface_asset_limit", "target_limit", "timeout_seconds", "rate_limit", "max_findings", "limit"].includes(key)) {
      body[key] = Number(value);
    } else if (key === "targets") {
      body[key] = value.split(/[\n,;]+/).map((target) => target.trim()).filter(Boolean);
    } else {
      body[key] = value;
    }
  }
  return body as RequestBody;
}

function traceLog(ctx: TraceContext, status: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    event: "nuclei_scan360",
    request_id: ctx.requestId,
    action: ctx.action,
    organization_id: ctx.organizationId || null,
    profile: ctx.profile || null,
    target_count: ctx.targetCount,
    status,
    duration_ms: Date.now() - ctx.startedAt,
    ...extra,
  }));
}

const tracedJsonResponse = (ctx: TraceContext, body: Record<string, unknown>, status = 200) =>
  jsonResponse({ request_id: ctx.requestId, ...body }, status);

function isInternalRequest(req: Request): boolean {
  const authHeader = String(req.headers.get("authorization") || "").trim();
  const apikey = String(req.headers.get("apikey") || "").trim();
  const surfaceSecretHeader = String(req.headers.get("x-surface-internal-secret") || "").trim();
  const nucleiSecretHeader = String(req.headers.get("x-nuclei-scan360-internal-secret") || "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const surfaceSecret = String(Deno.env.get("SURFACESCAN_INTERNAL_SECRET") || Deno.env.get("SURFACESCAN_CRON_INTERNAL_SECRET") || "").trim();
  const nucleiSecret = String(Deno.env.get("NUCLEI_SCAN360_INTERNAL_SECRET") || "").trim();
  return Boolean(serviceRoleKey && (authHeader === `Bearer ${serviceRoleKey}` || apikey === serviceRoleKey))
    || Boolean(surfaceSecret && surfaceSecretHeader === surfaceSecret)
    || Boolean(nucleiSecret && nucleiSecretHeader === nucleiSecret);
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeTargetUrl(value: unknown): string {
  const raw = String(value || "").trim().replace(/^\*\./, "");
  if (!raw) throw new Error("target_url is required");
  if (!/^https?:\/\//i.test(raw) && raw.includes("@")) {
    return normalizeTargetUrl(raw.split("@").pop());
  }
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  url.hash = "";
  url.username = "";
  url.password = "";
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http/https targets are allowed");
  }

  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "[::1]") {
    throw new Error("Local targets are not allowed");
  }
  if (PRIVATE_IPV4_RANGES.some((range) => range.test(host))) {
    throw new Error("Private IPv4 targets are not allowed");
  }

  return url.toString();
}

function normalizeIpv4(value: unknown): string {
  const raw = String(value || "").trim();
  if (!IPV4_REGEX.test(raw)) return "";
  const parts = raw.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return "";
  return parts.join(".");
}

function isPrivateIpv4(value: string): boolean {
  return PRIVATE_IPV4_RANGES.some((range) => range.test(value));
}

function normalizePipelineTarget(value: unknown): PipelineTarget {
  const raw = String(value || "").trim().replace(/^\*\./, "").replace(/\.$/, "");
  if (!raw) throw new Error("target is required");

  if (/^https?:\/\//i.test(raw)) {
    const targetUrl = normalizeTargetUrl(raw);
    const url = new URL(targetUrl);
    const host = url.hostname.toLowerCase();
    const ip = normalizeIpv4(host);
    return {
      targetInput: raw,
      targetUrl,
      normalizedTargetUrl: targetUrl,
      nmapTarget: host,
      targetHost: host,
      targetKind: ip ? "ipv4" : host.split(".").length > 2 ? "subdomain" : "url",
    };
  }

  const cidr = raw.toLowerCase().match(IPV4_CIDR_REGEX);
  if (cidr) {
    const ip = normalizeIpv4(cidr[1]);
    const prefix = Number(cidr[2]);
    if (!ip || isPrivateIpv4(ip) || prefix < 24 || prefix > 32) {
      throw new Error("Only public IPv4 CIDR targets /24 or smaller are allowed");
    }
    return {
      targetInput: raw,
      targetUrl: raw,
      normalizedTargetUrl: `cidr:${ip}/${prefix}`,
      nmapTarget: `${ip}/${prefix}`,
      targetHost: ip,
      targetKind: "ipv4_cidr",
    };
  }

  const ip = normalizeIpv4(raw);
  if (ip) {
    if (isPrivateIpv4(ip)) throw new Error("Private IPv4 targets are not allowed");
    return {
      targetInput: raw,
      targetUrl: `https://${ip}/`,
      normalizedTargetUrl: `https://${ip}/`,
      nmapTarget: ip,
      targetHost: ip,
      targetKind: "ipv4",
    };
  }

  const domain = normalizeDomainCandidate(raw);
  if (!domain) throw new Error("Target must be a public IP, CIDR, domain or HTTP URL");
  return {
    targetInput: raw,
    targetUrl: `https://${domain}/`,
    normalizedTargetUrl: `https://${domain}/`,
    nmapTarget: domain,
    targetHost: domain,
    targetKind: domain.split(".").length > 2 ? "subdomain" : "domain",
  };
}

function normalizeTargetInputToken(value: unknown): string {
  const cleaned = String(value || "")
    .trim()
    .replace(/^[`'"]+/, "")
    .replace(/[`'"]+$/, "")
    .trim();
  return /^[`'".,;\s]+$/.test(cleaned) ? "" : cleaned;
}

function normalizeProfile(value: unknown): NucleiProfile {
  const profile = String(value || "web_cve_recent").trim() as NucleiProfile;
  if (!ALLOWED_PROFILES.has(profile)) throw new Error("Unsupported Nuclei profile");
  return profile;
}

function normalizeNmapProfile(value: unknown): NmapProfile {
  const profile = String(value || "service_light").trim() as NmapProfile;
  if (!ALLOWED_NMAP_PROFILES.has(profile)) throw new Error("Unsupported Nmap profile");
  return profile;
}

function isCveProfile(profile: NucleiProfile): boolean {
  return profile === "web_vuln_safe" || profile.startsWith("web_cve_");
}

function normalizeOptions(body: RequestBody): Omit<ScanPayload, "target_url"> {
  const profile = normalizeProfile(body.profile);
  const authorizedScan = body.authorized_scan === true;
  if (profile === "web_vuln_authorized" && !authorizedScan) {
    throw new Error("authorized_scan=true is required for web_vuln_authorized");
  }
  const defaultTimeout = profile === "baseline_headers" ? 45 : isCveProfile(profile) ? 150 : 120;
  const defaultRate = profile === "web_vuln_authorized" ? 2 : isCveProfile(profile) ? 3 : 5;
  return {
    profile,
    timeout_seconds: clampInt(body.timeout_seconds, defaultTimeout, 15, 180),
    rate_limit: clampInt(body.rate_limit, defaultRate, 1, profile === "web_vuln_authorized" ? 2 : 10),
    max_findings: clampInt(body.max_findings, isCveProfile(profile) ? 50 : 25, 1, 200),
    authorized_scan: authorizedScan,
  };
}

function getTargetHost(targetUrl: string): string {
  try {
    return new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeDomainCandidate(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase()
    .replace(/^\*\./, "")
    .replace(/\.$/, "");
  if (!raw || raw.length > 253) return "";
  if (raw.includes("@")) return normalizeDomainCandidate(raw.split("@").pop());
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return normalizeDomainCandidate(url.hostname);
  } catch {
    // continue with raw hostname validation
  }
  if (!DOMAIN_REGEX.test(raw)) return "";
  if (raw === "localhost" || raw.endsWith(".localhost")) return "";
  if (PRIVATE_IPV4_RANGES.some((range) => range.test(raw))) return "";
  return raw;
}

function classifyTargetKind(value: string, explicitType?: unknown): "domain" | "subdomain" | "url" {
  const type = String(explicitType || "").toLowerCase();
  if (type === "url" || /^https?:\/\//i.test(value)) return "url";
  if (type === "subdomain") return "subdomain";
  const host = normalizeDomainCandidate(value);
  return host.split(".").length > 2 ? "subdomain" : "domain";
}

function classifyScannableTargetKind(
  value: string,
  host: string,
  explicitType?: unknown,
): ScannableTarget["kind"] {
  const type = String(explicitType || "").toLowerCase();
  if (type.includes("cidr") || IPV4_CIDR_REGEX.test(value)) return "ipv4_cidr";
  if (type === "ip" || type === "ipv4" || normalizeIpv4(host)) return "ipv4";
  return classifyTargetKind(value, explicitType);
}

function toScannableTarget(
  value: unknown,
  source: string,
  label: string,
  explicitType?: unknown,
  confidence: ScannableTarget["confidence"] = "medium",
): ScannableTarget | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const cidr = raw.toLowerCase().match(IPV4_CIDR_REGEX);
  if (cidr) {
    const ip = normalizeIpv4(cidr[1]);
    const prefix = Number(cidr[2]);
    if (!ip || isPrivateIpv4(ip) || prefix < 24 || prefix > 32) return null;
    const target = `${ip}/${prefix}`;
    return {
      target_url: target,
      value: raw,
      host: target,
      kind: "ipv4_cidr",
      source,
      label,
      confidence,
    };
  }

  const ip = normalizeIpv4(raw);
  if (ip) {
    if (isPrivateIpv4(ip)) return null;
    return {
      target_url: ip,
      value: raw,
      host: ip,
      kind: "ipv4",
      source,
      label,
      confidence,
    };
  }

  const normalizedTargetUrl = normalizeTargetUrl(raw);
  const host = getTargetHost(normalizedTargetUrl);
  const hostIp = normalizeIpv4(host);
  const domain = hostIp ? hostIp : normalizeDomainCandidate(host);
  if (!domain) return null;
  return {
    target_url: normalizedTargetUrl,
    value: raw,
    host,
    kind: classifyScannableTargetKind(raw, host, explicitType),
    source,
    label,
    confidence,
  };
}

function pushTarget(
  targets: Map<string, ScannableTarget>,
  value: unknown,
  source: string,
  label: string,
  explicitType?: unknown,
  confidence: ScannableTarget["confidence"] = "medium",
) {
  try {
    const target = toScannableTarget(value, source, label, explicitType, confidence);
    if (!target) return;
    const existing = targets.get(target.target_url);
    if (!existing || existing.confidence === "low") {
      targets.set(target.target_url, target);
    }
  } catch {
    // Ignore noisy inventory values that are not valid public HTTP targets.
  }
}

function isHostInRootScope(host: string, rootDomain?: unknown): boolean {
  const root = normalizeDomainCandidate(rootDomain);
  if (!root) return true;
  return host === root || host.endsWith(`.${root}`);
}

function pushScopedTarget(
  targets: Map<string, ScannableTarget>,
  value: unknown,
  source: string,
  label: string,
  explicitType?: unknown,
  confidence: ScannableTarget["confidence"] = "medium",
  rootDomain?: unknown,
) {
  try {
    const target = toScannableTarget(value, source, label, explicitType, confidence);
    if (!target || !isHostInRootScope(target.host, rootDomain)) return;
    const existing = targets.get(target.target_url);
    if (!existing || existing.confidence === "low") {
      targets.set(target.target_url, target);
    }
  } catch {
    // Ignore noisy inventory values that are not valid public HTTP targets.
  }
}

function getServiceConfig() {
  const serviceUrl = String(Deno.env.get("NUCLEI_SCAN360_SERVICE_URL") || "").replace(/\/+$/, "");
  const sharedSecret = String(Deno.env.get("NUCLEI_SCAN360_SHARED_SECRET") || "").trim();
  if (!serviceUrl || !sharedSecret) {
    throw new Error("NucleiScan360 service is not configured");
  }
  return { serviceUrl, sharedSecret };
}

function getNmapServiceConfig() {
  const serviceUrl = String(Deno.env.get("NMAP_SCAN360_SERVICE_URL") || "").replace(/\/+$/, "");
  const sharedSecret = String(Deno.env.get("NMAP_SCAN360_SHARED_SECRET") || "").trim();
  if (!serviceUrl || !sharedSecret) {
    throw new Error("Nmap Scan360 service is not configured");
  }
  return { serviceUrl, sharedSecret };
}

function getNiktoServiceConfig() {
  const serviceUrl = String(Deno.env.get("NIKTO_SCAN360_SERVICE_URL") || "").replace(/\/+$/, "");
  const sharedSecret = String(Deno.env.get("NIKTO_SCAN360_SHARED_SECRET") || "").trim();
  if (!serviceUrl || !sharedSecret) {
    throw new Error("Nikto Scan360 service is not configured");
  }
  return { serviceUrl, sharedSecret };
}

function classifyFinding(finding: NucleiFinding): string {
  const tags = (Array.isArray(finding.tags) ? finding.tags : []).map((tag) => String(tag || "").toLowerCase());
  if (tags.includes("cve")) return "CVE";
  if (tags.includes("ssl") || tags.includes("tls")) return "TLS/SSL";
  if (tags.includes("misconfig") || tags.includes("misconfiguration")) return "Misconfiguration";
  if (tags.includes("exposure") || tags.includes("exposures")) return "Exposure";
  if (tags.includes("tech") || tags.includes("technology")) return "Technology";
  if (tags.includes("panel")) return "Exposed panel";
  if (tags.includes("vuln")) return "Vulnerability";
  return finding.type ? String(finding.type).toUpperCase() : "Other";
}

function extractAssetHost(matchedAt: unknown): string {
  const raw = String(matchedAt || "").trim();
  if (!raw) return "unknown";
  try {
    return new URL(raw).hostname || raw;
  } catch {
    return raw.replace(/^https?:\/\//, "").split("/")[0] || raw;
  }
}

function buildSummary(result: NucleiResult): Record<string, unknown> {
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const severityCounts = findings.reduce<Record<string, number>>((acc, finding) => {
    const severity = String(finding.severity || "info").toLowerCase();
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {});
  const categories = findings.reduce<Record<string, number>>((acc, finding) => {
    const category = classifyFinding(finding);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const assets = Array.from(new Set(findings.map((finding) => extractAssetHost(finding.matched_at)))).filter(Boolean);
  return {
    severity_counts: severityCounts,
    categories,
    assets_count: assets.length,
    assets: assets.slice(0, 50),
  };
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function extractCveIds(value: unknown): string[] {
  const text = typeof value === "string" ? value : JSON.stringify(value || {});
  return uniqueStrings((text.match(CVE_REGEX) || []).map((cve) => cve.toUpperCase()));
}

function extractFindingCves(finding: NucleiFinding): string[] {
  return extractCveIds({
    template_id: finding.template_id,
    name: finding.name,
    tags: finding.tags,
    matcher_name: finding.matcher_name,
    matched_at: finding.matched_at,
    extracted_results: finding.extracted_results,
    raw: finding,
  });
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function inferCvssScore(finding: NucleiFinding): number | null {
  const info = (finding.info || {}) as Record<string, unknown>;
  const classification = (info.classification || finding.classification || {}) as Record<string, unknown>;
  return firstNumber(
    finding.cvss_score,
    finding.cvss,
    classification.cvss_score,
    classification["cvss-score"],
    classification.cvss,
  );
}

function inferEpssScore(finding: NucleiFinding): number | null {
  const info = (finding.info || {}) as Record<string, unknown>;
  const classification = (info.classification || finding.classification || {}) as Record<string, unknown>;
  return firstNumber(
    finding.epss_score,
    finding.epss,
    classification.epss_score,
    classification["epss-score"],
    classification.epss,
  );
}

function inferKevKnownExploited(finding: NucleiFinding): boolean {
  const text = JSON.stringify(finding || {}).toLowerCase();
  return text.includes("known-exploited") || text.includes("kev") || text.includes("cisa-kev");
}

function getNvdApiKey(): string {
  return String(Deno.env.get("NVD_API_KEY") || "").trim();
}

async function fetchNvdJson(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const headers: HeadersInit = {};
  const apiKey = getNvdApiKey();
  if (apiKey) headers.apiKey = apiKey;
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`nvd_http_${response.status}`);
    const data = await response.json();
    return data && typeof data === "object" ? data as Record<string, unknown> : {};
  } finally {
    clearTimeout(timer);
  }
}

function nvdMetric(cve: Record<string, unknown>): {
  severity: string | null;
  score: number | null;
  vector: string | null;
  version: string | null;
} {
  const metrics = (cve.metrics || {}) as Record<string, unknown>;
  const pick = (name: string, version: string) => {
    const rows = Array.isArray(metrics[name]) ? metrics[name] as Record<string, unknown>[] : [];
    const metric = rows[0] || {};
    const cvssData = (metric.cvssData || {}) as Record<string, unknown>;
    return {
      severity: cvssData.baseSeverity ? String(cvssData.baseSeverity) : metric.baseSeverity ? String(metric.baseSeverity) : null,
      score: firstNumber(cvssData.baseScore),
      vector: cvssData.vectorString ? String(cvssData.vectorString) : null,
      version,
    };
  };

  const v31 = pick("cvssMetricV31", "3.1");
  if (v31.score !== null) return v31;
  const v30 = pick("cvssMetricV30", "3.0");
  if (v30.score !== null) return v30;
  const v2 = pick("cvssMetricV2", "2.0");
  return v2;
}

function parseNvdCveDetails(entry: unknown): NvdCveDetails | null {
  const wrapper = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
  const cve = (wrapper.cve && typeof wrapper.cve === "object" ? wrapper.cve : wrapper) as Record<string, unknown>;
  const cveId = String(cve.id || "").toUpperCase();
  CVE_REGEX.lastIndex = 0;
  if (!CVE_REGEX.test(cveId)) return null;
  CVE_REGEX.lastIndex = 0;

  const descriptions = Array.isArray(cve.descriptions) ? cve.descriptions as Record<string, unknown>[] : [];
  const description = descriptions.find((item) => item.lang === "en")?.value || descriptions[0]?.value || null;
  const metric = nvdMetric(cve);
  const references = Array.isArray(cve.references) ? cve.references : [];
  const cpeJson: unknown[] = [];
  const configurations = Array.isArray(cve.configurations) ? cve.configurations as Record<string, unknown>[] : [];
  for (const config of configurations) {
    const nodes = Array.isArray(config.nodes) ? config.nodes as Record<string, unknown>[] : [];
    for (const node of nodes) {
      const cpeMatches = Array.isArray(node.cpeMatch) ? node.cpeMatch as Record<string, unknown>[] : [];
      for (const match of cpeMatches) {
        if (match.criteria) {
          cpeJson.push({ criteria: match.criteria, vulnerable: match.vulnerable === true });
        }
      }
    }
  }

  return {
    cve_id: cveId,
    description: description ? String(description) : null,
    severity: metric.severity ? metric.severity.toLowerCase() : null,
    cvss_score: metric.score,
    cvss_vector: metric.vector,
    cvss_version: metric.version,
    nvd_status: cve.vulnStatus ? String(cve.vulnStatus) : null,
    published_at: cve.published ? String(cve.published) : null,
    last_modified_at: cve.lastModified ? String(cve.lastModified) : null,
    cpe_json: cpeJson.slice(0, 100),
    references_json: references,
    raw: cve,
  };
}

async function fetchNvdCvesForCpe(cpe: string): Promise<NvdCveDetails[]> {
  const query = new URLSearchParams({
    cpeName: cpe,
    resultsPerPage: String(NVD_MAX_CVES_PER_CPE),
  });
  const data = await fetchNvdJson(`${NVD_CVES_BASE}?${query.toString()}&isVulnerable`);
  const vulnerabilities = Array.isArray(data.vulnerabilities) ? data.vulnerabilities : [];
  return vulnerabilities
    .map((entry) => parseNvdCveDetails(entry))
    .filter((entry): entry is NvdCveDetails => Boolean(entry));
}

function normalizeCpeForNvd(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const requireConcreteVersion = (cpe23: string) => {
    const parts = cpe23.split(":");
    const version = String(parts[5] || "").trim();
    return version && version !== "*" && version !== "-" ? cpe23 : "";
  };
  if (raw.startsWith("cpe:2.3:")) return requireConcreteVersion(raw);
  if (!raw.startsWith("cpe:/")) return "";
  const parts = raw.slice("cpe:/".length).split(":").map((part) => part || "*");
  if (parts.length < 4) return "";
  while (parts.length < 11) parts.push("*");
  return requireConcreteVersion(`cpe:2.3:${parts.slice(0, 11).join(":")}`);
}

function normalizeVersion(value: unknown): string {
  const version = String(value || "")
    .trim()
    .replace(/^v/i, "")
    .replace(/[^\w.+:-]/g, "")
    .slice(0, 80);
  return /\d/.test(version) ? version : "";
}

function cpePart(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\\:-]/g, "_")
    .slice(0, 120);
}

function technologyCpeCandidates(name: unknown, versionValue: unknown): string[] {
  const normalizedName = String(name || "").trim().toLowerCase();
  const version = normalizeVersion(versionValue);
  if (!normalizedName || !version) return [];

  const mappings: Array<{ patterns: RegExp[]; part: string; vendor: string; product: string }> = [
    { patterns: [/^apache(?: httpd)?$/, /^apache http server$/], part: "a", vendor: "apache", product: "http_server" },
    { patterns: [/^nginx$/], part: "a", vendor: "nginx", product: "nginx" },
    { patterns: [/^wordpress$/], part: "a", vendor: "wordpress", product: "wordpress" },
    { patterns: [/^php$/], part: "a", vendor: "php", product: "php" },
    { patterns: [/^openssl$/], part: "a", vendor: "openssl", product: "openssl" },
    { patterns: [/^openssh$/], part: "a", vendor: "openbsd", product: "openssh" },
    { patterns: [/^jquery$/], part: "a", vendor: "jquery", product: "jquery" },
  ];

  const mapping = mappings.find((entry) => entry.patterns.some((pattern) => pattern.test(normalizedName)));
  if (!mapping) return [];
  return [`cpe:2.3:${mapping.part}:${mapping.vendor}:${mapping.product}:${cpePart(version)}:*:*:*:*:*:*:*`];
}

function safeConfidence(value: unknown, fallback: "high" | "medium" | "low" = "low"): "high" | "medium" | "low" {
  const confidence = String(value || "").toLowerCase();
  if (confidence === "high" || confidence === "medium" || confidence === "low") return confidence;
  return fallback;
}

function portUrlMatches(port: OpenPortRow, url: string): boolean {
  if (!url) return false;
  const candidates = Array.isArray(port.url_candidates) ? port.url_candidates : [];
  return candidates.some((candidate) => String(candidate || "").replace(/\/+$/, "") === url.replace(/\/+$/, ""));
}

function findPortForFingerprint(fingerprint: TechnologyFingerprint, openPorts: OpenPortRow[]): OpenPortRow | null {
  const url = String(fingerprint.url || "").trim();
  const portNumber = Number(fingerprint.port);
  const host = String(fingerprint.host || "").trim().toLowerCase();
  return openPorts.find((port) => portUrlMatches(port, url))
    || openPorts.find((port) => portNumber && Number(port.port) === portNumber && (!host || String(port.hostname || port.host || "").toLowerCase() === host))
    || openPorts.find((port) => portNumber && Number(port.port) === portNumber)
    || null;
}

async function waitForNvdWindow() {
  await new Promise((resolve) => setTimeout(resolve, getNvdApiKey() ? 250 : 6500));
}

async function loadCveIntelCache(adminClient: SupabaseClient, cveIds: string[]) {
  const uniqueCves = uniqueStrings(cveIds.map((cve) => cve.toUpperCase())).slice(0, 100);
  if (uniqueCves.length === 0) return new Map<string, Record<string, unknown>>();
  const { data, error } = await adminClient
    .from("cve_intel_cache")
    .select("cve_id, description, cvss_v3_score, cvss_v3_vector, cvss_v3_severity, cvss_v2_score, cvss_v2_vector, epss_score, epss_percentile, cisa_kev, kev_date_added, kev_due_date, kev_required_action, published_at, last_modified_at, nvd_status, cpe_json, references_json, exploit_links")
    .in("cve_id", uniqueCves);
  if (error) return new Map<string, Record<string, unknown>>();
  return new Map((data || []).map((row: Record<string, unknown>) => [String(row.cve_id || "").toUpperCase(), row]));
}

function mergeCveMatchWithCache(match: Record<string, unknown>, cache: Record<string, unknown> | undefined) {
  if (!cache) return match;
  const cvssScore = match.cvss_score ?? cache.cvss_v3_score ?? cache.cvss_v2_score ?? null;
  return {
    ...match,
    severity: match.severity || (cache.cvss_v3_severity ? String(cache.cvss_v3_severity).toLowerCase() : null),
    description: match.description || cache.description || null,
    cvss_score: cvssScore,
    cvss_vector: match.cvss_vector || cache.cvss_v3_vector || cache.cvss_v2_vector || null,
    cvss_version: match.cvss_version || (cache.cvss_v3_score ? "3.x" : cache.cvss_v2_score ? "2.0" : null),
    epss_score: match.epss_score ?? cache.epss_score ?? null,
    epss_percentile: match.epss_percentile ?? cache.epss_percentile ?? null,
    kev_known_exploited: match.kev_known_exploited === true || cache.cisa_kev === true,
    published_at: match.published_at || cache.published_at || null,
    last_modified_at: match.last_modified_at || cache.last_modified_at || null,
    nvd_status: match.nvd_status || cache.nvd_status || null,
    cve_intel: cache,
  };
}

async function enrichCveMatchesForResponse(adminClient: SupabaseClient, matches: Record<string, unknown>[]) {
  const cache = await loadCveIntelCache(adminClient, matches.map((match) => String(match.cve_id || "")));
  return matches.map((match) => mergeCveMatchWithCache(match, cache.get(String(match.cve_id || "").toUpperCase())));
}

async function persistPotentialCveMatches(
  adminClient: SupabaseClient,
  job: NucleiJob,
  openPorts: OpenPortRow[],
): Promise<{ potential_count: number; cpe_count: number; warnings: string[] }> {
  const cpeToPorts = new Map<string, OpenPortRow[]>();
  for (const port of openPorts) {
    const cpes = Array.isArray(port.cpe) ? port.cpe : [];
    for (const rawCpe of cpes) {
      const cpe = normalizeCpeForNvd(rawCpe);
      if (!cpe) continue;
      cpeToPorts.set(cpe, [...(cpeToPorts.get(cpe) || []), port]);
    }
  }

  const cpes = Array.from(cpeToPorts.keys()).slice(0, NVD_MAX_CPE_QUERIES_PER_JOB);
  const warnings: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const [index, cpe] of cpes.entries()) {
    try {
      const cves = await fetchNvdCvesForCpe(cpe);
      const ports = cpeToPorts.get(cpe) || [];
      for (const cve of cves) {
        for (const port of ports) {
          const key = `${cve.cve_id}:${cpe}:${port.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            job_id: job.id,
            finding_id: null,
            port_id: port.id,
            organization_id: job.organization_id,
            customer_id: job.customer_id,
            asset_host: port.hostname || port.host || job.target_host || job.nmap_target || null,
            cve_id: cve.cve_id,
            severity: cve.severity,
            template_id: null,
            matched_at: port.port ? `${port.protocol || "tcp"}/${port.port}` : null,
            cvss_score: cve.cvss_score,
            epss_score: null,
            kev_known_exploited: false,
            source: "nvd_cpe",
            match_status: "potential",
            confidence: "medium",
            cpe,
            description: cve.description,
            nvd_status: cve.nvd_status,
            cvss_vector: cve.cvss_vector,
            cvss_version: cve.cvss_version,
            published_at: cve.published_at,
            last_modified_at: cve.last_modified_at,
            details: {
              source: "nvd_cpe",
              cpe,
              port,
              nvd: {
                references_json: cve.references_json,
                cpe_json: cve.cpe_json,
              },
            },
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`nvd_cpe:${cpe}:${message || "query_failed"}`);
    }
    if (index < cpes.length - 1) await waitForNvdWindow();
  }

  if (rows.length > 0) {
    const { error } = await adminClient.from("nuclei_scan360_cve_matches").insert(rows);
    if (error) warnings.push(`nvd_cpe_persist:${error.message || "insert_failed"}`);
    try {
      await adminClient.rpc("enqueue_cve_enrichment", {
        _org_id: job.organization_id,
        _cves: uniqueStrings(rows.map((row) => row.cve_id)),
        _source: "nuclei_scan360_nvd_cpe",
      });
    } catch {
      warnings.push("nvd_cpe_enrichment_queue_failed");
    }
  }

  return { potential_count: rows.length, cpe_count: cpes.length, warnings };
}

async function persistPotentialTechnologyCveMatches(
  adminClient: SupabaseClient,
  job: NucleiJob,
  technologies: TechnologyRow[],
): Promise<{ potential_count: number; cpe_count: number; warnings: string[] }> {
  const cpeToTechnologies = new Map<string, TechnologyRow[]>();
  for (const technology of technologies) {
    const cpes = Array.isArray(technology.cpe_candidates) ? technology.cpe_candidates : [];
    for (const rawCpe of cpes) {
      const cpe = normalizeCpeForNvd(rawCpe);
      if (!cpe) continue;
      cpeToTechnologies.set(cpe, [...(cpeToTechnologies.get(cpe) || []), technology]);
    }
  }

  const cpes = Array.from(cpeToTechnologies.keys()).slice(0, NVD_MAX_CPE_QUERIES_PER_JOB);
  const warnings: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const [index, cpe] of cpes.entries()) {
    try {
      const cves = await fetchNvdCvesForCpe(cpe);
      const technologyRows = cpeToTechnologies.get(cpe) || [];
      for (const cve of cves) {
        for (const technology of technologyRows) {
          const key = `${cve.cve_id}:${cpe}:${technology.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            job_id: job.id,
            finding_id: null,
            port_id: technology.port_id || null,
            organization_id: job.organization_id,
            customer_id: job.customer_id,
            asset_host: technology.asset_host || job.target_host || job.nmap_target || null,
            cve_id: cve.cve_id,
            severity: cve.severity,
            template_id: null,
            matched_at: technology.url || (technology.port ? `tcp/${technology.port}` : null),
            cvss_score: cve.cvss_score,
            epss_score: null,
            kev_known_exploited: false,
            source: "nvd_tech_cpe",
            match_status: "potential",
            confidence: "medium",
            cpe,
            description: cve.description,
            nvd_status: cve.nvd_status,
            cvss_vector: cve.cvss_vector,
            cvss_version: cve.cvss_version,
            published_at: cve.published_at,
            last_modified_at: cve.last_modified_at,
            details: {
              source: "nvd_tech_cpe",
              technology,
              cpe,
              nvd: {
                references_json: cve.references_json,
                cpe_json: cve.cpe_json,
              },
            },
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`nvd_tech_cpe:${cpe}:${message || "query_failed"}`);
    }
    if (index < cpes.length - 1) await waitForNvdWindow();
  }

  if (rows.length > 0) {
    const { error } = await adminClient.from("nuclei_scan360_cve_matches").insert(rows);
    if (error) warnings.push(`nvd_tech_cpe_persist:${error.message || "insert_failed"}`);
    try {
      await adminClient.rpc("enqueue_cve_enrichment", {
        _org_id: job.organization_id,
        _cves: uniqueStrings(rows.map((row) => row.cve_id)),
        _source: "nuclei_scan360_nvd_tech_cpe",
      });
    } catch {
      warnings.push("nvd_tech_cpe_enrichment_queue_failed");
    }
  }

  return { potential_count: rows.length, cpe_count: cpes.length, warnings };
}

async function persistTechnologyFingerprints(
  adminClient: SupabaseClient,
  job: NucleiJob,
  nmapResult: NmapResult,
  openPorts: OpenPortRow[],
): Promise<{ rows: TechnologyRow[]; warnings: string[] }> {
  await adminClient.from("nuclei_scan360_technologies").delete().eq("job_id", job.id);
  const fingerprints = Array.isArray(nmapResult.technology_fingerprints) ? nmapResult.technology_fingerprints : [];
  const rows: Record<string, unknown>[] = [];

  for (const fingerprint of fingerprints) {
    const technologies = Array.isArray(fingerprint.technologies) ? fingerprint.technologies : [];
    const matchedPort = findPortForFingerprint(fingerprint, openPorts);
    const url = fingerprint.url ? String(fingerprint.url) : null;
    const assetHost = fingerprint.host ? String(fingerprint.host) : matchedPort?.hostname || matchedPort?.host || job.target_host || null;
    const portNumber = Number(fingerprint.port || matchedPort?.port || 0);
    for (const technology of technologies) {
      const name = String(technology.name || "").trim();
      if (!name) continue;
      const version = normalizeVersion(technology.version) || null;
      const cpeCandidates = technologyCpeCandidates(name, version);
      rows.push({
        job_id: job.id,
        port_id: matchedPort?.id || null,
        organization_id: job.organization_id,
        customer_id: job.customer_id,
        url,
        asset_host: assetHost,
        port: Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535 ? portNumber : null,
        name,
        version,
        source: technology.source ? String(technology.source) : "httpx_wappalyzer",
        confidence: safeConfidence(technology.confidence, version ? "medium" : "low"),
        category: technology.category ? String(technology.category) : null,
        evidence: technology.evidence && typeof technology.evidence === "object" ? technology.evidence : {
          status_code: fingerprint.status_code ?? null,
          title: fingerprint.title || null,
          webserver: fingerprint.webserver || null,
          content_type: fingerprint.content_type || null,
          favicon_hash: fingerprint.favicon_hash || null,
        },
        cpe_candidates: cpeCandidates,
        raw_technology: {
          technology,
          fingerprint,
        },
      });
    }
  }

  if (rows.length === 0) return { rows: [], warnings: [] };
  const { data, error } = await adminClient
    .from("nuclei_scan360_technologies")
    .insert(rows)
    .select("id, job_id, port_id, url, asset_host, port, name, version, source, confidence, cpe_candidates, raw_technology");
  if (error) return { rows: [], warnings: [`technology_persist:${error.message || "insert_failed"}`] };
  return { rows: (data || []) as TechnologyRow[], warnings: [] };
}

function buildUrlCandidates(job: NucleiJob, nmapResult: NmapResult): string[] {
  const ports = Array.isArray(nmapResult.open_ports) ? nmapResult.open_ports : [];
  const fallbackHost = String(job.nmap_target || job.target_host || job.target_url || "").replace(/^https?:\/\//, "").split("/")[0];
  const candidates: string[] = [];
  for (const port of ports) {
    const portNumber = Number(port.port);
    if (!Number.isInteger(portNumber) || !WEB_PORT_PROTOCOLS[portNumber]) continue;
    const host = String(port.hostname || port.host || fallbackHost || "").trim();
    if (!host) continue;
    const protocol = WEB_PORT_PROTOCOLS[portNumber];
    const defaultPort = protocol === "https" ? 443 : 80;
    const portSuffix = portNumber === defaultPort ? "" : `:${portNumber}`;
    candidates.push(`${protocol}://${host}${portSuffix}/`);
  }

  if (candidates.length === 0 && /^https?:\/\//i.test(job.normalized_target_url)) {
    candidates.push(job.normalized_target_url);
  }

  return uniqueStrings(candidates).slice(0, 8);
}

function buildNiktoUrlCandidates(job: NucleiJob, nmapResult: NmapResult): string[] {
  const candidates = buildUrlCandidates(job, nmapResult)
    .filter((candidate) => /^https?:\/\//i.test(candidate));
  const targetHost = String(job.target_host || job.nmap_target || "").toLowerCase();
  return uniqueStrings(candidates)
    .sort((a, b) => {
      const aUrl = new URL(a);
      const bUrl = new URL(b);
      const aHostMatch = targetHost && aUrl.hostname.toLowerCase() === targetHost ? -1 : 0;
      const bHostMatch = targetHost && bUrl.hostname.toLowerCase() === targetHost ? -1 : 0;
      if (aHostMatch !== bHostMatch) return aHostMatch - bHostMatch;
      if (aUrl.protocol !== bUrl.protocol) return aUrl.protocol === "https:" ? -1 : 1;
      return a.localeCompare(b);
    })
    .slice(0, 2);
}

function buildPortUrlCandidates(port: NmapPort, fallbackHost: string): string[] {
  const portNumber = Number(port.port);
  const protocol = WEB_PORT_PROTOCOLS[portNumber];
  if (!protocol) return [];
  const host = String(port.hostname || port.host || fallbackHost || "").trim();
  if (!host) return [];
  const defaultPort = protocol === "https" ? 443 : 80;
  const portSuffix = portNumber === defaultPort ? "" : `:${portNumber}`;
  return [`${protocol}://${host}${portSuffix}/`];
}

function safeSeverity(value: unknown): "critical" | "high" | "medium" | "low" | "info" {
  const severity = String(value || "info").toLowerCase();
  if (severity === "critical" || severity === "high" || severity === "medium" || severity === "low" || severity === "info") return severity;
  return "info";
}

function safeNiktoCategory(value: unknown): string {
  return String(value || "web_exposure").trim().slice(0, 80) || "web_exposure";
}

function parsePortFromUrl(value: unknown): number | null {
  try {
    const url = new URL(String(value || ""));
    if (url.port) return Number(url.port);
    return url.protocol === "https:" ? 443 : url.protocol === "http:" ? 80 : null;
  } catch {
    return null;
  }
}

function parseHostFromUrl(value: unknown): string {
  try {
    return new URL(String(value || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function summarizeNiktoAggregate(results: NiktoResult[], findings: NiktoAggregateResult["findings"]) {
  const bySeverity = findings.reduce<Record<string, number>>((acc, finding) => {
    const severity = safeSeverity(finding.severity);
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {});
  const byCategory = findings.reduce<Record<string, number>>((acc, finding) => {
    const category = safeNiktoCategory(finding.category);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  return {
    by_severity: bySeverity,
    by_category: byCategory,
    targets_scanned: results.map((result) => result.target_url).filter(Boolean),
  };
}

async function runNiktoForCandidates(candidates: string[], timeoutSeconds: number, maxFindings: number): Promise<NiktoAggregateResult> {
  const startedAt = Date.now();
  if (candidates.length === 0) {
    return {
      target_urls: [],
      results: [],
      findings: [],
      findings_count: 0,
      warnings: ["nikto_no_web_url_candidates"],
      duration_ms: Date.now() - startedAt,
      nikto_version: null,
      status: "skipped",
      summary: { by_severity: {}, by_category: {}, targets_scanned: [] },
    };
  }

  const settled = await Promise.allSettled(candidates.map((targetUrl) => callNiktoService({
    target_url: targetUrl,
    timeout_seconds: timeoutSeconds,
    max_findings: maxFindings,
  })));
  const results: NiktoResult[] = [];
  const warnings: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason || "nikto_failed");
      warnings.push(`nikto:${candidates[index]}:${message.slice(0, 180)}`);
    }
  });

  const findings = results.flatMap((result) => {
    const targetUrl = result.target_url || result.resolved_target_url || null;
    return (Array.isArray(result.findings) ? result.findings : []).map((finding) => ({ ...finding, target_url: targetUrl }));
  });
  const allWarnings = uniqueStrings([
    ...warnings,
    ...results.flatMap((result) => Array.isArray(result.warnings) ? result.warnings : []),
  ]);
  const status = results.length === 0 ? "failed" : allWarnings.length > 0 ? "completed_with_warnings" : "completed";
  return {
    target_urls: candidates,
    results,
    findings,
    findings_count: findings.length,
    warnings: allWarnings,
    duration_ms: Date.now() - startedAt,
    nikto_version: results.find((result) => result.nikto_version)?.nikto_version || null,
    status,
    summary: summarizeNiktoAggregate(results, findings),
  };
}

async function persistNmapResult(adminClient: SupabaseClient, job: NucleiJob, nmapResult: NmapResult) {
  const ports = Array.isArray(nmapResult.open_ports) ? nmapResult.open_ports : [];
  const fallbackHost = String(job.nmap_target || job.target_url || "").replace(/^https?:\/\//, "").split("/")[0];
  await adminClient.from("nuclei_scan360_open_ports").delete().eq("job_id", job.id);
  await adminClient.from("nuclei_scan360_cve_matches").delete().eq("job_id", job.id).eq("match_status", "potential");
  let insertedOpenPorts: OpenPortRow[] = [];

  if (ports.length > 0) {
    const rows = ports.map((port) => ({
      job_id: job.id,
      organization_id: job.organization_id,
      customer_id: job.customer_id,
      host: port.host ? String(port.host) : null,
      hostname: port.hostname ? String(port.hostname) : null,
      protocol: port.protocol ? String(port.protocol) : "tcp",
      port: Number(port.port),
      state: port.state ? String(port.state) : "open",
      service: port.service ? String(port.service) : null,
      product: port.product ? String(port.product) : null,
      version: port.version ? String(port.version) : null,
      extrainfo: port.extrainfo ? String(port.extrainfo) : null,
      cpe: Array.isArray(port.cpe) ? port.cpe.map((entry) => String(entry || "")).filter(Boolean) : [],
      url_candidates: buildPortUrlCandidates(port, fallbackHost),
      raw_port: port,
    })).filter((row) => Number.isInteger(row.port) && row.port >= 1 && row.port <= 65535);

    if (rows.length > 0) {
      const { data: insertedRows, error: insertError } = await adminClient
        .from("nuclei_scan360_open_ports")
        .insert(rows)
        .select("id, job_id, host, hostname, protocol, port, service, product, version, extrainfo, cpe, url_candidates, raw_port");
      if (insertError) throw new Error(insertError.message || "Unable to persist Nmap open ports");
      insertedOpenPorts = (insertedRows || []) as OpenPortRow[];
    }
  }

  const technologyResult = await persistTechnologyFingerprints(adminClient, job, nmapResult, insertedOpenPorts);
  const nvdCpeResult = await persistPotentialCveMatches(adminClient, job, insertedOpenPorts);
  const nvdTechnologyResult = await persistPotentialTechnologyCveMatches(adminClient, job, technologyResult.rows);
  const candidates = buildUrlCandidates(job, nmapResult);
  const warnings = uniqueStrings([
    ...(Array.isArray(nmapResult.warnings) ? nmapResult.warnings : []),
    ...(Array.isArray(nmapResult.fingerprint_warnings) ? nmapResult.fingerprint_warnings : []),
    ...technologyResult.warnings,
    ...nvdCpeResult.warnings,
    ...nvdTechnologyResult.warnings,
  ]);
  const { error: updateError } = await adminClient
    .from("nuclei_scan360_jobs")
    .update({
      stage: "nikto_running",
      status: "running",
      nmap_status: "completed",
      nmap_completed_at: new Date().toISOString(),
      nmap_duration_ms: Number.isFinite(Number(nmapResult.duration_ms)) ? Math.round(Number(nmapResult.duration_ms)) : null,
      nmap_version: nmapResult.nmap_version || null,
      open_port_count: Number.isFinite(Number(nmapResult.open_port_count)) ? Math.round(Number(nmapResult.open_port_count)) : ports.length,
      fingerprint_status: nmapResult.fingerprint_status || null,
      fingerprint_duration_ms: Number.isFinite(Number(nmapResult.fingerprint_duration_ms)) ? Math.round(Number(nmapResult.fingerprint_duration_ms)) : null,
      technology_count: technologyResult.rows.length,
      nmap_warnings: warnings,
      raw_technology_result: {
        httpx_version: nmapResult.httpx_version || null,
        fingerprint_status: nmapResult.fingerprint_status || null,
        fingerprint_duration_ms: nmapResult.fingerprint_duration_ms || null,
        fingerprint_warnings: nmapResult.fingerprint_warnings || [],
        technology_fingerprints: nmapResult.technology_fingerprints || [],
        technology_count: technologyResult.rows.length,
        nvd_tech_cpe: {
          cpe_count: nvdTechnologyResult.cpe_count,
          potential_count: nvdTechnologyResult.potential_count,
          warning_count: nvdTechnologyResult.warnings.length,
        },
      },
      raw_nmap_result: {
        ...nmapResult,
        nuclei_url_candidates: candidates,
        nvd_cpe_cve: {
          cpe_count: nvdCpeResult.cpe_count,
          potential_count: nvdCpeResult.potential_count,
          warning_count: nvdCpeResult.warnings.length,
        },
        nvd_tech_cpe: {
          cpe_count: nvdTechnologyResult.cpe_count,
          potential_count: nvdTechnologyResult.potential_count,
          warning_count: nvdTechnologyResult.warnings.length,
        },
      },
      nikto_status: "queued",
      next_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (updateError) throw new Error(updateError.message || "Unable to update Nmap stage");
}

async function persistNiktoResult(adminClient: SupabaseClient, job: NucleiJob, niktoResult: NiktoAggregateResult) {
  await adminClient.from("nuclei_scan360_nikto_findings").delete().eq("job_id", job.id);

  const { data: openPorts } = await adminClient
    .from("nuclei_scan360_open_ports")
    .select("id, host, hostname, port, url_candidates")
    .eq("job_id", job.id);
  const ports = (openPorts || []) as OpenPortRow[];

  const portForFinding = (finding: NiktoFinding & { target_url?: string | null }) => {
    const targetUrl = String(finding.target_url || "");
    const host = String(finding.host || parseHostFromUrl(targetUrl) || "").toLowerCase();
    const portNumber = Number(finding.port || parsePortFromUrl(targetUrl) || 0);
    return ports.find((port) => {
      const candidates = Array.isArray(port.url_candidates) ? port.url_candidates : [];
      const portHost = String(port.hostname || port.host || "").toLowerCase();
      return (targetUrl && candidates.includes(targetUrl))
        || (portNumber && Number(port.port) === portNumber && (!host || !portHost || portHost === host));
    });
  };

  if (niktoResult.findings.length > 0) {
    const rows = niktoResult.findings.map((finding) => {
      const matchedPort = portForFinding(finding);
      const targetUrl = String(finding.target_url || "");
      return {
        job_id: job.id,
        organization_id: job.organization_id,
        customer_id: job.customer_id,
        port_id: matchedPort?.id || null,
        target_url: targetUrl || null,
        asset_host: String(finding.host || parseHostFromUrl(targetUrl) || job.target_host || job.nmap_target || "").slice(0, 255) || null,
        port: Number(finding.port || parsePortFromUrl(targetUrl) || matchedPort?.port || 0) || null,
        tls: Boolean(finding.tls) || /^https:/i.test(targetUrl),
        severity: safeSeverity(finding.severity),
        category: safeNiktoCategory(finding.category),
        nikto_id: finding.nikto_id ? String(finding.nikto_id).slice(0, 80) : null,
        method: finding.method ? String(finding.method).slice(0, 20) : null,
        uri: finding.uri ? String(finding.uri).slice(0, 1000) : null,
        message: String(finding.message || "Nikto finding").slice(0, 2000),
        references: Array.isArray(finding.references) ? finding.references.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 30) : [],
        raw_finding: finding.raw_finding && typeof finding.raw_finding === "object" ? finding.raw_finding : finding,
      };
    });
    const { error: insertError } = await adminClient.from("nuclei_scan360_nikto_findings").insert(rows);
    if (insertError) throw new Error(insertError.message || "Unable to persist Nikto findings");
  }

  const { error: updateError } = await adminClient
    .from("nuclei_scan360_jobs")
    .update({
      stage: "waiting_nuclei",
      status: "running",
      nikto_status: niktoResult.status,
      nikto_completed_at: new Date().toISOString(),
      nikto_duration_ms: Math.round(niktoResult.duration_ms),
      nikto_version: niktoResult.nikto_version,
      nikto_findings_count: niktoResult.findings_count,
      raw_nikto_result: {
        target_urls: niktoResult.target_urls,
        findings_count: niktoResult.findings_count,
        warnings: niktoResult.warnings,
        summary: niktoResult.summary,
        results: niktoResult.results,
      },
      next_run_at: new Date(Date.now() + NUCLEI_WAIT_MINUTES * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (updateError) throw new Error(updateError.message || "Unable to update Nikto stage");
}

function severityScore(value: unknown): number {
  const severity = safeSeverity(value);
  if (severity === "critical") return 80;
  if (severity === "high") return 65;
  if (severity === "medium") return 40;
  if (severity === "low") return 15;
  return 5;
}

function verdictLevel(score: number): "clean" | "informational" | "watch" | "elevated" | "critical" {
  if (score >= 75) return "critical";
  if (score >= 50) return "elevated";
  if (score >= 25) return "watch";
  if (score > 0) return "informational";
  return "clean";
}

async function buildUnifiedVerdict(adminClient: SupabaseClient, job: NucleiJob): Promise<Record<string, unknown>> {
  const [cveResponse, nucleiResponse, niktoResponse, openPortsResponse, techResponse] = await Promise.all([
    adminClient
      .from("nuclei_scan360_cve_matches")
      .select("cve_id, match_status, severity, cvss_score, kev_known_exploited, source")
      .eq("job_id", job.id),
    adminClient
      .from("nuclei_scan360_findings")
      .select("severity, category, cve_ids")
      .eq("job_id", job.id),
    adminClient
      .from("nuclei_scan360_nikto_findings")
      .select("severity, category, nikto_id, message")
      .eq("job_id", job.id),
    adminClient
      .from("nuclei_scan360_open_ports")
      .select("port, service, product, version")
      .eq("job_id", job.id),
    adminClient
      .from("nuclei_scan360_technologies")
      .select("name, version, cpe_candidates")
      .eq("job_id", job.id),
  ]);

  const cveMatches = (cveResponse.data || []) as Array<Record<string, unknown>>;
  const nucleiFindings = (nucleiResponse.data || []) as Array<Record<string, unknown>>;
  const niktoFindings = (niktoResponse.data || []) as Array<Record<string, unknown>>;
  const openPorts = (openPortsResponse.data || []) as Array<Record<string, unknown>>;
  const technologies = (techResponse.data || []) as Array<Record<string, unknown>>;
  const reasons: string[] = [];
  let score = 0;

  const confirmedCves = cveMatches.filter((match) => match.match_status === "confirmed");
  const potentialCves = cveMatches.filter((match) => match.match_status === "potential");
  if (confirmedCves.length > 0) {
    const maxConfirmed = Math.max(...confirmedCves.map((match) => Number(match.cvss_score) >= 9 ? 85 : severityScore(match.severity)));
    score = Math.max(score, maxConfirmed);
    reasons.push(`${confirmedCves.length} CVE confermate da Nuclei`);
  }
  if (potentialCves.length > 0) {
    const maxPotential = Math.max(...potentialCves.map((match) => Number(match.cvss_score) >= 9 ? 55 : Math.min(severityScore(match.severity), 45)));
    score = Math.max(score, maxPotential);
    reasons.push(`${potentialCves.length} CVE potenziali da NVD/CPE`);
  }

  if (nucleiFindings.length > 0) {
    const nucleiScore = Math.max(...nucleiFindings.map((finding) => severityScore(finding.severity)));
    score = Math.max(score, nucleiScore);
    reasons.push(`${nucleiFindings.length} finding Nuclei`);
  }

  if (niktoFindings.length > 0) {
    const niktoScore = Math.max(...niktoFindings.map((finding) => Math.min(severityScore(finding.severity), 45)));
    score = Math.max(score, niktoScore);
    const highRiskNikto = niktoFindings.filter((finding) => ["high", "medium"].includes(safeSeverity(finding.severity))).length;
    reasons.push(`${niktoFindings.length} finding Nikto${highRiskNikto ? ` (${highRiskNikto} medium/high)` : ""}`);
  }

  const exposedInterestingPorts = openPorts.filter((port) => ![80, 443].includes(Number(port.port))).length;
  const versionedTechnologies = technologies.filter((technology) => String(technology.version || "").trim()).length;
  if (exposedInterestingPorts > 0) {
    score = Math.max(score, Math.min(20 + exposedInterestingPorts * 5, 35));
    reasons.push(`${exposedInterestingPorts} porte esposte oltre HTTP/HTTPS standard`);
  }
  if (versionedTechnologies > 0) {
    score = Math.max(score, Math.min(score + 5, 100));
    reasons.push(`${versionedTechnologies} tecnologie con versione rilevata`);
  }

  if (reasons.length === 0) {
    reasons.push("Nessun finding o CVE nella pipeline Nmap/httpx/Nikto/Nuclei/NVD");
  }

  return {
    level: verdictLevel(score),
    score,
    reasons,
    generated_at: new Date().toISOString(),
    engines: {
      nmap: {
        open_port_count: openPorts.length,
        exposed_non_standard_count: exposedInterestingPorts,
      },
      httpx: {
        technology_count: technologies.length,
        versioned_technology_count: versionedTechnologies,
      },
      nikto: {
        finding_count: niktoFindings.length,
        max_severity: niktoFindings.length ? ["critical", "high", "medium", "low", "info"].find((severity) => niktoFindings.some((finding) => safeSeverity(finding.severity) === severity)) : "none",
      },
      nuclei: {
        finding_count: nucleiFindings.length,
        confirmed_cve_count: confirmedCves.length,
      },
      nvd: {
        potential_cve_count: potentialCves.length,
      },
    },
    semantics: {
      confirmed_cve: "validata tecnicamente da Nuclei",
      potential_cve: "correlata da CPE/versione con NVD, non validata come exploit presente",
      nikto: "misconfiguration, exposure e information disclosure",
    },
  };
}

async function callNucleiService(payload: ScanPayload): Promise<NucleiResult> {
  const { serviceUrl, sharedSecret } = getServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (payload.timeout_seconds + 25) * 1000);
  try {
    const response = await fetch(`${serviceUrl}/nuclei/scan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sharedSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Nuclei service returned malformed JSON: ${text.slice(0, 500)}`);
    }

    if (!response.ok) {
      const errorPayload = parsed as Record<string, unknown>;
      if (String(errorPayload.error || "") === "nuclei_timeout" && Array.isArray(errorPayload.warnings)) {
        return {
          ...(errorPayload as NucleiResult),
          findings: Array.isArray(errorPayload.findings) ? errorPayload.findings as NucleiFinding[] : [],
          warnings: uniqueStrings([...(errorPayload.warnings as unknown[]), "nuclei_timeout_partial_result"]),
        };
      }
      throw new Error(String(errorPayload.error || errorPayload.message || `Nuclei service HTTP ${response.status}`));
    }

    return parsed as NucleiResult;
  } finally {
    clearTimeout(timer);
  }
}

async function callNucleiHealth(): Promise<Record<string, unknown>> {
  const { serviceUrl } = getServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Nuclei health returned malformed JSON: ${text.slice(0, 300)}`);
    }
    if (!response.ok) {
      const errorPayload = parsed as Record<string, unknown>;
      throw new Error(String(errorPayload.error || errorPayload.message || `Nuclei health HTTP ${response.status}`));
    }
    return parsed as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

async function callNmapService(payload: { target: string; profile: NmapProfile; timeout_seconds: number; ports?: string }): Promise<NmapResult> {
  const { serviceUrl, sharedSecret } = getNmapServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (payload.timeout_seconds + 25) * 1000);
  try {
    const response = await fetch(`${serviceUrl}/nmap/scan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sharedSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Nmap service returned malformed JSON: ${text.slice(0, 500)}`);
    }

    if (!response.ok) {
      const errorPayload = parsed as Record<string, unknown>;
      throw new Error(String(errorPayload.error || errorPayload.message || `Nmap service HTTP ${response.status}`));
    }

    return parsed as NmapResult;
  } finally {
    clearTimeout(timer);
  }
}

async function callNmapHealth(): Promise<Record<string, unknown>> {
  const { serviceUrl } = getNmapServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Nmap health returned malformed JSON: ${text.slice(0, 300)}`);
    }
    if (!response.ok) {
      const errorPayload = parsed as Record<string, unknown>;
      throw new Error(String(errorPayload.error || errorPayload.message || `Nmap health HTTP ${response.status}`));
    }
    return parsed as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

async function callNiktoService(payload: { target_url: string; timeout_seconds: number; max_findings: number }): Promise<NiktoResult> {
  const { serviceUrl, sharedSecret } = getNiktoServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (payload.timeout_seconds + 35) * 1000);
  try {
    const response = await fetch(`${serviceUrl}/nikto/scan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sharedSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Nikto service returned malformed JSON: ${text.slice(0, 500)}`);
    }

    if (!response.ok) {
      const errorPayload = parsed as Record<string, unknown>;
      throw new Error(String(errorPayload.error || errorPayload.message || `Nikto service HTTP ${response.status}`));
    }

    return parsed as NiktoResult;
  } finally {
    clearTimeout(timer);
  }
}

async function callNiktoHealth(): Promise<Record<string, unknown>> {
  const { serviceUrl } = getNiktoServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Nikto health returned malformed JSON: ${text.slice(0, 300)}`);
    }
    if (!response.ok) {
      const errorPayload = parsed as Record<string, unknown>;
      throw new Error(String(errorPayload.error || errorPayload.message || `Nikto health HTTP ${response.status}`));
    }
    return parsed as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

async function loadOrganization(adminClient: SupabaseClient, organizationId: string) {
  const { data, error } = await adminClient
    .from("organizations")
    .select("id, name, code")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to load organization");
  if (!data?.id) throw new Error("Organization not found");
  return data;
}

async function collectSurfaceTargets(adminClient: SupabaseClient, organizationId: string, limit: number): Promise<string[]> {
  const { targets } = await collectScannableTargets(adminClient, organizationId, limit);
  return targets.map((target) => target.target_url);
}

async function collectScannableTargets(adminClient: SupabaseClient, organizationId: string, limit: number) {
  const organization = await loadOrganization(adminClient, organizationId);
  const targets = new Map<string, ScannableTarget>();
  const warnings: string[] = [];
  const targetQuerySignal = () => AbortSignal.timeout(2500);

  const safeSelect = async <T>(
    label: string,
    queryBuilder: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  ): Promise<T[]> => {
    try {
      const { data, error } = await queryBuilder;
      if (error) {
        warnings.push(`${label}: ${error.message || "query_failed"}`);
        return [];
      }
      return data || [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${label}: ${message || "query_failed"}`);
      return [];
    }
  };

  pushTarget(targets, organization.code, "client_registry", "Anagrafica cliente", "domain", "low");

  const users = await safeSelect<{ email?: string }>(
    "users",
      adminClient
        .from("users")
        .select("email")
        .eq("organization_id", organizationId)
        .abortSignal(targetQuerySignal())
        .limit(100),
  );
  for (const user of users) {
    const domain = String(user.email || "").split("@").pop();
    pushTarget(targets, domain, "client_registry", "Dominio email anagrafica", "domain", "low");
  }

  const surfaceAssets = await safeSelect<{ asset_type?: string; asset_value?: string; hostname?: string; root_domain?: string; source?: string }>(
    "surface_assets",
    adminClient
      .from("surface_assets")
      .select("asset_type, asset_value, hostname, root_domain, source")
      .or(`organization_id.eq.${organizationId},customer_id.eq.${organizationId}`)
      .in("asset_type", SURFACE_TARGET_ASSET_TYPES)
      .order("last_seen", { ascending: false, nullsFirst: false })
      .abortSignal(targetQuerySignal())
      .limit(limit),
  );
  for (const asset of surfaceAssets) {
    pushTarget(targets, asset.root_domain, "surface_assets", "SurfaceScan360 root domain", "domain", "medium");
    pushScopedTarget(targets, asset.hostname, "surface_assets", "SurfaceScan360 hostname", "subdomain", "high", asset.root_domain);
    pushScopedTarget(targets, asset.asset_value, "surface_assets", asset.source || "SurfaceScan360 asset", asset.asset_type, "high", asset.root_domain);
  }

  const surfaceTargets = await safeSelect<{ target_type?: string; target_value?: string; root_domain?: string; source?: string }>(
    "surface_scan_targets",
    adminClient
      .from("surface_scan_targets")
      .select("target_type, target_value, root_domain, source")
      .or(`organization_id.eq.${organizationId},customer_id.eq.${organizationId}`)
      .in("target_type", SURFACE_TARGET_ASSET_TYPES)
      .order("created_at", { ascending: false })
      .abortSignal(targetQuerySignal())
      .limit(limit),
  );
  for (const target of surfaceTargets) {
    pushTarget(targets, target.target_value, "surface_scan_targets", target.source || "SurfaceScan360 target", target.target_type, "high");
    pushTarget(targets, target.root_domain, "surface_scan_targets", "SurfaceScan360 root domain", "domain", "medium");
  }

  const manualDarkriskTargets = await safeSelect<{ target_type?: string; value?: string; normalized_value?: string; label?: string }>(
    "darkrisk360_manual_targets",
    adminClient
      .from("darkrisk360_manual_targets")
      .select("target_type, value, normalized_value, label")
      .eq("organization_id", organizationId)
      .eq("enabled", true)
      .in("target_type", MANUAL_TARGET_TYPES)
      .order("created_at", { ascending: false })
      .abortSignal(targetQuerySignal())
      .limit(limit),
  );
  for (const target of manualDarkriskTargets) {
    pushTarget(targets, target.normalized_value || target.value, "darkrisk_manual_targets", target.label || "DarkRisk manual target", target.target_type, "high");
  }

  const darkriskAssets = await safeSelect<{ asset_type?: string; value?: string; normalized_value?: string; scope_status?: string }>(
    "darkrisk_assets",
    adminClient
      .from("darkrisk_assets")
      .select("asset_type, value, normalized_value, scope_status")
      .eq("organization_id", organizationId)
      .in("asset_type", DARKRISK_TARGET_ASSET_TYPES)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .abortSignal(targetQuerySignal())
      .limit(limit),
  );
  for (const asset of darkriskAssets) {
    pushTarget(targets, asset.normalized_value || asset.value, "darkrisk_assets", asset.scope_status || "DarkRisk asset", asset.asset_type, "medium");
  }

  const darkriskSelectors = await safeSelect<{ selector_type?: string; value?: string; normalized_value?: string; status?: string }>(
    "darkrisk_selectors",
    adminClient
      .from("darkrisk_selectors")
      .select("selector_type, value, normalized_value, status")
      .eq("organization_id", organizationId)
      .in("selector_type", DARKRISK_SELECTOR_TARGET_TYPES)
      .order("created_at", { ascending: false })
      .abortSignal(targetQuerySignal())
      .limit(limit),
  );
  for (const selector of darkriskSelectors) {
    pushTarget(targets, selector.normalized_value || selector.value, "darkrisk_selectors", selector.status || "DarkRisk selector", selector.selector_type, "medium");
  }

  const darkriskSourceRuns = await safeSelect<{ query_kind?: string; query_term?: string; selector_value?: string; target_url?: string }>(
    "darkrisk_dti_source_runs",
    adminClient
      .from("darkrisk_dti_source_runs")
      .select("query_kind, query_term, selector_value, target_url")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .abortSignal(targetQuerySignal())
      .limit(limit),
  );
  for (const run of darkriskSourceRuns) {
    if (String(run.query_kind || "").includes("domain")) {
      pushTarget(targets, run.query_term, "darkrisk_dti_runs", "DarkRisk query term", "domain", "medium");
    }
    pushTarget(targets, run.selector_value, "darkrisk_dti_runs", "DarkRisk selector", "domain", "low");
    pushTarget(targets, run.target_url, "darkrisk_dti_runs", "DarkRisk source URL", "url", "low");
  }

  const darkriskRecords = await safeSelect<{ query_kind?: string; query_term?: string; source_url?: string }>(
    "darkrisk_source_records",
    adminClient
      .from("darkrisk_source_records")
      .select("query_kind, query_term, source_url")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .abortSignal(targetQuerySignal())
      .limit(limit),
  );
  for (const record of darkriskRecords) {
    if (String(record.query_kind || "").includes("domain")) {
      pushTarget(targets, record.query_term, "darkrisk_source_records", "DarkRisk record query", "domain", "low");
    }
    pushTarget(targets, record.source_url, "darkrisk_source_records", "DarkRisk source URL", "url", "low");
  }

  const sortedTargets = Array.from(targets.values())
    .filter((target) => target.host !== "example.com" && !target.host.endsWith(".example.com"))
    .sort((a, b) => {
      const confidenceWeight = { high: 0, medium: 1, low: 2 };
      return confidenceWeight[a.confidence] - confidenceWeight[b.confidence]
        || a.source.localeCompare(b.source)
        || a.host.localeCompare(b.host);
    })
    .slice(0, limit);

  const counts = sortedTargets.reduce<Record<string, number>>((acc, target) => {
    acc[target.source] = (acc[target.source] || 0) + 1;
    return acc;
  }, {});

  return { targets: sortedTargets, counts, warnings };
}

async function retrieveTargets(adminClient: SupabaseClient, body: RequestBody) {
  const organizationId = String(body.organization_id || "").trim();
  if (!organizationId) throw new Error("organization_id is required");
  await loadOrganization(adminClient, organizationId);
  return await collectScannableTargets(adminClient, organizationId, clampInt(body.target_limit, 80, 1, 150));
}

async function enqueueJobs(
  adminClient: SupabaseClient,
  body: RequestBody,
  authUserId: string,
  email: string,
) {
  const organizationId = String(body.organization_id || "").trim();
  if (!organizationId) throw new Error("organization_id is required");
  await loadOrganization(adminClient, organizationId);

  const options = normalizeOptions(body);
  const nmapProfile = normalizeNmapProfile(body.nmap_profile);
  const manualTargets = [
    body.target_url,
    ...(Array.isArray(body.targets) ? body.targets : []),
  ]
    .map(normalizeTargetInputToken)
    .filter(Boolean) as string[];
  const warnings: string[] = [];
  let surfaceTargets: string[] = [];
  const shouldLoadDiscoveredTargets = Boolean(body.include_discovered_targets) || (manualTargets.length === 0 && Boolean(body.include_surface_assets));
  if (shouldLoadDiscoveredTargets) {
    try {
      surfaceTargets = await collectSurfaceTargets(adminClient, organizationId, clampInt(body.surface_asset_limit || body.target_limit, 25, 1, 100));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`target_repository:${message || "query_failed"}`);
    }
  }
  const source = manualTargets.length > 0 && surfaceTargets.length > 0
    ? "mixed"
    : surfaceTargets.length > 0
      ? "surface_assets"
      : "manual";

  const normalizedPipelineTargets: PipelineTarget[] = [];
  for (const rawTarget of [...manualTargets, ...surfaceTargets]) {
    try {
      normalizedPipelineTargets.push(normalizePipelineTarget(rawTarget));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`target_skipped:${String(rawTarget).slice(0, 120)}:${message || "invalid_target"}`);
    }
  }
  const pipelineTargets = Array.from(new Map(
    normalizedPipelineTargets.map((target) => [target.normalizedTargetUrl, target] as const),
  ).values()).slice(0, 50);
  if (pipelineTargets.length === 0) throw new Error("At least one target or SurfaceScan360 asset is required");
  const normalizedTargets = pipelineTargets.map((target) => target.normalizedTargetUrl);

  const { data: activeJobs, error: activeError } = await adminClient
    .from("nuclei_scan360_jobs")
    .select("normalized_target_url")
    .eq("organization_id", organizationId)
    .eq("profile", options.profile)
    .in("status", ["queued", "running"])
    .in("normalized_target_url", normalizedTargets);
  if (activeError) throw new Error(activeError.message || "Unable to inspect active NucleiScan360 jobs");

  const activeTargets = new Set((activeJobs || []).map((job: { normalized_target_url?: string }) => String(job.normalized_target_url || "")));
  const newTargets = normalizedTargets.filter((targetUrl) => !activeTargets.has(targetUrl));
  if (newTargets.length === 0) {
    return { queued: [], queued_count: 0, skipped_duplicates: normalizedTargets.length, warnings };
  }

  const targetByNormalized = new Map(pipelineTargets.map((target) => [target.normalizedTargetUrl, target] as const));
  const rows = newTargets.map((targetUrl) => {
    const pipelineTarget = targetByNormalized.get(targetUrl);
    if (!pipelineTarget) throw new Error("Unable to resolve normalized target");
    return ({
    organization_id: organizationId,
    customer_id: organizationId,
    created_by: authUserId,
    created_by_email: email,
    source,
    target_url: pipelineTarget.targetUrl,
    normalized_target_url: pipelineTarget.normalizedTargetUrl,
    target_host: pipelineTarget.targetHost,
    target_input: pipelineTarget.targetInput,
    target_kind: pipelineTarget.targetKind,
    nmap_target: pipelineTarget.nmapTarget,
    nmap_profile: nmapProfile,
    profile: options.profile,
    authorized_scan: options.authorized_scan,
    timeout_seconds: options.timeout_seconds,
    rate_limit: options.rate_limit,
    max_findings: options.max_findings,
    stage: "queued",
    next_run_at: new Date().toISOString(),
    status: "queued",
    });
  });

  const { data, error } = await adminClient
    .from("nuclei_scan360_jobs")
    .insert(rows)
    .select("*");
  if (error) throw new Error(error.message || "Unable to enqueue NucleiScan360 jobs");

  return { queued: data || [], queued_count: data?.length || 0, skipped_duplicates: normalizedTargets.length - (data?.length || 0), warnings };
}

async function startLabScan(
  adminClient: SupabaseClient,
  body: RequestBody,
  authUserId: string,
  email: string,
) {
  const enqueueResult = await enqueueJobs(adminClient, body, authUserId, email);
  const organizationId = String(body.organization_id || "").trim();
  const warnings = Array.isArray(enqueueResult.warnings) ? [...enqueueResult.warnings] : [];
  let backgroundStarted = false;

  if ((enqueueResult.queued_count || 0) > 0) {
    const backgroundProcess = processQueue(adminClient, {
      ...body,
      action: "process_queue",
      organization_id: organizationId,
      limit: 1,
    }).catch((error) => {
      console.error(JSON.stringify({
        event: "nuclei_scan360_background_kickstart",
        status: "error",
        organization_id: organizationId,
        message: error instanceof Error ? error.message : String(error || "process_queue_failed"),
      }));
    });
    const edgeRuntime = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (typeof edgeRuntime?.waitUntil === "function") {
      edgeRuntime.waitUntil(backgroundProcess);
      backgroundStarted = true;
    } else {
      void backgroundProcess;
      warnings.push("background_kickstart_wait_until_unavailable");
    }
  }

  const jobsPayload = await listJobs(adminClient, {
    action: "list",
    organization_id: organizationId,
    limit: Math.max(30, clampInt(body.limit, 30, 1, 100)),
  });

  return {
    ...enqueueResult,
    warnings,
    kickstart: {
      mode: "background_wait_until",
      processed: [],
      processed_count: 0,
      started: backgroundStarted,
      reason: "start_lab_scan_returns_immediately_to_avoid_http_502_on_long_scans",
    },
    processed: [],
    processed_count: 0,
    jobs: jobsPayload.jobs || [],
    lab_pipeline: {
      engines: ["nmap", "httpx_tech_detect", "nikto", "nuclei", "nvd_cve_enrichment"],
      stages: ["queued", "nmap_running", "nikto_running", "waiting_nuclei", "nuclei_running", "completed"],
      report_template: "SurfaceScan360",
      wait_window_minutes: NUCLEI_WAIT_MINUTES,
      background_processing: "pg_cron_process_queue_every_minute",
    },
  };
}

async function listJobs(adminClient: SupabaseClient, body: RequestBody) {
  const organizationId = String(body.organization_id || "").trim();
  if (!organizationId) throw new Error("organization_id is required");
  await loadOrganization(adminClient, organizationId);

  const { data, error } = await adminClient
    .from("nuclei_scan360_jobs")
    .select("id, organization_id, customer_id, source, target_url, normalized_target_url, resolved_target_url, target_host, target_input, target_kind, nmap_target, nmap_profile, stage, next_run_at, nmap_status, nmap_started_at, nmap_completed_at, nmap_duration_ms, nmap_version, open_port_count, fingerprint_status, fingerprint_duration_ms, technology_count, nmap_warnings, raw_nmap_result, raw_technology_result, nikto_status, nikto_started_at, nikto_completed_at, nikto_duration_ms, nikto_version, nikto_findings_count, raw_nikto_result, unified_verdict, profile, status, attempt_count, last_error, timeout_seconds, rate_limit, max_findings, authorized_scan, duration_ms, nuclei_version, templates_loaded_count, templates_executed_count, findings_count, warnings, summary, raw_result, created_at, started_at, completed_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(clampInt(body.limit, 25, 1, 100));
  if (error) throw new Error(error.message || "Unable to list NucleiScan360 jobs");

  return { jobs: data || [] };
}

async function getJob(adminClient: SupabaseClient, body: RequestBody) {
  const jobId = String(body.job_id || "").trim();
  if (!jobId) throw new Error("job_id is required");

  const { data: job, error: jobError } = await adminClient
    .from("nuclei_scan360_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message || "Unable to load NucleiScan360 job");
  if (!job?.id) throw new Error("NucleiScan360 job not found");

  const { data: findings, error: findingsError } = await adminClient
    .from("nuclei_scan360_findings")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  if (findingsError) throw new Error(findingsError.message || "Unable to load NucleiScan360 findings");

  const { data: openPorts, error: openPortsError } = await adminClient
    .from("nuclei_scan360_open_ports")
    .select("*")
    .eq("job_id", jobId)
    .order("port", { ascending: true });
  if (openPortsError) throw new Error(openPortsError.message || "Unable to load NucleiScan360 open ports");

  const { data: cveMatches, error: cveMatchesError } = await adminClient
    .from("nuclei_scan360_cve_matches")
    .select("*")
    .eq("job_id", jobId)
    .order("match_status", { ascending: true })
    .order("created_at", { ascending: true });
  if (cveMatchesError) throw new Error(cveMatchesError.message || "Unable to load NucleiScan360 CVE matches");
  const enrichedCveMatches = await enrichCveMatchesForResponse(adminClient, (cveMatches || []) as Record<string, unknown>[]);

  const { data: technologies, error: technologiesError } = await adminClient
    .from("nuclei_scan360_technologies")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  if (technologiesError) throw new Error(technologiesError.message || "Unable to load NucleiScan360 technologies");

  const { data: niktoFindings, error: niktoFindingsError } = await adminClient
    .from("nuclei_scan360_nikto_findings")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  if (niktoFindingsError) throw new Error(niktoFindingsError.message || "Unable to load Nikto findings");

  return { job, findings: findings || [], open_ports: openPorts || [], cve_matches: enrichedCveMatches, technologies: technologies || [], nikto_findings: niktoFindings || [] };
}

async function persistResult(adminClient: SupabaseClient, job: NucleiJob, result: NucleiResult) {
  const findings = Array.isArray(result.findings) ? result.findings : [];
  await adminClient.from("nuclei_scan360_findings").delete().eq("job_id", job.id);
  await adminClient.from("nuclei_scan360_cve_matches").delete().eq("job_id", job.id).eq("match_status", "confirmed");

  if (findings.length > 0) {
    const rows = findings.map((finding) => ({
      job_id: job.id,
      organization_id: job.organization_id,
      customer_id: job.customer_id,
      template_id: finding.template_id ? String(finding.template_id) : null,
      name: finding.name ? String(finding.name) : null,
      severity: finding.severity ? String(finding.severity).toLowerCase() : "info",
      type: finding.type ? String(finding.type) : null,
      category: classifyFinding(finding),
      matcher_name: finding.matcher_name ? String(finding.matcher_name) : null,
      matched_at: finding.matched_at ? String(finding.matched_at) : null,
      asset_host: extractAssetHost(finding.matched_at),
      extracted_results: Array.isArray(finding.extracted_results) ? finding.extracted_results : [],
      tags: Array.isArray(finding.tags) ? finding.tags : [],
      cve_ids: extractFindingCves(finding),
      cvss_score: inferCvssScore(finding),
      epss_score: inferEpssScore(finding),
      kev_known_exploited: inferKevKnownExploited(finding),
      cve_details: {},
      raw_finding: finding,
    }));

    const { data: insertedFindings, error: insertError } = await adminClient
      .from("nuclei_scan360_findings")
      .insert(rows)
      .select("id, template_id, severity, matched_at, asset_host, cve_ids, cvss_score, epss_score, kev_known_exploited, raw_finding");
    if (insertError) throw new Error(insertError.message || "Unable to persist NucleiScan360 findings");

    const cveRows = (insertedFindings || []).flatMap((findingRow: Record<string, unknown>) => {
      const cves = Array.isArray(findingRow.cve_ids) ? findingRow.cve_ids.map((cve) => String(cve || "")).filter(Boolean) : [];
      return cves.map((cveId) => ({
        job_id: job.id,
        finding_id: findingRow.id,
        organization_id: job.organization_id,
        customer_id: job.customer_id,
        asset_host: findingRow.asset_host ? String(findingRow.asset_host) : null,
        cve_id: cveId,
        severity: findingRow.severity ? String(findingRow.severity) : null,
        template_id: findingRow.template_id ? String(findingRow.template_id) : null,
        matched_at: findingRow.matched_at ? String(findingRow.matched_at) : null,
        cvss_score: findingRow.cvss_score ?? null,
        epss_score: findingRow.epss_score ?? null,
        kev_known_exploited: findingRow.kev_known_exploited === true,
        source: "nuclei",
        match_status: "confirmed",
        confidence: "high",
        cpe: null,
        port_id: null,
        description: null,
        nvd_status: null,
        cvss_vector: null,
        cvss_version: null,
        epss_percentile: null,
        published_at: null,
        last_modified_at: null,
        details: findingRow.raw_finding || {},
      }));
    });

    if (cveRows.length > 0) {
      const { error: cveInsertError } = await adminClient.from("nuclei_scan360_cve_matches").insert(cveRows);
      if (cveInsertError) throw new Error(cveInsertError.message || "Unable to persist NucleiScan360 CVE matches");

      try {
        await adminClient.rpc("enqueue_cve_enrichment", {
          _org_id: job.organization_id,
          _cves: uniqueStrings(cveRows.map((row) => row.cve_id)),
          _source: "nuclei_scan360",
        });
      } catch {
        // CVE enrichment is best-effort; persisted matches remain the source of truth for this job.
      }
    }
  }

  const summary = buildSummary(result);
  const unifiedVerdict = await buildUnifiedVerdict(adminClient, job);
  const { error: updateError } = await adminClient
    .from("nuclei_scan360_jobs")
    .update({
      status: "completed",
      stage: "completed",
      completed_at: new Date().toISOString(),
      next_run_at: null,
      duration_ms: Number.isFinite(Number(result.duration_ms)) ? Math.round(Number(result.duration_ms)) : null,
      resolved_target_url: result.resolved_target_url || result.target_url || job.target_url,
      nuclei_version: result.nuclei_version || null,
      templates_loaded_count: Number.isFinite(Number(result.templates_loaded_count)) ? Math.round(Number(result.templates_loaded_count)) : null,
      templates_executed_count: Number.isFinite(Number(result.templates_executed_count)) ? Math.round(Number(result.templates_executed_count)) : null,
      findings_count: findings.length,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      summary,
      raw_result: result,
      unified_verdict: unifiedVerdict,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (updateError) throw new Error(updateError.message || "Unable to update NucleiScan360 job");
}

async function markJobFailed(adminClient: SupabaseClient, job: NucleiJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const isTimeout = error instanceof DOMException && error.name === "AbortError";
  await adminClient
    .from("nuclei_scan360_jobs")
    .update({
      status: isTimeout || /timeout|aborted/i.test(message) ? "timeout" : "failed",
      stage: isTimeout || /timeout|aborted/i.test(message) ? "timeout" : "failed",
      completed_at: new Date().toISOString(),
      last_error: message.slice(0, 1000),
      next_run_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  return message;
}

async function processQueue(adminClient: SupabaseClient, body: RequestBody) {
  getServiceConfig();
  getNmapServiceConfig();
  getNiktoServiceConfig();
  const organizationId = String(body.organization_id || "").trim();
  if (organizationId) await loadOrganization(adminClient, organizationId);

  const maxJobs = clampInt(body.limit, 1, 1, 2);
  let query = adminClient
    .from("nuclei_scan360_jobs")
    .select("*")
    .in("stage", ["queued", "nikto_running", "waiting_nuclei"])
    .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(maxJobs);
  if (organizationId) query = query.eq("organization_id", organizationId);

  const { data: queued, error } = await query;
  if (error) throw new Error(error.message || "Unable to load queued NucleiScan360 jobs");

  const processed: Array<{ job_id: string; status: string; stage?: string; result?: NucleiResult; nmap_result?: NmapResult; nikto_result?: NiktoAggregateResult; error?: string }> = [];
  for (const job of (queued || []) as NucleiJob[]) {
    if ((job.stage || "queued") === "queued") {
      const { data: claimed, error: claimError } = await adminClient
        .from("nuclei_scan360_jobs")
        .update({
          status: "running",
          stage: "nmap_running",
          nmap_status: "running",
          started_at: job.started_at || new Date().toISOString(),
          nmap_started_at: new Date().toISOString(),
          attempt_count: (job.attempt_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("stage", "queued")
        .select("*")
        .maybeSingle();
      if (claimError) throw new Error(claimError.message || "Unable to claim NucleiScan360 Nmap job");
      if (!claimed?.id) continue;

      const runningJob = claimed as NucleiJob;
      try {
        const nmapResult = await callNmapService({
          target: String(runningJob.nmap_target || runningJob.target_input || runningJob.target_host || runningJob.target_url),
          profile: normalizeNmapProfile(runningJob.nmap_profile || body.nmap_profile),
          timeout_seconds: Math.min(runningJob.timeout_seconds || 60, 180),
        });
        await persistNmapResult(adminClient, runningJob, nmapResult);
        processed.push({ job_id: runningJob.id, status: "running", stage: "nikto_running", nmap_result: nmapResult });
      } catch (error) {
        const message = await markJobFailed(adminClient, runningJob, error);
        processed.push({ job_id: runningJob.id, status: /timeout|aborted/i.test(message) ? "timeout" : "failed", stage: /timeout|aborted/i.test(message) ? "timeout" : "failed", error: message });
      }
      continue;
    }

    if ((job.stage || "") === "nikto_running") {
      const { data: claimed, error: claimError } = await adminClient
        .from("nuclei_scan360_jobs")
        .update({
          status: "running",
          stage: "nikto_running",
          nikto_status: "running",
          nikto_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("stage", "nikto_running")
        .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`)
        .select("*")
        .maybeSingle();
      if (claimError) throw new Error(claimError.message || "Unable to claim NucleiScan360 Nikto job");
      if (!claimed?.id) continue;

      const runningJob = claimed as NucleiJob;
      try {
        const rawNmap = runningJob.raw_nmap_result || {};
        const candidates = buildNiktoUrlCandidates(runningJob, rawNmap as NmapResult);
        const niktoResult = await runNiktoForCandidates(
          candidates,
          clampInt(runningJob.timeout_seconds, 90, 30, NIKTO_ACTION_TIMEOUT_SECONDS),
          clampInt(runningJob.max_findings, 200, 1, 500),
        );
        await persistNiktoResult(adminClient, runningJob, niktoResult);
        processed.push({ job_id: runningJob.id, status: "running", stage: "waiting_nuclei", nikto_result: niktoResult });
      } catch (error) {
        const message = await markJobFailed(adminClient, runningJob, error);
        processed.push({ job_id: runningJob.id, status: /timeout|aborted/i.test(message) ? "timeout" : "failed", stage: /timeout|aborted/i.test(message) ? "timeout" : "failed", error: message });
      }
      continue;
    }

    if ((job.stage || "") === "waiting_nuclei") {
      const { data: claimed, error: claimError } = await adminClient
        .from("nuclei_scan360_jobs")
        .update({
          status: "running",
          stage: "nuclei_running",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("stage", "waiting_nuclei")
        .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`)
        .select("*")
        .maybeSingle();
      if (claimError) throw new Error(claimError.message || "Unable to claim NucleiScan360 Nuclei job");
      if (!claimed?.id) continue;

      const runningJob = claimed as NucleiJob;
      try {
        const rawNmap = (runningJob as unknown as { raw_nmap_result?: Record<string, unknown> }).raw_nmap_result || {};
        const candidates = Array.isArray(rawNmap.nuclei_url_candidates)
          ? rawNmap.nuclei_url_candidates.map((candidate) => String(candidate || "")).filter(Boolean)
          : buildUrlCandidates(runningJob, rawNmap as NmapResult);
        const targetUrl = candidates[0] || (/^https?:\/\//i.test(runningJob.normalized_target_url) ? runningJob.normalized_target_url : "");
        if (!targetUrl) throw new Error("No HTTP/HTTPS candidate available for Nuclei after Nmap");

      const result = await callNucleiService({
        target_url: targetUrl,
        profile: runningJob.profile,
        timeout_seconds: Math.min(runningJob.timeout_seconds, HTTP_ACTION_TIMEOUT_SECONDS),
        rate_limit: runningJob.rate_limit,
        max_findings: runningJob.max_findings,
        authorized_scan: runningJob.authorized_scan,
      });
      await persistResult(adminClient, runningJob, result);
        processed.push({ job_id: runningJob.id, status: "completed", stage: "completed", result });
    } catch (error) {
      const message = await markJobFailed(adminClient, runningJob, error);
        processed.push({ job_id: runningJob.id, status: /timeout|aborted/i.test(message) ? "timeout" : "failed", stage: /timeout|aborted/i.test(message) ? "timeout" : "failed", error: message });
      }
    }
  }

  return { processed, processed_count: processed.length, remaining_hint: Math.max(0, (queued?.length || 0) - processed.length) };
}

async function directScan(body: RequestBody) {
  const targetUrl = normalizeTargetUrl(body.target_url);
  const options = normalizeOptions(body);
  const result = await callNucleiService({ target_url: targetUrl, ...options });
  return { result };
}

async function smokeTest(adminClient: SupabaseClient, body: RequestBody) {
  const startedAt = Date.now();
  const organizationId = String(body.organization_id || "").trim();
  const checks: SmokeCheck[] = [];
  const warnings: string[] = [];

  const runCheck = async (
    name: string,
    check: () => Promise<Record<string, unknown> | void>,
  ) => {
    const checkStartedAt = Date.now();
    try {
      const details = await check();
      checks.push({
        name,
        ok: true,
        details: details || undefined,
        duration_ms: Date.now() - checkStartedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push({
        name,
        ok: false,
        message: message || "check_failed",
        duration_ms: Date.now() - checkStartedAt,
      });
      warnings.push(`${name}:${message || "check_failed"}`);
    }
  };

  await runCheck("service_config", async () => {
    const { serviceUrl } = getServiceConfig();
    return { configured: true, service_url_host: new URL(serviceUrl).host };
  });

  await runCheck("nmap_service_config", async () => {
    const { serviceUrl } = getNmapServiceConfig();
    return { configured: true, service_url_host: new URL(serviceUrl).host };
  });

  await runCheck("nikto_service_config", async () => {
    const { serviceUrl } = getNiktoServiceConfig();
    return { configured: true, service_url_host: new URL(serviceUrl).host };
  });

  await runCheck("organization", async () => {
    if (!organizationId) throw new Error("organization_id is required");
    const organization = await loadOrganization(adminClient, organizationId);
    return { id: organization.id, name: organization.name, code: organization.code };
  });

  if (body.include_discovered_targets === true) {
    await runCheck("target_repository", async () => {
      if (!organizationId) throw new Error("organization_id is required");
      const repository = await collectScannableTargets(adminClient, organizationId, clampInt(body.target_limit, 10, 1, 25));
      return { target_count: repository.targets.length, counts: repository.counts, warnings: repository.warnings };
    });
  }

  await runCheck("queue_table", async () => {
    if (!organizationId) throw new Error("organization_id is required");
    const { count, error } = await adminClient
      .from("nuclei_scan360_jobs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message || "queue_table_failed");
    return { dry_run_insert: false, existing_jobs: count || 0 };
  });

  await runCheck("open_ports_table", async () => {
    if (!organizationId) throw new Error("organization_id is required");
    const { count, error } = await adminClient
      .from("nuclei_scan360_open_ports")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message || "open_ports_table_failed");
    return { existing_open_ports: count || 0 };
  });

  await runCheck("cve_matches_table", async () => {
    if (!organizationId) throw new Error("organization_id is required");
    const { count, error } = await adminClient
      .from("nuclei_scan360_cve_matches")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message || "cve_matches_table_failed");
    return { existing_cve_matches: count || 0 };
  });

  await runCheck("nikto_findings_table", async () => {
    if (!organizationId) throw new Error("organization_id is required");
    const { count, error } = await adminClient
      .from("nuclei_scan360_nikto_findings")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message || "nikto_findings_table_failed");
    return { existing_nikto_findings: count || 0 };
  });

  await runCheck("nvd_api", async () => {
    if (!getNvdApiKey()) throw new Error("NVD_API_KEY is not configured");
    const cveQuery = new URLSearchParams({ cveIds: "CVE-2024-3400", resultsPerPage: "1" });
    const cveData = await fetchNvdJson(`${NVD_CVES_BASE}?${cveQuery.toString()}`);
    const cveCount = Array.isArray(cveData.vulnerabilities) ? cveData.vulnerabilities.length : 0;
    const cpeData = await fetchNvdJson(`${NVD_CVES_BASE}?cpeName=${encodeURIComponent("cpe:2.3:a:apache:http_server:2.4.49:*:*:*:*:*:*:*")}&resultsPerPage=1&isVulnerable`);
    const cpeCount = Array.isArray(cpeData.vulnerabilities) ? cpeData.vulnerabilities.length : 0;
    return {
      configured: true,
      cve_sample_ok: cveCount > 0,
      cpe_sample_ok: cpeCount > 0,
    };
  });

  await runCheck("container_health", async () => {
    const health = await callNucleiHealth();
    return health;
  });

  await runCheck("nmap_container_health", async () => {
    const health = await callNmapHealth();
    return health;
  });

  await runCheck("nikto_container_health", async () => {
    const health = await callNiktoHealth();
    return health;
  });

  return {
    checks,
    warnings,
    duration_ms: Date.now() - startedAt,
    ok: checks.every((check) => check.ok),
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: nucleiCorsHeaders });
  const startedAt = Date.now();
  let body = {} as RequestBody;
  if (req.method === "GET") {
    body = parseQueryRequestBody(req);
  } else if (req.method === "POST") {
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      body = {} as RequestBody;
    }
  }
  const action = (body.action || "direct_scan") as NucleiAction;
  const organizationId = String(body.organization_id || "").trim();
  const ctx: TraceContext = {
    requestId: sanitizeRequestId(req.headers.get("x-nuclei-scan360-request-id") || body.request_id),
    action,
    organizationId,
    startedAt,
    profile: body.profile,
    targetCount: countRequestedTargets(body),
  };

  if (!["GET", "POST"].includes(req.method)) {
    traceLog(ctx, "method_not_allowed", { phase: "method", http_status: 405 });
    return tracedJsonResponse(ctx, { ok: false, error: "Method not allowed", phase: "method" }, 405);
  }

  if (req.method === "GET" && !["retrieve_targets", "list", "get", "smoke_test"].includes(action)) {
    traceLog(ctx, "get_action_not_allowed", { phase: "method", http_status: 405 });
    return tracedJsonResponse(ctx, { ok: false, error: "GET is only allowed for read actions", phase: "method" }, 405);
  }

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const internalRequest = isInternalRequest(req);
    let authUserId = "00000000-0000-0000-0000-000000000000";
    let callerEmail = "scan360-internal";

    if (internalRequest) {
      if (!INTERNAL_ALLOWED_ACTIONS.has(action)) {
        traceLog(ctx, "internal_action_forbidden", { phase: "auth", http_status: 403 });
        return tracedJsonResponse(ctx, { ok: false, error: "Internal calls can only process queue, run smoke tests, or read LAB data", phase: "auth" }, 403);
      }
      // Internal/service-role callers may carry an explicit created_by (e.g. start_lab_scan enqueues
      // rows whose created_by must satisfy the FK to a real user). Honour it when it is a valid UUID.
      const internalCreatedBy = String((body as { created_by?: string }).created_by || "").trim();
      if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(internalCreatedBy)) {
        authUserId = internalCreatedBy;
        callerEmail = String((body as { created_by_email?: string }).created_by_email || "scan360-internal");
      }
    } else {
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) {
        traceLog(ctx, "unauthorized", { phase: "auth", http_status: 401, message: authError?.message || "no_user" });
        return tracedJsonResponse(ctx, { ok: false, error: "Unauthorized", phase: "auth" }, 401);
      }

      const caller = await getCallerProfile(adminClient, authData.user.id);
      if (!caller.isSuperAdmin && !isInternalRequest(req)) {
        traceLog(ctx, "forbidden", { phase: "auth", http_status: 403, email: caller.email });
        return tracedJsonResponse(ctx, { ok: false, error: "Only super admins can use NucleiScan360", phase: "auth" }, 403);
      }
      authUserId = authData.user.id;
      callerEmail = authData.user.email || caller.email;
    }

    let payload: Record<string, unknown>;

    if (action === "direct_scan") {
      payload = await directScan(body);
    } else if (action === "enqueue") {
      payload = await enqueueJobs(adminClient, body, authUserId, callerEmail);
    } else if (action === "start_lab_scan") {
      payload = await startLabScan(adminClient, body, authUserId, callerEmail);
    } else if (action === "list") {
      payload = await listJobs(adminClient, body);
    } else if (action === "get") {
      payload = await getJob(adminClient, body);
    } else if (action === "retrieve_targets") {
      payload = await retrieveTargets(adminClient, body);
    } else if (action === "process_queue") {
      payload = await processQueue(adminClient, body);
    } else if (action === "smoke_test") {
      payload = await smokeTest(adminClient, body);
    } else {
      traceLog(ctx, "unsupported_action", { phase: "routing", http_status: 400 });
      return tracedJsonResponse(ctx, { ok: false, error: "Unsupported action", phase: "routing" }, 400);
    }

    const responseOk = payload.ok !== false;
    traceLog(ctx, responseOk ? "ok" : "completed_with_warnings", {
      phase: action,
      http_status: 200,
      queued_count: payload.queued_count,
      processed_count: payload.processed_count,
      warning_count: Array.isArray(payload.warnings) ? payload.warnings.length : 0,
    });
    return tracedJsonResponse(ctx, { ok: responseOk, action, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isAbort = error instanceof DOMException && error.name === "AbortError";
    const status = message.includes("not configured") ? 503 : isAbort ? 504 : 400;
    const phase = isAbort ? "timeout" : action;
    traceLog(ctx, "error", { phase, http_status: status, message });
    return tracedJsonResponse(ctx, { ok: false, error: isAbort ? "NucleiScan360 timeout" : message, phase }, status);
  }
});
