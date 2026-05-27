export type PublicTargetType = 'domain' | 'subdomain' | 'ip' | 'url';

export type ValidationResult =
  | {
      valid: true;
      normalized: string;
      targetType: PublicTargetType;
      hostname: string;
      rootDomain?: string;
      protocol?: 'http' | 'https';
    }
  | {
      valid: false;
      code:
        | 'invalid_target'
        | 'private_or_blocked_ip'
        | 'blocked_local_target'
        | 'unsupported_scheme'
        | 'unsupported_cidr'
        | 'unsupported_wildcard';
      message: string;
    };

const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

function normalizeHost(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

function ipv4ToNum(ip: string): number {
  const [a, b, c, d] = ip.split('.').map((n) => Number(n));
  return (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
}

function isIPv4(value: string): boolean {
  return IPV4_RE.test(value);
}

function isIPv6(value: string): boolean {
  return value.includes(':');
}

function isBlockedIPv4(ip: string): boolean {
  if (!isIPv4(ip)) return false;
  const n = ipv4ToNum(ip);
  const inRange = (start: string, end: string) => n >= ipv4ToNum(start) && n <= ipv4ToNum(end);

  return (
    inRange('0.0.0.0', '0.255.255.255') ||
    inRange('10.0.0.0', '10.255.255.255') ||
    inRange('127.0.0.0', '127.255.255.255') ||
    inRange('169.254.0.0', '169.254.255.255') ||
    inRange('172.16.0.0', '172.31.255.255') ||
    inRange('192.168.0.0', '192.168.255.255') ||
    inRange('224.0.0.0', '239.255.255.255') ||
    ip === '169.254.169.254'
  );
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
}

function extractRootDomain(hostname: string): string | undefined {
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length < 2) return undefined;
  const suffix2 = parts.slice(-2).join('.');
  const twoLabels = new Set(['co.uk', 'org.uk', 'gov.uk', 'com.au', 'co.jp', 'com.br']);
  if (parts.length >= 3 && twoLabels.has(suffix2)) {
    return parts.slice(-3).join('.');
  }
  return suffix2;
}

function parseTarget(value: string): {
  raw: string;
  hostname: string;
  protocol?: 'http' | 'https';
  isUrl: boolean;
} | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const parsed = (() => {
    try {
      return new URL(raw);
    } catch {
      return null;
    }
  })();

  if (parsed) {
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return null;
    }
    return {
      raw,
      hostname: normalizeHost(parsed.hostname),
      protocol: protocol === 'https:' ? 'https' : 'http',
      isUrl: true,
    };
  }

  return {
    raw,
    hostname: normalizeHost(raw),
    isUrl: false,
  };
}

export function validatePublicTarget(target: string): ValidationResult {
  const input = String(target || '').trim();
  if (!input) {
    return { valid: false, code: 'invalid_target', message: 'Target vuoto' };
  }
  if (input.startsWith('*.')) {
    return { valid: false, code: 'unsupported_wildcard', message: 'Wildcard non supportato in v1' };
  }
  if (/\/(\d{1,3})$/.test(input) && !input.startsWith('http')) {
    return { valid: false, code: 'unsupported_cidr', message: 'CIDR non supportato in v1' };
  }

  const parsed = parseTarget(input);
  if (!parsed) {
    return {
      valid: false,
      code: input.includes('://') ? 'unsupported_scheme' : 'invalid_target',
      message: input.includes('://') ? 'Sono ammessi solo schemi http/https' : 'Formato target non valido',
    };
  }

  if (!parsed.hostname || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) {
    return { valid: false, code: 'blocked_local_target', message: 'Target locale/non pubblico non consentito' };
  }

  if (isIPv4(parsed.hostname)) {
    if (isBlockedIPv4(parsed.hostname)) {
      return { valid: false, code: 'private_or_blocked_ip', message: 'IPv4 privato/interno non consentito' };
    }
    return {
      valid: true,
      normalized: parsed.isUrl ? `${parsed.protocol}://${parsed.hostname}` : parsed.hostname,
      targetType: parsed.isUrl ? 'url' : 'ip',
      hostname: parsed.hostname,
      protocol: parsed.protocol,
    };
  }

  if (isIPv6(parsed.hostname)) {
    if (isBlockedIPv6(parsed.hostname)) {
      return { valid: false, code: 'private_or_blocked_ip', message: 'IPv6 privato/interno non consentito' };
    }
    return {
      valid: true,
      normalized: parsed.isUrl ? `${parsed.protocol}://[${parsed.hostname}]` : parsed.hostname,
      targetType: parsed.isUrl ? 'url' : 'ip',
      hostname: parsed.hostname,
      protocol: parsed.protocol,
    };
  }

  if (!DOMAIN_RE.test(parsed.hostname)) {
    return { valid: false, code: 'invalid_target', message: 'Dominio non valido' };
  }

  const rootDomain = extractRootDomain(parsed.hostname);
  const targetType: PublicTargetType = parsed.isUrl
    ? 'url'
    : parsed.hostname.split('.').length > 2
      ? 'subdomain'
      : 'domain';

  return {
    valid: true,
    normalized: parsed.isUrl ? `${parsed.protocol}://${parsed.hostname}` : parsed.hostname,
    targetType,
    hostname: parsed.hostname,
    rootDomain,
    protocol: parsed.protocol,
  };
}
