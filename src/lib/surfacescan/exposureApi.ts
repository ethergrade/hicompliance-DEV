import { supabase } from '@/integrations/supabase/client';

const IPV4_RX = /\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\b/;
const IPV6_RX = /\b(?:[a-f0-9]{1,4}:){2,}[a-f0-9:]{1,}\b/i;

const stripProviderNoise = (value: string): string => {
  const cleaned = String(value || '')
    .replace(/\b(?:shodan|urlscan|web\s*-?\s*check|pentest\s*-?\s*tools?)\b/gi, ' ')
    .replace(/[:;,]\s*\d+\s*(?:porte?|services?|servizi?)\b.*$/i, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned;
};

const extractIp = (value: string): string => {
  const raw = String(value || '').trim();
  const v4 = raw.match(IPV4_RX);
  if (v4?.[0]) return v4[0];
  const v6 = raw.match(IPV6_RX);
  if (v6?.[0]) return v6[0].replace(/^\[|\]$/g, '');
  return '';
};

const normalizeHost = (value: string): string => {
  const raw = stripProviderNoise(String(value || '').trim());
  if (!raw) return '';
  const asUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(asUrl);
    return String(parsed.hostname || '').trim().toLowerCase();
  } catch {
    // fallback sotto
  }

  const token = raw
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .split(/[\s|,;]+/)
    .map((entry) => entry.trim())
    .find(Boolean);
  return String(token || '').replace(/^\[|\]$/g, '').toLowerCase();
};

const isIpLike = (value: string): boolean => Boolean(extractIp(value));

const hostFromTarget = (value: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return String(parsed.hostname || '').trim().toLowerCase();
  } catch {
    return String(raw).replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase();
  }
};

const normalizePortNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return null;
  return Math.round(parsed);
};

const normalizeExposureLevel = (value: unknown): string => {
  const key = String(value || '').toLowerCase().trim();
  if (['critical', 'high', 'medium', 'low', 'info'].includes(key)) return key;
  return 'info';
};

const isWebPortLike = (port: number, service?: string | null): boolean =>
  [80, 443, 8000, 8080, 8081, 8443, 8888, 9443].includes(port)
  || /http|www|proxy/i.test(String(service || ''));

const isTlsPortLike = (port: number, service?: string | null): boolean =>
  [443, 465, 636, 853, 989, 990, 993, 995, 8443, 9443].includes(port)
  || /tls|ssl|https/i.test(String(service || ''));

const sortPortRows = (rows: ExposureOpenPortRow[]): ExposureOpenPortRow[] =>
  [...rows].sort((a, b) => {
    const hostDelta = String(a.host || '').localeCompare(String(b.host || ''));
    if (hostDelta !== 0) return hostDelta;
    return Number(a.port || 0) - Number(b.port || 0);
  });

export type ExposureStartRequest = {
  tenant_id: string;
  customer_id: string;
  assessment_id?: string;
  scan_name: string;
  root_domains?: string[];
  subdomains?: string[];
  public_ips?: string[];
  include_subdomain_discovery: boolean;
  include_port_scan: boolean;
  include_web_technology_detection: boolean;
  include_ssl_scan: boolean;
  include_network_vuln_scan: boolean;
  scan_depth: 'light' | 'deep' | 'custom';
  protocol: 'tcp' | 'udp' | 'both';
  custom_ports?: string;
  check_alive: boolean;
  detect_service_version: boolean;
  detect_os: boolean;
  traceroute: boolean;
};

export type ExposureSummary = {
  job_id: string | null;
  job_ids?: string[];
  live_job_ids?: string[];
  target_snapshots?: Array<{
    target_key: string;
    target_value: string;
    target_type: string;
    snapshot_source: 'live' | 'last_good';
    live: {
      job_id: string | null;
      status: string | null;
      created_at: string | null;
      scan_profile: string | null;
    };
    last_good: {
      job_id: string | null;
      status: string | null;
      created_at: string | null;
      completed_at: string | null;
      scan_profile: string | null;
    };
  }>;
  scope_mode?: 'single_job' | 'scope_latest_per_target';
  scope_aggregate?: boolean;
  targets_in_scope?: number;
  scope_counters?: {
    in_scope: number;
    excluded_by_scope: number;
    excluded_shared_noise: number;
  };
  status?: string;
  targets_total: number;
  hosts_with_open_ports: number;
  open_ports_total: number;
  critical_exposures: number;
  web_services: number;
  tls_services: number;
  ssl_snapshots?: number;
  top_open_ports: Array<{ port: number; count: number }>;
  technologies: Array<{ name: string; count: number }>;
  findings_by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  diff: {
    new_open_ports: any[];
    closed_ports: any[];
    unchanged_ports: any[];
    new_technologies: any[];
    removed_technologies: any[];
  };
};

