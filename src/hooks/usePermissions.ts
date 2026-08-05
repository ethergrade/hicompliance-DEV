import { useCapabilities } from '@/hooks/useCapabilities';
import { useUserRoles } from '@/hooks/useUserRoles';
import type { PermAction } from '@/lib/permissions/catalog';

type RouteCapabilities = {
  view?: string[];
  export?: string[];
};

const ROUTE_CAPABILITIES: Record<string, RouteCapabilities> = {
  '/dashboard': { view: ['dashboard.view'] },
  '/assessment': {
    view: ['hicompliance.assessment.view'],
    export: ['hicompliance.assessment.export'],
  },
  '/analytics': {
    view: ['hicompliance.analysis.view'],
    export: ['hicompliance.analysis.export'],
  },
  '/remediation': {
    view: ['hicompliance.remediation.view'],
    export: ['hicompliance.remediation.export'],
  },
  '/compliance-events': {
    view: ['hicompliance.compliance_events.view'],
    export: ['hicompliance.compliance_events.export'],
  },
  '/incident-response': { view: ['irp.view'] },
  '/surface-scan': {
    view: ['surfacescan.assets.view', 'surfacescan.cve.view'],
    export: ['surfacescan.assets.export', 'surfacescan.cve.export'],
  },
  '/surface-scan/exposure': {
    view: ['surfacescan.assets.view', 'surfacescan.cve.view'],
    export: ['surfacescan.assets.export', 'surfacescan.cve.export'],
  },
  '/dark-risk': {
    view: ['darkrisk.view', 'darkrisk.standard.view'],
    export: ['darkrisk.export', 'darkrisk.standard.export'],
  },
  '/dark-risk-esteso': {
    view: ['darkrisk.view', 'darkrisk.extended.view', 'darkrisk.identity.view'],
    export: ['darkrisk.export', 'darkrisk.extended.export', 'darkrisk.identity.export'],
  },
  '/dashboard/service/hitrack': { view: ['hitrack.view'] },
  '/admin/clients': { view: ['companies.manage'] },
  '/admin/companies': { view: ['companies.manage'] },
  '/admin/role-settings': { view: ['users.manage'] },
  '/settings/users': { view: ['users.manage'] },
  '/settings/integrations': { view: ['services.manage'] },
};

/**
 * Capability-driven route gating.
 * Stefano's 2026-06-05 backend change moved fine-grained permissions from the
 * Routes without an explicit capability mapping remain allowed by default.
 */
export function usePermissions() {
  const { isSuperAdmin, isSales } = useUserRoles();
  const bypass = isSuperAdmin || isSales;
  const { capabilities, isLoading, hasCapability, hasAllCapabilities, hasAnyCapability } = useCapabilities();

  const accountDisabled = false;

  const check = (_module: string, subsection: string | undefined, action: PermAction): boolean => {
    if (bypass) return true;
    const routeCaps = ROUTE_CAPABILITIES[subsection || ''];
    const names = routeCaps?.[action];
    if (!names || names.length === 0) return true;
    return hasAnyCapability(names);
  };

  const canViewRoute = (href: string): boolean => {
    if (bypass) return true;
    const names = ROUTE_CAPABILITIES[href]?.view;
    if (!names || names.length === 0) return true;
    return hasAnyCapability(names);
  };

  const canExportRoute = (href: string): boolean => {
    if (bypass) return true;
    const names = ROUTE_CAPABILITIES[href]?.export;
    if (!names || names.length === 0) return true;
    return hasAnyCapability(names);
  };

  return {
    isLoading,
    bypass,
    accountDisabled,
    permissions: capabilities ?? {},
    can: check,
    canViewRoute,
    canExportRoute,
    hasCapability,
    hasAllCapabilities,
    hasAnyCapability,
  };
}
