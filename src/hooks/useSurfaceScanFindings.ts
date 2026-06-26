import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useToast } from '@/hooks/use-toast';
import {
  classifySurfaceHostForScope,
  isIpWithinScopeRules,
  isIpv4,
  isIpv6,
  splitMonitoredScopeRules,
  type SurfaceMonitoredScopeRule,
} from '@/lib/surfaceScopeGuard';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

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
      // fallback sotto
    }
  }
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
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

  for (const row of existingRows) {
    addAssetIp(row.affected_asset || row.affected_url, row.ip);
  }

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
        if (existingSignatures.has(signature) || existingSignatures.has(`${cveId}|${normalizedAsset}|`) || added.has(signature)) {
          continue;
        }
        added.add(signature);

        const severity = severityFromCvss(item?.cvss);
        const description = String(item?.description || '').trim();
        const affectedLabel = String(assetEntry || normalizedAsset).trim();
        const remediation = item?.kev_required_action
          ? String(item.kev_required_action)
          : 'Valutare patch/mitigazione della CVE e rieseguire validazione sul target interessato.';

        out.push({
          id: `report-cve-${cveId}-${normalizedAsset}-${String(ipCandidate || '').replace(/[^a-z0-9]/gi, '-')}`,
          provider: 'surface_report',
          module: 'cve_catalog',
          finding_type: 'cve_catalog_reported',
          title: `${cveId} rilevata su ${affectedLabel}`,
          description: description || `CVE presente nel catalogo report per asset ${affectedLabel}.`,
          severity,
          affected_asset: affectedLabel,
          affected_url: null,
          ip: ipCandidate || null,
          port: null,
          protocol: null,
          cve: [cveId],
          cwe: Array.isArray(item?.cwe)
            ? item.cwe.map((entry: unknown) => String(entry || '').trim().toUpperCase()).filter(Boolean)
            : null,
          cvss: Number.isFinite(Number(item?.cvss)) ? Number(item.cvss) : null,
          epss: Number.isFinite(Number(item?.epss)) ? Number(item.epss) : null,
          cisa_kev: Boolean(item?.cisa_kev),
          remediation,
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

const targetHostFromValue = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/\.$/, '').toLowerCase();
  }
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
  const service = [
    row.service_name,
    row.service_product,
    row.service_version,
  ].map((entry) => String(entry || '').trim()).filter(Boolean).join(' ');
  if (service) return service;
  const protocol = String(row.protocol || 'tcp').toUpperCase();
  return `${protocol}/${row.port || '-'}`;
};

