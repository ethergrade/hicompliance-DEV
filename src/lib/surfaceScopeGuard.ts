export interface SurfaceScopeClassification {
  host: string;
  normalizedHost: string;
  inScope: boolean;
  isLikelySharedNoise: boolean;
  blocked: boolean;
  reason: string | null;
}

const SHARED_NOISE_PATTERNS: RegExp[] = [
  /^net-\d{1,3}(?:-\d{1,3}){3}\./i,
  /^host-\d{1,3}(?:-\d{1,3}){3}\./i,
  /^dyn-\d{1,3}(?:-\d{1,3}){3}\./i,
  /^webx\d+\./i,
  /\bcust\b/i,
  /\bdsl\b/i,
  /\bpppoe\b/i,
  /\bpool\b/i,
  /\bdynamic\b/i,
];

const SHARED_NOISE_SUFFIXES = [
  'aruba.it',
  'vodafonedsl.it',
  'teletu.it',
  'fastwebnet.it',
  'alice.it',
  'tim.it',
  'tiscali.it',
];

export const normalizeHost = (value: string): string =>
  String(value || '').trim().toLowerCase().replace(/\.$/, '');

const normalizeScopeDomain = (value: string): string =>
  normalizeHost(value).replace(/^www\./, '');

export const isHostWithinScope = (hostname: string, scopeDomains: string[]): boolean => {
  const host = normalizeScopeDomain(hostname);
  if (!host) return false;
  for (const rawScope of scopeDomains) {
    const scope = normalizeScopeDomain(rawScope);
    if (!scope) continue;
    if (host === scope || host.endsWith(`.${scope}`)) {
      return true;
    }
  }
  return false;
};

export const classifySurfaceHostForScope = (
  hostname: string,
  scopeDomains: string[] = [],
): SurfaceScopeClassification => {
  const normalizedHost = normalizeHost(hostname);
  const inScope = isHostWithinScope(normalizedHost, scopeDomains);
  const matchesPattern = SHARED_NOISE_PATTERNS.some((pattern) => pattern.test(normalizedHost));
  const matchesSuffix = SHARED_NOISE_SUFFIXES.some(
    (suffix) => normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`),
  );
  const isLikelySharedNoise = matchesPattern || matchesSuffix;
  const blocked = isLikelySharedNoise && !inScope;

  return {
    host: hostname,
    normalizedHost,
    inScope,
    isLikelySharedNoise,
    blocked,
    reason: blocked ? 'shared_or_noise_host_out_of_scope' : null,
  };
};

export const sourceLabel = (source: string): string => {
  const key = String(source || '').toLowerCase();
  if (key.includes('certificate_transparency')) return 'CT';
  if (key.includes('subdomain_dump')) return 'Dump';
  if (key.includes('reverse_dns')) return 'Reverse DNS';
  if (key.includes('pentest_tools_subdomain')) return 'Pentest Subdomain';
  if (key.includes('pentest_tools_domain')) return 'Pentest Domain';
  if (key.includes('shodan')) return 'Shodan';
  if (key.includes('manual')) return 'Scope';
  return source || 'unknown';
};
