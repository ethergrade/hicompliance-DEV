import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { OrganizationLocation } from '@/types/organization';

export function useOrganizationLocations() {
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLocations = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('organization_locations')
        .select('*')
        .order('is_main_location', { ascending: false })
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching locations:', error);
        toast({
          title: "Errore",
          description: "Impossibile caricare le sedi",
          variant: "destructive",
        });
        return;
      }

      setLocations(data || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
      toast({
        title: "Errore",
        description: "Errore durante il caricamento delle sedi",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createLocation = async (locationData: Partial<OrganizationLocation>) => {
    try {
      // Otteniamo l'organization_id dell'utente corrente
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (userError || !userData?.organization_id) {
        toast({
          title: "Errore",
          description: "Impossibile identificare l'organizzazione",
          variant: "destructive",
        });
        return false;
      }

      // Assicuriamoci che i campi obbligatori siano presenti
      if (!locationData.name || !locationData.address || !locationData.city) {
        toast({
          title: "Errore",
          description: "Nome, indirizzo e città sono obbligatori",
          variant: "destructive",
        });
        return false;
      }

      const { data, error } = await supabase
        .from('organization_locations')
        .insert({
          name: locationData.name,
          address: locationData.address,
          city: locationData.city,
          postal_code: locationData.postal_code || null,
          country: locationData.country || 'Italia',
          phone: locationData.phone || null,
          email: locationData.email || null,
          notes: locationData.notes || null,
          is_main_location: locationData.is_main_location || false,
          tags: locationData.tags || [],
          organization_id: userData.organization_id,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating location:', error);
        toast({
          title: "Errore",
          description: "Impossibile creare la sede",
          variant: "destructive",
        });
        return false;
      }

      setLocations(prev => [...prev, data]);
      toast({
        title: "Successo",
        description: "Sede creata con successo",
      });
      return true;
    } catch (error) {
      console.error('Error creating location:', error);
      toast({
        title: "Errore",
        description: "Errore durante la creazione della sede",
        variant: "destructive",
      });
      return false;
    }
  };

  const updateLocation = async (id: string, updates: Partial<OrganizationLocation>) => {
    try {
      const { data, error } = await supabase
        .from('organization_locations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating location:', error);
        toast({
          title: "Errore",
          description: "Impossibile aggiornare la sede",
          variant: "destructive",
        });
        return false;
      }

      setLocations(prev => prev.map(location => 
        location.id === id ? data : location
      ));
      toast({
        title: "Successo",
        description: "Sede aggiornata con successo",
      });
      return true;
    } catch (error) {
      console.error('Error updating location:', error);
      toast({
        title: "Errore",
        description: "Errore durante l'aggiornamento della sede",
        variant: "destructive",
      });
      return false;
    }
  };

  const deleteLocation = async (id: string) => {
    try {
      const { error } = await supabase
        .from('organization_locations')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting location:', error);
        toast({
          title: "Errore",
          description: "Impossibile eliminare la sede",
          variant: "destructive",
        });
        return false;
      }

      setLocations(prev => prev.filter(location => location.id !== id));
      toast({
        title: "Successo",
        description: "Sede eliminata con successo",
      });
      return true;
    } catch (error) {
      console.error('Error deleting location:', error);
      toast({
        title: "Errore",
        description: "Errore durante l'eliminazione della sede",
        variant: "destructive",
      });
      return false;
    }
  };

  useEffect(() => {
    fetchLocations();

    // Real-time subscription
    const channel = supabase
      .channel('organization_locations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'organization_locations'
        },
        () => {
          fetchLocations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    locations,
    loading,
    createLocation,
    updateLocation,
    deleteLocation,
    refetch: fetchLocations,
  };
}