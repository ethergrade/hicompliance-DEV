import {
  json,
  requireUserContext,
} from "../_shared/hitrack-domotz.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const organizationId = String(body.organization_id || "").trim();
    const collectorIds = Array.isArray(body.collector_ids)
      ? body.collector_ids.map((value: unknown) => String(value))
      : null;
    if (!organizationId) {
      return json({ error: "missing_organization_id" }, 400);
    }

    const { admin } = await requireUserContext(req, organizationId, true);
    const { data, error } = await admin.rpc("hitrack_sync_now", {
      _organization_id: organizationId,
      _collector_ids: collectorIds,
    });
    if (error) throw error;

    return json({ queued_job_id: data });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : "sync_now_failed" }, 500);
  }
});
