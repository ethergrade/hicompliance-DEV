import { apiClient as complianceApiClient } from "@/lib/api-client";
import { supabase } from "@/integrations/supabase/client";
const sb = supabase as any;
const ec = (r: any) => ({ ...r, tenant_id: r.organization_id, group_id: r.organization_id });
const uid = async () => (await supabase.auth.getUser()).data.user?.id;
import type {
  ApiResponse,
  Group,
  IrpContactResource,
  IrpEmergencyContactResource,
  StoreIrpContactRequest,
  StoreIrpEmergencyContactRequest,
} from "@/types/api";

const _h = (companyId: string, groupId?: string | null) => ({
  headers: { "X-Group-Id": groupId || companyId },
});

export const irpApi = {
  // ─── IRP Contacts ──────────────────────────────────────────────────────────

  /** List all IRP contacts for a company */
  async contacts(companyId: string, _g?: string | null): Promise<IrpContactResource[]> {
    const res = await complianceApiClient.get<ApiResponse<IrpContactResource[]>>(
      `/companies/${companyId}/irp/contacts`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Create an IRP contact */
  async createContact(companyId: string, payload: StoreIrpContactRequest, _g?: string | null): Promise<IrpContactResource> {
    const res = await complianceApiClient.post<ApiResponse<IrpContactResource>>(
      `/companies/${companyId}/irp/contacts`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Update an IRP contact */
  async updateContact(companyId: string, contactId: string, payload: Partial<StoreIrpContactRequest>, _g?: string | null): Promise<IrpContactResource> {
    const res = await complianceApiClient.put<ApiResponse<IrpContactResource>>(
      `/companies/${companyId}/irp/contacts/${contactId}`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Delete an IRP contact */
  async deleteContact(companyId: string, contactId: string, _g?: string | null): Promise<void> {
    await complianceApiClient.delete(
      `/companies/${companyId}/irp/contacts/${contactId}`,
      _h(companyId, _g)
    );
  },

  /**
   * Invite a contact to the platform — creates a User account, adds them to the
   * tenant's group with role 'customer', and sends a password-reset email.
   * Backend: POST /companies/{company}/irp/contacts/{contact}/invite
   */
  async inviteContact(companyId: string, contactId: string, _g?: string | null): Promise<IrpContactResource> {
    const res = await complianceApiClient.post<ApiResponse<IrpContactResource>>(
      `/companies/${companyId}/irp/contacts/${contactId}/invite`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  // ─── IRP Emergency Contacts (Supabase) ─────────────────────────────────────
  async emergencyContacts(companyId: string, _g?: string | null): Promise<IrpEmergencyContactResource[]> {
    const { data, error } = await sb.from("emergency_contacts").select("*").eq("organization_id", companyId).order("created_at");
    if (error) throw error;
    return (data ?? []).map(ec);
  },
  async createEmergencyContact(companyId: string, payload: StoreIrpEmergencyContactRequest, _g?: string | null): Promise<IrpEmergencyContactResource> {
    const { data, error } = await sb.from("emergency_contacts").insert({ role: "", category: "interno", ...payload, organization_id: companyId }).select("*").single();
    if (error) throw error;
    return ec(data);
  },
  async updateEmergencyContact(companyId: string, contactId: string, payload: Partial<StoreIrpEmergencyContactRequest>, _g?: string | null): Promise<IrpEmergencyContactResource> {
    const { data, error } = await sb.from("emergency_contacts").update(payload).eq("id", contactId).eq("organization_id", companyId).select("*").single();
    if (error) throw error;
    return ec(data);
  },
  async deleteEmergencyContact(companyId: string, contactId: string, _g?: string | null): Promise<void> {
    const { error } = await sb.from("emergency_contacts").delete().eq("id", contactId).eq("organization_id", companyId);
    if (error) throw error;
  },

  // ─── IRP Document (Supabase) ──────────────────────────────────────────────
  async document(companyId: string, _g?: string | null): Promise<Record<string, unknown> | null> {
    const { data, error } = await sb.from("irp_documents").select("document_data").eq("organization_id", companyId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data?.document_data ?? null;
  },
  async saveDocument(companyId: string, payload: Record<string, unknown>, _g?: string | null): Promise<Record<string, unknown>> {
    const { data: existing } = await sb.from("irp_documents").select("id").eq("organization_id", companyId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const q = existing
      ? sb.from("irp_documents").update({ document_data: payload }).eq("id", existing.id)
      : sb.from("irp_documents").insert({ organization_id: companyId, user_id: await uid(), document_data: payload });
    const { data, error } = await q.select("*").single();
    if (error) throw error;
    return data;
  },

  // ─── IRP History (Supabase) ───────────────────────────────────────────────
  async history(companyId: string, _g?: string | null): Promise<Record<string, unknown>[]> {
    const { data, error } = await sb.from("irp_history").select("*").eq("organization_id", companyId).order("snapshot_date", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
  async saveHistory(companyId: string, payload: Record<string, unknown>, _g?: string | null): Promise<Record<string, unknown>> {
    const { data, error } = await sb.from("irp_history").insert({ irp_score: payload.irp_score, area_scores_json: payload.area_scores_json ?? payload.area_scores, organization_id: companyId }).select("*").single();
    if (error) throw error;
    return data;
  },

  // ─── IRP Document Publish ────────────────────────────────────────────────

  /** Publish the IRP document for a company */
  async publishDocument(companyId: string, _g?: string | null): Promise<Record<string, unknown>> {
    const res = await complianceApiClient.post<ApiResponse<Record<string, unknown>>>(
      `/companies/${companyId}/irp/document/publish`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  // ─── IRP Document Export ─────────────────────────────────────────────────

  /** Request a signed download URL for the IRP DOCX, then trigger download */
  async exportDocument(companyId: string, companyName: string, _g?: string | null): Promise<void> {
    const res = await complianceApiClient.get<{ success: boolean; download_url: string; expires_in: number }>(
      `/companies/${companyId}/irp/export`,
      undefined,
      _h(companyId, _g)
    );
    const url = res.download_url;
    if (!url) throw new Error('Nessun link di download ricevuto dal server');

    // La URL firmata è MONOUSO: il backend cancella il file appena l'ha servito
    // (deleteFileAfterSend). Aprirla con window.open faceva navigare una scheda
    // nuova che, completato il download, ripeteva la richiesta e trovava il file
    // già rimosso — da cui il 404 mostrato all'utente.
    //
    // Si scarica quindi con una sola richiesta, costruendo il file in memoria:
    // nessuna scheda aperta e nessun secondo accesso alla URL.
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download non riuscito (HTTP ${response.status})`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `IRP_${companyName.replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      // Rilascio differito: revocarlo subito annullerebbe il download in corso.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
  },

  // ─── Import Emergency Contacts from Directory ─────────────────────────────

  /** Import emergency contacts from the directory */
  async importEmergencyContactsFromDirectory(companyId: string, _g?: string | null): Promise<IrpEmergencyContactResource[]> {
    const res = await complianceApiClient.post<ApiResponse<IrpEmergencyContactResource[]>>(
      `/companies/${companyId}/irp/emergency-contacts/import-from-directory`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** List all groups */
  async groups(_companyId?: string): Promise<Group[]> {
    const res = await complianceApiClient.get<ApiResponse<Group[]>>("/groups");
    return res.data;
  },

  /** Get a single group by ID */
  async group(groupId: string, _g?: string | null): Promise<Group> {
    const res = await complianceApiClient.get<ApiResponse<Group>>(`/groups/${groupId}`);
    return res.data;
  },
};
