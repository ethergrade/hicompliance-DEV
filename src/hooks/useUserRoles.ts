import { useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

export type AppRole =
  | 'super-admin'
  | 'master'
  | 'sales'
  | 'admin'
  | 'manager'
  | 'viewer'
  | 'customer'
  | 'editor';

const ROLE_ALIASES: Record<string, AppRole> = {
  'super-admin': 'super-admin',
  super_admin: 'super-admin',
  superadmin: 'super-admin',
  master: 'master',
  sales: 'sales',
  admin: 'admin',
  manager: 'manager',
  viewer: 'viewer',
  customer: 'customer',
  client: 'customer',
  editor: 'editor',
};

export const useUserRoles = () => {
  const { user, loading } = useAuth();

  // Derive roles from group names + is_super_admin field
  const roles = useMemo<AppRole[]>(() => {
    const inferred: AppRole[] = [];

    // is_super_admin is a truthy string → super-admin
    if (user?.is_super_admin) {
      inferred.push('super-admin');
    }

    // Check group names for role patterns
    const groupNames = (user?.groups ?? []).map(g => g.name?.toLowerCase() || '');
    for (const name of groupNames) {
      const mapped = ROLE_ALIASES[name];
      if (mapped && !inferred.includes(mapped)) {
        inferred.push(mapped as AppRole);
      }
    }

    return inferred;
  }, [user]);

  const hasRole = (role: AppRole) => {
    const normalizedRole = ROLE_ALIASES[role] ?? role;
    return roles.includes(normalizedRole);
  };

  const isSuperAdmin = hasRole('super-admin') || hasRole('master');
  const isSales = hasRole('sales');
  const isAdmin = hasRole('admin') || hasRole('manager') || isSuperAdmin;

  return {
    roles,
    isSuperAdmin,
    isSales,
    isAdmin,
    loading,
    hasRole
  };
};
