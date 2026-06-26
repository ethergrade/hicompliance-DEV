import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { surfaceScan360Api, type SurfaceScanJob } from '@/lib/api/surface-scan360';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import {
  classifySurfaceHostForScope,
  isIpWithinScopeRules,
  isIpv4,
  isIpv6,
  splitMonitoredScopeRules,
  type SurfaceMonitoredScopeRule,
} from '@/lib/surfaceScopeGuard';
import { presentStorageBucketFinding } from '@/lib/surfacescan/storageFindingPresentation';

export interface SurfaceFindingRow {
  id: string;
  scan_job_id?: string | null;
  provider: string | null;
  module: string | null;
  finding_type: string;
  title: string;
  description: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  affected_asset: string | null;
  affected_url: string | null;
  ip: string | null;
  port: number | null;
  protocol: string | null;
  cve: string[] | null;
  cwe: string[] | null;
  cvss: number | null;
  epss: number | null;
  cisa_kev: boolean | null;
  remediation: string | null;
  evidence: Record<string, any> | null;
  attribution_confidence: string | null;
  status: string | null;
  created_at: string;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  occurrence_count?: number | null;
}

interface SurfaceOpenPortRow {
  id: string;
  scan_job_id: string | null;
  host: string | null;
  ip: string | null;
  port: number | null;
  protocol: string | null;
  source?: string | null;
  state?: string | null;
  service_name?: string | null;
  service_product?: string | null;
  service_version?: string | null;
  exposure_level?: string | null;
  is_web?: boolean | null;
  is_tls?: boolean | null;
  remediation_hint?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  raw?: Record<string, any> | null;
}

const ORGANIZATION_SCOPE_REPORT_TITLE = 'SurfaceScan360 Report - Organization Scope';

const isOrganizationScopeReport = (row: Record<string, any> | null): boolean => {
  const title = String(row?.title || '').trim();
  const payloadScope = String(row?.payload?.scan?.scope_mode || '').trim().toLowerCase();
  const repositoryMode = String(row?.payload?.report_repository?.mode || '').trim().toLowerCase();
  return (
    title === ORGANIZATION_SCOPE_REPORT_TITLE
    || payloadScope === 'organization_scope'
    || repositoryMode === 'organization_scope_canonical'
  );
};

const normalizeAssetKey = (value: unknown): string => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (isIpv4(raw) || isIpv6(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      // fallback
    }
  }
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
};

const targetHostFromValue = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/\.$/, '').toLowerCase();
  }
};

const severityFromCvss = (value: unknown): SurfaceFindingRow['severity'] => {
  const cvss = Number(value);
  if (!Number.isFinite(cvss)) return 'info';
  if (cvss >= 9) return 'critical';
  if (cvss >= 7) return 'high';
  if (cvss >= 4) return 'medium';
  if (cvss > 0) return 'low';
  return 'info';
};

const openPortSeverity = (port: number, exposureLevel?: string | null): SurfaceFindingRow['severity'] => {
  const configured = String(exposureLevel || '').toLowerCase();
  if (['critical', 'high', 'medium', 'low', 'info'].includes(configured)) {
    return configured as SurfaceFindingRow['severity'];
  }
  if ([3389, 5900, 6379, 9200, 27017, 11211, 2375, 10250, 1521, 1433].includes(port)) return 'high';
  if ([21, 22, 23, 445, 3306, 5432, 8080, 8443, 8888, 9000].includes(port)) return 'medium';
  if ([80, 443].includes(port)) return 'info';
  return 'low';
};

const openPortServiceLabel = (row: SurfaceOpenPortRow): string => {
  const service = [row.service_name, row.service_product, row.service_version]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .join(' ');
  return service || `${String(row.protocol || 'tcp').toUpperCase()}/${row.port || '-'}`;
};

const openPortSignature = (row: Pick<SurfaceFindingRow, 'affected_asset' | 'ip' | 'port' | 'protocol'>): string => [
  normalizeAssetKey(row.affected_asset || ''),
  String(row.ip || '').trim().toLowerCase(),
  Number(row.port || 0),
  String(row.protocol || 'tcp').trim().toLowerCase() || 'tcp',
].join('|');

