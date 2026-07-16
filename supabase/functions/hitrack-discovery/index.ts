import {
  discoverCollectorCandidates,
  json,
  requireUserContext,
} from "../_shared/hitrack-domotz.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const organizationId = String(body.organization_id || "").trim();
    const organizationName = String(body.organization_name || "").trim();
    if (!organizationId || !organizationName) {
      return json({ error: "missing_discovery_payload" }, 400);
    }

    await requireUserContext(req, organizationId, true);
    const candidates = await discoverCollectorCandidates(organizationName);
    return json({
      organization_id: organizationId,
      organization_name: organizationName,
      candidates,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : "discovery_failed" }, 500);
  }
});
