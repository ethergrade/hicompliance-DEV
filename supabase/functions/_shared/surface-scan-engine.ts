import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import {
  fetchWithTimeout,
  normalizeTargetInput,
  resolveWithDnsOverHttps,
  toSeverity,
  TargetType,
} from "./surface-scan-utils.ts";

interface SurfaceScanJob {
  id: string;
  tenant_id: string | null;
  customer_id: string | null;
  requested_by: string | null;
  raw_target: string;
  normalized_target: string;
  target_type: TargetType;
  hostname: string | null;
  root_domain: string | null;
  resolved_ips: string[] | null;
  scan_profile: string;
  status: string;
}

interface RunOptions {
  initiatedByUserId?: string | null;
  force?: boolean;
}

interface FindingInput {
  provider?: string;
  module?: string;
  finding_type: string;
  title: string;
  description?: string;
  severity?: string;
  affected_asset?: string | null;
  affected_url?: string | null;
  ip?: string | null;
  port?: number | null;
  protocol?: string | null;
  cve?: string[] | null;
  cwe?: string[] | null;
  cvss?: number | null;
  epss?: number | null;
  cisa_kev?: boolean;
  remediation?: string | null;
  evidence?: Record<string, unknown>;
  attribution_confidence?: string;
  status?: string;
}

interface ObservationInput {
  module: string;
  observation_type: string;
  title: string;
  value: Record<string, unknown>;
  severity?: string;
  confidence?: string;
  asset_id?: string | null;
}

interface AssetInput {
  asset_type: string;
  asset_value: string;
  hostname?: string | null;
  root_domain?: string | null;
  ip?: string | null;
  source: string;
  confidence?: string;
  raw?: Record<string, unknown>;
}

function severityRank(severity: string): number {
  switch (toSeverity(severity)) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    default:
      return 1;
  }
}

function parseDmarcPolicy(record: string): string | null {
  const match = record.match(/(?:^|;)\s*p=([a-zA-Z]+)/i);
  return match?.[1]?.toLowerCase() || null;
}

function parseHostFromMxRecord(mx: string): string {
  const parts = mx.trim().split(/\s+/);
  return (parts.length > 1 ? parts[1] : parts[0]).replace(/\.$/, "");
}

function looksSensitivePath(path: string): boolean {
  const patterns = [
    "/admin",
    "/backup",
    "/old",
    "/private",
    "/wp-admin",
    "/.git",
    "/.env",
    "/test",
    "/staging",
  ];
  const lowered = path.toLowerCase();
  return patterns.some((p) => lowered.includes(p));
}

