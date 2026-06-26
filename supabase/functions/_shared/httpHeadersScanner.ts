/**
 * SurfaceScan360 - HTTP Security Headers Scanner
 * TypeScript port inspired by the educational Python http_headers_scanner.py.
 * Designed for Supabase Edge Functions / Deno runtime.
 */

export type HeaderSeverity = "critical" | "high" | "medium" | "low";
export type HeaderStatus = "ok" | "weak" | "missing" | "error";

export interface HeaderRule {
  id: string;
  header: string;
  severity: HeaderSeverity;
  weight: number;
  category: "transport" | "content-isolation" | "privacy" | "browser-hardening";
  description: string;
  recommendation: string;
  required?: boolean;
  evaluate?: (value: string | null, headers: Record<string, string>) => HeaderEvaluation;
}

export interface HeaderEvaluation {
  status: HeaderStatus;
  note: string;
  actualValue: string | null;
  evidence?: Record<string, unknown>;
}

export interface HeaderFinding extends HeaderEvaluation {
  ruleId: string;
  header: string;
  severity: HeaderSeverity;
  weight: number;
  category: HeaderRule["category"];
  description: string;
  recommendation: string;
  earnedPoints: number;
}

export interface HttpHeaderScanReport {
  scanner: "surface-http-headers";
  scannerVersion: string;
  inputUrl: string;
  normalizedUrl: string;
  finalUrl: string | null;
  statusCode: number | null;
  isHttps: boolean;
  responseTimeMs: number;
  scannedAt: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: {
    totalRules: number;
    ok: number;
    weak: number;
    missing: number;
    highImpactOpen: number;
  };
  findings: HeaderFinding[];
  rawHeaders: Record<string, string>;
  error?: string;
}

const SCANNER_VERSION = "1.0.0";
const DEFAULT_TIMEOUT_MS = 10_000;

const SAFE_REFERRER_POLICIES = new Set([
  "no-referrer",
  "same-origin",
  "strict-origin",
  "strict-origin-when-cross-origin",
]);

function normalizeHeaderMap(headers: Headers | Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = String(value);
  }
  return out;
}

function getHeader(headers: Record<string, string>, headerName: string): string | null {
  return headers[headerName.toLowerCase()] ?? null;
}

function containsToken(value: string, token: string): boolean {
  return value.toLowerCase().split(/[;,\s]+/).includes(token.toLowerCase());
}

function evaluatePresence(value: string | null): HeaderEvaluation {
  if (!value) return { status: "missing", note: "Header non presente", actualValue: null };
  return { status: "ok", note: "Header presente", actualValue: value };
}

function evaluateHsts(value: string | null, _headers: Record<string, string>): HeaderEvaluation {
  if (!value) {
    return { status: "missing", note: "HSTS non presente", actualValue: null };
  }

  const maxAgeMatch = value.match(/max-age\s*=\s*(\d+)/i);
  if (!maxAgeMatch) {
    return { status: "weak", note: "HSTS presente ma senza max-age valido", actualValue: value };
  }

  const maxAge = Number(maxAgeMatch[1]);
  if (!Number.isFinite(maxAge) || maxAge <= 0) {
    return { status: "weak", note: "HSTS disabilitato o max-age non positivo", actualValue: value, evidence: { maxAge } };
  }

  if (maxAge < 15_552_000) {
    return {
      status: "weak",
      note: "HSTS presente ma max-age inferiore a 180 giorni",
      actualValue: value,
      evidence: { maxAge },
    };
  }

  const hasIncludeSubDomains = /(?:^|;)\s*includeSubDomains\s*(?:;|$)/i.test(value);
  if (!hasIncludeSubDomains) {
    return {
      status: "weak",
      note: "HSTS valido ma senza includeSubDomains",
      actualValue: value,
      evidence: { maxAge, includeSubDomains: false },
    };
  }

  return {
    status: "ok",
    note: "HSTS valido con max-age e includeSubDomains",
    actualValue: value,
    evidence: { maxAge, includeSubDomains: true, preload: /(?:^|;)\s*preload\s*(?:;|$)/i.test(value) },
  };
}

