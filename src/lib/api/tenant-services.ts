import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  TenantServiceResource,
  StoreTenantServiceRequest,
  UpdateTenantServiceRequest,
  ServiceCatalog,
} from "@/types/api";

const groupHeader = (groupId: string) => ({ "X-Group-Id": groupId });

export const tenantServicesApi = {
  /** List active tenant services (pass status query param to filter) */
  async list(status?: "active" | "inactive", groupId?: string | null): Promise<TenantServiceResource[]> {
    const params = status ? { status } : undefined;
    const opts = groupId ? { headers: groupHeader(groupId) } : undefined;
    const res = await apiClient.get<ApiResponse<TenantServiceResource[]>>("/tenant-services", params, opts);
    return res.data;
  },

  /** List tenant services by organization/tenant ID */
  async listByOrganization(organizationId: string, groupId?: string | null): Promise<TenantServiceResource[]> {
    const effectiveGroup = groupId || organizationId;
    const res = await apiClient.get<ApiResponse<TenantServiceResource[]>>(
      `/tenant-services`,
      { tenant_id: organizationId },
      { headers: groupHeader(effectiveGroup) }
    );
    return res.data;
  },

  async get(id: string, groupId?: string | null): Promise<TenantServiceResource> {
    const res = await apiClient.get<ApiResponse<TenantServiceResource>>(
      `/tenant-services/${id}`,
      undefined,
      groupId ? { headers: groupHeader(groupId) } : undefined
    );
    return res.data;
  },

  async create(payload: StoreTenantServiceRequest, groupId?: string | null): Promise<TenantServiceResource> {
    const res = await apiClient.post<ApiResponse<TenantServiceResource>>(
      "/tenant-services",
      payload,
      groupId ? { headers: groupHeader(groupId) } : undefined
    );
    return res.data;
  },

  async update(id: string, payload: UpdateTenantServiceRequest, groupId?: string | null): Promise<TenantServiceResource> {
    const res = await apiClient.put<ApiResponse<TenantServiceResource>>(
      `/tenant-services/${id}`,
      payload,
      groupId ? { headers: groupHeader(groupId) } : undefined
    );
    return res.data;
  },

  /** PATCH — partial update (used for HiPatch settings, etc.) */
  async patch(id: string, payload: Partial<UpdateTenantServiceRequest>, groupId?: string | null): Promise<TenantServiceResource> {
    const res = await apiClient.patch<ApiResponse<TenantServiceResource>>(
      `/tenant-services/${id}`,
      payload,
      groupId ? { headers: groupHeader(groupId) } : undefined
    );
    return res.data;
  },

  async delete(id: string, groupId?: string | null): Promise<void> {
    await apiClient.delete(
      `/tenant-services/${id}`,
      groupId ? { headers: groupHeader(groupId) } : undefined
    );
  },

  /** Service catalog from config endpoint */
  async catalog(): Promise<ServiceCatalog> {
    const res = await apiClient.get<ApiResponse<ServiceCatalog>>("/config/tenant-services");
    return res.data;
  },
};
