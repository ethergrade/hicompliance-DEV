import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export interface AlertTypes {
  credenziali_compromesse: boolean;
  dati_carte_credito: boolean;
  database_leak: boolean;
  email_compromesse: boolean;
  dati_sensibili: boolean;
}

export interface DarkRiskAlert {
  id: string;
  user_id: string;
  organization_id: string | null;
  alert_email: string;
  alert_types: AlertTypes;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useDarkRiskAlerts = () => {
  const [alerts, setAlerts] = useState<DarkRiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { organizationId } = useClientOrganization();

  const fetchAlerts = async () => {
    if (!organizationId) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const query = supabase
        .from('dark_risk_alerts')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      setAlerts((data || []) as unknown as DarkRiskAlert[]);
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

  const createAlert = async (data: { 
    alert_email: string; 
    alert_types: AlertTypes;
    target_user_id?: string; // Per admin che creano alert per altri utenti
  }) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('User not authenticated');

      const { data: userRecord } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', userData.user.id)
        .single();

      // Usa target_user_id se fornito (per admin), altrimenti usa l'utente corrente
      const targetUserId = data.target_user_id || userData.user.id;

      const { error } = await supabase
        .from('dark_risk_alerts')
        .insert({
          user_id: targetUserId,
          organization_id: organizationId || userRecord?.organization_id || null,
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

  const updateAlert = async (id: string, data: { alert_email: string; alert_types: AlertTypes }) => {
    try {
      const { error } = await supabase
        .from('dark_risk_alerts')
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
        .from('dark_risk_alerts')
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
        .from('dark_risk_alerts')
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
    if (!organizationId) return;

    fetchAlerts();

    // Real-time subscription
    const channel = supabase
      .channel(`dark_risk_alerts_changes_${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dark_risk_alerts',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

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
