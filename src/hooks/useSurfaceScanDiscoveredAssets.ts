import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

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

export const useSurfaceScanDiscoveredAssets = (): UseSurfaceScanDiscoveredAssetsResult => {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [scopeRules, setScopeRules] = useState<SurfaceMonitoredScopeRule[]>([]);
  const [loading, setLoading] = useState(false);
  const { organizationId, isLoading: clientLoading } = useClientOrganization();
  const { toast } = useToast();

  const fetchAssets = useCallback(async (options?: { background?: boolean }) => {
    if (clientLoading || !organizationId) return;

    const background = Boolean(options?.background);
    if (!background) {
      setLoading(true);
    }
    try {
      const scopeFilter = `customer_id.eq.${organizationId},organization_id.eq.${organizationId}`;
      const { data, error } = await supabase
        .from('surface_assets' as any)
        .select('asset_type, asset_value, source, ip, raw')
        .or(scopeFilter)
        .in('asset_type', ['subdomain', 'reverse_dns_hostname', 'domain', 'ip'])
        .order('last_seen', { ascending: false })
        .limit(1500);

      if (error) throw error;
      setRows((data || []) as AssetRow[]);

      const { data: scopeRows, error: scopeErr } = await supabase
        .from('surface_scan_monitored_ips' as any)
        .select('entry_type, input_value, ip_start, ip_end')
        .eq('organization_id', organizationId);
      if (scopeErr) throw scopeErr;
      setScopeRules((scopeRows || []) as SurfaceMonitoredScopeRule[]);
    } catch (error) {
      console.error('Error fetching discovered surface assets:', error);
      if (!background) {
        toast({
          title: 'Errore',
          description: 'Impossibile caricare subdomain/IP scoperti',
          variant: 'destructive',
        });
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [clientLoading, organizationId, toast]);

  useEffect(() => {
    if (!clientLoading && organizationId) {
      fetchAssets();
    }
  }, [clientLoading, organizationId, fetchAssets]);

  useEffect(() => {
    if (!organizationId) return;
    const assetsChannelByCustomer = supabase
      .channel(`surface-assets-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'surface_assets',
          filter: `customer_id=eq.${organizationId}`,
        },
        (_payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
          void fetchAssets({ background: true });
        },
      )
      .subscribe();

    const assetsChannelByOrganization = supabase
      .channel(`surface-assets-org-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'surface_assets',
          filter: `organization_id=eq.${organizationId}`,
        },
        (_payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
          void fetchAssets({ background: true });
        },
      )
      .subscribe();

    const scopeChannel = supabase
      .channel(`surface-scope-domains-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'surface_scan_monitored_ips',
          filter: `organization_id=eq.${organizationId}`,
        },
        (_payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
          void fetchAssets({ background: true });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(assetsChannelByCustomer);
      supabase.removeChannel(assetsChannelByOrganization);
      supabase.removeChannel(scopeChannel);
    };
  }, [organizationId, fetchAssets]);

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
