import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BaseAlert<TTypes extends Record<string, boolean>> {
  id: string;
  user_id: string;
  organization_id: string | null;
  alert_email: string;
  alert_types: TTypes;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface UseAlertsConfig {
  table: string;
  channelName: string;
}

export function useAlerts<TTypes extends Record<string, boolean>>(config: UseAlertsConfig) {
  const { table, channelName } = config;
  const [alerts, setAlerts] = useState<BaseAlert<TTypes>[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from(table as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAlerts((data || []) as unknown as BaseAlert<TTypes>[]);
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile caricare gli alert',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [table, toast]);

  const createAlert = async (data: {
    alert_email: string;
    alert_types: TTypes;
    target_user_id?: string;
  }) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('User not authenticated');

      const { data: userRecord } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', userData.user.id)
        .single();

      const targetUserId = data.target_user_id || userData.user.id;

      const { error } = await supabase
        .from(table as any)
        .insert({
          user_id: targetUserId,
          organization_id: userRecord?.organization_id || null,
          alert_email: data.alert_email,
          alert_types: data.alert_types as any,
        });

      if (error) throw error;

      toast({
        title: 'Alert creato',
        description: "L'alert è stato configurato con successo",
      });

      await fetchAlerts();
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Impossibile creare l'alert";
      toast({
        title: 'Errore',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  };

  const updateAlert = async (id: string, data: { alert_email: string; alert_types: TTypes }) => {
    try {
      const { error } = await supabase
        .from(table as any)
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
    } catch (error) {
      toast({
        title: 'Errore',
        description: "Impossibile aggiornare l'alert",
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteAlert = async (id: string) => {
    try {
      const { error } = await supabase
        .from(table as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Alert eliminato',
        description: "L'alert è stato rimosso",
      });

      await fetchAlerts();
      return true;
    } catch (error) {
      toast({
        title: 'Errore',
        description: "Impossibile eliminare l'alert",
        variant: 'destructive',
      });
      return false;
    }
  };

  const toggleAlertStatus = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from(table as any)
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: isActive ? 'Alert attivato' : 'Alert disattivato',
        description: `L'alert è stato ${isActive ? 'attivato' : 'disattivato'}`,
      });

      await fetchAlerts();
      return true;
    } catch (error) {
      toast({
        title: 'Errore',
        description: "Impossibile modificare lo stato dell'alert",
        variant: 'destructive',
      });
      return false;
    }
  };

  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => fetchAlerts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlerts, channelName, table]);

  return {
    alerts,
    loading,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlertStatus,
    refetch: fetchAlerts,
  };
}
