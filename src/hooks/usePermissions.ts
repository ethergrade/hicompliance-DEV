import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useCapabilities } from '@/hooks/useCapabilities';
import { ROUTE_TO_MODULE, PermAction } from '@/lib/permissions/catalog';

type PermMap = Record<string, any>;

/**
 * Loads the current user's module permissions map.
 * Returns helpers to check view/edit/export per module/subsection or per route.
 * SuperAdmin/Sales bypass all checks.
 */
export function usePermissions() {
  const { user } = useAuth();
  const { isSuperAdmin, isSales } = useUserRoles();
  const bypass = isSuperAdmin || isSales;

  const { data, isLoading } = useQuery({
    queryKey: ['my-module-permissions', user?.id],
    enabled: !!user?.id && !bypass,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_module_permissions' as any);
      if (error) throw error;
      return (data ?? {}) as PermMap;
    },
    staleTime: 60_000,
  });

  const perms: PermMap = data ?? {};
  const accountDisabled = perms?.__disabled === true;
  const { hasCapability, hasAllCapabilities, hasAnyCapability } = useCapabilities();

  const check = (module: string, subsection: string | undefined, action: PermAction): boolean => {
    if (bypass) return true;
    if (accountDisabled) return false;
    // No contact-linked config -> default allow (legacy users)
    if (!data || Object.keys(perms).length === 0) return true;
    const mod = perms[module];
    if (!mod) return true; // module not in map -> default allow
    const subKey = subsection ?? '_root';
    const sub = mod[subKey] ?? mod['_root'];
    if (!sub) return true;
    const v = sub[action];
    return v === undefined ? true : !!v;
  };

  const canViewRoute = (href: string): boolean => {
    if (bypass) return true;
    if (accountDisabled) return false;
    const m = ROUTE_TO_MODULE[href];
    if (!m) return true;
    return check(m.module, m.subsection, 'view');
  };

  const canExportRoute = (href: string): boolean => {
    if (bypass) return true;
    if (accountDisabled) return false;
    const m = ROUTE_TO_MODULE[href];
    if (!m) return true;
    return check(m.module, m.subsection, 'export');
  };

  return {
    isLoading,
    bypass,
    accountDisabled,
    permissions: perms,
    can: check,
    canViewRoute,
    canExportRoute,
    hasCapability,
    hasAllCapabilities,
    hasAnyCapability,
  };
}
