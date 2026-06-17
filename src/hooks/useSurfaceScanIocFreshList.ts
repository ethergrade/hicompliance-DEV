import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUserRoles } from '@/hooks/useUserRoles';

export type IocLeaseMinutes = 30 | 60 | 120 | 720 | 1440;
export type IocType = 'domain' | 'ip' | 'url';
export type IocSource = 'manual' | 'curated_feed';
export type IocSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface SurfaceScanIocFreshConfig {
  id: string;
  organization_id: string;
  lease_minutes: IocLeaseMinutes;
  is_enabled: boolean;
  last_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SurfaceScanIocFreshItem {
  id: string;
  organization_id: string;
  ioc_value: string;
  ioc_type: IocType;
  source: IocSource;
  confidence: number;
  severity: IocSeverity;
  notes: string | null;
  is_active: boolean;
  synced_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_CONFIG: Pick<SurfaceScanIocFreshConfig, 'lease_minutes' | 'is_enabled' | 'last_refreshed_at'> = {
  lease_minutes: 60,
  is_enabled: true,
  last_refreshed_at: null,
};

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const isIpv6 = (value: string): boolean => value.includes(':');
const isDomain = (value: string): boolean => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);

const normalizeIocValue = (value: string, type: IocType): string => {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('IOC vuoto');

  if (type === 'ip') {
    const lowered = raw.toLowerCase();
    if (!IPV4_REGEX.test(lowered) && !isIpv6(lowered)) {
      throw new Error('Inserire un indirizzo IP valido (IPv4 o IPv6).');
    }
    return lowered;
  }

  if (type === 'domain') {
    const normalized = raw.toLowerCase().replace(/\.$/, '');
    if (!isDomain(normalized)) throw new Error('Inserire un dominio valido.');
    return normalized;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Inserire una URL valida (http/https).');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Sono supportate solo URL http/https.');
  }
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().toLowerCase();
};

