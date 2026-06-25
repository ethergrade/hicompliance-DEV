/**
 * ConnectSecure (CyberCNS) Attack Surface Mapper — API Adapter
 *
 * Auth flow: POST /w/authorize { Client-Auth-Token: base64(tenantId+clientId:secret) }
 *            → { access_token, user_id }
 * Re-autentica automaticamente su 401.
 *
 * Workflow: authorize → getOrCreateDomain → scanNow → waitForJob → getResults → mapToFindings
 */

export interface CsConfig {
  pod_host:           string;   // es. pod401.myconnectsecure.com
  client_auth_token:  string;   // già base64-encoded per header Client-Auth-Token
  company_id:         number;
}

export interface CsSession {
  token:  string;
  userId: string;
}

function normalizePodHost(podHost: string): string {
  return String(podHost || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function csUrl(cfg: CsConfig, path: string): string {
  return `https://${normalizePodHost(cfg.pod_host)}${path}`;
}

function safeErrorBody(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[redacted]"')
    .replace(/"Client-Auth-Token"\s*:\s*"[^"]+"/gi, '"Client-Auth-Token":"[redacted]"')
    .substring(0, 300);
}

export interface CsJob {
  id:          string | number;
  type:        string;
  status:      string;
  description: string;
  created_at?: string;
}

export interface CsTargetIp {
  'IP Address': string;
  ASN?:         string;
  Location?:    string;
  port_protocol?: string[];
  Vulnerabities?: string; // CSV di CVE IDs (typo intenzionale nella loro API)
}

export interface CsSubdomain {
  subdomain:   string;
  dns_records?: Array<{ type: string; value: string }>;
}

export interface CsResult {
  id:                   number;
  name:                 string;
  website:              string;
  status:               string;
  attack_surface_domain_id: number;
  company_id:           number;
  target_ips?:          CsTargetIp[];
  subdomains?:          CsSubdomain[];
  dns_records?:         Array<{ type: string; value: string }>;
  mx?:                  { hosts?: string[]; warnings?: string[]; error?: string };
  spf?:                 { valid?: boolean; record?: string; warnings?: string[]; dns_lookups?: number };
  dmarc?:               { valid?: boolean; record?: string; location?: string; warnings?: string[] };
  email_spoof_checks?:  Array<{ check: string; result: string; passed?: boolean }>;
  emails?:              string[];
  guessed_emails?:      string[];
  usernames?:           string[];
  employees?:           Array<{ name?: string; title?: string; email?: string }>;
  raw_headers?:         Record<string, string>;
  s3buckets?:           Array<{ name?: string; url?: string; public?: boolean }>;
  creds?:               Array<Record<string, unknown>>;
  hashes?:              Array<Record<string, unknown>>;
  created?:             string;
  updated?:             string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function csAuthorize(cfg: CsConfig): Promise<CsSession> {
  const token = cfg.client_auth_token.trim();
  const url = csUrl(cfg, '/w/authorize');
  const r = await fetch(url, {
    method:  'POST',
    headers: {
      accept:              'application/json',
      'Client-Auth-Token': token,
    },
    body: '',
  });
  const rawText = await r.text().catch(() => '');
  if (!r.ok) {
    throw new Error(`[ConnectSecure] authorize failed: ${r.status}${rawText ? ' - ' + safeErrorBody(rawText) : ''}`);
  }
  let body: any;
  try { body = JSON.parse(rawText); } catch {
    throw new Error(`[ConnectSecure] non-JSON response: ${safeErrorBody(rawText)}`);
  }
  // CS returns access_token both at root and inside data{}
  const accessToken = body?.data?.access_token ?? body?.access_token;
  const userId      = body?.data?.user_id      ?? body?.user_id;
  if (!accessToken) {
    throw new Error(`[ConnectSecure] auth failed — ${JSON.stringify(body).substring(0, 300)}`);
  }
  return { token: String(accessToken), userId: String(userId) };
}

function authHeaders(session: CsSession, mode: 'raw' | 'bearer' = 'raw'): Record<string, string> {
  return {
    accept:         'application/json',
    'Content-Type': 'application/json',
    Authorization:  mode === 'bearer' ? `Bearer ${session.token}` : session.token,
    'X-USER-ID':    session.userId,
  };
}

// Wrapper con retry su 401
async function csFetch<T>(
  cfg:     CsConfig,
  session: { current: CsSession },
  url:     string,
  options: RequestInit = {},
): Promise<T> {
  const extraHeaders = (options.headers as Record<string, string> || {});
  let r = await fetch(url, { ...options, headers: { ...authHeaders(session.current, 'raw'), ...extraHeaders } });
  if (r.status === 401) {
    session.current = await csAuthorize(cfg);
    r = await fetch(url, { ...options, headers: { ...authHeaders(session.current, 'raw'), ...extraHeaders } });
  }
  if (r.status === 401) {
    r = await fetch(url, { ...options, headers: { ...authHeaders(session.current, 'bearer'), ...extraHeaders } });
  }
  if (!r.ok) throw new Error(`[ConnectSecure] ${url} -> ${r.status} ${safeErrorBody(await r.text().catch(() => ''))}`);
  return await r.json() as T;
}

// ── Domain registry ───────────────────────────────────────────────────────────

export async function csGetOrCreateDomain(
  cfg:     CsConfig,
  session: { current: CsSession },
  domain:  string,
  adminClient: { from: (t: string) => any },
  orgId:   string,
): Promise<number> {
  // 1. Check locale (evita doppia creazione)
  const { data: existing } = await adminClient
    .from('connectsecure_domain_registry')
    .select('cs_domain_id')
    .eq('organization_id', orgId)
    .eq('domain', domain)
    .maybeSingle();
  if (existing?.cs_domain_id) return Number(existing.cs_domain_id);

  // 2. Crea il domain in ConnectSecure
  const url = csUrl(cfg, '/w/company/attack_surface_domain');
  const body = await csFetch<{ id?: string | number; status: boolean }>(cfg, session, url, {
    method: 'POST',
    body:   JSON.stringify({ data: { name: domain, domain, scanlater: false, company_id: cfg.company_id } }),
  });
  const domainId = Number(body.id);
  if (!domainId || !body.status) throw new Error(`[ConnectSecure] createDomain failed for ${domain}`);

  // 3. Salva nel registry
  await adminClient.from('connectsecure_domain_registry').upsert({
    organization_id: orgId,
    domain,
    cs_domain_id:    domainId,
  }, { onConflict: 'organization_id,domain' });

  return domainId;
}

// ── Scan trigger ──────────────────────────────────────────────────────────────

export async function csScanNow(
  cfg:     CsConfig,
  session: { current: CsSession },
  domains: Array<{ name: string; domain: string; company_id: number; id: number }>,
): Promise<void> {
  if (domains.length === 0) return;
  const url = csUrl(cfg, '/w/attack_surface/scan_now');
  const body = await csFetch<{ status: boolean; message: string }>(cfg, session, url, {
    method: 'POST',
    body:   JSON.stringify({ scan_data: domains.map(d => ({ name: d.name, domain: d.domain, company_id: d.company_id, id: d.id })) }),
  });
  if (!body.status) throw new Error(`[ConnectSecure] scan_now failed: ${body.message}`);
}

// ── Job polling ───────────────────────────────────────────────────────────────

export async function csWaitForJob(
  cfg:       CsConfig,
  session:   { current: CsSession },
  domain:    string,
  timeoutMs: number = 420_000,
): Promise<CsJob> {
  const deadline = Date.now() + timeoutMs;
  const pollMs   = 20_000;

  while (Date.now() < deadline) {
    const url = csUrl(cfg, `/r/company/jobs?condition=company_id=${cfg.company_id}&order_by=created desc&limit=30`);
    const body = await csFetch<{ data?: CsJob[]; status: boolean }>(cfg, session, url);
    const jobs: CsJob[] = Array.isArray(body.data) ? body.data : [];
    const job = jobs.find(j =>
      j.type === 'ATTACKSURFACESCAN' &&
      String(j.description || '').toLowerCase().includes(domain.toLowerCase())
    );
    if (job) {
      if (/completed/i.test(job.status)) return job;
      if (/failed/i.test(job.status)) throw new Error(`[ConnectSecure] scan failed for ${domain}: ${job.description}`);
    }
    await new Promise(res => setTimeout(res, pollMs));
  }
  throw new Error(`[ConnectSecure] scan timed out after ${timeoutMs}ms for ${domain}`);
}

// ── Results ───────────────────────────────────────────────────────────────────

export async function csGetResults(
  cfg:      CsConfig,
  session:  { current: CsSession },
  domainId: number,
): Promise<CsResult | null> {
  const url = csUrl(cfg, `/r/company/attack_surface_results?condition=attack_surface_domain_id=${domainId}&order_by=updated desc`);
  const body = await csFetch<{ data?: CsResult[]; status: boolean }>(cfg, session, url);
  const results = Array.isArray(body.data) ? body.data : [];
  if (results.length === 0) return null;
  const r = results[0];
  return /completed/i.test(r.status || '') ? r : null;
}

export async function csWaitForResults(
  cfg:       CsConfig,
  session:   { current: CsSession },
  domainId:  number,
  domain:    string,
  timeoutMs: number = 420_000,
): Promise<CsResult> {
  const deadline = Date.now() + timeoutMs;
  const pollMs   = 20_000;

  while (Date.now() < deadline) {
    const url = csUrl(cfg, `/r/company/attack_surface_results?condition=attack_surface_domain_id=${domainId}&order_by=updated desc`);
    const body = await csFetch<{ data?: CsResult[]; status: boolean }>(cfg, session, url);
    const results = Array.isArray(body.data) ? body.data : [];
    const result = results[0];

    if (result) {
      if (/completed/i.test(result.status || '')) return result;
      if (/failed|error/i.test(result.status || '')) {
        throw new Error(`[ConnectSecure] scan failed for ${domain}: ${result.status}`);
      }
    }

    await new Promise(res => setTimeout(res, pollMs));
  }

  throw new Error(`[ConnectSecure] result polling timed out after ${timeoutMs}ms for ${domain}`);
}

// ── Mapping ConnectSecure result → surface DB types ───────────────────────────

export interface CsMappedAsset {
  asset_type: 'subdomain' | 'ipv4' | 'ipv6' | 'domain';
  asset_value: string;
  hostname?: string;
  root_domain?: string;
  ip?: string;
  source: 'connectsecure';
  confidence: 'high';
  raw?: Record<string, unknown>;
}

export interface CsMappedFinding {
  provider:      'connectsecure';
  module:        string;
  finding_type:  string;
  severity:      'critical' | 'high' | 'medium' | 'low' | 'info';
  title:         string;
  description:   string;
  affected_asset: string;
  ip?:           string;
  port?:         number;
  protocol?:     string;
  cve?:          string[];
  cwe?:          string[];
  cvss?:         number;
  evidence?:     Record<string, unknown>;
  remediation?:  string;
}

export interface CsMappedPort {
  port:         number;
  host:         string;
  ip:           string;
  protocol:     string;
  serviceName?: string;
  serviceVersion?: string;
  banner?:      string;
}

export interface CsMapResult {
  assets:         CsMappedAsset[];
  findings:       CsMappedFinding[];
  ports:          CsMappedPort[];
  observations:   Array<{ type: string; title: string; value: Record<string, unknown>; severity: string }>;
  sensitiveData:  { creds?: Array<Record<string, unknown>>; hashes?: Array<Record<string, unknown>>; domain: string };
}

function parseCsvCves(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim().toUpperCase()).filter(s => /^CVE-\d{4}-\d+$/.test(s));
}

function sevFromCvss(cvss?: number): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  if (!cvss) return 'info';
  if (cvss >= 9.0) return 'critical';
  if (cvss >= 7.0) return 'high';
  if (cvss >= 4.0) return 'medium';
  return 'low';
}

const HIGH_RISK_PORTS = new Set([3389, 5900, 6379, 9200, 27017, 11211, 2375, 10250, 1521, 1433]);
const MEDIUM_RISK_PORTS = new Set([21, 23, 445, 3306, 5432, 8080, 8443, 8888, 9000, 22]);

function portSeverity(p: number): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  if (HIGH_RISK_PORTS.has(p)) return 'critical';
  if (MEDIUM_RISK_PORTS.has(p)) return 'medium';
  if ([80, 443].includes(p)) return 'info';
  return 'low';
}

