export type DarkRiskSelectorType =
  | 'email'
  | 'domain'
  | 'wildcard_domain'
  | 'url'
  | 'ipv4'
  | 'ipv6'
  | 'cidrv4'
  | 'cidrv6'
  | 'phone'
  | 'uuid'
  | 'storageid'
  | 'systemid';

export interface SelectorValidationResult {
  valid: boolean;
  type: DarkRiskSelectorType | null;
  normalized: string | null;
  reason?: string;
}

const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const WILDCARD_DOMAIN_REGEX = /^\*\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const CIDR_V4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\/(3[0-2]|[12]?\d)$/;
const CIDR_V6_REGEX = /^[a-f0-9:]+\/(12[0-8]|1[01]\d|\d?\d)$/i;
const HEX_OR_BASE62_ID_REGEX = /^[a-z0-9][a-z0-9:_-]{7,}$/i;

function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim();
}

function normalizeDomain(value: string): string {
  return value.toLowerCase().replace(/\.$/, '');
}

function isIpv6(value: string): boolean {
  if (!value.includes(':')) return false;
  return /^[a-f0-9:]+$/i.test(value);
}

function normalizePhone(value: string): string {
  const compact = value.replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) return `+${compact.slice(2)}`;
  return compact;
}

function parseUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeIdWithPrefix(value: string, prefix: 'storageid' | 'systemid'): string | null {
  const lower = value.toLowerCase();
  if (!lower.startsWith(`${prefix}:`)) return null;
  const rest = value.slice(prefix.length + 1).trim();
  if (!rest || !HEX_OR_BASE62_ID_REGEX.test(rest)) return null;
  return `${prefix}:${rest}`;
}

export function validateDarkRiskSelector(rawInput: string): SelectorValidationResult {
  const input = normalizeText(rawInput);
  if (!input) {
    return {
      valid: false,
      type: null,
      normalized: null,
      reason: 'Selector empty',
    };
  }

  const normalizedLower = input.toLowerCase();

  if (EMAIL_REGEX.test(input)) {
    return { valid: true, type: 'email', normalized: normalizedLower };
  }

  if (WILDCARD_DOMAIN_REGEX.test(input)) {
    return { valid: true, type: 'wildcard_domain', normalized: normalizeDomain(normalizedLower) };
  }

  if (DOMAIN_REGEX.test(input)) {
    return { valid: true, type: 'domain', normalized: normalizeDomain(normalizedLower) };
  }

  const parsedUrl = parseUrl(input);
  if (parsedUrl) {
    parsedUrl.hash = '';
    return { valid: true, type: 'url', normalized: parsedUrl.toString() };
  }

  if (IPV4_REGEX.test(input)) {
    return { valid: true, type: 'ipv4', normalized: input };
  }

  if (isIpv6(input)) {
    return { valid: true, type: 'ipv6', normalized: normalizedLower };
  }

  if (CIDR_V4_REGEX.test(input)) {
    return { valid: true, type: 'cidrv4', normalized: input };
  }

  if (CIDR_V6_REGEX.test(input)) {
    return { valid: true, type: 'cidrv6', normalized: normalizedLower };
  }

  const normalizedPhone = normalizePhone(input);
  if (/^\+?[1-9]\d{5,14}$/.test(normalizedPhone)) {
    return {
      valid: true,
      type: 'phone',
      normalized: normalizedPhone.startsWith('+') ? normalizedPhone : `+${normalizedPhone}`,
    };
  }

  if (UUID_REGEX.test(input)) {
    return { valid: true, type: 'uuid', normalized: normalizedLower };
  }

  const storageId = normalizeIdWithPrefix(input, 'storageid');
  if (storageId) {
    return { valid: true, type: 'storageid', normalized: storageId };
  }

  const systemId = normalizeIdWithPrefix(input, 'systemid');
  if (systemId) {
    return { valid: true, type: 'systemid', normalized: systemId };
  }

  return {
    valid: false,
    type: null,
    normalized: null,
    reason: 'Selector format not supported',
  };
}
