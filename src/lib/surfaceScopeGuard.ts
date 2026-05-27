export interface SurfaceScopeClassification {
  host: string;
  normalizedHost: string;
  inScope: boolean;
  isLikelySharedNoise: boolean;
  blocked: boolean;
  reason: 'scope_excluded_domain' | 'scope_excluded_shared_noise' | null;
}

export interface SurfaceMonitoredScopeRule {
  entry_type: string;
  input_value: string;
  ip_start: string;
  ip_end: string;
}

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

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

export const isIpv4 = (value: string): boolean => IPV4_REGEX.test(String(value || '').trim());
export const isIpv6 = (value: string): boolean => String(value || '').includes(':');

const ipv4ToNumber = (ip: string): number | null => {
  const normalized = String(ip || '').trim();
  if (!isIpv4(normalized)) return null;
  const [a, b, c, d] = normalized.split('.').map((entry) => Number(entry));
  if ([a, b, c, d].some((entry) => Number.isNaN(entry))) return null;
  return (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
};

export const isIpInRange = (ip: string, ipStart: string, ipEnd: string): boolean => {
  const candidate = String(ip || '').trim().toLowerCase();
  const start = String(ipStart || '').trim().toLowerCase();
  const end = String(ipEnd || '').trim().toLowerCase();
  if (!candidate || !start || !end) return false;

  if (candidate.includes(':') || start.includes(':') || end.includes(':')) {
    return candidate === start && candidate === end;
  }

  const currentNum = ipv4ToNumber(candidate);
  const startNum = ipv4ToNumber(start);
  const endNum = ipv4ToNumber(end);
  if (currentNum === null || startNum === null || endNum === null) return false;
  return currentNum >= startNum && currentNum <= endNum;
};

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
    blocked: blocked || (!inScope && !isLikelySharedNoise),
    reason: blocked ? 'scope_excluded_shared_noise' : inScope ? null : 'scope_excluded_domain',
  };
};

export const splitMonitoredScopeRules = (
  rules: SurfaceMonitoredScopeRule[],
): { scopeDomains: string[]; ipScopeRules: SurfaceMonitoredScopeRule[] } => {
  const scopeDomains: string[] = [];
  const ipScopeRules: SurfaceMonitoredScopeRule[] = [];

  for (const rule of rules || []) {
    const entryType = String(rule?.entry_type || '').toLowerCase();
    const inputValue = String(rule?.input_value || '').trim().toLowerCase();
    if (entryType === 'domain' && inputValue) {
      scopeDomains.push(inputValue);
      continue;
    }
    if (['single', 'range', 'cidr'].includes(entryType)) {
      ipScopeRules.push({
        entry_type: entryType,
        input_value: inputValue,
        ip_start: String(rule?.ip_start || '').trim().toLowerCase(),
        ip_end: String(rule?.ip_end || '').trim().toLowerCase(),
      });
    }
  }

  return {
    scopeDomains: [...new Set(scopeDomains)],
    ipScopeRules,
  };
};

export const isIpWithinScopeRules = (
  ip: string,
  ipScopeRules: SurfaceMonitoredScopeRule[],
): boolean => {
  const candidate = String(ip || '').trim().toLowerCase();
  if (!candidate) return false;
  for (const rule of ipScopeRules) {
    const entryType = String(rule?.entry_type || '').toLowerCase();
    if (!['single', 'range', 'cidr'].includes(entryType)) continue;
    const inputValue = String(rule?.input_value || '').trim().toLowerCase();
    const ipStart = String(rule?.ip_start || '').trim().toLowerCase();
    const ipEnd = String(rule?.ip_end || '').trim().toLowerCase();
    if (entryType === 'single') {
      if (candidate === inputValue || candidate === ipStart) return true;
      continue;
    }
    if (isIpInRange(candidate, ipStart, ipEnd)) return true;
  }
  return false;
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
