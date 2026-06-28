export type DarkRiskCapability = "standard_monitor" | "extended_identity";

export type DarkRiskCaller = {
  organizationId: string | null;
  userType: string;
  isSuperAdmin: boolean;
  isAdminLike: boolean;
  canManageAllOrganizations: boolean;
};

export type DarkRiskCapabilityGrant = {
  capability?: string | null;
  enabled?: boolean | null;
};

function normalizedRole(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase().replace(/-/g, "_");
}
export function isSalesCaller(caller: DarkRiskCaller): boolean {
  return normalizedRole(caller.userType) === "sales";
}

export function callerCanAccessOrganization(
  caller: DarkRiskCaller,
  organizationId: string,
): boolean {
  const requested = String(organizationId || "").trim();
  if (!requested || isSalesCaller(caller)) return false;
  return caller.canManageAllOrganizations || String(caller.organizationId || "").trim() === requested;
}

export function resolveDarkRiskCapabilities(input: {
  grants?: DarkRiskCapabilityGrant[] | null;
  legacyEnabled?: boolean | null;
  legacyTier?: string | null;
  legacyExtendedEnabled?: boolean | null;
}): Set<DarkRiskCapability> {
  const capabilities = new Set<DarkRiskCapability>();

  for (const grant of input.grants || []) {
    if (grant?.enabled === false) continue;
    if (grant?.capability === "standard_monitor") capabilities.add("standard_monitor");
    if (grant?.capability === "extended_identity") capabilities.add("extended_identity");
  }

  if (input.legacyEnabled) capabilities.add("standard_monitor");
  if (
    input.legacyExtendedEnabled ||
    String(input.legacyTier || "").trim().toLowerCase() === "extended"
  ) {
    capabilities.add("standard_monitor");
    capabilities.add("extended_identity");
  }

  return capabilities;
}

export function canStartExtendedRun(
  caller: DarkRiskCaller,
  organizationId: string,
  capabilities: Set<DarkRiskCapability>,
): boolean {
  if (!capabilities.has("extended_identity")) return false;
  if (!callerCanAccessOrganization(caller, organizationId)) return false;
  return caller.isSuperAdmin || caller.isAdminLike || caller.canManageAllOrganizations;
}

export function canViewExtendedSensitiveData(
  caller: DarkRiskCaller,
  organizationId: string,
  capabilities: Set<DarkRiskCapability>,
): boolean {
  return capabilities.has("extended_identity") && callerCanAccessOrganization(caller, organizationId);
}
