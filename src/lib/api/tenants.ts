import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  CompanyProfileResource,
  PaginatedResponse,
  TenantResource,
  StoreTenantRequest,
  UpdateCompanyProfileRequest,
  UpdateTenantRequest,
} from "@/types/api";

const groupHeader = (groupId: string) => ({
  headers: { "X-Group-Id": groupId },
});

/**
 * Companies API (replaces deprecated /tenants endpoints).
 *
 * Auth format (2026-05-27):
 *   /auth/me returns { is_super_admin: bool, groups: Group[] }
 *   Group.id = group UUID (used as X-Group-Id)
 *   Company.id = old tenant_id (same UUID)
 *
 * List:  GET  /companies?group_id={gid}    → paginated, X-Group-Id required
 * Single: GET  /companies/{id}              → {success, message, data}
 */
export const companiesApi = {
  /** List companies for a group */
  async list(groupId: string, page?: number): Promise<PaginatedResponse<TenantResource>> {
    return apiClient.get<PaginatedResponse<TenantResource>>(
      "/companies",
      { page, group_id: groupId },
      groupHeader(groupId)
    );
  },

  /** Fetch all companies for a group (auto-paginate) */
  async listAll(groupId: string): Promise<TenantResource[]> {
    const first = await this.list(groupId, 1);
    const all = [...first.data];
    for (let p = 2; p <= first.meta.last_page; p++) {
      const page = await this.list(groupId, p);
      all.push(...page.data);
    }
    return all;
  },

  /** Get a single company by ID */
  async get(id: string, groupId?: string): Promise<TenantResource> {
    const res = await apiClient.get<ApiResponse<TenantResource>>(
      `/companies/${id}`,
      undefined,
      groupId ? groupHeader(groupId) : undefined
    );
    return res.data;
  },

  /** Create a new company */
  async create(payload: StoreTenantRequest, groupId: string): Promise<TenantResource> {
    const res = await apiClient.post<ApiResponse<TenantResource>>(
      "/companies",
      payload,
      groupHeader(groupId)
    );
    return res.data;
  },

  /** Update a company */
  async update(id: string, payload: UpdateTenantRequest, groupId: string): Promise<TenantResource> {
    const res = await apiClient.put<ApiResponse<TenantResource>>(
      `/companies/${id}`,
      payload,
      groupHeader(groupId)
    );
    return res.data;
  },

  /** Delete a company (asincrona lato server) */
  async delete(id: string, groupId?: string | null): Promise<void> {
    // Header di gruppo solo se valorizzato: evita di inviare "X-Group-Id: undefined".
    await apiClient.delete(`/companies/${id}`, groupId ? groupHeader(groupId) : undefined);
  },
};

/**
 * Profilo anagrafico esteso (tabella company_profiles).
 *
 * Ragione sociale, codice fiscale, sedi, PEC e sostituto CISO non stanno su
 * `tenants` e non sono accettati da `PUT /companies/{id}`: hanno un endpoint
 * dedicato. Inviarli insieme agli altri campi li faceva scartare in silenzio.
 */
export const companyProfileApi = {
  /** Restituisce null quando il profilo non è ancora stato creato. */
  async get(companyId: string, groupId?: string | null): Promise<CompanyProfileResource | null> {
    const res = await apiClient.get<ApiResponse<CompanyProfileResource | null>>(
      `/companies/${companyId}/profile`,
      undefined,
      groupId ? groupHeader(groupId) : undefined
    );
    return res.data ?? null;
  },

  /** Upsert: il backend crea il profilo se non esiste. */
  async update(
    companyId: string,
    payload: UpdateCompanyProfileRequest,
    groupId?: string | null
  ): Promise<CompanyProfileResource> {
    const res = await apiClient.put<ApiResponse<CompanyProfileResource>>(
      `/companies/${companyId}/profile`,
      payload,
      groupId ? groupHeader(groupId) : undefined
    );
    return res.data;
  },
};

// Backward-compatible alias
export const tenantsApi = companiesApi;
