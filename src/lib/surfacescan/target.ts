export type SurfaceTargetType = 'domain' | 'subdomain' | 'url' | 'ip';

export interface NormalizedSurfaceTarget {
  original: string;
  normalized: string;
  hostname: string;
  protocol?: 'http' | 'https';
  type: SurfaceTargetType;
  registrableDomain?: string;
  port?: number;
}

const IPV4_RX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const MULTI_PART_SUFFIXES = [
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.jp',
  'com.br',
  'com.ar',
  'co.nz',
  'co.kr',
  'com.mx',
  'com.tr',
  'co.za',
  'com.sg',
  'com.hk',
  'com.tw',
  'com.cn',
];

const isIpv4 = (value: string): boolean => IPV4_RX.test(value);
const isIpv6 = (value: string): boolean => value.includes(':');

const normalizeHost = (value: string): string =>
  String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

const inferRegistrableDomain = (hostname: string): string | undefined => {
  const host = normalizeHost(hostname);
  if (!host || isIpv4(host) || isIpv6(host)) return undefined;
  const labels = host.split('.').filter(Boolean);
  if (labels.length <= 1) return undefined;
  const lastTwo = labels.slice(-2).join('.');
  const lastThree = labels.slice(-3).join('.');
  const matchMultiPart = MULTI_PART_SUFFIXES.some((suffix) => host.endsWith(`.${suffix}`) || host === suffix);
  if (matchMultiPart && labels.length >= 3) {
    return lastThree;
  }
  return lastTwo;
};

export function normalizeTarget(input: string): NormalizedSurfaceTarget {
  const original = String(input || '').trim();
  if (!original) {
    throw new Error('Target vuoto');
  }

  const raw = original.replace(/\s+/g, '');

  if (isIpv4(raw) || isIpv6(raw)) {
    const host = normalizeHost(raw);
    return {
      original,
      normalized: `https://${isIpv6(host) ? `[${host}]` : host}/`,
      hostname: host,
      protocol: 'https',
      type: 'ip',
    };
  }

  let parsed: URL;
  let hasExplicitScheme = /^https?:\/\//i.test(raw);
  try {
    parsed = new URL(hasExplicitScheme ? raw : `https://${raw}`);
  } catch {
    throw new Error('Formato target non valido');
  }

  const protocol = parsed.protocol === 'http:' ? 'http' : 'https';
  const hostname = normalizeHost(parsed.hostname);
  if (!hostname) {
    throw new Error('Hostname non valido');
  }

  const registrableDomain = inferRegistrableDomain(hostname);
  const hasPathOrQuery = Boolean(parsed.pathname && parsed.pathname !== '/') || Boolean(parsed.search) || Boolean(parsed.hash);
  const targetType: SurfaceTargetType =
    hasPathOrQuery || hasExplicitScheme
      ? 'url'
      : hostname === registrableDomain
        ? 'domain'
        : 'subdomain';

  return {
    original,
    normalized: `${protocol}://${hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`,
    hostname,
    protocol,
    port: parsed.port ? Number(parsed.port) : undefined,
    type: targetType,
    registrableDomain,
  };
}
