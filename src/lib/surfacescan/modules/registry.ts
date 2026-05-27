export type ModuleStatus = 'success' | 'skipped' | 'error' | 'timeout' | 'running' | 'queued';

export type ModuleKey =
  | 'passes'
  | 'http_security'
  | 'headers'
  | 'dnssec'
  | 'whois'
  | 'ssl_certificate'
  | 'tls_summary'
  | 'quality'
  | 'threats'
  | 'subdomains'
  | 'open_ports'
  | 'server_location'
  | 'server_info'
  | 'tech_stack'
  | 'mail_config'
  | 'redirects'
  | 'dns_blocklists';

export type ModuleResult = {
  key: string;
  label: string;
  status: ModuleStatus;
  source?: string;
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
  score?: number;
  normalized: Record<string, unknown>;
  raw: Record<string, unknown>;
  findings?: Array<{
    findingKey: string;
    title: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    description?: string;
    evidence?: Record<string, unknown>;
    remediation?: string;
    references?: string[];
  }>;
  errorMessage?: string;
};

export type ModuleDefinition = {
  key: ModuleKey;
  label: string;
  profiles: Array<'quick' | 'full' | 'deep'>;
  timeoutMs: number;
  requiresUrl?: boolean;
  requiresDomain?: boolean;
  requiresIp?: boolean;
  featureFlag?: string;
};

export const SURFACESCAN_MODULE_REGISTRY: ModuleDefinition[] = [
  { key: 'passes', label: 'Passes Summary', profiles: ['full', 'deep'], timeoutMs: 15000, featureFlag: 'SURFACESCAN_ENABLE_WEBCHECK_MODULES' },
  { key: 'http_security', label: 'HTTP Security', profiles: ['quick', 'full', 'deep'], timeoutMs: 18000 },
  { key: 'headers', label: 'HTTP Headers', profiles: ['quick', 'full', 'deep'], timeoutMs: 18000 },
  { key: 'dnssec', label: 'DNSSEC', profiles: ['full', 'deep'], timeoutMs: 8000, featureFlag: 'SURFACESCAN_ENABLE_DNSSEC' },
  { key: 'whois', label: 'WHOIS/RDAP', profiles: ['full', 'deep'], timeoutMs: 12000 },
  { key: 'ssl_certificate', label: 'SSL Certificate', profiles: ['full', 'deep'], timeoutMs: 15000 },
  { key: 'tls_summary', label: 'TLS Summary', profiles: ['full', 'deep'], timeoutMs: 15000 },
  { key: 'quality', label: 'Quality Metrics', profiles: ['deep'], timeoutMs: 35000, featureFlag: 'SURFACESCAN_ENABLE_QUALITY' },
  { key: 'threats', label: 'Threat Checks', profiles: ['full', 'deep'], timeoutMs: 18000, featureFlag: 'SURFACESCAN_ENABLE_THREATS' },
  { key: 'subdomains', label: 'Subdomain Discovery', profiles: ['full', 'deep'], timeoutMs: 30000, featureFlag: 'SURFACESCAN_ENABLE_SUBDOMAINS' },
  { key: 'open_ports', label: 'Open Ports', profiles: ['deep'], timeoutMs: 240000, featureFlag: 'SURFACESCAN_ENABLE_OPEN_PORTS' },
  { key: 'server_location', label: 'Server Location', profiles: ['full', 'deep'], timeoutMs: 10000 },
  { key: 'server_info', label: 'Server Info', profiles: ['full', 'deep'], timeoutMs: 10000 },
  { key: 'tech_stack', label: 'Tech Stack', profiles: ['full', 'deep'], timeoutMs: 15000 },
  { key: 'mail_config', label: 'Mail Config', profiles: ['full', 'deep'], timeoutMs: 12000 },
  { key: 'redirects', label: 'Redirect Chain', profiles: ['quick', 'full', 'deep'], timeoutMs: 12000 },
  { key: 'dns_blocklists', label: 'DNS Blocklists', profiles: ['full', 'deep'], timeoutMs: 15000 },
];
