import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useClientOrganization } from '@/hooks/useClientOrganization';

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
  const { organizationId, isLoading: clientLoading } = useClientOrganization();

  const fetchAlerts = useCallback(async () => {
    if (clientLoading) return;
    if (!organizationId) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    // TODO: migrate to backend API
    setAlerts([]);
    setLoading(false);
  }, [clientLoading, organizationId, table, toast]);

  const createAlert = async (data: {
    alert_email: string;
    alert_types: TTypes;
    target_user_id?: string;
  }) => {
    // TODO: migrate to backend API
    return false;
  };

  const updateAlert = async (id: string, data: { alert_email: string; alert_types: TTypes }) => {
    // TODO: migrate to backend API
    return false;
  };

  const deleteAlert = async (id: string) => {
    // TODO: migrate to backend API
    return false;
  };

  const toggleAlertStatus = async (id: string, isActive: boolean) => {
    // TODO: migrate to backend API
    return false;
  };

  useEffect(() => {
    fetchAlerts();
    // TODO: migrate to backend API (Realtime → polling)
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
