import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildTaskRows, parseOrchestrationRequest } from "./orchestration.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const envEnabled = (name: string) =>
  /^(1|true|yes|on)$/i.test(String(Deno.env.get(name) || ""));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!envEnabled("DARKRISK_ORCHESTRATOR_V2")) {
    return json({ error: "darkrisk_orchestrator_v2_disabled" }, 503);
  }

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "server_configuration_error" }, 500);
  }

  const bearer = String(req.headers.get("Authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  ).trim();
  const isServiceRole = bearer === serviceRoleKey;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let actorId: string | null = null;
  let isSuperAdmin = false;
  let actorOrgId: string | null = null;
  let actorIsOrgAdmin = false;
  if (!isServiceRole) {
    if (!bearer) return json({ error: "unauthorized" }, 401);
    const publicApiKey = String(
      Deno.env.get("SUPABASE_ANON_KEY") ||
        Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    ).trim();
    if (!publicApiKey) {
      return json({ error: "server_configuration_error" }, 500);
    }
    const authClient = createClient(supabaseUrl, publicApiKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(
      bearer,
    );
    if (authError || !authData.user) {
      return json({ error: "unauthorized" }, 401);
    }
    actorId = authData.user.id;

    const [{ data: profile }, { data: roles }] = await Promise.all([
      admin.from("users").select("organization_id,user_type").eq(
        "auth_user_id",
        actorId,
      ).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", actorId),
    ]);
    actorOrgId = profile?.organization_id ?? null;
    actorIsOrgAdmin = String(profile?.user_type || "") === "admin";
    isSuperAdmin = (roles || []).some((row) =>
      String(row.role) === "super_admin"
    );
  }

  let parsed;
  try {
    parsed = parseOrchestrationRequest(
      await req.json().catch(() => ({})),
      String(req.headers.get("Idempotency-Key") || ""),
    );
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "invalid_request",
    }, 400);
  }

  if (parsed.mode === "extended" && !envEnabled("DARKRISK_IDENTITY_V2")) {
    return json({ error: "darkrisk_identity_v2_disabled" }, 503);
  }

  if (
    !isServiceRole && !isSuperAdmin &&
    !(actorIsOrgAdmin && actorOrgId === parsed.organizationId)
  ) {
    return json({ error: "forbidden" }, 403);
  }

  const requiredCapability = parsed.mode === "extended"
    ? "extended_identity"
    : "standard_monitor";
  const now = new Date().toISOString();
  const { data: grants, error: grantsError } = await admin
    .from("darkrisk_capability_grants")
    .select("id")
    .eq("organization_id", parsed.organizationId)
    .eq("capability", requiredCapability)
    .eq("enabled", true)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .limit(1);
  if (grantsError) return json({ error: "entitlement_lookup_failed" }, 500);
  if (!grants?.length) return json({ error: "capability_not_enabled" }, 403);

  const { data: scope, error: scopeError } = await admin
    .from("darkrisk_external_scope")
    .select("id,target_type,normalized_value")
    .eq("organization_id", parsed.organizationId)
    .eq("active", true)
    .eq("authorization_status", "approved")
    .order("created_at");
  if (scopeError) return json({ error: "scope_lookup_failed" }, 500);
  if (parsed.workflow === "scan" && (!scope?.length || scope.length > 4)) {
    return json({
      error: scope?.length ? "scope_limit_exceeded" : "scope_empty",
    }, 422);
  }

  const runRow = {
    organization_id: parsed.organizationId,
    tier: parsed.mode,
    mode: parsed.mode,
    status: "queued",
    trigger_type: parsed.triggerType,
    requested_by: actorId,
    plan_version: "2.0",
    idempotency_key: parsed.idempotencyKey,
    period_key: parsed.periodKey,
    scope_snapshot: scope || [],
    sources: parsed.workflow === "monthly_report"
      ? ["report"]
      : [parsed.mode === "extended" ? "intelx_leaks" : "intelx_search"],
  };
  let { data: run, error: runError } = await admin
    .from("darkrisk_scan_runs")
    .insert(runRow)
    .select("id,status,created_at")
    .single();

  if (runError?.code === "23505") {
    const existing = await admin.from("darkrisk_scan_runs")
      .select("id,status,created_at")
      .eq("organization_id", parsed.organizationId)
      .eq("idempotency_key", parsed.idempotencyKey)
      .single();
    run = existing.data;
    runError = existing.error;
  }
  if (runError || !run) return json({ error: "run_enqueue_failed" }, 500);

  const taskRows = buildTaskRows(parsed, run.id, scope || []);
  for (const taskRow of taskRows) {
    const { error: taskError } = await admin.from("darkrisk_scan_tasks").insert(
      taskRow,
    );
    if (taskError && taskError.code !== "23505") {
      return json({ error: "task_enqueue_failed", run_id: run.id }, 500);
    }
  }

  return json({ run_id: run.id, status: run.status, accepted: true }, 202);
});
