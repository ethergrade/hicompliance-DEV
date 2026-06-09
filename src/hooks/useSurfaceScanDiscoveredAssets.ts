import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { surfaceScan360Api, type SurfaceScanJob } from '@/lib/api/surface-scan360';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useToast } from '@/hooks/use-toast';
import {
  classifySurfaceHostForScope,
  isIpWithinScopeRules,
  isIpv4,
  isIpv6,
  sourceLabel,
  splitMonitoredScopeRules,
  type SurfaceMonitoredScopeRule,
} from '@/lib/surfaceScopeGuard';

// TODO: migrate scope rules to backend API when surface_scan_monitored_ips endpoint is available
import { supabase } from '@/integrations/supabase/client';

interface AssetRow {
  asset_type: string;
  asset_value: string;
  source?: string;
  ip?: string | null;
  raw?: { ip?: string; _scope_excluded?: boolean; _scope_exclusion_reason?: string } | null;
}

export interface DiscoveredHostMeta {
  host: string;
  sources: string[];
  sourceLabels: string[];
  ips: string[];
  fromReverseDns: boolean;
  fromDump: boolean;
  fromScope: boolean;
  blockedNoise: boolean;
  excludedByBackend: boolean;
  exclusionReason: string | null;
}

interface UseSurfaceScanDiscoveredAssetsResult {
  subdomains: string[];
  ips: string[];
  hostMeta: Record<string, DiscoveredHostMeta>;
  scopeDomains: string[];
  scopeCounters: {
    in_scope: number;
    excluded_by_scope: number;
    excluded_shared_noise: number;
  };
  loading: boolean;
  refetch: () => Promise<void>;
}

const isDomainLike = (value: string): boolean => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);

/**
 * Extract asset rows from completed SurfaceScan jobs (normalized_targets and summary data).
 * Backend API returns aggregated job data; we derive discovered assets from it.
 */
const deriveAssetsFromJobs = (jobs: SurfaceScanJob[]): AssetRow[] => {
  const rows: AssetRow[] = [];
  for (const job of jobs) {
    if (job.status !== 'completed') continue;
    const target = job.normalized_target || job.raw_target || '';
    if (!target) continue;

    const targetType = job.target_type || 'domain';

    if (targetType === 'domain' || targetType === 'url') {
      let hostname = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      rows.push({
        asset_type: 'domain',
        asset_value: hostname.toLowerCase(),
        source: 'surface_scan360_job',
        ip: null,
        raw: null,
      });
    } else if (targetType === 'ip') {
      rows.push({
        asset_type: 'ip',
        asset_value: target.trim().toLowerCase(),
        source: 'surface_scan360_job',
        ip: target.trim().toLowerCase(),
        raw: null,
      });
    }

    // Extract discovered subdomains from summary
    const discovered = job.summary?.discovered_hosts || job.summary?.discovered_subdomains || [];
    if (Array.isArray(discovered)) {
      for (const host of discovered) {
        const value = String(host).trim().toLowerCase();
        if (value && isDomainLike(value)) {
          rows.push({
            asset_type: 'subdomain',
            asset_value: value,
            source: 'surface_scan360_discovery',
            ip: null,
            raw: null,
          });
        }
      }
    }

    // Extract IPs from resolved_ips
    if (Array.isArray(job.resolved_ips)) {
      for (const ip of job.resolved_ips) {
        const ipStr = String(ip).trim().toLowerCase();
        if (ipStr && (isIpv4(ipStr) || isIpv6(ipStr))) {
          rows.push({
            asset_type: 'ip',
            asset_value: ipStr,
            source: 'surface_scan360_resolved',
            ip: ipStr,
            raw: null,
          });
        }
      }
    }
  }
  return rows;
};

