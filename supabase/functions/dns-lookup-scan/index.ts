import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from "../_shared/surface-scan-utils.ts";
import {
  normalizeDomain,
  scanDnsLookup,
  type DnsLookupResult,
} from "../_shared/dnsLookupScanner.ts";

type RequestBody = {
  scan_id: string;
  asset_id?: string;
  tenant_id?: string;
  domain: string;
  options?: {
    includeEmailSecurityChecks?: boolean;
    includeDkimSelectorChecks?: boolean;
    includeWildcardCheck?: boolean;
  };
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

function summarizeBySeverity(findings: DnsLookupResult["findings"]) {
  const out = { high: 0, medium: 0, low: 0, critical: 0, info: 0 };
  for (const entry of findings) {
    if (entry.status === "pass") continue;
    if (entry.severity === "critical") out.critical += 1;
    else if (entry.severity === "high") out.high += 1;
    else if (entry.severity === "medium") out.medium += 1;
    else if (entry.severity === "low") out.low += 1;
    else out.info += 1;
  }
  return out;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const body = (await req.json()) as RequestBody;
    const scanId = String(body?.scan_id || "").trim();
    const domainInput = String(body?.domain || "").trim();
    if (!scanId || !domainInput) {
      return jsonResponse({ ok: false, error: "scan_id and domain are required" }, 400);
    }

    const normalizedDomain = normalizeDomain(domainInput);

    const { data: job, error: jobError } = await adminClient
      .from("surface_scan_jobs" as any)
      .select("id, organization_id, tenant_id, customer_id, raw_target, normalized_target")
      .eq("id", scanId)
      .maybeSingle();

    if (jobError || !job) return jsonResponse({ ok: false, error: "Scan job not found" }, 404);

    const customerId = String(job.customer_id || job.organization_id || job.tenant_id || "").trim();
    if (!customerId) return jsonResponse({ ok: false, error: "Job customer scope missing" }, 500);

    const caller = await getCallerProfile(adminClient, authData.user.id);
    assertCustomerAccess(caller, customerId);
    if (!caller.isAdminLike) {
      return jsonResponse({ ok: false, error: "Only admin users can run this scanner" }, 403);
    }

    const { data: scopedAssets } = await adminClient
      .from("surface_assets" as any)
      .select("asset_value, asset_type")
      .eq("scan_job_id", scanId)
      .in("asset_type", ["domain", "subdomain", "url"]);

    const allowed = new Set<string>();
    for (const row of scopedAssets || []) {
      const value = String(row?.asset_value || "").trim().toLowerCase();
      if (!value) continue;
      try {
        allowed.add(normalizeDomain(value));
      } catch {
        // ignore non-domain values
      }
    }

    for (const target of [job.raw_target, job.normalized_target]) {
      const value = String(target || "").trim().toLowerCase();
      if (!value) continue;
      try {
        allowed.add(normalizeDomain(value));
      } catch {
        // ignore
      }
    }

    if (!allowed.has(normalizedDomain)) {
      return jsonResponse({ ok: false, error: "Domain out of scope" }, 403);
    }

    const result = await scanDnsLookup({
      domain: normalizedDomain,
      resolverUrl: Deno.env.get("DNS_LOOKUP_RESOLVER_URL") || undefined,
      timeoutMs: Number(Deno.env.get("DNS_LOOKUP_TIMEOUT_MS") || 6000),
      includeEmailSecurityChecks: body.options?.includeEmailSecurityChecks ?? true,
      includeDkimSelectorChecks: body.options?.includeDkimSelectorChecks ?? false,
      includeWildcardCheck: body.options?.includeWildcardCheck ?? true,
      userAgent: "SurfaceScan360-DNSLookup/1.0",
    });

    const insertRes = await adminClient
      .from("surface_dns_lookup_results" as any)
      .insert({
        tenant_id: customerId,
        organization_id: customerId,
        customer_id: customerId,
        scan_id: scanId,
        asset_id: body.asset_id || null,
        domain: result.domain,
        normalized_domain: result.normalizedDomain,
        resolver: result.resolver,
        score: result.score,
        grade: result.grade,
        records: result.records as unknown as Record<string, unknown>,
        additional_records: result.additionalRecords as unknown as Record<string, unknown>,
        summary: result.summary as unknown as Record<string, unknown>,
        raw_result: result as unknown as Record<string, unknown>,
        duration_ms: result.durationMs,
        scanned_at: result.completedAt,
      })
      .select("id")
      .single();

    if (insertRes.error || !insertRes.data?.id) {
      return jsonResponse({ ok: false, error: "Failed to persist dns lookup result" }, 500);
    }

    const resultId = String(insertRes.data.id);
    const findingsPayload = result.findings.map((f) => ({
      tenant_id: customerId,
      organization_id: customerId,
      customer_id: customerId,
      dns_lookup_result_id: resultId,
      scan_id: scanId,
      asset_id: body.asset_id || null,
      domain: result.normalizedDomain,
      finding_key: f.id,
      category: f.category,
      severity: f.severity,
      status: f.status,
      title: f.title,
      description: f.description,
      evidence: (f.evidence || {}) as Record<string, unknown>,
      recommendation: f.recommendation,
      report_summary: f.reportSummary,
    }));

    if (findingsPayload.length > 0) {
      await adminClient.from("surface_dns_lookup_findings" as any).insert(findingsPayload);
    }

    const severity = summarizeBySeverity(result.findings);
    return jsonResponse({
      ok: true,
      result_id: resultId,
      domain: result.normalizedDomain,
      score: result.score,
      grade: result.grade,
      findings: result.findings.length,
      high: severity.high + severity.critical,
      medium: severity.medium,
      low: severity.low,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
