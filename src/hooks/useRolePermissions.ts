import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRoles } from './useUserRoles';

interface ModulePermission {
  id: string;
  role: string;
  module_path: string;
  module_name: string;
  is_enabled: boolean;
}

export const useRolePermissions = () => {
  const { roles, isSuperAdmin } = useUserRoles();
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Super admins see everything
    if (isSuperAdmin) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    const fetchPermissions = async () => {
      if (roles.length === 0) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('role_module_permissions')
          .select('*')
          .in('role', roles);

        if (error) {
          console.error('Error fetching permissions:', error);
          setPermissions([]);
        } else {
          setPermissions(data || []);
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
        setPermissions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('role-permissions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'role_module_permissions',
          filter: `role=in.(${roles.join(',')})`,
        },
        () => {
          fetchPermissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roles, isSuperAdmin]);

  const isModuleEnabled = (modulePath: string): boolean => {
    // Super admins see everything
    if (isSuperAdmin) return true;
    
    // Security: If user has NO roles, hide everything by default
    if (roles.length === 0) return false;
    
    // Security: If no permissions loaded yet for this role, hide by default
    if (permissions.length === 0) return false;

    const permission = permissions.find(p => p.module_path === modulePath);
    // Default to hidden if no explicit permission exists
    return permission ? permission.is_enabled : false;
  };

  return {
    permissions,
    loading,
    isModuleEnabled,
  };
};
