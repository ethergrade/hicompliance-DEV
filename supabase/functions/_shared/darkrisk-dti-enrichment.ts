import { normalizeText } from './darkrisk-utils.ts';

export type DarkRiskDtiQueryKind = 'at_domain_tld' | 'selector' | 'email_selector';

export type FirecrawlSourceTemplate = {
  key: string;
  label: string;
  template: string;
  queryKinds: Array<'domain' | 'email'>;
};

export type FirecrawlTarget = {
  sourceKey: string;
  sourceLabel: string;
  queryKind: DarkRiskDtiQueryKind;
  queryTerm: string;
  assetScope: string;
  selectorValue: string | null;
  targetUrl: string;
};

export type FirecrawlScrapeResult = {
  ok: boolean;
  status: number;
  sourceUrl: string;
  title: string;
  markdown: string;
  summary: string;
  links: string[];
  warning: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
};

export type IntelxDeepFetchResult = {
  extractionSource: 'metadata' | 'preview' | 'read' | 'view' | 'preview_read';
  extractedText: string;
  warning: string | null;
  metadata: Record<string, unknown>;
};

const DEFAULT_FIRECRAWL_SOURCE_TEMPLATES: FirecrawlSourceTemplate[] = [
  {
    key: 'mxtoolbox_domain_health',
    label: 'Domain health intelligence',
    template: 'https://lookup.mxtoolbox.com/domain/{{domain}}',
    queryKinds: ['domain'],
  },
  {
    key: 'easydmarc_reputation',
    label: 'Domain reputation intelligence',
    template: 'https://easydmarc.com/tools/ip-domain-reputation-check?domain={{domain}}',
    queryKinds: ['domain'],
  },
  {
    key: 'talos_reputation',
    label: 'IP and domain reputation intelligence',
    template: 'https://www.talosintelligence.com/reputation_center/lookup?search={{domain}}',
    queryKinds: ['domain'],
  },
  {
    key: 'dnsdumpster',
    label: 'DNS mapping intelligence',
    template: 'https://dnsdumpster.com/',
    queryKinds: ['domain'],
  },
  {
    key: 'misk_dns_tools',
    label: 'DNS diagnostic intelligence',
    template: 'https://www.misk.com/tools/#dns',
    queryKinds: ['domain'],
  },
  {
    key: 'spamhaus_reputation',
    label: 'Domain/IP reputation intelligence',
    template: 'https://check.spamhaus.org/results?query={{domain}}',
    queryKinds: ['domain'],
  },
  {
    key: 'mailspike_verification',
    label: 'Mail server verification intelligence',
    template: 'https://mailspike.io/domain_verify/domain_verification?domain={{domain}}',
    queryKinds: ['domain'],
  },
  {
    key: 'apivoid_domain_reputation',
    label: 'Domain blacklist intelligence',
    template: 'https://www.apivoid.com/tools/domain-reputation-check/?q={{domain}}',
    queryKinds: ['domain'],
  },
  {
    key: 'webcheck_osint_reference',
    label: 'OSINT reference intelligence',
    template: 'https://web-check.xyz/',
    queryKinds: ['domain'],
  },
  {
    key: 'gca_domain_security_reference',
    label: 'Domain security reference',
    template: 'https://github.com/GlobalCyberAlliance/domain-security-scanner',
    queryKinds: ['domain'],
  },
  {
    key: 'email_selector_intelligence',
    label: 'Email selector intelligence',
    template: 'https://www.google.com/search?q={{email}}',
    queryKinds: ['email'],
  },
];

function sanitizeForTemplate(value: string): string {
  return encodeURIComponent(normalizeText(value));
}

function normalizeDomain(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/\/.*$/, '')
    .replace(/^@/, '');
}

export function buildAtDomainTldTerm(domain: string): string {
  const normalized = normalizeDomain(domain);
  return normalized ? `@${normalized}` : '';
}

export function getFirecrawlSourceTemplates(rawConfig: string | null | undefined): FirecrawlSourceTemplate[] {
  const raw = normalizeText(rawConfig || '');
  if (!raw) return DEFAULT_FIRECRAWL_SOURCE_TEMPLATES;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_FIRECRAWL_SOURCE_TEMPLATES;
    const cleaned = parsed
      .map((entry) => {
        const key = normalizeText(String((entry as any)?.key || ''));
        const label = normalizeText(String((entry as any)?.label || key));
        const template = normalizeText(String((entry as any)?.template || ''));
        const queryKindsRaw = Array.isArray((entry as any)?.queryKinds)
          ? (entry as any).queryKinds.map((kind: unknown) => normalizeText(String(kind || '')).toLowerCase())
          : [];
        const queryKinds: Array<'domain' | 'email'> = queryKindsRaw.filter((kind: string) => kind === 'domain' || kind === 'email') as Array<'domain' | 'email'>;
        if (!key || !template || queryKinds.length === 0) return null;
        return { key, label: label || key, template, queryKinds };
      })
      .filter((entry): entry is FirecrawlSourceTemplate => Boolean(entry));

    return cleaned.length > 0 ? cleaned : DEFAULT_FIRECRAWL_SOURCE_TEMPLATES;
  } catch {
    return DEFAULT_FIRECRAWL_SOURCE_TEMPLATES;
  }
}

