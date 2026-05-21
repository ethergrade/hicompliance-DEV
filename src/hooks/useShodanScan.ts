import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ShodanAsset {
  ip: string;
  hostname: string;
  ports: number[];
  services: string[];
  score: number;
  risk: 'Basso' | 'Medio' | 'Alto';
  status: 'Sicuro' | 'Attenzione' | 'Critico';
  cves: Array<{ id: string; severity: 'low' | 'medium' | 'high'; description: string }>;
  org?: string;
  os?: string;
  country?: string;
  last_update?: string;
  raw_service_count: number;
}

interface ShodanScanResponse {
  assets: ShodanAsset[];
  errors: Array<{ target: string; error: string }>;
  scanned_at: string;
}

/**
 * Esegue scan Shodan per una lista di IP/hostname.
 * Restituisce assets parsati pronti per il rendering in SurfaceScan360.
 * Cache 10 min per evitare richieste duplicate (Shodan ha rate limit).
 */
export const useShodanScan = (targets: string[], enabled = true) => {
  return useQuery<ShodanScanResponse>({
    queryKey: ['shodan-scan', [...targets].sort()],
    enabled: enabled && targets.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('shodan-scan', {
        body: { targets },
      });
      if (error) throw error;
      return data as ShodanScanResponse;
    },
  });
};
