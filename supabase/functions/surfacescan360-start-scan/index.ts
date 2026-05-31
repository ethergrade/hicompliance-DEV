import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  assertCustomerAccess,
  classifyTargetScope,
  corsHeaders,
  evaluateOrganizationServiceGate,
  getCallerProfile,
  isAllowedProfile,
  makeSupabaseClients,
  normalizeTargetInput,
  resolveWithDnsOverHttps,
  splitMonitoredScopeRules,
} from "../_shared/surface-scan-utils.ts";
import { dispatchSurfaceScanQueue } from "../_shared/surface-scan-engine.ts";

interface StartScanRequest {
  target: string;
  customer_id: string;
  scan_profile?: string;
  authorization_confirmed?: boolean;
  ownership_proof?: string;
  force_refresh?: boolean;
  requested_by?: string | null;
}

const MAX_SCANS_PER_USER_PER_HOUR = 200;
const PROFILE_RATE_LIMITS: Record<string, { tier: "quick" | "full" | "deep"; maxPerHour: number }> = {
  safe_recon: { tier: "quick", maxPerHour: 20 },
  domain_exposure: { tier: "full", maxPerHour: 10 },
  ip_exposure: { tier: "full", maxPerHour: 10 },
  cve_api_validation: { tier: "deep", maxPerHour: 3 },
};
const TARGET_COOLDOWN_MINUTES = 15;
const SERVICE_ROLE_KEY = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
const INTERNAL_CRON_SECRET = String(
  Deno.env.get("SURFACESCAN_CRON_INTERNAL_SECRET")
  || Deno.env.get("SURFACESCAN_INTERNAL_SECRET")
  || "",
).trim();
const DEFAULT_SCAN_PROFILE = (() => {
  const configured = String(Deno.env.get("SURFACESCAN_DEFAULT_SCAN_PROFILE") || "").trim().toLowerCase();
  if (isAllowedProfile(configured)) return configured;
  return "domain_exposure";
})();

