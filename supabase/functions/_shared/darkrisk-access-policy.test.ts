import {
  canStartExtendedRun,
  canViewExtendedSensitiveData,
  resolveDarkRiskCapabilities,
  type DarkRiskCaller,
} from "./darkrisk-access-policy.ts";

const orgId = "org-a";

function caller(overrides: Partial<DarkRiskCaller> = {}): DarkRiskCaller {
  return {
    organizationId: orgId,
    userType: "customer",
    isSuperAdmin: false,
    isAdminLike: false,
    canManageAllOrganizations: false,
    ...overrides,
  };
}

Deno.test("standard entitlement never exposes clear extended evidence", () => {
  const capabilities = resolveDarkRiskCapabilities({ legacyEnabled: true, legacyTier: "standard" });
  if (canViewExtendedSensitiveData(caller(), orgId, capabilities)) {
    throw new Error("standard customer unexpectedly received sensitive access");
  }
});
Deno.test("extended customers can view full evidence but cannot start a run", () => {
  const capabilities = resolveDarkRiskCapabilities({ legacyEnabled: true, legacyTier: "extended" });
  if (!canViewExtendedSensitiveData(caller(), orgId, capabilities)) {
    throw new Error("extended customer should be allowed to view contracted evidence");
  }
  if (canStartExtendedRun(caller(), orgId, capabilities)) {
    throw new Error("customer must not start extended runs");
  }
});

Deno.test("organization admin and super admin can start an entitled extended run", () => {
  const capabilities = resolveDarkRiskCapabilities({
    grants: [{ capability: "extended_identity", enabled: true }],
  });
  if (!canStartExtendedRun(caller({ userType: "admin", isAdminLike: true }), orgId, capabilities)) {
    throw new Error("organization admin should be allowed");
  }
  if (!canStartExtendedRun(
    caller({ organizationId: null, userType: "admin", isSuperAdmin: true, isAdminLike: true, canManageAllOrganizations: true }),
    orgId,
    capabilities,
  )) {
    throw new Error("super admin should be allowed");
  }
});

Deno.test("sales users cannot start or read extended evidence", () => {
  const capabilities = resolveDarkRiskCapabilities({ legacyTier: "extended", legacyEnabled: true });
  const sales = caller({ userType: "sales", canManageAllOrganizations: true });
  if (canStartExtendedRun(sales, orgId, capabilities)) throw new Error("sales start access denied");
  if (canViewExtendedSensitiveData(sales, orgId, capabilities)) throw new Error("sales sensitive access denied");
});
