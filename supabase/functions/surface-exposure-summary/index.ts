import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  corsHeaders,
  makeSupabaseClients,
  getCallerProfile,
  assertCustomerAccess,
  classifyHostForScope,
  isIpWithinMonitoredScope,
  isValidIPv4,
  splitMonitoredScopeRules,
  toErrorResponsePayload,
} from '../_shared/surface-scan-utils.ts';
import {
  computeExposureScoreV2,
  type ExposureVulnerabilityMatch,
} from '../_shared/exposure-score-v2.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

type OpenPortSnapshot = {
  id?: string | null;
  host: string;
  ip?: string | null;
  port: number;
  protocol: string;
  source?: string | null;
  service_name?: string | null;
  service_product?: string | null;
  service_version?: string | null;
  banner?: string | null;
  exposure_level?: string | null;
  is_web?: boolean;
  is_tls?: boolean;
  last_seen_at?: string | null;
};

const UNIFIED_EXPOSURE_SCAN_TYPES = ['exposure_port_technology', 'connectsecure_asm'];

type ClassicPortFindingRow = {
  port?: number | null;
  protocol?: string | null;
  severity?: string | null;
  finding_type?: string | null;
  title?: string | null;
  affected_asset?: string | null;
  affected_url?: string | null;
  ip?: string | null;
  evidence?: Record<string, unknown> | null;
  created_at?: string | null;
};

type ClassicPortObservationRow = {
  value?: Record<string, unknown> | null;
  created_at?: string | null;
};

type TechnologySnapshot = {
  host: string;
  url: string;
  technology_name: string;
  technology_version?: string | null;
  created_at?: string | null;
};

type ScopeCounterState = {
  in_scope: number;
  excluded_by_scope: number;
  excluded_shared_noise: number;
};

type ExposureJobMeta = {
  id: string;
  customer_id: string | null;
  organization_id: string | null;
  raw_target?: string | null;
  normalized_target?: string | null;
  target_type?: string | null;
  hostname?: string | null;
  created_at: string;
  completed_at: string | null;
  status: string;
  scan_type?: string | null;
  scan_profile: string | null;
  summary: Record<string, unknown> | null;
};

type TargetSnapshot = {
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
};

function keyOpenPort(row: OpenPortSnapshot): string {
  const host = String(row.host || '').trim().toLowerCase();
  const ip = String(row.ip || '').trim().toLowerCase();
  const identity = host && host !== 'n/d' && host !== '-' ? host : ip;
  return `${identity}|${Number(row.port || 0)}|${String(row.protocol || 'tcp').toLowerCase()}`;
}

function keyTech(row: TechnologySnapshot): string {
  return `${String(row.host || '').toLowerCase()}|${String(row.url || '').toLowerCase()}|${String(row.technology_name || '').toLowerCase()}|${String(row.technology_version || '').toLowerCase()}`;
}

function parseHostnameFromTarget(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    // continue
  }
  return raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase();
}

function toTimestamp(value: string | null | undefined): number {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
}

function isTerminalGoodStatus(status: string): boolean {
  const key = String(status || '').toLowerCase();
  return key === 'completed' || key === 'partial' || key === 'success';
}

function isTerminalStatus(status: string): boolean {
  const key = String(status || '').toLowerCase();
  return ['completed', 'partial', 'success', 'failed', 'stopped', 'aborted', 'timed out'].includes(key);
}

function hasExposureData(summary: Record<string, unknown> | null | undefined): boolean {
  if (!summary || typeof summary !== 'object') return false;
  const openPorts = Number((summary as any).open_ports_total || 0);
  const findings = Number((summary as any).findings_total || 0);
  const tech = Number((summary as any).technologies_total || 0);
  return Number.isFinite(openPorts + findings + tech) && (openPorts > 0 || findings > 0 || tech > 0);
}

