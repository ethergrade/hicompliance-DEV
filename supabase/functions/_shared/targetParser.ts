// Target parser per SurfaceScan360: normalizza dominio/url/ip e blocca target privati.

export type TargetType = 'domain' | 'subdomain' | 'url' | 'ipv4' | 'ipv6';

export interface ParsedTarget {
  raw_target: string;
  normalized_target: string;
  target_type: TargetType;
  hostname: string;
  root_domain: string | null;
  protocol: string | null;
  port: number | null;
}

const PRIVATE_IPV4_RE = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^224\./,
  /^255\.255\.255\.255$/,
];

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

function isIPv4(s: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s);
}
function isIPv6(s: string): boolean {
  return /:/.test(s) && /^[0-9a-f:]+$/i.test(s);
}
function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_IPV4_RE.some((re) => re.test(ip));
}
function isPrivateIPv6(ip: string): boolean {
  const low = ip.toLowerCase();
  return low === '::1' || low.startsWith('fe80') || low.startsWith('fc') || low.startsWith('fd');
}

function rootDomain(host: string): string | null {
  if (isIPv4(host) || isIPv6(host)) return null;
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  // Heuristica semplice: ultimi 2 livelli (non gestisce PSL completo)
  return parts.slice(-2).join('.');
}

export function parseTarget(raw: string): ParsedTarget {
  const trimmed = (raw || '').trim();
  if (!trimmed) throw new Error('Target vuoto');
  if (trimmed.length > 2048) throw new Error('Target troppo lungo');

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const urlInput = hasScheme ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(urlInput);
  } catch {
    throw new Error('Target non valido (URL malformato)');
  }

  const proto = url.protocol.toLowerCase();
  if (proto !== 'http:' && proto !== 'https:') {
    throw new Error(`Protocollo non supportato: ${proto}`);
  }

  let hostname = url.hostname.toLowerCase();
  // strip brackets IPv6
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  if (!hostname) throw new Error('Hostname mancante');
  if (BLOCKED_HOSTNAMES.has(hostname)) throw new Error(`Hostname bloccato: ${hostname}`);

  let target_type: TargetType;
  if (isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) throw new Error(`IP privato/non instradabile non consentito: ${hostname}`);
    target_type = 'ipv4';
  } else if (isIPv6(hostname)) {
    if (isPrivateIPv6(hostname)) throw new Error(`IPv6 privato non consentito: ${hostname}`);
    target_type = 'ipv6';
  } else if (hasScheme && (url.pathname && url.pathname !== '/')) {
    target_type = 'url';
  } else {
    const labels = hostname.split('.').filter(Boolean);
    target_type = labels.length > 2 ? 'subdomain' : 'domain';
  }

  const port = url.port ? parseInt(url.port, 10) : null;
  const normalized_target = target_type === 'url' ? url.toString() : `${proto}//${hostname}${port ? ':' + port : ''}/`;

  return {
    raw_target: raw,
    normalized_target,
    target_type,
    hostname,
    root_domain: rootDomain(hostname),
    protocol: proto,
    port,
  };
}
