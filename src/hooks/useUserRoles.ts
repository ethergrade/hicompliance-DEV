import { useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

export type AppRole = 'super_admin' | 'sales' | 'client';

export const useUserRoles = () => {
  const { user, loading } = useAuth();

  const roles = useMemo<AppRole[]>(() => {
    if (!user?.roles) return [];
    // roles comes as comma-separated string from API (e.g. "super_admin,sales")
    return user.roles.split(',').map(r => r.trim()).filter(Boolean) as AppRole[];
  }, [user?.roles]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isSuperAdmin = hasRole('super_admin');
  const isSales = hasRole('sales');
  const isClient = hasRole('client');

  return {
    roles,
    loading,
    hasRole,
    isSuperAdmin,
    isSales,
    isClient,
  };
};
