import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useToast } from '@/hooks/use-toast';
import { classifySurfaceHostForScope, sourceLabel } from '@/lib/surfaceScopeGuard';

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
  loading: boolean;
  refetch: () => Promise<void>;
}

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const isIpv6 = (value: string): boolean => value.includes(':');
const isDomainLike = (value: string): boolean => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);

export const useSurfaceScanDiscoveredAssets = (): UseSurfaceScanDiscoveredAssetsResult => {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [scopeDomains, setScopeDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { organizationId, isLoading: clientLoading } = useClientOrganization();
  const { toast } = useToast();

  const fetchAssets = useCallback(async () => {
    if (clientLoading || !organizationId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('surface_assets' as any)
        .select('asset_type, asset_value, source, ip, raw')
        .eq('customer_id', organizationId)
        .in('asset_type', ['subdomain', 'reverse_dns_hostname', 'domain', 'ip'])
        .order('last_seen', { ascending: false })
        .limit(1500);

      if (error) throw error;
      setRows((data || []) as AssetRow[]);

      const { data: scopeRows, error: scopeErr } = await supabase
        .from('surface_scan_monitored_ips' as any)
        .select('input_value')
        .eq('organization_id', organizationId)
        .eq('entry_type', 'domain');
      if (scopeErr) throw scopeErr;
      setScopeDomains(
        (scopeRows || [])
          .map((row: any) => String(row?.input_value || '').trim().toLowerCase())
          .filter(Boolean),
      );
    } catch (error) {
      console.error('Error fetching discovered surface assets:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare subdomain/IP scoperti',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientLoading, organizationId, toast]);

  useEffect(() => {
    if (!clientLoading && organizationId) {
      fetchAssets();
    }
  }, [clientLoading, organizationId, fetchAssets]);

  useEffect(() => {
    if (!organizationId) return;
    const interval = setInterval(() => {
      fetchAssets();
    }, 10000);
    return () => clearInterval(interval);
  }, [organizationId, fetchAssets]);

  const { subdomains, ips, hostMeta } = useMemo(() => {
    const subdomainSet = new Set<string>();
    const ipSet = new Set<string>();
    const metaMap: Record<string, DiscoveredHostMeta> = {};

    for (const row of rows) {
      const value = String(row.asset_value || '').trim().toLowerCase().replace(/\.$/, '');
      if (!value) continue;

      if (row.asset_type === 'ip') {
        if (IPV4_REGEX.test(value) || isIpv6(value)) {
          ipSet.add(value);
        }
        continue;
      }

      if (isDomainLike(value) && !value.startsWith('*.')) {
        const classification = classifySurfaceHostForScope(value, scopeDomains);
        const isBackendExcluded = Boolean(row?.raw?._scope_excluded);
        const isExcluded = classification.blocked || isBackendExcluded;
        if (!metaMap[value]) {
          metaMap[value] = {
            host: value,
            sources: [],
            sourceLabels: [],
            ips: [],
            fromReverseDns: false,
            fromDump: false,
            fromScope: false,
            blockedNoise: classification.blocked,
            excludedByBackend: isBackendExcluded,
            exclusionReason:
              (row?.raw?._scope_exclusion_reason as string | undefined) ||
              classification.reason ||
              null,
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
    };
  }, [rows, scopeDomains]);

  return {
    subdomains,
    ips,
    hostMeta,
    scopeDomains,
    loading,
    refetch: fetchAssets,
  };
};
