import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  TenantServiceResource,
  StoreTenantServiceRequest,
  UpdateTenantServiceRequest,
} from "@/types/api";

export const tenantServicesApi = {
  /** List active tenant services (pass status query param to filter) */
  async list(status?: "active" | "inactive"): Promise<TenantServiceResource[]> {
    const params = status ? { status } : undefined;
    const res = await apiClient.get<ApiResponse<TenantServiceResource[]>>("/tenant-services", params);
    return res.data;
  },

  /** List tenant services by organization/tenant ID */
  async listByOrganization(organizationId: string): Promise<TenantServiceResource[]> {
    const res = await apiClient.get<ApiResponse<TenantServiceResource[]>>(`/tenant-services`, { tenant_id: organizationId });
    return res.data;
  },

  async get(id: string): Promise<TenantServiceResource> {
    const res = await apiClient.get<ApiResponse<TenantServiceResource>>(`/tenant-services/${id}`);
    return res.data;
  },

  async create(payload: StoreTenantServiceRequest): Promise<TenantServiceResource> {
    const res = await apiClient.post<ApiResponse<TenantServiceResource>>("/tenant-services", payload);
    return res.data;
  },

  async update(id: string, payload: UpdateTenantServiceRequest): Promise<TenantServiceResource> {
    const res = await apiClient.put<ApiResponse<TenantServiceResource>>(`/tenant-services/${id}`, payload);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/tenant-services/${id}`);
  },

  /** Service catalog from config endpoint */
  async catalog(): Promise<string> {
    const res = await apiClient.get<ApiResponse<string>>("/config/tenant-services");
    return res.data;
  },
};