export type ExposureOpenPortRow = {
  id: string;
  scan_job_id: string;
  target_id?: string | null;
  raw?: Record<string, unknown> | null;
  host: string;
  ip: string | null;
  port: number;
  protocol: string;
  state: string;
  service_name: string | null;
  service_product: string | null;
  service_version: string | null;
  is_web: boolean;
  is_tls: boolean;
  exposure_level: string;
  remediation_hint: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export type ExposureTechnologyRow = {
  id: string;
  scan_job_id: string;
  url: string;
  host: string;
  port: number | null;
  technology_name: string;
  technology_version: string | null;
  category: string | null;
  confidence: number | null;
  created_at: string;
};

export type ExposureFindingRow = {
  id: string;
  scan_job_id: string;
  finding_type: string;
  title: string;
  severity: string;
  cvss: number | null;
  cve_ids: string[] | null;
  affected_host: string | null;
  affected_port: number | null;
  affected_url: string | null;
  description: string | null;
  evidence: string | null;
  recommendation: string | null;
  source: string;
  status: string;
  created_at: string;
};

export async function startExposureScan(input: ExposureStartRequest) {
  const { data, error } = await supabase.functions.invoke('ptools-start-exposure-scan', {
    body: input,
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export async function triggerExposurePoll() {
  const { data, error } = await supabase.functions.invoke('ptools-poll-scans', {
    body: { trigger: 'manual_ui' },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export async function resyncExposureJob(jobId: string) {
  const { data, error } = await supabase.functions.invoke('ptools-resync-job', {
    body: { job_id: jobId },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export async function fetchExposureSummary(params: {
  customerId: string;
  jobId?: string;
  scopeMode?: 'single_job' | 'scope_latest_per_target';
  groupId?: string | null;
}): Promise<ExposureSummary> {
  const scopeMode = params.scopeMode || (params.jobId ? 'single_job' : 'scope_latest_per_target');
  const data = await surfaceScan360Api.getExposureSummary(
    params.customerId,
    { job_id: params.jobId, scope_mode: scopeMode },
    params.groupId,
  );
  return (data?.data || data) as ExposureSummary;
}

export async function fetchExposureJobs(customerId: string, limit = 20): Promise<any[]> {
  const scopeFilter = `customer_id.eq.${customerId},organization_id.eq.${customerId}`;
  const { data, error } = await supabase
    .from('surface_scan_jobs' as any)
    .select('id, created_at, completed_at, status, scan_name, scan_type, scan_profile, summary, config')
    .or(scopeFilter)
    .eq('scan_type', 'exposure_port_technology')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchOpenPorts(jobId: string): Promise<ExposureOpenPortRow[]> {
  return fetchOpenPortsByJobIds([jobId]);
}

export async function fetchOpenPortsByJobIds(jobIds: string[]): Promise<ExposureOpenPortRow[]> {
  const uniqueJobIds = [...new Set((jobIds || []).map((entry) => String(entry || '').trim()).filter(Boolean))];
  if (uniqueJobIds.length === 0) return [];

  const { data, error } = await supabase
    .from('surface_open_ports' as any)
    .select('id, scan_job_id, target_id, host, ip, port, protocol, state, service_name, service_product, service_version, is_web, is_tls, exposure_level, remediation_hint, first_seen_at, last_seen_at, raw')
    .in('scan_job_id', uniqueJobIds)
    .order('exposure_level', { ascending: false })
    .order('host', { ascending: true })
    .order('port', { ascending: true });

  if (error) throw error;

  const rows = (data || []) as Array<ExposureOpenPortRow & { target_id?: string | null }>;
  const targetIds = [...new Set(rows.map((row) => String(row.target_id || '').trim()).filter(Boolean))];
  const targetMap = new Map<string, { target_value: string; target_type: string }>();

  if (targetIds.length > 0) {
    const { data: targets, error: targetsError } = await supabase
      .from('surface_scan_targets' as any)
      .select('id, target_value, target_type')
      .in('id', targetIds);
    if (targetsError) throw targetsError;
    for (const row of (targets || []) as Array<Record<string, unknown>>) {
      targetMap.set(String(row.id || ''), {
        target_value: String(row.target_value || ''),
        target_type: String(row.target_type || ''),
      });
    }
  }

  const normalizedExposureRows = rows.map((row) => {
    const target = targetMap.get(String((row as any).target_id || ''));
    const targetHost = target ? hostFromTarget(target.target_value) : '';
    const rawScopeHost = normalizeHost(String((row as any)?.raw?.scope_target_host || ''));

    const rawHost = String(row.host || '').trim();
    const rawIp = String(row.ip || '').trim();

    const inferredIp = extractIp(rawIp) || extractIp(rawHost) || extractIp(target?.target_value || '');
    let normalizedHost = normalizeHost(rawHost);

    if (rawScopeHost && !isIpLike(rawScopeHost)) normalizedHost = rawScopeHost;
    if (!normalizedHost && targetHost) normalizedHost = targetHost;
    if (normalizedHost && isIpLike(normalizedHost) && targetHost && !isIpLike(targetHost)) {
      normalizedHost = targetHost;
    }
    if (!normalizedHost && inferredIp) normalizedHost = inferredIp;

    return {
      ...row,
      host: normalizedHost || '-',
      ip: inferredIp || null,
    } as ExposureOpenPortRow;
  });

  const [classicFindingsRes, classicObservationsRes] = await Promise.all([
    supabase
      .from('surface_findings' as any)
      .select('id, scan_job_id, affected_asset, affected_url, ip, port, protocol, severity, title, evidence, created_at, finding_type')
      .in('scan_job_id', uniqueJobIds)
      .in('finding_type', ['open_port_exposed', 'service_fingerprint_exposed', 'sensitive_port_exposed']),
    supabase
      .from('surface_observations' as any)
      .select('id, scan_job_id, value, created_at')
      .in('scan_job_id', uniqueJobIds)
      .eq('module', 'open_ports')
      .in('observation_type', ['open_ports', 'open_ports_summary']),
  ]);

  if (classicFindingsRes.error) throw classicFindingsRes.error;
  if (classicObservationsRes.error) throw classicObservationsRes.error;

  const fallbackRows: ExposureOpenPortRow[] = [];

  for (const finding of (classicFindingsRes.data || []) as Array<Record<string, unknown>>) {
    const evidence = finding?.evidence && typeof finding.evidence === 'object'
      ? (finding.evidence as Record<string, unknown>)
      : {};
    const port = normalizePortNumber(
      finding?.port ?? evidence?.port ?? (evidence as any)?.raw?.port ?? (evidence as any)?.raw?.number,
    );
    if (!port) continue;
    const protocol = String(finding?.protocol || evidence?.protocol || (evidence as any)?.transport || 'tcp').toLowerCase().trim() || 'tcp';
    const hostCandidate = String(
      (evidence as any)?.scope_target_host
      || finding?.affected_asset
      || finding?.affected_url
      || evidence?.host
      || evidence?.hostname
      || evidence?.domain
      || evidence?.target
      || '',
    );
    const host = normalizeHost(hostCandidate) || hostFromTarget(String(finding?.affected_url || '')) || '-';
    const ip = extractIp(String(finding?.ip || evidence?.ip || (evidence as any)?.raw?.ip_address || '')) || null;
    const service = String(evidence?.service || evidence?.product || finding?.title || '').trim();
    const createdAt = String(finding?.created_at || new Date().toISOString());

    fallbackRows.push({
      id: `finding-${String(finding?.id || `${host}-${port}-${protocol}`)}`,
      scan_job_id: String(finding?.scan_job_id || ''),
      host,
      ip,
      port,
      protocol,
      state: 'open',
      service_name: service || null,
      service_product: null,
      service_version: null,
      is_web: isWebPortLike(port, service || null),
      is_tls: isTlsPortLike(port, service || null),
      exposure_level: normalizeExposureLevel(finding?.severity),
      remediation_hint: null,
      first_seen_at: createdAt,
      last_seen_at: createdAt,
      raw: evidence,
    });
  }

  for (const observation of (classicObservationsRes.data || []) as Array<Record<string, unknown>>) {
    const value = observation?.value && typeof observation.value === 'object'
      ? (observation.value as Record<string, unknown>)
      : {};
    const baseHost = normalizeHost(
      String(value?.scope_target_host || value?.host || value?.hostname || value?.domain || value?.target || ''),
    ) || '-';
    const baseIp = extractIp(String(value?.ip || value?.ip_address || '')) || null;
    const createdAt = String(observation?.created_at || new Date().toISOString());

    const registerEntry = (entry: Record<string, unknown>) => {
      const port = normalizePortNumber(entry?.port ?? entry?.number);
      if (!port) return;
      const protocol = String(entry?.protocol || entry?.transport || 'tcp').toLowerCase().trim() || 'tcp';
      const service = String(entry?.service || entry?.product || '').trim();
      const ip = extractIp(String(entry?.ip || entry?.ip_address || baseIp || '')) || null;
      fallbackRows.push({
        id: `obs-${String(observation?.id || '')}-${port}-${protocol}-${baseHost}`,
        scan_job_id: String(observation?.scan_job_id || ''),
        host: baseHost,
        ip,
        port,
        protocol,
        state: 'open',
        service_name: service || null,
        service_product: null,
        service_version: null,
        is_web: isWebPortLike(port, service || null),
        is_tls: isTlsPortLike(port, service || null),
        exposure_level: normalizeExposureLevel(entry?.severity || value?.severity || 'info'),
        remediation_hint: null,
        first_seen_at: createdAt,
        last_seen_at: createdAt,
        raw: value,
      });
    };

    const openPorts = Array.isArray((value as any)?.open_ports) ? (value as any).open_ports : [];
    for (const entry of openPorts) {
      if (typeof entry === 'number' || typeof entry === 'string') {
        const port = normalizePortNumber(entry);
        if (!port) continue;
        fallbackRows.push({
          id: `obs-${String(observation?.id || '')}-${port}-tcp-${baseHost}`,
          scan_job_id: String(observation?.scan_job_id || ''),
          host: baseHost,
          ip: baseIp,
          port,
          protocol: 'tcp',
          state: 'open',
          service_name: null,
          service_product: null,
          service_version: null,
          is_web: isWebPortLike(port),
          is_tls: isTlsPortLike(port),
          exposure_level: normalizeExposureLevel(value?.severity || 'info'),
          remediation_hint: null,
          first_seen_at: createdAt,
          last_seen_at: createdAt,
          raw: value,
        });
        continue;
      }
      if (entry && typeof entry === 'object') registerEntry(entry as Record<string, unknown>);
    }

    const dataRows = Array.isArray((value as any)?.data) ? (value as any).data : [];
    for (const entry of dataRows) {
      if (entry && typeof entry === 'object') registerEntry(entry as Record<string, unknown>);
    }
  }

  const dedupe = new Map<string, ExposureOpenPortRow>();
  for (const row of [...normalizedExposureRows, ...fallbackRows]) {
    const key = [
      String(row.scan_job_id || ''),
      String(row.host || '').toLowerCase(),
      String(row.ip || '').toLowerCase(),
      Number(row.port || 0),
      String(row.protocol || 'tcp').toLowerCase(),
    ].join('|');
    const existing = dedupe.get(key);
    if (!existing) {
      dedupe.set(key, row);
      continue;
    }
    const existingTs = Date.parse(String(existing.last_seen_at || existing.first_seen_at || ''));
    const incomingTs = Date.parse(String(row.last_seen_at || row.first_seen_at || ''));
    if (Number.isFinite(incomingTs) && (!Number.isFinite(existingTs) || incomingTs >= existingTs)) {
      dedupe.set(key, row);
    }
  }

  return sortPortRows(Array.from(dedupe.values()));
}

export async function fetchTechnologies(jobId: string): Promise<ExposureTechnologyRow[]> {
  return fetchTechnologiesByJobIds([jobId]);
}

export async function fetchTechnologiesByJobIds(jobIds: string[]): Promise<ExposureTechnologyRow[]> {
  const uniqueJobIds = [...new Set((jobIds || []).map((entry) => String(entry || '').trim()).filter(Boolean))];
  if (uniqueJobIds.length === 0) return [];

  const { data, error } = await supabase
    .from('surface_web_technologies' as any)
    .select('id, scan_job_id, url, host, port, technology_name, technology_version, category, confidence, created_at')
    .in('scan_job_id', uniqueJobIds)
    .order('technology_name', { ascending: true });

  if (error) throw error;
  return (data || []) as ExposureTechnologyRow[];
}

export async function fetchExposureFindings(jobId: string): Promise<ExposureFindingRow[]> {
  return fetchExposureFindingsByJobIds([jobId]);
}

export async function fetchExposureFindingsByJobIds(jobIds: string[]): Promise<ExposureFindingRow[]> {
  const uniqueJobIds = [...new Set((jobIds || []).map((entry) => String(entry || '').trim()).filter(Boolean))];
  if (uniqueJobIds.length === 0) return [];

  const { data, error } = await supabase
    .from('surface_exposure_findings' as any)
    .select('id, scan_job_id, finding_type, title, severity, cvss, cve_ids, affected_host, affected_port, affected_url, description, evidence, recommendation, source, status, created_at')
    .in('scan_job_id', uniqueJobIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as ExposureFindingRow[];
}
