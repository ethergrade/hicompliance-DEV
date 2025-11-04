import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface OrganizationUser {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  user_type: string;
}

export const useOrganizationUsers = () => {
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // Ottieni l'utente corrente
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      // Ottieni l'organization_id dell'utente corrente
      const { data: currentUser } = await supabase
        .from('users')
        .select('organization_id, user_type')
        .eq('auth_user_id', userData.user.id)
        .single();

      if (!currentUser || currentUser.user_type !== 'admin') {
        setUsers([]);
        return;
      }

      // Ottieni tutti gli utenti dell'organizzazione
      const { data, error } = await supabase
        .from('users')
        .select('id, auth_user_id, email, full_name, user_type')
        .eq('organization_id', currentUser.organization_id)
        .order('full_name', { ascending: true });

      if (error) throw error;
      setUsers((data || []) as OrganizationUser[]);
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: 'Impossibile caricare gli utenti',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return {
    users,
    loading,
    refetch: fetchUsers,
  };
};
