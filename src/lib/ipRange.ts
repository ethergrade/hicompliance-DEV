export type MonitoredIpEntryType = 'single' | 'range' | 'cidr';

export interface ParsedMonitoredIpInput {
  entryType: MonitoredIpEntryType;
  inputValue: string;
  ipStart: string;
  ipEnd: string;
}

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

export const isValidIPv4 = (value: string): boolean => IPV4_REGEX.test(value.trim());

const normalizeIpv4 = (value: string): string | null => {
  const trimmed = value.trim();
  const sanitized = trimmed.includes('/') ? trimmed.split('/')[0].trim() : trimmed;
  if (!isValidIPv4(sanitized)) return null;

  return sanitized
    .split('.')
    .map((octet) => String(Number(octet)))
    .join('.');
};

const ipToNumber = (ip: string): number | null => {
  const normalized = normalizeIpv4(ip);
  if (!normalized) return null;

  const octets = normalized.split('.').map(Number);
  return (
    octets[0] * 256 ** 3 +
    octets[1] * 256 ** 2 +
    octets[2] * 256 +
    octets[3]
  );
};

const numberToIp = (value: number): string => {
  const normalized = value >>> 0;
  return [
    (normalized >>> 24) & 255,
    (normalized >>> 16) & 255,
    (normalized >>> 8) & 255,
    normalized & 255,
  ].join('.');
};

const parseCidr = (rawInput: string): ParsedMonitoredIpInput => {
  const [baseIpRaw, prefixRaw] = rawInput.split('/').map((part) => part.trim());
  if (!baseIpRaw || !prefixRaw) {
    throw new Error('Formato CIDR non valido. Usa ad esempio 203.0.113.0/24');
  }

  const baseIp = normalizeIpv4(baseIpRaw);
  if (!baseIp) {
    throw new Error('IP CIDR non valido');
  }

  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error('Prefisso CIDR non valido (usa un valore da 0 a 32)');
  }

  const baseIpNum = ipToNumber(baseIp);
  if (baseIpNum === null) {
    throw new Error('IP CIDR non valido');
  }

  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  const networkStart = (baseIpNum & mask) >>> 0;
  const networkEnd = (networkStart | (~mask >>> 0)) >>> 0;

  const ipStart = numberToIp(networkStart);
  const ipEnd = numberToIp(networkEnd);

  return {
    entryType: 'cidr',
    inputValue: `${ipStart}/${prefix}`,
    ipStart,
    ipEnd,
  };
};

const parseRange = (rawInput: string): ParsedMonitoredIpInput => {
  const parts = rawInput.split('-').map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      'Formato range non valido. Usa ad esempio 203.0.113.10-203.0.113.20'
    );
  }

  const startIp = normalizeIpv4(parts[0]);
  const endIp = normalizeIpv4(parts[1]);

  if (!startIp || !endIp) {
    throw new Error('Range IP non valido');
  }

  const startNum = ipToNumber(startIp);
  const endNum = ipToNumber(endIp);

  if (startNum === null || endNum === null || startNum > endNum) {
    throw new Error('Range IP non valido: IP iniziale maggiore di IP finale');
  }

  return {
    entryType: 'range',
    inputValue: `${startIp}-${endIp}`,
    ipStart: startIp,
    ipEnd: endIp,
  };
};

const parseSingleIp = (rawInput: string): ParsedMonitoredIpInput => {
  const ip = normalizeIpv4(rawInput);
  if (!ip) {
    throw new Error('IP non valido');
  }

  return {
    entryType: 'single',
    inputValue: ip,
    ipStart: ip,
    ipEnd: ip,
  };
};

export const parseMonitoredIpInput = (input: string): ParsedMonitoredIpInput => {
  const rawInput = input.trim();
  if (!rawInput) {
    throw new Error('Inserisci un IP, un range o una rete CIDR');
  }

  if (rawInput.includes('/')) {
    return parseCidr(rawInput);
  }

  if (rawInput.includes('-')) {
    return parseRange(rawInput);
  }

  return parseSingleIp(rawInput);
};

export const isIpInRange = (ip: string, ipStart: string, ipEnd: string): boolean => {
  const current = ipToNumber(ip);
  const start = ipToNumber(ipStart);
  const end = ipToNumber(ipEnd);

  if (current === null || start === null || end === null) {
    return false;
  }

  return current >= start && current <= end;
};