export function csMapToFindings(result: CsResult, rootDomain: string, depth: number): CsMapResult {
  const assets:       CsMappedAsset[]   = [];
  const findings:     CsMappedFinding[] = [];
  const ports:        CsMappedPort[]    = [];
  const observations: CsMapResult['observations'] = [];

  // ── Subdomains → assets ───────────────────────────────────────────────────
  for (const sub of result.subdomains || []) {
    const domain = String(sub.subdomain || '').trim().toLowerCase();
    if (!domain) continue;
    assets.push({ asset_type: 'subdomain', asset_value: domain, hostname: domain, root_domain: rootDomain, source: 'connectsecure', confidence: 'high', raw: { depth } });
  }

  // ── target_ips → ports + CVE findings ────────────────────────────────────
  for (const target of result.target_ips || []) {
    const ip = String(target['IP Address'] || '').trim();
    if (!ip) continue;
    assets.push({ asset_type: 'ipv4', asset_value: ip, ip, root_domain: rootDomain, source: 'connectsecure', confidence: 'high' });

    const cves = parseCsvCves(target.Vulnerabities);
    const portProtos = Array.isArray(target.port_protocol) ? target.port_protocol : [];

    for (const ppRaw of portProtos) {
      const [portStr, proto = 'tcp'] = String(ppRaw).split('/');
      const port = parseInt(portStr, 10);
      if (!port || isNaN(port)) continue;

      ports.push({ port, host: ip, ip, protocol: proto.toLowerCase() });

      findings.push({
        provider:      'connectsecure',
        module:        'connectsecure',
        finding_type:  'open_port_exposed',
        severity:      portSeverity(port),
        title:         `Porta ${port}/${proto.toLowerCase()} esposta su ${ip}`,
        description:   `IP ${ip}: porta ${port}/${proto.toLowerCase()} aperta.${cves.length ? ` CVE associati: ${cves.slice(0, 3).join(', ')}` : ''}`,
        affected_asset: ip,
        ip,
        port,
        protocol:      proto.toLowerCase(),
        cve:           cves,
        evidence:      { source: 'connectsecure', ip, port, asn: target.ASN, location: target.Location },
      });
    }

    // Vulnerabilità generali dell'IP (senza porta specifica)
    if (cves.length > 0 && portProtos.length === 0) {
      findings.push({
        provider:      'connectsecure',
        module:        'connectsecure',
        finding_type:  'vulnerability_detected',
        severity:      'high',
        title:         `Vulnerabilità rilevate su ${ip}`,
        description:   `CVE associati all'IP ${ip}: ${cves.join(', ')}`,
        affected_asset: ip,
        ip,
        cve:           cves,
        evidence:      { source: 'connectsecure', asn: target.ASN },
      });
    }
  }

  // ── Mail security (SPF/DMARC/MX) ─────────────────────────────────────────
  const mailWarnings: string[] = [
    ...(result.mx?.warnings || []),
    ...(result.spf?.warnings || []),
    ...(result.dmarc?.warnings || []),
  ].filter(Boolean);

  if (mailWarnings.length > 0 || result.spf?.valid === false || result.dmarc?.valid === false) {
    const sevScore = (!result.spf?.valid ? 1 : 0) + (!result.dmarc?.valid ? 1 : 0) + (mailWarnings.length > 2 ? 1 : 0);
    findings.push({
      provider:      'connectsecure',
      module:        'connectsecure',
      finding_type:  'dns_mail_security',
      severity:      sevScore >= 2 ? 'high' : 'medium',
      title:         `Configurazione email non sicura per ${rootDomain}`,
      description:   `SPF valido: ${result.spf?.valid ?? 'N/A'}. DMARC valido: ${result.dmarc?.valid ?? 'N/A'}. Warning: ${mailWarnings.slice(0, 3).join('; ')}`,
      affected_asset: rootDomain,
      evidence:      { spf: result.spf, dmarc: result.dmarc, mx: result.mx },
      remediation:   'Configurare SPF, DMARC e DKIM per il dominio.',
    });
  }

  // ── Email spoofing ────────────────────────────────────────────────────────
  const failedSpoofChecks = (result.email_spoof_checks || []).filter(c => c.passed === false || /fail/i.test(c.result || ''));
  if (failedSpoofChecks.length > 0) {
    findings.push({
      provider:      'connectsecure',
      module:        'connectsecure',
      finding_type:  'email_spoofing',
      severity:      'high',
      title:         `Dominio ${rootDomain} vulnerabile a spoofing email`,
      description:   `${failedSpoofChecks.length} controlli anti-spoofing falliti: ${failedSpoofChecks.map(c => c.check).join(', ')}`,
      affected_asset: rootDomain,
      evidence:      { failed_checks: failedSpoofChecks },
      remediation:   'Configurare DMARC policy=reject e SPF ~all / -all.',
    });
  }

  // ── S3 Buckets esposti ────────────────────────────────────────────────────
  for (const bucket of result.s3buckets || []) {
    findings.push({
      provider:      'connectsecure',
      module:        'connectsecure',
      finding_type:  'exposed_storage_bucket',
      severity:      'high',
      title:         `Bucket storage esposto: ${bucket.name || bucket.url || 'sconosciuto'}`,
      description:   `Bucket ${bucket.name || ''} (${bucket.url || ''}) risulta pubblicamente accessibile.`,
      affected_asset: bucket.url || bucket.name || rootDomain,
      evidence:      { bucket, source: 'connectsecure' },
      remediation:   'Impostare il bucket come privato e rivedere le policy di accesso.',
    });
  }

  // ── Observations: emails, employees, DNS ─────────────────────────────────
  if ((result.emails?.length || 0) + (result.guessed_emails?.length || 0) > 0) {
    observations.push({
      type:     'discovered_emails',
      title:    `Email scoperte per ${rootDomain}`,
      value:    { emails: result.emails || [], guessed: result.guessed_emails || [], usernames: result.usernames || [] },
      severity: 'info',
    });
  }
  if ((result.employees?.length || 0) > 0) {
    observations.push({
      type:     'osint_employees',
      title:    `Dipendenti rilevati via OSINT per ${rootDomain}`,
      value:    { employees: result.employees || [] },
      severity: 'info',
    });
  }
  if ((result.dns_records?.length || 0) > 0) {
    observations.push({
      type:     'dns_records',
      title:    `Record DNS per ${rootDomain}`,
      value:    { dns_records: result.dns_records || [] },
      severity: 'info',
    });
  }
  if (result.raw_headers?.server) {
    observations.push({
      type:     'http_server_banner',
      title:    `Server HTTP rilevato per ${rootDomain}`,
      value:    { server: result.raw_headers.server, headers: result.raw_headers },
      severity: 'info',
    });
  }

  return {
    assets,
    findings,
    ports,
    observations,
    sensitiveData: {
      creds:  result.creds,
      hashes: result.hashes,
      domain: rootDomain,
    },
  };
}

