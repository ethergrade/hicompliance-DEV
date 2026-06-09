import { apiClient } from '@/lib/api-client';
import { FALLBACK_SERVICE_CATALOG } from '@/data/serviceCatalog';
import type {
  ApiResponse,
  IntegrationResource,
  ServiceCatalogItem,
  StoreIntegrationRequest,
  UpdateIntegrationRequest,
} from '@/types/api';

const groupHeader = (groupId: string) => ({
  headers: { 'X-Group-Id': groupId },
});

type ApiIntegrationResource = {
  id: string;
  tenant_id: string;
  service_id: string;
  api_url: string;
  is_active: boolean;
  api_methods?: Record<string, unknown> | null;
  service?: ServiceCatalogItem | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export interface IntegrationAuditLogResource {
  id: string;
  integration_id: string | null;
  action: 'created' | 'updated' | 'deleted';
  service_name: string;
  changed_by: string | null;
  changed_by_email: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

const toIntegrationResource = (api: ApiIntegrationResource): IntegrationResource => ({
  id: api.id,
  organization_id: api.tenant_id,
  service_id: api.service_id,
  service_code: api.service?.code ?? '',
  service_name: api.service?.name ?? api.service_id,
  api_url: api.api_url,
  is_active: api.is_active,
  api_methods: api.api_methods ?? undefined,
  created_at: api.created_at ?? undefined,
  updated_at: api.updated_at ?? undefined,
});

export const integrationsApi = {
  async listByOrganization(organizationId: string, groupId?: string | null): Promise<IntegrationResource[]> {
    const res = await apiClient.get<ApiResponse<ApiIntegrationResource[]>>(
      `/companies/${organizationId}/integrations`,
      undefined,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data.map(toIntegrationResource);
  },

  async catalog(): Promise<ServiceCatalogItem[]> {
    try {
      const res = await apiClient.get<ApiResponse<ServiceCatalogItem[]>>('/hisolution-services');
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        return res.data;
      }
      return FALLBACK_SERVICE_CATALOG;
    } catch {
      return FALLBACK_SERVICE_CATALOG;
    }
  },

  async create(
    organizationId: string,
    payload: Omit<StoreIntegrationRequest, 'organization_id'>,
    groupId?: string | null,
  ): Promise<IntegrationResource> {
    const res = await apiClient.post<ApiResponse<ApiIntegrationResource>>(
      `/companies/${organizationId}/integrations`,
      payload,
      groupId ? groupHeader(groupId) : undefined,
    );
    return toIntegrationResource(res.data);
  },

  async update(
    organizationId: string,
    id: string,
    payload: UpdateIntegrationRequest,
    groupId?: string | null,
  ): Promise<IntegrationResource> {
    const res = await apiClient.put<ApiResponse<ApiIntegrationResource>>(
      `/companies/${organizationId}/integrations/${id}`,
      payload,
      groupId ? groupHeader(groupId) : undefined,
    );
    return toIntegrationResource(res.data);
  },

  async delete(organizationId: string, id: string, groupId?: string | null): Promise<void> {
    await apiClient.delete(`/companies/${organizationId}/integrations/${id}`, groupId ? groupHeader(groupId) : undefined);
  },

  async auditLogs(
    organizationId: string,
    params?: { per_page?: number },
    groupId?: string | null,
  ): Promise<IntegrationAuditLogResource[]> {
    const res = await apiClient.get<ApiResponse<IntegrationAuditLogResource[]>>(
      `/companies/${organizationId}/integration-audit-logs`,
      params,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },
};