export const useSurfaceScanDiscoveredAssets = (): UseSurfaceScanDiscoveredAssetsResult => {
  const { organizationId, isLoading: clientLoading, groupId } = useClientOrganization();
  const { toast } = useToast();

  // Fetch completed SurfaceScan jobs (the source of discovered assets)
  const jobsQuery = useQuery({
    queryKey: ['surface-scan-discovered-assets-jobs', organizationId, groupId],
    queryFn: async () => {
      if (!organizationId) return [] as SurfaceScanJob[];
      const allJobs = await surfaceScan360Api.listJobs(organizationId, { page: 1 }, groupId);
      return (allJobs || []);
    },
    enabled: !!organizationId && !clientLoading,
    refetchInterval: 30_000, // polling replaces Realtime
    staleTime: 15_000,
  });

  // TODO: migrate to backend API when surface_scan_monitored_ips endpoint is available
  const [scopeRules, setScopeRules] = useState<SurfaceMonitoredScopeRule[]>([]);
  const fetchScopeRules = async () => {
    if (!organizationId) return;
    try {
      const { data: scopeRows, error: scopeErr } = await supabase
        .from('surface_scan_monitored_ips' as any)
        .select('entry_type, input_value, ip_start, ip_end')
        .eq('organization_id', organizationId);
      if (!scopeErr) {
        setScopeRules((scopeRows || []) as SurfaceMonitoredScopeRule[]);
      }
    } catch {
      // silent — scope rules are optional
    }
  };

  useEffect(() => {
    if (organizationId) fetchScopeRules();
  }, [organizationId]);

  const jobs = jobsQuery.data ?? [];
  const loading = jobsQuery.isLoading;

  const rows: AssetRow[] = useMemo(() => deriveAssetsFromJobs(jobs), [jobs]);

  const { subdomains, ips, hostMeta, scopeCounters, scopeDomains } = useMemo(() => {
    const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules(scopeRules);
    const subdomainSet = new Set<string>();
    const ipSet = new Set<string>();
    const metaMap: Record<string, DiscoveredHostMeta> = {};
    const counters = {
      in_scope: 0,
      excluded_by_scope: 0,
      excluded_shared_noise: 0,
    };

    for (const row of rows) {
      const value = String(row.asset_value || '').trim().toLowerCase().replace(/\.$/, '');
      if (!value) continue;

      if (row.asset_type === 'ip') {
        if (isIpv4(value) || isIpv6(value)) {
          const backendExcluded = Boolean(row?.raw?._scope_excluded);
          const backendReason = String(row?.raw?._scope_exclusion_reason || '').trim().toLowerCase();
          const uiExcluded = !isIpWithinScopeRules(value, ipScopeRules);
          const excluded = backendExcluded || uiExcluded;
          const reason =
            backendReason ||
            (uiExcluded ? 'scope_excluded_ip' : '');
          if (excluded) {
            if (reason === 'scope_excluded_shared_noise') counters.excluded_shared_noise += 1;
            else counters.excluded_by_scope += 1;
            continue;
          }
          counters.in_scope += 1;
          ipSet.add(value);
        }
        continue;
      }

      if (isDomainLike(value) && !value.startsWith('*.')) {
        const classification = classifySurfaceHostForScope(value, scopeDomains);
        const isBackendExcluded = Boolean(row?.raw?._scope_excluded);
        const backendReason = String(row?.raw?._scope_exclusion_reason || '').trim().toLowerCase();
        const isExcluded = classification.blocked || isBackendExcluded;
        const exclusionReason = backendReason || classification.reason || null;
        if (isExcluded) {
          if (exclusionReason === 'scope_excluded_shared_noise') counters.excluded_shared_noise += 1;
          else counters.excluded_by_scope += 1;
        } else {
          counters.in_scope += 1;
        }
        if (!metaMap[value]) {
          metaMap[value] = {
            host: value,
            sources: [],
            sourceLabels: [],
            ips: [],
            fromReverseDns: false,
            fromDump: false,
            fromScope: false,
            blockedNoise: exclusionReason === 'scope_excluded_shared_noise',
            excludedByBackend: isBackendExcluded,
            exclusionReason: exclusionReason,
          };
        }
        const meta = metaMap[value];
        const source = String(row.source || '').trim().toLowerCase();
        if (source && !meta.sources.includes(source)) meta.sources.push(source);
        const label = sourceLabel(source);
        if (label && !meta.sourceLabels.includes(label)) meta.sourceLabels.push(label);
        const ipCandidate = String(row.ip || row?.raw?.ip || '').trim();
        if (ipCandidate && !meta.ips.includes(ipCandidate)) meta.ips.push(ipCandidate);
        if (source.includes('reverse_dns')) meta.fromReverseDns = true;
        if (source.includes('subdomain_dump') || source.includes('certificate_transparency')) meta.fromDump = true;
        if (classification.inScope) meta.fromScope = true;

        if (!isExcluded) {
          subdomainSet.add(value);
        }
      }
    }

    return {
      subdomains: [...subdomainSet],
      ips: [...ipSet],
      hostMeta: metaMap,
      scopeCounters: counters,
      scopeDomains,
    };
  }, [rows, scopeRules]);

  const fetchAssets = useCallback(
    async (_options?: { background?: boolean }) => {
      await jobsQuery.refetch();
      await fetchScopeRules();
    },
    [jobsQuery],
  );

  return {
    subdomains,
    ips,
    hostMeta,
    scopeDomains,
    scopeCounters,
    loading,
    refetch: fetchAssets,
  };
};