function resolveTemplate(template: string, domain: string, email: string): string {
  return template
    .replaceAll('{{domain}}', sanitizeForTemplate(domain))
    .replaceAll('{{email}}', sanitizeForTemplate(email))
    .replaceAll('{{at_domain}}', sanitizeForTemplate(buildAtDomainTldTerm(domain)));
}

export function buildFirecrawlTargets(params: {
  sourceTemplates: FirecrawlSourceTemplate[];
  scopeDomains: string[];
  emailSelectors: string[];
  maxTargets: number;
}): FirecrawlTarget[] {
  const domainTerms = Array.from(new Set(params.scopeDomains.map((domain) => normalizeDomain(domain)).filter(Boolean)));
  const emailTerms = Array.from(new Set(params.emailSelectors.map((email) => normalizeText(email).toLowerCase()).filter(Boolean)));
  const targets: FirecrawlTarget[] = [];

  for (const source of params.sourceTemplates) {
    if (source.queryKinds.includes('domain')) {
      for (const domain of domainTerms) {
        targets.push({
          sourceKey: source.key,
          sourceLabel: source.label,
          queryKind: 'at_domain_tld',
          queryTerm: buildAtDomainTldTerm(domain),
          assetScope: domain,
          selectorValue: null,
          targetUrl: resolveTemplate(source.template, domain, ''),
        });
        if (targets.length >= params.maxTargets) return targets;
      }
    }

    if (source.queryKinds.includes('email')) {
      for (const email of emailTerms) {
        const domain = normalizeDomain(email.split('@')[1] || '');
        targets.push({
          sourceKey: source.key,
          sourceLabel: source.label,
          queryKind: 'email_selector',
          queryTerm: email,
          assetScope: domain || email,
          selectorValue: email,
          targetUrl: resolveTemplate(source.template, domain || email, email),
        });
        if (targets.length >= params.maxTargets) return targets;
      }
    }
  }

  return targets;
}

function safeExtractText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => safeExtractText(entry))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const preferred = [
      'text',
      'content',
      'markdown',
      'summary',
      'description',
      'name',
      'title',
      'snippet',
      'preview',
      'body',
      'value',
      'result',
      'data',
      'message',
    ];
    const out: string[] = [];
    for (const key of preferred) {
      if (key in obj) {
        const extracted = safeExtractText(obj[key]);
        if (extracted) out.push(extracted);
      }
    }
    if (out.length > 0) return out.join('\n');

    return Object.values(obj)
      .map((entry) => safeExtractText(entry))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  options: { retries: number; timeoutMs: number },
): Promise<Response> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= options.retries) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), options.timeoutMs);
    try {
      const response = await fetch(input, {
        ...init,
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (response.status >= 500 && attempt < options.retries) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error: any) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error : new Error(String(error || 'Unknown fetch error'));
      if (attempt >= options.retries) break;
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw lastError || new Error('HTTP request failed');
}

export async function firecrawlScrape(params: {
  apiKey: string;
  targetUrl: string;
  timeoutMs: number;
  retries: number;
  maxMarkdownChars: number;
}): Promise<FirecrawlScrapeResult> {
  const url = 'https://api.firecrawl.dev/v2/scrape';
  const targetUrl = normalizeText(params.targetUrl);

  if (!params.apiKey || !targetUrl) {
    return {
      ok: false,
      status: 0,
      sourceUrl: targetUrl,
      title: '',
      markdown: '',
      summary: '',
      links: [],
      warning: null,
      error: 'firecrawl_not_configured_or_invalid_url',
      metadata: {},
    };
  }

  const response = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'HICONSOLE-DarkRisk360/1.0',
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ['markdown', 'links', 'summary'],
        onlyMainContent: true,
        onlyCleanContent: true,
        timeout: params.timeoutMs,
        storeInCache: true,
      }),
    },
    {
      retries: params.retries,
      timeoutMs: Math.max(params.timeoutMs + 2_000, params.timeoutMs),
    },
  );

  const status = response.status;
  const payloadText = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = payloadText ? JSON.parse(payloadText) as Record<string, unknown> : {};
  } catch {
    payload = { raw_text: payloadText.slice(0, 8_000) };
  }

  if (!response.ok || payload?.success === false) {
    return {
      ok: false,
      status,
      sourceUrl: targetUrl,
      title: '',
      markdown: '',
      summary: '',
      links: [],
      warning: null,
      error: normalizeText(String(payload?.error || payload?.message || `firecrawl_http_${status}`)) || `firecrawl_http_${status}`,
      metadata: payload,
    };
  }

  const data = (payload?.data || payload) as Record<string, unknown>;
  const metadata = (data?.metadata || {}) as Record<string, unknown>;
  const markdown = safeExtractText(data?.markdown || '').slice(0, params.maxMarkdownChars);
  const summary = safeExtractText(data?.summary || '').slice(0, 2_000);
  const title = normalizeText(String(metadata?.title || ''));
  const links = Array.isArray(data?.links)
    ? (data.links as unknown[]).map((entry) => normalizeText(String(entry || ''))).filter(Boolean).slice(0, 100)
    : [];

  const warning = markdown ? null : 'firecrawl_empty_markdown';

  return {
    ok: true,
    status,
    sourceUrl: targetUrl,
    title,
    markdown,
    summary,
    links,
    warning,
    error: null,
    metadata,
  };
}

