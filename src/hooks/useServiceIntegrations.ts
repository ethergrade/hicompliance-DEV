import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';

interface ServiceIntegration {
  id: string;
  service_id: string;
  api_url: string;
  is_active: boolean;
  organization_id: string;
  service_code?: string;
  service_name?: string;
}

export const useServiceIntegrations = () => {
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = userProfile?.organization_id;

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['service-integrations', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('id, service_id, api_url, is_active, organization_id, hisolution_services(code, name)')
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      
      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: item.id,
        service_id: item.service_id,
        api_url: item.api_url,
        is_active: item.is_active,
        organization_id: item.organization_id,
        service_code: item.hisolution_services?.code,
        service_name: item.hisolution_services?.name,
      })) as ServiceIntegration[];
    },
    enabled: !!organizationId,
  });

  const isServiceConnected = (serviceCode: string): boolean => {
    return integrations.some(i => i.service_code === serviceCode && i.is_active);
  };

  const getIntegrationByCode = (serviceCode: string): ServiceIntegration | undefined => {
    return integrations.find(i => i.service_code === serviceCode && i.is_active);
  };

  const connectMutation = useMutation({
    mutationFn: async ({ serviceId, apiUrl, apiKey }: { serviceId: string; apiUrl: string; apiKey: string }) => {
      if (!organizationId) throw new Error('Nessuna organizzazione selezionata');
      
      // Check if integration already exists for this service
      const { data: existing } = await supabase
        .from('organization_integrations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('service_id', serviceId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('organization_integrations')
          .update({ api_url: apiUrl, api_key: apiKey, is_active: true, api_methods: {} })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('organization_integrations')
          .insert({
            organization_id: organizationId,
            service_id: serviceId,
            api_url: apiUrl,
            api_key: apiKey,
            is_active: true,
            api_methods: {},
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-integrations'] });
      toast.success('Servizio collegato con successo');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const { error } = await supabase
        .from('organization_integrations')
        .update({ is_active: false })
        .eq('id', integrationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-integrations'] });
      toast.success('Servizio scollegato');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  return {
    integrations,
    isLoading,
    isServiceConnected,
    getIntegrationByCode,
    connectService: connectMutation.mutate,
    disconnectService: disconnectMutation.mutate,
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
  };
};
