import { surfaceScan360Api, type SurfaceScanJob } from '@/lib/api/surface-scan360';

const IPV4_RX = /\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\b/;
const IPV6_RX = /\b(?:[a-f0-9]{1,4}:){2,}[a-f0-9:]{1,}\b/i;

const stripProviderNoise = (value: string): string => {
  const cleaned = String(value || '')
    .replace(/\b(?:shodan|urlscan|web\s*-?\s*check)\b/gi, ' ')
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

export type ExposureSummary = {
  score_version: '3.0';
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
  included_scan_types?: string[];
  source_counts?: Record<string, number>;
  posture_score: number;
  risk_level: 'Basso' | 'Medio' | 'Alto' | 'Critico';
  risk_points: number;
  risk_breakdown: {
    service_exposure: ExposureRiskComponent & {
      primary_points: number;
      breadth_points: number;
    };
    uncertainty: ExposureRiskComponent;
    verified_findings: ExposureRiskComponent & { by_severity: Record<string, number> };
    confirmed_cves: ExposureRiskComponent;
    candidate_cves: ExposureRiskComponent;
    threat_intel: ExposureRiskComponent;
    delta: ExposureRiskComponent;
  };
  vulnerability_summary: {
    exposure_findings: number;
    confirmed: number;
    candidate: number;
    unknown: number;
    fingerprint_unknown: number;
    not_vulnerable_evidence: number;
    services_total: number;
    explanation: string;
  };
  service_assessments: ServiceExposureAssessment[];
  exposure_findings: ExposureFindingRow[];
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

export type ExposureRiskComponent = {
  count: number;
  points: number;
  details?: Array<Record<string, unknown>>;
};

export type ServiceExposureAssessment = {
  service_key: string;
  open_port_id: string | null;
  host: string | null;
  ip: string | null;
  port: number;
  protocol: string;
  service_name: string | null;
  service_product: string | null;
  service_version: string | null;
  service_class: 'public_protected' | 'public_cleartext_or_alternative' | 'generic_unknown' | 'remote_or_admin' | 'legacy_or_infrastructure' | 'data_or_control_plane';
  service_class_label: string;
  likelihood: number;
  impact: number;
  matrix_score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence_status: 'exposure_only' | 'fingerprint_unknown' | 'no_known_cve' | 'cve_candidate' | 'cve_confirmed';
  rationale: string;
  remediation: string;
};

export type ExposureOpenPortRow = {
  id: string;
  scan_job_id: string;
  target_id?: string | null;
  raw?: Record<string, unknown> | null;
  risk_assessment?: ServiceExposureAssessment | null;
  host: string;
  ip: string | null;
  port: number;
  protocol: string;
  source?: string | null;
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
  affected_protocol?: string | null;
  affected_url: string | null;
  description: string | null;
  evidence: string | null;
  recommendation: string | null;
  source: string;
  status: string;
  created_at: string;
  service_key?: string;
  service_class?: ServiceExposureAssessment['service_class'];
  service_class_label?: string;
  likelihood?: number;
  impact?: number;
  matrix_score?: number;
  evidence_status?: ServiceExposureAssessment['evidence_status'];
};

export async function fetchExposureSummary(params: {
  customerId: string;
  jobId?: string;
  scopeMode?: 'single_job' | 'scope_latest_per_target';
  groupId?: string | null;
}): Promise<ExposureSummary> {
  const data = await surfaceScan360Api.getExposureSummary(
    params.customerId,
    {
      job_id: params.jobId,
      scope_mode: params.scopeMode || (params.jobId ? 'single_job' : 'scope_latest_per_target'),
    },
    params.groupId,
  );
  return data as ExposureSummary;
}

export async function fetchExposureJobs(
  customerId: string,
  limit = 20,
  groupId?: string | null,
): Promise<any[]> {
  return surfaceScan360Api.listJobs(customerId, { per_page: limit }, groupId);
}

export async function fetchOpenPorts(
  companyId: string,
  jobId: string,
  groupId?: string | null,
  existingJobs?: SurfaceScanJob[],
): Promise<ExposureOpenPortRow[]> {
  return fetchOpenPortsByJobIds(companyId, [jobId], groupId, existingJobs);
}

export async function fetchOpenPortsByJobIds(
  companyId: string,
  jobIds: string[],
  groupId?: string | null,
  existingJobs?: SurfaceScanJob[],
): Promise<ExposureOpenPortRow[]> {
  const uniqueJobIds = [...new Set((jobIds || []).map((entry) => String(entry || '').trim()).filter(Boolean))];
  if (uniqueJobIds.length === 0) return [];

  const jobIdsParam = uniqueJobIds.join(',');

  // Build job target map from already-loaded jobs (avoids redundant API call)
  const jobTargetMap = new Map<string, { raw_target: string; normalized_target: string; hostname: string }>();
  for (const job of (existingJobs || [])) {
    jobTargetMap.set(String(job.id), {
      raw_target: String(job.raw_target || ''),
      normalized_target: String(job.normalized_target || ''),
      hostname: String(job.hostname || ''),
    });
  }

  const [portsRaw, findingsRaw, observationsRaw] = await Promise.allSettled([
    surfaceScan360Api.getOpenPorts(companyId, { job_ids: jobIdsParam, per_page: 1000 }, groupId),
    surfaceScan360Api.getFindings(companyId, {
      job_ids: jobIdsParam,
      finding_type: 'open_port_exposed,service_fingerprint_exposed,sensitive_port_exposed',
      per_page: 500,
    }, groupId),
    surfaceScan360Api.getObservations(companyId, {
      job_ids: jobIdsParam,
      module: 'open_ports',
      observation_type: 'open_ports,open_ports_summary',
    }, groupId),
  ]);

  const rows = (portsRaw.status === 'fulfilled' ? portsRaw.value : []) as Array<ExposureOpenPortRow & { target_id?: string | null }>;

  const normalizedExposureRows = rows.map((row) => {
    const jobTarget = jobTargetMap.get(String(row.scan_job_id || ''));
    const jobTargetHost = jobTarget
      ? hostFromTarget(jobTarget.hostname || jobTarget.normalized_target || jobTarget.raw_target || '')
      : '';
    const rawScopeHost = normalizeHost(String(
      (row as any)?.raw?.scope_target_host
      || (row as any)?.raw?.root_domain
      || (row as any)?.raw?.target
      || '',
    ));

    const rawHost = String(row.host || '').trim();
    const rawIp = String(row.ip || '').trim();
    const inferredIp = extractIp(rawIp) || extractIp(rawHost);
    let normalizedHostValue = normalizeHost(rawHost);

    if (rawScopeHost && !isIpLike(rawScopeHost)) normalizedHostValue = rawScopeHost;
    if (!normalizedHostValue && jobTargetHost) normalizedHostValue = jobTargetHost;
    if (normalizedHostValue && isIpLike(normalizedHostValue) && jobTargetHost && !isIpLike(jobTargetHost)) {
      normalizedHostValue = jobTargetHost;
    }
    if (!normalizedHostValue && inferredIp) normalizedHostValue = inferredIp;

    return {
      ...row,
      host: normalizedHostValue || '-',
      ip: inferredIp || null,
    } as ExposureOpenPortRow;
  });

  const fallbackRows: ExposureOpenPortRow[] = [];

  for (const finding of ((findingsRaw.status === 'fulfilled' ? findingsRaw.value : []) as Record<string, any>[])) {
    const scanJobId = String(finding?.scan_job_id || '');
    const jobTarget = jobTargetMap.get(scanJobId);
    const jobTargetHost = jobTarget
      ? hostFromTarget(jobTarget.hostname || jobTarget.normalized_target || jobTarget.raw_target || '')
      : '';
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
    let host = normalizeHost(hostCandidate) || hostFromTarget(String(finding?.affected_url || '')) || '';
    if (host && isIpLike(host) && jobTargetHost && !isIpLike(jobTargetHost)) host = jobTargetHost;
    if (!host && jobTargetHost) host = jobTargetHost;
    if (!host) host = '-';
    const ip = extractIp(String(finding?.ip || evidence?.ip || (evidence as any)?.raw?.ip_address || '')) || null;
    const service = String(evidence?.service || evidence?.product || finding?.title || '').trim();
    const createdAt = String(finding?.created_at || new Date().toISOString());

    fallbackRows.push({
      id: `finding-${String(finding?.id || `${host}-${port}-${protocol}`)}`,
      scan_job_id: scanJobId,
      host,
      ip,
      port,
      protocol,
      source: String((finding as any)?.source || 'surface_findings'),
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
      raw: evidence as Record<string, unknown>,
    });
  }

  for (const observation of ((observationsRaw.status === 'fulfilled' ? observationsRaw.value : []) as Record<string, any>[])) {
    const scanJobId = String(observation?.scan_job_id || '');
    const jobTarget = jobTargetMap.get(scanJobId);
    const jobTargetHost = jobTarget
      ? hostFromTarget(jobTarget.hostname || jobTarget.normalized_target || jobTarget.raw_target || '')
      : '';
    const value = observation?.value && typeof observation.value === 'object'
      ? (observation.value as Record<string, unknown>)
      : {};
    let baseHost = normalizeHost(
      String(value?.scope_target_host || value?.host || value?.hostname || value?.domain || value?.target || ''),
    );
    if (baseHost && isIpLike(baseHost) && jobTargetHost && !isIpLike(jobTargetHost)) baseHost = jobTargetHost;
    if (!baseHost && jobTargetHost) baseHost = jobTargetHost;
    if (!baseHost) baseHost = '-';
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
        scan_job_id: scanJobId,
        host: baseHost,
        ip,
        port,
        protocol,
        source: String((entry as any)?.source || (value as any)?.source || 'surface_observations'),
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
          scan_job_id: scanJobId,
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
      String(row.host || '').toLowerCase(),
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

export async function fetchTechnologies(
  companyId: string,
  jobId: string,
  groupId?: string | null,
  existingJobs?: SurfaceScanJob[],
): Promise<ExposureTechnologyRow[]> {
  return fetchTechnologiesByJobIds(companyId, [jobId], groupId, existingJobs);
}

export async function fetchTechnologiesByJobIds(
  companyId: string,
  jobIds: string[],
  groupId?: string | null,
  _existingJobs?: SurfaceScanJob[],
): Promise<ExposureTechnologyRow[]> {
  const uniqueJobIds = [...new Set((jobIds || []).map((entry) => String(entry || '').trim()).filter(Boolean))];
  if (uniqueJobIds.length === 0) return [];
  const data = await surfaceScan360Api.getTechnologies(companyId, { job_ids: uniqueJobIds.join(',') }, groupId);
  return (data || []) as ExposureTechnologyRow[];
}

export async function fetchExposureFindings(
  companyId: string,
  jobId: string,
  groupId?: string | null,
): Promise<ExposureFindingRow[]> {
  return fetchExposureFindingsByJobIds(companyId, [jobId], groupId);
}

export async function fetchExposureFindingsByJobIds(
  companyId: string,
  jobIds: string[],
  groupId?: string | null,
): Promise<ExposureFindingRow[]> {
  const uniqueJobIds = [...new Set((jobIds || []).map((entry) => String(entry || '').trim()).filter(Boolean))];
  if (uniqueJobIds.length === 0) return [];
  const results = await Promise.allSettled(
    uniqueJobIds.map((jobId) => surfaceScan360Api.getExposureFindings(companyId, jobId, {}, groupId)),
  );
  const allRows: ExposureFindingRow[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allRows.push(...(result.value as ExposureFindingRow[]));
    }
  }
  return allRows;
}