const buildExistingCveSignatureSet = (rows: SurfaceFindingRow[]): Set<string> => {
  const signatures = new Set<string>();
  for (const row of rows) {
    const rowAsset = normalizeAssetKey(row.affected_asset || row.affected_url || '');
    const rowIp = String(row.ip || '').trim().toLowerCase();
    const rowCves = Array.isArray(row.cve)
      ? row.cve.map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean)
      : [];
    for (const cve of rowCves) {
      signatures.add(`${cve}|${rowAsset}|${rowIp}`);
      if (rowAsset) signatures.add(`${cve}|${rowAsset}|`);
    }
  }
  return signatures;
};

const buildSyntheticCveRowsFromReport = (
  reportRow: Record<string, any> | null,
  existingRows: SurfaceFindingRow[],
): SurfaceFindingRow[] => {
  if (!reportRow?.payload || typeof reportRow.payload !== 'object') return [];
  const payload = reportRow.payload as Record<string, any>;
  const cveCatalog = Array.isArray(payload?.cve_catalog) ? payload.cve_catalog : [];
  if (cveCatalog.length === 0) return [];

  const assetIpMap = new Map<string, Set<string>>();
  const addAssetIp = (assetLabel: unknown, ipValue: unknown) => {
    const key = normalizeAssetKey(assetLabel);
    const ip = String(ipValue || '').trim().toLowerCase();
    if (!key || !ip || (!isIpv4(ip) && !isIpv6(ip))) return;
    if (!assetIpMap.has(key)) assetIpMap.set(key, new Set<string>());
    assetIpMap.get(key)?.add(ip);
  };

  const assetsInScope = Array.isArray(payload?.assets_in_scope) ? payload.assets_in_scope : [];
  for (const asset of assetsInScope) {
    addAssetIp(asset?.asset_value, asset?.ip || asset?.raw?.ip || null);
    addAssetIp(asset?.hostname, asset?.ip || asset?.raw?.ip || null);
  }
  for (const row of existingRows) addAssetIp(row.affected_asset || row.affected_url, row.ip);

  const existingSignatures = buildExistingCveSignatureSet(existingRows);
  const out: SurfaceFindingRow[] = [];
  const added = new Set<string>();

  for (const item of cveCatalog) {
    const cveId = String(item?.cve_id || '').trim().toUpperCase();
    if (!/^CVE-\d{4}-\d{4,7}$/.test(cveId)) continue;
    const affectedAssetsRaw = Array.isArray(item?.affected_assets) && item.affected_assets.length > 0
      ? item.affected_assets
      : [payload?.scan?.target || 'Asset monitorato'];

    for (const assetEntry of affectedAssetsRaw) {
      const normalizedAsset = normalizeAssetKey(assetEntry);
      if (!normalizedAsset) continue;
      const relatedIps = Array.from(assetIpMap.get(normalizedAsset) || []);
      const ipCandidates = relatedIps.length > 0
        ? relatedIps
        : ((isIpv4(normalizedAsset) || isIpv6(normalizedAsset)) ? [normalizedAsset] : ['']);

      for (const ipCandidate of ipCandidates) {
        const signature = `${cveId}|${normalizedAsset}|${String(ipCandidate || '').trim().toLowerCase()}`;
        if (existingSignatures.has(signature) || existingSignatures.has(`${cveId}|${normalizedAsset}|`) || added.has(signature)) continue;
        added.add(signature);
        const severity = severityFromCvss(item?.cvss);
        const affectedLabel = String(assetEntry || normalizedAsset).trim();
        out.push({
          id: `report-cve-${cveId}-${normalizedAsset}-${String(ipCandidate || '').replace(/[^a-z0-9]/gi, '-')}`,
          provider: 'surface_report',
          module: 'cve_catalog',
          finding_type: 'cve_catalog_reported',
          title: `${cveId} rilevata su ${affectedLabel}`,
          description: String(item?.description || '').trim() || `CVE presente nel catalogo report per asset ${affectedLabel}.`,
          severity,
          affected_asset: affectedLabel,
          affected_url: null,
          ip: ipCandidate || null,
          port: null,
          protocol: null,
          cve: [cveId],
          cwe: Array.isArray(item?.cwe) ? item.cwe.map((entry: unknown) => String(entry || '').trim().toUpperCase()).filter(Boolean) : null,
          cvss: Number.isFinite(Number(item?.cvss)) ? Number(item.cvss) : null,
          epss: Number.isFinite(Number(item?.epss)) ? Number(item.epss) : null,
          cisa_kev: Boolean(item?.cisa_kev),
          remediation: item?.kev_required_action
            ? String(item.kev_required_action)
            : 'Valutare patch/mitigazione della CVE e rieseguire validazione sul target interessato.',
          evidence: {
            source: 'surface_scan_ai_report',
            report_id: reportRow.id,
            report_created_at: reportRow.created_at,
            _from_report_cve_catalog: true,
            affected_asset: affectedLabel,
            ip: ipCandidate || null,
          },
          attribution_confidence: 'high',
          status: 'open',
          created_at: String(item?.refreshed_at || item?.last_modified_at || reportRow.created_at || new Date().toISOString()),
        });
      }
    }
  }
  return out;
};

