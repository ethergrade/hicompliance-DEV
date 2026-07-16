import {
  createAdminClient,
  json,
  requireInternalRequest,
  syncCollector,
  type HiTrackCollectorRow,
} from "../_shared/hitrack-domotz.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    await requireInternalRequest(req);
    const admin = createAdminClient();
    const workerId = `hitrack-worker:${crypto.randomUUID()}`;
    const { data: jobs, error: claimError } = await admin.rpc(
      "hitrack_claim_sync_jobs",
      {
        _worker_id: workerId,
        _job_limit: 5,
        _lease_seconds: 900,
      },
    );
    if (claimError) throw claimError;

    const results: Array<Record<string, unknown>> = [];
    for (const job of (jobs || []) as Array<Record<string, unknown>>) {
      const collectorId = String(job.collector_id || "");
      try {
        const { data: collector, error: collectorError } = await admin
          .from("hitrack_collectors")
          .select("id,organization_id,domotz_organization_id,domotz_agent_id,collector_name,collector_status,matching_rule")
          .eq("id", collectorId)
          .single();
        if (collectorError) throw collectorError;

        const summary = await syncCollector(
          admin,
          collector as HiTrackCollectorRow,
        );

        await admin.from("hitrack_sync_jobs").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          lease_owner: null,
          lease_expires_at: null,
          result_summary: summary,
          last_error_code: null,
          last_error_message: null,
        }).eq("id", String(job.id));

        results.push({
          jobId: job.id,
          status: "completed",
          collectorId,
          summary,
        });
      } catch (error) {
        await admin.from("hitrack_sync_jobs").update({
          status: "failed",
          completed_at: new Date().toISOString(),
          lease_owner: null,
          lease_expires_at: null,
          last_error_code: error instanceof Error ? error.message : "worker_failed",
          last_error_message: error instanceof Error ? error.stack || error.message : String(error),
        }).eq("id", String(job.id));
        results.push({
          jobId: job.id,
          status: "failed",
          collectorId,
          error: error instanceof Error ? error.message : "worker_failed",
        });
      }
    }

    return json({ claimed: (jobs || []).length, results });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : "worker_failed" }, 500);
  }
});