// ── External Scan — Discovery Settings ───────────────────────────────────────

export interface CsDiscoverySetting {
  id:                       number;
  name:                     string;
  address:                  string;
  address_type:             string;
  company_id:               number;
  discovery_settings_type?: string;
}

export async function csGetDiscoverySettings(
  cfg:     CsConfig,
  session: { current: CsSession },
): Promise<CsDiscoverySetting[]> {
  const url = csUrl(cfg, `/r/company/discovery_settings?condition=company_id=${cfg.company_id}`);
  const body = await csFetch<{ data?: CsDiscoverySetting[]; status: boolean }>(cfg, session, url);
  return Array.isArray(body.data) ? body.data : [];
}

export async function csCreateDiscoverySetting(
  cfg:         CsConfig,
  session:     { current: CsSession },
  address:     string,
  addressType: 'domain' | 'ipaddress' = 'domain',
): Promise<number | null> {
  const url  = csUrl(cfg, '/w/company/discovery_settings');
  const body = await csFetch<{ status: boolean; id?: string }>(cfg, session, url, {
    method: 'POST',
    body:   JSON.stringify({
      data: {
        name:                    address,
        address_type:            addressType,
        address,
        company_id:              cfg.company_id,
        discovery_settings_type: 'External',
        scan_later:              false,
        is_excluded:             false,
      },
    }),
  });
  return body.id ? Number(body.id) : null;
}