interface UseSurfaceScanIocFreshListReturn {
  config: SurfaceScanIocFreshConfig | null;
  items: SurfaceScanIocFreshItem[];
  loading: boolean;
  saving: boolean;
  isAdmin: boolean;
  saveConfig: (next: { lease_minutes: IocLeaseMinutes; is_enabled: boolean }) => Promise<boolean>;
  addItem: (payload: {
    ioc_value: string;
    ioc_type: IocType;
    confidence: number;
    severity: IocSeverity;
    notes?: string;
  }) => Promise<boolean>;
  removeItem: (id: string) => Promise<boolean>;
  toggleItem: (id: string, isActive: boolean) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export const useSurfaceScanIocFreshList = (): UseSurfaceScanIocFreshListReturn => {
  const [config, setConfig] = useState<SurfaceScanIocFreshConfig | null>(null);
  const [items, setItems] = useState<SurfaceScanIocFreshItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const { organizationId, isLoading: isClientLoading } = useClientOrganization();
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRoles();

  const isAdmin = user?.user_type === 'admin' || isSuperAdmin;

  const fetchData = useCallback(async () => {
    if (isClientLoading || !organizationId) return;

    setLoading(true);
    try {
      const [configRes, itemsRes] = await Promise.all([
        supabase
          .from('surface_scan_ioc_fresh_config' as any)
          .select('*')
          .eq('organization_id', organizationId)
          .maybeSingle(),
        supabase
          .from('surface_scan_ioc_fresh_items' as any)
          .select('*')
          .eq('organization_id', organizationId)
          .order('source', { ascending: true })
          .order('updated_at', { ascending: false })
          .limit(500),
      ]);

      if (configRes.error) throw configRes.error;
      if (itemsRes.error) throw itemsRes.error;

      if (configRes.data) {
        setConfig(configRes.data as SurfaceScanIocFreshConfig);
      } else {
        setConfig({
          id: '',
          organization_id: organizationId,
          lease_minutes: DEFAULT_CONFIG.lease_minutes,
          is_enabled: DEFAULT_CONFIG.is_enabled,
          last_refreshed_at: DEFAULT_CONFIG.last_refreshed_at,
          created_at: '',
          updated_at: '',
        });
      }

      setItems((itemsRes.data || []) as SurfaceScanIocFreshItem[]);
    } catch (error) {
      console.error('Error fetching IOC fresh list data:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare la IOC Fresh List',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [isClientLoading, organizationId, toast]);

  useEffect(() => {
    if (!isClientLoading && organizationId) {
      void fetchData();
    }
  }, [isClientLoading, organizationId, fetchData]);

  const saveConfig = async (next: {
    lease_minutes: IocLeaseMinutes;
    is_enabled: boolean;
  }): Promise<boolean> => {
    if (!organizationId) return false;
    if (!isAdmin) {
      toast({
        title: 'Operazione non consentita',
        description: 'Solo gli admin possono configurare la IOC Fresh List',
        variant: 'destructive',
      });
      return false;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('surface_scan_ioc_fresh_config' as any)
        .upsert(
          {
            organization_id: organizationId,
            lease_minutes: next.lease_minutes,
            is_enabled: next.is_enabled,
            created_by: user?.id || null,
          },
          { onConflict: 'organization_id' },
        );
      if (error) throw error;

      toast({
        title: 'Configurazione salvata',
        description: 'Lease e stato IOC Fresh List aggiornati.',
      });
      await fetchData();
      return true;
    } catch (error) {
      console.error('Error saving IOC fresh list config:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile salvare la configurazione IOC Fresh List',
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addItem = async (payload: {
    ioc_value: string;
    ioc_type: IocType;
    confidence: number;
    severity: IocSeverity;
    notes?: string;
  }): Promise<boolean> => {
    if (!organizationId) return false;
    if (!isAdmin) {
      toast({
        title: 'Operazione non consentita',
        description: 'Solo gli admin possono aggiungere IOC.',
        variant: 'destructive',
      });
      return false;
    }

    let normalizedIoc = '';
    try {
      normalizedIoc = normalizeIocValue(payload.ioc_value, payload.ioc_type);
    } catch (error: any) {
      toast({
        title: 'IOC non valido',
        description: error?.message || 'Formato IOC non valido.',
        variant: 'destructive',
      });
      return false;
    }

    const confidence = Math.max(0, Math.min(100, Math.round(Number(payload.confidence) || 0)));

    setSaving(true);
    try {
      const { error } = await supabase
        .from('surface_scan_ioc_fresh_items' as any)
        .insert({
          organization_id: organizationId,
          ioc_value: normalizedIoc,
          ioc_type: payload.ioc_type,
          source: 'manual',
          confidence,
          severity: payload.severity,
          notes: String(payload.notes || '').trim() || null,
          is_active: true,
          created_by: user?.id || null,
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'IOC duplicato',
            description: 'Questo IOC è già presente nella lista manuale.',
            variant: 'destructive',
          });
          return false;
        }
        throw error;
      }

      toast({
        title: 'IOC aggiunto',
        description: 'Indicatore salvato nella IOC Fresh List.',
      });
      await fetchData();
      return true;
    } catch (error) {
      console.error('Error adding IOC item:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile aggiungere l\'IOC.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (id: string): Promise<boolean> => {
    if (!isAdmin) {
      toast({
        title: 'Operazione non consentita',
        description: 'Solo gli admin possono rimuovere IOC.',
        variant: 'destructive',
      });
      return false;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('surface_scan_ioc_fresh_items' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;

      toast({
        title: 'IOC rimosso',
        description: 'Indicatore rimosso correttamente.',
      });
      await fetchData();
      return true;
    } catch (error) {
      console.error('Error removing IOC item:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile rimuovere l\'IOC.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = async (id: string, isActive: boolean): Promise<boolean> => {
    if (!isAdmin) {
      toast({
        title: 'Operazione non consentita',
        description: 'Solo gli admin possono modificare IOC.',
        variant: 'destructive',
      });
      return false;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('surface_scan_ioc_fresh_items' as any)
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
      await fetchData();
      return true;
    } catch (error) {
      console.error('Error toggling IOC item:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile aggiornare lo stato IOC.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const stableConfig = useMemo(() => {
    if (config) return config;
    if (!organizationId) return null;
    return {
      id: '',
      organization_id: organizationId,
      lease_minutes: DEFAULT_CONFIG.lease_minutes,
      is_enabled: DEFAULT_CONFIG.is_enabled,
      last_refreshed_at: DEFAULT_CONFIG.last_refreshed_at,
      created_at: '',
      updated_at: '',
    } as SurfaceScanIocFreshConfig;
  }, [config, organizationId]);

  return {
    config: stableConfig,
    items,
    loading,
    saving,
    isAdmin,
    saveConfig,
    addItem,
    removeItem,
    toggleItem,
    refetch: fetchData,
  };
};