const openPortSignature = (row: Pick<SurfaceFindingRow, 'affected_asset' | 'ip' | 'port' | 'protocol'>): string => [
  normalizeAssetKey(row.affected_asset || ''),
  String(row.ip || '').trim().toLowerCase(),
  Number(row.port || 0),
  String(row.protocol || 'tcp').trim().toLowerCase() || 'tcp',
].join('|');

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
    const rawHost = targetHostFromValue(
      raw.scope_target_host
      || raw.root_domain
      || raw.target
      || row.host
      || '',
    );
    const jobHost = targetHostFromValue(jobTarget?.hostname || jobTarget?.normalized_target || jobTarget?.raw_target || '');
    const rowHost = targetHostFromValue(row.host || '');
    const host = rawHost && !isIpv4(rawHost) && !isIpv6(rawHost)
      ? rawHost
      : jobHost && !isIpv4(jobHost) && !isIpv6(jobHost)
        ? jobHost
        : rowHost || String(row.ip || '').trim() || 'asset monitorato';
    const ip = String(row.ip || '').trim() || (isIpv4(rowHost) || isIpv6(rowHost) ? rowHost : '');

    const candidate: Pick<SurfaceFindingRow, 'affected_asset' | 'ip' | 'port' | 'protocol'> = {
      affected_asset: host,
      ip: ip || null,
      port,
      protocol,
    };
    const signature = openPortSignature(candidate);
    if (existing.has(signature) || added.has(signature)) continue;
    added.add(signature);

    const service = openPortServiceLabel(row);
    const seenAt = String(row.last_seen_at || row.first_seen_at || new Date().toISOString());
    out.push({
      id: `open-port-${String(row.id || signature)}`,
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

export const useSurfaceScanFindings = () => {
  const [findings, setFindings] = useState<SurfaceFindingRow[]>([]);
  const [scopeRules, setScopeRules] = useState<SurfaceMonitoredScopeRule[]>([]);
  const [loading, setLoading] = useState(false);
  const { organizationId, isLoading: clientLoading } = useClientOrganization();
  const { toast } = useToast();

  const mapRecord = useCallback((record: Record<string, any> | null): SurfaceFindingRow | null => {
    if (!record || !record.id) return null;
    return {
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
    };
  }, []);

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
    return asset
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/\.$/, '');
  };

  const shouldHideFindingByScope = (
    row: SurfaceFindingRow,
    monitoredRules: SurfaceMonitoredScopeRule[],
  ): boolean => {
    const backendExcluded = Boolean(row?.evidence?._scope_excluded);
    if (backendExcluded) return true;

    const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules(monitoredRules);
    const ipCandidate = String(row.ip || row.evidence?.ip || '').trim().toLowerCase();
    if (ipCandidate && (isIpv4(ipCandidate) || isIpv6(ipCandidate))) {
      if (!isIpWithinScopeRules(ipCandidate, ipScopeRules)) return true;
    }

    const hostCandidate = extractHostFromRow(row);
    if (hostCandidate) {
      const classification = classifySurfaceHostForScope(hostCandidate, scopeDomains);
      if (classification.blocked) return true;
    }
    return false;
  };

  const fetchFindings = useCallback(async (options?: { background?: boolean }) => {
    if (clientLoading || !organizationId) return;
    const background = Boolean(options?.background);
    if (!background) setLoading(true);
    try {
      const scopeFilter = `customer_id.eq.${organizationId},organization_id.eq.${organizationId}`;
      const [findingsRes, scopeRulesRes, reportRes, openPortsRes] = await Promise.all([
        supabase
          .from('surface_findings' as any)
          .select(
            'id, scan_job_id, provider, module, finding_type, title, description, severity, affected_asset, affected_url, ip, port, protocol, cve, cwe, cvss, epss, cisa_kev, remediation, evidence, attribution_confidence, status, created_at, first_seen_at, last_seen_at, occurrence_count',
          )
          .or(scopeFilter)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('surface_scan_monitored_ips' as any)
          .select('entry_type, input_value, ip_start, ip_end')
          .eq('organization_id', organizationId),
        supabase
          .from('surface_scan_ai_reports' as any)
          .select('id, title, payload, created_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('surface_open_ports' as any)
          .select('id, scan_job_id, host, ip, port, protocol, source, state, service_name, service_product, service_version, exposure_level, is_web, is_tls, remediation_hint, first_seen_at, last_seen_at, raw')
          .or(scopeFilter)
          .eq('state', 'open')
          .order('last_seen_at', { ascending: false })
          .limit(1000),
      ]);

      if (findingsRes.error) throw findingsRes.error;
      if (scopeRulesRes.error) throw scopeRulesRes.error;
      if (reportRes.error) throw reportRes.error;
      if (openPortsRes.error) throw openPortsRes.error;

      const rules = (scopeRulesRes.data || []) as SurfaceMonitoredScopeRule[];
      setScopeRules(rules);

      const normalizedRows = ((findingsRes.data || []) as Record<string, any>[])
        .map((record) => mapRecord(record))
        .filter((record): record is SurfaceFindingRow => Boolean(record));

      const openPorts = (openPortsRes.data || []) as SurfaceOpenPortRow[];
      const openPortJobIds = [
        ...new Set([
          ...openPorts.map((row) => String(row.scan_job_id || '').trim()),
          ...normalizedRows.map((row) => String(row.scan_job_id || '').trim()),
        ].filter(Boolean)),
      ];
      const jobTargets = new Map<string, { raw_target: string; normalized_target: string; hostname: string }>();
      if (openPortJobIds.length > 0) {
        const { data: jobRows, error: jobsError } = await supabase
          .from('surface_scan_jobs' as any)
          .select('id, raw_target, normalized_target, hostname')
          .in('id', openPortJobIds);
        if (jobsError) throw jobsError;
        for (const row of (jobRows || []) as Array<Record<string, unknown>>) {
          jobTargets.set(String(row.id || ''), {
            raw_target: String(row.raw_target || ''),
            normalized_target: String(row.normalized_target || ''),
            hostname: String(row.hostname || ''),
          });
        }
      }

      const normalizedRowsWithJobTargets = normalizedRows.map((row) => {
        if (
          !['open_port_exposed', 'service_fingerprint_exposed', 'sensitive_port_exposed'].includes(row.finding_type)
          || !row.scan_job_id
        ) {
          return row;
        }
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
        } satisfies SurfaceFindingRow;
      });

      const syntheticOpenPortRows = buildSyntheticOpenPortRows(openPorts, jobTargets, normalizedRowsWithJobTargets);

      const reportRows = (reportRes.data || []) as Record<string, any>[];
      const canonicalRows = reportRows.filter((row) => isOrganizationScopeReport(row));
      const selectedReport = canonicalRows[0] || reportRows[0] || null;
      const syntheticCveRows = buildSyntheticCveRowsFromReport(selectedReport, [...normalizedRowsWithJobTargets, ...syntheticOpenPortRows]);
      const mergedRows = [...normalizedRowsWithJobTargets, ...syntheticOpenPortRows, ...syntheticCveRows];

      setFindings(
        mergedRows
          .filter((row) => !['resolved', 'suppressed', 'false_positive', 'accepted_risk'].includes(String(row.status || '').toLowerCase()))
          .filter((row) => !shouldHideFindingByScope(row, rules)),
      );
    } catch (error) {
      console.error('Error fetching surface findings:', error);
      if (!background) {
        toast({
          title: 'Errore',
          description: 'Impossibile caricare i security findings',
          variant: 'destructive',
        });
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, [clientLoading, organizationId, mapRecord, toast]);

  useEffect(() => {
    if (!clientLoading && organizationId) {
      fetchFindings();
    }
  }, [clientLoading, organizationId, fetchFindings]);

  useEffect(() => {
    if (!organizationId) return;

    const channelByCustomer = supabase
      .channel(`surface-findings-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'surface_findings',
          filter: `customer_id=eq.${organizationId}`,
        },
        (_payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
          void fetchFindings({ background: true });
        },
      )
      .subscribe();

    const channelByOrganization = supabase
      .channel(`surface-findings-org-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'surface_findings',
          filter: `organization_id=eq.${organizationId}`,
        },
        (_payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
          void fetchFindings({ background: true });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelByCustomer);
      supabase.removeChannel(channelByOrganization);
    };
  }, [organizationId, fetchFindings]);

  const counts = useMemo(() => {
    const bySeverity = findings.reduce(
      (acc, row) => {
        acc[row.severity] = (acc[row.severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total: findings.length,
      critical: bySeverity.critical || 0,
      high: bySeverity.high || 0,
      medium: bySeverity.medium || 0,
      low: bySeverity.low || 0,
      info: bySeverity.info || 0,
    };
  }, [findings]);

  return {
    findings,
    loading,
    counts,
    scopeRules,
    refetch: fetchFindings,
  };
};
