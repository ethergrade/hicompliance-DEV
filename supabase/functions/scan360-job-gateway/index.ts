import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/surface-scan-utils.ts";

const gatewayCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-nuclei-scan360-request-id, x-scan360-request-id`,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...gatewayCorsHeaders },
  });

const sanitizeRequestId = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return crypto.randomUUID();
  return raw.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 96) || crypto.randomUUID();
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: gatewayCorsHeaders });
  if (!["GET", "POST"].includes(req.method)) {
    return jsonResponse({ ok: false, error: "Method not allowed", phase: "gateway_method" }, 405);
  }

  let bodyText = "";
  let parsedBody: Record<string, unknown> = {};
  if (req.method === "GET") {
    const url = new URL(req.url);
    parsedBody = Object.fromEntries(url.searchParams.entries());
  } else {
    try {
      bodyText = await req.text();
      parsedBody = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return jsonResponse({ ok: false, error: "Malformed JSON", phase: "gateway_parse" }, 400);
    }
  }

  const requestId = sanitizeRequestId(
    req.headers.get("x-scan360-request-id") || req.headers.get("x-nuclei-scan360-request-id") || parsedBody.request_id,
  );
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (!supabaseUrl) {
    return jsonResponse({ request_id: requestId, ok: false, error: "SUPABASE_URL not configured", phase: "gateway_config" }, 503);
  }

  const authorization = req.headers.get("authorization") || "";
  const apiKey = req.headers.get("apikey") || anonKey;
  const internalSecret = req.headers.get("x-nuclei-scan360-internal-secret") || "";
  const startedAt = Date.now();

  try {
    const upstreamUrl = new URL(`${supabaseUrl}/functions/v1/nuclei-scan360`);
    if (req.method === "GET") {
      for (const [key, value] of Object.entries({ ...parsedBody, request_id: requestId })) {
        if (value !== undefined && value !== null) upstreamUrl.searchParams.set(key, String(value));
      }
    }
    const upstream = await fetch(upstreamUrl.toString(), {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": authorization,
        "apikey": apiKey,
        "x-nuclei-scan360-request-id": requestId,
        ...(internalSecret ? { "x-nuclei-scan360-internal-secret": internalSecret } : {}),
      },
      body: req.method === "POST" ? JSON.stringify({ ...parsedBody, request_id: requestId }) : undefined,
    });
    const responseText = await upstream.text();
    try {
      const payload = responseText ? JSON.parse(responseText) : { request_id: requestId, ok: upstream.ok };
      return jsonResponse({
        request_id: requestId,
        ok: upstream.ok,
        ...payload,
      }, upstream.status);
    } catch {
      return jsonResponse({
        request_id: requestId,
        ok: false,
        error: `Upstream returned non-JSON HTTP ${upstream.status}`,
        phase: "gateway_upstream_non_json",
        upstream_status: upstream.status,
        message: responseText.trim().slice(0, 500),
        duration_ms: Date.now() - startedAt,
      }, upstream.status >= 400 ? upstream.status : 502);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({
      event: "scan360_job_gateway",
      request_id: requestId,
      status: "error",
      duration_ms: Date.now() - startedAt,
      message,
    }));
    return jsonResponse({
      request_id: requestId,
      ok: false,
      error: message || "Gateway proxy failed",
      phase: "gateway_proxy",
      duration_ms: Date.now() - startedAt,
    }, 502);
  }
});
