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
      const [findingsRes, scopeRulesRes, reportRes] = await Promise.all([
        supabase
          .from('surface_findings' as any)
          .select(
            'id, provider, module, finding_type, title, description, severity, affected_asset, affected_url, ip, port, protocol, cve, cwe, cvss, epss, cisa_kev, remediation, evidence, attribution_confidence, status, created_at',
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
      ]);

      if (findingsRes.error) throw findingsRes.error;
      if (scopeRulesRes.error) throw scopeRulesRes.error;
      if (reportRes.error) throw reportRes.error;

      const rules = (scopeRulesRes.data || []) as SurfaceMonitoredScopeRule[];
      setScopeRules(rules);

      const normalizedRows = ((findingsRes.data || []) as Record<string, any>[])
        .map((record) => mapRecord(record))
        .filter((record): record is SurfaceFindingRow => Boolean(record));

      const reportRows = (reportRes.data || []) as Record<string, any>[];
      const canonicalRows = reportRows.filter((row) => isOrganizationScopeReport(row));
      const selectedReport = canonicalRows[0] || reportRows[0] || null;
      const syntheticCveRows = buildSyntheticCveRowsFromReport(selectedReport, normalizedRows);
      const mergedRows = [...normalizedRows, ...syntheticCveRows];

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
