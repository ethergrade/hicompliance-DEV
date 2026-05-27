import { buildPortAndReconUrlCandidates } from './pentestToolsParamMapper.ts';
import {
  DEFAULT_SCAN_REQUEST,
  PENTEST_TOOL_IDS,
  type DiscoveredSubdomain,
  type NormalizedOpenPort,
  type NormalizedTarget,
  type SurfacePortTechScanRequest,
} from './pentestToolsTypes.ts';
import { validatePublicTarget } from './targetValidation.ts';

const IPV4_RX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const WEB_PORTS = [80, 443, 8080, 8443, 8000, 8888, 9443];

export type ExposureSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type ExposureFindingDraft = {
  finding_type: string;
  title: string;
  severity: ExposureSeverity;
  description: string;
  recommendation: string;
};

export type SurfacePortTechScanRequestResolved = SurfacePortTechScanRequest & {
  include_subdomain_discovery: boolean;
  include_port_scan: boolean;
  include_web_technology_detection: boolean;
  include_ssl_scan: boolean;
  include_network_vuln_scan: boolean;
  scan_depth: 'light' | 'deep' | 'custom';
  protocol: 'tcp' | 'udp' | 'both';
  check_alive: boolean;
  detect_service_version: boolean;
  detect_os: boolean;
  traceroute: boolean;
};

export function resolveRequestDefaults(input: Partial<SurfacePortTechScanRequest>): SurfacePortTechScanRequestResolved {
  return {
    tenant_id: String(input.tenant_id || '').trim(),
    customer_id: String(input.customer_id || '').trim(),
    assessment_id: input.assessment_id ? String(input.assessment_id) : undefined,
    scan_name: String(input.scan_name || '').trim() || `Exposure Scan ${new Date().toISOString()}`,
    root_domains: Array.isArray(input.root_domains) ? input.root_domains : [],
    subdomains: Array.isArray(input.subdomains) ? input.subdomains : [],
    public_ips: Array.isArray(input.public_ips) ? input.public_ips : [],
    include_subdomain_discovery: input.include_subdomain_discovery ?? DEFAULT_SCAN_REQUEST.include_subdomain_discovery,
    include_port_scan: input.include_port_scan ?? DEFAULT_SCAN_REQUEST.include_port_scan,
    include_web_technology_detection:
      input.include_web_technology_detection ?? DEFAULT_SCAN_REQUEST.include_web_technology_detection,
    include_ssl_scan: input.include_ssl_scan ?? DEFAULT_SCAN_REQUEST.include_ssl_scan,
    include_network_vuln_scan: input.include_network_vuln_scan ?? DEFAULT_SCAN_REQUEST.include_network_vuln_scan,
    scan_depth: (input.scan_depth || DEFAULT_SCAN_REQUEST.scan_depth) as 'light' | 'deep' | 'custom',
    protocol: (input.protocol || DEFAULT_SCAN_REQUEST.protocol) as 'tcp' | 'udp' | 'both',
    custom_ports: input.custom_ports ? String(input.custom_ports) : undefined,
    check_alive: input.check_alive ?? DEFAULT_SCAN_REQUEST.check_alive,
    detect_service_version: input.detect_service_version ?? DEFAULT_SCAN_REQUEST.detect_service_version,
    detect_os: input.detect_os ?? DEFAULT_SCAN_REQUEST.detect_os,
    traceroute: input.traceroute ?? DEFAULT_SCAN_REQUEST.traceroute,
  };
}

function normalizeList(values: unknown[]): string[] {
  const out = values
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .map((entry) => entry.toLowerCase());
  return [...new Set(out)];
}

export function normalizeTargets(input: SurfacePortTechScanRequestResolved): {
  targets: NormalizedTarget[];
  rejected: Array<{ value: string; reason: string; code: string }>;
} {
  const targets: NormalizedTarget[] = [];
  const rejected: Array<{ value: string; reason: string; code: string }> = [];

  const addTarget = (
    value: string,
    source: 'manual' | 'subdomain_finder' | 'existing_asset',
    rootHint?: string,
  ) => {
    const validated = validatePublicTarget(value);
    if (!validated.valid) {
      rejected.push({
        value,
        reason: validated.message,
        code: validated.code,
      });
      return;
    }

    const targetType = validated.targetType === 'ip'
      ? 'ip'
      : validated.targetType;

    targets.push({
      value: validated.normalized,
      type: targetType,
      source,
      root_domain: rootHint || validated.rootDomain,
    });
  };

  for (const domain of normalizeList(input.root_domains || [])) {
    addTarget(domain, 'manual');
  }

  for (const subdomain of normalizeList(input.subdomains || [])) {
    addTarget(subdomain, 'manual');
  }

  for (const ip of normalizeList(input.public_ips || [])) {
    addTarget(ip, 'manual');
  }

  const dedup = new Map<string, NormalizedTarget>();
  for (const target of targets) {
    const key = `${target.type}|${target.value.toLowerCase()}`;
    if (!dedup.has(key)) dedup.set(key, target);
  }

  return {
    targets: Array.from(dedup.values()),
    rejected,
  };
}

