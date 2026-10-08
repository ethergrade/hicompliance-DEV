import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

/** Tenant Sophos del partner, con il cliente HiConsole collegato (solo super-admin). */
export interface SophosPartnerTenant {
  id: string;
  name: string;
  dataRegion: string | null;
  billingType: string | null;
  status: string | null;
  linkedTenantId: string | null;
}

export interface SophosTenantLink {
  tenantId: string;
  sophosTenantId: string;
  sophosTenantName: string | null;
  dataRegion: string | null;
  linkedAt: string | null;
}

export const sophosAdminApi = {
  tenants: async (refresh = false) =>
    (await complianceApiClient.get<ApiResponse<SophosPartnerTenant[]>>("/admin/sophos/tenants", refresh ? { refresh: 1 } : undefined)).data ?? [],
  link: async (companyId: string) =>
    (await complianceApiClient.get<ApiResponse<SophosTenantLink | null>>(`/admin/sophos/links/${companyId}`)).data ?? null,
  save: async (companyId: string, sophosTenantId: string) =>
    (await complianceApiClient.put<ApiResponse<SophosTenantLink>>(`/admin/sophos/links/${companyId}`, { sophos_tenant_id: sophosTenantId })).data,
  remove: async (companyId: string) => {
    await complianceApiClient.delete(`/admin/sophos/links/${companyId}`);
  },
};