const mapApiFinding = (record: Record<string, any> | null): SurfaceFindingRow | null => {
  if (!record || !record.id) return null;
  return presentStorageBucketFinding({
    id: String(record.id),
    scan_job_id: record.scan_job_id ? String(record.scan_job_id) : null,
    provider: record.provider ?? null,
    module: record.module ?? null,
    finding_type: String(record.finding_type || ''),
    title: String(record.title || ''),
    description: record.description ?? null,
    severity: (record.severity || 'info') as SurfaceFindingRow['severity'],
    affected_asset: record.affected_asset ?? null,
    affected_url: record.affected_url ?? null,
    ip: record.ip ? String(record.ip) : null,
    port: record.port ?? null,
    protocol: record.protocol ?? null,
    cve: Array.isArray(record.cve) ? record.cve : null,
    cwe: Array.isArray(record.cwe) ? record.cwe : null,
    cvss: record.cvss ?? null,
    epss: record.epss ?? null,
    cisa_kev: record.cisa_kev ?? null,
    remediation: record.remediation ?? null,
    evidence: record.evidence && typeof record.evidence === 'object' ? (record.evidence as Record<string, any>) : null,
    attribution_confidence: record.attribution_confidence ?? null,
    status: record.status ?? null,
    created_at: String(record.created_at || new Date().toISOString()),
    first_seen_at: record.first_seen_at ?? null,
    last_seen_at: record.last_seen_at ?? null,
    occurrence_count: record.occurrence_count ?? null,
  }) as SurfaceFindingRow;
};

const normalizeOpenPortFindingTargets = (
  rows: SurfaceFindingRow[],
  jobTargets: Map<string, { raw_target: string; normalized_target: string; hostname: string }>,
): SurfaceFindingRow[] => rows.map((row) => {
  if (
    !['open_port_exposed', 'service_fingerprint_exposed', 'sensitive_port_exposed'].includes(row.finding_type)
    || !row.scan_job_id
  ) return row;
  const currentAsset = normalizeAssetKey(row.affected_asset || '');
  if (!currentAsset || (!isIpv4(currentAsset) && !isIpv6(currentAsset))) return row;
  const jobTarget = jobTargets.get(String(row.scan_job_id || ''));
  const jobHost = targetHostFromValue(jobTarget?.hostname || jobTarget?.normalized_target || jobTarget?.raw_target || '');
  if (!jobHost || isIpv4(jobHost) || isIpv6(jobHost)) return row;
  const protocol = String(row.protocol || 'tcp').toLowerCase();
  const port = Number(row.port || 0);
  return {
    ...row,
    affected_asset: jobHost,
    affected_url: row.affected_url || ([80, 443].includes(port) ? `${port === 443 ? 'https' : 'http'}://${jobHost}` : null),
    title: port > 0 ? `Porta ${port}/${protocol.toUpperCase()} aperta su ${jobHost}` : row.title,
    description: row.description
      ? row.description.replace(currentAsset, `${jobHost} (${currentAsset})`)
      : `Servizio esposto rilevato su ${jobHost} (${currentAsset}). CVSS/EPSS non disponibili finche non viene correlata una CVE specifica.`,
    evidence: {
      ...(row.evidence || {}),
      scope_target_host: jobHost,
      original_affected_asset: currentAsset,
    },
  };
});

