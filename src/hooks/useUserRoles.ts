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

  const roles = useMemo<AppRole[]>(() => {
    const userRoles = user?.roles || (user as any)?.role;
    if (!userRoles) return [];

    const rawRoles = Array.isArray(userRoles)
      ? userRoles
      : typeof userRoles === 'string'
        ? userRoles.split(',')
        : [];

    return rawRoles
      .map((role) => ROLE_ALIASES[String(role).trim().toLowerCase()])
      .filter((role): role is AppRole => Boolean(role));
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
