import { useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

export type AppRole = 'super_admin' | 'sales' | 'admin' | 'editor' | 'viewer';

export const useUserRoles = () => {
  const { user } = useAuth();

  const roles = useMemo<AppRole[]>(() => {
    if (!user?.roles) return [];
    
    if (Array.isArray(user.roles)) {
      return user.roles as AppRole[];
    } else if (typeof user.roles === 'string') {
      return (user.roles as string).split(',').map(r => r.trim()).filter(Boolean) as AppRole[];
    }
    
    return [];
  }, [user?.roles]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isSuperAdmin = hasRole('super_admin');
  const isSales = hasRole('sales');
  const isAdmin = hasRole('admin') || isSuperAdmin; // super_admin has all admin rights

  return {
    roles,
    isSuperAdmin,
    isSales,
    isAdmin,
    hasRole
  };
};
