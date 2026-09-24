// Prototipo: i servizi del cliente sono salvati nel database Supabase
// (tabella tenant_services) invece che sul server Laravel.
import { supabase } from "@/integrations/supabase/client";
import { FALLBACK_SERVICE_CATALOG } from "@/data/serviceCatalog";
import type {
  TenantServiceResource,
  StoreTenantServiceRequest,
  UpdateTenantServiceRequest,
  ServiceCatalog,
} from "@/types/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("tenant_services");

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export const tenantServicesApi = {
  async list(status?: "active" | "inactive", _groupId?: string | null): Promise<TenantServiceResource[]> {
    let q = table().select("*").order("created_at");
    if (status) q = q.eq("status", status);
    return unwrap(await q) ?? [];
  },

  async listByOrganization(organizationId: string, _groupId?: string | null): Promise<TenantServiceResource[]> {
    return unwrap(await table().select("*").eq("tenant_id", organizationId).order("created_at")) ?? [];
  },

  async get(id: string, _groupId?: string | null): Promise<TenantServiceResource> {
    return unwrap(await table().select("*").eq("id", id).single());
  },

  async create(payload: StoreTenantServiceRequest, _groupId?: string | null): Promise<TenantServiceResource> {
    if (!payload.tenant_id) throw new Error("Nessuna azienda selezionata");
    return unwrap(
      await table()
        .insert({
          tenant_id: payload.tenant_id,
          site_id: payload.site_id ?? null,
          service_type: payload.service_type,
          status: payload.status ?? "active",
          settings: payload.settings ?? null,
          updated_by: await currentUserId(),
        })
        .select()
        .single(),
    );
  },

  async update(id: string, payload: UpdateTenantServiceRequest, _groupId?: string | null): Promise<TenantServiceResource> {
    return unwrap(
      await table()
        .update({ ...payload, updated_by: await currentUserId() })
        .eq("id", id)
        .select()
        .single(),
    );
  },

  async patch(id: string, payload: Partial<UpdateTenantServiceRequest>, groupId?: string | null): Promise<TenantServiceResource> {
    return tenantServicesApi.update(id, payload, groupId);
  },

  async delete(id: string, _groupId?: string | null): Promise<void> {
    unwrap(await table().delete().eq("id", id));
  },

  async catalog(): Promise<ServiceCatalog> {
    return FALLBACK_SERVICE_CATALOG as unknown as ServiceCatalog;
  },
};