// ── External Scan — Trigger ───────────────────────────────────────────────────

export async function csExternalScan(
  cfg:               CsConfig,
  session:           { current: CsSession },
  discoverySettings: number[],
): Promise<{ status: boolean; message?: string }> {
  const url = csUrl(cfg, '/w/company/external_scan');
  return await csFetch<{ status: boolean; message?: string }>(cfg, session, url, {
    method: 'POST',
    body:   JSON.stringify({ company_id: cfg.company_id, discovery_settings: discoverySettings }),
  });
}

// ── External Scan — Results ───────────────────────────────────────────────────

export interface CsExternalAsset {
  id:          number;
  name:        string;
  config_name: string;
  host_name:   string;
  ip:          string;
  grade:       string;
  critical:    string | number;
  high:        string | number;
  medium:      string | number;
  low:         string | number;
  vul_count:   number;
  created:     string;
  updated:     string;
}

export async function csGetExternalScanAssets(
  cfg:     CsConfig,
  session: { current: CsSession },
): Promise<CsExternalAsset[]> {
  const url = csUrl(cfg, `/r/report_queries/external_asset_externalscan?condition=company_id=${cfg.company_id}`);
  const body = await csFetch<{ data?: CsExternalAsset[]; status: boolean }>(cfg, session, url);
  return Array.isArray(body.data) ? body.data : [];
}

