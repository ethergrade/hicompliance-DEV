import { useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

export type AppRole = 'super_admin' | 'sales' | 'admin' | 'editor' | 'viewer';

export const useUserRoles = () => {
  const { user, loading } = useAuth();

  const roles = useMemo<AppRole[]>(() => {
    const userRoles = user?.roles || (user as any)?.role;
    if (!userRoles) return [];
    
    if (Array.isArray(userRoles)) {
      return userRoles as AppRole[];
    } else if (typeof userRoles === 'string') {
      return (userRoles as string).split(',').map(r => r.trim()).filter(Boolean) as AppRole[];
    }
    
    return [];
  }, [user]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isSuperAdmin = hasRole('super_admin');
  const isSales = hasRole('sales');
  const isAdmin = hasRole('admin') || isSuperAdmin; // super_admin has all admin rights

  return {
    roles,
    isSuperAdmin,
    isSales,
    isAdmin,
    loading,
    hasRole
  };
};
