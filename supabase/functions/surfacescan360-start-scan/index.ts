import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  isAllowedProfile,
  makeSupabaseClients,
  normalizeTargetInput,
  resolveWithDnsOverHttps,
} from "../_shared/surface-scan-utils.ts";
import { runSurfaceScanEnrichment } from "../_shared/surface-scan-engine.ts";

interface StartScanRequest {
  target: string;
  customer_id: string;
  scan_profile?: string;
  authorization_confirmed?: boolean;
  ownership_proof?: string;
}

function enqueueBackgroundTask(task: Promise<void>): boolean {
  const edgeRuntime = (globalThis as any)?.EdgeRuntime;
  if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
    edgeRuntime.waitUntil(task);
    return true;
  }
  return false;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = (await req.json()) as StartScanRequest;
    const target = String(body?.target || "").trim();
    const customerId = String(body?.customer_id || "").trim();
    const scanProfile = String(body?.scan_profile || "safe_recon").trim();
    const authorizationConfirmed = Boolean(body?.authorization_confirmed);

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

    const caller = await getCallerProfile(adminClient, authData.user.id);
    assertCustomerAccess(caller, customerId);

    // Admin-only scan start in v1
    if (!caller.isAdminLike) {
      return new Response(
        JSON.stringify({ error: "Only admin users can start scans in v1" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (scanProfile === "cve_api_validation" && !caller.isAdminLike) {
      return new Response(
        JSON.stringify({ error: "cve_api_validation is admin-only" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const normalized = normalizeTargetInput(target);

    // Simple rate limit: max 20 scans per user/hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rateRes = await adminClient
      .from("surface_scan_jobs" as any)
      .select("id", { count: "exact", head: true })
      .eq("requested_by", authData.user.id)
      .gte("created_at", oneHourAgo);

    if ((rateRes.count || 0) >= 20) {
      return new Response(
        JSON.stringify({ error: "Rate limit reached. Retry later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
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
            user_id: authData.user.id,
            action: "scan_auto_failed_timeout",
            details: { reason: "running_timeout_45m" },
          })),
        );
      }
    }

    // Max concurrent scans per tenant/customer
    const concurrentRes = await adminClient
      .from("surface_scan_jobs" as any)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", customerId)
      .in("status", ["pending", "queued", "running"]);

    if ((concurrentRes.count || 0) >= 3) {
      return new Response(
        JSON.stringify({ error: "Max concurrent scans reached (3). Try later." }),
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
        requested_by: authData.user.id,
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
      user_id: authData.user.id,
      action: "scan_created",
      details: {
        target: normalized.normalized_target,
        scan_profile: scanProfile,
        ownership_proof: body.ownership_proof || null,
      },
    });

    const runPromise = runSurfaceScanEnrichment(adminClient, jobData, {
      initiatedByUserId: authData.user.id,
      force: true,
    });
    const startedInBackground = enqueueBackgroundTask(runPromise.catch((error) => {
      console.error("[surfacescan360-start-scan] background enrichment error:", error);
    }));

    if (!startedInBackground) {
      await runPromise;
    }

    const { data: updatedJob } = await adminClient
      .from("surface_scan_jobs" as any)
      .select("id, status, created_at, started_at, completed_at, error_message")
      .eq("id", jobData.id)
      .single();

    return new Response(
      JSON.stringify({
        job_id: jobData.id,
        status: updatedJob?.status || "queued",
        normalized_target: normalized.normalized_target,
        execution_mode: startedInBackground ? "background" : "inline",
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