function dedupeOpenPorts(rows: OpenPortSnapshot[]): OpenPortSnapshot[] {
  const map = new Map<string, OpenPortSnapshot>();
  for (const row of rows || []) {
    const key = keyOpenPort(row);
    const existing = map.get(key);
    const normalizedRow = {
      ...row,
      ip: isValidIPv4(String(row.ip || '').trim()) || String(row.ip || '').includes(':') ? row.ip : null,
    };
    if (!existing) {
      map.set(key, normalizedRow);
      continue;
    }
    const rowCompleteness = [normalizedRow.ip, normalizedRow.service_product, normalizedRow.service_version, normalizedRow.banner].filter(Boolean).length;
    const existingCompleteness = [existing.ip, existing.service_product, existing.service_version, existing.banner].filter(Boolean).length;
    if (
      rowCompleteness > existingCompleteness
      || (rowCompleteness === existingCompleteness && toTimestamp(normalizedRow.last_seen_at) >= toTimestamp(existing.last_seen_at))
    ) {
      map.set(key, normalizedRow);
    }
  }
  return Array.from(map.values());
}

function normalizePortNumber(value: unknown): number | null {
  const port = Number(value);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return null;
  return Math.round(port);
}

function normalizeSeverityValue(value: unknown): string {
  const key = String(value || '').toLowerCase().trim();
  if (['critical', 'high', 'medium', 'low', 'info'].includes(key)) return key;
  return 'info';
}

function isLikelyWebPort(port: number, serviceName?: string | null): boolean {
  const service = String(serviceName || '').toLowerCase();
  return [80, 443, 8000, 8080, 8081, 8443, 8888, 9443].includes(port) || /http|www|proxy/.test(service);
}

function isLikelyTlsPort(port: number, serviceName?: string | null): boolean {
  const service = String(serviceName || '').toLowerCase();
  return [443, 465, 636, 853, 989, 990, 993, 995, 8443, 9443].includes(port) || /tls|ssl|https/.test(service);
}

function toOpenPortFromClassicFinding(row: ClassicPortFindingRow): OpenPortSnapshot | null {
  const evidence = (row?.evidence && typeof row.evidence === 'object')
    ? (row.evidence as Record<string, unknown>)
    : {};

  const port = normalizePortNumber(row?.port ?? evidence?.port ?? (evidence as any)?.raw?.port ?? (evidence as any)?.raw?.number);
  if (!port) return null;

  const protocol = String(row?.protocol || evidence?.protocol || (evidence as any)?.transport || 'tcp').trim().toLowerCase() || 'tcp';
  const hostRaw = String(
    row?.affected_asset
    || row?.affected_url
    || evidence?.scope_target_host
    || evidence?.host
    || evidence?.hostname
    || evidence?.domain
    || '',
  ).trim();
  const host = parseHostnameFromTarget(hostRaw) || parseHostnameFromTarget(String(evidence?.target || '')) || 'n/d';

  const ip = String(row?.ip || evidence?.ip || (evidence as any)?.raw?.ip_address || '').trim() || null;
  const service = String(evidence?.service || evidence?.product || row?.title || '').trim();

  return {
    host,
    ip,
    port,
    protocol,
    service_name: service || null,
    exposure_level: normalizeSeverityValue(row?.severity),
    is_web: isLikelyWebPort(port, service || null),
    is_tls: isLikelyTlsPort(port, service || null),
    last_seen_at: row?.created_at || null,
  };
}

function toOpenPortsFromClassicObservation(row: ClassicPortObservationRow): OpenPortSnapshot[] {
  const value = (row?.value && typeof row.value === 'object') ? (row.value as Record<string, unknown>) : {};
  const host = parseHostnameFromTarget(
    String(value?.scope_target_host || value?.host || value?.hostname || value?.domain || value?.target || ''),
  ) || 'n/d';
  const baseIp = String(value?.ip || value?.ip_address || '').trim() || null;
  const severity = normalizeSeverityValue(value?.severity || 'info');

  const out: OpenPortSnapshot[] = [];
  const addRow = (entry: Record<string, unknown>) => {
    const port = normalizePortNumber(entry?.port ?? entry?.number);
    if (!port) return;
    const protocol = String(entry?.protocol || entry?.transport || 'tcp').toLowerCase().trim() || 'tcp';
    const service = String(entry?.service || entry?.product || '').trim();
    const ip = String(entry?.ip || entry?.ip_address || baseIp || '').trim() || null;
    out.push({
      host,
      ip,
      port,
      protocol,
      service_name: service || null,
      exposure_level: normalizeSeverityValue(entry?.severity || severity),
      is_web: isLikelyWebPort(port, service || null),
      is_tls: isLikelyTlsPort(port, service || null),
      last_seen_at: row?.created_at || null,
    });
  };

  const openPorts = Array.isArray((value as any)?.open_ports) ? (value as any).open_ports : [];
  for (const entry of openPorts) {
    if (typeof entry === 'number' || typeof entry === 'string') {
      const port = normalizePortNumber(entry);
      if (!port) continue;
      out.push({
        host,
        ip: baseIp,
        port,
        protocol: 'tcp',
        exposure_level: severity,
        is_web: isLikelyWebPort(port),
        is_tls: isLikelyTlsPort(port),
        last_seen_at: row?.created_at || null,
      });
      continue;
    }
    if (entry && typeof entry === 'object') addRow(entry as Record<string, unknown>);
  }

  const dataRows = Array.isArray((value as any)?.data) ? (value as any).data : [];
  for (const entry of dataRows) {
    if (entry && typeof entry === 'object') addRow(entry as Record<string, unknown>);
  }

  return out;
}

