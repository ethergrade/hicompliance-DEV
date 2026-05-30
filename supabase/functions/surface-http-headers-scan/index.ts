import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from "../_shared/surface-scan-utils.ts";
import { scanHttpSecurityHeaders } from "../_shared/httpHeadersScanner.ts";

type AssetInput = {
  asset_id?: string;
  asset_type: "domain" | "url";
  value: string;
};

type RequestBody = {
  scan_id: string;
  project_id: string;
  assets: AssetInput[];
};

const MAX_PARALLEL = 3;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const normalizeAssetValue = (value: string): string => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).toString().toLowerCase();
    } catch {
      return text.toLowerCase();
    }
  }
  try {
    return new URL(`https://${text}`).toString().toLowerCase();
  } catch {
    return text.toLowerCase();
  }
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const body = (await req.json()) as RequestBody;
    const scanId = String(body?.scan_id || "").trim();
    const projectId = String(body?.project_id || "").trim();
    const assets = Array.isArray(body?.assets) ? body.assets : [];

    if (!scanId || !projectId || assets.length === 0) {
      return jsonResponse({ ok: false, error: "scan_id, project_id and assets are required" }, 400);
    }

    const { data: job, error: jobError } = await adminClient
      .from("surface_scan_jobs" as any)
      .select("id, organization_id, customer_id, raw_target, normalized_target")
      .eq("id", scanId)
      .maybeSingle();

    if (jobError || !job) return jsonResponse({ ok: false, error: "Scan job not found" }, 404);

    const customerId = String(job.customer_id || job.organization_id || "").trim();
    if (!customerId) return jsonResponse({ ok: false, error: "Job customer scope missing" }, 500);

    const caller = await getCallerProfile(adminClient, authData.user.id);
    assertCustomerAccess(caller, customerId);
    if (!caller.isAdminLike) {
      return jsonResponse({ ok: false, error: "Only admin users can run this scanner" }, 403);
    }

    if (customerId !== projectId) {
      return jsonResponse({ ok: false, error: "project_id does not match scan scope" }, 403);
    }

    const { data: scopedAssets } = await adminClient
      .from("surface_assets" as any)
      .select("id, asset_value, asset_type")
      .eq("scan_job_id", scanId)
      .in("asset_type", ["domain", "subdomain", "url"]);

    const allowed = new Set<string>();
    for (const row of scopedAssets || []) {
      const value = normalizeAssetValue(String(row?.asset_value || ""));
      if (value) allowed.add(value);
    }
    const rawTarget = normalizeAssetValue(String(job.raw_target || ""));
    const normalizedTarget = normalizeAssetValue(String(job.normalized_target || ""));
    if (rawTarget) allowed.add(rawTarget);
    if (normalizedTarget) allowed.add(normalizedTarget);

    const acceptedAssets: AssetInput[] = [];
    const rejected: Array<{ asset_id?: string; value: string; reason: string }> = [];

    for (const asset of assets) {
      const value = normalizeAssetValue(String(asset?.value || ""));
      if (!value) {
        rejected.push({ asset_id: asset?.asset_id, value: String(asset?.value || ""), reason: "empty_value" });
        continue;
      }
      if (!allowed.has(value)) {
        rejected.push({ asset_id: asset?.asset_id, value, reason: "asset_out_of_scope" });
        continue;
      }
      acceptedAssets.push({
        asset_id: asset.asset_id,
        asset_type: asset.asset_type,
        value,
      });
    }

    const results: Array<Record<string, unknown>> = [];
    let failed = 0;

    const chunks: AssetInput[][] = [];
    for (let i = 0; i < acceptedAssets.length; i += MAX_PARALLEL) {
      chunks.push(acceptedAssets.slice(i, i + MAX_PARALLEL));
    }

    for (const batch of chunks) {
      const batchResults = await Promise.all(batch.map(async (asset) => {
        try {
          const report = await scanHttpSecurityHeaders(asset.value, 10_000);
          const { data: inserted } = await adminClient
            .from("surface_http_header_results" as any)
            .insert({
              organization_id: customerId,
              tenant_id: customerId,
              customer_id: customerId,
              scan_id: scanId,
              project_id: projectId,
              asset_id: asset.asset_id || null,
              asset_type: asset.asset_type,
              input_url: asset.value,
              normalized_url: report.normalizedUrl,
              final_url: report.finalUrl,
              status_code: report.statusCode,
              is_https: report.isHttps,
              response_time_ms: report.responseTimeMs,
              score: report.score,
              grade: report.grade,
              ok_count: report.summary.ok,
              weak_count: report.summary.weak,
              missing_count: report.summary.missing,
              high_impact_open_count: report.summary.highImpactOpen,
              raw_headers: report.rawHeaders,
              error_message: report.error || null,
              scanned_at: report.scannedAt,
            })
            .select("id")
            .maybeSingle();

          if (inserted?.id) {
            const findingPayload = report.findings.map((entry) => ({
              result_id: inserted.id,
              scan_id: scanId,
              project_id: projectId,
              organization_id: customerId,
              tenant_id: customerId,
              customer_id: customerId,
              asset_id: asset.asset_id || null,
              rule_id: entry.ruleId,
              header_name: entry.header,
              category: entry.category,
              severity: entry.severity,
              status: entry.status,
              weight: entry.weight,
              earned_points: entry.earnedPoints,
              actual_value: entry.actualValue,
              note: entry.note,
              description: entry.description,
              recommendation: entry.recommendation,
              evidence: entry.evidence || {},
            }));
            if (findingPayload.length > 0) {
              await adminClient.from("surface_http_header_findings" as any).insert(findingPayload);
            }
          }

          return {
            asset_id: asset.asset_id || null,
            url: asset.value,
            score: report.score,
            grade: report.grade,
            status_code: report.statusCode,
            final_url: report.finalUrl,
            ok: true,
          };
        } catch (error: any) {
          failed += 1;
          return {
            asset_id: asset.asset_id || null,
            url: asset.value,
            ok: false,
            error: String(error?.message || error || "scan_failed"),
          };
        }
      }));
      results.push(...batchResults);
    }

    return jsonResponse({
      ok: true,
      scanner: "surface-http-headers",
      scan_id: scanId,
      processed: acceptedAssets.length,
      failed,
      rejected,
      results,
    });
  } catch (error: any) {
    return jsonResponse({ ok: false, error: String(error?.message || error || "internal_error") }, 500);
  }
});
