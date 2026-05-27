export type HttpSecurityResult = {
  url: string;
  finalUrl?: string;
  statusCode?: number;
  headers: Record<string, string>;
  checks: {
    contentSecurityPolicy: boolean;
    strictTransportSecurity: boolean;
    xContentTypeOptions: boolean;
    xFrameOptions: boolean;
    referrerPolicy: boolean;
    permissionsPolicy: boolean;
    crossOriginOpenerPolicy: boolean;
    crossOriginResourcePolicy: boolean;
    crossOriginEmbedderPolicy: boolean;
    xXssProtectionLegacy?: boolean;
  };
  score: number;
};

const SECURITY_HEADER_WEIGHTS = {
  contentSecurityPolicy: 20,
  strictTransportSecurity: 20,
  xContentTypeOptions: 10,
  xFrameOptions: 10,
  referrerPolicy: 10,
  permissionsPolicy: 10,
  crossOriginOpenerPolicy: 7,
  crossOriginResourcePolicy: 7,
  crossOriginEmbedderPolicy: 6,
} as const;

export const analyzeHttpSecurity = (params: {
  url: string;
  finalUrl?: string;
  statusCode?: number;
  headers: Record<string, string>;
}): HttpSecurityResult => {
  const headers = Object.entries(params.headers || {}).reduce((acc, [rawKey, rawValue]) => {
    acc[String(rawKey || '').toLowerCase()] = String(rawValue || '');
    return acc;
  }, {} as Record<string, string>);

  const csp = headers['content-security-policy'];
  const checks = {
    contentSecurityPolicy: Boolean(csp),
    strictTransportSecurity: Boolean(headers['strict-transport-security']),
    xContentTypeOptions: Boolean(headers['x-content-type-options']),
    xFrameOptions: Boolean(headers['x-frame-options']) || Boolean(csp && /frame-ancestors/i.test(csp)),
    referrerPolicy: Boolean(headers['referrer-policy']),
    permissionsPolicy: Boolean(headers['permissions-policy']),
    crossOriginOpenerPolicy: Boolean(headers['cross-origin-opener-policy']),
    crossOriginResourcePolicy: Boolean(headers['cross-origin-resource-policy']),
    crossOriginEmbedderPolicy: Boolean(headers['cross-origin-embedder-policy']),
    xXssProtectionLegacy: Boolean(headers['x-xss-protection']),
  };

  const score = Object.entries(SECURITY_HEADER_WEIGHTS).reduce((total, [key, weight]) => {
    return checks[key as keyof typeof checks] ? total + weight : total;
  }, 0);

  return {
    url: params.url,
    finalUrl: params.finalUrl,
    statusCode: params.statusCode,
    headers,
    checks,
    score,
  };
};
