import { useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Hook that reads capabilities from the AuthContext.
 *
 * `refreshCapabilities()` in AuthProvider updates an independent
 * `capabilities` state (not via `setUser`), so calling it does NOT
 * trigger the `fetchOrganizations` cascade in ClientContext.
 *
 * Superadmins with is_super_admin === true automatically have ALL capabilities
 * regardless of what the capabilities map contains.
 *
 * If capabilities are undefined (backward compat — backend hasn't been updated),
 * all checks return true.
 */
export function useCapabilities() {
  const { user, capabilities: ctxCapabilities, loading: authLoading } = useAuth();

  const capabilities = ctxCapabilities ?? user?.capabilities ?? null;
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
