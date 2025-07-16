import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Organization {
  id: string;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export function useOrganizationSettings() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchOrganization = async () => {
    try {
      setLoading(true);
      
      // Prima otteniamo l'utente corrente per trovare la sua organizzazione
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (userError) {
        console.error('Error fetching user:', userError);
        return;
      }

      if (!userData?.organization_id) {
        console.error('User has no organization');
        return;
      }

      // Poi otteniamo i dati dell'organizzazione
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', userData.organization_id)
        .single();

      if (error) {
        console.error('Error fetching organization:', error);
        toast({
          title: "Errore",
          description: "Impossibile caricare i dati dell'organizzazione",
          variant: "destructive",
        });
        return;
      }

      setOrganization(data);
    } catch (error) {
      console.error('Error fetching organization:', error);
      toast({
        title: "Errore",
        description: "Errore durante il caricamento dei dati",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateOrganization = async (updates: Partial<Organization>) => {
    try {
      if (!organization) return false;

      const { error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', organization.id);

      if (error) {
        console.error('Error updating organization:', error);
        toast({
          title: "Errore",
          description: "Impossibile aggiornare i dati dell'organizzazione",
          variant: "destructive",
        });
        return false;
      }

      // Aggiorna lo stato locale
      setOrganization(prev => prev ? { ...prev, ...updates } : null);
      return true;
    } catch (error) {
      console.error('Error updating organization:', error);
      toast({
        title: "Errore",
        description: "Errore durante l'aggiornamento",
        variant: "destructive",
      });
      return false;
    }
  };

  useEffect(() => {
    fetchOrganization();
  }, []);

  return {
    organization,
    loading,
    updateOrganization,
    refetch: fetchOrganization,
  };
}