function evaluateCsp(value: string | null): HeaderEvaluation {
  if (!value) return { status: "missing", note: "Content-Security-Policy non presente", actualValue: null };

  const lower = value.toLowerCase();
  const issues: string[] = [];
  if (!/(^|;)\s*(default-src|script-src)\s+/i.test(value)) issues.push("manca default-src/script-src");
  if (lower.includes("'unsafe-inline'")) issues.push("usa unsafe-inline");
  if (lower.includes("'unsafe-eval'")) issues.push("usa unsafe-eval");
  if (!/(^|;)\s*object-src\s+('none'|none)/i.test(value)) issues.push("manca object-src 'none'");
  if (!/(^|;)\s*base-uri\s+('none'|'self'|none|self)/i.test(value)) issues.push("manca base-uri restrittivo");

  if (issues.length > 0) {
    return {
      status: "weak",
      note: `CSP presente ma migliorabile: ${issues.join(", ")}`,
      actualValue: value,
      evidence: { issues },
    };
  }

  return { status: "ok", note: "CSP presente con direttive minime robuste", actualValue: value };
}

function evaluateXContentTypeOptions(value: string | null): HeaderEvaluation {
  if (!value) return { status: "missing", note: "X-Content-Type-Options non presente", actualValue: null };
  if (value.trim().toLowerCase() === "nosniff") {
    return { status: "ok", note: "nosniff configurato", actualValue: value };
  }
  return { status: "weak", note: "Valore diverso da nosniff", actualValue: value };
}

function evaluateFrameProtection(value: string | null, headers: Record<string, string>): HeaderEvaluation {
  const csp = getHeader(headers, "content-security-policy");
  const hasFrameAncestors = !!csp && /(?:^|;)\s*frame-ancestors\s+/i.test(csp);
  if (hasFrameAncestors) {
    return { status: "ok", note: "Protezione frame gestita da CSP frame-ancestors", actualValue: value, evidence: { cspFrameAncestors: true } };
  }
  if (!value) return { status: "missing", note: "X-Frame-Options assente e CSP frame-ancestors non presente", actualValue: null };
  const normalized = value.trim().toUpperCase();
  if (normalized === "DENY" || normalized === "SAMEORIGIN") {
    return { status: "ok", note: `X-Frame-Options valido: ${normalized}`, actualValue: value };
  }
  return { status: "weak", note: "Valore X-Frame-Options non raccomandato", actualValue: value };
}

function evaluateReferrerPolicy(value: string | null): HeaderEvaluation {
  if (!value) return { status: "missing", note: "Referrer-Policy non presente", actualValue: null };
  const policies = value.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  const finalPolicy = policies[policies.length - 1];
  if (SAFE_REFERRER_POLICIES.has(finalPolicy)) {
    return { status: "ok", note: `Policy adeguata: ${finalPolicy}`, actualValue: value, evidence: { finalPolicy } };
  }
  return { status: "weak", note: `Policy debole o non riconosciuta: ${finalPolicy || value}`, actualValue: value, evidence: { finalPolicy } };
}

function evaluatePermissionsPolicy(value: string | null): HeaderEvaluation {
  if (!value) return { status: "missing", note: "Permissions-Policy non presente", actualValue: null };
  const lower = value.toLowerCase();
  const sensitive = ["camera", "microphone", "geolocation", "payment"];
  const restricted = sensitive.filter((feature) => new RegExp(`${feature}\\s*=\\s*\\(\\s*\\)`, "i").test(lower));
  if (restricted.length >= 2) {
    return { status: "ok", note: "Permissions-Policy limita più feature sensibili", actualValue: value, evidence: { restricted } };
  }
  return { status: "weak", note: "Permissions-Policy presente ma poco restrittiva sulle feature sensibili", actualValue: value, evidence: { restricted } };
}

