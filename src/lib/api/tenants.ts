import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  PaginatedResponse,
  TenantResource,
  StoreTenantRequest,
  UpdateTenantRequest,
} from "@/types/api";

export const tenantsApi = {
  async list(page?: number): Promise<PaginatedResponse<TenantResource>> {
    return apiClient.get<PaginatedResponse<TenantResource>>("/tenants", page ? { page } : undefined);
  },

  /** Fetch all tenants across all pages */
  async listAll(): Promise<TenantResource[]> {
    const first = await this.list(1);
    const all = [...first.data];
    for (let p = 2; p <= first.meta.last_page; p++) {
      const page = await this.list(p);
      all.push(...page.data);
    }
    return all;
  },

  async get(id: string): Promise<TenantResource> {
    const res = await apiClient.get<ApiResponse<TenantResource>>(`/tenants/${id}`);
    return res.data;
  },

  async create(payload: StoreTenantRequest): Promise<TenantResource> {
    const res = await apiClient.post<ApiResponse<TenantResource>>("/tenants", payload);
    return res.data;
  },

  async update(id: string, payload: UpdateTenantRequest): Promise<TenantResource> {
    const res = await apiClient.put<ApiResponse<TenantResource>>(`/tenants/${id}`, payload);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/tenants/${id}`);
  },

  /** Get the authenticated user's own tenant */
  async getOwn(): Promise<TenantResource> {
    const res = await apiClient.get<ApiResponse<TenantResource>>("/tenant");
    return res.data;
  },

  /** Update the authenticated user's own tenant */
  async updateOwn(payload: UpdateTenantRequest): Promise<TenantResource> {
    const res = await apiClient.put<ApiResponse<TenantResource>>("/tenant", payload);
    return res.data;
  },
};
