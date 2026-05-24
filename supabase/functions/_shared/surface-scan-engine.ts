import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import {
  classifyTargetScope,
  classifyHostForScope,
  fetchWithTimeout,
  isIpWithinMonitoredScope,
  normalizeTargetInput,
  resolveWithDnsOverHttps,
  splitMonitoredScopeRules,
  toSeverity,
  TargetType,
} from "./surface-scan-utils.ts";

interface SurfaceScanJob {
  id: string;
  organization_id?: string | null;
  tenant_id: string | null;
  customer_id: string | null;
  requested_by: string | null;
  raw_target: string;
  normalized_target: string;
  target_type: TargetType;
  hostname: string | null;
  root_domain: string | null;
  resolved_ips: string[] | null;
  scan_profile: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}

interface RunOptions {
  initiatedByUserId?: string | null;
  force?: boolean;
}

interface DispatchQueueOptions {
  initiatedByUserId?: string | null;
  maxToStart?: number;
}

interface FindingInput {
  provider?: string;
  module?: string;
  finding_type: string;
  title: string;
  description?: string;
  severity?: string;
  affected_asset?: string | null;
  affected_url?: string | null;
  ip?: string | null;
  port?: number | null;
  protocol?: string | null;
  cve?: string[] | null;
  cwe?: string[] | null;
  cvss?: number | null;
  epss?: number | null;
  cisa_kev?: boolean;
  remediation?: string | null;
  evidence?: Record<string, unknown>;
  attribution_confidence?: string;
  status?: string;
}

interface ObservationInput {
  module: string;
  observation_type: string;
  title: string;
  value: Record<string, unknown>;
  severity?: string;
  confidence?: string;
  asset_id?: string | null;
}

interface AssetInput {
  asset_type: string;
  asset_value: string;
  hostname?: string | null;
  root_domain?: string | null;
  ip?: string | null;
  source: string;
  confidence?: string;
  raw?: Record<string, unknown>;
}

type ModuleStatus = "queued" | "running" | "success" | "skipped" | "error" | "timeout";

interface ModuleExecutionConfig {
  key: string;
  label: string;
  timeoutMs: number;
  featureFlag?: string;
}

interface ModuleExecutionRecord {
  key: string;
  label: string;
  status: ModuleStatus;
  severity?: "info" | "low" | "medium" | "high" | "critical";
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  error_message?: string | null;
  source?: string | null;
}

function severityRank(severity: string): number {
  switch (toSeverity(severity)) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    default:
      return 1;
  }
}

const CRITICAL_EXPOSED_PORTS = new Set([3389, 5900, 6379, 9200, 9300, 27017, 11211]);
const HIGH_EXPOSED_PORTS = new Set([21, 23, 445, 3306, 5432, 1521, 5060]);
const MEDIUM_EXPOSED_PORTS = new Set([22, 25, 8080, 8443, 9443, 8000, 9000, 9090, 8081]);
const INFO_EXPOSED_PORTS = new Set([80, 443, 587, 993, 995, 53, 110, 143, 465]);
const COMMON_PORTS = [
  20, 21, 22, 23, 25, 53, 67, 68, 69, 80, 110, 119, 123, 143, 156,
  161, 162, 179, 194, 389, 443, 587, 993, 995, 3000, 3306, 3389,
  5060, 5900, 8000, 8080, 8888, 8443, 9443, 9200, 9300, 5432, 6379,
  27017, 11211, 1521, 8081, 9000, 9090,
];

function severityForExposedPort(
  port: number,
): "info" | "low" | "medium" | "high" | "critical" {
  if (CRITICAL_EXPOSED_PORTS.has(port)) return "critical";
  if (HIGH_EXPOSED_PORTS.has(port)) return "high";
  if (MEDIUM_EXPOSED_PORTS.has(port)) return "medium";
  if (INFO_EXPOSED_PORTS.has(port)) return "info";
  if (COMMON_PORTS.includes(port)) return "low";
  return "low";
}

function remediationForExposedPort(port: number): string {
  if (port === 23) {
    return "Disabilitare Telnet e sostituire con SSH; consentire accesso solo via VPN/allowlist.";
  }
  if (port === 3389) {
    return "Non esporre RDP su Internet. Usare VPN/ZTNA, MFA e allowlist IP.";
  }
  if (port === 445) {
    return "Non esporre SMB su Internet. Limitare accesso a rete privata.";
  }
  if ([3306, 5432, 1433, 1521, 27017].includes(port)) {
    return "Non esporre database pubblicamente. Applicare firewall, private networking e bastion.";
  }
  if ([9200, 9300, 6379, 11211].includes(port)) {
    return "Limitare esposizione di servizi backend/cache e attivare autenticazione forte.";
  }
  if ([8080, 8443, 9443, 9000, 9090].includes(port)) {
    return "Verificare pannelli admin esposti: proteggere con auth forte, MFA e restrizioni IP.";
  }
  return "Confermare necessità della porta e applicare principio di minima esposizione.";
}

interface SurfaceScoreBreakdown {
  transportScore: number;
  dnsScore: number;
  httpSecurityScore: number;
  exposureScore: number;
  reputationScore: number;
  qualityScore: number;
  domainHygieneScore: number;
  overallScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function riskLevelFromScore(score: number): "low" | "medium" | "high" | "critical" {
  const normalized = clampScore(score);
  if (normalized >= 85) return "low";
  if (normalized >= 70) return "medium";
  if (normalized >= 50) return "high";
  return "critical";
}

type AttributionConfidence = "low" | "medium" | "high";

interface ShodanAttributionFactor {
  score: number;
  confidence: AttributionConfidence;
  allowDomainAttribution: boolean;
  allowIpAttribution: boolean;
  sharedRisk: boolean;
  reasons: string[];
}

function clampAttributionScore(rawScore: number): number {
  return Math.max(0, Math.min(1, Math.round(rawScore * 100) / 100));
}

function confidenceFromScore(score: number): AttributionConfidence {
  if (score >= 0.82) return "high";
  if (score >= 0.62) return "medium";
  return "low";
}

function computeShodanAttributionFactor(params: {
  hostMatch: boolean;
  rootDomain: string | null;
  hostnames: string[];
  unrelatedHostnames: number;
  hostingContext: string;
}): ShodanAttributionFactor {
  const reasons: string[] = [];
  let score = 0.15;

  if (params.hostMatch) {
    score += 0.38;
    reasons.push("hostname_match");
  } else {
    score -= 0.25;
    reasons.push("hostname_mismatch");
  }

  const normalizedRoot = (params.rootDomain || "").toLowerCase();
  if (normalizedRoot) {
    const rootAligned = params.hostnames.some((host) => {
      const normalized = String(host || "").toLowerCase();
      return normalized === normalizedRoot || normalized.endsWith(`.${normalizedRoot}`);
    });
    if (rootAligned) {
      score += 0.16;
      reasons.push("root_domain_alignment");
    } else {
      score -= 0.08;
      reasons.push("root_domain_not_seen");
    }
  }

  if (params.unrelatedHostnames === 0) {
    score += 0.2;
    reasons.push("no_unrelated_hosts");
  } else if (params.unrelatedHostnames <= 2) {
    score += 0.12;
    reasons.push("few_unrelated_hosts");
  } else if (params.unrelatedHostnames <= 5) {
    score += 0.03;
    reasons.push("some_unrelated_hosts");
  } else {
    score -= 0.28;
    reasons.push("many_unrelated_hosts");
  }

  if (params.hostingContext === "dedicated") {
    score += 0.12;
    reasons.push("hosting_dedicated");
  } else if (params.hostingContext === "unknown") {
    score += 0.02;
    reasons.push("hosting_unknown");
  } else if (params.hostingContext === "cdn_proxy") {
    score -= 0.1;
    reasons.push("hosting_cdn_proxy");
  } else if (params.hostingContext === "shared_hosting") {
    score -= 0.45;
    reasons.push("hosting_shared");
  }

  const sharedRisk = params.hostingContext === "shared_hosting" || params.unrelatedHostnames > 6;
  if (sharedRisk) {
    score -= 0.2;
    reasons.push("shared_risk_guard");
  }

  const normalizedScore = clampAttributionScore(score);
  const confidence = confidenceFromScore(normalizedScore);
  const allowDomainAttribution =
    !sharedRisk && params.hostMatch && normalizedScore >= 0.65;
  const allowIpAttribution =
    !sharedRisk &&
    params.hostMatch &&
    normalizedScore >= 0.78 &&
    params.unrelatedHostnames <= 1 &&
    params.hostingContext !== "cdn_proxy";

  return {
    score: normalizedScore,
    confidence,
    allowDomainAttribution,
    allowIpAttribution,
    sharedRisk,
    reasons,
  };
}

function parseDmarcPolicy(record: string): string | null {
  const match = record.match(/(?:^|;)\s*p=([a-zA-Z]+)/i);
  return match?.[1]?.toLowerCase() || null;
}

function parseHostFromMxRecord(mx: string): string {
  const parts = mx.trim().split(/\s+/);
  return (parts.length > 1 ? parts[1] : parts[0]).replace(/\.$/, "");
}

function looksSensitivePath(path: string): boolean {
  const patterns = [
    "/admin",
    "/backup",
    "/old",
    "/private",
    "/wp-admin",
    "/.git",
    "/.env",
    "/test",
    "/staging",
  ];
  const lowered = path.toLowerCase();
  return patterns.some((p) => lowered.includes(p));
}

function isValidHostnameCandidate(value: string): boolean {
  const candidate = value.trim().toLowerCase().replace(/\.$/, "");
  if (!candidate || candidate.length > 253) return false;
  if (!candidate.includes(".")) return false;
  if (!/^[a-z0-9.-]+$/.test(candidate)) return false;
  return candidate.split(".").every((label) => label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"));
}

function buildIpv6PtrName(ipv6: string): string | null {
  const normalized = ipv6.trim().toLowerCase();
  if (!normalized) return null;
  const expanded = (() => {
    const parts = normalized.split("::");
    if (parts.length > 2) return null;
    const left = parts[0] ? parts[0].split(":").filter(Boolean) : [];
    const right = parts[1] ? parts[1].split(":").filter(Boolean) : [];
    if (left.length + right.length > 8) return null;
    const missing = 8 - (left.length + right.length);
    const full = [...left, ...Array(missing).fill("0"), ...right].map((chunk) => chunk.padStart(4, "0"));
    if (full.length !== 8) return null;
    return full.join("");
  })();

  if (!expanded || !/^[0-9a-f]{32}$/.test(expanded)) return null;
  return `${expanded.split("").reverse().join(".")}.ip6.arpa`;
}

function enqueueBackgroundTask(task: Promise<void>): boolean {
  const edgeRuntime = (globalThis as any)?.EdgeRuntime;
  if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
    edgeRuntime.waitUntil(task);
    return true;
  }
  return false;
}

function isFeatureEnabled(flagName: string | undefined, defaultEnabled = true): boolean {
  if (!flagName) return true;
  const value = String(Deno.env.get(flagName) ?? "").trim().toLowerCase();
  if (!value) return defaultEnabled;
  if (["0", "false", "off", "no", "disabled"].includes(value)) return false;
  if (["1", "true", "on", "yes", "enabled"].includes(value)) return true;
  return defaultEnabled;
}

export async function dispatchSurfaceScanQueue(
  adminClient: SupabaseClient,
  organizationId: string,
  options: DispatchQueueOptions = {},
): Promise<string[]> {
  const nowIso = new Date().toISOString();
  const stalePendingCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const staleRunningCutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();

  const [stalePendingRes, staleRunningRes] = await Promise.all([
    adminClient
      .from("surface_scan_jobs" as any)
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .lt("created_at", stalePendingCutoff)
      .limit(50),
    adminClient
      .from("surface_scan_jobs" as any)
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "running")
      .lt("started_at", staleRunningCutoff)
      .limit(50),
  ]);

  const stalePendingIds = (stalePendingRes.data || [])
    .map((row: any) => String(row?.id || "").trim())
    .filter(Boolean);
  const staleRunningIds = (staleRunningRes.data || [])
    .map((row: any) => String(row?.id || "").trim())
    .filter(Boolean);

  if (stalePendingIds.length > 0) {
    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "failed",
        completed_at: nowIso,
        error_message: "Queue timeout while pending",
      })
      .in("id", stalePendingIds);

    await adminClient.from("surface_scan_audit_log" as any).insert(
      stalePendingIds.map((id: string) => ({
        scan_job_id: id,
        user_id: options.initiatedByUserId || null,
        action: "scan_auto_failed_pending_timeout",
        details: { reason: "pending_timeout_10m" },
      })),
    );
  }

  if (staleRunningIds.length > 0) {
    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "failed",
        completed_at: nowIso,
        error_message: "Scan timed out while running",
      })
      .in("id", staleRunningIds);

    await adminClient.from("surface_scan_audit_log" as any).insert(
      staleRunningIds.map((id: string) => ({
        scan_job_id: id,
        user_id: options.initiatedByUserId || null,
        action: "scan_auto_failed_timeout",
        details: { reason: "running_timeout_45m" },
      })),
    );
  }

  const maxConcurrent = 3;
  const maxToStart = options.maxToStart ?? maxConcurrent;

  const runningRes = await adminClient
    .from("surface_scan_jobs" as any)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["pending", "running"]);

  const runningCount = runningRes.count || 0;
  let freeSlots = Math.max(0, maxConcurrent - runningCount);
  freeSlots = Math.min(freeSlots, Math.max(0, maxToStart));

  if (freeSlots <= 0) {
    return [];
  }

  const { data: queuedJobs } = await adminClient
    .from("surface_scan_jobs" as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(freeSlots);

  const startedJobIds: string[] = [];
  for (const jobRow of (queuedJobs || []) as SurfaceScanJob[]) {
    const { data: claimedJob, error: claimError } = await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "pending",
        error_message: null,
      })
      .eq("id", jobRow.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();

    if (claimError || !claimedJob) {
      continue;
    }

    startedJobIds.push(claimedJob.id);

    const runTask = runSurfaceScanEnrichment(adminClient, claimedJob as SurfaceScanJob, {
      initiatedByUserId: options.initiatedByUserId || claimedJob.requested_by || null,
      force: false,
    }).catch((error) => {
      console.error("[surface-scan-queue] run task failed:", error);
    });

    if (!enqueueBackgroundTask(runTask)) {
      await runTask;
    }
  }

  return startedJobIds;
}

