import {
  createAdminClient,
  json,
  requireInternalRequest,
} from "../_shared/hitrack-domotz.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    await requireInternalRequest(req);
    const admin = createAdminClient();
    const now = Date.now();
    const metricCutoff = new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString();
    const snapshotCutoff = new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString();
    const jobCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ error: metricsError }, { error: snapshotsError }, { error: jobsError }] =
      await Promise.all([
        admin.from("hitrack_metric_samples").delete().lt("sampled_at", metricCutoff),
        admin.from("hitrack_health_snapshots").delete().lt("sampled_at", snapshotCutoff),
        admin.from("hitrack_sync_jobs").delete().lt("updated_at", jobCutoff).in("status", ["completed", "failed"]),
      ]);

    if (metricsError) throw metricsError;
    if (snapshotsError) throw snapshotsError;
    if (jobsError) throw jobsError;

    return json({
      deleted_before: {
        metricCutoff,
        snapshotCutoff,
        jobCutoff,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : "retention_failed" }, 500);
  }
});