export function toolNameById(toolId: number): string {
  if (toolId === PENTEST_TOOL_IDS.SUBDOMAIN_FINDER) return 'Subdomain Finder';
  if (toolId === PENTEST_TOOL_IDS.PORT_SCANNER) return 'Port Scanner';
  if (toolId === PENTEST_TOOL_IDS.WEBSITE_RECON) return 'Website Recon';
  if (toolId === PENTEST_TOOL_IDS.NETWORK_SCANNER) return 'Network Scanner';
  if (toolId === PENTEST_TOOL_IDS.SSL_SCANNER) return 'SSL Scanner';
  return `Tool ${toolId}`;
}

export function normalizeScanStatus(status: unknown): 'queued' | 'running' | 'waiting' | 'finished' | 'failed' {
  const key = String(status || '').trim().toLowerCase();
  if (['queued', 'pending'].includes(key)) return 'queued';
  if (['running', 'in_progress', 'processing'].includes(key)) return 'running';
  if (['waiting', 'paused'].includes(key)) return 'waiting';
  if (['finished', 'completed', 'done'].includes(key)) return 'finished';
  return 'failed';
}

export function isTerminalErrorStatus(status: unknown): boolean {
  const key = String(status || '').trim().toLowerCase();
  return [
    'stopped',
    'failed',
    'failed to start',
    'timed out',
    'aborted',
    'vpn connection error',
    'auth failed',
    'connection error',
  ].includes(key);
}

export function isLikelyIp(value: string): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return IPV4_RX.test(normalized) || normalized.includes(':');
}

export function hostFromTargetValue(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase();
  }
}

export function isWebPortCandidate(port: NormalizedOpenPort): boolean {
  if (WEB_PORTS.includes(port.port)) return true;
  const service = String(port.service_name || '').toLowerCase();
  return /http|https|http-proxy|www/.test(service) || Boolean(port.is_web);
}