function evaluateExactToken(expected: string) {
  return (value: string | null): HeaderEvaluation => {
    if (!value) return { status: "missing", note: `Header mancante, valore atteso: ${expected}`, actualValue: null };
    if (containsToken(value, expected)) return { status: "ok", note: `Valore atteso presente: ${expected}`, actualValue: value };
    return { status: "weak", note: `Valore atteso non trovato: ${expected}`, actualValue: value };
  };
}

export const HTTP_SECURITY_HEADER_RULES: HeaderRule[] = [
  {
    id: "hsts",
    header: "Strict-Transport-Security",
    severity: "high",
    weight: 30,
    category: "transport",
    description: "Forza il browser a usare HTTPS nelle visite successive.",
    recommendation: "Impostare Strict-Transport-Security: max-age=31536000; includeSubDomains; preload su risposte HTTPS.",
    evaluate: evaluateHsts,
  },
  {
    id: "csp",
    header: "Content-Security-Policy",
    severity: "high",
    weight: 30,
    category: "content-isolation",
    description: "Riduce XSS, injection e caricamento di risorse non autorizzate.",
    recommendation: "Definire una CSP con default-src/script-src restrittivi, object-src 'none', base-uri 'none' e frame-ancestors.",
    evaluate: evaluateCsp,
  },
  {
    id: "x-content-type-options",
    header: "X-Content-Type-Options",
    severity: "medium",
    weight: 15,
    category: "browser-hardening",
    description: "Evita MIME sniffing da parte del browser.",
    recommendation: "Impostare X-Content-Type-Options: nosniff.",
    evaluate: evaluateXContentTypeOptions,
  },
  {
    id: "frame-protection",
    header: "X-Frame-Options",
    severity: "medium",
    weight: 15,
    category: "content-isolation",
    description: "Riduce il rischio clickjacking impedendo embedding non autorizzato.",
    recommendation: "Usare CSP frame-ancestors 'none' o 'self'. In alternativa impostare X-Frame-Options: DENY o SAMEORIGIN.",
    evaluate: evaluateFrameProtection,
  },
  {
    id: "referrer-policy",
    header: "Referrer-Policy",
    severity: "low",
    weight: 5,
    category: "privacy",
    description: "Controlla quante informazioni Referrer vengono inviate verso altri siti.",
    recommendation: "Impostare Referrer-Policy: strict-origin-when-cross-origin o no-referrer.",
    evaluate: evaluateReferrerPolicy,
  },
  {
    id: "permissions-policy",
    header: "Permissions-Policy",
    severity: "low",
    weight: 5,
    category: "browser-hardening",
    description: "Limita l'uso di API browser sensibili come camera, microfono e geolocalizzazione.",
    recommendation: "Impostare Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=().",
    evaluate: evaluatePermissionsPolicy,
  },
  {
    id: "coop",
    header: "Cross-Origin-Opener-Policy",
    severity: "low",
    weight: 5,
    category: "content-isolation",
    description: "Isola la browsing context group rispetto ad altre origini.",
    recommendation: "Impostare Cross-Origin-Opener-Policy: same-origin dove compatibile.",
    evaluate: evaluateExactToken("same-origin"),
  },
  {
    id: "coep",
    header: "Cross-Origin-Embedder-Policy",
    severity: "low",
    weight: 5,
    category: "content-isolation",
    description: "Controlla il caricamento di risorse cross-origin.",
    recommendation: "Valutare Cross-Origin-Embedder-Policy: require-corp per applicazioni ad alta sicurezza.",
    evaluate: evaluateExactToken("require-corp"),
  },
  {
    id: "corp",
    header: "Cross-Origin-Resource-Policy",
    severity: "low",
    weight: 5,
    category: "content-isolation",
    description: "Limita chi può includere la risorsa da altre origini.",
    recommendation: "Impostare Cross-Origin-Resource-Policy: same-origin o same-site in base al caso d'uso.",
    evaluate: (value) => {
      if (!value) return { status: "missing", note: "CORP non presente", actualValue: null };
      const v = value.trim().toLowerCase();
      if (["same-origin", "same-site"].includes(v)) return { status: "ok", note: `CORP valido: ${v}`, actualValue: value };
      return { status: "weak", note: "CORP presente ma valore non raccomandato", actualValue: value };
    },
  },
];

