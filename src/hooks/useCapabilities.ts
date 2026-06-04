import { useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Hook that reads capabilities from the /auth/me LoginUser response.
 *
 * Superadmins with is_super_admin === true automatically have ALL capabilities
 * regardless of what the capabilities map contains.
 *
 * If the backend hasn't been updated yet (capabilities field missing), all checks
 * return true for backward compatibility.
 */
export function useCapabilities() {
  const { user, loading: authLoading } = useAuth();

  const capabilities = user?.capabilities ?? null;
  const isSuperAdmin = user?.is_super_admin === true;

  const hasCapability = useMemo(() => {
    return (name: string): boolean => {
      if (authLoading) return false;
      // Superadmin: all capabilities granted
      if (isSuperAdmin) return true;
      // Backward compat: if capabilities field is missing, allow everything
      if (capabilities === null) return true;
      return capabilities[name] === true;
    };
  }, [capabilities, isSuperAdmin, authLoading]);

  const hasAllCapabilities = useMemo(() => {
    return (names: string[]): boolean => {
      if (authLoading) return false;
      if (isSuperAdmin) return true;
      if (capabilities === null) return true;
      return names.every((name) => capabilities[name] === true);
    };
  }, [capabilities, isSuperAdmin, authLoading]);

  const hasAnyCapability = useMemo(() => {
    return (names: string[]): boolean => {
      if (authLoading) return false;
      if (isSuperAdmin) return true;
      if (capabilities === null) return true;
      return names.some((name) => capabilities[name] === true);
    };
  }, [capabilities, isSuperAdmin, authLoading]);

  return {
    capabilities,
    isLoading: authLoading,
    hasCapability,
    hasAllCapabilities,
    hasAnyCapability,
  };
}