function dedupeTechnologies(rows: TechnologySnapshot[]): TechnologySnapshot[] {
  const map = new Map<string, TechnologySnapshot>();
  for (const row of rows || []) {
    const key = keyTech(row);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    if (toTimestamp(row.created_at) >= toTimestamp(existing.created_at)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

function compareExposureSnapshots(previousPorts: OpenPortSnapshot[], currentPorts: OpenPortSnapshot[], previousTech: TechnologySnapshot[], currentTech: TechnologySnapshot[]) {
  const previousPortMap = new Map(previousPorts.map((row) => [keyOpenPort(row), row]));
  const currentPortMap = new Map(currentPorts.map((row) => [keyOpenPort(row), row]));

  const new_open_ports = Array.from(currentPortMap.entries())
    .filter(([key]) => !previousPortMap.has(key))
    .map(([, value]) => value);

  const closed_ports = Array.from(previousPortMap.entries())
    .filter(([key]) => !currentPortMap.has(key))
    .map(([, value]) => value);

  const unchanged_ports = Array.from(currentPortMap.entries())
    .filter(([key]) => previousPortMap.has(key))
    .map(([, value]) => value);

  const previousTechMap = new Map(previousTech.map((row) => [keyTech(row), row]));
  const currentTechMap = new Map(currentTech.map((row) => [keyTech(row), row]));

  const new_technologies = Array.from(currentTechMap.entries())
    .filter(([key]) => !previousTechMap.has(key))
    .map(([, value]) => value);

  const removed_technologies = Array.from(previousTechMap.entries())
    .filter(([key]) => !currentTechMap.has(key))
    .map(([, value]) => value);

  return {
    new_open_ports,
    closed_ports,
    unchanged_ports,
    new_technologies,
    removed_technologies,
  };
}

function trackScopeReason(counters: ScopeCounterState, reason: 'scope_excluded_domain' | 'scope_excluded_ip' | 'scope_excluded_shared_noise' | null) {
  if (!reason) {
    counters.in_scope += 1;
    return;
  }
  if (reason === 'scope_excluded_shared_noise') {
    counters.excluded_shared_noise += 1;
    return;
  }
  counters.excluded_by_scope += 1;
}

function scopeReasonForTarget(
  targetValue: string,
  targetType: string,
  scopeDomains: string[],
  ipScopeRules: Array<Record<string, unknown>>,
): 'scope_excluded_domain' | 'scope_excluded_ip' | 'scope_excluded_shared_noise' | null {
  const normalizedTarget = String(targetValue || '').trim().toLowerCase();
  const normalizedType = String(targetType || '').trim().toLowerCase();
  if (!normalizedTarget) return 'scope_excluded_domain';

  const host = parseHostnameFromTarget(normalizedTarget);
  const ipLike = normalizedType === 'ip' || normalizedType === 'ipv4' || normalizedType === 'ipv6' || isValidIPv4(host) || host.includes(':');

  if (ipLike) {
    return isIpWithinMonitoredScope(host || normalizedTarget, ipScopeRules as any)
      ? null
      : 'scope_excluded_ip';
  }

  const hostScope = classifyHostForScope(host || normalizedTarget, scopeDomains);
  if (hostScope.blocked) return 'scope_excluded_shared_noise';
  if (!hostScope.inScope) return 'scope_excluded_domain';
  return null;
}

function emptySummary(scopeMode: 'single_job' | 'scope_latest_per_target', counters: ScopeCounterState, isAggregate: boolean) {
  const score = computeExposureScoreV2({});
  return {
    job_id: null,
    job_ids: [],
    live_job_ids: [],
    target_snapshots: [],
    scope_mode: scopeMode,
    scope_aggregate: isAggregate,
    targets_in_scope: counters.in_scope,
    scope_counters: counters,
    targets_total: counters.in_scope,
    hosts_with_open_ports: 0,
    open_ports_total: 0,
    critical_exposures: 0,
    web_services: 0,
    tls_services: 0,
    top_open_ports: [],
    technologies: [],
    included_scan_types: UNIFIED_EXPOSURE_SCAN_TYPES,
    source_counts: {},
    ...score,
    findings_by_severity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    },
    diff: {
      new_open_ports: [],
      closed_ports: [],
      unchanged_ports: [],
      new_technologies: [],
      removed_technologies: [],
    },
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!['GET', 'POST'].includes(req.method)) return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = req.method === 'POST' ? await req.json() : {};
    const query = new URL(req.url).searchParams;

    const customerIdInput = String(
      body?.customer_id || query.get('customer_id') || '',
    ).trim();
    const jobIdInput = String(
      body?.job_id || query.get('job_id') || '',
    ).trim();
    const scopeModeInput = String(
      body?.scope_mode || query.get('scope_mode') || '',
    ).trim().toLowerCase();
    const scopeMode: 'single_job' | 'scope_latest_per_target' =
      scopeModeInput === 'single_job' ? 'single_job' : 'scope_latest_per_target';

    const caller = await getCallerProfile(adminClient, authData.user.id);
    const customerId = customerIdInput || caller.organizationId || '';
    if (!customerId) return jsonResponse({ error: 'customer_id is required' }, 400);
    assertCustomerAccess(caller, customerId);

    const { data: monitoredScopeRows, error: monitoredScopeError } = await adminClient
      .from('surface_scan_monitored_ips' as any)
      .select('entry_type, input_value, ip_start, ip_end')
      .eq('organization_id', customerId);
    if (monitoredScopeError) throw monitoredScopeError;
    const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules((monitoredScopeRows || []) as any);

    const jobScopeFilter = `customer_id.eq.${customerId},organization_id.eq.${customerId}`;
    const { data: allJobsRows, error: allJobsError } = await adminClient
      .from('surface_scan_jobs' as any)
      .select('id, customer_id, organization_id, raw_target, normalized_target, target_type, hostname, created_at, completed_at, status, scan_type, scan_profile, summary')
      .or(jobScopeFilter)
      .in('scan_type', UNIFIED_EXPOSURE_SCAN_TYPES)
      .order('created_at', { ascending: false })
      .limit(500);
    if (allJobsError) throw allJobsError;

    const allJobs = (allJobsRows || []) as ExposureJobMeta[];

    const counters: ScopeCounterState = {
      in_scope: 0,
      excluded_by_scope: 0,
      excluded_shared_noise: 0,
    };

    if (allJobs.length === 0) {
      return jsonResponse(emptySummary(scopeMode, counters, scopeMode !== 'single_job'));
    }

    let selectedJobIds: string[] = [];
    let anchorJobId = '';
    let targetSnapshots: TargetSnapshot[] = [];
    let liveJobIds: string[] = [];
    const jobDataPresence = new Map<string, number>();

    if (scopeMode === 'single_job') {
      anchorJobId = jobIdInput || String(allJobs[0]?.id || '');
      if (!anchorJobId) return jsonResponse({ error: 'Job not found' }, 404);
      selectedJobIds = [anchorJobId];
    } else {
      const allJobIds = allJobs.map((row) => String(row.id || '')).filter(Boolean);
      const [portDataRes, techDataRes] = await Promise.all([
        adminClient
          .from('surface_open_ports' as any)
          .select('scan_job_id')
          .in('scan_job_id', allJobIds),
        adminClient
          .from('surface_web_technologies' as any)
          .select('scan_job_id')
          .in('scan_job_id', allJobIds),
      ]);

      for (const row of (portDataRes.data || []) as Array<Record<string, unknown>>) {
        const key = String(row?.scan_job_id || '').trim();
        if (!key) continue;
        jobDataPresence.set(key, (jobDataPresence.get(key) || 0) + 1);
      }
      for (const row of (techDataRes.data || []) as Array<Record<string, unknown>>) {
        const key = String(row?.scan_job_id || '').trim();
        if (!key) continue;
        jobDataPresence.set(key, (jobDataPresence.get(key) || 0) + 1);
      }

      const { data: targetRows } = await adminClient
        .from('surface_scan_targets' as any)
        .select('scan_job_id, target_value, target_type')
        .in('scan_job_id', allJobIds);

      const jobsById = new Map(allJobs.map((entry) => [String(entry.id), entry]));
      const explicitTargetRows = ((targetRows || []) as Array<Record<string, unknown>>)
        .map((row) => ({
          scan_job_id: String(row?.scan_job_id || '').trim(),
          target_value: String(row?.target_value || '').trim().toLowerCase(),
          target_type: String(row?.target_type || '').trim().toLowerCase(),
        }))
        .filter((row) => row.scan_job_id && row.target_value);
      const jobsWithExplicitTargets = new Set(explicitTargetRows.map((row) => row.scan_job_id));
      const synthesizedTargetRows = allJobs
        .filter((job) => !jobsWithExplicitTargets.has(String(job.id || '')))
        .map((job) => {
          const targetValue = String(job.normalized_target || job.raw_target || job.hostname || '').trim().toLowerCase();
          const targetType = String(job.target_type || (targetValue.includes(':') || isValidIPv4(targetValue) ? 'ipv4' : 'domain')).trim().toLowerCase();
          return {
            scan_job_id: String(job.id || '').trim(),
            target_value: targetValue,
            target_type: targetType,
          };
        })
        .filter((row) => row.scan_job_id && row.target_value);
      const allTargetRows = [...explicitTargetRows, ...synthesizedTargetRows];
      const countedTargets = new Set<string>();
      const groupedTargets = new Map<string, {
        target_value: string;
        target_type: string;
        jobs: ExposureJobMeta[];
      }>();

      for (const row of allTargetRows) {
        const scanJobId = row.scan_job_id;
        const targetValue = row.target_value;
        const targetType = row.target_type;
        if (!scanJobId || !targetValue) continue;
        const targetKey = `${targetType || 'target'}|${targetValue}`;

        const reason = scopeReasonForTarget(targetValue, targetType, scopeDomains, ipScopeRules as any);
        if (!countedTargets.has(targetKey)) {
          trackScopeReason(counters, reason);
          countedTargets.add(targetKey);
        }
        if (reason) continue;

        const jobMeta = jobsById.get(scanJobId);
        if (!jobMeta) continue;
        if (!groupedTargets.has(targetKey)) {
          groupedTargets.set(targetKey, {
            target_value: targetValue,
            target_type: targetType || 'target',
            jobs: [],
          });
        }
        groupedTargets.get(targetKey)!.jobs.push(jobMeta);
      }

      const selectedIdsSet = new Set<string>();
      const liveIdsSet = new Set<string>();
      for (const [targetKey, payload] of groupedTargets.entries()) {
        const jobs = payload.jobs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        const live = jobs[0] || null;
        const completedWithData = jobs.find((entry) =>
          isTerminalGoodStatus(entry.status)
          && (hasExposureData(entry.summary) || (jobDataPresence.get(String(entry.id || '')) || 0) > 0),
        );
        const failedWithData = jobs.find((entry) =>
          String(entry.status || '').toLowerCase() === 'failed'
          && (hasExposureData(entry.summary) || (jobDataPresence.get(String(entry.id || '')) || 0) > 0),
        );
        const completedAny = jobs.find((entry) => isTerminalGoodStatus(entry.status));
        const terminalAny = jobs.find((entry) => isTerminalStatus(entry.status));
        const lastGood = completedWithData || failedWithData || completedAny || terminalAny || null;
        const dataJob = lastGood || live;

        const latestDataJobByScanType = new Map<string, ExposureJobMeta>();
        for (const candidate of jobs) {
          const scanType = String(candidate.scan_type || 'unknown').toLowerCase();
          if (latestDataJobByScanType.has(scanType)) continue;
          const hasData = hasExposureData(candidate.summary)
            || (jobDataPresence.get(String(candidate.id || '')) || 0) > 0;
          const status = String(candidate.status || '').toLowerCase();
          if ((isTerminalGoodStatus(status) || status === 'failed') && hasData) {
            latestDataJobByScanType.set(scanType, candidate);
          }
        }
        if (latestDataJobByScanType.size === 0 && dataJob) {
          latestDataJobByScanType.set(String(dataJob.scan_type || 'unknown'), dataJob);
        }
        for (const selectedDataJob of latestDataJobByScanType.values()) {
          if (selectedDataJob.id) selectedIdsSet.add(String(selectedDataJob.id));
        }
        if (live?.id) liveIdsSet.add(String(live.id));

        targetSnapshots.push({
          target_key: targetKey,
          target_value: payload.target_value,
          target_type: payload.target_type,
          snapshot_source: dataJob?.id && live?.id && String(dataJob.id) !== String(live.id) ? 'last_good' : 'live',
          live: {
            job_id: live?.id ? String(live.id) : null,
            status: live?.status ? String(live.status) : null,
            created_at: live?.created_at ? String(live.created_at) : null,
            scan_profile: live?.scan_profile ? String(live.scan_profile) : null,
          },
          last_good: {
            job_id: lastGood?.id ? String(lastGood.id) : null,
            status: lastGood?.status ? String(lastGood.status) : null,
            created_at: lastGood?.created_at ? String(lastGood.created_at) : null,
            completed_at: lastGood?.completed_at ? String(lastGood.completed_at) : null,
            scan_profile: lastGood?.scan_profile ? String(lastGood.scan_profile) : null,
          },
        });
      }

      selectedJobIds = Array.from(selectedIdsSet);
      liveJobIds = Array.from(liveIdsSet);
      targetSnapshots = targetSnapshots.sort((a, b) => a.target_value.localeCompare(b.target_value));

      // Fallback resiliente: se i target non sono presenti/coerenti, usa gli ultimi job exposure
      // per evitare dashboard vuota anche con dati porte/tecnologie già persistiti.
      if (selectedJobIds.length === 0) {
        selectedJobIds = allJobs
          .filter((row) => {
            const status = String(row.status || '').toLowerCase();
            if (['completed', 'running', 'queued', 'waiting'].includes(status)) return true;
            return status === 'failed' && (
              hasExposureData(row.summary || null)
              || (jobDataPresence.get(String(row.id || '')) || 0) > 0
            );
          })
          .map((row) => String(row.id || ''))
          .filter(Boolean)
          .slice(0, 120);

        if (countedTargets.size === 0) {
          counters.in_scope = Math.max(counters.in_scope, scopeDomains.length + ipScopeRules.length);
        }
      }

      if (selectedJobIds.length === 0) {
        return jsonResponse(emptySummary(scopeMode, counters, true));
      }

      const selectedJobsMeta = allJobs.filter((row) => selectedJobIds.includes(String(row.id)));
      selectedJobsMeta.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      anchorJobId = String(selectedJobsMeta[0]?.id || selectedJobIds[0] || '');
    }

    if (!anchorJobId) return jsonResponse({ error: 'Job not found' }, 404);

    const { data: job } = await adminClient
      .from('surface_scan_jobs' as any)
      .select('*')
      .eq('id', anchorJobId)
      .single();
    if (!job) return jsonResponse({ error: 'Job not found' }, 404);

    const resolvedCustomerId = String(job.customer_id || job.organization_id || customerId).trim();
    assertCustomerAccess(caller, resolvedCustomerId);

    const [
      targetsRes,
      openPortsRes,
      findingsRes,
      scoreFindingsRes,
      classicPortFindingsRes,
      classicPortObservationsRes,
      technologiesRes,
      sslRes,
      previousJobRes,
      vulnerabilityMatchesRes,
    ] = await Promise.all([
      adminClient
        .from('surface_scan_targets' as any)
        .select('id, target_value, target_type')
        .in('scan_job_id', selectedJobIds),
      adminClient
        .from('surface_open_ports' as any)
        .select('id, host, ip, port, protocol, source, service_name, service_product, service_version, banner, exposure_level, is_web, is_tls, last_seen_at')
        .in('scan_job_id', selectedJobIds),
      adminClient
        .from('surface_exposure_findings' as any)
        .select('id, severity, finding_type')
        .in('scan_job_id', selectedJobIds),
      adminClient
        .from('surface_findings' as any)
        .select('id, severity, finding_type, status')
        .in('scan_job_id', selectedJobIds),
      adminClient
        .from('surface_findings' as any)
        .select('port, protocol, severity, finding_type, title, affected_asset, affected_url, ip, evidence, created_at')
        .in('scan_job_id', selectedJobIds)
        .in('finding_type', ['open_port_exposed', 'service_fingerprint_exposed', 'sensitive_port_exposed']),
      adminClient
        .from('surface_observations' as any)
        .select('value, created_at')
        .in('scan_job_id', selectedJobIds)
        .eq('module', 'open_ports')
        .in('observation_type', ['open_ports', 'open_ports_summary']),
      adminClient
        .from('surface_web_technologies' as any)
        .select('url, host, technology_name, technology_version, category, created_at')
        .in('scan_job_id', selectedJobIds),
      adminClient
        .from('surface_ssl_results' as any)
        .select('id')
        .in('scan_job_id', selectedJobIds),
      adminClient
        .from('surface_scan_jobs' as any)
        .select('id')
        .or(`customer_id.eq.${resolvedCustomerId},organization_id.eq.${resolvedCustomerId}`)
        .in('scan_type', UNIFIED_EXPOSURE_SCAN_TYPES)
        .lt('created_at', String(job.created_at || new Date().toISOString()))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      adminClient
        .from('surface_service_vulnerability_matches' as any)
        .select('open_port_id, host, ip, port, protocol, cve_id, match_status, cvss_score, epss_score, epss_percentile, cisa_kev, service_product, service_version, cpe_name, match_confidence')
        .eq('organization_id', resolvedCustomerId)
        .in('scan_job_id', selectedJobIds),
    ]);

    const targets = (targetsRes.data || []) as Array<Record<string, unknown>>;
    if (scopeMode === 'single_job') {
      const countedTargets = new Set<string>();
      for (const targetRow of targets) {
        const targetValue = String(targetRow?.target_value || '').trim().toLowerCase();
        const targetType = String(targetRow?.target_type || '').trim().toLowerCase();
        const targetKey = `${targetType || 'target'}|${targetValue}`;
        if (countedTargets.has(targetKey)) continue;
        const reason = scopeReasonForTarget(
          targetValue,
          targetType,
          scopeDomains,
          ipScopeRules as any,
        );
        trackScopeReason(counters, reason);
        countedTargets.add(targetKey);
      }
    }

    const exposureOpenPorts = dedupeOpenPorts((openPortsRes.data || []) as OpenPortSnapshot[]);
    const classicPortFindings = (classicPortFindingsRes.data || []) as ClassicPortFindingRow[];
    const classicPortObservations = (classicPortObservationsRes.data || []) as ClassicPortObservationRow[];
    const classicOpenPorts = classicPortFindings
      .map((row) => toOpenPortFromClassicFinding(row))
      .filter(Boolean) as OpenPortSnapshot[];
    const observationOpenPorts = classicPortObservations.flatMap((row) => toOpenPortsFromClassicObservation(row));
    const openPorts = dedupeOpenPorts([...exposureOpenPorts, ...classicOpenPorts, ...observationOpenPorts]);
    const exposureFindings = (findingsRes.data || []) as any[];
    const classicScoreFindings = ((scoreFindingsRes.data || []) as any[])
      .filter((row) => !['resolved', 'suppressed', 'false_positive', 'accepted_risk'].includes(String(row?.status || '').toLowerCase()));
    const findings = classicScoreFindings.length > 0 ? classicScoreFindings : exposureFindings;
    const technologies = dedupeTechnologies((technologiesRes.data || []) as TechnologySnapshot[]);
    const ssl = (sslRes.data || []) as any[];
    const vulnerabilityMatches = (vulnerabilityMatchesRes.data || []) as ExposureVulnerabilityMatch[];

    const hostsWithOpenPorts = new Set(openPorts.map((row) => String(row.host || '').trim().toLowerCase()).filter(Boolean));
    const topPortCounter = new Map<number, number>();
    const sourceCounter = new Map<string, number>();
    for (const row of openPorts) {
      const port = Number(row.port || 0);
      if (!Number.isFinite(port) || port <= 0) continue;
      topPortCounter.set(port, (topPortCounter.get(port) || 0) + 1);
      const source = String(row.source || 'legacy').trim().toLowerCase() || 'legacy';
      sourceCounter.set(source, (sourceCounter.get(source) || 0) + 1);
    }

    const technologyCounter = new Map<string, number>();
    for (const row of technologies) {
      const name = String(row.technology_name || '').trim();
      if (!name) continue;
      technologyCounter.set(name, (technologyCounter.get(name) || 0) + 1);
    }

    const findingsBySeverity = {
      critical: findings.filter((row) => String(row.severity || '').toLowerCase() === 'critical').length,
      high: findings.filter((row) => String(row.severity || '').toLowerCase() === 'high').length,
      medium: findings.filter((row) => String(row.severity || '').toLowerCase() === 'medium').length,
      low: findings.filter((row) => String(row.severity || '').toLowerCase() === 'low').length,
      info: findings.filter((row) => String(row.severity || '').toLowerCase() === 'info').length,
    };

    let diff = {
      new_open_ports: [] as OpenPortSnapshot[],
      closed_ports: [] as OpenPortSnapshot[],
      unchanged_ports: [] as OpenPortSnapshot[],
      new_technologies: [] as TechnologySnapshot[],
      removed_technologies: [] as TechnologySnapshot[],
    };

    if (scopeMode === 'single_job' && previousJobRes.data?.id) {
      const previousJobId = String(previousJobRes.data.id);
      const [prevPortsRes, prevTechRes] = await Promise.all([
        adminClient
          .from('surface_open_ports' as any)
          .select('host, ip, port, protocol, source, service_name, exposure_level, last_seen_at')
          .eq('scan_job_id', previousJobId),
        adminClient
          .from('surface_web_technologies' as any)
          .select('host, url, technology_name, technology_version, created_at')
          .eq('scan_job_id', previousJobId),
      ]);

      diff = compareExposureSnapshots(
        dedupeOpenPorts((prevPortsRes.data || []) as OpenPortSnapshot[]),
        openPorts,
        dedupeTechnologies((prevTechRes.data || []) as TechnologySnapshot[]),
        technologies,
      );
    }

    const tlsHeaderWeaknesses = findings.filter((row) =>
      /tls|ssl|security_header|http_header|hsts|cipher|certificate/i.test(String(row?.finding_type || ''))
    ).length;
    const exposureScore = computeExposureScoreV2({
      ports: openPorts,
      findings,
      vulnerabilityMatches,
      newOpenPorts: diff.new_open_ports.length,
      tlsHeaderWeaknesses,
    });

    return jsonResponse({
      job_id: anchorJobId,
      job_ids: selectedJobIds,
      live_job_ids: liveJobIds,
      target_snapshots: targetSnapshots,
      scope_mode: scopeMode,
      scope_aggregate: scopeMode !== 'single_job',
      targets_in_scope: counters.in_scope,
      scope_counters: counters,
      status: String(job.status || 'unknown'),
      targets_total: counters.in_scope,
      hosts_with_open_ports: hostsWithOpenPorts.size,
      open_ports_total: openPorts.length,
      critical_exposures: findingsBySeverity.critical + findingsBySeverity.high,
      web_services: openPorts.filter((row) => Boolean(row.is_web)).length,
      tls_services: openPorts.filter((row) => Boolean(row.is_tls)).length,
      ssl_snapshots: ssl.length,
      top_open_ports: Array.from(topPortCounter.entries())
        .map(([port, count]) => ({ port, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      included_scan_types: UNIFIED_EXPOSURE_SCAN_TYPES,
      source_counts: Object.fromEntries(sourceCounter.entries()),
      ...exposureScore,
      technologies: Array.from(technologyCounter.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      findings_by_severity: findingsBySeverity,
      diff,
    });
  } catch (error: any) {
    const { status, body } = toErrorResponsePayload(error, 'Internal error');
    return jsonResponse(body, status);
  }
});