export function exposureFindingFromPort(port: NormalizedOpenPort): ExposureFindingDraft | null {
  const host = port.host;
  const serviceLabel = [port.service_name, port.service_product, port.service_version]
    .filter(Boolean)
    .join(' ')
    .trim();

  const serviceDescriptor = serviceLabel || `${port.port}/${port.protocol}`;

  const byPort: Record<number, ExposureFindingDraft> = {
    23: {
      finding_type: 'public_telnet_exposed',
      title: 'Servizio Telnet esposto pubblicamente',
      severity: 'high',
      description:
        `Il servizio Telnet risponde su ${host}:${port.port}. Telnet trasmette credenziali in chiaro ed è ad alto rischio.`,
      recommendation: 'Disabilitare Telnet e usare SSH con accesso limitato via VPN/allowlist + MFA.',
    },
    3389: {
      finding_type: 'public_rdp_exposed',
      title: 'Servizio RDP esposto pubblicamente',
      severity: 'high',
      description:
        `Il servizio RDP è raggiungibile da Internet su ${host}:${port.port}, con rischio di brute-force e accessi non autorizzati.`,
      recommendation: 'Non esporre RDP in Internet; usare VPN/ZTNA, MFA, bastion host e allowlist IP.',
    },
    445: {
      finding_type: 'public_smb_exposed',
      title: 'Servizio SMB esposto pubblicamente',
      severity: 'high',
      description:
        `Il servizio SMB risulta esposto su ${host}:${port.port}; questa esposizione è frequentemente sfruttata in attacchi laterali.`,
      recommendation: 'Bloccare SMB su Internet e limitarlo a reti private/VPN con segmentazione.',
    },
    21: {
      finding_type: 'public_ftp_exposed',
      title: 'Servizio FTP esposto pubblicamente',
      severity: 'high',
      description: `Il servizio FTP è esposto su ${host}:${port.port}; può comportare rischio di credenziali deboli o traffico non cifrato.`,
      recommendation: 'Disabilitare FTP legacy o migrare a SFTP/FTPS con hardening e allowlist.',
    },
    3306: {
      finding_type: 'public_db_exposed',
      title: 'Database MySQL esposto pubblicamente',
      severity: 'critical',
      description: `È stato rilevato un endpoint database pubblico (${serviceDescriptor}) su ${host}:${port.port}.`,
      recommendation: 'Rimuovere esposizione Internet del DB, usare private networking, ACL e bastion.',
    },
    5432: {
      finding_type: 'public_db_exposed',
      title: 'Database PostgreSQL esposto pubblicamente',
      severity: 'critical',
      description: `È stato rilevato un endpoint database pubblico (${serviceDescriptor}) su ${host}:${port.port}.`,
      recommendation: 'Rimuovere esposizione Internet del DB, usare private networking, ACL e bastion.',
    },
    1433: {
      finding_type: 'public_db_exposed',
      title: 'Database MSSQL esposto pubblicamente',
      severity: 'critical',
      description: `È stato rilevato un endpoint database pubblico (${serviceDescriptor}) su ${host}:${port.port}.`,
      recommendation: 'Rimuovere esposizione Internet del DB, usare private networking, ACL e bastion.',
    },
    1521: {
      finding_type: 'public_db_exposed',
      title: 'Database Oracle esposto pubblicamente',
      severity: 'critical',
      description: `È stato rilevato un endpoint database pubblico (${serviceDescriptor}) su ${host}:${port.port}.`,
      recommendation: 'Rimuovere esposizione Internet del DB, usare private networking, ACL e bastion.',
    },
    27017: {
      finding_type: 'public_db_exposed',
      title: 'Database MongoDB esposto pubblicamente',
      severity: 'critical',
      description: `È stato rilevato un endpoint database pubblico (${serviceDescriptor}) su ${host}:${port.port}.`,
      recommendation: 'Rimuovere esposizione Internet del DB, usare private networking, ACL e bastion.',
    },
    6379: {
      finding_type: 'public_cache_exposed',
      title: 'Servizio Redis esposto pubblicamente',
      severity: 'critical',
      description: `Il servizio Redis risulta esposto su ${host}:${port.port}.`,
      recommendation: 'Limitare Redis a rete privata, autenticazione forte e ACL firewall strette.',
    },
    11211: {
      finding_type: 'public_cache_exposed',
      title: 'Servizio Memcached esposto pubblicamente',
      severity: 'critical',
      description: `Il servizio Memcached risulta esposto su ${host}:${port.port}.`,
      recommendation: 'Limitare Memcached a rete privata, bloccare accesso Internet e applicare ACL.',
    },
    9200: {
      finding_type: 'public_search_exposed',
      title: 'Servizio Elasticsearch esposto pubblicamente',
      severity: 'critical',
      description: `Il servizio Elasticsearch è raggiungibile da Internet su ${host}:${port.port}.`,
      recommendation: 'Rimuovere esposizione pubblica, abilitare autenticazione e accesso solo da reti autorizzate.',
    },
    9300: {
      finding_type: 'public_search_exposed',
      title: 'Servizio Elasticsearch transport esposto',
      severity: 'critical',
      description: `La porta transport Elasticsearch è raggiungibile su ${host}:${port.port}.`,
      recommendation: 'Bloccare la porta transport in Internet e limitare la comunicazione al cluster interno.',
    },
    22: {
      finding_type: 'public_ssh_exposed',
      title: 'Servizio SSH esposto pubblicamente',
      severity: 'medium',
      description: `Il servizio SSH risponde su ${host}:${port.port}; è necessario hardening e controllo accessi rigoroso.`,
      recommendation: 'Limitare SSH via allowlist/VPN, disabilitare password auth, usare MFA/bastion.',
    },
    2222: {
      finding_type: 'public_ssh_exposed',
      title: 'Servizio SSH (porta non standard) esposto',
      severity: 'medium',
      description: `Il servizio SSH risponde su ${host}:${port.port}.`,
      recommendation: 'Limitare SSH via allowlist/VPN, disabilitare password auth, usare MFA/bastion.',
    },
    8080: {
      finding_type: 'public_admin_web_exposed',
      title: 'Servizio web amministrativo esposto',
      severity: 'medium',
      description: `Porta web amministrativa ${port.port} aperta su ${host}.`,
      recommendation: 'Proteggere con VPN/ZTNA, MFA, restrizioni IP e hardening del pannello.',
    },
    8443: {
      finding_type: 'public_admin_web_exposed',
      title: 'Servizio web amministrativo TLS esposto',
      severity: 'medium',
      description: `Porta web amministrativa TLS ${port.port} aperta su ${host}.`,
      recommendation: 'Proteggere con VPN/ZTNA, MFA, restrizioni IP e hardening del pannello.',
    },
    9443: {
      finding_type: 'public_admin_web_exposed',
      title: 'Servizio web amministrativo TLS esposto',
      severity: 'medium',
      description: `Porta web amministrativa TLS ${port.port} aperta su ${host}.`,
      recommendation: 'Proteggere con VPN/ZTNA, MFA, restrizioni IP e hardening del pannello.',
    },
    10000: {
      finding_type: 'public_admin_web_exposed',
      title: 'Pannello amministrativo esposto pubblicamente',
      severity: 'medium',
      description: `La porta ${port.port} tipicamente usata per pannelli admin è raggiungibile su ${host}.`,
      recommendation: 'Limitare accesso con allowlist/VPN e abilitare MFA + logging avanzato.',
    },
    25: {
      finding_type: 'public_smtp_exposed',
      title: 'Servizio SMTP esposto pubblicamente',
      severity: 'medium',
      description: `Il servizio SMTP risponde su ${host}:${port.port}.`,
      recommendation: 'Verificare necessità di esposizione, relay controls e autenticazione robusta.',
    },
    465: {
      finding_type: 'public_smtp_exposed',
      title: 'Servizio SMTPS esposto pubblicamente',
      severity: 'medium',
      description: `Il servizio SMTPS risponde su ${host}:${port.port}.`,
      recommendation: 'Verificare necessità di esposizione, relay controls e configurazione TLS.',
    },
    587: {
      finding_type: 'public_smtp_exposed',
      title: 'Servizio Submission SMTP esposto',
      severity: 'medium',
      description: `Il servizio submission SMTP risponde su ${host}:${port.port}.`,
      recommendation: 'Limitare accesso, imporre autenticazione e monitorare abuso credenziali.',
    },
  };

  const mapped = byPort[port.port];
  if (mapped) return mapped;

  if (port.is_web || port.is_tls) {
    return {
      finding_type: 'public_web_service_exposed',
      title: 'Servizio web esposto pubblicamente',
      severity: 'info',
      description: `Servizio web rilevato su ${host}:${port.port} (${serviceDescriptor}).`,
      recommendation: 'Verificare patching, TLS, header sicurezza e WAF sulla superficie web esposta.',
    };
  }

  return {
    finding_type: 'public_service_exposed',
    title: 'Servizio esposto pubblicamente',
    severity: 'low',
    description: `Servizio ${serviceDescriptor} esposto su ${host}:${port.port}.`,
    recommendation: 'Confermare necessità del servizio e applicare principio di minima esposizione.',
  };
}