function isValidHostnameCandidate(value: string): boolean {
  const candidate = value.trim().toLowerCase().replace(/\.$/, "");
  if (!candidate || candidate.length > 253) return false;
  if (!candidate.includes(".")) return false;
  if (!/^[a-z0-9.-]+$/.test(candidate)) return false;
  return candidate.split(".").every((label) => label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"));
}

function buildIpv6PtrName(ipv6: string): string | null {
  const normalized = ipv6.trim().toLowerCase();
  if (!normalized) return null;
  const expanded = (() => {
    const parts = normalized.split("::");
    if (parts.length > 2) return null;
    const left = parts[0] ? parts[0].split(":").filter(Boolean) : [];
    const right = parts[1] ? parts[1].split(":").filter(Boolean) : [];
    if (left.length + right.length > 8) return null;
    const missing = 8 - (left.length + right.length);
    const full = [...left, ...Array(missing).fill("0"), ...right].map((chunk) => chunk.padStart(4, "0"));
    if (full.length !== 8) return null;
    return full.join("");
  })();

  if (!expanded || !/^[0-9a-f]{32}$/.test(expanded)) return null;
  return `${expanded.split("").reverse().join(".")}.ip6.arpa`;
}

export async function runSurfaceScanEnrichment(
  adminClient: SupabaseClient,
  job: SurfaceScanJob,
  options: RunOptions = {},
): Promise<void> {
  if (!job.customer_id) {
    throw new Error("Job customer_id mancante");
  }

  if (!options.force && ["running", "completed"].includes(job.status)) {
    return;
  }

  const parsedTarget = normalizeTargetInput(job.normalized_target);
  const hostname = parsedTarget.hostname || job.hostname || null;
  const rootDomain = parsedTarget.root_domain || job.root_domain || null;
  const targetUrl = parsedTarget.normalized_target;
  const seenAssetKeys = new Set<string>();
  const seenFindingKeys = new Set<string>();

  if (options.force) {
    await Promise.all([
      adminClient.from("surface_assets" as any).delete().eq("scan_job_id", job.id),
      adminClient.from("surface_observations" as any).delete().eq("scan_job_id", job.id),
      adminClient.from("surface_findings" as any).delete().eq("scan_job_id", job.id),
      adminClient.from("surface_external_intel" as any).delete().eq("scan_job_id", job.id),
    ]);
  }

  const insertObservation = async (input: ObservationInput) => {
    await adminClient.from("surface_observations" as any).insert({
      tenant_id: job.tenant_id,
      customer_id: job.customer_id,
      scan_job_id: job.id,
      asset_id: input.asset_id || null,
      module: input.module,
      observation_type: input.observation_type,
      title: input.title,
      value: input.value,
      severity: toSeverity(input.severity || "info"),
      confidence: input.confidence || "medium",
    });
  };

  const insertFinding = async (input: FindingInput) => {
    const findingKey = [
      input.provider || "surface_scan_engine",
      input.module || "generic",
      input.finding_type,
      input.title,
      input.affected_asset || "",
      input.affected_url || "",
      input.ip || "",
      String(input.port || ""),
    ]
      .join("|")
      .toLowerCase();

    if (seenFindingKeys.has(findingKey)) return;
    seenFindingKeys.add(findingKey);

    await adminClient.from("surface_findings" as any).insert({
      tenant_id: job.tenant_id,
      customer_id: job.customer_id,
      scan_job_id: job.id,
      provider: input.provider || "surface_scan_engine",
      module: input.module || "generic",
      finding_type: input.finding_type,
      title: input.title,
      description: input.description || null,
      severity: toSeverity(input.severity || "info"),
      affected_asset: input.affected_asset || null,
      affected_url: input.affected_url || null,
      ip: input.ip || null,
      port: input.port || null,
      protocol: input.protocol || null,
      cve: input.cve || null,
      cwe: input.cwe || null,
      cvss: input.cvss || null,
      epss: input.epss || null,
      cisa_kev: input.cisa_kev || false,
      remediation: input.remediation || null,
      evidence: input.evidence || {},
      attribution_confidence: input.attribution_confidence || "medium",
      status: input.status || "open",
    });
  };

  const insertAsset = async (input: AssetInput): Promise<string | null> => {
    const assetValue = String(input.asset_value || "").trim().toLowerCase();
    const assetKey = [input.asset_type, assetValue, input.source].join("|");
    if (!assetValue || seenAssetKeys.has(assetKey)) return null;
    seenAssetKeys.add(assetKey);

    const { data, error } = await adminClient
      .from("surface_assets" as any)
      .insert({
        tenant_id: job.tenant_id,
        customer_id: job.customer_id,
        scan_job_id: job.id,
        asset_type: input.asset_type,
        asset_value: input.asset_value,
        hostname: input.hostname || null,
        root_domain: input.root_domain || null,
        ip: input.ip || null,
        source: input.source,
        confidence: input.confidence || "medium",
        raw: input.raw || {},
      })
      .select("id")
      .single();

    if (error) return null;
    return data?.id || null;
  };

  const insertExternalIntel = async (
    provider: string,
    target: string,
    found: boolean,
    summary: Record<string, unknown>,
    rawResponse: Record<string, unknown>,
    confidence = "medium",
  ) => {
    await adminClient.from("surface_external_intel" as any).insert({
      tenant_id: job.tenant_id,
      customer_id: job.customer_id,
      scan_job_id: job.id,
      provider,
      target,
      found,
      summary,
      raw_response: rawResponse,
      confidence,
    });
  };

  const logAudit = async (action: string, details: Record<string, unknown>) => {
    await adminClient.from("surface_scan_audit_log" as any).insert({
      scan_job_id: job.id,
      user_id: options.initiatedByUserId || job.requested_by,
      action,
      details,
    });
  };

  await adminClient
    .from("surface_scan_jobs" as any)
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", job.id);

  await logAudit("scan_started", {
    scan_profile: job.scan_profile,
    target: job.normalized_target,
  });

  const discoveredIps = new Set<string>((job.resolved_ips || []).filter(Boolean));
  const discoveredHostnames = new Set<string>(hostname ? [hostname] : []);
  let hostingContext = "unknown";
  let shodanStatus = "unknown";

  const safeRun = async (moduleName: string, fn: () => Promise<void>) => {
    try {
      await fn();
      await logAudit("module_completed", { module: moduleName });
    } catch (error: any) {
      await insertObservation({
        module: moduleName,
        observation_type: "module_error",
        title: `Errore modulo ${moduleName}`,
        value: { error: error?.message || "Errore non gestito" },
        severity: "medium",
      });
      await logAudit("module_failed", { module: moduleName, error: error?.message || String(error) });
    }
  };

  const runDnsModule = async () => {
    if (!hostname || !rootDomain) return;
    const types = ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "CAA"];
    const records: Record<string, string[]> = {};
    for (const type of types) {
      records[type] = await resolveWithDnsOverHttps(hostname, type);
    }

    for (const ip of [...records.A, ...records.AAAA]) {
      discoveredIps.add(ip);
      await insertAsset({
        asset_type: "ip",
        asset_value: ip,
        hostname,
        root_domain: rootDomain,
        ip,
        source: "dns",
      });
    }

    for (const mx of records.MX) {
      const mxHost = parseHostFromMxRecord(mx);
      await insertAsset({
        asset_type: "mx_host",
        asset_value: mxHost,
        hostname: mxHost,
        root_domain: rootDomain,
        source: "dns",
        raw: { mx_raw: mx },
      });
    }

    for (const ns of records.NS) {
      await insertAsset({
        asset_type: "ns_host",
        asset_value: ns,
        hostname: ns,
        root_domain: rootDomain,
        source: "dns",
      });
    }

    await insertObservation({
      module: "dns",
      observation_type: "dns_records",
      title: "DNS records collected",
      value: records,
    });

    const hasIpRecords = records.A.length > 0 || records.AAAA.length > 0;
    if (!hasIpRecords) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_no_ip_record",
        severity: "low",
        title: "No A/AAAA record found",
        description: "Il dominio non espone record A o AAAA pubblici",
        affected_asset: hostname,
        remediation: "Verificare configurazione DNS pubblica del dominio",
      });
    }

    if (records.MX.length === 0) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_no_mx_record",
        severity: "info",
        title: "No MX record found",
        description: "Nessun record MX configurato",
        affected_asset: hostname,
      });
    }

    if (records.CAA.length === 0) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_no_caa_record",
        severity: "low",
        title: "No CAA record found",
        description: "Manca una policy CAA per limitare le CA autorizzate",
        affected_asset: hostname,
        remediation: "Aggiungere record CAA per controllare emissione certificati",
      });
    }

    const txtCombined = records.TXT.join(" ").toLowerCase();
    if (/password|secret|token|api[_-]?key/.test(txtCombined)) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_txt_leakage",
        severity: "low",
        title: "Suspicious TXT leakage pattern",
        description: "Record TXT con pattern potenzialmente sensibili",
        affected_asset: hostname,
        evidence: { txt_records: records.TXT },
        remediation: "Rimuovere dati sensibili dai record TXT pubblici",
      });
    }

    const spfRecords = records.TXT.filter((txt) => txt.toLowerCase().includes("v=spf1"));
    const dmarcRecords = await resolveWithDnsOverHttps(`_dmarc.${rootDomain}`, "TXT");
    const dmarcRecord = dmarcRecords.find((rec) => rec.toLowerCase().includes("v=dmarc1"));
    const dmarcPolicy = dmarcRecord ? parseDmarcPolicy(dmarcRecord) : null;
    const hasMx = records.MX.length > 0;

    if (hasMx && spfRecords.length === 0) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_missing",
        severity: "medium",
        title: "SPF missing with MX present",
        description: "Dominio con MX ma senza SPF",
        affected_asset: rootDomain,
        remediation: "Pubblicare un record SPF valido",
      });
    }

    if (hasMx && !dmarcRecord) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_dmarc_missing",
        severity: "medium",
        title: "DMARC missing with MX present",
        description: "Dominio con MX ma senza DMARC",
        affected_asset: rootDomain,
        remediation: "Pubblicare un record DMARC (v=DMARC1)",
      });
    }

    if (spfRecords.length > 1) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_multiple",
        severity: "medium",
        title: "Multiple SPF records found",
        description: "Sono presenti più record SPF, situazione non conforme",
        affected_asset: rootDomain,
        evidence: { spf_records: spfRecords },
      });
    }

    if (spfRecords.some((rec) => /\+all/i.test(rec))) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_permissive_all",
        severity: "high",
        title: "SPF too permissive (+all)",
        description: "Record SPF troppo permissivo",
        affected_asset: rootDomain,
        evidence: { spf_records: spfRecords },
        remediation: "Rimuovere +all e definire sorgenti autorizzate specifiche",
      });
    }

    if (spfRecords.some((rec) => /~all/i.test(rec))) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_softfail",
        severity: "low",
        title: "SPF softfail (~all)",
        description: "SPF in softfail: valutare hard-fail in ambienti maturi",
        affected_asset: rootDomain,
      });
    }

    if (dmarcPolicy === "none") {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_dmarc_policy_none",
        severity: "low",
        title: "DMARC policy is p=none",
        description: "DMARC in sola modalità monitor",
        affected_asset: rootDomain,
      });
    }

    const dkimSelectors = [
      "default",
      "google",
      "selector1",
      "selector2",
      "k1",
      "k2",
      "s1",
      "s2",
      "dkim",
      "mail",
    ];
    const dkimHits: string[] = [];
    for (const selector of dkimSelectors) {
      const dkim = await resolveWithDnsOverHttps(`${selector}._domainkey.${rootDomain}`, "TXT");
      if (dkim.length > 0) dkimHits.push(selector);
    }
    const bimiRecords = await resolveWithDnsOverHttps(`default._bimi.${rootDomain}`, "TXT");

    if (dkimHits.length === 0) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_no_common_dkim_selectors",
        severity: "info",
        title: "No common DKIM selectors found",
        description: "Nessun selector DKIM comune rilevato",
        affected_asset: rootDomain,
      });
    }

    if (bimiRecords.length === 0) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_bimi_missing",
        severity: "info",
        title: "BIMI record missing",
        description: "Record BIMI non trovato",
        affected_asset: rootDomain,
      });
    }

    await insertObservation({
      module: "mail_security",
      observation_type: "mail_security_summary",
      title: "Mail security posture",
      value: {
        has_mx: hasMx,
        spf_records: spfRecords,
        dmarc_records: dmarcRecords,
        dkim_selectors_found: dkimHits,
        bimi_records: bimiRecords,
      },
    });
  };

  const runHttpModules = async () => {
    const start = Date.now();
    const res = await fetchWithTimeout(targetUrl, { redirect: "follow" }, 12000);
    const responseTime = Date.now() - start;
    const headersObj = Object.fromEntries(res.headers.entries());
    const status = res.status;

    await insertObservation({
      module: "http_status",
      observation_type: "http_status",
      title: "HTTP status collected",
      value: {
        status,
        response_time_ms: responseTime,
        final_url: res.url,
        content_type: res.headers.get("content-type"),
        server: res.headers.get("server"),
        powered_by: res.headers.get("x-powered-by"),
        content_length: res.headers.get("content-length"),
      },
    });

    await insertObservation({
      module: "http_headers",
      observation_type: "http_headers",
      title: "HTTP headers collected",
      value: headersObj,
    });

    if (status >= 500) {
      await insertFinding({
        module: "http_status",
        finding_type: "http_5xx",
        severity: "medium",
        title: `HTTP ${status} detected`,
        description: "Endpoint restituisce errore server",
        affected_url: targetUrl,
      });
    } else if (status >= 400) {
      await insertFinding({
        module: "http_status",
        finding_type: "http_4xx",
        severity: "low",
        title: `HTTP ${status} detected`,
        description: "Endpoint restituisce errore client",
        affected_url: targetUrl,
      });
    }

    if (res.headers.get("server")) {
      await insertFinding({
        module: "http_headers",
        finding_type: "server_header_exposed",
        severity: "info",
        title: "Server header exposed",
        description: "Header Server visibile pubblicamente",
        affected_url: targetUrl,
      });
    }

    if (res.headers.get("x-powered-by")) {
      await insertFinding({
        module: "security_headers",
        finding_type: "x_powered_by_exposed",
        severity: "low",
        title: "X-Powered-By exposed",
        description: "Header X-Powered-By esposto",
        affected_url: targetUrl,
      });
    }

    const csp = res.headers.get("content-security-policy");
    const hsts = res.headers.get("strict-transport-security");
    const xcto = res.headers.get("x-content-type-options");
    const xfo = res.headers.get("x-frame-options");
    const referrer = res.headers.get("referrer-policy");
    const permissions = res.headers.get("permissions-policy");

    if (!csp) {
      await insertFinding({
        module: "security_headers",
        finding_type: "missing_csp",
        severity: "medium",
        title: "Missing Content-Security-Policy",
        remediation: "Aggiungere header CSP restrittivo",
        affected_url: targetUrl,
      });
    }

    if (parsedTarget.protocol === "https:" && !hsts) {
      await insertFinding({
        module: "hsts",
        finding_type: "missing_hsts",
        severity: "medium",
        title: "Missing HSTS",
        remediation: "Aggiungere Strict-Transport-Security",
        affected_url: targetUrl,
      });
    }

    if (hsts) {
      const maxAgeMatch = hsts.match(/max-age=(\d+)/i);
      const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 0;
      const includeSubdomains = /includesubdomains/i.test(hsts);
      const preload = /preload/i.test(hsts);

      await insertObservation({
        module: "hsts",
        observation_type: "hsts_analysis",
        title: "HSTS analyzed",
        value: {
          exists: true,
          max_age: maxAge,
          include_subdomains: includeSubdomains,
          preload,
        },
      });

      if (maxAge > 0 && maxAge < 15552000) {
        await insertFinding({
          module: "hsts",
          finding_type: "hsts_max_age_low",
          severity: "low",
          title: "HSTS max-age too low",
          affected_url: targetUrl,
        });
      }
      if (!includeSubdomains) {
        await insertFinding({
          module: "hsts",
          finding_type: "hsts_missing_include_subdomains",
          severity: "low",
          title: "HSTS includeSubDomains missing",
          affected_url: targetUrl,
        });
      }
      if (!preload) {
        await insertFinding({
          module: "hsts",
          finding_type: "hsts_missing_preload",
          severity: "info",
          title: "HSTS preload missing",
          affected_url: targetUrl,
        });
      }
    }

    if (!xcto) {
      await insertFinding({
        module: "security_headers",
        finding_type: "missing_x_content_type_options",
        severity: "low",
        title: "Missing X-Content-Type-Options",
        affected_url: targetUrl,
      });
    }
    if (!xfo && !(csp && /frame-ancestors/i.test(csp))) {
      await insertFinding({
        module: "security_headers",
        finding_type: "missing_framing_protection",
        severity: "low",
        title: "Missing anti-framing protection",
        affected_url: targetUrl,
      });
    }
    if (!referrer) {
      await insertFinding({
        module: "security_headers",
        finding_type: "missing_referrer_policy",
        severity: "low",
        title: "Missing Referrer-Policy",
        affected_url: targetUrl,
      });
    }
    if (!permissions) {
      await insertFinding({
        module: "security_headers",
        finding_type: "missing_permissions_policy",
        severity: "info",
        title: "Missing Permissions-Policy",
        affected_url: targetUrl,
      });
    }

    const setCookie = res.headers.get("set-cookie") || "";
    if (setCookie) {
      const cookieEntries = setCookie.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g);
      for (const cookie of cookieEntries) {
        const lower = cookie.toLowerCase();
        if (!/;\s*secure\b/.test(lower)) {
          await insertFinding({
            module: "security_headers",
            finding_type: "cookie_missing_secure",
            severity: "medium",
            title: "Cookie without Secure attribute",
            affected_url: targetUrl,
            evidence: { cookie },
          });
        }
        if (!/;\s*httponly\b/.test(lower)) {
          await insertFinding({
            module: "security_headers",
            finding_type: "cookie_missing_httponly",
            severity: "medium",
            title: "Cookie without HttpOnly attribute",
            affected_url: targetUrl,
            evidence: { cookie },
          });
        }
        if (!/;\s*samesite=/i.test(lower)) {
          await insertFinding({
            module: "security_headers",
            finding_type: "cookie_missing_samesite",
            severity: "low",
            title: "Cookie without SameSite attribute",
            affected_url: targetUrl,
            evidence: { cookie },
          });
        }
      }
    }
  };

  const runRobotsModule = async () => {
    if (!hostname) return;
    const robotsUrl = `https://${hostname}/robots.txt`;
    const res = await fetchWithTimeout(robotsUrl, {}, 10000);
    const body = await res.text();
    const disallowPaths = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^disallow:/i.test(line))
      .map((line) => line.replace(/^disallow:\s*/i, "").trim())
      .filter(Boolean);
    const sitemapEntries = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^sitemap:/i.test(line))
      .map((line) => line.replace(/^sitemap:\s*/i, "").trim())
      .filter(Boolean);

    await insertObservation({
      module: "robots",
      observation_type: "robots_txt",
      title: "Robots.txt analyzed",
      value: {
        exists: res.ok,
        status: res.status,
        disallow_paths: disallowPaths,
        sitemap_entries: sitemapEntries,
      },
    });

    const sensitive = disallowPaths.filter(looksSensitivePath);
    if (sensitive.length > 0) {
      await insertFinding({
        module: "robots",
        finding_type: "robots_sensitive_paths",
        severity: "low",
        title: "Robots.txt exposes sensitive-looking paths",
        description: "Sono presenti path sensibili in disallow",
        affected_asset: hostname,
        evidence: { sensitive_paths: sensitive },
      });
    }
  };

  const runSecurityTxtModule = async () => {
    if (!hostname) return;
    const urls = [`https://${hostname}/.well-known/security.txt`, `https://${hostname}/security.txt`];
    let found = false;
    let content = "";
    let usedUrl = "";

    for (const url of urls) {
      const res = await fetchWithTimeout(url, {}, 10000);
      if (res.ok) {
        content = await res.text();
        usedUrl = url;
        found = true;
        break;
      }
    }

    const extractField = (field: string) =>
      content
        .split("\n")
        .filter((line) => line.toLowerCase().startsWith(`${field.toLowerCase()}:`))
        .map((line) => line.split(":").slice(1).join(":").trim());

    const expires = extractField("Expires")[0] || null;
    const expiresDate = expires ? new Date(expires) : null;
    const isExpired = expiresDate ? expiresDate.getTime() < Date.now() : false;

    await insertObservation({
      module: "security_txt",
      observation_type: "security_txt",
      title: "Security.txt analyzed",
      value: {
        exists: found,
        source_url: usedUrl || null,
        contact: extractField("Contact"),
        expires,
        encryption: extractField("Encryption"),
        policy: extractField("Policy"),
        acknowledgments: extractField("Acknowledgments"),
      },
    });

    if (!found) {
      await insertFinding({
        module: "security_txt",
        finding_type: "security_txt_missing",
        severity: "info",
        title: "Missing security.txt",
        description: "File security.txt non trovato",
        affected_asset: hostname,
      });
    } else if (isExpired) {
      await insertFinding({
        module: "security_txt",
        finding_type: "security_txt_expired",
        severity: "low",
        title: "Expired security.txt",
        affected_asset: hostname,
      });
    }
  };

  const runSitemapModule = async () => {
    if (!hostname || !rootDomain) return;
    const sitemapUrl = `https://${hostname}/sitemap.xml`;
    const res = await fetchWithTimeout(sitemapUrl, {}, 10000);
    if (!res.ok) {
      await insertObservation({
        module: "sitemap",
        observation_type: "sitemap",
        title: "Sitemap unavailable",
        value: { exists: false, status: res.status, urls: [] },
      });
      return;
    }
    const body = await res.text();
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());

    await insertObservation({
      module: "sitemap",
      observation_type: "sitemap",
      title: "Sitemap analyzed",
      value: { exists: true, status: res.status, urls_count: urls.length, urls: urls.slice(0, 300) },
    });

    for (const discoveredUrl of urls.slice(0, 200)) {
      try {
        const parsed = new URL(discoveredUrl);
        if (parsed.hostname.endsWith(rootDomain)) {
          await insertAsset({
            asset_type: "url",
            asset_value: discoveredUrl,
            hostname: parsed.hostname,
            root_domain: rootDomain,
            source: "sitemap",
          });
        }
      } catch {
        // ignore invalid url entries
      }
    }
  };

  const runRedirectModule = async () => {
    let current = targetUrl;
    const chain: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 10; i++) {
      const res = await fetchWithTimeout(current, { redirect: "manual" }, 10000);
      const location = res.headers.get("location");
      const entry = {
        url: current,
        status: res.status,
        location,
        scheme: new URL(current).protocol,
        host: new URL(current).hostname,
      };
      chain.push(entry);
      if (!location || !(res.status >= 300 && res.status < 400)) break;
      current = new URL(location, current).toString();
    }

    await insertObservation({
      module: "redirect_chain",
      observation_type: "redirect_chain",
      title: "Redirect chain collected",
      value: { hops: chain, hops_count: chain.length },
    });

    if (chain.length > 3) {
      await insertFinding({
        module: "redirect_chain",
        finding_type: "redirect_chain_too_long",
        severity: "low",
        title: "Redirect chain is long",
        description: `Catena redirect con ${chain.length} hop`,
        affected_url: targetUrl,
      });
    }

    const mixedHttpInside = chain.some((hop, idx) => idx > 0 && String(hop.url).startsWith("http://"));
    if (mixedHttpInside) {
      await insertFinding({
        module: "redirect_chain",
        finding_type: "redirect_mixed_http",
        severity: "low",
        title: "Mixed HTTP redirect in chain",
        affected_url: targetUrl,
      });
    }

    const first = chain[0];
    if (first && String(first.url).startsWith("http://") && chain.length === 1) {
      await insertFinding({
        module: "redirect_chain",
        finding_type: "no_http_to_https_redirect",
        severity: "medium",
        title: "HTTP to HTTPS redirect missing",
        affected_url: String(first.url),
      });
    }

    if (rootDomain) {
      for (const hop of chain) {
        const hopHost = String(hop.host || "");
        if (hopHost && !hopHost.endsWith(rootDomain)) {
          await insertFinding({
            module: "redirect_chain",
            finding_type: "redirect_external_domain",
            severity: "info",
            title: "Redirect to unrelated external domain",
            affected_url: String(hop.url),
            evidence: hop,
          });
        }
      }
    }
  };

  const runReverseAndDumpsterModule = async () => {
    if (discoveredIps.size > 0) {
      const ptrResults: Record<string, string[]> = {};
      for (const ip of discoveredIps) {
        const reverseName = ip.includes(".")
          ? `${ip.split(".").reverse().join(".")}.in-addr.arpa`
          : buildIpv6PtrName(ip);
        if (!reverseName) continue;

        const ptr = await resolveWithDnsOverHttps(reverseName, "PTR");
        ptrResults[ip] = ptr;
        for (const ptrHost of ptr) {
          const normalizedPtr = ptrHost.trim().toLowerCase().replace(/\.$/, "");
          if (!isValidHostnameCandidate(normalizedPtr)) continue;
          discoveredHostnames.add(normalizedPtr);
          await insertAsset({
            asset_type: "reverse_dns_hostname",
            asset_value: normalizedPtr,
            hostname: normalizedPtr,
            root_domain: rootDomain,
            source: "reverse_dns",
            confidence: "low",
            raw: { ip },
          });
        }
      }
      await insertObservation({
        module: "reverse_dns",
        observation_type: "reverse_dns",
        title: "Reverse DNS lookup",
        value: ptrResults,
      });
    }

    if (rootDomain) {
      try {
        const crtRes = await fetchWithTimeout(
          `https://crt.sh/?q=%25.${encodeURIComponent(rootDomain)}&output=json`,
          {},
          15000,
        );
        if (crtRes.ok) {
          const payload = await crtRes.json();
          const rows = Array.isArray(payload) ? payload : [];
          const names = new Set<string>();
          let resolvedSubdomains = 0;
          let unresolvedSubdomains = 0;

          for (const row of rows.slice(0, 500)) {
            const nameValue = String(row?.name_value || "").trim();
            if (!nameValue) continue;
            for (const candidate of nameValue.split("\n")) {
              const normalized = candidate.trim().toLowerCase().replace(/\.$/, "");
              if (
                normalized.endsWith(rootDomain) &&
                !normalized.startsWith("*.") &&
                isValidHostnameCandidate(normalized)
              ) {
                names.add(normalized);
              }
            }
          }

          for (const sub of [...names].slice(0, 200)) {
            discoveredHostnames.add(sub);
            const [aRecords, aaaaRecords] = await Promise.all([
              resolveWithDnsOverHttps(sub, "A"),
              resolveWithDnsOverHttps(sub, "AAAA"),
            ]);
            const resolved = [...aRecords, ...aaaaRecords];
            if (resolved.length > 0) {
              resolvedSubdomains += 1;
            } else {
              unresolvedSubdomains += 1;
            }

            await insertAsset({
              asset_type: "subdomain",
              asset_value: sub,
              hostname: sub,
              root_domain: rootDomain,
              source: "certificate_transparency",
              confidence: resolved.length > 0 ? "high" : "low",
              raw: { resolved_ips: resolved.slice(0, 20) },
            });

            for (const ip of resolved.slice(0, 20)) {
              discoveredIps.add(ip);
              await insertAsset({
                asset_type: "ip",
                asset_value: ip,
                hostname: sub,
                root_domain: rootDomain,
                ip,
                source: "certificate_transparency_dns",
                confidence: "medium",
              });
            }
          }

          await insertObservation({
            module: "dns_dumpster_like",
            observation_type: "subdomain_discovery",
            title: "Certificate transparency subdomain discovery",
            value: {
              root_domain: rootDomain,
              subdomains_found: names.size,
              resolved_subdomains: resolvedSubdomains,
              unresolved_subdomains: unresolvedSubdomains,
              sample: [...names].slice(0, 50),
            },
          });
        }
      } catch {
        await insertObservation({
          module: "dns_dumpster_like",
          observation_type: "subdomain_discovery_error",
          title: "Subdomain discovery failed",
          value: { root_domain: rootDomain },
          severity: "low",
        });
      }
    }
  };

  const runShodanModule = async () => {
    const key = Deno.env.get("SHODAN_API_KEY");
    if (!key || discoveredIps.size === 0) {
      await insertExternalIntel("shodan", hostname || targetUrl, false, { configured: Boolean(key) }, {}, "low");
      return;
    }

    let exactHostMatch = false;
    let hostDataFound = false;
    let unrelatedHostCount = 0;

    for (const ip of [...discoveredIps].slice(0, 10)) {
      try {
        const shodanUrl = `https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}&minify=true`;
        const res = await fetchWithTimeout(shodanUrl, {}, 12000);
        if (!res.ok) continue;
        const payload = await res.json();
        hostDataFound = true;
        const hostnames = Array.isArray(payload?.hostnames) ? payload.hostnames.map((h: any) => String(h)) : [];
        const ports = Array.isArray(payload?.ports) ? payload.ports : [];
        const vulns = Array.isArray(payload?.vulns)
          ? payload.vulns.map((v: any) => String(v))
          : payload?.vulns && typeof payload.vulns === "object"
            ? Object.keys(payload.vulns)
            : [];
        const tags = Array.isArray(payload?.tags) ? payload.tags : [];

        for (const h of hostnames) discoveredHostnames.add(String(h).toLowerCase());

        const hostMatchForIp = hostname
          ? hostnames.some((h: string) => h.toLowerCase() === hostname.toLowerCase())
          : true;

        if (hostMatchForIp) {
          exactHostMatch = true;
        }

        const unrelatedOnThisIp = hostname
          ? hostnames.filter((h: string) => !h.toLowerCase().endsWith((rootDomain || "").toLowerCase())).length
          : 0;

        if (hostname) {
          unrelatedHostCount += unrelatedOnThisIp;
        }

        await insertExternalIntel(
          "shodan",
          ip,
          true,
          {
            ports_count: ports.length,
            vulns_count: vulns.length,
            hostnames_count: hostnames.length,
          },
          payload,
          exactHostMatch ? "high" : "medium",
        );

        if (vulns.length > 0) {
          const canAttributeVulns = hostMatchForIp && unrelatedOnThisIp <= 3 && hostingContext !== "shared_hosting";
          if (canAttributeVulns) {
            for (const cve of vulns.slice(0, 30)) {
              await insertFinding({
                provider: "shodan",
                module: "shodan",
                finding_type: "shodan_cve_signal",
                severity: "medium",
                title: `Shodan reports ${cve}`,
                description: "Segnale CVE proveniente da Shodan con attribuzione host plausibile",
                affected_asset: hostname || ip,
                ip,
                cve: [cve],
                evidence: {
                  ip,
                  hostnames,
                  ports: ports.slice(0, 50),
                  tags: tags.slice(0, 30),
                },
                attribution_confidence: "medium",
                remediation:
                  "Confermare versione servizio e validare vulnerabilità con scanner API autorizzato (Pentest-Tools)",
              });
            }
          } else {
            await insertObservation({
              module: "shodan",
              observation_type: "vuln_signal_unattributed",
              title: "Shodan vulnerability signal without strong attribution",
              value: {
                ip,
                vulns: vulns.slice(0, 50),
                host_match: hostMatchForIp,
                unrelated_hostnames: unrelatedOnThisIp,
              },
              severity: "info",
            });
          }
        }

        for (const port of ports.slice(0, 50)) {
          await insertAsset({
            asset_type: "open_port",
            asset_value: `${ip}:${port}`,
            hostname,
            root_domain: rootDomain,
            ip,
            source: "shodan",
            confidence: "medium",
            raw: { port },
          });
        }
      } catch {
        // ignore single host errors
      }
    }

    if (!hostDataFound) {
      shodanStatus = "not_found";
    } else if (exactHostMatch) {
      shodanStatus = "found_exact";
    } else if (unrelatedHostCount > 5) {
      shodanStatus = "stale_or_low_confidence";
    } else {
      shodanStatus = "found_ip_only";
    }

    if (unrelatedHostCount > 5) {
      hostingContext = "shared_hosting";
      await insertObservation({
        module: "shared_hosting_detector",
        observation_type: "hosting_context",
        title: "Shared hosting likely",
        value: { unrelated_hostnames_detected: unrelatedHostCount },
        severity: "info",
      });
    }
  };

  const runUrlscanModule = async () => {
    const apiKey = Deno.env.get("URLSCAN_API_KEY");
    if (!apiKey || !hostname) {
      await insertExternalIntel("urlscan", hostname || targetUrl, false, { configured: Boolean(apiKey) }, {}, "low");
      return;
    }

    // Lightweight lookup by domain, no forced submission in v1.
    const searchUrl = `https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(hostname)}&size=1`;
    const res = await fetchWithTimeout(searchUrl, { headers: { "API-Key": apiKey } }, 12000);
    if (!res.ok) {
      await insertExternalIntel("urlscan", hostname, false, { status: res.status }, {}, "low");
      return;
    }
    const payload = await res.json();
    const result = Array.isArray(payload?.results) ? payload.results[0] : null;
    await insertExternalIntel("urlscan", hostname, Boolean(result), { has_result: Boolean(result) }, payload, "medium");
    if (result?.verdicts?.overall?.malicious) {
      await insertFinding({
        provider: "urlscan",
        module: "urlscan",
        finding_type: "urlscan_malicious_verdict",
        severity: "high",
        title: "urlscan malicious verdict",
        description: "urlscan segnala il target come potenzialmente malevolo",
        affected_asset: hostname,
        evidence: { result },
      });
    }
  };

  const runPentestToolsModule = async () => {
    if (job.scan_profile !== "cve_api_validation") return;
    const apiKey = Deno.env.get("PENTESTTOOLS_API_KEY") || Deno.env.get("PENTEST_TOOLS_API_KEY");
    const apiBaseUrl = Deno.env.get("PENTESTTOOLS_API_BASE_URL") || "https://app.pentest-tools.com/api/v2";
    const pollIntervalMs = Math.max(1500, Number(Deno.env.get("PENTESTTOOLS_POLL_INTERVAL_MS") || 6000));
    const maxPolls = Math.max(1, Number(Deno.env.get("PENTESTTOOLS_MAX_POLLS") || 8));
    const outputPollEvery = Math.max(1, Number(Deno.env.get("PENTESTTOOLS_OUTPUT_EVERY_POLLS") || 2));
    const maxScanTimeMinutes = Math.min(1440, Math.max(1, Number(Deno.env.get("PENTESTTOOLS_MAX_SCAN_MINUTES") || 30)));
    const enableNetworkScanner = String(
      Deno.env.get("PENTESTTOOLS_ENABLE_NETWORK_SCANNER") || "false",
    ).toLowerCase() === "true";

    if (!apiKey) {
      await insertObservation({
        module: "pentest_tools",
        observation_type: "not_configured",
        title: "Pentest-Tools API key not configured",
        value: { configured: false },
        severity: "info",
      });
      return;
    }

    const terminalStatuses = new Set([
      "finished",
      "failed to start",
      "stopped",
      "timed out",
      "aborted",
      "vpn connection error",
      "auth failed",
      "connection error",
    ]);

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const riskToSeverity = (riskLevel: number | null | undefined) => {
      if (riskLevel === 4) return "critical";
      if (riskLevel === 3) return "high";
      if (riskLevel === 2) return "medium";
      if (riskLevel === 1) return "low";
      return "info";
    };

    const parseCwe = (value: unknown): string[] | null => {
      if (!value) return null;
      if (Array.isArray(value)) {
        const normalized = value
          .map((entry) => String(entry || "").trim())
          .filter(Boolean);
        return normalized.length > 0 ? normalized : null;
      }
      const stringValue = String(value).trim();
      if (!stringValue) return null;
      const extracted = stringValue
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter((entry) => /^CWE[-_ ]?\d+$/i.test(entry));
      if (extracted.length > 0) {
        return extracted.map((entry) => entry.toUpperCase().replace(/_/g, "-").replace(/\s+/g, "-"));
      }
      return [stringValue];
    };

    const parseJsonSafe = (value: string): unknown | null => {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    };

    const isTerminalStatus = (status: string | null | undefined) =>
      status ? terminalStatuses.has(status.toLowerCase()) : false;

    const requestPentest = async (
      path: string,
      init: RequestInit = {},
      timeoutMs = 25000,
      retryCount = 0,
    ): Promise<any> => {
      const url = `${apiBaseUrl}${path}`;
      const headers = new Headers(init.headers || {});
      headers.set("Authorization", `Bearer ${apiKey}`);
      headers.set("Accept", "application/json");
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const res = await fetchWithTimeout(url, { ...init, headers }, timeoutMs);
      if (res.status === 429 && retryCount < 2) {
        const retryAfterHeader = Number(res.headers.get("Retry-After") || "2");
        const waitMs = Number.isFinite(retryAfterHeader) ? retryAfterHeader * 1000 : 2000;
        await sleep(Math.max(waitMs, 1500));
        return requestPentest(path, init, timeoutMs, retryCount + 1);
      }

      const responseText = await res.text();
      const parsed = responseText ? parseJsonSafe(responseText) : null;
      const payload =
        parsed && typeof parsed === "object"
          ? parsed
          : responseText
            ? { raw: responseText }
            : {};

      if (!res.ok) {
        const apiMessage =
          typeof payload === "object" && payload
            ? String((payload as Record<string, unknown>)?.message || (payload as Record<string, unknown>)?.error || "").trim()
            : "";
        const error = new Error(apiMessage || `Pentest-Tools API error (${res.status})`) as Error & {
          status?: number;
          payload?: unknown;
        };
        error.status = res.status;
        error.payload = payload;
        throw error;
      }

      return payload;
    };

    const normalizePentestFindings = async (
      scanId: number,
      toolId: number,
      targetName: string,
      findings: Array<Record<string, unknown>>,
    ) => {
      for (const rawFinding of findings) {
        const finding = rawFinding || {};
        const cveList = Array.isArray(finding.cve)
          ? finding.cve.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
          : [];
        const cvssScore =
          typeof finding.cvssv3 === "number"
            ? Number(finding.cvssv3)
            : typeof finding.cvss === "number"
              ? Number(finding.cvss)
              : null;
        const riskLevel = typeof finding.risk_level === "number" ? finding.risk_level : null;
        const findingStatus = String(finding.status || "open").toLowerCase();

        await insertFinding({
          provider: "pentest_tools",
          module: `pentest_tool_${toolId}`,
          finding_type: String(finding.vuln_id || finding.name || "pentest_tools_finding"),
          title: String(finding.name || finding.vuln_description || "Pentest-Tools finding"),
          description: String(
            finding.vuln_description || finding.risk_description || "Finding generated by Pentest-Tools",
          ),
          severity: riskToSeverity(riskLevel),
          affected_asset: hostname || targetName,
          affected_url: parsedTarget.target_type === "url" ? targetName : targetUrl,
          ip:
            parsedTarget.target_type === "ipv4" || parsedTarget.target_type === "ipv6"
              ? parsedTarget.hostname
              : null,
          port: typeof finding.port === "number" ? finding.port : null,
          protocol: finding.protocol ? String(finding.protocol).toLowerCase() : null,
          cve: cveList.length > 0 ? cveList : null,
          cwe: parseCwe(finding.cwe),
          cvss: cvssScore,
          epss: typeof finding.epss_score === "number" ? Number(finding.epss_score) : null,
          cisa_kev: Boolean(finding.in_cisa_catalog),
          remediation: finding.recommendation ? String(finding.recommendation) : null,
          evidence: {
            scan_id: scanId,
            tool_id: toolId,
            vuln_id: finding.vuln_id || null,
            confirmed: finding.confirmed || null,
            verified: finding.verified || null,
            risk_level: finding.risk_level || null,
            vulnerability_evidence: finding.vuln_evidence || null,
            references: finding.references || null,
          },
          attribution_confidence: finding.confirmed ? "high" : "medium",
          status:
            findingStatus === "false_positive" ||
              findingStatus === "ignored" ||
              findingStatus === "fixed" ||
              findingStatus === "accepted"
              ? findingStatus
              : "open",
        });
      }
    };

    interface PlannedPentestScan {
      label: string;
      toolId: number;
      targetName: string;
      toolParams?: Record<string, unknown>;
    }

    interface StartedPentestScan {
      scanId: number;
      toolId: number;
      label: string;
      targetName: string;
      status: string;
      progress: number | null;
      statusMessage: string | null;
      outputFingerprint: string | null;
      outputCollected: boolean;
    }

    const normalizeOutputFingerprint = (outputType: string, outputData: Record<string, unknown>): string => {
      const findingsCount = Array.isArray(outputData?.findings) ? outputData.findings.length : 0;
      const subdomainsCount = Array.isArray(outputData?.subdomains) ? outputData.subdomains.length : 0;
      const domainsCount = Array.isArray(outputData?.domains) ? outputData.domains.length : 0;
      const portsCount = Array.isArray(outputData?.ports) ? outputData.ports.length : 0;
      return [outputType, findingsCount, subdomainsCount, domainsCount, portsCount].join("|");
    };

    const normalizePentestOutput = async (
      scan: StartedPentestScan,
      options: { allowPendingScanOutputErrors: boolean },
    ): Promise<boolean> => {
      let outputResponse: any;
      try {
        outputResponse = await requestPentest(`/scans/${scan.scanId}/output`, { method: "GET" });
      } catch (error: any) {
        const statusCode = Number(error?.status || 0);
        if (
          options.allowPendingScanOutputErrors &&
          (statusCode === 404 || statusCode === 409 || String(error?.message || "").toLowerCase().includes("not finished"))
        ) {
          return false;
        }
        throw error;
      }

      const output = outputResponse?.data || {};
      const outputType = String(output?.output_type || "").trim();
      const outputData = (output?.output_data || {}) as Record<string, unknown>;
      if (!outputType) return false;

      const fingerprint = normalizeOutputFingerprint(outputType, outputData);
      if (scan.outputFingerprint === fingerprint) {
        return false;
      }
      scan.outputFingerprint = fingerprint;

      await insertExternalIntel(
        "pentest_tools_output",
        scan.targetName,
        true,
        {
          scan_id: scan.scanId,
          tool_id: scan.toolId,
          output_type: outputType,
          status: scan.status,
        },
        output,
        "high",
      );

      if (outputType === "finding_list") {
        const findings = Array.isArray(outputData?.findings) ? outputData.findings : [];
        if (findings.length > 0) {
          await normalizePentestFindings(scan.scanId, scan.toolId, scan.targetName, findings);
          scan.outputCollected = true;
        }
        return true;
      }

      if (outputType === "subdomain_list") {
        const subdomains = Array.isArray(outputData?.subdomains) ? outputData.subdomains : [];
        for (const entry of subdomains.slice(0, 500)) {
          const host = String((entry as Record<string, unknown>)?.hostname || "").trim().toLowerCase();
          const ip = String((entry as Record<string, unknown>)?.ip_address || "").trim();
          if (host) {
            await insertAsset({
              asset_type: "subdomain",
              asset_value: host,
              hostname: host,
              root_domain: rootDomain,
              source: "pentest_tools_subdomain_finder",
              confidence: (entry as Record<string, unknown>)?.resolved === false ? "low" : "medium",
              raw: (entry as Record<string, unknown>) || {},
            });
          }
          if (ip) {
            discoveredIps.add(ip);
            await insertAsset({
              asset_type: "ip",
              asset_value: ip,
              hostname: host || hostname,
              root_domain: rootDomain,
              ip,
              source: "pentest_tools_subdomain_finder",
              confidence: "medium",
              raw: (entry as Record<string, unknown>) || {},
            });
          }
        }
        scan.outputCollected = true;
        return true;
      }

      if (outputType === "domain_list") {
        const domains = Array.isArray(outputData?.domains) ? outputData.domains : [];
        for (const entry of domains.slice(0, 500)) {
          const domainCandidate = String(
            (entry as Record<string, unknown>)?.domain ||
              (entry as Record<string, unknown>)?.hostname ||
              "",
          )
            .trim()
            .toLowerCase();
          if (!domainCandidate) continue;
          await insertAsset({
            asset_type: "domain",
            asset_value: domainCandidate,
            hostname: domainCandidate,
            root_domain: rootDomain,
            source: "pentest_tools_domain_finder",
            confidence: "low",
            raw: (entry as Record<string, unknown>) || {},
          });
        }
        scan.outputCollected = true;
        return true;
      }

      if (outputType === "port_scanner") {
        const ipAddress = String(outputData?.ip_address || parsedTarget.hostname || "").trim();
        const hostnames = Array.isArray(outputData?.hostnames) ? outputData.hostnames : [];
        for (const reverseHost of hostnames.slice(0, 200)) {
          const reverseHostValue = String(reverseHost || "").trim().toLowerCase();
          if (!reverseHostValue) continue;
          await insertAsset({
            asset_type: "reverse_dns_hostname",
            asset_value: reverseHostValue,
            hostname: reverseHostValue,
            root_domain: rootDomain,
            source: "pentest_tools_port_scanner",
            confidence: "low",
            raw: { ip: ipAddress || null },
          });
        }

        const ports = Array.isArray(outputData?.ports) ? outputData.ports : [];
        for (const portEntry of ports.slice(0, 500)) {
          const portData = portEntry as Record<string, unknown>;
          const port = typeof portData?.number === "number" ? portData.number : null;
          const state = String(portData?.state || "").toLowerCase();
          if (!port || state !== "open") continue;
          await insertAsset({
            asset_type: "open_port",
            asset_value: `${ipAddress}:${port}`,
            hostname,
            root_domain: rootDomain,
            ip: ipAddress || null,
            source: "pentest_tools_port_scanner",
            confidence: "medium",
            raw: portData,
          });
        }
        scan.outputCollected = true;
        return true;
      }

      if (outputType === "waf_results") {
        await insertObservation({
          module: "pentest_tools",
          observation_type: "waf_results",
          title: "Pentest-Tools WAF detector output",
          value: outputData,
          severity: "info",
        });
        scan.outputCollected = true;
        return true;
      }

      await insertObservation({
        module: "pentest_tools",
        observation_type: "scan_output",
        title: `Pentest-Tools output (${scan.label})`,
        value: {
          scan_id: scan.scanId,
          tool_id: scan.toolId,
          output_type: outputType,
          output_data: outputData,
        },
        severity: "info",
      });
      scan.outputCollected = true;
      return true;
    };

    const plannedScans: PlannedPentestScan[] = [];
    if (parsedTarget.target_type === "domain" || parsedTarget.target_type === "subdomain" || parsedTarget.target_type === "url") {
      plannedScans.push(
        {
          label: "website_recon",
          toolId: 310,
          targetName: targetUrl,
        },
        {
          label: "website_scanner",
          toolId: 170,
          targetName: targetUrl,
          toolParams: { scan_type: "light" },
        },
        {
          label: "ssl_scanner",
          toolId: 450,
          targetName: hostname || targetUrl,
          toolParams: { preset: "light" },
        },
      );
    }

    if (parsedTarget.target_type === "ipv4" || parsedTarget.target_type === "ipv6") {
      if (hostingContext === "shared_hosting") {
        await insertObservation({
          module: "pentest_tools",
          observation_type: "ip_scan_skipped_shared_hosting",
          title: "Pentest-Tools IP scan skipped on shared hosting",
          value: {
            target: parsedTarget.hostname,
            hosting_context: hostingContext,
          },
          severity: "info",
        });
      } else {
        plannedScans.push({
          label: "port_scanner",
          toolId: 70,
          targetName: parsedTarget.hostname || targetUrl,
          toolParams: {
            scan_type: "light",
            protocol: "tcp",
            check_alive: true,
          },
        });

        if (enableNetworkScanner) {
          plannedScans.push({
            label: "network_scanner",
            toolId: 350,
            targetName: parsedTarget.hostname || targetUrl,
            toolParams: {
              preset: "light",
              protocol_type: "tcp",
              check_alive: true,
            },
          });
        }
      }
    }

    if (plannedScans.length === 0) {
      await insertObservation({
        module: "pentest_tools",
        observation_type: "no_eligible_tools",
        title: "No eligible Pentest-Tools scans for target type",
        value: {
          target_type: parsedTarget.target_type,
          hosting_context: hostingContext,
        },
        severity: "info",
      });
      return;
    }

    const startedScans: StartedPentestScan[] = [];

    for (const planned of plannedScans) {
      try {
        const startPayload: Record<string, unknown> = {
          tool_id: planned.toolId,
          target_name: planned.targetName,
          max_scan_time: maxScanTimeMinutes,
        };
        if (planned.toolParams) {
          startPayload.tool_params = planned.toolParams;
        }

        if (planned.toolId === 170 || planned.toolId === 310) {
          startPayload.scan_original_url = true;
          startPayload.redirect_level = "same_domain";
        }

        const startResponse = await requestPentest("/scans", {
          method: "POST",
          body: JSON.stringify(startPayload),
        });
        const scanId = Number(startResponse?.data?.created_id);
        if (!Number.isFinite(scanId)) {
          throw new Error("Pentest-Tools start response missing created_id");
        }

        startedScans.push({
          scanId,
          toolId: planned.toolId,
          label: planned.label,
          targetName: planned.targetName,
          status: "waiting",
          progress: 0,
          statusMessage: null,
          outputFingerprint: null,
          outputCollected: false,
        });

        await insertExternalIntel(
          "pentest_tools_scan",
          planned.targetName,
          true,
          {
            scan_id: scanId,
            tool_id: planned.toolId,
            label: planned.label,
            status: "started",
          },
          startResponse,
          "high",
        );
      } catch (error: any) {
        await insertObservation({
          module: "pentest_tools",
          observation_type: "scan_start_failed",
          title: `Pentest-Tools start failed (${planned.label})`,
          value: {
            tool_id: planned.toolId,
            target_name: planned.targetName,
            error: error?.message || String(error),
          },
          severity: "medium",
        });
      }
    }

    if (startedScans.length === 0) {
      await insertObservation({
        module: "pentest_tools",
        observation_type: "scan_start_failed_all",
        title: "All Pentest-Tools scan starts failed",
        value: {
          planned_scans: plannedScans.map((scan) => ({
            label: scan.label,
            tool_id: scan.toolId,
            target: scan.targetName,
          })),
        },
        severity: "medium",
      });
      return;
    }

    for (let pollIndex = 0; pollIndex < maxPolls; pollIndex++) {
      for (const scan of startedScans) {
        if (!isTerminalStatus(scan.status)) {
          try {
            const statusResponse = await requestPentest(`/scans/${scan.scanId}`, { method: "GET" });
            const statusData = statusResponse?.data || {};
            scan.status = String(statusData.status_name || "unknown");
            scan.progress = typeof statusData.progress === "number" ? statusData.progress : null;
            scan.statusMessage = statusData.status_message ? String(statusData.status_message) : null;
          } catch (error: any) {
            scan.status = "connection error";
            scan.statusMessage = error?.message || String(error);
          }
        }

        const statusNormalized = scan.status.toLowerCase();
        const shouldFetchOutput =
          statusNormalized === "finished" ||
          (!isTerminalStatus(scan.status) && pollIndex % outputPollEvery === 0);

        if (!shouldFetchOutput) continue;
        try {
          await normalizePentestOutput(scan, {
            allowPendingScanOutputErrors: statusNormalized !== "finished",
          });
        } catch (error: any) {
          if (statusNormalized === "finished") {
            await insertObservation({
              module: "pentest_tools",
              observation_type: "output_fetch_failed",
              title: `Pentest-Tools output retrieval failed (${scan.label})`,
              value: {
                scan_id: scan.scanId,
                tool_id: scan.toolId,
                status: scan.status,
                error: error?.message || String(error),
              },
              severity: "medium",
            });
          }
        }
      }

      const allTerminal = startedScans.every((scan) => isTerminalStatus(scan.status));
      if (allTerminal) break;
      await sleep(pollIntervalMs);
    }

    for (const scan of startedScans) {
      const terminal = isTerminalStatus(scan.status);
      const success = scan.status.toLowerCase() === "finished";

      await insertObservation({
        module: "pentest_tools",
        observation_type: "scan_status",
        title: `Pentest-Tools ${scan.label} status`,
        value: {
          scan_id: scan.scanId,
          tool_id: scan.toolId,
          target: scan.targetName,
          status: scan.status,
          progress: scan.progress,
          status_message: scan.statusMessage,
          terminal,
          output_collected: scan.outputCollected,
        },
        severity: success ? "info" : terminal ? "medium" : "low",
      });

      await insertExternalIntel(
        "pentest_tools_status",
        scan.targetName,
        success,
        {
          scan_id: scan.scanId,
          tool_id: scan.toolId,
          status: scan.status,
          progress: scan.progress,
          output_collected: scan.outputCollected,
        },
        {
          status_message: scan.statusMessage,
          terminal,
        },
        success ? "high" : terminal ? "medium" : "low",
      );

      if (success && !scan.outputCollected) {
        try {
          await normalizePentestOutput(scan, { allowPendingScanOutputErrors: false });
        } catch (error: any) {
          await insertObservation({
            module: "pentest_tools",
            observation_type: "output_fetch_failed",
            title: `Pentest-Tools output retrieval failed (${scan.label})`,
            value: {
              scan_id: scan.scanId,
              tool_id: scan.toolId,
              status: scan.status,
              error: error?.message || String(error),
            },
            severity: "medium",
          });
        }
      }
    }

    const nonTerminalScans = startedScans
      .filter((scan) => !isTerminalStatus(scan.status))
      .map((scan) => ({
        scan_id: scan.scanId,
        tool_id: scan.toolId,
        label: scan.label,
        status: scan.status,
        progress: scan.progress,
      }));

    if (nonTerminalScans.length > 0) {
      await insertObservation({
        module: "pentest_tools",
        observation_type: "scan_still_running",
        title: "Pentest-Tools scans still running after polling window",
        value: {
          scans: nonTerminalScans,
          note: "Risultati parziali già normalizzati ove disponibili; rieseguire enrichment per aggiornamento finale.",
        },
        severity: "low",
      });
    }
  };

  const runSafeRecon = async () => {
    await safeRun("dns", runDnsModule);
    await safeRun("http", runHttpModules);
    await safeRun("robots", runRobotsModule);
    await safeRun("security_txt", runSecurityTxtModule);
    await safeRun("sitemap", runSitemapModule);
    await safeRun("redirect_chain", runRedirectModule);
  };

  try {
    await runSafeRecon();

    if (["domain_exposure", "ip_exposure", "cve_api_validation"].includes(job.scan_profile)) {
      await safeRun("reverse_dns_and_dumpster", runReverseAndDumpsterModule);
      await safeRun("shodan", runShodanModule);
    }

    if (["domain_exposure", "cve_api_validation"].includes(job.scan_profile)) {
      await safeRun("urlscan", runUrlscanModule);
    }

    if (job.scan_profile === "cve_api_validation") {
      await safeRun("pentest_tools", runPentestToolsModule);
    }

    // Hosting context derivation fallback
    if (hostingContext === "unknown") {
      const hostnames = [...discoveredHostnames];
      const unrelated = rootDomain
        ? hostnames.filter((h) => !h.toLowerCase().endsWith(rootDomain.toLowerCase())).length
        : 0;
      if (unrelated > 8) hostingContext = "shared_hosting";
      if (hostnames.some((h) => /cloudflare|akamai|fastly/i.test(h))) hostingContext = "cdn_proxy";
      if (hostingContext === "unknown" && discoveredIps.size > 0 && unrelated <= 1) hostingContext = "dedicated";
    }

    const severityAgg = await adminClient
      .from("surface_findings" as any)
      .select("severity")
      .eq("scan_job_id", job.id);
    const highestSeverity = ((severityAgg.data || []) as Array<{ severity: string }>)
      .map((row) => row.severity)
      .sort((a, b) => severityRank(b) - severityRank(a))[0] || "info";

    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        resolved_ips: [...discoveredIps],
        hosting_context: hostingContext,
        shodan_status: shodanStatus,
      })
      .eq("id", job.id);

    await logAudit("scan_completed", {
      findings_count: (severityAgg.data || []).length,
      highest_severity: highestSeverity,
      hosting_context: hostingContext,
      shodan_status: shodanStatus,
    });
  } catch (error: any) {
    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error?.message || "Enrichment failed",
      })
      .eq("id", job.id);

    await logAudit("scan_failed", {
      error: error?.message || String(error),
    });

    throw error;
  }
}