const buildSyntheticOpenPortRows = (
  ports: SurfaceOpenPortRow[],
  jobTargets: Map<string, { raw_target: string; normalized_target: string; hostname: string }>,
  existingRows: SurfaceFindingRow[],
): SurfaceFindingRow[] => {
  const existing = new Set(
    existingRows
      .filter((row) => ['open_port_exposed', 'service_fingerprint_exposed', 'sensitive_port_exposed'].includes(row.finding_type))
      .map((row) => openPortSignature(row)),
  );
  const out: SurfaceFindingRow[] = [];
  const added = new Set<string>();

  for (const row of ports) {
    const port = Number(row.port || 0);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) continue;
    const protocol = String(row.protocol || 'tcp').trim().toLowerCase() || 'tcp';
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
    const jobTarget = row.scan_job_id ? jobTargets.get(String(row.scan_job_id)) : null;
    const rawHost = targetHostFromValue(raw.scope_target_host || raw.root_domain || raw.target || row.host || '');
    const jobHost = targetHostFromValue(jobTarget?.hostname || jobTarget?.normalized_target || jobTarget?.raw_target || '');
    const rowHost = targetHostFromValue(row.host || '');
    const host = rawHost && !isIpv4(rawHost) && !isIpv6(rawHost)
      ? rawHost
      : jobHost && !isIpv4(jobHost) && !isIpv6(jobHost)
        ? jobHost
        : rowHost || String(row.ip || '').trim() || 'asset monitorato';
    const ip = String(row.ip || '').trim() || (isIpv4(rowHost) || isIpv6(rowHost) ? rowHost : '');
    const signature = openPortSignature({ affected_asset: host, ip: ip || null, port, protocol });
    if (existing.has(signature) || added.has(signature)) continue;
    added.add(signature);
    const service = openPortServiceLabel(row);
    const seenAt = String(row.last_seen_at || row.first_seen_at || new Date().toISOString());
    out.push({
      id: `open-port-${String(row.id || signature)}`,
      scan_job_id: row.scan_job_id || null,
      provider: 'surface_open_ports',
      module: 'open_ports',
      finding_type: 'open_port_exposed',
      title: `Porta ${port}/${protocol.toUpperCase()} aperta su ${host}`,
      description: `Servizio ${service} rilevato su ${host}${ip ? ` (${ip})` : ''}. CVSS/EPSS non disponibili finche non viene correlata una CVE specifica al servizio esposto.`,
      severity: openPortSeverity(port, row.exposure_level),
      affected_asset: host,
      affected_url: row.is_web ? `${row.is_tls ? 'https' : 'http'}://${host}` : null,
      ip: ip || null,
      port,
      protocol,
      cve: [],
      cwe: null,
      cvss: null,
      epss: null,
      cisa_kev: false,
      remediation: row.remediation_hint || 'Verificare che la porta sia necessaria, limitare l\'accesso da Internet dove possibile e rieseguire la scansione dopo la mitigazione.',
      evidence: {
        source: row.source || raw.source || 'surface_open_ports',
        open_port_id: row.id,
        service_name: row.service_name || null,
        service_product: row.service_product || null,
        service_version: row.service_version || null,
        scope_target_host: host,
        ip: ip || null,
        _derived_from_open_port: true,
      },
      attribution_confidence: 'high',
      status: 'open',
      created_at: seenAt,
      first_seen_at: row.first_seen_at || seenAt,
      last_seen_at: row.last_seen_at || seenAt,
      occurrence_count: 1,
    });
  }
  return out;
};

const extractHostFromRow = (row: SurfaceFindingRow): string => {
  const urlCandidate = String(row.affected_url || '').trim();
  if (urlCandidate) {
    try {
      return new URL(urlCandidate).hostname.toLowerCase();
    } catch {
      return '';
    }
  }
  const asset = String(row.affected_asset || '').trim().toLowerCase();
  if (!asset || isIpv4(asset) || isIpv6(asset)) return '';
  return asset.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
};

const shouldHideFindingByScope = (
  row: SurfaceFindingRow,
  monitoredRules: SurfaceMonitoredScopeRule[],
): boolean => {
  const backendExcluded = Boolean(row?.evidence?._scope_excluded);
  if (backendExcluded) return true;
  const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules(monitoredRules);
  const ipCandidate = String(row.ip || row.evidence?.ip || '').trim().toLowerCase();
  if (ipCandidate && (isIpv4(ipCandidate) || isIpv6(ipCandidate)) && !isIpWithinScopeRules(ipCandidate, ipScopeRules)) {
    return true;
  }
  const hostCandidate = extractHostFromRow(row);
  if (hostCandidate) {
    const classification = classifySurfaceHostForScope(hostCandidate, scopeDomains);
    if (classification.blocked) return true;
  }
  return false;
};