function extractBearerToken(req: Request): string {
  const auth = String(req.headers.get("authorization") || "");
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return String(match?.[1] || "").trim();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const bearerToken = extractBearerToken(req);
    const cronSecretHeader = String(
      req.headers.get("x-surface-internal-secret")
      || req.headers.get("x-cron-secret")
      || "",
    ).trim();
    const isServiceRoleToken =
      Boolean(SERVICE_ROLE_KEY)
      && bearerToken === SERVICE_ROLE_KEY;
    const isInternalSecretInvocation =
      Boolean(INTERNAL_CRON_SECRET)
      && cronSecretHeader === INTERNAL_CRON_SECRET;
    const isServiceRoleInvocation = isServiceRoleToken || isInternalSecretInvocation;

    let actorUserId: string | null = null;
    let caller: Awaited<ReturnType<typeof getCallerProfile>> | null = null;

    if (!isServiceRoleInvocation) {
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      actorUserId = authData.user.id;
      caller = await getCallerProfile(adminClient, authData.user.id);
    }

    const body = (await req.json()) as StartScanRequest;
    const target = String(body?.target || "").trim();
    const customerId = String(body?.customer_id || "").trim();
    const scanProfile = String(body?.scan_profile || DEFAULT_SCAN_PROFILE).trim();
    const authorizationConfirmed = Boolean(body?.authorization_confirmed);
    const forceRefresh = Boolean(body?.force_refresh);

    if (!target || !customerId) {
      return new Response(
        JSON.stringify({ error: "target and customer_id are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    if (!authorizationConfirmed) {
      return new Response(
        JSON.stringify({ error: "authorization_confirmed must be true" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    if (!isAllowedProfile(scanProfile)) {
      return new Response(
        JSON.stringify({
          error:
            "scan_profile must be one of safe_recon, domain_exposure, ip_exposure, cve_api_validation",
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!isServiceRoleInvocation && caller) {
      assertCustomerAccess(caller, customerId);
    }

    const { data: orgRuntimeFlags, error: orgRuntimeError } = await adminClient
      .from("organizations" as any)
      .select(
        "surface_scan360_enabled, services_paused, services_paused_at, services_pause_reason, surface_scan_contract_start, surface_scan_contract_years",
      )
      .eq("id", customerId)
      .maybeSingle();
    if (orgRuntimeError) {
      throw new Error(orgRuntimeError.message || "Unable to validate organization service runtime flags");
    }
    if (!orgRuntimeFlags) {
      return new Response(
        JSON.stringify({ error: "Organization not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    const serviceGate = evaluateOrganizationServiceGate(orgRuntimeFlags as any, "surface_scan360");
    if (!serviceGate.allowed) {
      return new Response(
        JSON.stringify({
          error: `SurfaceScan360 non eseguibile: ${serviceGate.reason}`,
          code: serviceGate.code,
          contract_start: serviceGate.contract_start,
          contract_end: serviceGate.contract_end,
        }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Admin-only scan start in v1
    if (!isServiceRoleInvocation && !caller?.isAdminLike) {
      return new Response(
        JSON.stringify({ error: "Only admin users can start scans in v1" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!isServiceRoleInvocation && scanProfile === "cve_api_validation" && !caller?.isAdminLike) {
      return new Response(
        JSON.stringify({ error: "cve_api_validation is admin-only" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const normalized = normalizeTargetInput(target);
    const { data: monitoredScopeRows, error: monitoredScopeError } = await adminClient
      .from("surface_scan_monitored_ips" as any)
      .select("entry_type, input_value, ip_start, ip_end")
      .eq("organization_id", customerId);
    if (monitoredScopeError) {
      throw new Error(monitoredScopeError.message || "Unable to read monitored scope");
    }
    const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules((monitoredScopeRows || []) as any[]);
    const scopeDecision = classifyTargetScope(normalized, scopeDomains, ipScopeRules);
    if (!scopeDecision.allowed) {
      await adminClient.from("surface_scan_audit_log" as any).insert({
        scan_job_id: null,
        user_id: actorUserId,
        action: "scan_rejected_scope_guard",
        details: {
          code: scopeDecision.code,
          reason: scopeDecision.reason,
          raw_target: target,
          normalized_target: normalized.normalized_target,
          target_type: normalized.target_type,
          hostname: normalized.hostname,
          scope_domains_count: scopeDomains.length,
          ip_scope_rules_count: ipScopeRules.length,
        },
      });

      const scopeErrorMessage =
        scopeDecision.code === "target_out_of_scope_shared_noise"
          ? "Target escluso: host shared/noise fuori scope monitorato. Usa dominio/IP ufficiale in scope."
          : scopeDecision.code === "target_out_of_scope_ip"
            ? "Target IP fuori scope monitorato: aggiungi prima una regola IP (single/range/cidr)."
            : "Target dominio/subdominio fuori scope monitorato: aggiungi prima la regola dominio.";

      return new Response(
        JSON.stringify({
          error: scopeErrorMessage,
          code: scopeDecision.code,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Batch-friendly rate limit for queue mode.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    if (actorUserId) {
      const rateRes = await adminClient
        .from("surface_scan_jobs" as any)
        .select("id", { count: "exact", head: true })
        .eq("requested_by", actorUserId)
        .gte("created_at", oneHourAgo);

      if ((rateRes.count || 0) >= MAX_SCANS_PER_USER_PER_HOUR) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Retry later." }),
          { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }
    }

    const profileRateLimit = PROFILE_RATE_LIMITS[scanProfile] || PROFILE_RATE_LIMITS.safe_recon;
    const profileRateRes = await adminClient
      .from("surface_scan_jobs" as any)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", customerId)
      .eq("scan_profile", scanProfile)
      .gte("created_at", oneHourAgo);

    if ((profileRateRes.count || 0) >= profileRateLimit.maxPerHour) {
      return new Response(
        JSON.stringify({
          error: `Rate limit ${profileRateLimit.tier} raggiunto: massimo ${profileRateLimit.maxPerHour} target/ora per tenant.`,
          code: `rate_limit_${profileRateLimit.tier}`,
        }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!forceRefresh) {
      const cooldownThreshold = new Date(Date.now() - TARGET_COOLDOWN_MINUTES * 60 * 1000).toISOString();
      const duplicateRes = await adminClient
        .from("surface_scan_jobs" as any)
        .select("id, status, created_at")
        .eq("organization_id", customerId)
        .eq("normalized_target", normalized.normalized_target)
        .eq("scan_profile", scanProfile)
        .in("status", ["queued", "running", "completed"])
        .gte("created_at", cooldownThreshold)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (duplicateRes.error) {
        throw new Error(duplicateRes.error.message || "Unable to validate cooldown");
      }
      if (duplicateRes.data?.id) {
        await adminClient.from("surface_scan_audit_log" as any).insert({
          scan_job_id: duplicateRes.data.id,
          user_id: actorUserId,
          action: "scan_rejected_cooldown",
          details: {
            normalized_target: normalized.normalized_target,
            scan_profile: scanProfile,
            cooldown_minutes: TARGET_COOLDOWN_MINUTES,
            existing_job_id: duplicateRes.data.id,
            existing_status: duplicateRes.data.status,
          },
        });
        return new Response(
          JSON.stringify({
            error: `Cooldown attivo: target già scansionato/accodato negli ultimi ${TARGET_COOLDOWN_MINUTES} minuti. Usa force_refresh=true per bypass.`,
            code: "target_module_cooldown_active",
            existing_job_id: duplicateRes.data.id,
          }),
          { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }
    }

    // Recover stale running jobs to avoid indefinite PENDING/RUNNING states.
    const staleRunningCutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const { data: staleRunningJobs } = await adminClient
      .from("surface_scan_jobs" as any)
      .select("id")
      .eq("organization_id", customerId)
      .eq("status", "running")
      .lt("started_at", staleRunningCutoff)
      .limit(20);

    if ((staleRunningJobs || []).length > 0) {
      const staleIds = (staleRunningJobs || []).map((row: any) => row.id).filter(Boolean);
      if (staleIds.length > 0) {
        const nowIso = new Date().toISOString();
        await adminClient
          .from("surface_scan_jobs" as any)
          .update({
            status: "failed",
            completed_at: nowIso,
            error_message: "Scan timed out while running",
          })
          .in("id", staleIds);

        await adminClient.from("surface_scan_audit_log" as any).insert(
            staleIds.map((id: string) => ({
              scan_job_id: id,
              user_id: actorUserId,
              action: "scan_auto_failed_timeout",
            details: { reason: "running_timeout_45m" },
          })),
        );
      }
    }

    // Queue protection: avoid unbounded backlog.
    const queueDepthRes = await adminClient
      .from("surface_scan_jobs" as any)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", customerId)
      .in("status", ["pending", "queued", "running"]);

    if ((queueDepthRes.count || 0) >= 50) {
      return new Response(
        JSON.stringify({ error: "SurfaceScan queue is full (50 active jobs). Try later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const resolvedIps = new Set<string>();
    if (normalized.target_type === "ipv4" || normalized.target_type === "ipv6") {
      if (normalized.hostname) resolvedIps.add(normalized.hostname);
    } else if (normalized.hostname) {
      const [aRecords, aaaaRecords] = await Promise.all([
        resolveWithDnsOverHttps(normalized.hostname, "A"),
        resolveWithDnsOverHttps(normalized.hostname, "AAAA"),
      ]);
      for (const ip of [...aRecords, ...aaaaRecords]) resolvedIps.add(ip);
    }

    const { data: jobData, error: jobError } = await adminClient
      .from("surface_scan_jobs" as any)
      .insert({
        organization_id: customerId,
        tenant_id: customerId,
        customer_id: customerId,
        requested_by: actorUserId || body.requested_by || null,
        raw_target: normalized.raw_target,
        normalized_target: normalized.normalized_target,
        target_type: normalized.target_type,
        hostname: normalized.hostname,
        root_domain: normalized.root_domain,
        resolved_ips: [...resolvedIps],
        scan_profile: scanProfile,
        status: "queued",
        authorization_confirmed: true,
      })
      .select("*")
      .single();

    if (jobError || !jobData) {
      throw new Error(jobError?.message || "Unable to create scan job");
    }

    await adminClient.from("surface_scan_audit_log" as any).insert({
      scan_job_id: jobData.id,
      user_id: actorUserId,
      action: "scan_created",
      details: {
        target: normalized.normalized_target,
        scan_profile: scanProfile,
        ownership_proof: body.ownership_proof || null,
      },
    });

    await dispatchSurfaceScanQueue(adminClient, customerId, {
      initiatedByUserId: actorUserId,
      maxToStart: 3,
    });

    console.info("surface_scan_module_start", {
      scanRunId: jobData.id,
      tenantId: customerId,
      moduleKey: "queue_dispatch",
      target: normalized.normalized_target,
    });

    const { data: updatedJob, error: updatedJobError } = await adminClient
      .from("surface_scan_jobs" as any)
      .select("id, status, created_at, started_at, completed_at, error_message")
      .eq("id", jobData.id)
      .single();

    if (updatedJobError || !updatedJob) {
      throw new Error(updatedJobError?.message || "Unable to load queued job status");
    }

    return new Response(
      JSON.stringify({
        job_id: jobData.id,
        status: updatedJob.status || "queued",
        normalized_target: normalized.normalized_target,
        execution_mode: "queued_dispatch",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Internal error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});