export function mergeDiscoveredSubdomains(existing: NormalizedTarget[], discovered: DiscoveredSubdomain[]): NormalizedTarget[] {
  const merged = new Map<string, NormalizedTarget>();
  for (const target of existing) {
    merged.set(`${target.type}|${target.value.toLowerCase()}`, target);
  }

  for (const sub of discovered || []) {
    if (!sub.hostname) continue;
    const validated = validatePublicTarget(sub.hostname);
    if (!validated.valid) continue;
    const normalized: NormalizedTarget = {
      value: validated.normalized,
      type: validated.targetType === 'ip' ? 'ip' : validated.targetType,
      source: 'subdomain_finder',
      root_domain: validated.rootDomain,
    };
    merged.set(`${normalized.type}|${normalized.value.toLowerCase()}`, normalized);
  }

  return Array.from(merged.values());
}

export function reconCandidatesFromOpenPorts(host: string, ports: NormalizedOpenPort[]): Array<{ url: string; port: number }> {
  const out: Array<{ url: string; port: number }> = [];
  for (const port of ports) {
    if (!isWebPortCandidate(port)) continue;
    const urls = buildPortAndReconUrlCandidates(host, port.port, port.service_name);
    for (const url of urls) {
      out.push({ url, port: port.port });
    }
  }

  const dedupe = new Map<string, { url: string; port: number }>();
  for (const row of out) {
    const key = `${row.url}|${row.port}`;
    if (!dedupe.has(key)) dedupe.set(key, row);
  }
  return Array.from(dedupe.values());
}