export interface CsExternalPort {
  asset_id:  number;
  port:      number;
  protocol:  string;
  service:   string;
  product:   string;
  extrainfo: string;
  status:    string;
}

export async function csGetExternalPorts(
  cfg:     CsConfig,
  session: { current: CsSession },
  assetId: number,
): Promise<CsExternalPort[]> {
  const url = csUrl(cfg, `/r/report_queries/external_asset_ports_data?condition=asset_id=${assetId}`);
  const body = await csFetch<{ data?: CsExternalPort[]; status: boolean }>(cfg, session, url);
  return Array.isArray(body.data) ? body.data : [];
}

export interface CsExternalVuln {
  asset_id: number;
  key:      string;
  value:    string;
}

export async function csGetExternalVulns(
  cfg:     CsConfig,
  session: { current: CsSession },
  assetId: number,
): Promise<CsExternalVuln[]> {
  const url = csUrl(cfg, `/r/report_queries/external_asset_vulnerabilities?condition=asset_id=${assetId}`);
  const body = await csFetch<{ data?: CsExternalVuln[]; status: boolean }>(cfg, session, url);
  return Array.isArray(body.data) ? body.data : [];
}

// ── Map external scan results → surface DB ────────────────────────────────────

export interface CsExternalMapResult {
  assets:   CsMappedAsset[];
  findings: CsMappedFinding[];
  ports:    CsMappedPort[];
}

