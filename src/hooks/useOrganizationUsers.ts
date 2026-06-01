import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export interface OrganizationUser {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  user_type: string;
}

interface UseOrganizationUsersOptions {
  enabled?: boolean;
  organizationId?: string | null;
}

export const useOrganizationUsers = (options: UseOrganizationUsersOptions = {}) => {
  const { enabled = true, organizationId: organizationIdOverride = null } = options;
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { organizationId: activeOrganizationId } = useClientOrganization();

  const fetchUsers = useCallback(async () => {
    if (!enabled) {
      setUsers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!userData.user) return;

      // Ottieni metadati dell'utente loggato.
      const { data: currentUser, error: currentUserError } = await supabase
        .from('users')
        .select('organization_id, user_type')
        .eq('auth_user_id', userData.user.id)
        .maybeSingle();

      if (currentUserError) throw currentUserError;

      const isAdmin = String(currentUser?.user_type || '').toLowerCase() === 'admin';
      if (!currentUser || !isAdmin) {
        setUsers([]);
        return;
      }

      const targetOrganizationId = organizationIdOverride || activeOrganizationId || currentUser.organization_id || null;
      if (!targetOrganizationId) {
        setUsers([]);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, auth_user_id, email, full_name, user_type')
        .eq('organization_id', targetOrganizationId)
        .order('full_name', { ascending: true });

      if (error) throw error;
      setUsers(
        ((data || []) as Array<Partial<OrganizationUser>>).map((row, index) => ({
          id: String(row.id || `org-user-${index}`),
          auth_user_id: String(row.auth_user_id || ''),
          email: String(row.email || ''),
          full_name: String(row.full_name || row.email || 'Utente'),
          user_type: String(row.user_type || 'client'),
        })),
      );
    } catch (error: any) {
      console.error('[useOrganizationUsers] fetch failed', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare gli utenti',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [enabled, organizationIdOverride, activeOrganizationId, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    loading,
    refetch: fetchUsers,
  };
};
