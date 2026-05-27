import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from "../_shared/surface-scan-utils.ts";

interface GetStatusRequest {
  job_id: string;
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

    const body = (await req.json()) as GetStatusRequest;
    const jobId = String(body?.job_id || "").trim();
    if (!jobId) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: job, error: jobError } = await adminClient
      .from("surface_scan_jobs" as any)
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const caller = await getCallerProfile(adminClient, authData.user.id);
    const customerId = String(job?.customer_id || job?.organization_id || "").trim();
    if (!customerId) {
      return new Response(JSON.stringify({ error: "Job organization not found" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    assertCustomerAccess(caller, customerId);

    const [findingsRes, assetsRes, obsRes] = await Promise.all([
      adminClient
        .from("surface_findings" as any)
        .select("severity", { count: "exact", head: true })
        .eq("scan_job_id", jobId),
      adminClient
        .from("surface_assets" as any)
        .select("id", { count: "exact", head: true })
        .eq("scan_job_id", jobId),
      adminClient
        .from("surface_observations" as any)
        .select("id", { count: "exact", head: true })
        .eq("scan_job_id", jobId),
    ]);

    return new Response(
      JSON.stringify({
        id: job.id,
        status: job.status,
        scan_profile: job.scan_profile,
        target_type: job.target_type,
        raw_target: job.raw_target,
        normalized_target: job.normalized_target,
        hostname: job.hostname,
        root_domain: job.root_domain,
        resolved_ips: job.resolved_ips || [],
        hosting_context: job.hosting_context,
        shodan_status: job.shodan_status,
        scope_guard: job.scope_guard || {
          in_scope: 0,
          excluded_by_scope: 0,
          excluded_shared_noise: 0,
        },
        started_at: job.started_at,
        completed_at: job.completed_at,
        error_message: job.error_message,
        created_at: job.created_at,
        findings_count: findingsRes.count || 0,
        assets_count: assetsRes.count || 0,
        observations_count: obsRes.count || 0,
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