export function csMapExternalToFindings(
  asset: CsExternalAsset,
  ports: CsExternalPort[],
  vulns: CsExternalVuln[],
): CsExternalMapResult {
  const assets:      CsMappedAsset[]   = [];
  const findings:    CsMappedFinding[] = [];
  const mappedPorts: CsMappedPort[]    = [];

  const hostname = asset.host_name || asset.name || '';
  const ip       = asset.ip || '';

  if (hostname) {
    assets.push({
      asset_type:  'subdomain',
      asset_value: hostname,
      hostname,
      ip:          ip || undefined,
      root_domain: hostname.split('.').slice(-2).join('.'),
      source:      'connectsecure',
      confidence:  'high',
      raw:         { grade: asset.grade, cs_id: asset.id },
    });
  }
  if (ip && ip !== hostname) {
    assets.push({
      asset_type:  'ipv4',
      asset_value: ip,
      ip,
      hostname:    hostname || undefined,
      source:      'connectsecure',
      confidence:  'high',
    });
  }

  for (const p of ports) {
    const port     = Number(p.port);
    const protocol = (p.protocol || 'tcp').toLowerCase();
    if (!port || isNaN(port)) continue;

    mappedPorts.push({
      port,
      host:           hostname || ip,
      ip:             ip || hostname,
      protocol,
      serviceName:    p.service || p.product || undefined,
      serviceVersion: p.extrainfo || undefined,
    });

    findings.push({
      provider:      'connectsecure',
      module:        'connectsecure',
      finding_type:  'open_port_exposed',
      severity:      portSeverity(port),
      title:         `Porta ${port}/${protocol} esposta su ${hostname || ip}`,
      description:   `${hostname || ip}: porta ${port}/${protocol} aperta${p.service ? ` — ${p.service}${p.product ? ' ' + p.product : ''}` : ''}.`,
      affected_asset: hostname || ip,
      ip:             ip || undefined,
      port,
      protocol,
      evidence:      { source: 'connectsecure', service: p.service, product: p.product, grade: asset.grade },
    });
  }

  const cveIds = vulns
    .map(v => v.key)
    .filter(k => /^CVE-\d{4}-\d+$/i.test(k))
    .map(k => k.toUpperCase());

  if (cveIds.length > 0) {
    findings.push({
      provider:      'connectsecure',
      module:        'connectsecure',
      finding_type:  'vulnerability_detected',
      severity:      gradeToSeverity(asset.grade),
      title:         `${cveIds.length} vulnerabilità rilevate su ${hostname || ip}`,
      description:   `Asset ${hostname || ip} (grade: ${asset.grade || 'N/A'}). CVE: ${cveIds.slice(0, 5).join(', ')}${cveIds.length > 5 ? ` +${cveIds.length - 5}` : ''}.`,
      affected_asset: hostname || ip,
      ip:             ip || undefined,
      cve:           cveIds,
      evidence:      {
        grade:     asset.grade,
        critical:  asset.critical,
        high:      asset.high,
        medium:    asset.medium,
        low:       asset.low,
        vul_count: asset.vul_count,
      },
    });
  }

  return { assets, findings, ports: mappedPorts };
}

function gradeToSeverity(grade?: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  if (!grade) return 'info';
  const g = grade.toUpperCase();
  if (g === 'F' || g === 'D') return 'critical';
  if (g === 'C')              return 'high';
  if (g === 'B')              return 'medium';
  return 'info';
}
