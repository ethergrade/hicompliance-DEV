export type AmassMode = "active_light";

export interface AmassServiceRequest {
  target: string;
  root_domain: string | null;
  mode: AmassMode;
  timeout_seconds: number;
  max_names: number;
  scan_job_id: string;
}

export interface AmassDiscoveryResult {
  subdomains: string[];
  ips: string[];
  warnings: string[];
  duration_ms: number | null;
  amass_version: string | null;
  raw: Record<string, unknown>;
}

interface RunAmassDiscoveryOptions {
  serviceUrl: string;
  sharedSecret: string;
  target: string;
  rootDomain: string | null;
  scanJobId: string;
  timeoutSeconds?: number;
  maxNames?: number;
  fetchFn?: typeof fetch;
}

interface ResolveAmassDiscoveryGateOptions {
  featureEnabled: boolean;
  serviceUrl: string;
  sharedSecret: string;
  jobConfig: Record<string, unknown>;
  targetType: string;
  rootDomain: string | null;
}

export interface AmassDiscoveryGate {
  enabled: boolean;
  reason: string | null;
}

const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV6_LIKE_REGEX = /^[0-9a-f:]+$/i;

function normalizeHostname(value: unknown): string | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\*\./, "")
    .replace(/\.$/, "");
  if (!normalized || normalized.length > 253) return null;
  if (!normalized.includes(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(normalized)) return null;
  if (!normalized.split(".").every((label) =>
    label.length > 0 &&
    label.length <= 63 &&
    !label.startsWith("-") &&
    !label.endsWith("-")
  )) {
    return null;
  }
  return normalized;
}

function normalizeIp(value: unknown): string | null {
  const normalized = String(value || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized) return null;
  if (IPV4_REGEX.test(normalized)) return normalized;
  if (normalized.includes(":") && IPV6_LIKE_REGEX.test(normalized)) return normalized;
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function collectFromEntry(entry: unknown, hostSet: Set<string>, ipSet: Set<string>) {
  if (!entry || typeof entry !== "object") {
    const host = normalizeHostname(entry);
    if (host) hostSet.add(host);
    const ip = normalizeIp(entry);
    if (ip) ipSet.add(ip);
    return;
  }

  const obj = entry as Record<string, unknown>;
  for (const key of ["name", "domain", "hostname", "host", "subdomain", "fqdn"]) {
    const host = normalizeHostname(obj[key]);
    if (host) hostSet.add(host);
  }
  for (const key of ["ip", "address", "addr", "ipv4", "ipv6"]) {
    const ip = normalizeIp(obj[key]);
    if (ip) ipSet.add(ip);
  }
  for (const key of ["addresses", "ips", "ip_addresses", "resolved_ips"]) {
    for (const ipValue of asStringArray(obj[key])) {
      const ip = normalizeIp(ipValue);
      if (ip) ipSet.add(ip);
    }
  }
}

export function buildAmassServiceRequest(options: {
  target: string;
  rootDomain: string | null;
  scanJobId: string;
  timeoutSeconds: number;
  maxNames: number;
}): AmassServiceRequest {
  return {
    target: options.target,
    root_domain: options.rootDomain,
    mode: "active_light",
    timeout_seconds: options.timeoutSeconds,
    max_names: options.maxNames,
    scan_job_id: options.scanJobId,
  };
}

export function resolveAmassDiscoveryGate(options: ResolveAmassDiscoveryGateOptions): AmassDiscoveryGate {
  if (!options.featureEnabled) return { enabled: false, reason: "feature_flag_disabled" };
  const amassConfig = options.jobConfig?.amass && typeof options.jobConfig.amass === "object"
    ? options.jobConfig.amass as Record<string, unknown>
    : {};
  if (amassConfig.enabled !== true) return { enabled: false, reason: "job_toggle_disabled" };
  if (!String(options.serviceUrl || "").trim()) return { enabled: false, reason: "missing_service_url" };
  if (!String(options.sharedSecret || "").trim()) return { enabled: false, reason: "missing_shared_secret" };
  if (!["domain", "subdomain", "url"].includes(String(options.targetType || ""))) {
    return { enabled: false, reason: "target_not_domain" };
  }
  if (!String(options.rootDomain || "").trim()) return { enabled: false, reason: "missing_root_domain" };
  return { enabled: true, reason: null };
}

export function normalizeAmassServiceResponse(payload: unknown, maxNames = 250): AmassDiscoveryResult {
  const raw = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const hostSet = new Set<string>();
  const ipSet = new Set<string>();
  const warnings = asStringArray(raw.warnings);

  for (const key of ["subdomains", "names", "hostnames", "hosts", "domains"]) {
    for (const hostValue of asStringArray(raw[key])) {
      const host = normalizeHostname(hostValue);
      if (host) hostSet.add(host);
    }
  }
  for (const key of ["ips", "ip_addresses", "addresses", "resolved_ips"]) {
    for (const ipValue of asStringArray(raw[key])) {
      const ip = normalizeIp(ipValue);
      if (ip) ipSet.add(ip);
    }
  }
  for (const key of ["results", "records", "findings", "assets"]) {
    const entries = Array.isArray(raw[key]) ? raw[key] as unknown[] : [];
    for (const entry of entries) collectFromEntry(entry, hostSet, ipSet);
  }

  return {
    subdomains: [...hostSet].sort().slice(0, Math.max(0, maxNames)),
    ips: [...ipSet].sort().slice(0, Math.max(0, maxNames)),
    warnings,
    duration_ms: Number.isFinite(Number(raw.duration_ms)) ? Number(raw.duration_ms) : null,
    amass_version: String(raw.amass_version || raw.version || "").trim() || null,
    raw,
  };
}

export function buildAmassEndpoint(serviceUrl: string): string {
  const url = new URL(serviceUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/amass/enum`;
  return url.toString();
}

export async function runAmassDiscovery(options: RunAmassDiscoveryOptions): Promise<AmassDiscoveryResult> {
  const timeoutSeconds = Math.max(10, Math.min(120, Number(options.timeoutSeconds || 45)));
  const maxNames = Math.max(1, Math.min(500, Number(options.maxNames || 250)));
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), (timeoutSeconds + 5) * 1000);
  const fetchImpl = options.fetchFn || fetch;

  try {
    const response = await fetchImpl(buildAmassEndpoint(options.serviceUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.sharedSecret}`,
      },
      body: JSON.stringify(buildAmassServiceRequest({
        target: options.target,
        rootDomain: options.rootDomain,
        scanJobId: options.scanJobId,
        timeoutSeconds,
        maxNames,
      })),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage = String((body as any)?.error || (body as any)?.message || `amass_http_${response.status}`);
      throw new Error(errorMessage);
    }

    return normalizeAmassServiceResponse(body, maxNames);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
