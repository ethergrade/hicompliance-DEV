import { useUserRoles } from './useUserRoles';
import { isModuleVisible } from '@/config/moduleVisibility';

export const useRolePermissions = () => {
  const { roles, isSuperAdmin, isAdmin } = useUserRoles();

  const isModuleEnabled = (modulePath: string): boolean => {
    if (!isModuleVisible(modulePath)) return false;

    // Super admins see everything
    if (isSuperAdmin) return true;
    
    // Security: If user has NO roles, hide everything by default
    if (roles.length === 0) return false;
    
    return true; 
  };

  return {
    permissions: [],
    loading: false,
    isModuleEnabled,
  };
};
