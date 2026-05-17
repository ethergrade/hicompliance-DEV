import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  IntegrationResource,
  ServiceCatalogItem,
  StoreIntegrationRequest,
  UpdateIntegrationRequest,
} from "@/types/api";

export const integrationsApi = {
  /** Get all integrations for an organization */
  async listByOrganization(organizationId: string): Promise<IntegrationResource[]> {
    const res = await apiClient.get<ApiResponse<IntegrationResource[]>>(
      `/integrations/organization/${organizationId}`
    );
    return res.data;
  },

  /** Get the service catalog (available services to link) */
  async catalog(): Promise<ServiceCatalogItem[]> {
    const res = await apiClient.get<ApiResponse<ServiceCatalogItem[]>>(
      "/config/services"
    );
    return res.data;
  },

  /** Create a new integration (link a service to an organization) */
  async create(payload: StoreIntegrationRequest): Promise<IntegrationResource> {
    const res = await apiClient.post<ApiResponse<IntegrationResource>>(
      "/integrations",
      payload
    );
    return res.data;
  },

  /** Update an existing integration */
  async update(id: string, payload: UpdateIntegrationRequest): Promise<IntegrationResource> {
    const res = await apiClient.put<ApiResponse<IntegrationResource>>(
      `/integrations/${id}`,
      payload
    );
    return res.data;
  },

  /** Delete an integration */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/integrations/${id}`);
  },

  /** Deactivate an integration (soft delete) */
  async deactivate(id: string): Promise<IntegrationResource> {
    const res = await apiClient.patch<ApiResponse<IntegrationResource>>(
      `/integrations/${id}/deactivate`
    );
    return res.data;
  },
};
