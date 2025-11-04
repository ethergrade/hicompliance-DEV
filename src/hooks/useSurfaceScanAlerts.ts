import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface SurfaceScanAlertTypes {
  vulnerabilita_critiche: boolean;
  vulnerabilita_alte: boolean;
  porte_esposte: boolean;
  certificati_scaduti: boolean;
  servizi_non_sicuri: boolean;
}

export interface SurfaceScanAlert {
  id: string;
  user_id: string;
  organization_id: string | null;
  alert_email: string;
  alert_types: SurfaceScanAlertTypes;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useSurfaceScanAlerts = () => {
  const [alerts, setAlerts] = useState<SurfaceScanAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('surface_scan_alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAlerts((data || []) as unknown as SurfaceScanAlert[]);
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: 'Impossibile caricare gli alert',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createAlert = async (data: { alert_email: string; alert_types: SurfaceScanAlertTypes }) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('User not authenticated');

      const { data: userRecord } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', userData.user.id)
        .single();

      const { error } = await supabase
        .from('surface_scan_alerts')
        .insert({
          user_id: userData.user.id,
          organization_id: userRecord?.organization_id || null,
          alert_email: data.alert_email,
          alert_types: data.alert_types as any,
        });

      if (error) throw error;

      toast({
        title: 'Alert creato',
        description: 'L\'alert è stato configurato con successo',
      });

      await fetchAlerts();
      return true;
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile creare l\'alert',
        variant: 'destructive',
      });
      return false;
    }
  };

  const updateAlert = async (id: string, data: { alert_email: string; alert_types: SurfaceScanAlertTypes }) => {
    try {
      const { error } = await supabase
        .from('surface_scan_alerts')
        .update({
          alert_email: data.alert_email,
          alert_types: data.alert_types as any,
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Alert aggiornato',
        description: 'Le modifiche sono state salvate',
      });

      await fetchAlerts();
      return true;
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: 'Impossibile aggiornare l\'alert',
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteAlert = async (id: string) => {
    try {
      const { error } = await supabase
        .from('surface_scan_alerts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Alert eliminato',
        description: 'L\'alert è stato rimosso',
      });

      await fetchAlerts();
      return true;
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: 'Impossibile eliminare l\'alert',
        variant: 'destructive',
      });
      return false;
    }
  };

  const toggleAlertStatus = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('surface_scan_alerts')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: isActive ? 'Alert attivato' : 'Alert disattivato',
        description: `L'alert è stato ${isActive ? 'attivato' : 'disattivato'}`,
      });

      await fetchAlerts();
      return true;
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: 'Impossibile modificare lo stato dell\'alert',
        variant: 'destructive',
      });
      return false;
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Real-time subscription
    const channel = supabase
      .channel('surface_scan_alerts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'surface_scan_alerts',
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    alerts,
    loading,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlertStatus,
    refetch: fetchAlerts,
  };
};