export async function runSurfaceScanEnrichment(
  adminClient: SupabaseClient,
  job: SurfaceScanJob,
  options: RunOptions = {},
): Promise<void> {
  const organizationId = job.customer_id || job.organization_id || null;
  const customerId = organizationId;
  const tenantId = job.tenant_id || organizationId;

  if (!organizationId) {
    throw new Error("Job organization/customer missing");
  }

  if (!options.force && ["running", "completed"].includes(job.status)) {
    return;
  }

  const parsedTarget = normalizeTargetInput(job.normalized_target);
  const hostname = parsedTarget.hostname || job.hostname || null;
  const rootDomain = parsedTarget.root_domain || job.root_domain || null;
  const targetUrl = parsedTarget.normalized_target;
  const seenAssetKeys = new Set<string>();
  const seenFindingKeys = new Set<string>();
  const { data: monitoredScopeRows } = await adminClient
    .from("surface_scan_monitored_ips" as any)
    .select("entry_type, input_value, ip_start, ip_end")
    .eq("organization_id", organizationId);
  const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules((monitoredScopeRows || []) as any[]);

  const scopeCounters = {
    in_scope: 0,
    excluded_by_scope: 0,
    excluded_shared_noise: 0,
  };

  const scopeReasonFromHost = (candidateHost: string): "scope_excluded_domain" | "scope_excluded_shared_noise" | null => {
    const classified = classifyHostForScope(candidateHost, scopeDomains);
    if (classified.blocked) return "scope_excluded_shared_noise";
    if (!classified.inScope) return "scope_excluded_domain";
    return null;
  };

  const scopeReasonFromIp = (candidateIp: string): "scope_excluded_ip" | null => {
    if (!candidateIp) return null;
    return isIpWithinMonitoredScope(candidateIp, ipScopeRules) ? null : "scope_excluded_ip";
  };

  const isIpAllowedInScope = (candidateIp: string): boolean => scopeReasonFromIp(candidateIp) === null;
  const classifyHostAgainstScope = (candidateHost: string) => {
    const base = classifyHostForScope(candidateHost, scopeDomains);
    const reason = scopeReasonFromHost(candidateHost);
    return {
      ...base,
      blocked: reason !== null,
      reason,
    };
  };
  const shouldAcceptScannableHost = (candidateHost: string): boolean => scopeReasonFromHost(candidateHost) === null;

  const addScopeCounter = (reason: string | null) => {
    if (!reason) {
      scopeCounters.in_scope += 1;
      return;
    }
    if (reason === "scope_excluded_shared_noise") {
      scopeCounters.excluded_shared_noise += 1;
      return;
    }
    scopeCounters.excluded_by_scope += 1;
  };

  const addScopeRaw = (
    raw: Record<string, unknown> | undefined,
    reason: string | null,
  ): Record<string, unknown> => {
    const nextRaw: Record<string, unknown> = { ...(raw || {}) };
    if (reason) {
      nextRaw._scope_excluded = true;
      nextRaw._scope_exclusion_reason = reason;
      nextRaw._scope_excluded_at = new Date().toISOString();
    } else if (nextRaw._scope_excluded === undefined) {
      nextRaw._scope_excluded = false;
      nextRaw._scope_exclusion_reason = null;
    }
    return nextRaw;
  };

  if (options.force) {
    await Promise.all([
      adminClient.from("surface_assets" as any).delete().eq("scan_job_id", job.id),
      adminClient.from("surface_observations" as any).delete().eq("scan_job_id", job.id),
      adminClient.from("surface_findings" as any).delete().eq("scan_job_id", job.id),
      adminClient.from("surface_external_intel" as any).delete().eq("scan_job_id", job.id),
      adminClient.from("surface_scan_module_results" as any).delete().eq("scan_job_id", job.id),
    ]);
  }

  const insertObservation = async (input: ObservationInput) => {
    await adminClient.from("surface_observations" as any).insert({
      organization_id: organizationId,
      tenant_id: tenantId,
      customer_id: customerId,
      scan_job_id: job.id,
      asset_id: input.asset_id || null,
      module: input.module,
      observation_type: input.observation_type,
      title: input.title,
      value: input.value,
      severity: toSeverity(input.severity || "info"),
      confidence: input.confidence || "medium",
    });
  };

  const insertFinding = async (input: FindingInput) => {
    const findingKey = [
      input.provider || "surface_scan_engine",
      input.module || "generic",
      input.finding_type,
      input.title,
      input.affected_asset || "",
      input.affected_url || "",
      input.ip || "",
      String(input.port || ""),
    ]
      .join("|")
      .toLowerCase();

    if (seenFindingKeys.has(findingKey)) return;
    seenFindingKeys.add(findingKey);

    let findingScopeReason: "scope_excluded_domain" | "scope_excluded_ip" | "scope_excluded_shared_noise" | null =
      null;

    const findingIp = String(
      input.ip ||
        (typeof input.evidence?.ip === "string" ? input.evidence.ip : ""),
    )
      .trim()
      .toLowerCase();
    if (findingIp) {
      findingScopeReason = scopeReasonFromIp(findingIp);
    }

    if (!findingScopeReason) {
      let findingHost = "";
      const affectedUrl = String(input.affected_url || "").trim();
      if (affectedUrl) {
        try {
          findingHost = new URL(affectedUrl).hostname.toLowerCase();
        } catch {
          findingHost = affectedUrl.toLowerCase();
        }
      } else {
        findingHost = String(input.affected_asset || "").trim().toLowerCase();
      }
      if (findingHost && !findingHost.includes(":") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(findingHost)) {
        findingScopeReason = scopeReasonFromHost(findingHost);
      }
    }

    const evidenceWithScope = addScopeRaw(input.evidence || {}, findingScopeReason);

    await adminClient.from("surface_findings" as any).insert({
      organization_id: organizationId,
      tenant_id: tenantId,
      customer_id: customerId,
      scan_job_id: job.id,
      provider: input.provider || "surface_scan_engine",
      module: input.module || "generic",
      finding_type: input.finding_type,
      title: input.title,
      description: input.description || null,
      severity: toSeverity(input.severity || "info"),
      affected_asset: input.affected_asset || null,
      affected_url: input.affected_url || null,
      ip: input.ip || null,
      port: input.port || null,
      protocol: input.protocol || null,
      cve: input.cve || [],
      cwe: input.cwe || [],
      cvss: input.cvss || null,
      epss: input.epss || null,
      cisa_kev: input.cisa_kev || false,
      remediation: input.remediation || null,
      evidence: evidenceWithScope,
      attribution_confidence: input.attribution_confidence || "medium",
      status: input.status || "open",
    });
  };

  const insertAsset = async (input: AssetInput): Promise<string | null> => {
    const assetValue = String(input.asset_value || "").trim().toLowerCase();
    const assetKey = [input.asset_type, assetValue, input.source].join("|");
    if (!assetValue || seenAssetKeys.has(assetKey)) return null;
    seenAssetKeys.add(assetKey);

    let scopeReason: "scope_excluded_domain" | "scope_excluded_ip" | "scope_excluded_shared_noise" | null =
      null;

    const ipCandidate = String(
      input.ip ||
        (input.asset_type === "ip" ? input.asset_value : "") ||
        (input.asset_type === "open_port" ? String(input.asset_value || "").split(":")[0] : ""),
    )
      .trim()
      .toLowerCase();
    if (ipCandidate) {
      scopeReason = scopeReasonFromIp(ipCandidate);
    }

    if (!scopeReason) {
      const hostCandidate = String(input.hostname || "").trim().toLowerCase();
      const hostScopedTypes = new Set(["domain", "subdomain", "reverse_dns_hostname", "url", "mx_host", "ns_host"]);
      if (hostCandidate && hostScopedTypes.has(String(input.asset_type || "").toLowerCase())) {
        scopeReason = scopeReasonFromHost(hostCandidate);
      }
    }

    const rawWithScope = addScopeRaw(input.raw, scopeReason);
    addScopeCounter(scopeReason);

    const { data, error } = await adminClient
      .from("surface_assets" as any)
      .insert({
        organization_id: organizationId,
        tenant_id: tenantId,
        customer_id: customerId,
        scan_job_id: job.id,
        asset_type: input.asset_type,
        asset_value: input.asset_value,
        hostname: input.hostname || null,
        root_domain: input.root_domain || null,
        ip: input.ip || null,
        source: input.source,
        confidence: scopeReason ? "low" : input.confidence || "medium",
        raw: rawWithScope,
      })
      .select("id")
      .single();

    if (error) return null;
    return data?.id || null;
  };

  const insertExternalIntel = async (
    provider: string,
    target: string,
    found: boolean,
    summary: Record<string, unknown>,
    rawResponse: Record<string, unknown>,
    confidence = "medium",
  ) => {
    await adminClient.from("surface_external_intel" as any).insert({
      organization_id: organizationId,
      tenant_id: tenantId,
      customer_id: customerId,
      scan_job_id: job.id,
      provider,
      target,
      found,
      summary,
      raw_response: rawResponse,
      confidence,
    });
  };

  const logAudit = async (action: string, details: Record<string, unknown>) => {
    await adminClient.from("surface_scan_audit_log" as any).insert({
      scan_job_id: job.id,
      user_id: options.initiatedByUserId || job.requested_by,
      action,
      details,
    });
  };

  const moduleExecution = new Map<string, ModuleExecutionRecord>();

  const upsertModuleResult = async (
    config: ModuleExecutionConfig,
    status: ModuleStatus,
    payload: {
      severity?: "info" | "low" | "medium" | "high" | "critical";
      startedAt?: string;
      completedAt?: string;
      durationMs?: number;
      errorMessage?: string | null;
      source?: string | null;
      normalized?: Record<string, unknown>;
      raw?: Record<string, unknown>;
    } = {},
  ) => {
    const record: ModuleExecutionRecord = {
      key: config.key,
      label: config.label,
      status,
      severity: payload.severity,
      started_at: payload.startedAt,
      completed_at: payload.completedAt,
      duration_ms: payload.durationMs,
      error_message: payload.errorMessage ?? null,
      source: payload.source ?? null,
    };
    moduleExecution.set(config.key, record);

    await adminClient.from("surface_scan_module_results" as any).upsert({
      organization_id: organizationId,
      tenant_id: tenantId,
      customer_id: customerId,
      scan_job_id: job.id,
      module_key: config.key,
      module_label: config.label,
      status,
      severity: payload.severity || "info",
      source: payload.source || null,
      normalized: payload.normalized || {},
      raw: payload.raw || {},
      started_at: payload.startedAt || null,
      completed_at: payload.completedAt || null,
      duration_ms: payload.durationMs || null,
      error_message: payload.errorMessage || null,
    }, { onConflict: "scan_job_id,module_key" });
  };

  const triggerAutoReportRepository = async () => {
    const autoReportEnabled =
      String(Deno.env.get("SURFACESCAN_AUTO_REPORT_ENABLED") || "true").toLowerCase() !== "false";
    if (!autoReportEnabled) {
      await logAudit("scan_report_auto_skipped", { reason: "auto_report_disabled" });
      return;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRole) {
      await logAudit("scan_report_auto_failed", { reason: "missing_supabase_env" });
      return;
    }

    const internalSecret =
      Deno.env.get("SURFACESCAN_REPORT_INTERNAL_SECRET") ||
      Deno.env.get("SURFACESCAN_INTERNAL_REPORT_SECRET") ||
      "";

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRole}`,
      };
      if (internalSecret) {
        headers["x-surface-internal-secret"] = internalSecret;
      }

      const reportRes = await fetch(`${supabaseUrl}/functions/v1/surfacescan360-ai-report`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          organization_id: organizationId,
          job_id: job.id,
          trigger_source: "auto_on_complete",
          force_regenerate: false,
          created_by: options.initiatedByUserId || job.requested_by || null,
        }),
      });

      const reportBody = await reportRes.json().catch(() => ({}));
      if (!reportRes.ok || reportBody?.error) {
        await logAudit("scan_report_auto_failed", {
          status: reportRes.status,
          error: reportBody?.error || "unknown_error",
        });
        return;
      }

      await logAudit("scan_report_auto_generated", {
        repository_id: reportBody?.repository_id || null,
        reused_existing: Boolean(reportBody?.existing),
      });
    } catch (error: any) {
      await logAudit("scan_report_auto_failed", {
        error: error?.message || String(error),
      });
    }
  };

  const triggerCveEnrichmentQueue = async () => {
    const autoCveEnrichmentEnabled =
      String(Deno.env.get("SURFACESCAN_AUTO_CVE_ENRICHMENT_ENABLED") || "true").toLowerCase() !== "false";
    if (!autoCveEnrichmentEnabled) return;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRole) {
      await logAudit("scan_cve_enrichment_trigger_failed", { reason: "missing_supabase_env" });
      return;
    }

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/cve-enrichment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRole}`,
        },
        body: JSON.stringify({
          trigger: "surface_scan_complete",
          max_per_run: 1,
          drain_all: false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.error) {
        await logAudit("scan_cve_enrichment_trigger_failed", {
          status: res.status,
          error: body?.error || "unknown_error",
        });
        return;
      }
      await logAudit("scan_cve_enrichment_triggered", {
        processed_count: body?.processed_count ?? null,
        mode: body?.mode ?? null,
      });
    } catch (error: any) {
      await logAudit("scan_cve_enrichment_trigger_failed", {
        error: error?.message || String(error),
      });
    }
  };

  await adminClient
    .from("surface_scan_jobs" as any)
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", job.id);

  await logAudit("scan_started", {
    scan_profile: job.scan_profile,
    target: job.normalized_target,
  });

  const targetScopeDecision = classifyTargetScope(parsedTarget, scopeDomains, ipScopeRules);
  if (!targetScopeDecision.allowed) {
    const scopeGuardModule: ModuleExecutionConfig = {
      key: "scope_guard",
      label: "Scope Guard",
      timeoutMs: 1000,
    };
    const nowIso = new Date().toISOString();
    await upsertModuleResult(scopeGuardModule, "skipped", {
      severity: "info",
      startedAt: nowIso,
      completedAt: nowIso,
      durationMs: 0,
      normalized: {
        code: targetScopeDecision.code,
        reason: targetScopeDecision.reason,
      },
    });
    await insertObservation({
      module: "scope_guard",
      observation_type: "scope_guard_blocked_target",
      title: "Target blocked by scope guard",
      value: {
        code: targetScopeDecision.code,
        reason: targetScopeDecision.reason,
        normalized_target: parsedTarget.normalized_target,
        target_type: parsedTarget.target_type,
        hostname: parsedTarget.hostname,
      },
      severity: "info",
    });
    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "completed",
        completed_at: nowIso,
        hosting_context:
          targetScopeDecision.code === "target_out_of_scope_shared_noise" ? "excluded_noise" : "excluded_scope",
        shodan_status: "scope_blocked",
        resolved_ips: job.resolved_ips || [],
        summary: {
          overall_score: 0,
          risk_level: "high",
          scope_guard: {
            blocked: true,
            code: targetScopeDecision.code,
            reason: targetScopeDecision.reason,
          },
        },
      })
      .eq("id", job.id);
    await logAudit("scan_scope_guard_blocked", {
      code: targetScopeDecision.code,
      reason: targetScopeDecision.reason,
      target: parsedTarget.normalized_target,
    });
    return;
  }

  const discoveredIps = new Set<string>((job.resolved_ips || []).filter(Boolean));
  const discoveredHostnames = new Set<string>(hostname ? [hostname] : []);
  const shodanHostPayloads: Array<{ ip: string; payload: Record<string, unknown> }> = [];
  let hostingContext = "unknown";
  let shodanStatus = "unknown";
  type HttpScheme = "http" | "https";
  interface HttpSnapshot {
    attemptedUrls: string[];
    requestUrl: string;
    finalUrl: string;
    statusCode: number;
    headers: Record<string, string>;
    setCookies: string[];
    protocol: HttpScheme;
    responseTimeMs: number;
    bodyExcerpt: string;
    fetchedAt: string;
  }
  interface TechFingerprintEntry {
    name: string;
    categories: string[];
    version?: string;
    confidence?: number;
    source: string;
  }

  let latestHttpSnapshot: HttpSnapshot | null = null;
  const techFingerprintMap = new Map<string, TechFingerprintEntry>();

  const addTechFingerprint = (
    nameRaw: string,
    options: {
      categories?: string[];
      version?: string;
      confidence?: number;
      source: string;
    },
  ) => {
    const normalizedName = String(nameRaw || "").trim();
    if (!normalizedName) return;
    const key = normalizedName.toLowerCase();
    const existing = techFingerprintMap.get(key);
    const mergedCategories = [
      ...(existing?.categories || []),
      ...(options.categories || []),
    ]
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
    const uniqueCategories = [...new Set(mergedCategories)];
    const nextConfidence = Math.max(existing?.confidence || 0, options.confidence || 0);
    techFingerprintMap.set(key, {
      name: existing?.name || normalizedName,
      categories: uniqueCategories,
      version: existing?.version || options.version,
      confidence: nextConfidence > 0 ? nextConfidence : undefined,
      source: existing?.source ? `${existing.source},${options.source}` : options.source,
    });
  };

  const collectSetCookieHeaders = (headers: Headers): string[] => {
    const candidate = headers as Headers & { getSetCookie?: () => string[] };
    if (typeof candidate.getSetCookie === "function") {
      try {
        return (candidate.getSetCookie() || []).map((entry) => String(entry || "").trim()).filter(Boolean);
      } catch {
        // fallback below
      }
    }
    const merged = headers.get("set-cookie");
    if (!merged) return [];
    return merged
      .split(/,(?=\s*[^;,=\s]+=[^;,]+)/g)
      .map((entry) => entry.trim())
      .filter(Boolean);
  };

  const collectHeadersObject = (headers: Headers): Record<string, string> =>
    {
      const out: Record<string, string> = {};
      for (const [key, value] of headers.entries()) {
        out[String(key || "").toLowerCase()] = String(value || "");
      }
      return out;
    };

  const buildHttpCandidateUrls = (): string[] => {
    const candidates: string[] = [];
    const targetType = parsedTarget.target_type;
    const targetHost = String(parsedTarget.hostname || hostname || "").trim();
    const hostForUrl = targetType === "ipv6" && targetHost ? `[${targetHost}]` : targetHost;

    const pushCandidate = (url: string) => {
      const normalized = String(url || "").trim();
      if (!normalized) return;
      if (!candidates.includes(normalized)) candidates.push(normalized);
    };

    if (["domain", "subdomain", "ipv4", "ipv6"].includes(targetType) && hostForUrl) {
      const pathSuffix = parsedTarget.port ? `:${parsedTarget.port}` : "";
      pushCandidate(`https://${hostForUrl}${pathSuffix}/`);
      pushCandidate(`http://${hostForUrl}${pathSuffix}/`);
      return candidates;
    }

    pushCandidate(targetUrl);
    if (targetUrl.startsWith("https://")) {
      pushCandidate(`http://${targetUrl.replace(/^https:\/\//i, "")}`);
    } else if (targetUrl.startsWith("http://")) {
      pushCandidate(`https://${targetUrl.replace(/^http:\/\//i, "")}`);
    }
    return candidates;
  };

  const fetchPrimaryHttpSnapshot = async (): Promise<HttpSnapshot> => {
    if (latestHttpSnapshot) return latestHttpSnapshot;
    const attemptedUrls: string[] = [];
    const candidates = buildHttpCandidateUrls();
    let lastError: unknown = null;

    for (const candidate of candidates) {
      attemptedUrls.push(candidate);
      try {
        const start = Date.now();
        const response = await fetchWithTimeout(candidate, { redirect: "follow" }, 12000);
        const responseTimeMs = Date.now() - start;
        const headersObj = collectHeadersObject(response.headers);
        const setCookies = collectSetCookieHeaders(response.headers);
        const bodyText = await response.text().catch(() => "");
        const bodyExcerpt = bodyText.slice(0, 200000);
        const finalProtocol = response.url.startsWith("https://") ? "https" : "http";
        latestHttpSnapshot = {
          attemptedUrls,
          requestUrl: candidate,
          finalUrl: response.url || candidate,
          statusCode: response.status,
          headers: headersObj,
          setCookies,
          protocol: finalProtocol,
          responseTimeMs,
          bodyExcerpt,
          fetchedAt: new Date().toISOString(),
        };
        return latestHttpSnapshot;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("HTTP fetch failed for all candidate URLs");
  };

  const safeRun = async (config: ModuleExecutionConfig, fn: () => Promise<void>) => {
    if (!isFeatureEnabled(config.featureFlag, true)) {
      await upsertModuleResult(config, "skipped", {
        severity: "info",
        normalized: {
          reason: "feature_flag_disabled",
          feature_flag: config.featureFlag,
        },
      });
      await insertObservation({
        module: config.key,
        observation_type: "module_skipped",
        title: `Modulo ${config.label} disabilitato`,
        value: {
          reason: "feature_flag_disabled",
          feature_flag: config.featureFlag || null,
        },
        severity: "info",
      });
      await logAudit("module_skipped", {
        module: config.key,
        feature_flag: config.featureFlag || null,
      });
      return;
    }

    const startedAtIso = new Date().toISOString();
    const startedAtMs = Date.now();
    await upsertModuleResult(config, "running", {
      startedAt: startedAtIso,
      normalized: { module: config.key, status: "running" },
    });

    const timeoutError = new Error(`Module timeout after ${config.timeoutMs}ms`);
    let timeoutHandle: number | null = null;

    try {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(timeoutError), config.timeoutMs) as unknown as number;
        }),
      ]);
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);

      const completedAtIso = new Date().toISOString();
      const durationMs = Date.now() - startedAtMs;
      await upsertModuleResult(config, "success", {
        severity: "info",
        startedAt: startedAtIso,
        completedAt: completedAtIso,
        durationMs,
        normalized: {
          module: config.key,
          status: "success",
          duration_ms: durationMs,
        },
      });
      await logAudit("module_completed", { module: config.key, duration_ms: durationMs });
    } catch (error: any) {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      const completedAtIso = new Date().toISOString();
      const durationMs = Date.now() - startedAtMs;
      const isTimeout = error?.message === timeoutError.message;
      const status: ModuleStatus = isTimeout ? "timeout" : "error";
      const severity: "info" | "low" | "medium" = isTimeout ? "low" : "medium";
      const errorMessage = error?.message || "Errore non gestito";

      await insertObservation({
        module: config.key,
        observation_type: isTimeout ? "module_timeout" : "module_error",
        title: isTimeout ? `Timeout modulo ${config.label}` : `Errore modulo ${config.label}`,
        value: { error: errorMessage, timeout_ms: config.timeoutMs },
        severity,
      });

      await upsertModuleResult(config, status, {
        severity,
        startedAt: startedAtIso,
        completedAt: completedAtIso,
        durationMs,
        errorMessage,
        normalized: {
          module: config.key,
          status,
          timeout_ms: config.timeoutMs,
          duration_ms: durationMs,
        },
        raw: {
          error: errorMessage,
        },
      });

      await logAudit("module_failed", {
        module: config.key,
        status,
        error: errorMessage,
        duration_ms: durationMs,
      });
    }
  };

  const queryDnsJson = async (
    name: string,
    type: string,
  ): Promise<Record<string, unknown>> => {
    const url = new URL("https://dns.google/resolve");
    url.searchParams.set("name", name);
    url.searchParams.set("type", type);
    url.searchParams.set("do", "1");
    const response = await fetchWithTimeout(url.toString(), {
      headers: { accept: "application/dns-json" },
    }, 8000);
    if (!response.ok) return {};
    const payload = await response.json().catch(() => ({}));
    return payload && typeof payload === "object" ? payload : {};
  };

  const parseRdapEventDate = (events: any[], eventAction: string): string | null => {
    if (!Array.isArray(events)) return null;
    const row = events.find((entry) =>
      String(entry?.eventAction || "").trim().toLowerCase() === eventAction.toLowerCase()
    );
    const rawDate = String(row?.eventDate || "").trim();
    return rawDate || null;
  };

  const runDnsModule = async () => {
    if (!hostname || !rootDomain) return;
    const types = ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "CAA"];
    const records: Record<string, string[]> = {};
    for (const type of types) {
      records[type] = await resolveWithDnsOverHttps(hostname, type);
    }

    for (const ip of [...records.A, ...records.AAAA]) {
      discoveredIps.add(ip);
      await insertAsset({
        asset_type: "ip",
        asset_value: ip,
        hostname,
        root_domain: rootDomain,
        ip,
        source: "dns",
      });
    }

    for (const mx of records.MX) {
      const mxHost = parseHostFromMxRecord(mx);
      await insertAsset({
        asset_type: "mx_host",
        asset_value: mxHost,
        hostname: mxHost,
        root_domain: rootDomain,
        source: "dns",
        raw: { mx_raw: mx },
      });
    }

    for (const ns of records.NS) {
      await insertAsset({
        asset_type: "ns_host",
        asset_value: ns,
        hostname: ns,
        root_domain: rootDomain,
        source: "dns",
      });
    }

    await insertObservation({
      module: "dns",
      observation_type: "dns_records",
      title: "DNS records collected",
      value: records,
    });

    await insertObservation({
      module: "dns_records",
      observation_type: "dns_records_snapshot",
      title: "DNS records snapshot",
      value: {
        domain: hostname,
        records,
        source: "cloudflare-doh",
      },
    });

    await insertObservation({
      module: "txt_records",
      observation_type: "txt_records_snapshot",
      title: "TXT records snapshot",
      value: {
        domain: hostname,
        txt_records: records.TXT,
      },
    });

    const hasIpRecords = records.A.length > 0 || records.AAAA.length > 0;
    if (!hasIpRecords) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_no_ip_record",
        severity: "low",
        title: "No A/AAAA record found",
        description: "Il dominio non espone record A o AAAA pubblici",
        affected_asset: hostname,
        remediation: "Verificare configurazione DNS pubblica del dominio",
      });
    }

    if (records.MX.length === 0) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_no_mx_record",
        severity: "info",
        title: "No MX record found",
        description: "Nessun record MX configurato",
        affected_asset: hostname,
      });
    }

    if (records.CAA.length === 0) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_no_caa_record",
        severity: "low",
        title: "No CAA record found",
        description: "Manca una policy CAA per limitare le CA autorizzate",
        affected_asset: hostname,
        remediation: "Aggiungere record CAA per controllare emissione certificati",
      });
    }

    const txtCombined = records.TXT.join(" ").toLowerCase();
    if (/password|secret|token|api[_-]?key|internal|vpn/.test(txtCombined)) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_txt_leakage",
        severity: "medium",
        title: "Suspicious TXT leakage pattern",
        description: "Record TXT con pattern potenzialmente sensibili",
        affected_asset: hostname,
        evidence: { txt_records: records.TXT },
        remediation: "Rimuovere dati sensibili dai record TXT pubblici",
      });
    }

    const spfRecords = records.TXT.filter((txt) => txt.toLowerCase().includes("v=spf1"));
    const dmarcRecords = await resolveWithDnsOverHttps(`_dmarc.${rootDomain}`, "TXT");
    const dmarcRecord = dmarcRecords.find((rec) => rec.toLowerCase().includes("v=dmarc1"));
    const dmarcPolicy = dmarcRecord ? parseDmarcPolicy(dmarcRecord) : null;
    const hasMx = records.MX.length > 0;

    if (hasMx && spfRecords.length === 0) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_missing",
        severity: "medium",
        title: "SPF missing with MX present",
        description: "Dominio con MX ma senza SPF",
        affected_asset: rootDomain,
        remediation: "Pubblicare un record SPF valido",
      });
    }

    if (hasMx && !dmarcRecord) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_dmarc_missing",
        severity: "medium",
        title: "DMARC missing with MX present",
        description: "Dominio con MX ma senza DMARC",
        affected_asset: rootDomain,
        remediation: "Pubblicare un record DMARC (v=DMARC1)",
      });
    }

    if (spfRecords.length > 1) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_multiple",
        severity: "medium",
        title: "Multiple SPF records found",
        description: "Sono presenti più record SPF, situazione non conforme",
        affected_asset: rootDomain,
        evidence: { spf_records: spfRecords },
      });
    }

    if (spfRecords.some((rec) => /\+all/i.test(rec))) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_permissive_all",
        severity: "high",
        title: "SPF too permissive (+all)",
        description: "Record SPF troppo permissivo",
        affected_asset: rootDomain,
        evidence: { spf_records: spfRecords },
        remediation: "Rimuovere +all e definire sorgenti autorizzate specifiche",
      });
    }

    if (spfRecords.some((rec) => /~all/i.test(rec))) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_softfail",
        severity: "low",
        title: "SPF softfail (~all)",
        description: "SPF in softfail: valutare hard-fail in ambienti maturi",
        affected_asset: rootDomain,
      });
    }

    if (dmarcPolicy === "none") {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_dmarc_policy_none",
        severity: "low",
        title: "DMARC policy is p=none",
        description: "DMARC in sola modalità monitor",
        affected_asset: rootDomain,
      });
    }

    const dkimSelectors = [
      "default",
      "google",
      "selector1",
      "selector2",
      "k1",
      "k2",
      "s1",
      "s2",
      "dkim",
      "mail",
    ];
    const dkimHits: string[] = [];
    for (const selector of dkimSelectors) {
      const dkim = await resolveWithDnsOverHttps(`${selector}._domainkey.${rootDomain}`, "TXT");
      if (dkim.length > 0) dkimHits.push(selector);
    }
    const bimiRecords = await resolveWithDnsOverHttps(`default._bimi.${rootDomain}`, "TXT");

    if (dkimHits.length === 0) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_no_common_dkim_selectors",
        severity: "info",
        title: "No common DKIM selectors found",
        description: "Nessun selector DKIM comune rilevato",
        affected_asset: rootDomain,
      });
    }

    if (bimiRecords.length === 0) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_bimi_missing",
        severity: "info",
        title: "BIMI record missing",
        description: "Record BIMI non trovato",
        affected_asset: rootDomain,
      });
    }

    await insertObservation({
      module: "mail_security",
      observation_type: "mail_security_summary",
      title: "Mail security posture",
      value: {
        has_mx: hasMx,
        spf_records: spfRecords,
        dmarc_records: dmarcRecords,
        dkim_selectors_found: dkimHits,
        bimi_records: bimiRecords,
      },
    });

    await insertObservation({
      module: "mail_config",
      observation_type: "mail_config_summary",
      title: "Mail config summary",
      value: {
        domain: rootDomain,
        mx_records: records.MX,
        spf_records: spfRecords,
        dmarc_records: dmarcRecords,
        dkim_selectors_found: dkimHits,
        bimi_records: bimiRecords,
      },
    });
  };

  const runDnssecModule = async () => {
    if (!rootDomain) return;
    const [dnskeyPayload, dsPayload, aPayload] = await Promise.all([
      queryDnsJson(rootDomain, "DNSKEY"),
      queryDnsJson(rootDomain, "DS"),
      queryDnsJson(rootDomain, "A"),
    ]);

    const asAnswers = (payload: Record<string, unknown>): any[] =>
      Array.isArray(payload?.Answer) ? (payload.Answer as any[]) : [];
    const asAuthority = (payload: Record<string, unknown>): any[] =>
      Array.isArray(payload?.Authority) ? (payload.Authority as any[]) : [];

    const dnskeyAnswers = asAnswers(dnskeyPayload).filter((row) => Number(row?.type) === 48);
    const dsAnswers = asAnswers(dsPayload).filter((row) => Number(row?.type) === 43);
    const rrsigPresent =
      [...asAnswers(dnskeyPayload), ...asAnswers(dsPayload), ...asAnswers(aPayload), ...asAuthority(aPayload)]
        .some((row) => Number(row?.type) === 46);
    const authenticatedData =
      Boolean(dnskeyPayload?.AD) || Boolean(dsPayload?.AD) || Boolean(aPayload?.AD);

    await insertObservation({
      module: "dnssec",
      observation_type: "dnssec_status",
      title: "DNSSEC status",
      value: {
        domain: rootDomain,
        dnskey_present: dnskeyAnswers.length > 0,
        ds_present: dsAnswers.length > 0,
        rrsig_present: rrsigPresent,
        authenticated_data: authenticatedData,
        records: {
          dnskey: dnskeyAnswers.slice(0, 10),
          ds: dsAnswers.slice(0, 10),
        },
        source: "google-doh",
      },
    });

    if (dnskeyAnswers.length === 0 && dsAnswers.length === 0) {
      await insertFinding({
        module: "dnssec",
        finding_type: "dnssec_missing",
        severity: "medium",
        title: "DNSSEC not enabled",
        description: "Il dominio non espone record DS/DNSKEY",
        affected_asset: rootDomain,
        remediation: "Abilitare DNSSEC presso registrar/provider DNS e verificare delega DS.",
      });
      return;
    }

    if (dsAnswers.length > 0 && dnskeyAnswers.length === 0) {
      await insertFinding({
        module: "dnssec",
        finding_type: "dnssec_inconsistent_delegation",
        severity: "high",
        title: "DNSSEC delegation appears inconsistent",
        description: "Record DS presente ma DNSKEY non rilevato: possibile incoerenza nella delega DNSSEC.",
        affected_asset: rootDomain,
        remediation: "Verificare firma zona, record DNSKEY e pubblicazione DS lato parent zone.",
      });
    }
  };

  const runWhoisModule = async () => {
    if (!rootDomain) return;
    const rdapUrl = `https://rdap.org/domain/${encodeURIComponent(rootDomain)}`;
    const response = await fetchWithTimeout(rdapUrl, {
      headers: {
        accept: "application/rdap+json, application/json;q=0.9",
        "user-agent": "SurfaceScan360/1.0",
      },
    }, 10000);

    if (!response.ok) {
      await insertObservation({
        module: "whois",
        observation_type: "rdap_unavailable",
        title: "RDAP lookup unavailable",
        value: {
          domain: rootDomain,
          rdap_url: rdapUrl,
          status: response.status,
        },
        severity: "low",
      });
      return;
    }

    const payload = await response.json().catch(() => ({}));
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const nameservers = Array.isArray(payload?.nameservers)
      ? payload.nameservers.map((entry: any) => String(entry?.ldhName || "").trim()).filter(Boolean)
      : [];
    const registrarEntity = (Array.isArray(payload?.entities) ? payload.entities : []).find((entry: any) =>
      Array.isArray(entry?.roles) && entry.roles.some((role: any) => String(role || "").toLowerCase() === "registrar")
    );

    const registrarName = (() => {
      const vcard = Array.isArray(registrarEntity?.vcardArray) ? registrarEntity.vcardArray[1] : [];
      if (!Array.isArray(vcard)) return null;
      const fnEntry = vcard.find((entry: any) => Array.isArray(entry) && String(entry?.[0] || "").toLowerCase() === "fn");
      if (!Array.isArray(fnEntry)) return null;
      const candidate = String(fnEntry?.[3] || "").trim();
      return candidate || null;
    })();

    const created = parseRdapEventDate(events, "registration");
    const updated = parseRdapEventDate(events, "last changed");
    const expires = parseRdapEventDate(events, "expiration");
    const expirationMs = expires ? Date.parse(expires) : NaN;
    const daysToExpiry = Number.isFinite(expirationMs)
      ? Math.round((expirationMs - Date.now()) / 86400000)
      : null;
    const registrationValid = daysToExpiry === null ? false : daysToExpiry >= 0;
    const secureDnsSigned = payload?.secureDNS?.delegationSigned;

    await insertObservation({
      module: "whois",
      observation_type: "whois_rdap",
      title: "Domain WHOIS via RDAP",
      value: {
        domain: rootDomain,
        registrar: registrarName,
        created,
        updated,
        expires,
        days_to_expiry: daysToExpiry,
        registration_valid: registrationValid,
        nameservers,
        status: Array.isArray(payload?.status) ? payload.status : [],
        dnssec: secureDnsSigned === true ? "signed" : secureDnsSigned === false ? "unsigned" : null,
        source: "rdap.org",
      },
    });

    if (daysToExpiry !== null && daysToExpiry < 0) {
      await insertFinding({
        module: "whois",
        finding_type: "domain_expired",
        severity: "critical",
        title: "Domain registration expired",
        affected_asset: rootDomain,
        description: "Il dominio risulta scaduto secondo i dati RDAP.",
        remediation: "Rinnovare immediatamente il dominio e verificare stato presso il registrar.",
      });
    } else if (daysToExpiry !== null && daysToExpiry < 30) {
      await insertFinding({
        module: "whois",
        finding_type: "domain_expiry_soon_30d",
        severity: "high",
        title: "Domain expires in less than 30 days",
        affected_asset: rootDomain,
        description: `Scadenza dominio imminente (${daysToExpiry} giorni).`,
        remediation: "Pianificare rinnovo immediato per evitare interruzioni operative.",
      });
    } else if (daysToExpiry !== null && daysToExpiry < 90) {
      await insertFinding({
        module: "whois",
        finding_type: "domain_expiry_soon_90d",
        severity: "medium",
        title: "Domain expires in less than 90 days",
        affected_asset: rootDomain,
        description: `Scadenza dominio nei prossimi ${daysToExpiry} giorni.`,
        remediation: "Programmare rinnovo dominio e verifica contatti amministrativi.",
      });
    }

    if (!registrarName || !expires) {
      await insertFinding({
        module: "whois",
        finding_type: "whois_partial_data",
        severity: "info",
        title: "WHOIS/RDAP partial registration data",
        affected_asset: rootDomain,
        description: "Informazioni registrar/scadenza non complete nei dati RDAP.",
      });
    }
  };

  const runHttpModules = async () => {
    const snapshot = await fetchPrimaryHttpSnapshot();
    const headers = snapshot.headers;
    const headerValue = (key: string): string | null => {
      const value = headers[key.toLowerCase()];
      return value ? String(value) : null;
    };

    const csp = headerValue("content-security-policy");
    const hsts = headerValue("strict-transport-security");
    const xcto = headerValue("x-content-type-options");
    const xfo = headerValue("x-frame-options");
    const referrer = headerValue("referrer-policy");
    const permissions = headerValue("permissions-policy");
    const coop = headerValue("cross-origin-opener-policy");
    const corp = headerValue("cross-origin-resource-policy");
    const coep = headerValue("cross-origin-embedder-policy");
    const xXssLegacy = headerValue("x-xss-protection");
    const serverHeader = headerValue("server");
    const poweredByHeader = headerValue("x-powered-by");

    const checks = {
      contentSecurityPolicy: Boolean(csp),
      strictTransportSecurity: Boolean(hsts),
      xContentTypeOptions: Boolean(xcto),
      xFrameOptions: Boolean(xfo) || Boolean(csp && /frame-ancestors/i.test(csp)),
      referrerPolicy: Boolean(referrer),
      permissionsPolicy: Boolean(permissions),
      crossOriginOpenerPolicy: Boolean(coop),
      crossOriginResourcePolicy: Boolean(corp),
      crossOriginEmbedderPolicy: Boolean(coep),
      xXssProtectionLegacy: Boolean(xXssLegacy),
    };

    const scoreWeights = {
      contentSecurityPolicy: 20,
      strictTransportSecurity: 20,
      xContentTypeOptions: 10,
      xFrameOptions: 10,
      referrerPolicy: 10,
      permissionsPolicy: 10,
      crossOriginOpenerPolicy: 7,
      crossOriginResourcePolicy: 7,
      crossOriginEmbedderPolicy: 6,
    };
    const score = Object.entries(scoreWeights).reduce((acc, [key, weight]) => {
      return checks[key as keyof typeof checks] ? acc + weight : acc;
    }, 0);

    await insertObservation({
      module: "http_status",
      observation_type: "http_status",
      title: "HTTP status collected",
      value: {
        status: snapshot.statusCode,
        response_time_ms: snapshot.responseTimeMs,
        final_url: snapshot.finalUrl,
        attempted_urls: snapshot.attemptedUrls,
        content_type: headerValue("content-type"),
        server: serverHeader,
        powered_by: poweredByHeader,
        content_length: headerValue("content-length"),
      },
    });

    await insertObservation({
      module: "http_headers",
      observation_type: "http_headers",
      title: "HTTP headers collected",
      value: headers,
    });

    await insertObservation({
      module: "headers",
      observation_type: "headers_interpretation",
      title: "HTTP headers interpretation",
      value: {
        url: snapshot.requestUrl,
        final_url: snapshot.finalUrl,
        status_code: snapshot.statusCode,
        highlighted: {
          server: serverHeader,
          x_powered_by: poweredByHeader,
          via: headerValue("via"),
          cf_ray: headerValue("cf-ray"),
          cache_control: headerValue("cache-control"),
          content_type: headerValue("content-type"),
          content_encoding: headerValue("content-encoding"),
          location: headerValue("location"),
          set_cookie_count: snapshot.setCookies.length,
        },
        set_cookies: snapshot.setCookies.slice(0, 30),
      },
    });

    await insertObservation({
      module: "http_security",
      observation_type: "http_security_summary",
      title: "HTTP security headers summary",
      value: {
        url: snapshot.requestUrl,
        finalUrl: snapshot.finalUrl,
        statusCode: snapshot.statusCode,
        checks,
        score,
        headers: {
          "content-security-policy": csp,
          "strict-transport-security": hsts,
          "x-content-type-options": xcto,
          "x-frame-options": xfo,
          "referrer-policy": referrer,
          "permissions-policy": permissions,
          "cross-origin-opener-policy": coop,
          "cross-origin-resource-policy": corp,
          "cross-origin-embedder-policy": coep,
          "x-xss-protection": xXssLegacy,
        },
        source: "http_fetch",
      },
    });

    if (snapshot.statusCode >= 500) {
      await insertFinding({
        module: "http_status",
        finding_type: "http_5xx",
        severity: "medium",
        title: `HTTP ${snapshot.statusCode} detected`,
        description: "Endpoint restituisce errore server",
        affected_url: snapshot.requestUrl,
      });
    } else if (snapshot.statusCode >= 400) {
      await insertFinding({
        module: "http_status",
        finding_type: "http_4xx",
        severity: "low",
        title: `HTTP ${snapshot.statusCode} detected`,
        description: "Endpoint restituisce errore client",
        affected_url: snapshot.requestUrl,
      });
    }

    if (serverHeader) {
      await insertFinding({
        module: "headers",
        finding_type: "server_header_exposed",
        severity: "info",
        title: "Server header exposed",
        description: "Header Server visibile pubblicamente",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
      if (/[a-z0-9._-]+\/\d/i.test(serverHeader)) {
        await insertFinding({
          module: "headers",
          finding_type: "server_header_detailed_version",
          severity: "low",
          title: "Server header reveals version details",
          description: "L'header Server espone versione o dettagli implementativi.",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
          evidence: { server: serverHeader },
        });
      }
    }

    if (poweredByHeader) {
      await insertFinding({
        module: "headers",
        finding_type: "x_powered_by_exposed",
        severity: "low",
        title: "X-Powered-By exposed",
        description: "Header X-Powered-By esposto",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }

    if (!csp) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_csp",
        severity: "medium",
        title: "Missing Content-Security-Policy",
        remediation: "Aggiungere header CSP restrittivo.",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }

    if (snapshot.protocol === "https" && !hsts) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_hsts",
        severity: "medium",
        title: "Missing HSTS",
        remediation: "Aggiungere header Strict-Transport-Security.",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }

    if (hsts) {
      const maxAgeMatch = hsts.match(/max-age=(\d+)/i);
      const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 0;
      const includeSubdomains = /includesubdomains/i.test(hsts);
      const preload = /preload/i.test(hsts);

      await insertObservation({
        module: "hsts",
        observation_type: "hsts_analysis",
        title: "HSTS analyzed",
        value: {
          exists: true,
          max_age: maxAge,
          include_subdomains: includeSubdomains,
          preload,
        },
      });

      if (maxAge > 0 && maxAge < 15552000) {
        await insertFinding({
          module: "hsts",
          finding_type: "hsts_max_age_low",
          severity: "low",
          title: "HSTS max-age too low",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
        });
      }
      if (!includeSubdomains) {
        await insertFinding({
          module: "hsts",
          finding_type: "hsts_missing_include_subdomains",
          severity: "low",
          title: "HSTS includeSubDomains missing",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
        });
      }
      if (!preload) {
        await insertFinding({
          module: "hsts",
          finding_type: "hsts_missing_preload",
          severity: "info",
          title: "HSTS preload missing",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
        });
      }
    }

    if (!xcto) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_x_content_type_options",
        severity: "low",
        title: "Missing X-Content-Type-Options",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!checks.xFrameOptions) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_framing_protection",
        severity: "medium",
        title: "Missing anti-framing protection",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!referrer) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_referrer_policy",
        severity: "low",
        title: "Missing Referrer-Policy",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!permissions) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_permissions_policy",
        severity: "low",
        title: "Missing Permissions-Policy",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!coop) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_coop",
        severity: "info",
        title: "Missing Cross-Origin-Opener-Policy",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!corp) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_corp",
        severity: "info",
        title: "Missing Cross-Origin-Resource-Policy",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!coep) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_coep",
        severity: "info",
        title: "Missing Cross-Origin-Embedder-Policy",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }

    for (const cookie of snapshot.setCookies) {
      const lower = cookie.toLowerCase();
      if (!/;\s*secure\b/.test(lower)) {
        await insertFinding({
          module: "headers",
          finding_type: "cookie_missing_secure",
          severity: "medium",
          title: "Cookie without Secure attribute",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
          evidence: { cookie },
        });
      }
      if (!/;\s*httponly\b/.test(lower)) {
        await insertFinding({
          module: "headers",
          finding_type: "cookie_missing_httponly",
          severity: "medium",
          title: "Cookie without HttpOnly attribute",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
          evidence: { cookie },
        });
      }
      if (!/;\s*samesite=/i.test(lower)) {
        await insertFinding({
          module: "headers",
          finding_type: "cookie_missing_samesite",
          severity: "low",
          title: "Cookie without SameSite attribute",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
          evidence: { cookie },
        });
      }
    }

    const bodyLower = snapshot.bodyExcerpt.toLowerCase();
    if (serverHeader) {
      if (/nginx/i.test(serverHeader)) addTechFingerprint("nginx", { categories: ["web server"], confidence: 80, source: "headers" });
      if (/apache/i.test(serverHeader)) addTechFingerprint("Apache HTTP Server", { categories: ["web server"], confidence: 80, source: "headers" });
      if (/iis/i.test(serverHeader)) addTechFingerprint("Microsoft IIS", { categories: ["web server"], confidence: 80, source: "headers" });
    }
    if (poweredByHeader) {
      if (/php/i.test(poweredByHeader)) addTechFingerprint("PHP", { categories: ["programming language"], confidence: 85, source: "headers" });
      if (/asp\.net/i.test(poweredByHeader)) addTechFingerprint("ASP.NET", { categories: ["application framework"], confidence: 85, source: "headers" });
      if (/express/i.test(poweredByHeader)) addTechFingerprint("Express", { categories: ["application framework"], confidence: 75, source: "headers" });
    }
    if (headerValue("cf-ray")) addTechFingerprint("Cloudflare", { categories: ["cdn", "security"], confidence: 90, source: "headers" });
    if (bodyLower.includes("/wp-content/") || bodyLower.includes("wp-includes") || /wordpress/i.test(bodyLower)) {
      addTechFingerprint("WordPress", { categories: ["cms"], confidence: 80, source: "html" });
    }
    if (bodyLower.includes("_next/static")) {
      addTechFingerprint("Next.js", { categories: ["javascript framework"], confidence: 75, source: "html" });
    }
    if (bodyLower.includes("cdn.shopify.com")) {
      addTechFingerprint("Shopify", { categories: ["ecommerce"], confidence: 75, source: "html" });
    }
    if (/react/i.test(bodyLower) && bodyLower.includes("data-reactroot")) {
      addTechFingerprint("React", { categories: ["javascript framework"], confidence: 70, source: "html" });
    }
    if (bodyLower.includes("laravel_session")) {
      addTechFingerprint("Laravel", { categories: ["application framework"], confidence: 75, source: "cookies" });
    }
  };

  const runRobotsModule = async () => {
    if (!hostname) return;
    const robotsUrl = `https://${hostname}/robots.txt`;
    const res = await fetchWithTimeout(robotsUrl, {}, 10000);
    const body = await res.text();
    const disallowPaths = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^disallow:/i.test(line))
      .map((line) => line.replace(/^disallow:\s*/i, "").trim())
      .filter(Boolean);
    const sitemapEntries = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^sitemap:/i.test(line))
      .map((line) => line.replace(/^sitemap:\s*/i, "").trim())
      .filter(Boolean);

    await insertObservation({
      module: "robots",
      observation_type: "robots_txt",
      title: "Robots.txt analyzed",
      value: {
        exists: res.ok,
        status: res.status,
        disallow_paths: disallowPaths,
        sitemap_entries: sitemapEntries,
      },
    });

    const sensitive = disallowPaths.filter(looksSensitivePath);
    if (sensitive.length > 0) {
      await insertFinding({
        module: "robots",
        finding_type: "robots_sensitive_paths",
        severity: "low",
        title: "Robots.txt exposes sensitive-looking paths",
        description: "Sono presenti path sensibili in disallow",
        affected_asset: hostname,
        evidence: { sensitive_paths: sensitive },
      });
    }
  };

  const runSecurityTxtModule = async () => {
    if (!hostname) return;
    const urls = [`https://${hostname}/.well-known/security.txt`, `https://${hostname}/security.txt`];
    let found = false;
    let content = "";
    let usedUrl = "";

    for (const url of urls) {
      const res = await fetchWithTimeout(url, {}, 10000);
      if (res.ok) {
        content = await res.text();
        usedUrl = url;
        found = true;
        break;
      }
    }

    const extractField = (field: string) =>
      content
        .split("\n")
        .filter((line) => line.toLowerCase().startsWith(`${field.toLowerCase()}:`))
        .map((line) => line.split(":").slice(1).join(":").trim());

    const expires = extractField("Expires")[0] || null;
    const expiresDate = expires ? new Date(expires) : null;
    const isExpired = expiresDate ? expiresDate.getTime() < Date.now() : false;

    await insertObservation({
      module: "security_txt",
      observation_type: "security_txt",
      title: "Security.txt analyzed",
      value: {
        exists: found,
        source_url: usedUrl || null,
        contact: extractField("Contact"),
        expires,
        encryption: extractField("Encryption"),
        policy: extractField("Policy"),
        acknowledgments: extractField("Acknowledgments"),
      },
    });

    if (!found) {
      await insertFinding({
        module: "security_txt",
        finding_type: "security_txt_missing",
        severity: "info",
        title: "Missing security.txt",
        description: "File security.txt non trovato",
        affected_asset: hostname,
      });
    } else if (isExpired) {
      await insertFinding({
        module: "security_txt",
        finding_type: "security_txt_expired",
        severity: "low",
        title: "Expired security.txt",
        affected_asset: hostname,
      });
    }
  };

  const runSitemapModule = async () => {
    if (!hostname || !rootDomain) return;
    const sitemapUrl = `https://${hostname}/sitemap.xml`;
    const res = await fetchWithTimeout(sitemapUrl, {}, 10000);
    if (!res.ok) {
      await insertObservation({
        module: "sitemap",
        observation_type: "sitemap",
        title: "Sitemap unavailable",
        value: { exists: false, status: res.status, urls: [] },
      });
      return;
    }
    const body = await res.text();
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());

    await insertObservation({
      module: "sitemap",
      observation_type: "sitemap",
      title: "Sitemap analyzed",
      value: { exists: true, status: res.status, urls_count: urls.length, urls: urls.slice(0, 300) },
    });

    for (const discoveredUrl of urls.slice(0, 200)) {
      try {
        const parsed = new URL(discoveredUrl);
        if (parsed.hostname.endsWith(rootDomain)) {
          await insertAsset({
            asset_type: "url",
            asset_value: discoveredUrl,
            hostname: parsed.hostname,
            root_domain: rootDomain,
            source: "sitemap",
          });
        }
      } catch {
        // ignore invalid url entries
      }
    }
  };

  const runRedirectModule = async () => {
    const inputUrl = (await fetchPrimaryHttpSnapshot()).requestUrl;
    let current = inputUrl;
    const chain: Array<{
      url: string;
      status: number;
      location?: string;
      protocol: "http" | "https";
      host: string;
    }> = [];
    const visited = new Set<string>();
    let hasLoop = false;

    for (let i = 0; i < 10; i++) {
      if (visited.has(current)) {
        hasLoop = true;
        break;
      }
      visited.add(current);

      const res = await fetchWithTimeout(current, { redirect: "manual" }, 10000);
      const location = res.headers.get("location") || undefined;
      const currentUrl = new URL(current);
      chain.push({
        url: current,
        status: res.status,
        location,
        protocol: currentUrl.protocol === "https:" ? "https" : "http",
        host: currentUrl.hostname.toLowerCase(),
      });

      if (!location || !(res.status >= 300 && res.status < 400)) break;
      const nextUrl = new URL(location, current).toString();
      if (visited.has(nextUrl)) {
        hasLoop = true;
        break;
      }
      current = nextUrl;
    }

    const finalUrl = chain.length > 0 ? chain[chain.length - 1].url : inputUrl;
    const redirectsToHttps = finalUrl.startsWith("https://");
    const mixedProtocol = chain.some((hop, index) => index > 0 && hop.protocol === "http");
    const externalRedirects = rootDomain
      ? chain.filter((hop) => !(hop.host === rootDomain || hop.host.endsWith(`.${rootDomain}`)))
      : [];

    const normalized = {
      inputUrl,
      finalUrl,
      chain,
      redirectsToHttps,
      hasLoop,
      hopCount: chain.length,
    };

    await insertObservation({
      module: "redirect_chain",
      observation_type: "redirect_chain",
      title: "Redirect chain collected",
      value: normalized,
    });
    await insertObservation({
      module: "redirects",
      observation_type: "redirects_summary",
      title: "HTTP redirect behavior",
      value: normalized,
    });

    if (hasLoop) {
      await insertFinding({
        module: "redirects",
        finding_type: "redirect_loop_detected",
        severity: "high",
        title: "Redirect loop detected",
        affected_url: inputUrl,
      });
    }

    if (chain.length > 5) {
      await insertFinding({
        module: "redirects",
        finding_type: "redirect_chain_too_long",
        severity: "low",
        title: "Redirect chain longer than 5 hops",
        description: `Catena redirect con ${chain.length} hop.`,
        affected_url: inputUrl,
      });
    }

    const first = chain[0];
    if (first?.protocol === "http" && !redirectsToHttps) {
      await insertFinding({
        module: "redirects",
        finding_type: "no_http_to_https_redirect",
        severity: "medium",
        title: "HTTP does not redirect to HTTPS",
        affected_url: first.url,
      });
    }

    if (mixedProtocol) {
      await insertFinding({
        module: "redirects",
        finding_type: "redirect_mixed_http",
        severity: "low",
        title: "Mixed protocol redirect chain",
        affected_url: inputUrl,
      });
    }

    for (const hop of externalRedirects.slice(0, 10)) {
      await insertFinding({
        module: "redirects",
        finding_type: "redirect_external_domain",
        severity: "medium",
        title: "Redirect to external domain",
        affected_url: hop.url,
        evidence: hop as unknown as Record<string, unknown>,
      });
    }
  };

  const toIsoDate = (value: unknown): string | null => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) return null;
    return new Date(parsed).toISOString();
  };

  const daysUntil = (isoDate: string | null): number | null => {
    if (!isoDate) return null;
    const parsed = Date.parse(isoDate);
    if (!Number.isFinite(parsed)) return null;
    return Math.round((parsed - Date.now()) / 86400000);
  };

  const collectNestedObjectsByKey = (value: unknown, keyName: string): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record[keyName] && typeof record[keyName] === "object") {
        out.push(record[keyName] as Record<string, unknown>);
      }
      for (const child of Object.values(record)) {
        if (Array.isArray(child)) {
          for (const item of child) walk(item);
        } else if (child && typeof child === "object") {
          walk(child);
        }
      }
    };
    walk(value);
    return out;
  };

  const runSslCertificateModule = async () => {
    const hostForCert = hostname || rootDomain || parsedTarget.hostname || "";
    if (!hostForCert) {
      await insertObservation({
        module: "ssl_certificate",
        observation_type: "ssl_certificate_skipped",
        title: "SSL certificate check skipped",
        value: { reason: "missing_hostname" },
        severity: "info",
      });
      return;
    }

    const result: Record<string, unknown> = {
      hostname: hostForCert,
      source: "https-fetch-basic",
      trusted: null,
    };

    let certPayload: Record<string, unknown> | null = null;
    for (const entry of shodanHostPayloads) {
      const directCandidates = collectNestedObjectsByKey(entry.payload, "ssl");
      for (const sslCandidate of directCandidates) {
        if (sslCandidate?.cert && typeof sslCandidate.cert === "object") {
          certPayload = sslCandidate.cert as Record<string, unknown>;
          result.source = "shodan";
          break;
        }
      }
      if (certPayload) break;
    }

    if (!certPayload) {
      const { data: intelRows } = await adminClient
        .from("surface_external_intel" as any)
        .select("provider, summary, raw_response")
        .eq("scan_job_id", job.id)
        .eq("provider", "pentest_tools_output")
        .limit(100);

      for (const row of (intelRows || []) as Array<Record<string, unknown>>) {
        const summary = (row?.summary as Record<string, unknown>) || {};
        const outputType = String(summary?.output_type || "").toLowerCase();
        if (!outputType.includes("ssl")) continue;
        const raw = (row?.raw_response as Record<string, unknown>) || {};
        const candidates = [
          ...collectNestedObjectsByKey(raw, "certificate"),
          ...collectNestedObjectsByKey(raw, "cert"),
        ];
        const selected = candidates.find((entry) => Object.keys(entry).length > 0);
        if (selected) {
          certPayload = selected;
          result.source = "pentest-tools";
          break;
        }
      }
    }

    if (certPayload) {
      const subjectRaw = certPayload?.subject;
      const issuerRaw = certPayload?.issuer;
      const sanRaw =
        certPayload?.["subject_alt_names"] ||
        certPayload?.["subjectAltName"] ||
        certPayload?.["san"] ||
        certPayload?.["alt_names"];
      const subject = typeof subjectRaw === "string"
        ? subjectRaw
        : String((subjectRaw as any)?.CN || (subjectRaw as any)?.common_name || "").trim() || null;
      const issuer = typeof issuerRaw === "string"
        ? issuerRaw
        : String((issuerRaw as any)?.CN || (issuerRaw as any)?.common_name || "").trim() || null;
      const validFrom = toIsoDate(
        certPayload?.["issued"] || certPayload?.["not_before"] || certPayload?.["valid_from"],
      );
      const validTo = toIsoDate(
        certPayload?.["expires"] || certPayload?.["not_after"] || certPayload?.["valid_to"],
      );
      const expiresInDays = daysUntil(validTo);
      const san = Array.isArray(sanRaw)
        ? sanRaw.map((entry) => String(entry || "").trim()).filter(Boolean)
        : String(sanRaw || "")
          .split(/,\s*/)
          .map((entry) => entry.trim())
          .filter(Boolean);
      const signature = String(certPayload?.["sig_alg"] || certPayload?.["signature_algorithm"] || "").trim();
      const fingerprintObject =
        certPayload?.["fingerprint"] && typeof certPayload["fingerprint"] === "object"
          ? certPayload["fingerprint"] as Record<string, unknown>
          : {};
      const fingerprintSha256 = String(
        fingerprintObject["sha256"] || certPayload?.["fingerprint_sha256"] || "",
      ).trim();
      const fingerprintSha1 = String(
        fingerprintObject["sha1"] || certPayload?.["fingerprint_sha1"] || "",
      ).trim();
      const serialNumber = String(certPayload?.["serial"] || certPayload?.["serial_number"] || "").trim();
      const trustedValue = certPayload?.["trusted"];
      const trusted = typeof trustedValue === "boolean" ? trustedValue : null;
      const isSelfSigned = Boolean(subject && issuer && subject.toLowerCase() === issuer.toLowerCase());
      const isExpired = expiresInDays !== null ? expiresInDays < 0 : false;

      result.subject = subject;
      result.issuer = issuer;
      result.validFrom = validFrom;
      result.validTo = validTo;
      result.expiresInDays = expiresInDays;
      result.serialNumber = serialNumber || null;
      result.fingerprintSha256 = fingerprintSha256 || null;
      result.fingerprintSha1 = fingerprintSha1 || null;
      result.san = san;
      result.signatureAlgorithm = signature || null;
      result.trusted = trusted;
      result.isExpired = isExpired;
      result.isSelfSigned = isSelfSigned;
      result.raw = certPayload;

      const hasHostnameMatch = san.length > 0
        ? san.some((entry) => {
          const candidate = entry.replace(/^DNS:/i, "").toLowerCase();
          return candidate === hostForCert.toLowerCase() || candidate === `*.${rootDomain?.toLowerCase() || ""}` ||
            (candidate.startsWith("*.") && hostForCert.toLowerCase().endsWith(candidate.slice(1)));
        })
        : Boolean(subject && hostForCert.toLowerCase().includes(subject.toLowerCase()));

      if (isExpired) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_certificate_expired",
          severity: "critical",
          title: "SSL certificate expired",
          affected_asset: hostForCert,
          remediation: "Rinnovare immediatamente il certificato TLS e verificare deployment su tutti i virtual host.",
        });
      } else if (expiresInDays !== null && expiresInDays < 15) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_certificate_expiring_15d",
          severity: "high",
          title: "SSL certificate expires in less than 15 days",
          affected_asset: hostForCert,
          remediation: "Avviare rinnovo urgente del certificato e verificare catena/intermediates.",
        });
      } else if (expiresInDays !== null && expiresInDays < 30) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_certificate_expiring_30d",
          severity: "medium",
          title: "SSL certificate expires in less than 30 days",
          affected_asset: hostForCert,
          remediation: "Pianificare rinnovo certificato entro 30 giorni.",
        });
      }

      if (isSelfSigned) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_certificate_self_signed",
          severity: "high",
          title: "Self-signed certificate detected",
          affected_asset: hostForCert,
          remediation: "Usare certificato emesso da CA trusted pubblica o interna gestita.",
        });
      }
      if (trusted === false) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_certificate_untrusted_chain",
          severity: "high",
          title: "SSL certificate chain not trusted",
          affected_asset: hostForCert,
          remediation: "Verificare chain completa, intermediate CA e trust store.",
        });
      }
      if (!hasHostnameMatch) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_hostname_mismatch",
          severity: "high",
          title: "Certificate hostname mismatch",
          affected_asset: hostForCert,
          remediation: "Allineare CN/SAN del certificato al dominio servito.",
        });
      }
      if (san.length === 0) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_missing_san",
          severity: "medium",
          title: "Certificate missing SAN entries",
          affected_asset: hostForCert,
        });
      }
      if (/sha1|md5/i.test(signature)) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_weak_signature_algorithm",
          severity: "high",
          title: "Weak certificate signature algorithm",
          affected_asset: hostForCert,
          evidence: { signature_algorithm: signature },
          remediation: "Rigenerare certificato con algoritmo moderno (SHA-256 o superiore).",
        });
      }
    } else {
      try {
        const httpsTarget = hostForCert.includes(":") ? `https://[${hostForCert}]/` : `https://${hostForCert}/`;
        const res = await fetchWithTimeout(httpsTarget, { redirect: "follow" }, 10000);
        result.source = "https-fetch-basic";
        result.trusted = res.ok;
        result.finalUrl = res.url || httpsTarget;
        result.statusCode = res.status;
      } catch (error: any) {
        result.source = "https-fetch-basic";
        result.trusted = false;
        result.error = error?.message || "HTTPS fetch failed";
      }
    }

    await insertObservation({
      module: "ssl_certificate",
      observation_type: "ssl_certificate_summary",
      title: "SSL certificate summary",
      value: result,
    });
  };

  const runTlsSummaryModule = async () => {
    const hostForTls = hostname || rootDomain || parsedTarget.hostname || "";
    if (!hostForTls) return;

    const result: Record<string, unknown> = {
      hostname: hostForTls,
      source: "https-fetch-basic",
    };

    let weakProtocolDetected = false;
    let weakCiphers: string[] = [];
    let selectedProtocol: string | null = null;
    let selectedCipher: string | null = null;
    let tls12Supported: boolean | null = null;
    let tls13Supported: boolean | null = null;
    let tls10Supported: boolean | null = null;
    let tls11Supported: boolean | null = null;
    let http2Alpn: boolean | null = null;

    for (const row of shodanHostPayloads) {
      const payload = row.payload as Record<string, unknown>;
      const sslObjects = collectNestedObjectsByKey(payload, "ssl");
      for (const sslObject of sslObjects) {
        const versions = Array.isArray((sslObject as any)?.versions)
          ? ((sslObject as any).versions as unknown[]).map((entry) => String(entry || "").toLowerCase())
          : [];
        if (versions.length === 0) continue;
        result.source = "shodan";
        tls13Supported = versions.some((entry) => entry.includes("tlsv1.3"));
        tls12Supported = versions.some((entry) => entry.includes("tlsv1.2"));
        tls11Supported = versions.some((entry) => entry.includes("tlsv1.1"));
        tls10Supported = versions.some((entry) => entry.includes("tlsv1") && !entry.includes("1.1") && !entry.includes("1.2") && !entry.includes("1.3"));
        weakProtocolDetected = Boolean(tls10Supported || tls11Supported);
        selectedCipher = String((sslObject as any)?.cipher?.name || "").trim() || null;
        selectedProtocol = String((sslObject as any)?.versions?.[0] || "").trim() || null;
        const weak = Array.isArray((sslObject as any)?.cipher?.weak)
          ? ((sslObject as any).cipher.weak as unknown[]).map((entry) => String(entry || "").trim()).filter(Boolean)
          : [];
        weakCiphers = [...new Set([...weakCiphers, ...weak])];
      }
    }

    if (latestHttpSnapshot) {
      const altSvc = latestHttpSnapshot.headers["alt-svc"] || "";
      http2Alpn = latestHttpSnapshot.finalUrl.startsWith("https://")
        ? /h2/i.test(altSvc) || Boolean(latestHttpSnapshot.headers[":protocol"] === "h2")
        : false;
      if (result.source === "https-fetch-basic") {
        tls12Supported = latestHttpSnapshot.finalUrl.startsWith("https://");
        tls13Supported = null;
      }
    }

    result.tls13Supported = tls13Supported;
    result.tls12Supported = tls12Supported;
    result.tls10Supported = tls10Supported;
    result.tls11Supported = tls11Supported;
    result.http2Alpn = http2Alpn;
    result.selectedProtocol = selectedProtocol;
    result.selectedCipher = selectedCipher;
    result.weakCiphers = weakCiphers;

    await insertObservation({
      module: "tls_summary",
      observation_type: "tls_summary",
      title: "TLS summary",
      value: result,
    });

    if (tls10Supported || tls11Supported) {
      await insertFinding({
        module: "tls_summary",
        finding_type: "tls_legacy_protocols_enabled",
        severity: "high",
        title: "Legacy TLS protocols enabled (TLS 1.0/1.1)",
        affected_asset: hostForTls,
        remediation: "Disabilitare TLS 1.0/1.1 e mantenere TLS 1.2+.",
      });
    }
    if (tls12Supported === false) {
      await insertFinding({
        module: "tls_summary",
        finding_type: "tls12_not_supported",
        severity: "high",
        title: "TLS 1.2 not supported",
        affected_asset: hostForTls,
      });
    }
    if (weakCiphers.length > 0 || weakProtocolDetected) {
      await insertFinding({
        module: "tls_summary",
        finding_type: "tls_weak_cipher_detected",
        severity: "medium",
        title: "Weak TLS ciphers/protocols detected",
        affected_asset: hostForTls,
        evidence: { weak_ciphers: weakCiphers },
      });
    }
  };

  const runServerInfoModule = async () => {
    const hostForInfo = hostname || rootDomain || parsedTarget.hostname || "";
    const scopedIps = [...discoveredIps].filter((ip) => isIpAllowedInScope(ip));
    const primaryIp = scopedIps[0] || "";
    const serverInfo: Record<string, unknown> = {
      hostname: hostForInfo || null,
      ip: primaryIp || null,
      source: "fallback",
      ports: [],
      technologies: [],
    };

    let shodanPorts: number[] = [];
    let shodanTech: string[] = [];
    for (const entry of shodanHostPayloads) {
      const payload = entry.payload as Record<string, unknown>;
      const ports = Array.isArray(payload?.ports)
        ? payload.ports.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value))
        : [];
      const tags = Array.isArray(payload?.tags)
        ? payload.tags.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];
      const cpes = Array.isArray(payload?.cpes)
        ? payload.cpes.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];
      shodanPorts = [...new Set([...shodanPorts, ...ports])];
      shodanTech = [...new Set([...shodanTech, ...tags, ...cpes])];
      const org = String(payload?.org || payload?.isp || "").trim();
      const asn = String(payload?.asn || "").trim();
      if (org) serverInfo.organization = org;
      if (asn) serverInfo.asn = asn;
      serverInfo.source = "shodan";
      if (payload?.country_name || payload?.city || payload?.region_code || payload?.country_code) {
        serverInfo.location = {
          city: String(payload?.city || "").trim() || null,
          region: String(payload?.region_code || "").trim() || null,
          country: String(payload?.country_name || "").trim() || null,
          countryCode: String(payload?.country_code || "").trim() || null,
        };
      }
    }

    for (const port of shodanPorts) {
      await insertAsset({
        asset_type: "open_port",
        asset_value: `${primaryIp || hostForInfo}:${port}`,
        hostname: hostForInfo || null,
        root_domain: rootDomain,
        ip: primaryIp || null,
        source: "server_info",
        confidence: "low",
      });
    }

    serverInfo.ports = shodanPorts.slice(0, 100);
    serverInfo.technologies = shodanTech.slice(0, 100);
    if (!serverInfo.organization && latestHttpSnapshot) {
      serverInfo.serverHeader = latestHttpSnapshot.headers["server"] || null;
      serverInfo.poweredBy = latestHttpSnapshot.headers["x-powered-by"] || null;
      serverInfo.source = "http_headers";
    }

    await insertObservation({
      module: "server_info",
      observation_type: "server_info",
      title: "Server information summary",
      value: serverInfo,
    });

    if (String(serverInfo.serverHeader || "").trim().match(/[a-z0-9._-]+\/\d/i)) {
      await insertFinding({
        module: "server_info",
        finding_type: "server_header_version_exposed",
        severity: "low",
        title: "Server version exposed in HTTP header",
        affected_asset: hostForInfo || primaryIp || null,
      });
    }
  };

  const runServerLocationModule = async () => {
    const primaryShodan = shodanHostPayloads[0];
    const primaryIp = primaryShodan?.ip || [...discoveredIps].find((ip) => isIpAllowedInScope(ip)) || null;
    if (!primaryIp) return;

    const payload = (primaryShodan?.payload || {}) as Record<string, unknown>;
    const location = {
      ip: primaryIp,
      city: String(payload?.city || "").trim() || null,
      region: String(payload?.region_code || payload?.region_name || "").trim() || null,
      country: String(payload?.country_name || "").trim() || null,
      countryCode: String(payload?.country_code || "").trim() || null,
      latitude: typeof payload?.latitude === "number" ? payload.latitude : null,
      longitude: typeof payload?.longitude === "number" ? payload.longitude : null,
      timezone: String(payload?.timezone || "").trim() || null,
      languages: Array.isArray(payload?.languages)
        ? payload.languages.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
        : [],
      currency: String(payload?.currency || "").trim() || null,
      approximate: true,
      source: primaryShodan ? "shodan" : "fallback",
    };

    await insertObservation({
      module: "server_location",
      observation_type: "server_location",
      title: "Approximate server location",
      value: location,
    });
  };

  const runTechStackModule = async () => {
    for (const entry of shodanHostPayloads) {
      const payload = entry.payload as Record<string, unknown>;
      const cpes = Array.isArray(payload?.cpes) ? payload.cpes : [];
      for (const cpe of cpes.slice(0, 100)) {
        const rawCpe = String(cpe || "").trim();
        if (!rawCpe) continue;
        const parts = rawCpe.split(":");
        const product = parts.length >= 5 ? parts[4] : rawCpe;
        const version = parts.length >= 6 ? parts[5] : "";
        const name = product.replace(/[_-]+/g, " ").trim();
        addTechFingerprint(name, {
          categories: ["service", "fingerprint"],
          version: version || undefined,
          confidence: 70,
          source: "shodan_cpe",
        });
      }
    }

    const technologies = [...techFingerprintMap.values()]
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 200)
      .map((entry) => ({
        name: entry.name,
        categories: entry.categories,
        version: entry.version || null,
        confidence: entry.confidence || null,
        source: entry.source,
      }));

    await insertObservation({
      module: "tech_stack",
      observation_type: "tech_stack",
      title: "Technology stack fingerprint",
      value: {
        technologies,
        count: technologies.length,
      },
    });

    for (const tech of technologies.slice(0, 50)) {
      if (tech.version) {
        await insertFinding({
          module: "tech_stack",
          finding_type: "technology_version_exposed",
          severity: "low",
          title: `${tech.name} version exposed`,
          description: `Versione rilevata: ${tech.version}.`,
          affected_asset: hostname || rootDomain || null,
          evidence: {
            technology: tech.name,
            version: tech.version,
            source: tech.source,
          },
          remediation: "Limitare disclosure di versione e mantenere piano di patching continuo.",
        });
      }
    }
  };

  const runQualityModule = async () => {
    if (!hostname) return;
    const googleApiKey = Deno.env.get("GOOGLE_CLOUD_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
    if (!googleApiKey) {
      await insertObservation({
        module: "quality",
        observation_type: "module_skipped",
        title: "Quality module skipped",
        value: {
          reason: "missing_google_cloud_api_key",
        },
        severity: "info",
      });
      return;
    }

    const strategies: Array<"mobile" | "desktop"> = ["mobile"];
    if (job.scan_profile === "cve_api_validation") {
      strategies.push("desktop");
    }

    const toPercent = (value: unknown): number | null => {
      const score = Number(value);
      if (!Number.isFinite(score)) return null;
      if (score > 1) return Math.max(0, Math.min(100, Math.round(score)));
      return Math.max(0, Math.min(100, Math.round(score * 100)));
    };

    const summaries: Array<Record<string, unknown>> = [];
    const allFailedAudits: Array<Record<string, unknown>> = [];
    for (const strategy of strategies) {
      const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
      endpoint.searchParams.set("url", targetUrl);
      endpoint.searchParams.set("strategy", strategy);
      endpoint.searchParams.append("category", "PERFORMANCE");
      endpoint.searchParams.append("category", "ACCESSIBILITY");
      endpoint.searchParams.append("category", "BEST_PRACTICES");
      endpoint.searchParams.append("category", "SEO");
      endpoint.searchParams.set("key", googleApiKey);

      const response = await fetchWithTimeout(endpoint.toString(), {}, 30000);
      if (!response.ok) {
        await insertObservation({
          module: "quality",
          observation_type: "pagespeed_error",
          title: "PageSpeed request failed",
          value: {
            status: response.status,
            target: targetUrl,
            strategy,
          },
          severity: "low",
        });
        continue;
      }

      const payload = await response.json().catch(() => ({}));
      const categories = payload?.lighthouseResult?.categories || {};
      const quality = {
        performance: toPercent(categories?.performance?.score),
        accessibility: toPercent(categories?.accessibility?.score),
        best_practices: toPercent(categories?.["best-practices"]?.score),
        seo: toPercent(categories?.seo?.score),
      };
      const audits = payload?.lighthouseResult?.audits || {};
      const failedAudits = Object.entries(audits)
        .filter(([, value]: any) => typeof value?.score === "number" && value.score < 0.5)
        .slice(0, 30)
        .map(([id, value]: any) => ({
          id,
          title: value?.title || id,
          score: value?.score,
          scoreDisplayMode: value?.scoreDisplayMode || null,
          description: String(value?.description || "").slice(0, 500),
          strategy,
        }));
      allFailedAudits.push(...failedAudits);
      summaries.push({
        strategy,
        categories: quality,
        failed_audits: failedAudits.slice(0, 10),
      });

      await insertObservation({
        module: "quality",
        observation_type: `quality_summary_${strategy}`,
        title: `Quality summary (PageSpeed ${strategy})`,
        value: {
          url: targetUrl,
          strategy,
          categories: quality,
          failed_audits: failedAudits.slice(0, 10),
          source: "pagespeed-insights",
        },
      });
    }

    const primary = summaries.find((entry) => entry.strategy === "mobile") || summaries[0];
    if (!primary) return;
    const primaryCategories = (primary.categories as Record<string, number | null>) || {};
    const criticalAuditIds = ["is-on-https", "mixed-content", "no-vulnerable-libraries"];

    await insertObservation({
      module: "quality",
      observation_type: "quality_summary",
      title: "Quality summary (PageSpeed)",
      value: {
        url: targetUrl,
        strategy: "mobile",
        categories: primaryCategories,
        failed_audits: allFailedAudits.slice(0, 20),
        by_strategy: summaries,
        source: "pagespeed-insights",
      },
    });

    const performance = Number(primaryCategories.performance);
    const bestPractices = Number(primaryCategories.best_practices);
    const accessibility = Number(primaryCategories.accessibility);
    const seo = Number(primaryCategories.seo);

    if (Number.isFinite(performance) && performance < 50) {
      await insertFinding({
        module: "quality",
        finding_type: "quality_performance_low",
        severity: "medium",
        title: "Performance score below 50",
        affected_url: targetUrl,
        description: `Performance score attuale: ${performance}/100.`,
        remediation: "Ottimizzare performance lato frontend/backend (TTFB, caching, payload statici).",
      });
    }
    if (Number.isFinite(bestPractices) && bestPractices < 70) {
      await insertFinding({
        module: "quality",
        finding_type: "quality_best_practices_low",
        severity: "medium",
        title: "Best Practices score below 70",
        affected_url: targetUrl,
      });
    }
    if (Number.isFinite(accessibility) && accessibility < 70) {
      await insertFinding({
        module: "quality",
        finding_type: "quality_accessibility_low",
        severity: accessibility < 50 ? "medium" : "low",
        title: "Accessibility score below 70",
        affected_url: targetUrl,
      });
    }
    if (Number.isFinite(seo) && seo < 70) {
      await insertFinding({
        module: "quality",
        finding_type: "quality_seo_low",
        severity: "low",
        title: "SEO score below 70",
        affected_url: targetUrl,
      });
    }

    for (const auditId of criticalAuditIds) {
      const match = allFailedAudits.find((entry) => String(entry.id || "").toLowerCase() === auditId);
      if (!match) continue;
      const severity = auditId === "mixed-content" || auditId === "is-on-https" ? "high" : "high";
      await insertFinding({
        module: "quality",
        finding_type: `quality_audit_${auditId.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
        severity,
        title: `Audit failed: ${String(match.title || auditId)}`,
        description: String(match.description || "").slice(0, 400),
        affected_url: targetUrl,
      });
    }
  };

  const runThreatsModule = async () => {
    if (!hostname) return;
    const targetUrlCandidate = targetUrl;
    const googleApiKey = Deno.env.get("GOOGLE_CLOUD_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
    let safeBrowsingMatches: any[] = [];

    if (googleApiKey) {
      try {
        const safeBrowsingRes = await fetchWithTimeout(
          `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(googleApiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client: { clientId: "surfacescan360", clientVersion: "1.0" },
              threatInfo: {
                threatTypes: [
                  "MALWARE",
                  "SOCIAL_ENGINEERING",
                  "UNWANTED_SOFTWARE",
                  "POTENTIALLY_HARMFUL_APPLICATION",
                ],
                platformTypes: ["ANY_PLATFORM"],
                threatEntryTypes: ["URL"],
                threatEntries: [{ url: targetUrlCandidate }],
              },
            }),
          },
          12000,
        );

        const safePayload = await safeBrowsingRes.json().catch(() => ({}));
        safeBrowsingMatches = Array.isArray(safePayload?.matches) ? safePayload.matches : [];
      } catch {
        safeBrowsingMatches = [];
      }
    }

    let urlHausListed = false;
    let urlHausSummary: Record<string, unknown> = {};
    try {
      const form = new URLSearchParams();
      form.set("host", hostname);
      const urlHausRes = await fetchWithTimeout("https://urlhaus-api.abuse.ch/v1/host/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }, 12000);
      const urlHausPayload = await urlHausRes.json().catch(() => ({}));
      const urls = Array.isArray(urlHausPayload?.urls) ? urlHausPayload.urls : [];
      const queryStatus = String(urlHausPayload?.query_status || "").toLowerCase();
      urlHausListed = queryStatus === "ok" && urls.length > 0;
      urlHausSummary = {
        query_status: queryStatus || "unknown",
        listed_urls: urls.slice(0, 20),
      };
    } catch {
      urlHausSummary = { query_status: "error" };
    }

    const phishTankKey = Deno.env.get("PHISHTANK_API_KEY") || "";
    let phishTank: {
      inDatabase: boolean;
      valid: boolean;
      verified: boolean;
      source: string;
      details?: Record<string, unknown>;
    } | null = null;
    try {
      const form = new URLSearchParams();
      form.set("url", targetUrlCandidate);
      form.set("format", "xml");
      if (phishTankKey) form.set("app_key", phishTankKey);
      const phishRes = await fetchWithTimeout("https://checkurl.phishtank.com/checkurl/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "SurfaceScan360/1.0 (+https://hicompliance.it)",
        },
        body: form.toString(),
      }, 12000);
      const xml = await phishRes.text();
      const inDatabase = /<in_database>\s*true\s*<\/in_database>/i.test(xml);
      const valid = /<valid>\s*true\s*<\/valid>/i.test(xml);
      const verified = /<verified>\s*true\s*<\/verified>/i.test(xml);
      phishTank = {
        inDatabase,
        valid,
        verified,
        source: "phishtank",
        details: {
          status: phishRes.status,
        },
      };
    } catch {
      phishTank = null;
    }

    const internalIndicators: Array<{
      ioc: string;
      type: "domain" | "ip" | "url";
      confidence?: number;
      source?: string;
    }> = [];
    try {
      const { data: internalRows } = await adminClient
        .from("surface_external_intel" as any)
        .select("provider, target, summary, raw_response")
        .eq("customer_id", customerId)
        .in("provider", ["intelguard_feed", "intelguard_threat_feed", "internal_threat_feed"])
        .order("created_at", { ascending: false })
        .limit(200);
      for (const row of (internalRows || []) as Array<Record<string, unknown>>) {
        const provider = String(row?.provider || "").trim();
        const target = String(row?.target || "").trim().toLowerCase();
        if (!target) continue;
        if (
          target !== hostname.toLowerCase() &&
          target !== targetUrlCandidate.toLowerCase() &&
          !targetUrlCandidate.toLowerCase().includes(target)
        ) {
          continue;
        }
        const summary = (row?.summary as Record<string, unknown>) || {};
        const confidence = Number(summary?.confidence || summary?.score || 0);
        internalIndicators.push({
          ioc: target,
          type: target.includes("://") ? "url" : target.includes(".") ? "domain" : "ip",
          confidence: Number.isFinite(confidence) ? confidence : undefined,
          source: provider || "internal",
        });
      }
    } catch {
      // optional internal feed integration
    }

    const internalHighConfidence = internalIndicators.filter((entry) => (entry.confidence || 0) >= 90);
    const internalMediumConfidence = internalIndicators.filter((entry) => (entry.confidence || 0) >= 70 && (entry.confidence || 0) < 90);

    const noThreatMatches =
      safeBrowsingMatches.length === 0 &&
      !urlHausListed &&
      !(phishTank?.inDatabase && (phishTank?.valid || phishTank?.verified)) &&
      internalIndicators.length === 0;
    await insertObservation({
      module: "threats",
      observation_type: "threats_summary",
      title: "Threat intelligence summary",
      value: {
        target: targetUrlCandidate,
        safe_browsing: {
          configured: Boolean(googleApiKey),
          unsafe: safeBrowsingMatches.length > 0,
          matches: safeBrowsingMatches.slice(0, 20),
        },
        urlhaus: {
          listed: urlHausListed,
          ...urlHausSummary,
        },
        phishtank: phishTank
          ? {
            in_database: phishTank.inDatabase,
            valid: phishTank.valid,
            verified: phishTank.verified,
          }
          : {
            configured: Boolean(phishTankKey),
            checked: false,
          },
        intelguard: {
          matched: internalIndicators.length > 0,
          indicators: internalIndicators.slice(0, 30),
        },
        no_threat_matches: noThreatMatches,
      },
    });

    if (safeBrowsingMatches.length > 0) {
      await insertFinding({
        module: "threats",
        finding_type: "safe_browsing_match",
        severity: "critical",
        title: "Google Safe Browsing flagged target",
        affected_asset: hostname,
        affected_url: targetUrlCandidate,
        evidence: { matches: safeBrowsingMatches.slice(0, 20) },
        remediation: "Bloccare temporaneamente il target a livello di fruizione pubblica e avviare verifica incident response.",
      });
    }

    if (urlHausListed) {
      await insertFinding({
        module: "threats",
        finding_type: "urlhaus_listed",
        severity: "high",
        title: "Target listed in URLHaus",
        affected_asset: hostname,
        evidence: urlHausSummary,
        remediation: "Verificare compromissione contenuti/redirect e ripristinare stato sicuro prima di ri-esporre il servizio.",
      });
    }

    if (phishTank?.inDatabase && (phishTank?.valid || phishTank?.verified)) {
      await insertFinding({
        module: "threats",
        finding_type: "phishtank_verified_match",
        severity: "critical",
        title: "Target flagged in PhishTank",
        affected_asset: hostname,
        affected_url: targetUrlCandidate,
        evidence: {
          in_database: phishTank.inDatabase,
          valid: phishTank.valid,
          verified: phishTank.verified,
        },
        remediation: "Bloccare target, avviare incident response e validare compromissione lato contenuti/DNS.",
      });
    }

    if (internalHighConfidence.length > 0) {
      await insertFinding({
        module: "threats",
        finding_type: "intelguard_high_confidence_match",
        severity: "high",
        title: "High-confidence match in internal threat feed",
        affected_asset: hostname,
        affected_url: targetUrlCandidate,
        evidence: {
          indicators: internalHighConfidence.slice(0, 20),
        },
        remediation: "Eseguire triage IOC prioritario e validare esposizione effettiva su asset in scope.",
      });
    } else if (internalMediumConfidence.length > 0) {
      await insertFinding({
        module: "threats",
        finding_type: "intelguard_medium_confidence_match",
        severity: "medium",
        title: "Medium-confidence match in internal threat feed",
        affected_asset: hostname,
        affected_url: targetUrlCandidate,
        evidence: {
          indicators: internalMediumConfidence.slice(0, 20),
        },
        remediation: "Validare IOC con controlli aggiuntivi (DNS, proxy, EDR) e confermare attribuzione.",
      });
    }
  };

  const runDnsBlocklistsModule = async () => {
    const providers = ["zen.spamhaus.org", "bl.spamcop.net", "dnsbl.sorbs.net"];
    const ipv4Targets = [...discoveredIps]
      .map((entry) => String(entry || "").trim())
      .filter((entry) => /^\d{1,3}(\.\d{1,3}){3}$/.test(entry))
      .slice(0, 5);
    if (ipv4Targets.length === 0) {
      await insertObservation({
        module: "dns_blocklists",
        observation_type: "dnsbl_skipped",
        title: "DNS blocklist skipped",
        value: { reason: "no_ipv4_targets" },
        severity: "info",
      });
      return;
    }

    const checked: Array<{ provider: string; ip: string; listed: boolean; records: string[] }> = [];
    for (const ip of ipv4Targets) {
      const reversed = ip.split(".").reverse().join(".");
      for (const provider of providers) {
        const queryName = `${reversed}.${provider}`;
        const answers = await resolveWithDnsOverHttps(queryName, "A");
        const listed = answers.length > 0;
        checked.push({ provider, ip, listed, records: answers.slice(0, 10) });
        if (listed) {
          await insertFinding({
            module: "dns_blocklists",
            finding_type: "dnsbl_listed",
            severity: provider.includes("spamhaus") ? "high" : "medium",
            title: `IP listed in DNS blocklist (${provider})`,
            affected_asset: hostname || ip,
            ip,
            evidence: {
              provider,
              records: answers.slice(0, 10),
            },
            remediation: "Verificare reputazione IP, abuso SMTP/malware e avviare delisting dopo remediation.",
          });
        }
      }
    }

    await insertObservation({
      module: "dns_blocklists",
      observation_type: "dnsbl_summary",
      title: "DNS blocklist summary",
      value: {
        checked,
        listed_count: checked.filter((entry) => entry.listed).length,
        not_listed: checked.every((entry) => !entry.listed),
      },
    });
  };

  const runOpenPortsModule = async () => {
    const toProfile = (profile: string): "quick" | "full" | "deep" => {
      if (profile === "safe_recon") return "quick";
      if (profile === "domain_exposure" || profile === "ip_exposure") return "full";
      return "deep";
    };

    const { data: portAssets, error: portAssetsError } = await adminClient
      .from("surface_assets" as any)
      .select("asset_value, ip, hostname, source, raw")
      .eq("scan_job_id", job.id)
      .eq("asset_type", "open_port")
      .limit(2000);
    if (portAssetsError) {
      throw new Error(portAssetsError.message || "Unable to read open port assets");
    }

    const { data: cveFindings } = await adminClient
      .from("surface_findings" as any)
      .select("ip, port, cve")
      .eq("scan_job_id", job.id)
      .not("cve", "is", null)
      .limit(4000);

    const cveBySocket = new Map<string, string[]>();
    for (const row of (cveFindings || []) as Array<Record<string, unknown>>) {
      const ip = String(row?.ip || "").trim();
      const port = Number(row?.port || 0);
      const cves = Array.isArray(row?.cve)
        ? (row.cve as unknown[]).map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      if (!ip || !port || cves.length === 0) continue;
      const key = `${ip}:${port}`;
      const existing = cveBySocket.get(key) || [];
      cveBySocket.set(key, [...new Set([...existing, ...cves])]);
    }

    const openPortMap = new Map<
      string,
      {
        target: string;
        ip: string;
        source: "pentest-tools" | "shodan" | "cache" | "node-tcp";
        port: number;
        protocol: "tcp" | "udp";
        service?: string;
        product?: string;
        version?: string;
        banner?: string;
        confidence?: number;
        cves?: string[];
      }
    >();

    for (const asset of (portAssets || []) as Array<Record<string, unknown>>) {
      const assetValue = String(asset?.asset_value || "").trim();
      if (!assetValue.includes(":")) continue;
      const [hostPart, portPart] = assetValue.split(":");
      const parsedPort = Number(portPart);
      if (!Number.isFinite(parsedPort) || parsedPort <= 0) continue;
      const raw = (asset?.raw as Record<string, unknown>) || {};
      const protocolValue = String(raw?.protocol || "tcp").toLowerCase();
      const protocol = protocolValue === "udp" ? "udp" : "tcp";
      const ip = String(asset?.ip || hostPart || "").trim().toLowerCase();
      const target = String(asset?.hostname || hostname || rootDomain || ip || "").trim();
      const sourceRaw = String(asset?.source || "").toLowerCase();
      const source: "pentest-tools" | "shodan" | "cache" | "node-tcp" = sourceRaw.includes("pentest")
        ? "pentest-tools"
        : sourceRaw.includes("shodan")
          ? "shodan"
          : sourceRaw.includes("node")
            ? "node-tcp"
            : "cache";
      const key = `${ip}:${parsedPort}/${protocol}`;
      const service = String(raw?.service || raw?.service_name || "").trim() || undefined;
      const product = String(raw?.product || "").trim() || undefined;
      const version = String(raw?.version || raw?.service_version || "").trim() || undefined;
      const banner = String(raw?.banner || "").trim() || undefined;
      const confidenceRaw = Number(raw?.confidence || 0);
      const confidence = Number.isFinite(confidenceRaw) && confidenceRaw > 0 ? confidenceRaw : undefined;
      const socketCves = cveBySocket.get(`${ip}:${parsedPort}`) || [];

      if (!openPortMap.has(key)) {
        openPortMap.set(key, {
          target,
          ip,
          source,
          port: parsedPort,
          protocol,
          service,
          product,
          version,
          banner,
          confidence,
          cves: socketCves,
        });
        continue;
      }
      const existing = openPortMap.get(key)!;
      existing.service = existing.service || service;
      existing.product = existing.product || product;
      existing.version = existing.version || version;
      existing.banner = existing.banner || banner;
      existing.confidence = Math.max(existing.confidence || 0, confidence || 0) || undefined;
      existing.cves = [...new Set([...(existing.cves || []), ...socketCves])];
    }

    const openPorts = [...openPortMap.values()]
      .sort((a, b) => {
        const sevDiff = severityRank(severityForExposedPort(b.port)) - severityRank(severityForExposedPort(a.port));
        if (sevDiff !== 0) return sevDiff;
        return a.port - b.port;
      });

    const output = {
      target: hostname || rootDomain || parsedTarget.hostname || parsedTarget.normalized_target,
      ip: openPorts[0]?.ip || [...discoveredIps][0] || null,
      source: openPorts[0]?.source || "cache",
      openPorts,
      failedPorts: [],
      scanProfile: toProfile(job.scan_profile),
      scanStartedAt: job.started_at || null,
      scanCompletedAt: new Date().toISOString(),
    };

    await insertObservation({
      module: "open_ports",
      observation_type: "open_ports_summary",
      title: "Open ports and exposed services",
      value: output,
      severity: openPorts.length > 0 ? "low" : "info",
    });

    const criticalCount = openPorts.filter((entry) => severityForExposedPort(entry.port) === "critical").length;
    const highCount = openPorts.filter((entry) => severityForExposedPort(entry.port) === "high").length;
    if (criticalCount > 0) {
      await insertFinding({
        module: "open_ports",
        finding_type: "open_ports_critical_exposure",
        severity: "critical",
        title: "Critical exposed services detected",
        affected_asset: hostname || rootDomain || null,
        description: `${criticalCount} porte critiche esposte pubblicamente.`,
        evidence: {
          critical_ports: openPorts
            .filter((entry) => severityForExposedPort(entry.port) === "critical")
            .slice(0, 30),
        },
        remediation: "Isolare immediatamente i servizi critici da Internet e consentire accesso solo da reti autorizzate.",
      });
    } else if (highCount > 0) {
      await insertFinding({
        module: "open_ports",
        finding_type: "open_ports_high_exposure",
        severity: "high",
        title: "High-risk exposed services detected",
        affected_asset: hostname || rootDomain || null,
        description: `${highCount} porte ad alto rischio esposte pubblicamente.`,
        evidence: {
          high_ports: openPorts
            .filter((entry) => severityForExposedPort(entry.port) === "high")
            .slice(0, 30),
        },
        remediation: "Ridurre la superficie esposta con ACL/firewall, MFA e accesso tramite VPN/ZTNA.",
      });
    }
  };

  const runPassesModule = async () => {
    const getLatestFinding = async (moduleKey: string, findingTypes: string[]) => {
      const query = adminClient
        .from("surface_findings" as any)
        .select("id, severity")
        .eq("scan_job_id", job.id)
        .eq("module", moduleKey);
      const { data } = await query.in("finding_type", findingTypes).limit(1);
      return (data || [])[0] || null;
    };
    const getLatestFindingAnyModule = async (moduleKeys: string[], findingTypes: string[]) => {
      const query = adminClient
        .from("surface_findings" as any)
        .select("id, severity")
        .eq("scan_job_id", job.id);
      const { data } = await query.in("module", moduleKeys).in("finding_type", findingTypes).limit(1);
      return (data || [])[0] || null;
    };

    const qualityObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .eq("module", "quality")
      .eq("observation_type", "quality_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const qualityValue = qualityObservationRes.data?.value || {};
    const categories = qualityValue?.categories || {};
    const accessibilityScore = Number(categories?.accessibility);
    const seoScore = Number(categories?.seo);

    const whoisObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .eq("module", "whois")
      .eq("observation_type", "whois_rdap")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const whoisValue = whoisObservationRes.data?.value || {};
    const daysToExpiry = Number(whoisValue?.days_to_expiry);

    const tlsObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .eq("module", "tls_summary")
      .eq("observation_type", "tls_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const tlsValue = tlsObservationRes.data?.value || {};
    const tls13Supported = Boolean(
      tlsValue?.tls13Supported === true || String(tlsValue?.selectedProtocol || "").toLowerCase().includes("1.3"),
    );
    const http2Alpn = Boolean(tlsValue?.http2Alpn === true);

    const dnsblObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .eq("module", "dns_blocklists")
      .eq("observation_type", "dnsbl_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dnsblValue = dnsblObservationRes.data?.value || {};
    const listedCount = Number(dnsblValue?.listed_count);

    const redirectObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .in("module", ["redirects", "redirect_chain"])
      .in("observation_type", ["redirects_summary", "redirect_chain"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const redirectValue = redirectObservationRes.data?.value || {};
    const redirectsToHttps = Boolean(redirectValue?.redirectsToHttps);

    const mailObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .eq("module", "mail_security")
      .eq("observation_type", "mail_security_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const mailValue = mailObservationRes.data?.value || {};
    const hasSpfRecord = Boolean(mailValue?.has_spf);

    const hasDnssecFinding = await getLatestFinding("dnssec", [
      "dnssec_missing",
      "dnssec_inconsistent_delegation",
    ]);
    const hasThreatFinding = await getLatestFinding("threats", [
      "safe_browsing_match",
      "urlhaus_listed",
      "phishtank_verified_match",
      "intelguard_high_confidence_match",
      "intelguard_medium_confidence_match",
    ]);
    const hasBlocklistFinding = await getLatestFinding("dns_blocklists", ["dnsbl_listed"]);
    const hasSpfMissing = await getLatestFinding("mail_security", ["mail_spf_missing"]);
    const hasRedirectMissing = await getLatestFindingAnyModule(
      ["redirect_chain", "redirects"],
      ["no_http_to_https_redirect"],
    );
    const hasExpiredDomain = await getLatestFinding("whois", ["domain_expired"]);
    const hasSslInvalid = await getLatestFinding("ssl_certificate", [
      "ssl_certificate_expired",
      "ssl_certificate_self_signed",
      "ssl_certificate_untrusted_chain",
      "ssl_hostname_mismatch",
      "ssl_missing_san",
    ]);

    const passItems = [
      {
        key: "ssl_valid",
        label: "SSL certificate valid",
        passed: !hasSslInvalid,
        sourceModule: "ssl_certificate",
      },
      {
        key: "domain_registration_valid",
        label: "Domain registration is valid",
        passed: Number.isFinite(daysToExpiry) ? daysToExpiry > 0 : !hasExpiredDomain,
        value: Number.isFinite(daysToExpiry) ? daysToExpiry : null,
        sourceModule: "whois",
      },
      {
        key: "accessibility_score",
        label: "Accessibility score",
        passed: Number.isFinite(accessibilityScore) ? accessibilityScore >= 80 : false,
        value: Number.isFinite(accessibilityScore) ? accessibilityScore : null,
        sourceModule: "quality",
      },
      {
        key: "seo_score",
        label: "SEO score",
        passed: Number.isFinite(seoScore) ? seoScore >= 80 : false,
        value: Number.isFinite(seoScore) ? seoScore : null,
        sourceModule: "quality",
      },
      {
        key: "tls13_supported",
        label: "TLS 1.3 negotiated/supported",
        passed: tls13Supported,
        sourceModule: "tls_summary",
      },
      {
        key: "http2_alpn",
        label: "HTTP/2 via ALPN",
        passed: http2Alpn,
        sourceModule: "tls_summary",
      },
      { key: "dnssec_enabled", label: "DNSSEC enabled", passed: !hasDnssecFinding, sourceModule: "dnssec" },
      { key: "no_threat_matches", label: "No threat feed matches", passed: !hasThreatFinding, sourceModule: "threats" },
      {
        key: "spf_published",
        label: "SPF record published",
        passed: hasSpfRecord || !hasSpfMissing,
        sourceModule: "mail_security",
      },
      {
        key: "https_redirect",
        label: "HTTP requests are redirected to HTTPS",
        passed: redirectsToHttps || !hasRedirectMissing,
        sourceModule: "redirects",
      },
      {
        key: "not_on_dns_blocklists",
        label: "Not on tested DNS blocklists",
        passed: Number.isFinite(listedCount) ? listedCount === 0 : !hasBlocklistFinding,
        value: Number.isFinite(listedCount) ? listedCount : null,
        sourceModule: "dns_blocklists",
      },
    ];

    await insertObservation({
      module: "passes",
      observation_type: "passes_summary",
      title: "Passes summary",
      value: {
        passes: passItems,
        passedCount: passItems.filter((entry) => entry.passed).length,
        totalCount: passItems.length,
      },
    });
  };

  const runReverseAndDumpsterModule = async () => {
    if (discoveredIps.size > 0) {
      const ptrResults: Record<string, string[]> = {};
      const ptrSkippedByScope: string[] = [];
      for (const ip of discoveredIps) {
        if (!isIpAllowedInScope(ip)) {
          ptrSkippedByScope.push(ip);
          continue;
        }
        const reverseName = ip.includes(".")
          ? `${ip.split(".").reverse().join(".")}.in-addr.arpa`
          : buildIpv6PtrName(ip);
        if (!reverseName) continue;

        const ptr = await resolveWithDnsOverHttps(reverseName, "PTR");
        ptrResults[ip] = ptr;
        for (const ptrHost of ptr) {
          const normalizedPtr = ptrHost.trim().toLowerCase().replace(/\.$/, "");
          if (!isValidHostnameCandidate(normalizedPtr)) continue;
          const ptrClassification = classifyHostAgainstScope(normalizedPtr);
          if (ptrClassification.blocked) {
            await insertAsset({
              asset_type: "reverse_dns_hostname",
              asset_value: normalizedPtr,
              hostname: normalizedPtr,
              root_domain: rootDomain,
              source: "reverse_dns",
              confidence: "low",
              raw: {
                ip,
                _scope_excluded: true,
                _scope_exclusion_reason: ptrClassification.reason || "scope_excluded_domain",
                _scope_excluded_at: new Date().toISOString(),
              },
            });
            continue;
          }
          discoveredHostnames.add(normalizedPtr);
          await insertAsset({
            asset_type: "reverse_dns_hostname",
            asset_value: normalizedPtr,
            hostname: normalizedPtr,
            root_domain: rootDomain,
            source: "reverse_dns",
            confidence: "low",
            raw: { ip },
          });
        }
      }
      await insertObservation({
        module: "reverse_dns",
        observation_type: "reverse_dns",
        title: "Reverse DNS lookup",
        value: {
          results: ptrResults,
          skipped_out_of_scope_ips: ptrSkippedByScope,
        },
      });
    }

    if (rootDomain) {
      try {
        const crtRes = await fetchWithTimeout(
          `https://crt.sh/?q=%25.${encodeURIComponent(rootDomain)}&output=json`,
          {},
          15000,
        );
        if (crtRes.ok) {
          const payload = await crtRes.json();
          const rows = Array.isArray(payload) ? payload : [];
          const names = new Set<string>();
          let resolvedSubdomains = 0;
          let unresolvedSubdomains = 0;

          for (const row of rows.slice(0, 500)) {
            const nameValue = String(row?.name_value || "").trim();
            if (!nameValue) continue;
            for (const candidate of nameValue.split("\n")) {
              const normalized = candidate.trim().toLowerCase().replace(/\.$/, "");
              if (
                normalized.endsWith(rootDomain) &&
                !normalized.startsWith("*.") &&
                isValidHostnameCandidate(normalized)
              ) {
                names.add(normalized);
              }
            }
          }

          for (const sub of [...names].slice(0, 200)) {
            if (!shouldAcceptScannableHost(sub)) {
              const exclusionReason = scopeReasonFromHost(sub) || "scope_excluded_domain";
              await insertAsset({
                asset_type: "subdomain",
                asset_value: sub,
                hostname: sub,
                root_domain: rootDomain,
                source: "certificate_transparency",
                confidence: "low",
                raw: {
                  _scope_excluded: true,
                  _scope_exclusion_reason: exclusionReason,
                  _scope_excluded_at: new Date().toISOString(),
                },
              });
              continue;
            }
            discoveredHostnames.add(sub);
            const [aRecords, aaaaRecords] = await Promise.all([
              resolveWithDnsOverHttps(sub, "A"),
              resolveWithDnsOverHttps(sub, "AAAA"),
            ]);
            const resolved = [...aRecords, ...aaaaRecords];
            if (resolved.length > 0) {
              resolvedSubdomains += 1;
            } else {
              unresolvedSubdomains += 1;
            }

            await insertAsset({
              asset_type: "subdomain",
              asset_value: sub,
              hostname: sub,
              root_domain: rootDomain,
              source: "certificate_transparency",
              confidence: resolved.length > 0 ? "high" : "low",
              raw: { resolved_ips: resolved.slice(0, 20) },
            });

            for (const ip of resolved.slice(0, 20)) {
              discoveredIps.add(ip);
              await insertAsset({
                asset_type: "ip",
                asset_value: ip,
                hostname: sub,
                root_domain: rootDomain,
                ip,
                source: "certificate_transparency_dns",
                confidence: "medium",
              });
            }
          }

          await insertObservation({
            module: "dns_dumpster_like",
            observation_type: "subdomain_discovery",
            title: "Certificate transparency subdomain discovery",
            value: {
              root_domain: rootDomain,
              subdomains_found: names.size,
              resolved_subdomains: resolvedSubdomains,
              unresolved_subdomains: unresolvedSubdomains,
              sample: [...names].slice(0, 50),
            },
          });
        }
      } catch {
        await insertObservation({
          module: "dns_dumpster_like",
          observation_type: "subdomain_discovery_error",
          title: "Subdomain discovery failed",
          value: { root_domain: rootDomain },
          severity: "low",
        });
      }
    }
  };

  const runShodanModule = async () => {
    const key = Deno.env.get("SHODAN_API_KEY");
    if (!key || discoveredIps.size === 0) {
      await insertExternalIntel("shodan", hostname || targetUrl, false, { configured: Boolean(key) }, {}, "low");
      return;
    }

    const shodanEligibleIps = [...discoveredIps].filter((ip) => isIpAllowedInScope(ip)).slice(0, 10);
    const shodanSkippedIps = [...discoveredIps].filter((ip) => !isIpAllowedInScope(ip));
    if (shodanEligibleIps.length === 0) {
      shodanStatus = "scope_filtered";
      await insertObservation({
        module: "shodan",
        observation_type: "scope_guard_skip",
        title: "Shodan skipped: no in-scope IPs",
        value: {
          total_discovered_ips: discoveredIps.size,
          skipped_out_of_scope_ips: shodanSkippedIps.slice(0, 50),
        },
        severity: "info",
      });
      await insertExternalIntel(
        "shodan",
        hostname || targetUrl,
        false,
        {
          configured: true,
          scope_filtered: true,
          skipped_out_of_scope_ips: shodanSkippedIps.slice(0, 50),
        },
        {},
        "low",
      );
      return;
    }

    let exactHostMatch = false;
    let hostDataFound = false;
    let unrelatedHostCount = 0;

    for (const ip of shodanEligibleIps) {
      try {
        const shodanUrl = `https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}&minify=true`;
        const res = await fetchWithTimeout(shodanUrl, {}, 12000);
        if (!res.ok) continue;
        const payload = await res.json();
        shodanHostPayloads.push({
          ip,
          payload: payload as Record<string, unknown>,
        });
        hostDataFound = true;
        const hostnames = Array.isArray(payload?.hostnames) ? payload.hostnames.map((h: any) => String(h)) : [];
        const ports = Array.isArray(payload?.ports) ? payload.ports : [];
        const cpes = Array.isArray(payload?.cpes) ? payload.cpes.map((c: any) => String(c)).filter(Boolean) : [];
        const vulns = Array.isArray(payload?.vulns)
          ? payload.vulns.map((v: any) => String(v))
          : payload?.vulns && typeof payload.vulns === "object"
            ? Object.keys(payload.vulns)
            : [];
        const tags = Array.isArray(payload?.tags) ? payload.tags : [];
        for (const tag of tags.slice(0, 30)) {
          const normalizedTag = String(tag || "").trim();
          if (!normalizedTag) continue;
          addTechFingerprint(normalizedTag, {
            categories: ["service", "osint"],
            confidence: 65,
            source: "shodan_tag",
          });
        }

        for (const h of hostnames) discoveredHostnames.add(String(h).toLowerCase());

        const hostMatchForIp = hostname
          ? hostnames.some((h: string) => {
            const current = h.toLowerCase();
            const targetHost = hostname.toLowerCase();
            if (current === targetHost) return true;
            if (rootDomain && (current === rootDomain.toLowerCase() || current === `www.${rootDomain.toLowerCase()}`)) return true;
            if (rootDomain && current.endsWith(`.${rootDomain.toLowerCase()}`)) return true;
            return false;
          })
          : true;

        if (hostMatchForIp) {
          exactHostMatch = true;
        }

        const unrelatedOnThisIp = hostname
          ? hostnames.filter((h: string) => !h.toLowerCase().endsWith((rootDomain || "").toLowerCase())).length
          : 0;

        if (hostname) {
          unrelatedHostCount += unrelatedOnThisIp;
        }

        const attributionFactor = computeShodanAttributionFactor({
          hostMatch: hostMatchForIp,
          rootDomain,
          hostnames,
          unrelatedHostnames: unrelatedOnThisIp,
          hostingContext,
        });

        await insertExternalIntel(
          "shodan",
          ip,
          true,
          {
            ports_count: ports.length,
            vulns_count: vulns.length,
            hostnames_count: hostnames.length,
            confidence_factor: attributionFactor.score,
            confidence_reasons: attributionFactor.reasons,
            allow_domain_attribution: attributionFactor.allowDomainAttribution,
            allow_ip_attribution: attributionFactor.allowIpAttribution,
          },
          payload,
          attributionFactor.confidence,
        );

        if (vulns.length > 0) {
          const canAttributeDomain = attributionFactor.allowDomainAttribution;
          const canAttributeIp = attributionFactor.allowIpAttribution;
          if (canAttributeDomain || canAttributeIp) {
            for (const cve of vulns.slice(0, 30)) {
              if (canAttributeDomain) {
                await insertFinding({
                  provider: "shodan",
                  module: "shodan",
                  finding_type: "shodan_cve_signal_domain",
                  severity: "medium",
                  title: `Shodan reports ${cve} (domain scope)`,
                  description: "Segnale CVE su dominio/subdominio con confidenza sufficiente e rischio shared non rilevato",
                  affected_asset: hostname || rootDomain || ip,
                  ip,
                  cve: [cve],
                  cwe: ["CWE-1104"],
                  evidence: {
                    ip,
                    hostnames: hostnames.slice(0, 50),
                    ports: ports.slice(0, 50),
                    tags: tags.slice(0, 30),
                    confidence_factor: attributionFactor.score,
                    confidence_reasons: attributionFactor.reasons,
                    shared_risk: attributionFactor.sharedRisk,
                    attribution_target: "domain",
                  },
                  attribution_confidence: attributionFactor.confidence,
                  remediation:
                    "Confermare versione servizio e validare vulnerabilità con scanner API autorizzato (Pentest-Tools).",
                });
              }

              if (canAttributeIp) {
                await insertFinding({
                  provider: "shodan",
                  module: "shodan",
                  finding_type: "shodan_cve_signal_ip",
                  severity: "medium",
                  title: `Shodan reports ${cve} (ip scope)`,
                  description: "Segnale CVE attribuito all'IP con confidenza elevata e senza indicatori di shared hosting",
                  affected_asset: ip,
                  ip,
                  cve: [cve],
                  cwe: ["CWE-1104"],
                  evidence: {
                    ip,
                    hostnames: hostnames.slice(0, 50),
                    ports: ports.slice(0, 50),
                    tags: tags.slice(0, 30),
                    confidence_factor: attributionFactor.score,
                    confidence_reasons: attributionFactor.reasons,
                    shared_risk: attributionFactor.sharedRisk,
                    attribution_target: "ip",
                  },
                  attribution_confidence: attributionFactor.confidence,
                  remediation:
                    "Validare con scansione attiva autorizzata sul target IP e verificare ownership prima di remediation.",
                });
              }
            }
          } else {
            for (const cve of vulns.slice(0, 20)) {
              await insertFinding({
                provider: "shodan",
                module: "shodan",
                finding_type: "shodan_cve_signal_unattributed",
                severity: "low",
                title: `Shodan signal ${cve} (non attribuito)`,
                description: "Segnale CVE su IP condiviso o host non attribuibile con confidenza alta",
                affected_asset: ip,
                ip,
                cve: [cve],
                cwe: ["CWE-200"],
                evidence: {
                  ip,
                  hostnames: hostnames.slice(0, 50),
                  host_match: hostMatchForIp,
                  unrelated_hostnames: unrelatedOnThisIp,
                  tags: tags.slice(0, 20),
                  confidence_factor: attributionFactor.score,
                  confidence_reasons: attributionFactor.reasons,
                  shared_risk: attributionFactor.sharedRisk,
                },
                attribution_confidence: "low",
                remediation:
                  "Trattare come segnale OSINT: confermare ownership e validare con scansione attiva autorizzata.",
              });
            }
            await insertObservation({
              module: "shodan",
              observation_type: "vuln_signal_unattributed",
              title: "Shodan vulnerability signal without strong attribution",
              value: {
                ip,
                vulns: vulns.slice(0, 50),
                host_match: hostMatchForIp,
                unrelated_hostnames: unrelatedOnThisIp,
                confidence_factor: attributionFactor.score,
                confidence_reasons: attributionFactor.reasons,
                shared_risk: attributionFactor.sharedRisk,
              },
              severity: "info",
            });
          }
        }

        for (const port of ports.slice(0, 50)) {
          const portNumber = Number(port);
          await insertAsset({
            asset_type: "open_port",
            asset_value: `${ip}:${port}`,
            hostname,
            root_domain: rootDomain,
            ip,
            source: "shodan",
            confidence: "medium",
            raw: {
              port: portNumber,
              protocol: "tcp",
            },
          });

          await insertFinding({
            provider: "shodan",
            module: "shodan",
            finding_type: "open_port_exposed",
            severity: severityForExposedPort(portNumber),
            title: `Porta ${port} esposta pubblicamente`,
            description:
              "Host raggiungibile su porta aperta da Internet (dato OSINT passivo). Verificare esposizione e controlli di accesso.",
            affected_asset: hostname || ip,
            ip,
            port: portNumber,
            protocol: "tcp",
            cwe: ["CWE-284"],
            evidence: {
              ip,
              port: portNumber,
              source: "shodan",
              hostnames: hostnames.slice(0, 10),
            },
            remediation: remediationForExposedPort(portNumber),
          });
        }

        for (const cpe of cpes.slice(0, 20)) {
          await insertFinding({
            provider: "shodan",
            module: "shodan",
            finding_type: "service_fingerprint_exposed",
            severity: "low",
            title: "Fingerprint servizio/versione esposto",
            description:
              "Sono stati rilevati fingerprint CPE pubblici che possono facilitare identificazione tecnologica e targeting.",
            affected_asset: hostname || ip,
            ip,
            cwe: ["CWE-200"],
            evidence: {
              ip,
              cpe,
              source: "shodan",
            },
            remediation:
              "Ridurre leakage di banner/versioni, harden del servizio e verificare patching continuo delle componenti esposte.",
          });
        }
      } catch {
        // ignore single host errors
      }
    }

    if (!hostDataFound) {
      shodanStatus = "not_found";
    } else if (exactHostMatch) {
      shodanStatus = "found_exact";
    } else if (unrelatedHostCount > 5) {
      shodanStatus = "stale_or_low_confidence";
    } else {
      shodanStatus = "found_ip_only";
    }

    if (unrelatedHostCount > 5) {
      hostingContext = "shared_hosting";
      await insertObservation({
        module: "shared_hosting_detector",
        observation_type: "hosting_context",
        title: "Shared hosting likely",
        value: { unrelated_hostnames_detected: unrelatedHostCount },
        severity: "info",
      });
    }
  };

  const runUrlscanModule = async () => {
    const apiKey = Deno.env.get("URLSCAN_API_KEY");
    if (!apiKey || !hostname) {
      await insertExternalIntel("urlscan", hostname || targetUrl, false, { configured: Boolean(apiKey) }, {}, "low");
      return;
    }

    // Lightweight lookup by domain, no forced submission in v1.
    const searchUrl = `https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(hostname)}&size=1`;
    const res = await fetchWithTimeout(searchUrl, { headers: { "API-Key": apiKey } }, 12000);
    if (!res.ok) {
      await insertExternalIntel("urlscan", hostname, false, { status: res.status }, {}, "low");
      return;
    }
    const payload = await res.json();
    const result = Array.isArray(payload?.results) ? payload.results[0] : null;
    await insertExternalIntel("urlscan", hostname, Boolean(result), { has_result: Boolean(result) }, payload, "medium");
    if (result?.verdicts?.overall?.malicious) {
      await insertFinding({
        provider: "urlscan",
        module: "urlscan",
        finding_type: "urlscan_malicious_verdict",
        severity: "high",
        title: "urlscan malicious verdict",
        description: "urlscan segnala il target come potenzialmente malevolo",
        affected_asset: hostname,
        evidence: { result },
      });
    }
  };

  const runPentestToolsModule = async () => {
    const isCveValidationProfile = job.scan_profile === "cve_api_validation";
    const isIpExposureProfile = job.scan_profile === "ip_exposure";
    if (!isCveValidationProfile && job.scan_profile !== "domain_exposure" && !isIpExposureProfile) return;
    const apiKey = Deno.env.get("PENTESTTOOLS_API_KEY") || Deno.env.get("PENTEST_TOOLS_API_KEY");
    const apiBaseUrl = Deno.env.get("PENTESTTOOLS_API_BASE_URL") || "https://app.pentest-tools.com/api/v2";
    const pollIntervalMs = Math.max(1500, Number(Deno.env.get("PENTESTTOOLS_POLL_INTERVAL_MS") || 6000));
    const maxPolls = Math.max(1, Number(Deno.env.get("PENTESTTOOLS_MAX_POLLS") || 8));
    const outputPollEvery = Math.max(1, Number(Deno.env.get("PENTESTTOOLS_OUTPUT_EVERY_POLLS") || 2));
    const maxScanTimeMinutes = Math.min(1440, Math.max(1, Number(Deno.env.get("PENTESTTOOLS_MAX_SCAN_MINUTES") || 30)));
    const maxDomainPortScanIps = Math.max(
      1,
      Math.min(100, Number(Deno.env.get("PENTESTTOOLS_DOMAIN_PORT_SCAN_MAX_IPS") || 30)),
    );
    const maxScopeHostPortScans = Math.max(
      0,
      Math.min(80, Number(Deno.env.get("PENTESTTOOLS_SCOPE_HOST_PORT_SCAN_MAX_HOSTS") || 25)),
    );
    const maxScopeIpPortScans = Math.max(
      1,
      Math.min(120, Number(Deno.env.get("PENTESTTOOLS_SCOPE_IP_PORT_SCAN_MAX_IPS") || 40)),
    );
    const maxScopeHostDnsResolutions = Math.max(
      0,
      Math.min(80, Number(Deno.env.get("PENTESTTOOLS_SCOPE_HOST_DNS_RESOLVE_MAX") || 30)),
    );
    const enableHostPortScans = String(
      Deno.env.get("PENTESTTOOLS_ENABLE_HOST_PORT_SCANS") || "true",
    ).toLowerCase() !== "false";
    const portScanType = String(Deno.env.get("PENTESTTOOLS_PORT_SCAN_TYPE") || "light").trim().toLowerCase() || "light";
    const portScanProtocol = String(Deno.env.get("PENTESTTOOLS_PORT_SCAN_PROTOCOL") || "tcp").trim().toLowerCase() || "tcp";
    const enableNetworkScanner = String(
      Deno.env.get("PENTESTTOOLS_ENABLE_NETWORK_SCANNER") || "false",
    ).toLowerCase() === "true";

    if (!apiKey) {
      await insertObservation({
        module: "pentest_tools",
        observation_type: "not_configured",
        title: "Pentest-Tools API key not configured",
        value: { configured: false },
        severity: "info",
      });
      return;
    }

    const terminalStatuses = new Set([
      "finished",
      "failed to start",
      "stopped",
      "timed out",
      "aborted",
      "vpn connection error",
      "auth failed",
      "connection error",
    ]);

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const riskToSeverity = (riskLevel: number | null | undefined) => {
      if (riskLevel === 4) return "critical";
      if (riskLevel === 3) return "high";
      if (riskLevel === 2) return "medium";
      if (riskLevel === 1) return "low";
      return "info";
    };

    const parseCwe = (value: unknown): string[] | null => {
      if (!value) return null;
      if (Array.isArray(value)) {
        const normalized = value
          .map((entry) => String(entry || "").trim())
          .filter(Boolean);
        return normalized.length > 0 ? normalized : null;
      }
      const stringValue = String(value).trim();
      if (!stringValue) return null;
      const extracted = stringValue
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter((entry) => /^CWE[-_ ]?\d+$/i.test(entry));
      if (extracted.length > 0) {
        return extracted.map((entry) => entry.toUpperCase().replace(/_/g, "-").replace(/\s+/g, "-"));
      }
      return [stringValue];
    };

    const CVE_RX = /CVE-\d{4}-\d{4,7}/gi;
    const extractCvesFromText = (value: unknown): string[] => {
      const text = String(value || "");
      return (text.match(CVE_RX) || []).map((entry) => entry.toUpperCase());
    };

    const parseCveList = (finding: Record<string, unknown>): string[] => {
      const fromArray = (value: unknown): string[] => {
        if (!Array.isArray(value)) return [];
        return value
          .map((entry) => String(entry || "").trim().toUpperCase())
          .filter((entry) => /^CVE-\d{4}-\d{4,7}$/i.test(entry));
      };
      const fromString = (value: unknown): string[] => {
        if (typeof value !== "string") return [];
        return extractCvesFromText(value);
      };

      const candidates = [
        ...fromArray(finding.cve),
        ...fromArray(finding.cves),
        ...fromArray(finding.cve_ids),
        ...fromString(finding.cve),
        ...fromString(finding.cves),
        ...fromString(finding.cve_ids),
        ...extractCvesFromText(finding.vuln_id),
        ...extractCvesFromText(finding.name),
        ...extractCvesFromText(finding.vuln_description),
      ];
      return [...new Set(candidates)];
    };

    const parseCvssScore = (finding: Record<string, unknown>): number | null => {
      const rawValues = [
        finding.cvssv3,
        finding.vuln_cvssv3,
        finding.cvss,
      ];
      for (const raw of rawValues) {
        if (typeof raw === "number" && Number.isFinite(raw)) {
          return Number(raw);
        }
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
      return null;
    };

    const parseRiskLevel = (finding: Record<string, unknown>): number | null => {
      const raw = finding.risk_level;
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
      return null;
    };

    const parseJsonSafe = (value: string): unknown | null => {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    };

    const isPublicIpv4 = (value: string): boolean => {
      const candidate = value.trim();
      if (!/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(candidate)) {
        return false;
      }
      const [a, b] = candidate.split(".").map((entry) => Number(entry));
      if (a === 10 || a === 127 || a === 0) return false;
      if (a === 192 && b === 168) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 169 && b === 254) return false;
      if (a === 100 && b >= 64 && b <= 127) return false;
      if (a === 198 && (b === 18 || b === 19)) return false;
      if (a >= 224) return false;
      if (candidate === "169.254.169.254") return false;
      return true;
    };

    const isPublicIpv6 = (value: string): boolean => {
      const candidate = value.trim().toLowerCase();
      if (!candidate.includes(":")) return false;
      if (candidate === "::1") return false;
      if (candidate.startsWith("fc") || candidate.startsWith("fd")) return false;
      if (candidate.startsWith("fe80:")) return false;
      return true;
    };

    const isPublicIpCandidate = (value: string): boolean => isPublicIpv4(value) || isPublicIpv6(value);

    const normalizeHostTarget = (value: string): string => {
      const trimmed = String(value || "").trim().toLowerCase();
      if (!trimmed) return "";
      try {
        if (/^https?:\/\//i.test(trimmed)) {
          return new URL(trimmed).hostname.toLowerCase();
        }
      } catch {
        // fallback below
      }
      return trimmed.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/\.$/, "");
    };

    const isTerminalStatus = (status: string | null | undefined) =>
      status ? terminalStatuses.has(status.toLowerCase()) : false;

    const requestPentest = async (
      path: string,
      init: RequestInit = {},
      timeoutMs = 25000,
      retryCount = 0,
    ): Promise<any> => {
      const url = `${apiBaseUrl}${path}`;
      const headers = new Headers(init.headers || {});
      headers.set("Authorization", `Bearer ${apiKey}`);
      headers.set("Accept", "application/json");
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const res = await fetchWithTimeout(url, { ...init, headers }, timeoutMs);
      if (res.status === 429 && retryCount < 2) {
        const retryAfterHeader = Number(res.headers.get("Retry-After") || "2");
        const waitMs = Number.isFinite(retryAfterHeader) ? retryAfterHeader * 1000 : 2000;
        await sleep(Math.max(waitMs, 1500));
        return requestPentest(path, init, timeoutMs, retryCount + 1);
      }

      const responseText = await res.text();
      const parsed = responseText ? parseJsonSafe(responseText) : null;
      const payload =
        parsed && typeof parsed === "object"
          ? parsed
          : responseText
            ? { raw: responseText }
            : {};

      if (!res.ok) {
        const apiMessage =
          typeof payload === "object" && payload
            ? String((payload as Record<string, unknown>)?.message || (payload as Record<string, unknown>)?.error || "").trim()
            : "";
        const error = new Error(apiMessage || `Pentest-Tools API error (${res.status})`) as Error & {
          status?: number;
          payload?: unknown;
        };
        error.status = res.status;
        error.payload = payload;
        throw error;
      }

      return payload;
    };

    const normalizePentestFindings = async (
      scanId: number,
      toolId: number,
      targetName: string,
      findings: Array<Record<string, unknown>>,
    ) => {
      for (const rawFinding of findings) {
        const finding = rawFinding || {};
        const cveList = parseCveList(finding);
        const cvssScore = parseCvssScore(finding);
        const riskLevel = parseRiskLevel(finding);
        const findingStatus = String(finding.status || "open").toLowerCase();

        await insertFinding({
          provider: "pentest_tools",
          module: `pentest_tool_${toolId}`,
          finding_type: String(finding.vuln_id || finding.name || "pentest_tools_finding"),
          title: String(finding.name || finding.vuln_description || "Pentest-Tools finding"),
          description: String(
            finding.vuln_description || finding.risk_description || "Finding generated by Pentest-Tools",
          ),
          severity: riskToSeverity(riskLevel),
          affected_asset: hostname || targetName,
          affected_url: parsedTarget.target_type === "url" ? targetName : targetUrl,
          ip:
            parsedTarget.target_type === "ipv4" || parsedTarget.target_type === "ipv6"
              ? parsedTarget.hostname
              : null,
          port: typeof finding.port === "number" ? finding.port : null,
          protocol: finding.protocol ? String(finding.protocol).toLowerCase() : null,
          cve: cveList.length > 0 ? cveList : null,
          cwe: parseCwe(finding.cwe),
          cvss: cvssScore,
          epss: typeof finding.epss_score === "number" ? Number(finding.epss_score) : null,
          cisa_kev: Boolean(finding.in_cisa_catalog),
          remediation: finding.recommendation ? String(finding.recommendation) : null,
          evidence: {
            scan_id: scanId,
            tool_id: toolId,
            vuln_id: finding.vuln_id || null,
            confirmed: finding.confirmed || null,
            verified: finding.verified || null,
            risk_level: finding.risk_level || null,
            vulnerability_evidence: finding.vuln_evidence || null,
            references: finding.references || null,
          },
          attribution_confidence: finding.confirmed ? "high" : "medium",
          status:
            findingStatus === "false_positive" ||
              findingStatus === "ignored" ||
              findingStatus === "fixed" ||
              findingStatus === "accepted"
              ? findingStatus
              : "open",
        });
      }
    };

    interface PlannedPentestScan {
      label: string;
      toolId: number;
      targetName: string;
      toolParams?: Record<string, unknown>;
    }

    interface StartedPentestScan {
      scanId: number;
      toolId: number;
      label: string;
      targetName: string;
      status: string;
      progress: number | null;
      statusMessage: string | null;
      outputFingerprint: string | null;
      outputCollected: boolean;
    }

    const normalizeOutputFingerprint = (outputType: string, outputData: Record<string, unknown>): string => {
      const findingsCount = Array.isArray(outputData?.findings) ? outputData.findings.length : 0;
      const subdomainsCount = Array.isArray(outputData?.subdomains) ? outputData.subdomains.length : 0;
      const domainsCount = Array.isArray(outputData?.domains) ? outputData.domains.length : 0;
      const portsCount = Array.isArray(outputData?.ports) ? outputData.ports.length : 0;
      return [outputType, findingsCount, subdomainsCount, domainsCount, portsCount].join("|");
    };

    const normalizePentestOutput = async (
      scan: StartedPentestScan,
      options: { allowPendingScanOutputErrors: boolean },
    ): Promise<boolean> => {
      let outputResponse: any;
      try {
        outputResponse = await requestPentest(`/scans/${scan.scanId}/output`, { method: "GET" });
      } catch (error: any) {
        const statusCode = Number(error?.status || 0);
        if (
          options.allowPendingScanOutputErrors &&
          (statusCode === 404 || statusCode === 409 || String(error?.message || "").toLowerCase().includes("not finished"))
        ) {
          return false;
        }
        throw error;
      }

      const output = outputResponse?.data || {};
      const outputType = String(output?.output_type || "").trim();
      const outputData = (output?.output_data || {}) as Record<string, unknown>;
      if (!outputType) return false;

      const fingerprint = normalizeOutputFingerprint(outputType, outputData);
      if (scan.outputFingerprint === fingerprint) {
        return false;
      }
      scan.outputFingerprint = fingerprint;

      await insertExternalIntel(
        "pentest_tools_output",
        scan.targetName,
        true,
        {
          scan_id: scan.scanId,
          tool_id: scan.toolId,
          output_type: outputType,
          status: scan.status,
        },
        output,
        "high",
      );

      if (outputType === "finding_list") {
        const findings = Array.isArray(outputData?.findings) ? outputData.findings : [];
        if (findings.length > 0) {
          await normalizePentestFindings(scan.scanId, scan.toolId, scan.targetName, findings);
          scan.outputCollected = true;
        }
        return true;
      }

      if (outputType === "subdomain_list") {
        const subdomains = Array.isArray(outputData?.subdomains) ? outputData.subdomains : [];
        for (const entry of subdomains.slice(0, 500)) {
          const host = String((entry as Record<string, unknown>)?.hostname || "").trim().toLowerCase();
          const ip = String((entry as Record<string, unknown>)?.ip_address || "").trim();
          if (host) {
            const classifiedHost = classifyHostAgainstScope(host);
            await insertAsset({
              asset_type: "subdomain",
              asset_value: host,
              hostname: host,
              root_domain: rootDomain,
              source: "pentest_tools_subdomain_finder",
              confidence:
                classifiedHost.blocked || (entry as Record<string, unknown>)?.resolved === false
                  ? "low"
                  : "medium",
              raw: {
                ...((entry as Record<string, unknown>) || {}),
                ...(classifiedHost.blocked
                  ? {
                    _scope_excluded: true,
                    _scope_exclusion_reason: classifiedHost.reason || "scope_excluded_domain",
                    _scope_excluded_at: new Date().toISOString(),
                  }
                  : {}),
              },
            });
            if (!classifiedHost.blocked) {
              discoveredHostnames.add(host);
            }
          }
          if (ip) {
            discoveredIps.add(ip);
            await insertAsset({
              asset_type: "ip",
              asset_value: ip,
              hostname: host || hostname,
              root_domain: rootDomain,
              ip,
              source: "pentest_tools_subdomain_finder",
              confidence: "medium",
              raw: (entry as Record<string, unknown>) || {},
            });
          }
        }
        scan.outputCollected = true;
        return true;
      }

      if (outputType === "domain_list") {
        const domains = Array.isArray(outputData?.domains) ? outputData.domains : [];
        for (const entry of domains.slice(0, 500)) {
          const domainCandidate = String(
            (entry as Record<string, unknown>)?.domain ||
              (entry as Record<string, unknown>)?.hostname ||
              "",
          )
            .trim()
            .toLowerCase();
          if (!domainCandidate) continue;
          const classifiedDomain = classifyHostAgainstScope(domainCandidate);
          await insertAsset({
            asset_type: "domain",
            asset_value: domainCandidate,
            hostname: domainCandidate,
            root_domain: rootDomain,
            source: "pentest_tools_domain_finder",
            confidence: classifiedDomain.blocked ? "low" : "medium",
            raw: {
              ...((entry as Record<string, unknown>) || {}),
              ...(classifiedDomain.blocked
                ? {
                  _scope_excluded: true,
                  _scope_exclusion_reason: classifiedDomain.reason || "scope_excluded_domain",
                  _scope_excluded_at: new Date().toISOString(),
                }
                : {}),
            },
          });
          if (!classifiedDomain.blocked) {
            discoveredHostnames.add(domainCandidate);
          }
        }
        scan.outputCollected = true;
        return true;
      }

      if (outputType === "port_scanner") {
        const scanTargetNormalized = normalizeHostTarget(scan.targetName);
        const scanTargetIsIp = isPublicIpCandidate(scanTargetNormalized);
        const associatedHostCandidate = scanTargetIsIp ? (hostname || "") : scanTargetNormalized;
        const associatedHost = associatedHostCandidate ? normalizeHostTarget(associatedHostCandidate) : "";
        const ipAddress = String(
          outputData?.ip_address ||
          (scanTargetIsIp ? scanTargetNormalized : "") ||
          parsedTarget.hostname ||
          "",
        ).trim();
        const hostnames = Array.isArray(outputData?.hostnames) ? outputData.hostnames : [];
        for (const reverseHost of hostnames.slice(0, 200)) {
          const reverseHostValue = String(reverseHost || "").trim().toLowerCase();
          if (!reverseHostValue) continue;
          const classifiedReverseHost = classifyHostAgainstScope(reverseHostValue);
          await insertAsset({
            asset_type: "reverse_dns_hostname",
            asset_value: reverseHostValue,
            hostname: reverseHostValue,
            root_domain: rootDomain,
            source: "pentest_tools_port_scanner",
            confidence: "low",
            raw: {
              ip: ipAddress || null,
              ...(classifiedReverseHost.blocked
                ? {
                  _scope_excluded: true,
                  _scope_exclusion_reason: classifiedReverseHost.reason || "scope_excluded_domain",
                  _scope_excluded_at: new Date().toISOString(),
                }
                : {}),
            },
          });
          if (!classifiedReverseHost.blocked) {
            discoveredHostnames.add(reverseHostValue);
          }
        }

        const ports = Array.isArray(outputData?.ports) ? outputData.ports : [];
        for (const portEntry of ports.slice(0, 500)) {
          const portData = portEntry as Record<string, unknown>;
          const port = typeof portData?.number === "number" ? portData.number : null;
          const state = String(portData?.state || "").toLowerCase();
          if (!port || state !== "open") continue;
          const protocol = String(portData?.protocol || "tcp").toLowerCase();
          const serviceName = String(portData?.service || portData?.service_name || "").trim();
          const serviceVersion = String(portData?.version || portData?.service_version || "").trim();
          await insertAsset({
            asset_type: "open_port",
            asset_value: `${ipAddress}:${port}`,
            hostname: associatedHost || hostname,
            root_domain: rootDomain,
            ip: ipAddress || null,
            source: "pentest_tools_port_scanner",
            confidence: "medium",
            raw: portData,
          });

          await insertFinding({
            provider: "pentest_tools",
            module: "pentest_tools_port_scanner",
            finding_type: "open_port_exposed",
            severity: severityForExposedPort(port),
            title: `Porta ${port}/${protocol} esposta`,
            description: serviceName
              ? `Servizio rilevato: ${serviceName}${serviceVersion ? ` ${serviceVersion}` : ""}.`
              : "Porta aperta raggiungibile da rete pubblica.",
            affected_asset: associatedHost || hostname || ipAddress || parsedTarget.hostname || null,
            ip: ipAddress || null,
            port,
            protocol,
            cwe: ["CWE-284"],
            evidence: {
              source: "pentest_tools_port_scanner",
              service: serviceName || null,
              version: serviceVersion || null,
              raw: portData,
            },
            remediation: remediationForExposedPort(port),
          });

          if (serviceName || serviceVersion) {
            await insertFinding({
              provider: "pentest_tools",
              module: "pentest_tools_port_scanner",
              finding_type: "service_fingerprint_exposed",
              severity: "low",
              title: "Fingerprint servizio esposto",
              description:
                "Informazioni di servizio/versione rilevate pubblicamente possono facilitare attività di ricognizione ostile.",
              affected_asset: associatedHost || hostname || ipAddress || parsedTarget.hostname || null,
              ip: ipAddress || null,
              port,
              protocol,
              cwe: ["CWE-200"],
              evidence: {
                service: serviceName || null,
                version: serviceVersion || null,
              },
              remediation:
                "Ridurre esposizione di banner/versione e mantenere il servizio costantemente aggiornato.",
            });
          }
        }
        scan.outputCollected = true;
        return true;
      }

      if (
        outputType === "website_recon" ||
        outputType === "tech_stack" ||
        outputType.includes("technolog")
      ) {
        const extractedTech: Array<{ name: string; version?: string; category?: string }> = [];
        const collectTech = (node: unknown) => {
          if (!node || typeof node !== "object") return;
          if (Array.isArray(node)) {
            for (const item of node) collectTech(item);
            return;
          }
          const record = node as Record<string, unknown>;
          const name = String(record?.name || record?.technology || record?.product || "").trim();
          const version = String(record?.version || "").trim();
          const category = String(record?.category || record?.group || "").trim();
          if (name) {
            extractedTech.push({
              name,
              version: version || undefined,
              category: category || undefined,
            });
          }
          for (const child of Object.values(record)) {
            if (typeof child === "object") collectTech(child);
          }
        };
        collectTech(outputData);
        for (const tech of extractedTech.slice(0, 200)) {
          addTechFingerprint(tech.name, {
            categories: tech.category ? [tech.category] : ["application"],
            version: tech.version,
            confidence: 75,
            source: "pentest_tools_website_recon",
          });
        }
        await insertObservation({
          module: "tech_stack",
          observation_type: "pentest_website_recon",
          title: "Pentest-Tools technology fingerprint",
          value: {
            output_type: outputType,
            technologies: extractedTech.slice(0, 200),
            count: extractedTech.length,
          },
          severity: "info",
        });
        scan.outputCollected = true;
        return true;
      }

      if (outputType.includes("ssl") || outputType.includes("tls")) {
        await insertObservation({
          module: "ssl_certificate",
          observation_type: "pentest_ssl_output",
          title: "Pentest-Tools SSL/TLS output",
          value: {
            output_type: outputType,
            output_data: outputData,
            source_scan_id: scan.scanId,
          },
          severity: "info",
        });
        await insertObservation({
          module: "tls_summary",
          observation_type: "pentest_tls_output",
          title: "Pentest-Tools TLS summary output",
          value: {
            output_type: outputType,
            output_data: outputData,
            source_scan_id: scan.scanId,
          },
          severity: "info",
        });
        scan.outputCollected = true;
        return true;
      }

      if (outputType === "waf_results") {
        await insertObservation({
          module: "pentest_tools",
          observation_type: "waf_results",
          title: "Pentest-Tools WAF detector output",
          value: outputData,
          severity: "info",
        });
        scan.outputCollected = true;
        return true;
      }

      await insertObservation({
        module: "pentest_tools",
        observation_type: "scan_output",
        title: `Pentest-Tools output (${scan.label})`,
        value: {
          scan_id: scan.scanId,
          tool_id: scan.toolId,
          output_type: outputType,
          output_data: outputData,
        },
        severity: "info",
      });
      scan.outputCollected = true;
      return true;
    };

    const plannedScans: PlannedPentestScan[] = [];
    const plannedScanKeys = new Set<string>();
    const addPlannedScan = (scan: PlannedPentestScan): boolean => {
      const targetNameRaw = String(scan.targetName || "").trim();
      if (!targetNameRaw) return false;
      const key = `${scan.toolId}|${targetNameRaw.toLowerCase()}`;
      if (plannedScanKeys.has(key)) return false;
      plannedScanKeys.add(key);
      plannedScans.push({
        ...scan,
        targetName: targetNameRaw,
      });
      return true;
    };

    const scopedHostCandidates = [...new Set([
      normalizeHostTarget(hostname || ""),
      normalizeHostTarget(rootDomain || ""),
      ...scopeDomains.map((entry) => normalizeHostTarget(entry)),
      ...[...discoveredHostnames].map((entry) => normalizeHostTarget(entry)),
    ])]
      .filter(Boolean)
      .filter((entry) => !isPublicIpCandidate(entry))
      .filter((entry) => {
        const classified = classifyHostAgainstScope(entry);
        return !classified.blocked;
      });

    const resolvedScopedIps = new Set<string>(
      [...discoveredIps]
        .map((entry) => String(entry || "").trim().toLowerCase())
        .filter((entry) => entry.length > 0 && isPublicIpCandidate(entry) && isIpAllowedInScope(entry)),
    );
    for (const scopeHost of scopedHostCandidates.slice(0, maxScopeHostDnsResolutions)) {
      try {
        const [aRecords, aaaaRecords] = await Promise.all([
          resolveWithDnsOverHttps(scopeHost, "A"),
          resolveWithDnsOverHttps(scopeHost, "AAAA"),
        ]);
        for (const ipCandidateRaw of [...aRecords, ...aaaaRecords]) {
          const ipCandidate = String(ipCandidateRaw || "").trim().toLowerCase();
          if (!ipCandidate || !isPublicIpCandidate(ipCandidate) || !isIpAllowedInScope(ipCandidate)) continue;
          resolvedScopedIps.add(ipCandidate);
        }
      } catch {
        // Best effort: keep pentest planning resilient even if DNS resolution fails for some hosts.
      }
    }

    const scopedHostPortTargets = scopedHostCandidates.slice(0, maxScopeHostPortScans);
    const domainCandidateIps = [...resolvedScopedIps].slice(
      0,
      Math.max(maxDomainPortScanIps, maxScopeIpPortScans),
    );
    const skippedHostTargets = Math.max(0, scopedHostCandidates.length - scopedHostPortTargets.length);
    const skippedIpTargets = Math.max(0, resolvedScopedIps.size - domainCandidateIps.length);
    const isDomainLikeTarget =
      parsedTarget.target_type === "domain" ||
      parsedTarget.target_type === "subdomain" ||
      parsedTarget.target_type === "url";
    const isIpTarget = parsedTarget.target_type === "ipv4" || parsedTarget.target_type === "ipv6";

    if (isDomainLikeTarget) {
      if (!isIpExposureProfile) {
        addPlannedScan(
          {
            label: "website_recon",
            toolId: 310,
            targetName: targetUrl,
          },
        );
        addPlannedScan(
          {
            label: "ssl_scanner",
            toolId: 450,
            targetName: hostname || targetUrl,
            toolParams: { preset: "light" },
          },
        );
      }

      if (isCveValidationProfile) {
        addPlannedScan({
          label: "website_scanner",
          toolId: 170,
          targetName: targetUrl,
          toolParams: { scan_type: "light" },
        });
      }

      if (enableHostPortScans) {
        for (const scopedHost of scopedHostPortTargets) {
          addPlannedScan({
            label: `port_scanner_host_${scopedHost}`,
            toolId: 70,
            targetName: scopedHost,
            toolParams: {
              scan_type: portScanType,
              protocol: portScanProtocol,
              check_alive: true,
            },
          });
        }
      }

      if (hostingContext === "shared_hosting" || hostingContext === "cdn_proxy") {
        await insertObservation({
          module: "pentest_tools",
          observation_type: "domain_ip_scan_skipped_hosting_context",
          title: "Pentest-Tools domain IP scan skipped due to hosting context",
          value: {
            target: hostname || targetUrl,
            hosting_context: hostingContext,
          },
          severity: "info",
        });
      } else {
        if (domainCandidateIps.length === 0) {
          await insertObservation({
            module: "pentest_tools",
            observation_type: "domain_ip_scan_no_public_ip",
            title: "No public resolved IP available for domain port scan",
            value: {
              target: hostname || targetUrl,
              resolved_ips_seen: [...discoveredIps].slice(0, 50),
              out_of_scope_ips: [...discoveredIps]
                .map((entry) => String(entry || "").trim().toLowerCase())
                .filter((entry) => entry.length > 0 && isPublicIpCandidate(entry) && !isIpAllowedInScope(entry))
                .slice(0, 50),
              max_domain_port_scan_ips: Math.max(maxDomainPortScanIps, maxScopeIpPortScans),
            },
            severity: "low",
          });
        } else {
          for (const domainIp of domainCandidateIps) {
            addPlannedScan({
              label: `port_scanner_${domainIp}`,
              toolId: 70,
              targetName: domainIp,
              toolParams: {
                scan_type: portScanType,
                protocol: portScanProtocol,
                check_alive: true,
              },
            });
          }
        }
      }
    }

    if (isIpTarget) {
      if (!isIpAllowedInScope(parsedTarget.hostname || "")) {
        await insertObservation({
          module: "pentest_tools",
          observation_type: "ip_scan_skipped_out_of_scope",
          title: "Pentest-Tools IP scan skipped: out of monitored IP scope",
          value: {
            target: parsedTarget.hostname,
            reason: "scope_excluded_ip",
          },
          severity: "info",
        });
      } else if (hostingContext === "shared_hosting" || hostingContext === "cdn_proxy") {
        await insertObservation({
          module: "pentest_tools",
          observation_type: "ip_scan_skipped_shared_hosting",
          title: "Pentest-Tools IP scan skipped due to hosting context",
          value: {
            target: parsedTarget.hostname,
            hosting_context: hostingContext,
          },
          severity: "info",
        });
      } else {
        addPlannedScan({
          label: "port_scanner",
          toolId: 70,
          targetName: parsedTarget.hostname || targetUrl,
          toolParams: {
            scan_type: portScanType,
            protocol: portScanProtocol,
            check_alive: true,
          },
        });

        if (enableNetworkScanner && isCveValidationProfile) {
          addPlannedScan({
            label: "network_scanner",
            toolId: 350,
            targetName: parsedTarget.hostname || targetUrl,
            toolParams: {
              preset: "light",
              protocol_type: "tcp",
              check_alive: true,
            },
          });
        }
      }
    }

    await insertObservation({
      module: "pentest_tools",
      observation_type: "scope_port_scan_plan",
      title: "Pentest-Tools plan for open ports and exposed services",
      value: {
        target: parsedTarget.normalized_target,
        scan_profile: job.scan_profile,
        hosting_context: hostingContext,
        host_targets_in_scope: scopedHostCandidates.length,
        host_targets_scheduled: scopedHostPortTargets.length,
        host_targets_skipped_limit: skippedHostTargets,
        ip_targets_in_scope: resolvedScopedIps.size,
        ip_targets_scheduled: domainCandidateIps.length,
        ip_targets_skipped_limit: skippedIpTargets,
        planned_scans_total: plannedScans.length,
      },
      severity: "info",
    });

    if (plannedScans.length === 0) {
      await insertObservation({
        module: "pentest_tools",
        observation_type: "no_eligible_tools",
        title: "No eligible Pentest-Tools scans for target type",
        value: {
          target_type: parsedTarget.target_type,
          hosting_context: hostingContext,
        },
        severity: "info",
      });
      return;
    }

    const startedScans: StartedPentestScan[] = [];

    for (const planned of plannedScans) {
      try {
        const startPayload: Record<string, unknown> = {
          tool_id: planned.toolId,
          target_name: planned.targetName,
          max_scan_time: maxScanTimeMinutes,
        };
        if (planned.toolParams) {
          startPayload.tool_params = planned.toolParams;
        }

        if (planned.toolId === 170 || planned.toolId === 310) {
          startPayload.scan_original_url = true;
          startPayload.redirect_level = "same_domain";
        }

        const startResponse = await requestPentest("/scans", {
          method: "POST",
          body: JSON.stringify(startPayload),
        });
        const scanId = Number(startResponse?.data?.created_id);
        if (!Number.isFinite(scanId)) {
          throw new Error("Pentest-Tools start response missing created_id");
        }

        startedScans.push({
          scanId,
          toolId: planned.toolId,
          label: planned.label,
          targetName: planned.targetName,
          status: "waiting",
          progress: 0,
          statusMessage: null,
          outputFingerprint: null,
          outputCollected: false,
        });

        await insertExternalIntel(
          "pentest_tools_scan",
          planned.targetName,
          true,
          {
            scan_id: scanId,
            tool_id: planned.toolId,
            label: planned.label,
            status: "started",
          },
          startResponse,
          "high",
        );
      } catch (error: any) {
        await insertObservation({
          module: "pentest_tools",
          observation_type: "scan_start_failed",
          title: `Pentest-Tools start failed (${planned.label})`,
          value: {
            tool_id: planned.toolId,
            target_name: planned.targetName,
            error: error?.message || String(error),
          },
          severity: "medium",
        });
      }
    }

    if (startedScans.length === 0) {
      await insertObservation({
        module: "pentest_tools",
        observation_type: "scan_start_failed_all",
        title: "All Pentest-Tools scan starts failed",
        value: {
          planned_scans: plannedScans.map((scan) => ({
            label: scan.label,
            tool_id: scan.toolId,
            target: scan.targetName,
          })),
        },
        severity: "medium",
      });
      return;
    }

    for (let pollIndex = 0; pollIndex < maxPolls; pollIndex++) {
      for (const scan of startedScans) {
        if (!isTerminalStatus(scan.status)) {
          try {
            const statusResponse = await requestPentest(`/scans/${scan.scanId}`, { method: "GET" });
            const statusData = statusResponse?.data || {};
            scan.status = String(statusData.status_name || "unknown");
            scan.progress = typeof statusData.progress === "number" ? statusData.progress : null;
            scan.statusMessage = statusData.status_message ? String(statusData.status_message) : null;
          } catch (error: any) {
            scan.status = "connection error";
            scan.statusMessage = error?.message || String(error);
          }
        }

        const statusNormalized = scan.status.toLowerCase();
        const shouldFetchOutput =
          statusNormalized === "finished" ||
          (!isTerminalStatus(scan.status) && pollIndex % outputPollEvery === 0);

        if (!shouldFetchOutput) continue;
        try {
          await normalizePentestOutput(scan, {
            allowPendingScanOutputErrors: statusNormalized !== "finished",
          });
        } catch (error: any) {
          if (statusNormalized === "finished") {
            await insertObservation({
              module: "pentest_tools",
              observation_type: "output_fetch_failed",
              title: `Pentest-Tools output retrieval failed (${scan.label})`,
              value: {
                scan_id: scan.scanId,
                tool_id: scan.toolId,
                status: scan.status,
                error: error?.message || String(error),
              },
              severity: "medium",
            });
          }
        }
      }

      const allTerminal = startedScans.every((scan) => isTerminalStatus(scan.status));
      if (allTerminal) break;
      await sleep(pollIntervalMs);
    }

    for (const scan of startedScans) {
      const terminal = isTerminalStatus(scan.status);
      const success = scan.status.toLowerCase() === "finished";

      await insertObservation({
        module: "pentest_tools",
        observation_type: "scan_status",
        title: `Pentest-Tools ${scan.label} status`,
        value: {
          scan_id: scan.scanId,
          tool_id: scan.toolId,
          target: scan.targetName,
          status: scan.status,
          progress: scan.progress,
          status_message: scan.statusMessage,
          terminal,
          output_collected: scan.outputCollected,
        },
        severity: success ? "info" : terminal ? "medium" : "low",
      });

      await insertExternalIntel(
        "pentest_tools_status",
        scan.targetName,
        success,
        {
          scan_id: scan.scanId,
          tool_id: scan.toolId,
          status: scan.status,
          progress: scan.progress,
          output_collected: scan.outputCollected,
        },
        {
          status_message: scan.statusMessage,
          terminal,
        },
        success ? "high" : terminal ? "medium" : "low",
      );

      if (success && !scan.outputCollected) {
        try {
          await normalizePentestOutput(scan, { allowPendingScanOutputErrors: false });
        } catch (error: any) {
          await insertObservation({
            module: "pentest_tools",
            observation_type: "output_fetch_failed",
            title: `Pentest-Tools output retrieval failed (${scan.label})`,
            value: {
              scan_id: scan.scanId,
              tool_id: scan.toolId,
              status: scan.status,
              error: error?.message || String(error),
            },
            severity: "medium",
          });
        }
      }
    }

    const nonTerminalScans = startedScans
      .filter((scan) => !isTerminalStatus(scan.status))
      .map((scan) => ({
        scan_id: scan.scanId,
        tool_id: scan.toolId,
        label: scan.label,
        status: scan.status,
        progress: scan.progress,
      }));

    if (nonTerminalScans.length > 0) {
      await insertObservation({
        module: "pentest_tools",
        observation_type: "scan_still_running",
        title: "Pentest-Tools scans still running after polling window",
        value: {
          scans: nonTerminalScans,
          note: "Risultati parziali già normalizzati ove disponibili; rieseguire enrichment per aggiornamento finale.",
        },
        severity: "low",
      });
    }
  };

  const modules: Record<string, ModuleExecutionConfig> = {
    dns: { key: "dns", label: "DNS & Mail Intelligence", timeoutMs: 20000 },
    dnssec: {
      key: "dnssec",
      label: "DNSSEC",
      timeoutMs: 8000,
      featureFlag: "SURFACESCAN_ENABLE_DNSSEC",
    },
    whois: {
      key: "whois",
      label: "Domain WHOIS/RDAP",
      timeoutMs: 12000,
      featureFlag: "SURFACESCAN_ENABLE_WEBCHECK_MODULES",
    },
    http_security: {
      key: "http_security",
      label: "HTTP Security",
      timeoutMs: 18000,
    },
    headers: {
      key: "headers",
      label: "HTTP Headers",
      timeoutMs: 18000,
    },
    robots: { key: "robots", label: "Robots.txt", timeoutMs: 12000 },
    security_txt: { key: "security_txt", label: "Security.txt", timeoutMs: 12000 },
    sitemap: { key: "sitemap", label: "Sitemap", timeoutMs: 12000 },
    redirects: { key: "redirects", label: "Redirect Chain", timeoutMs: 12000 },
    ssl_certificate: {
      key: "ssl_certificate",
      label: "SSL Certificate",
      timeoutMs: 16000,
    },
    tls_summary: {
      key: "tls_summary",
      label: "TLS Summary",
      timeoutMs: 16000,
    },
    server_info: {
      key: "server_info",
      label: "Server Information",
      timeoutMs: 15000,
    },
    server_location: {
      key: "server_location",
      label: "Server Location",
      timeoutMs: 12000,
    },
    tech_stack: {
      key: "tech_stack",
      label: "Tech Stack",
      timeoutMs: 15000,
    },
    quality: {
      key: "quality",
      label: "Quality Metrics",
      timeoutMs: 35000,
      featureFlag: "SURFACESCAN_ENABLE_QUALITY",
    },
    threats: {
      key: "threats",
      label: "Threat Checks",
      timeoutMs: 18000,
      featureFlag: "SURFACESCAN_ENABLE_THREATS",
    },
    dns_blocklists: {
      key: "dns_blocklists",
      label: "DNS Blocklists",
      timeoutMs: 15000,
      featureFlag: "SURFACESCAN_ENABLE_WEBCHECK_MODULES",
    },
    reverse_dns_and_dumpster: {
      key: "reverse_dns_and_dumpster",
      label: "Subdomain Discovery",
      timeoutMs: 30000,
      featureFlag: "SURFACESCAN_ENABLE_SUBDOMAINS",
    },
    shodan: { key: "shodan", label: "Shodan Intel", timeoutMs: 30000 },
    urlscan: { key: "urlscan", label: "URLScan Intel", timeoutMs: 20000 },
    pentest_tools: {
      key: "pentest_tools",
      label: "Pentest-Tools",
      timeoutMs: 240000,
      featureFlag: "SURFACESCAN_ENABLE_OPEN_PORTS",
    },
    open_ports: {
      key: "open_ports",
      label: "Open Ports",
      timeoutMs: 30000,
      featureFlag: "SURFACESCAN_ENABLE_OPEN_PORTS",
    },
    passes: {
      key: "passes",
      label: "Passes Summary",
      timeoutMs: 15000,
      featureFlag: "SURFACESCAN_ENABLE_WEBCHECK_MODULES",
    },
  };

  const runSafeRecon = async () => {
    await safeRun(modules.dns, runDnsModule);
    await safeRun(modules.dnssec, runDnssecModule);
    await safeRun(modules.whois, runWhoisModule);
    await safeRun(modules.http_security, runHttpModules);
    await safeRun(modules.headers, async () => {
      await fetchPrimaryHttpSnapshot();
    });
    await safeRun(modules.robots, runRobotsModule);
    await safeRun(modules.security_txt, runSecurityTxtModule);
    await safeRun(modules.sitemap, runSitemapModule);
    await safeRun(modules.redirects, runRedirectModule);
    await safeRun(modules.quality, runQualityModule);
    await safeRun(modules.threats, runThreatsModule);
    await safeRun(modules.dns_blocklists, runDnsBlocklistsModule);
  };

  try {
    await runSafeRecon();

    if (["domain_exposure", "ip_exposure", "cve_api_validation"].includes(job.scan_profile)) {
      await safeRun(modules.reverse_dns_and_dumpster, runReverseAndDumpsterModule);
      await safeRun(modules.shodan, runShodanModule);
    }

    if (["domain_exposure", "cve_api_validation"].includes(job.scan_profile)) {
      await safeRun(modules.urlscan, runUrlscanModule);
    }

    if (["domain_exposure", "ip_exposure", "cve_api_validation"].includes(job.scan_profile)) {
      await safeRun(modules.pentest_tools, runPentestToolsModule);
    }
    await safeRun(modules.open_ports, runOpenPortsModule);

    await safeRun(modules.ssl_certificate, runSslCertificateModule);
    await safeRun(modules.tls_summary, runTlsSummaryModule);
    await safeRun(modules.server_info, runServerInfoModule);
    await safeRun(modules.server_location, runServerLocationModule);
    await safeRun(modules.tech_stack, runTechStackModule);

    await safeRun(modules.passes, runPassesModule);

    // Hosting context derivation fallback
    if (hostingContext === "unknown") {
      const hostnames = [...discoveredHostnames];
      const unrelated = rootDomain
        ? hostnames.filter((h) => !h.toLowerCase().endsWith(rootDomain.toLowerCase())).length
        : 0;
      if (unrelated > 8) hostingContext = "shared_hosting";
      if (hostnames.some((h) => /cloudflare|akamai|fastly/i.test(h))) hostingContext = "cdn_proxy";
      if (hostingContext === "unknown" && discoveredIps.size > 0 && unrelated <= 1) hostingContext = "dedicated";
    }

    const findingsAgg = await adminClient
      .from("surface_findings" as any)
      .select("severity,module,finding_type")
      .eq("scan_job_id", job.id);
    const findingRows = (findingsAgg.data || []) as Array<{
      severity: string;
      module?: string | null;
      finding_type?: string | null;
    }>;
    const highestSeverity = findingRows
      .map((row) => row.severity)
      .sort((a, b) => severityRank(b) - severityRank(a))[0] || "info";
    const severityCounts = findingRows.reduce(
      (acc, row) => {
        const key = toSeverity(row.severity || "info");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<string, number>,
    );
    const observationAgg = await adminClient
      .from("surface_observations" as any)
      .select("module,observation_type,value,created_at")
      .eq("scan_job_id", job.id)
      .in("module", [
        "ssl_certificate",
        "tls_summary",
        "dnssec",
        "dns",
        "mail_security",
        "http_security",
        "open_ports",
        "threats",
        "dns_blocklists",
        "quality",
        "whois",
      ])
      .order("created_at", { ascending: false });
    const observationRows = (observationAgg.data || []) as Array<{
      module: string;
      observation_type: string;
      value: Record<string, unknown>;
      created_at?: string | null;
    }>;
    const getLatestObservation = (moduleKey: string, observationType?: string) =>
      observationRows.find((row) =>
        row.module === moduleKey && (!observationType || row.observation_type === observationType)
      )?.value || {};

    const sslSummary = getLatestObservation("ssl_certificate", "ssl_certificate_summary") as Record<string, unknown>;
    const tlsSummary = getLatestObservation("tls_summary", "tls_summary") as Record<string, unknown>;
    const dnssecSummary = getLatestObservation("dnssec", "dnssec_status") as Record<string, unknown>;
    const dnsSummary = getLatestObservation("dns", "dns_records") as Record<string, unknown>;
    const mailSummary = getLatestObservation("mail_security", "mail_security_summary") as Record<string, unknown>;
    const httpSecuritySummary = getLatestObservation("http_security", "http_security_summary") as Record<string, unknown>;
    const openPortsSummary = getLatestObservation("open_ports", "open_ports_summary") as Record<string, unknown>;
    const threatsSummary = getLatestObservation("threats", "threats_summary") as Record<string, unknown>;
    const dnsblSummary = getLatestObservation("dns_blocklists", "dnsbl_summary") as Record<string, unknown>;
    const qualitySummary = getLatestObservation("quality", "quality_summary") as Record<string, unknown>;
    const whoisSummary = getLatestObservation("whois", "whois_rdap") as Record<string, unknown>;

    const hasFindingType = (types: string[]): boolean => {
      const wanted = new Set(types.map((entry) => String(entry).toLowerCase()));
      return findingRows.some((row) => wanted.has(String(row.finding_type || "").toLowerCase()));
    };
    const asNumber = (value: unknown): number | null => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return null;
      return parsed;
    };
    const asBoolean = (value: unknown): boolean => value === true;
    const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

    let transportScore = 0;
    const sslTrusted = asBoolean((sslSummary as any)?.trusted);
    if (sslTrusted) transportScore += 40;
    if (
      sslTrusted &&
      !hasFindingType([
        "ssl_certificate_untrusted_chain",
        "ssl_certificate_self_signed",
      ])
    ) {
      transportScore += 20;
    }
    const expiresInDays =
      asNumber((sslSummary as any)?.expiresInDays) ?? asNumber((sslSummary as any)?.daysToExpiry);
    if (expiresInDays !== null && expiresInDays > 30) transportScore += 15;
    const tls12Supported = asBoolean((tlsSummary as any)?.tls12Supported) || asBoolean((tlsSummary as any)?.tls13Supported);
    if (tls12Supported) transportScore += 15;
    const weakProtocolsEnabled =
      asBoolean((tlsSummary as any)?.tls10Supported) ||
      asBoolean((tlsSummary as any)?.tls11Supported) ||
      hasFindingType(["tls_legacy_protocols_enabled"]);
    if (!weakProtocolsEnabled) transportScore += 10;
    transportScore = clampScore(transportScore);

    let dnsScore = 0;
    const dnskeyPresent = asBoolean((dnssecSummary as any)?.dnskey_present);
    const dsPresent = asBoolean((dnssecSummary as any)?.ds_present);
    if (dnskeyPresent && dsPresent) dnsScore += 40;
    else if (dnskeyPresent || dsPresent) dnsScore += 20;
    const spfRecords = asArray((mailSummary as any)?.spf_records).map((entry) => String(entry || "").trim()).filter(Boolean);
    if (spfRecords.length > 0) dnsScore += 15;
    const dmarcRecords = asArray((mailSummary as any)?.dmarc_records).map((entry) => String(entry || "").trim()).filter(Boolean);
    if (dmarcRecords.length > 0) dnsScore += 20;
    const caaRecords = asArray((dnsSummary as any)?.CAA).map((entry) => String(entry || "").trim()).filter(Boolean);
    if (caaRecords.length > 0) dnsScore += 10;
    const nsRecords = asArray((dnsSummary as any)?.NS).map((entry) => String(entry || "").trim()).filter(Boolean);
    const mxRecords = asArray((dnsSummary as any)?.MX).map((entry) => String(entry || "").trim()).filter(Boolean);
    if (nsRecords.length >= 2 && mxRecords.length >= 1) dnsScore += 15;
    else if (nsRecords.length >= 1 && mxRecords.length >= 1) dnsScore += 10;
    dnsScore = clampScore(dnsScore);

    let httpSecurityScore = clampScore(asNumber((httpSecuritySummary as any)?.score) ?? 0);
    if (httpSecurityScore === 0 && (httpSecuritySummary as any)?.checks && typeof (httpSecuritySummary as any).checks === "object") {
      const checks = Object.values((httpSecuritySummary as any).checks as Record<string, unknown>);
      const passed = checks.filter((entry) => entry === true).length;
      httpSecurityScore = clampScore((checks.length > 0 ? (passed / checks.length) * 100 : 0));
    }

    let exposureScore = 100;
    const openPorts = asArray((openPortsSummary as any)?.openPorts);
    const criticalPorts = openPorts.filter((entry: any) => severityForExposedPort(Number(entry?.port || 0)) === "critical").length;
    const highPorts = openPorts.filter((entry: any) => severityForExposedPort(Number(entry?.port || 0)) === "high").length;
    const mediumPorts = openPorts.filter((entry: any) => severityForExposedPort(Number(entry?.port || 0)) === "medium").length;
    exposureScore -= criticalPorts * 40;
    exposureScore -= highPorts * 25;
    exposureScore -= mediumPorts * 10;
    const sensitiveKeywords = /(staging|dev|test|backup|vpn|cpanel|webmail|autodiscover|mail)/i;
    const sensitiveSubdomainCount = [...discoveredHostnames]
      .map((entry) => String(entry || "").toLowerCase())
      .filter((entry) => entry && rootDomain && entry.endsWith(`.${String(rootDomain).toLowerCase()}`))
      .filter((entry) => sensitiveKeywords.test(entry))
      .length;
    exposureScore -= Math.min(25, sensitiveSubdomainCount * 5);
    exposureScore = clampScore(exposureScore);

    let reputationScore = 100;
    const safeBrowsingUnsafe = asBoolean((threatsSummary as any)?.safe_browsing?.unsafe);
    const urlHausListed = asBoolean((threatsSummary as any)?.urlhaus?.listed);
    const phishTankVerified =
      asBoolean((threatsSummary as any)?.phishtank?.verified) ||
      (asBoolean((threatsSummary as any)?.phishtank?.in_database) && asBoolean((threatsSummary as any)?.phishtank?.valid));
    if (safeBrowsingUnsafe || urlHausListed || phishTankVerified) {
      reputationScore = 0;
    } else {
      const intelIndicators = asArray((threatsSummary as any)?.intelguard?.indicators);
      const highConfidenceIntel = intelIndicators.filter((entry: any) => Number(entry?.confidence || 0) >= 90).length;
      reputationScore -= Math.min(30, highConfidenceIntel * 10);
      const dnsblListedCount = asNumber((dnsblSummary as any)?.listed_count) ?? 0;
      reputationScore -= Math.min(40, Math.max(0, Math.round(dnsblListedCount)) * 8);
    }
    reputationScore = clampScore(reputationScore);

    const qualityCategories = ((qualitySummary as any)?.categories || {}) as Record<string, unknown>;
    const qualityParts = [
      asNumber(qualityCategories.performance),
      asNumber(qualityCategories.accessibility),
      asNumber(qualityCategories.best_practices),
      asNumber(qualityCategories.seo),
    ].filter((entry): entry is number => entry !== null);
    const qualityScore = clampScore(
      qualityParts.length > 0
        ? qualityParts.reduce((acc, value) => acc + value, 0) / qualityParts.length
        : 0,
    );

    let domainHygieneScore = 70;
    const daysToExpiry = asNumber((whoisSummary as any)?.days_to_expiry);
    if (daysToExpiry !== null) {
      if (daysToExpiry > 90) domainHygieneScore = 100;
      else if (daysToExpiry >= 30) domainHygieneScore = 70;
      else if (daysToExpiry >= 0) domainHygieneScore = 40;
      else domainHygieneScore = 0;
    }
    const registrarName = String((whoisSummary as any)?.registrar || "").trim();
    if (!registrarName) domainHygieneScore -= 10;
    domainHygieneScore = clampScore(domainHygieneScore);

    const weightedOverall = clampScore(
      transportScore * 0.20 +
      dnsScore * 0.15 +
      httpSecurityScore * 0.20 +
      exposureScore * 0.15 +
      reputationScore * 0.15 +
      qualityScore * 0.10 +
      domainHygieneScore * 0.05,
    );
    const severityPenaltyOverall = Math.max(
      0,
      Math.round(
        100 -
          severityCounts.critical * 35 -
          severityCounts.high * 20 -
          severityCounts.medium * 8 -
          severityCounts.low * 3 -
          severityCounts.info * 1,
      ),
    );
    const overallScore = clampScore(Math.round((weightedOverall * 0.75) + (severityPenaltyOverall * 0.25)));
    const riskLevel = riskLevelFromScore(overallScore);
    const scoreBreakdown: SurfaceScoreBreakdown = {
      transportScore,
      dnsScore,
      httpSecurityScore,
      exposureScore,
      reputationScore,
      qualityScore,
      domainHygieneScore,
      overallScore,
      riskLevel,
    };
    const moduleSummary = [...moduleExecution.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        status: entry.status,
        severity: entry.severity || "info",
        started_at: entry.started_at || null,
        completed_at: entry.completed_at || null,
        duration_ms: entry.duration_ms || null,
        error_message: entry.error_message || null,
      }));
    const moduleCounters = moduleSummary.reduce(
      (acc, entry) => {
        acc.total += 1;
        acc[entry.status] = (acc[entry.status] || 0) + 1;
        return acc;
      },
      {
        total: 0,
        queued: 0,
        running: 0,
        success: 0,
        skipped: 0,
        error: 0,
        timeout: 0,
      } as Record<string, number>,
    );
    const scanSummary = {
      overall_score: overallScore,
      risk_level: riskLevel,
      score_breakdown: scoreBreakdown,
      score_components: {
        weighted_model: weightedOverall,
        severity_penalty_model: severityPenaltyOverall,
      },
      severity_counts: severityCounts,
      findings_total: findingRows.length,
      module_counters: moduleCounters,
      modules: moduleSummary,
      scope_guard: scopeCounters,
      hosting_context: hostingContext,
      shodan_status: shodanStatus,
    };

    await insertObservation({
      module: "scope_guard",
      observation_type: "scope_guard_summary",
      title: "Scope guard filtering summary",
      value: {
        in_scope: scopeCounters.in_scope,
        excluded_by_scope: scopeCounters.excluded_by_scope,
        excluded_shared_noise: scopeCounters.excluded_shared_noise,
        scope_domains_count: scopeDomains.length,
        ip_scope_rules_count: ipScopeRules.length,
      },
      severity: "info",
    });

    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        resolved_ips: [...discoveredIps],
        hosting_context: hostingContext,
        shodan_status: shodanStatus,
        summary: scanSummary,
      })
      .eq("id", job.id);

    await logAudit("scan_completed", {
      findings_count: findingRows.length,
      highest_severity: highestSeverity,
      hosting_context: hostingContext,
      shodan_status: shodanStatus,
      summary: scanSummary,
      scope_guard: scopeCounters,
    });

    await triggerCveEnrichmentQueue();
    await triggerAutoReportRepository();
  } catch (error: any) {
    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error?.message || "Enrichment failed",
      })
      .eq("id", job.id);

    await logAudit("scan_failed", {
      error: error?.message || String(error),
    });

    throw error;
  } finally {
    try {
      await dispatchSurfaceScanQueue(adminClient, organizationId, {
        initiatedByUserId: options.initiatedByUserId || job.requested_by || null,
        maxToStart: 1,
      });
    } catch (queueError) {
      console.error("[surface-scan-queue] dispatch after completion failed:", queueError);
    }
  }
}