function gradeFromScore(score: number): HttpHeaderScanReport["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function pointsFor(status: HeaderStatus, weight: number): number {
  if (status === "ok") return weight;
  if (status === "weak") return weight / 2;
  return 0;
}

function normalizeInputUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("URL vuoto");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Sono supportati solo URL http:// o https://");
  }
  url.hash = "";
  return url.toString();
}

function isBlockedLiteralHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
}

export function evaluateHeaders(inputUrl: string, finalUrl: string | null, statusCode: number | null, responseTimeMs: number, rawHeadersInput: Headers | Record<string, string>, error?: string): HttpHeaderScanReport {
  const normalizedUrl = normalizeInputUrl(inputUrl);
  const headers = normalizeHeaderMap(rawHeadersInput);

  const findings: HeaderFinding[] = HTTP_SECURITY_HEADER_RULES.map((rule) => {
    const value = getHeader(headers, rule.header);
    const evaluation = rule.evaluate ? rule.evaluate(value, headers) : evaluatePresence(value);
    const earnedPoints = pointsFor(evaluation.status, rule.weight);
    return {
      ruleId: rule.id,
      header: rule.header,
      severity: rule.severity,
      weight: rule.weight,
      category: rule.category,
      description: rule.description,
      recommendation: rule.recommendation,
      status: evaluation.status,
      note: evaluation.note,
      actualValue: evaluation.actualValue,
      evidence: evaluation.evidence,
      earnedPoints,
    };
  });

  const total = HTTP_SECURITY_HEADER_RULES.reduce((acc, rule) => acc + rule.weight, 0);
  const earned = findings.reduce((acc, finding) => acc + finding.earnedPoints, 0);
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  const targetUrl = finalUrl ?? normalizedUrl;

  return {
    scanner: "surface-http-headers",
    scannerVersion: SCANNER_VERSION,
    inputUrl,
    normalizedUrl,
    finalUrl,
    statusCode,
    isHttps: targetUrl.startsWith("https://"),
    responseTimeMs,
    scannedAt: new Date().toISOString(),
    score,
    grade: gradeFromScore(score),
    summary: {
      totalRules: HTTP_SECURITY_HEADER_RULES.length,
      ok: findings.filter((f) => f.status === "ok").length,
      weak: findings.filter((f) => f.status === "weak").length,
      missing: findings.filter((f) => f.status === "missing").length,
      highImpactOpen: findings.filter((f) => ["critical", "high"].includes(f.severity) && f.status !== "ok").length,
    },
    findings,
    rawHeaders: headers,
    error,
  };
}

export async function scanHttpSecurityHeaders(inputUrl: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<HttpHeaderScanReport> {
  const normalizedUrl = normalizeInputUrl(inputUrl);
  const url = new URL(normalizedUrl);
  if (isBlockedLiteralHost(url.hostname)) {
    throw new Error("Host locale o privato bloccato dalla protezione anti-SSRF");
  }

  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Timeout HTTP headers scan"), timeoutMs);

  try {
    const response = await fetch(normalizedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "SurfaceScan360-HTTP-Headers/1.0 (+https://hisolution.it)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Range": "bytes=0-2048",
        "Cache-Control": "no-cache",
      },
    });

    const responseTimeMs = Math.round(performance.now() - started);
    try {
      await response.body?.cancel();
    } catch (_) {
      // Body cancellation is best-effort; headers are already available.
    }

    return evaluateHeaders(inputUrl, response.url, response.status, responseTimeMs, response.headers);
  } catch (err) {
    const responseTimeMs = Math.round(performance.now() - started);
    return evaluateHeaders(inputUrl, null, null, responseTimeMs, {}, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeout);
  }
}
