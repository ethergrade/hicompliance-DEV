import {
  createAdminClient,
  json,
  requireInternalRequest,
} from "../_shared/hitrack-domotz.ts";
import { isStageModePaused } from '../_shared/stage-mode.ts';

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (await isStageModePaused()) return json({ ok: true, skipped: true, reason: 'stage_mode' });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    await requireInternalRequest(req);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("hitrack_schedule_sync_jobs", {
      _max_jobs: 100,
    });
    if (error) throw error;
    return json({ queued: data ?? 0 });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : "scheduler_failed" }, 500);
  }
});