export const useSurfaceScanFindings = () => {
  const { organizationId, isLoading: clientLoading, groupId } = useClientOrganization();

  const jobsQuery = useQuery({
    queryKey: ['surface-scan-findings-jobs', organizationId, groupId],
    queryFn: async () => {
      if (!organizationId) return [] as SurfaceScanJob[];
      return surfaceScan360Api.listJobs(organizationId, { page: 1 }, groupId);
    },
    enabled: !!organizationId && !clientLoading,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const completedJobs = useMemo(
    () => (jobsQuery.data || []).filter((j) => j.status === 'completed').slice(0, 10),
    [jobsQuery.data],
  );

  const [allApiFindings, setAllApiFindings] = useState<SurfaceFindingRow[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(false);

  const fetchAllFindings = useCallback(async () => {
    if (!organizationId || completedJobs.length === 0) {
      setAllApiFindings([]);
      return;
    }
    setFindingsLoading(true);
    try {
      const results = await Promise.allSettled(
        completedJobs.map((job) => surfaceScan360Api.getJobFindings(organizationId, job.id, { page: 1 }, groupId)),
      );
      const allRows: SurfaceFindingRow[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          for (const raw of result.value) {
            const mapped = mapApiFinding(raw);
            if (mapped) allRows.push(mapped);
          }
        }
      }
      const seen = new Set<string>();
      setAllApiFindings(allRows.filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      }));
    } catch (error) {
      console.error('Error fetching surface findings:', error);
    } finally {
      setFindingsLoading(false);
    }
  }, [organizationId, completedJobs, groupId]);

  useEffect(() => {
    fetchAllFindings();
    const interval = setInterval(() => { fetchAllFindings(); }, 30_000);
    return () => clearInterval(interval);
  }, [fetchAllFindings]);

  const directFindingsQuery = useQuery({
    queryKey: ['surface-scan-findings-direct', organizationId, groupId],
    queryFn: async () => {
      if (!organizationId) return [] as SurfaceFindingRow[];
      const scopeFilter = `customer_id.eq.${organizationId},organization_id.eq.${organizationId}`;
      const { data, error } = await supabase
        .from('surface_findings' as any)
        .select('id, scan_job_id, provider, module, finding_type, title, description, severity, affected_asset, affected_url, ip, port, protocol, cve, cwe, cvss, epss, cisa_kev, remediation, evidence, attribution_confidence, status, created_at, first_seen_at, last_seen_at, occurrence_count')
        .or(scopeFilter)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return ((data || []) as Record<string, any>[]).map(mapApiFinding).filter((row): row is SurfaceFindingRow => Boolean(row));
    },
    enabled: !!organizationId && !clientLoading,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const openPortsQuery = useQuery({
    queryKey: ['surface-scan-findings-open-ports', organizationId, groupId],
    queryFn: async () => {
      if (!organizationId) return [] as SurfaceOpenPortRow[];
      const scopeFilter = `customer_id.eq.${organizationId},organization_id.eq.${organizationId}`;
      const { data, error } = await supabase
        .from('surface_open_ports' as any)
        .select('id, scan_job_id, host, ip, port, protocol, source, state, service_name, service_product, service_version, exposure_level, is_web, is_tls, remediation_hint, first_seen_at, last_seen_at, raw')
        .or(scopeFilter)
        .eq('state', 'open')
        .order('last_seen_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as SurfaceOpenPortRow[];
    },
    enabled: !!organizationId && !clientLoading,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const aiReportsQuery = useQuery({
    queryKey: ['surface-scan-findings-ai-reports', organizationId, groupId],
    queryFn: async () => {
      if (!organizationId) return [] as any[];
      return surfaceScan360Api.listAiReports(organizationId, { page: 1 }, groupId);
    },
    enabled: !!organizationId && !clientLoading,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const jobTargetIds = useMemo(() => [
    ...new Set([
      ...(jobsQuery.data || []).map((job) => String(job.id || '')),
      ...allApiFindings.map((row) => String(row.scan_job_id || '')),
      ...(directFindingsQuery.data || []).map((row) => String(row.scan_job_id || '')),
      ...(openPortsQuery.data || []).map((row) => String(row.scan_job_id || '')),
    ].filter(Boolean)),
  ], [allApiFindings, directFindingsQuery.data, jobsQuery.data, openPortsQuery.data]);

  const jobTargetsQuery = useQuery({
    queryKey: ['surface-scan-findings-job-targets', organizationId, jobTargetIds],
    queryFn: async () => {
      const map = new Map<string, { raw_target: string; normalized_target: string; hostname: string }>();
      for (const job of jobsQuery.data || []) {
        map.set(String(job.id), {
          raw_target: String(job.raw_target || ''),
          normalized_target: String(job.normalized_target || ''),
          hostname: String(job.hostname || ''),
        });
      }
      const missing = jobTargetIds.filter((id) => !map.has(id));
      if (missing.length > 0) {
        const { data, error } = await supabase
          .from('surface_scan_jobs' as any)
          .select('id, raw_target, normalized_target, hostname')
          .in('id', missing);
        if (error) throw error;
        for (const row of (data || []) as Record<string, any>[]) {
          map.set(String(row.id || ''), {
            raw_target: String(row.raw_target || ''),
            normalized_target: String(row.normalized_target || ''),
            hostname: String(row.hostname || ''),
          });
        }
      }
      return map;
    },
    enabled: !!organizationId && jobTargetIds.length > 0,
    staleTime: 30_000,
  });

  const [scopeRules, setScopeRules] = useState<SurfaceMonitoredScopeRule[]>([]);
  const fetchScopeRules = useCallback(async () => {
    if (!organizationId) return;
    try {
      const scopeRows = await surfaceScan360Api.listMonitoredIps(organizationId, groupId);
      setScopeRules((scopeRows || []) as SurfaceMonitoredScopeRule[]);
    } catch {
      // silent
    }
  }, [organizationId, groupId]);

  useEffect(() => {
    if (organizationId) fetchScopeRules();
  }, [organizationId, groupId, fetchScopeRules]);

  const findings = useMemo(() => {
    const byId = new Map<string, SurfaceFindingRow>();
    for (const row of allApiFindings) byId.set(row.id, row);
    for (const row of directFindingsQuery.data || []) byId.set(row.id, row);
    const jobTargets = jobTargetsQuery.data || new Map<string, { raw_target: string; normalized_target: string; hostname: string }>();
    const normalizedRows = normalizeOpenPortFindingTargets(Array.from(byId.values()), jobTargets);
    const syntheticOpenPortRows = buildSyntheticOpenPortRows(openPortsQuery.data || [], jobTargets, normalizedRows);
    const reportRows = (aiReportsQuery.data || []) as Record<string, any>[];
    const canonicalRows = reportRows.filter((row) => isOrganizationScopeReport(row));
    const selectedReport = canonicalRows[0] || reportRows[0] || null;
    const syntheticCveRows = buildSyntheticCveRowsFromReport(selectedReport, [...normalizedRows, ...syntheticOpenPortRows]);
    return [...normalizedRows, ...syntheticOpenPortRows, ...syntheticCveRows]
      .filter((row) => !['resolved', 'suppressed', 'false_positive', 'accepted_risk'].includes(String(row.status || '').toLowerCase()))
      .filter((row) => !shouldHideFindingByScope(row, scopeRules));
  }, [aiReportsQuery.data, allApiFindings, directFindingsQuery.data, jobTargetsQuery.data, openPortsQuery.data, scopeRules]);

  const loading = jobsQuery.isLoading
    || findingsLoading
    || directFindingsQuery.isLoading
    || openPortsQuery.isLoading
    || aiReportsQuery.isLoading
    || jobTargetsQuery.isLoading;

  const counts = useMemo(() => {
    const bySeverity = findings.reduce((acc, row) => {
      acc[row.severity] = (acc[row.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return {
      total: findings.length,
      critical: bySeverity.critical || 0,
      high: bySeverity.high || 0,
      medium: bySeverity.medium || 0,
      low: bySeverity.low || 0,
      info: bySeverity.info || 0,
    };
  }, [findings]);

  const refetch = useCallback(async () => {
    await jobsQuery.refetch();
    await fetchAllFindings();
    await directFindingsQuery.refetch();
    await openPortsQuery.refetch();
    await aiReportsQuery.refetch();
    await jobTargetsQuery.refetch();
    await fetchScopeRules();
  }, [aiReportsQuery, directFindingsQuery, fetchAllFindings, fetchScopeRules, jobTargetsQuery, jobsQuery, openPortsQuery]);

  return { findings, loading, counts, scopeRules, refetch };
};
