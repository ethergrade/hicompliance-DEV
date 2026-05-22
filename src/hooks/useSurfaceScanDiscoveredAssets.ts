import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useToast } from '@/hooks/use-toast';

interface AssetRow {
  asset_type: string;
  asset_value: string;
}

interface UseSurfaceScanDiscoveredAssetsResult {
  subdomains: string[];
  ips: string[];
  loading: boolean;
  refetch: () => Promise<void>;
}

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const isIpv6 = (value: string): boolean => value.includes(':');
const isDomainLike = (value: string): boolean => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);

export const useSurfaceScanDiscoveredAssets = (): UseSurfaceScanDiscoveredAssetsResult => {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { organizationId, isLoading: clientLoading } = useClientOrganization();
  const { toast } = useToast();

  const fetchAssets = useCallback(async () => {
    if (clientLoading || !organizationId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('surface_assets' as any)
        .select('asset_type, asset_value')
        .eq('customer_id', organizationId)
        .in('asset_type', ['subdomain', 'reverse_dns_hostname', 'ip'])
        .order('last_seen', { ascending: false })
        .limit(1500);

      if (error) throw error;
      setRows((data || []) as AssetRow[]);
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

  const { subdomains, ips } = useMemo(() => {
    const subdomainSet = new Set<string>();
    const ipSet = new Set<string>();

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
        subdomainSet.add(value);
      }
    }

    return {
      subdomains: [...subdomainSet],
      ips: [...ipSet],
    };
  }, [rows]);

  return {
    subdomains,
    ips,
    loading,
    refetch: fetchAssets,
  };
};
