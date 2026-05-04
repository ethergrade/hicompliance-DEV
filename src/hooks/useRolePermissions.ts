import { useUserRoles } from './useUserRoles';

export const useRolePermissions = () => {
  const { roles, isSuperAdmin, isAdmin } = useUserRoles();

  const isModuleEnabled = (modulePath: string): boolean => {
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
