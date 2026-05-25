import type { NormalizedOpenPort } from '../pentestToolsTypes.ts';

export function isWebPort(port: number, service?: string): boolean {
  return [80, 443, 8000, 8080, 8081, 8443, 8888, 9443].includes(port) ||
    /http|http-proxy|www/i.test(service || '');
}

export function isTlsPort(port: number, service?: string): boolean {
  return [443, 465, 636, 853, 989, 990, 993, 995, 8443, 9443].includes(port) ||
    /ssl|tls|https/i.test(service || '');
}

const RISKY_PORTS = [21, 23, 445, 3389, 5900, 6379, 9200, 9300, 11211, 27017, 3306, 5432, 1433, 1521];
const ADMIN_PORTS = [22, 2222, 8080, 8443, 9443, 10000];

function calculateExposureLevel(port: NormalizedOpenPort): 'info' | 'low' | 'medium' | 'high' | 'critical' {
  if (RISKY_PORTS.includes(port.port)) {
    if ([3306, 5432, 1433, 1521, 27017, 6379, 9200, 9300, 11211].includes(port.port)) return 'critical';
    return 'high';
  }
  if (ADMIN_PORTS.includes(port.port)) return 'medium';
  if (port.is_web || port.is_tls) return 'info';
  return 'low';
}

function remediationHint(port: NormalizedOpenPort): string {
  if ([23].includes(port.port)) return 'Disabilitare Telnet e sostituire con SSH, limitando accesso tramite VPN o allowlist IP.';
  if ([3389].includes(port.port)) return 'Non esporre RDP direttamente su Internet. Usare VPN/ZTNA, MFA e allowlist.';
  if ([445].includes(port.port)) return 'Non esporre SMB su Internet. Limitare a reti private/VPN.';
  if ([3306, 5432, 1433, 1521, 27017].includes(port.port)) return 'Non esporre database direttamente. Limitare con firewall, private networking e bastion host.';
  if ([9200, 9300, 6379, 11211].includes(port.port)) return 'Verificare esposizione di servizi backend/cache. Limitare accesso e autenticazione.';
  if (port.is_web) return 'Verificare patching, TLS, WAF, header di sicurezza e superficie applicativa.';
  return 'Verificare se il servizio è necessario e applicare principio di minima esposizione.';
}

type NormalizePortScannerOptions = {
  targetHost?: string;
};

const normalizeHostInput = (value: unknown): string =>
  String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

const isIpLike = (value: string): boolean =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(':');

export function normalizePortScannerOutput(
  output: unknown,
  options: NormalizePortScannerOptions = {},
): NormalizedOpenPort[] {
  const root = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>;
  const outputData = (root.output_data && typeof root.output_data === 'object'
    ? root.output_data
    : (root.data && typeof root.data === 'object' ? (root.data as any).output_data : {})) as Record<string, unknown>;

  const providerHosts = (Array.isArray(outputData.hostnames) ? outputData.hostnames : [])
    .map((entry) => normalizeHostInput(entry))
    .filter(Boolean);
  const targetHost = normalizeHostInput(options.targetHost || '');
  const providerHost = normalizeHostInput(providerHosts[0] || outputData.host || outputData.hostname || '');
  const ip = String(outputData.ip_address || outputData.ip || '').trim();
  const osGuess = String((outputData.os as any)?.name || (outputData.os as any)?.vendor || '').trim();
  const preferredHost = targetHost && !isIpLike(targetHost) ? targetHost : (providerHost || ip || 'unknown-host');

  const ports = Array.isArray(outputData.ports)
    ? outputData.ports
    : Array.isArray((outputData as any)?.open_ports)
      ? (outputData as any).open_ports
      : [];

  const out: NormalizedOpenPort[] = [];
  for (const rowEntry of ports) {
    const row = (rowEntry && typeof rowEntry === 'object' ? rowEntry : {}) as Record<string, unknown>;
    const port = Number(row.port_number ?? row.number ?? row.port);
    if (!Number.isFinite(port) || port < 1 || port > 65535) continue;
    const state = String(row.port_state || row.state || '').toLowerCase();
    if (state && !state.includes('open')) continue;

    const protocol = String(row.protocol || row.transport || 'tcp').toLowerCase() === 'udp' ? 'udp' : 'tcp';
    const serviceName = String(row.service_name || row.service || '').trim();
    const serviceVersion = String(row.service_version || row.version || '').trim();
    const serviceProduct = String(row.product || '').trim();
    const serviceExtraInfo = String(row.service_extrainfo || row.extra_info || '').trim();

    const normalized: NormalizedOpenPort = {
      host: preferredHost,
      ip: ip || undefined,
      target_host: targetHost || undefined,
      provider_hosts: providerHosts.slice(0, 10),
      port: Math.round(port),
      protocol,
      state: state || 'open',
      service_name: serviceName || undefined,
      service_product: serviceProduct || undefined,
      service_version: serviceVersion || undefined,
      service_extra_info: serviceExtraInfo || undefined,
      os_guess: osGuess || undefined,
      banner: [serviceProduct, serviceVersion, serviceExtraInfo].filter(Boolean).join(' ').trim() || undefined,
      is_web: isWebPort(Math.round(port), serviceName),
      is_tls: isTlsPort(Math.round(port), serviceName),
      exposure_level: 'info',
      raw: row,
    };

    normalized.exposure_level = calculateExposureLevel(normalized);
    normalized.remediation_hint = remediationHint(normalized);
    out.push(normalized);
  }

  const dedupe = new Map<string, NormalizedOpenPort>();
  for (const row of out) {
    const key = `${row.host}|${row.ip || ''}|${row.port}|${row.protocol}`;
    if (!dedupe.has(key)) dedupe.set(key, row);
  }
  return Array.from(dedupe.values());
}
