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
  | "web_vuln_authorized";

type NucleiAction = "direct_scan" | "enqueue" | "list" | "get" | "process_queue";

type RequestBody = {
  action?: NucleiAction;
  organization_id?: string;
  job_id?: string;
  target_url?: string;
  targets?: string[];
  include_surface_assets?: boolean;
  surface_asset_limit?: number;
  profile?: NucleiProfile;
  timeout_seconds?: number;
  rate_limit?: number;
  max_findings?: number;
  authorized_scan?: boolean;
  limit?: number;
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
  profile: NucleiProfile;
  authorized_scan: boolean;
  timeout_seconds: number;
  rate_limit: number;
  max_findings: number;
  status: string;
  attempt_count: number;
};

const ALLOWED_PROFILES = new Set<NucleiProfile>([
  "baseline_headers",
  "exposure_medium",
  "web_vuln_safe",
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

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeTargetUrl(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("target_url is required");
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

function normalizeProfile(value: unknown): NucleiProfile {
  const profile = String(value || "baseline_headers").trim() as NucleiProfile;
  if (!ALLOWED_PROFILES.has(profile)) throw new Error("Unsupported Nuclei profile");
  return profile;
}

function normalizeOptions(body: RequestBody): Omit<ScanPayload, "target_url"> {
  const profile = normalizeProfile(body.profile);
  const authorizedScan = body.authorized_scan === true;
  if (profile === "web_vuln_authorized" && !authorizedScan) {
    throw new Error("authorized_scan=true is required for web_vuln_authorized");
  }
  return {
    profile,
    timeout_seconds: clampInt(body.timeout_seconds, profile === "baseline_headers" ? 45 : 120, 15, 180),
    rate_limit: clampInt(body.rate_limit, profile === "web_vuln_authorized" ? 2 : 5, 1, profile === "web_vuln_authorized" ? 2 : 10),
    max_findings: clampInt(body.max_findings, 25, 1, 200),
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

function getServiceConfig() {
  const serviceUrl = String(Deno.env.get("NUCLEI_SCAN360_SERVICE_URL") || "").replace(/\/+$/, "");
  const sharedSecret = String(Deno.env.get("NUCLEI_SCAN360_SHARED_SECRET") || "").trim();
  if (!serviceUrl || !sharedSecret) {
    throw new Error("NucleiScan360 service is not configured");
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
      throw new Error(String(errorPayload.error || errorPayload.message || `Nuclei service HTTP ${response.status}`));
    }

    return parsed as NucleiResult;
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
  const { data, error } = await adminClient
    .from("surface_assets")
    .select("asset_type, asset_value")
    .or(`organization_id.eq.${organizationId},customer_id.eq.${organizationId}`)
    .in("asset_type", ["domain", "subdomain", "url"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message || "Unable to load SurfaceScan360 assets");

  return (data || [])
    .map((asset: { asset_type?: string; asset_value?: string }) => {
      const value = String(asset.asset_value || "").trim();
      if (!value) return "";
      if (asset.asset_type === "url" || /^https?:\/\//i.test(value)) return value;
      return `https://${value}`;
    })
    .filter(Boolean);
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
  const manualTargets = [
    body.target_url,
    ...(Array.isArray(body.targets) ? body.targets : []),
  ].filter(Boolean) as string[];
  const surfaceTargets = body.include_surface_assets
    ? await collectSurfaceTargets(adminClient, organizationId, clampInt(body.surface_asset_limit, 20, 1, 50))
    : [];
  const source = manualTargets.length > 0 && surfaceTargets.length > 0
    ? "mixed"
    : surfaceTargets.length > 0
      ? "surface_assets"
      : "manual";

  const normalizedTargets = Array.from(new Set([...manualTargets, ...surfaceTargets].map(normalizeTargetUrl))).slice(0, 50);
  if (normalizedTargets.length === 0) throw new Error("At least one target or SurfaceScan360 asset is required");

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
    return { queued: [], queued_count: 0, skipped_duplicates: normalizedTargets.length };
  }

  const rows = newTargets.map((targetUrl) => ({
    organization_id: organizationId,
    customer_id: organizationId,
    created_by: authUserId,
    created_by_email: email,
    source,
    target_url: targetUrl,
    normalized_target_url: targetUrl,
    target_host: getTargetHost(targetUrl),
    profile: options.profile,
    authorized_scan: options.authorized_scan,
    timeout_seconds: options.timeout_seconds,
    rate_limit: options.rate_limit,
    max_findings: options.max_findings,
    status: "queued",
  }));

  const { data, error } = await adminClient
    .from("nuclei_scan360_jobs")
    .insert(rows)
    .select("*");
  if (error) throw new Error(error.message || "Unable to enqueue NucleiScan360 jobs");

  return { queued: data || [], queued_count: data?.length || 0, skipped_duplicates: normalizedTargets.length - (data?.length || 0) };
}

async function listJobs(adminClient: SupabaseClient, body: RequestBody) {
  const organizationId = String(body.organization_id || "").trim();
  if (!organizationId) throw new Error("organization_id is required");
  await loadOrganization(adminClient, organizationId);

  const { data, error } = await adminClient
    .from("nuclei_scan360_jobs")
    .select("id, organization_id, customer_id, source, target_url, resolved_target_url, target_host, profile, status, attempt_count, last_error, timeout_seconds, rate_limit, max_findings, authorized_scan, duration_ms, nuclei_version, templates_loaded_count, templates_executed_count, findings_count, warnings, summary, raw_result, created_at, started_at, completed_at")
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

  return { job, findings: findings || [] };
}

async function persistResult(adminClient: SupabaseClient, job: NucleiJob, result: NucleiResult) {
  const findings = Array.isArray(result.findings) ? result.findings : [];
  await adminClient.from("nuclei_scan360_findings").delete().eq("job_id", job.id);

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
      raw_finding: finding,
    }));

    const { error: insertError } = await adminClient.from("nuclei_scan360_findings").insert(rows);
    if (insertError) throw new Error(insertError.message || "Unable to persist NucleiScan360 findings");
  }

  const summary = buildSummary(result);
  const { error: updateError } = await adminClient
    .from("nuclei_scan360_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      duration_ms: Number.isFinite(Number(result.duration_ms)) ? Math.round(Number(result.duration_ms)) : null,
      resolved_target_url: result.resolved_target_url || result.target_url || job.target_url,
      nuclei_version: result.nuclei_version || null,
      templates_loaded_count: Number.isFinite(Number(result.templates_loaded_count)) ? Math.round(Number(result.templates_loaded_count)) : null,
      templates_executed_count: Number.isFinite(Number(result.templates_executed_count)) ? Math.round(Number(result.templates_executed_count)) : null,
      findings_count: findings.length,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      summary,
      raw_result: result,
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
      completed_at: new Date().toISOString(),
      last_error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  return message;
}

async function processQueue(adminClient: SupabaseClient, body: RequestBody) {
  getServiceConfig();
  const organizationId = String(body.organization_id || "").trim();
  if (!organizationId) throw new Error("organization_id is required");
  await loadOrganization(adminClient, organizationId);

  const maxJobs = clampInt(body.limit, 1, 1, 2);
  const { data: queued, error } = await adminClient
    .from("nuclei_scan360_jobs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(maxJobs);
  if (error) throw new Error(error.message || "Unable to load queued NucleiScan360 jobs");

  const processed: Array<{ job_id: string; status: string; result?: NucleiResult; error?: string }> = [];
  for (const job of (queued || []) as NucleiJob[]) {
    const { data: claimed, error: claimError } = await adminClient
      .from("nuclei_scan360_jobs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        attempt_count: (job.attempt_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message || "Unable to claim NucleiScan360 job");
    if (!claimed?.id) continue;

    const runningJob = claimed as NucleiJob;
    try {
      const result = await callNucleiService({
        target_url: runningJob.normalized_target_url,
        profile: runningJob.profile,
        timeout_seconds: Math.min(runningJob.timeout_seconds, HTTP_ACTION_TIMEOUT_SECONDS),
        rate_limit: runningJob.rate_limit,
        max_findings: runningJob.max_findings,
        authorized_scan: runningJob.authorized_scan,
      });
      await persistResult(adminClient, runningJob, result);
      processed.push({ job_id: runningJob.id, status: "completed", result });
    } catch (error) {
      const message = await markJobFailed(adminClient, runningJob, error);
      processed.push({ job_id: runningJob.id, status: /timeout|aborted/i.test(message) ? "timeout" : "failed", error: message });
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const caller = await getCallerProfile(adminClient, authData.user.id);
    if (!caller.isSuperAdmin) {
      return jsonResponse({ ok: false, error: "Only super admins can use NucleiScan360" }, 403);
    }

    const body = (await req.json()) as RequestBody;
    const action = (body.action || "direct_scan") as NucleiAction;
    let payload: Record<string, unknown>;

    if (action === "direct_scan") {
      payload = await directScan(body);
    } else if (action === "enqueue") {
      payload = await enqueueJobs(adminClient, body, authData.user.id, authData.user.email || caller.email);
    } else if (action === "list") {
      payload = await listJobs(adminClient, body);
    } else if (action === "get") {
      payload = await getJob(adminClient, body);
    } else if (action === "process_queue") {
      payload = await processQueue(adminClient, body);
    } else {
      return jsonResponse({ ok: false, error: "Unsupported action" }, 400);
    }

    return jsonResponse({ ok: true, action, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isAbort = error instanceof DOMException && error.name === "AbortError";
    const status = message.includes("not configured") ? 503 : isAbort ? 504 : 400;
    return jsonResponse({ ok: false, error: isAbort ? "NucleiScan360 timeout" : message }, status);
  }
});
