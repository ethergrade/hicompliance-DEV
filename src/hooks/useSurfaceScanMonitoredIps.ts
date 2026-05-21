import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  MonitoredIpEntryType,
  parseMonitoredIpInput,
} from '@/lib/ipRange';

export interface SurfaceScanMonitoredIpRule {
  id: string;
  organization_id: string;
  input_value: string;
  entry_type: MonitoredIpEntryType;
  ip_start: string;
  ip_end: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  discovered_via?: 'manual' | 'subdomain_dump' | string;
  discovered_from?: string | null;
}

export interface AddRuleOptions {
  discovered_via?: 'manual' | 'subdomain_dump';
  discovered_from?: string | null;
  silent?: boolean;
}

interface UseSurfaceScanMonitoredIpsReturn {
  rules: SurfaceScanMonitoredIpRule[];
  loading: boolean;
  saving: boolean;
  isAdmin: boolean;
  hasRules: boolean;
  addRule: (input: string, opts?: AddRuleOptions) => Promise<boolean>;
  removeRule: (id: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export const useSurfaceScanMonitoredIps = (): UseSurfaceScanMonitoredIpsReturn => {
  const [rules, setRules] = useState<SurfaceScanMonitoredIpRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const { organizationId, isLoading: isClientLoading } = useClientOrganization();
  const { user, userProfile } = useAuth();

  const isAdmin = userProfile?.user_type === 'admin';

  const fetchRules = useCallback(async () => {
    if (isClientLoading || !organizationId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('surface_scan_monitored_ips' as any)
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setRules((data || []) as unknown as SurfaceScanMonitoredIpRule[]);
    } catch (error) {
      console.error('Error fetching monitored IP rules:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare gli IP monitorati',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [isClientLoading, organizationId, toast]);

  useEffect(() => {
    if (!isClientLoading && organizationId) {
      fetchRules();
    }
  }, [isClientLoading, organizationId, fetchRules]);

  const addRule = async (input: string, opts: AddRuleOptions = {}): Promise<boolean> => {
    if (!organizationId) {
      if (!opts.silent) {
        toast({
          title: 'Errore',
          description: 'Seleziona prima un cliente',
          variant: 'destructive',
        });
      }
      return false;
    }

    if (!isAdmin) {
      if (!opts.silent) {
        toast({
          title: 'Operazione non consentita',
          description: 'Solo gli admin possono gestire gli IP monitorati',
          variant: 'destructive',
        });
      }
      return false;
    }

    let parsed;
    try {
      parsed = parseMonitoredIpInput(input);
    } catch (error: any) {
      if (!opts.silent) {
        toast({
          title: 'Formato non valido',
          description: error?.message || 'Inserisci un formato IP valido',
          variant: 'destructive',
        });
      }
      return false;
    }

    setSaving(true);
    try {
      const payload: any = {
        organization_id: organizationId,
        input_value: parsed.inputValue,
        entry_type: parsed.entryType,
        ip_start: parsed.ipStart,
        ip_end: parsed.ipEnd,
        created_by: user?.id || null,
        discovered_via: opts.discovered_via ?? 'manual',
        discovered_from: opts.discovered_from ?? null,
      };

      const { error } = await supabase
        .from('surface_scan_monitored_ips' as any)
        .insert(payload);

      if (error) {
        if (error.code === '23505') {
          if (!opts.silent) {
            toast({
              title: 'Regola duplicata',
              description: 'Questa regola di monitoraggio è già presente',
              variant: 'destructive',
            });
          }
          return false;
        }
        throw error;
      }

      if (!opts.silent) {
        toast({
          title: 'Regola aggiunta',
          description: 'IP monitorato salvato con successo',
        });
      }

      await fetchRules();
      return true;
    } catch (error) {
      console.error('Error adding monitored IP rule:', error);
      if (!opts.silent) {
        toast({
          title: 'Errore',
          description: 'Impossibile aggiungere la regola IP',
          variant: 'destructive',
        });
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (id: string): Promise<boolean> => {
    if (!isAdmin) {
      toast({
        title: 'Operazione non consentita',
        description: 'Solo gli admin possono gestire gli IP monitorati',
        variant: 'destructive',
      });
      return false;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('surface_scan_monitored_ips' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Regola rimossa',
        description: 'IP monitorato rimosso con successo',
      });

      await fetchRules();
      return true;
    } catch (error) {
      console.error('Error deleting monitored IP rule:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile rimuovere la regola IP',
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const hasRules = useMemo(() => rules.length > 0, [rules.length]);

  return {
    rules,
    loading,
    saving,
    isAdmin,
    hasRules,
    addRule,
    removeRule,
    refetch: fetchRules,
  };
};
