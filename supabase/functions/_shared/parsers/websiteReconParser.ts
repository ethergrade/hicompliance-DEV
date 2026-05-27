import type { NormalizedTechnology } from '../pentestToolsTypes.ts';

const CATEGORY_KEYWORDS: Array<{ key: RegExp; label: string }> = [
  { key: /nginx|apache|iis|caddy|tomcat/i, label: 'Web servers' },
  { key: /wordpress|drupal|joomla|shopify|magento/i, label: 'CMS' },
  { key: /react|vue|angular|svelte|next\.js|nuxt|jquery/i, label: 'JavaScript frameworks' },
  { key: /php|python|ruby|java|node|asp\.net|laravel|django/i, label: 'Programming languages' },
  { key: /cloudflare|akamai|fastly|cdn/i, label: 'CDN' },
  { key: /google analytics|matomo|gtm|segment|hotjar/i, label: 'Analytics' },
  { key: /waf|imperva|sucuri|mod_security/i, label: 'Security' },
  { key: /haproxy|envoy|traefik|reverse proxy/i, label: 'Reverse proxies' },
];

function detectCategory(name: string): string {
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.key.test(name)) return entry.label;
  }
  return 'Unknown';
}

function parseUrlParts(url: string): { host: string; port?: number } {
  try {
    const parsed = new URL(url);
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : parsed.protocol === 'http:' ? 80 : undefined;
    return {
      host: parsed.hostname.toLowerCase(),
      port: Number.isFinite(Number(port)) ? Number(port) : undefined,
    };
  } catch {
    return { host: '' };
  }
}

function splitNameAndVersion(raw: string): { name: string; version?: string } {
  const clean = raw.trim();
  if (!clean) return { name: '' };

  // e.g. "nginx 1.25.2" or "WordPress:6.5"
  const colonIdx = clean.lastIndexOf(':');
  if (colonIdx > 0) {
    const left = clean.slice(0, colonIdx).trim();
    const right = clean.slice(colonIdx + 1).trim();
    if (left && /^\d+[\w.\-]+$/.test(right)) return { name: left, version: right };
  }

  const m = clean.match(/^(.+?)\s+v?(\d+[\w.\-]*)$/i);
  if (m) return { name: m[1].trim(), version: m[2].trim() };
  return { name: clean };
}

function pushTech(out: NormalizedTechnology[], item: Partial<NormalizedTechnology>) {
  const name = String(item.name || '').trim();
  if (!name) return;
  out.push({
    url: String(item.url || ''),
    host: String(item.host || ''),
    port: item.port,
    name,
    version: item.version,
    category: item.category || detectCategory(name),
    confidence: item.confidence,
    raw: item.raw || {},
  });
}

function collectTechnologyCandidates(node: unknown, bucket: Array<string | Record<string, unknown>>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTechnologyCandidates(item, bucket);
    return;
  }
  if (!node || typeof node !== 'object') return;

  const obj = node as Record<string, unknown>;

  if (Array.isArray(obj.web_technologies)) {
    for (const tech of obj.web_technologies) bucket.push(tech as any);
  }
  if (Array.isArray(obj.technologies)) {
    for (const tech of obj.technologies) bucket.push(tech as any);
  }
  if (typeof obj.technology === 'string') {
    bucket.push(obj.technology);
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      collectTechnologyCandidates(value, bucket);
    }
  }
}

export function normalizeWebsiteReconOutput(output: unknown, fallbackUrl = ''): NormalizedTechnology[] {
  const root = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>;
  const outputData = (root.output_data && typeof root.output_data === 'object'
    ? root.output_data
    : (root.data && typeof root.data === 'object' ? (root.data as any).output_data : {})) as Record<string, unknown>;

  const targetUrl = String(outputData.url || outputData.target_url || fallbackUrl || '').trim();
  const { host: parsedHost, port: parsedPort } = parseUrlParts(targetUrl);

  const candidates: Array<string | Record<string, unknown>> = [];
  collectTechnologyCandidates(outputData, candidates);

  const out: NormalizedTechnology[] = [];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const tech = splitNameAndVersion(candidate);
      if (!tech.name) continue;
      pushTech(out, {
        url: targetUrl,
        host: parsedHost,
        port: parsedPort,
        name: tech.name,
        version: tech.version,
        raw: { raw: candidate },
      });
      continue;
    }

    if (!candidate || typeof candidate !== 'object') continue;
    const obj = candidate as Record<string, unknown>;
    const rawName = String(obj.name || obj.technology || obj.title || '').trim();
    const nameVersion = splitNameAndVersion(rawName);
    const name = nameVersion.name;
    if (!name) continue;

    const version = String(obj.version || nameVersion.version || '').trim() || undefined;
    const confidence = Number(obj.confidence);

    pushTech(out, {
      url: targetUrl,
      host: parsedHost,
      port: parsedPort,
      name,
      version,
      confidence: Number.isFinite(confidence) ? confidence : undefined,
      category: String(obj.category || '').trim() || undefined,
      raw: obj,
    });
  }

  const dedupe = new Map<string, NormalizedTechnology>();
  for (const row of out) {
    const key = `${row.url}|${row.host}|${row.port || ''}|${row.name.toLowerCase()}|${(row.version || '').toLowerCase()}`;
    if (!dedupe.has(key)) dedupe.set(key, row);
  }

  return Array.from(dedupe.values());
}
