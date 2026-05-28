import { useState, useEffect, useCallback } from 'react';
import { darkRiskAlertsApi } from '@/lib/api/dark-risk-alerts';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useToast } from '@/hooks/use-toast';
import type { DarkRiskAlert as ApiDarkRiskAlert } from '@/types/api';

// ─── Alert type definitions (unchanged — same as callers expect) ──────────

export interface AlertTypes {
  credenziali_compromesse: boolean;
  dati_carte_credito: boolean;
  database_leak: boolean;
  email_compromesse: boolean;
  dati_sensibili: boolean;
}

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

export type DarkRiskAlert = BaseAlert<AlertTypes>;

// ─── Mappers (API ↔ BaseAlert) ────────────────────────────────────────────

function apiAlertToBaseAlert(api: ApiDarkRiskAlert): DarkRiskAlert {
  return {
    id: api.id,
    user_id: '', // API does not return user_id — filled by caller if needed
    organization_id: api.company_id ?? null,
    alert_email: api.alert_email,
    alert_types: parseAlertTypes(api.alert_types),
    is_active: api.is_active ?? true,
    created_at: api.created_at ?? '',
    updated_at: api.updated_at ?? '',
  };
}

/** Parse API string[] alert_types into AlertTypes boolean object */
function parseAlertTypes(types: string[] | undefined): AlertTypes {
  const resolved = types ?? [];
  return {
    credenziali_compromesse: resolved.includes('credenziali_compromesse'),
    dati_carte_credito: resolved.includes('dati_carte_credito'),
    database_leak: resolved.includes('database_leak'),
    email_compromesse: resolved.includes('email_compromesse'),
    dati_sensibili: resolved.includes('dati_sensibili'),
  };
}

/** Convert AlertTypes boolean object back to string[] for the API */
function alertTypesToStrings(types: AlertTypes): string[] {
  return (Object.keys(types) as (keyof AlertTypes)[]).filter(k => types[k]);
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useDarkRiskAlerts() {
  const [alerts, setAlerts] = useState<DarkRiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { organizationId, isLoading: clientLoading } = useClientOrganization();

  const fetchAlerts = useCallback(async () => {
    if (clientLoading) return;
    if (!organizationId) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const list = await darkRiskAlertsApi.list(organizationId);
      setAlerts(list.map(apiAlertToBaseAlert));
    } catch {
      toast({
        title: 'Errore',
        description: 'Impossibile caricare gli alert',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientLoading, organizationId, toast]);

  const createAlert = useCallback(async (data: {
    alert_email: string;
    alert_types: AlertTypes;
    target_user_id?: string;
  }) => {
    try {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      await darkRiskAlertsApi.create(organizationId, {
        alert_email: data.alert_email,
        alert_types: alertTypesToStrings(data.alert_types),
      });
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
  }, [organizationId, fetchAlerts, toast]);

  const updateAlert = useCallback(async (id: string, data: {
    alert_email: string;
    alert_types: AlertTypes;
  }) => {
    try {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      await darkRiskAlertsApi.update(organizationId, id, {
        alert_email: data.alert_email,
        alert_types: alertTypesToStrings(data.alert_types),
      });
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
  }, [organizationId, fetchAlerts, toast]);

  const deleteAlert = useCallback(async (id: string) => {
    try {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      await darkRiskAlertsApi.delete(organizationId, id);
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
  }, [organizationId, fetchAlerts, toast]);

  const toggleAlertStatus = useCallback(async (id: string, isActive: boolean) => {
    try {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      await darkRiskAlertsApi.update(organizationId, id, { is_active: isActive });
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
  }, [organizationId, fetchAlerts, toast]);

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
}