export async function intelxDeepFetch(params: {
  apiKey: string;
  apiUrl: string;
  systemId: string | null;
  storageId: string | null;
  bucket: string | null;
  timeoutMs: number;
  retries: number;
  maxChars: number;
}): Promise<IntelxDeepFetchResult> {
  const systemId = normalizeText(params.systemId || '');
  const storageId = normalizeText(params.storageId || '');
  const bucket = normalizeText(params.bucket || '');

  const base = normalizeText(params.apiUrl || '').replace(/\/+$/, '');
  if (!params.apiKey || !base || (!systemId && !storageId)) {
    return {
      extractionSource: 'metadata',
      extractedText: '',
      warning: 'intelx_deep_fetch_prerequisite_missing',
      metadata: {},
    };
  }

  const headers = {
    'X-Key': params.apiKey,
    'Content-Type': 'application/json',
    'User-Agent': 'HICONSOLE-DarkRisk360/1.0',
  };

  const tryCalls: Array<{ method: 'POST' | 'GET'; path: string; body?: Record<string, unknown>; query?: Record<string, string> }> = [
    {
      method: 'GET',
      path: '/file/view',
      query: {
        ...(systemId ? { systemid: systemId } : {}),
        ...(storageId ? { storageid: storageId } : {}),
        ...(bucket ? { bucket } : {}),
        f: '0',
      },
    },
    {
      method: 'POST',
      path: '/file/preview',
      body: {
        systemid: systemId || undefined,
        storageid: storageId || undefined,
        bucket: bucket || undefined,
      },
    },
    {
      method: 'GET',
      path: '/file/preview',
      query: {
        ...(systemId ? { systemid: systemId } : {}),
        ...(storageId ? { storageid: storageId } : {}),
        ...(bucket ? { bucket } : {}),
        f: '0',
      },
    },
    {
      method: 'POST',
      path: '/file/read',
      body: {
        systemid: systemId || undefined,
        storageid: storageId || undefined,
        bucket: bucket || undefined,
      },
    },
    {
      method: 'GET',
      path: '/file/read',
      query: {
        ...(systemId ? { systemid: systemId } : {}),
        ...(storageId ? { storageid: storageId } : {}),
        ...(bucket ? { bucket } : {}),
        type: '0',
      },
    },
  ];

  let viewText = '';
  let previewText = '';
  let readText = '';
  const errors: string[] = [];

  for (const call of tryCalls) {
    try {
      const reqUrl = new URL(`${base}${call.path}`);
      for (const [key, value] of Object.entries(call.query || {})) {
        reqUrl.searchParams.set(key, value);
      }
      const response = await fetchWithRetry(
        reqUrl.toString(),
        {
          method: call.method,
          headers,
          body: call.method === 'POST' ? JSON.stringify(call.body || {}) : undefined,
        },
        {
          retries: params.retries,
          timeoutMs: params.timeoutMs,
        },
      );

      if (!response.ok) {
        const errorText = (await response.text().catch(() => '')).slice(0, 220);
        errors.push(`${call.path}:${response.status}${errorText ? `:${errorText}` : ''}`);
        continue;
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const rawText = await response.text().catch(() => '');
      let parsed: unknown = rawText;
      if (contentType.includes('json')) {
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parsed = rawText;
        }
      }

      const extracted = safeExtractText(parsed).slice(0, params.maxChars);
      if (!extracted) continue;

      if (call.path.includes('/view')) {
        viewText = extracted;
      } else if (call.path.includes('/preview')) {
        previewText = extracted;
      } else {
        readText = extracted;
      }

      if ((viewText || previewText) && readText) break;
    } catch (error: any) {
      errors.push(`${call.path}:${normalizeText(String(error?.message || error || 'error'))}`);
    }
  }

  const merged = [viewText, previewText, readText].filter(Boolean).join('\n').slice(0, params.maxChars);
  const extractionSource: IntelxDeepFetchResult['extractionSource'] = previewText && readText
    ? 'preview_read'
    : readText
    ? 'read'
    : viewText
    ? 'view'
    : previewText
    ? 'preview'
    : 'metadata';

  return {
    extractionSource,
    extractedText: merged,
    warning: merged ? null : (errors[0] || 'intelx_deep_fetch_empty'),
    metadata: {
      attempted_calls: tryCalls.length,
      errors: errors.slice(0, 6),
      has_view: Boolean(viewText),
      has_preview: Boolean(previewText),
      has_read: Boolean(readText),
    },
  };
}
