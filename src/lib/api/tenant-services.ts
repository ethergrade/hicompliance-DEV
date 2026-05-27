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
  async list(status?: "active" | "inactive"): Promise<TenantServiceResource[]> {
    const params = status ? { status } : undefined;
    const res = await apiClient.get<ApiResponse<TenantServiceResource[]>>("/tenant-services", params);
    return res.data;
  },

  /** List tenant services by organization/tenant ID */
  async listByOrganization(organizationId: string): Promise<TenantServiceResource[]> {
    const res = await apiClient.get<ApiResponse<TenantServiceResource[]>>(
      `/tenant-services`,
      { tenant_id: organizationId },
      { headers: groupHeader(organizationId) }
    );
    return res.data;
  },

  async get(id: string, groupId: string): Promise<TenantServiceResource> {
    const res = await apiClient.get<ApiResponse<TenantServiceResource>>(
      `/tenant-services/${id}`,
      undefined,
      { headers: groupHeader(groupId) }
    );
    return res.data;
  },

  async create(payload: StoreTenantServiceRequest, groupId: string): Promise<TenantServiceResource> {
    const res = await apiClient.post<ApiResponse<TenantServiceResource>>(
      "/tenant-services",
      payload,
      { headers: groupHeader(groupId) }
    );
    return res.data;
  },

  async update(id: string, payload: UpdateTenantServiceRequest, groupId: string): Promise<TenantServiceResource> {
    const res = await apiClient.put<ApiResponse<TenantServiceResource>>(
      `/tenant-services/${id}`,
      payload,
      { headers: groupHeader(groupId) }
    );
    return res.data;
  },

  async delete(id: string, groupId: string): Promise<void> {
    await apiClient.delete(`/tenant-services/${id}`, { headers: groupHeader(groupId) });
  },

  /** Service catalog from config endpoint */
  async catalog(): Promise<ServiceCatalog> {
    const res = await apiClient.get<ApiResponse<ServiceCatalog>>("/config/tenant-services");
    return res.data;
  },
};
