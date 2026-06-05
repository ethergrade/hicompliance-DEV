import { useState, useEffect, useCallback } from 'react';
import { surfaceScanAlertsApi, type SurfaceScanAlertApiResource } from '@/lib/api/surface-scan-alerts';
import { useClientOrganization } from '@/hooks/useClientOrganization';
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

const parseAlertTypes = (types: string[] | null | undefined): SurfaceScanAlertTypes => {
  const resolved = types ?? [];
  return {
    vulnerabilita_critiche: resolved.includes('vulnerabilita_critiche'),
    vulnerabilita_alte: resolved.includes('vulnerabilita_alte'),
    porte_esposte: resolved.includes('porte_esposte'),
    certificati_scaduti: resolved.includes('certificati_scaduti'),
    servizi_non_sicuri: resolved.includes('servizi_non_sicuri'),
  };
};

const alertTypesToStrings = (types: SurfaceScanAlertTypes): string[] =>
  (Object.keys(types) as (keyof SurfaceScanAlertTypes)[]).filter(key => types[key]);

const apiAlertToModel = (api: SurfaceScanAlertApiResource): SurfaceScanAlert => ({
  id: api.id,
  user_id: api.user_id,
  organization_id: api.tenant_id,
  alert_email: api.alert_email,
  alert_types: parseAlertTypes(api.alert_types),
  is_active: api.is_active ?? true,
  created_at: api.created_at ?? '',
  updated_at: api.updated_at ?? '',
});

export const useSurfaceScanAlerts = () => {
  const [alerts, setAlerts] = useState<SurfaceScanAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { organizationId, groupId, isLoading: clientLoading } = useClientOrganization();

  const fetchAlerts = useCallback(async () => {
    if (clientLoading) return;
    if (!organizationId) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const list = await surfaceScanAlertsApi.list(organizationId, groupId);
      setAlerts(list.map(apiAlertToModel));
    } catch {
      toast({
        title: 'Errore',
        description: 'Impossibile caricare gli alert',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientLoading, organizationId, groupId, toast]);

  const createAlert = useCallback(async (data: {
    alert_email: string;
    alert_types: SurfaceScanAlertTypes;
    target_user_id?: string;
  }) => {
    try {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      await surfaceScanAlertsApi.create(
        organizationId,
        {
          alert_email: data.alert_email,
          alert_types: alertTypesToStrings(data.alert_types),
          is_active: true,
        },
        groupId,
      );
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
  }, [organizationId, groupId, fetchAlerts, toast]);

  const updateAlert = useCallback(async (id: string, data: {
    alert_email: string;
    alert_types: SurfaceScanAlertTypes;
    target_user_id?: string;
  }) => {
    try {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      await surfaceScanAlertsApi.update(
        organizationId,
        id,
        {
          alert_email: data.alert_email,
          alert_types: alertTypesToStrings(data.alert_types),
          is_active: true,
        },
        groupId,
      );
      toast({
        title: 'Alert aggiornato',
        description: 'Le modifiche sono state salvate',
      });
      await fetchAlerts();
      return true;
    } catch {
      toast({
        title: 'Errore',
        description: "Impossibile aggiornare l'alert",
        variant: 'destructive',
      });
      return false;
    }
  }, [organizationId, groupId, fetchAlerts, toast]);

  const deleteAlert = useCallback(async (id: string) => {
    try {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      await surfaceScanAlertsApi.delete(organizationId, id, groupId);
      toast({
        title: 'Alert eliminato',
        description: "L'alert è stato rimosso",
      });
      await fetchAlerts();
      return true;
    } catch {
      toast({
        title: 'Errore',
        description: "Impossibile eliminare l'alert",
        variant: 'destructive',
      });
      return false;
    }
  }, [organizationId, groupId, fetchAlerts, toast]);

  const toggleAlertStatus = useCallback(async (id: string, isActive: boolean) => {
    try {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      const current = alerts.find(alert => alert.id === id);
      if (!current) throw new Error('Alert non trovato');
      await surfaceScanAlertsApi.update(
        organizationId,
        id,
        {
          alert_email: current.alert_email,
          alert_types: alertTypesToStrings(current.alert_types),
          is_active: isActive,
        },
        groupId,
      );
      toast({
        title: isActive ? 'Alert attivato' : 'Alert disattivato',
        description: `L'alert è stato ${isActive ? 'attivato' : 'disattivato'}`,
      });
      await fetchAlerts();
      return true;
    } catch {
      toast({
        title: 'Errore',
        description: "Impossibile modificare lo stato dell'alert",
        variant: 'destructive',
      });
      return false;
    }
  }, [organizationId, groupId, alerts, fetchAlerts, toast]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

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
