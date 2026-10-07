import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from "../_shared/surface-scan-utils.ts";
import { runSurfaceScanEnrichment } from "../_shared/surface-scan-engine.ts";

interface RunEnrichmentRequest {
  job_id: string;
  force?: boolean;
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

    const body = (await req.json()) as RunEnrichmentRequest;
    const jobId = String(body?.job_id || "").trim();
    const force = Boolean(body?.force);
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
    if (!caller.isAdminLike) {
      return new Response(JSON.stringify({ error: "Only admin users can run enrichment" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!force && job.status === "running") {
      return new Response(JSON.stringify({ error: "Job is already running" }), {
        status: 409,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    await runSurfaceScanEnrichment(adminClient, job, {
      initiatedByUserId: authData.user.id,
      force,
    });

    const { data: updatedJob } = await adminClient
      .from("surface_scan_jobs" as any)
      .select("id, status, started_at, completed_at, error_message")
      .eq("id", jobId)
      .single();

    return new Response(JSON.stringify(updatedJob), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
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
