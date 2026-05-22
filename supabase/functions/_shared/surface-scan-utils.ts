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
  userType: string;
  organizationId: string | null;
  canManageAllOrganizations: boolean;
  isSuperAdmin: boolean;
  isAdminLike: boolean;
}

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const BLOCKED_HOSTS = new Set(["localhost"]);
const BLOCKED_SCHEMES = new Set(["file:", "ftp:", "ws:", "wss:"]);

export const isAllowedProfile = (profile: string): profile is ScanProfile =>
  (ALLOWED_PROFILES as readonly string[]).includes(profile);

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function isValidIPv4(value: string): boolean {
  return IPV4_REGEX.test(value);
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
    .select("auth_user_id, user_type, organization_id")
    .eq("auth_user_id", authUserId)
    .single();

  if (userError || !userRow) {
    throw new Error("Profilo utente non trovato");
  }

  const [manageRes, roleRes] = await Promise.all([
    adminClient.rpc("can_manage_all_organizations", { _user_id: authUserId }),
    adminClient.rpc("has_role", { _user_id: authUserId, _role: "super_admin" }),
  ]);

  return {
    authUserId,
    userType: userRow.user_type,
    organizationId: userRow.organization_id,
    canManageAllOrganizations: Boolean(manageRes.data),
    isSuperAdmin: Boolean(roleRes.data),
    isAdminLike: userRow.user_type === "admin" || Boolean(roleRes.data),
  };
}

export function assertCustomerAccess(
  caller: CallerProfile,
  customerId: string,
): void {
  const canAccess = caller.canManageAllOrganizations || caller.organizationId === customerId;
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

export function toSeverity(value: string): "info" | "low" | "medium" | "high" | "critical" {
  const normalized = (value || "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  if (normalized === "low") return "low";
  return "info";
}
