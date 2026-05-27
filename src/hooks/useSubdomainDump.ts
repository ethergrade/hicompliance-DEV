import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export interface SubdomainResult {
  subdomain: string;
  ip: string | null;
  asn: number | null;
  asn_name: string | null;
  cidr: string | null;
  country: string | null;
  source: string[];
}

export interface SubdomainDump {
  id: string;
  organization_id: string;
  root_domain: string;
  depth_limit: number;
  total_discovered: number;
  total_returned: number;
  truncated: boolean;
  sources: string[];
  results: SubdomainResult[];
  triggered_by: string;
  created_at: string;
}

export const useSubdomainDump = () => {
  const { organizationId } = useClientOrganization();
  const [history, setHistory] = useState<SubdomainDump[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depthSetting, setDepthSetting] = useState<number>(10);
  const [enabledSetting, setEnabledSetting] = useState<boolean>(true);

  const fetchHistory = useCallback(async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from('subdomain_dumps')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(20);
    setHistory((data ?? []) as unknown as SubdomainDump[]);
  }, [organizationId]);

  const fetchSettings = useCallback(async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from('organizations')
      .select('subdomain_dump_depth, subdomain_dump_enabled')
      .eq('id', organizationId)
      .maybeSingle();
    if (data) {
      setDepthSetting((data as any).subdomain_dump_depth ?? 10);
      setEnabledSetting((data as any).subdomain_dump_enabled ?? true);
    }
  }, [organizationId]);

  useEffect(() => { fetchHistory(); fetchSettings(); }, [fetchHistory, fetchSettings]);

  const updateSettings = useCallback(async (depth: number, enabled: boolean) => {
    if (!organizationId) return false;
    const d = Math.max(1, Math.min(100, Math.round(depth)));
    const { error: e } = await supabase
      .from('organizations')
      .update({ subdomain_dump_depth: d, subdomain_dump_enabled: enabled })
      .eq('id', organizationId);
    if (e) { setError(e.message); return false; }
    setDepthSetting(d);
    setEnabledSetting(enabled);
    return true;
  }, [organizationId]);

  const runDump = useCallback(async (rootDomain: string, overrideDepth?: number) => {
    if (!organizationId) return null;
    setRunning(true);
    setError(null);
    try {
      const { data, error: invErr } = await supabase.functions.invoke('subdomain-dump', {
        body: {
          organization_id: organizationId,
          root_domain: rootDomain.trim().toLowerCase(),
          depth_limit: overrideDepth,
          triggered_by: 'manual',
        },
      });
      if (invErr) throw invErr;
      if ((data as any)?.error) throw new Error(typeof (data as any).error === 'string' ? (data as any).error : 'Errore dump');
      await fetchHistory();
      return data as any;
    } catch (e: any) {
      setError(e?.message ?? 'Errore dump');
      return null;
    } finally {
      setRunning(false);
    }
  }, [organizationId, fetchHistory]);

  return {
    history,
    running,
    error,
    depthSetting,
    enabledSetting,
    runDump,
    updateSettings,
    refetch: fetchHistory,
  };
};
