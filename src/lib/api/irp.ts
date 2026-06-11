import { complianceApiClient } from "@/lib/api-client";
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

  // ─── IRP Emergency Contacts ────────────────────────────────────────────────

  /** List all emergency contacts for a company */
  async emergencyContacts(companyId: string, _g?: string | null): Promise<IrpEmergencyContactResource[]> {
    const res = await complianceApiClient.get<ApiResponse<IrpEmergencyContactResource[]>>(
      `/companies/${companyId}/irp/emergency-contacts`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Create an emergency contact */
  async createEmergencyContact(companyId: string, payload: StoreIrpEmergencyContactRequest, _g?: string | null): Promise<IrpEmergencyContactResource> {
    const res = await complianceApiClient.post<ApiResponse<IrpEmergencyContactResource>>(
      `/companies/${companyId}/irp/emergency-contacts`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Update an emergency contact */
  async updateEmergencyContact(companyId: string, contactId: string, payload: Partial<StoreIrpEmergencyContactRequest>, _g?: string | null): Promise<IrpEmergencyContactResource> {
    const res = await complianceApiClient.put<ApiResponse<IrpEmergencyContactResource>>(
      `/companies/${companyId}/irp/emergency-contacts/${contactId}`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Delete an emergency contact */
  async deleteEmergencyContact(companyId: string, contactId: string, _g?: string | null): Promise<void> {
    await complianceApiClient.delete(
      `/companies/${companyId}/irp/emergency-contacts/${contactId}`,
      _h(companyId, _g)
    );
  },

  // ─── IRP Document ────────────────────────────────────────────────────────

  /** Get the IRP document for a company */
  async document(companyId: string, _g?: string | null): Promise<Record<string, unknown> | null> {
    const res = await complianceApiClient.get<ApiResponse<Record<string, unknown> | null>>(
      `/companies/${companyId}/irp/document`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Save/update the IRP document for a company */
  async saveDocument(companyId: string, payload: Record<string, unknown>, _g?: string | null): Promise<Record<string, unknown>> {
    const res = await complianceApiClient.post<ApiResponse<Record<string, unknown>>>(
      `/companies/${companyId}/irp/document`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  // ─── IRP History ────────────────────────────────────────────────────────

  /** Get IRP document history for a company */
  async history(companyId: string, _g?: string | null): Promise<Record<string, unknown>[]> {
    const res = await complianceApiClient.get<ApiResponse<Record<string, unknown>[]>>(
      `/companies/${companyId}/irp/history`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Save a new IRP history entry (snapshot) */
  async saveHistory(companyId: string, payload: Record<string, unknown>, _g?: string | null): Promise<Record<string, unknown>> {
    const res = await complianceApiClient.post<ApiResponse<Record<string, unknown>>>(
      `/companies/${companyId}/irp/history`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
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
    // Open the signed URL directly in a new tab — the URL is pre-signed
    // and valid for 2 minutes, so the browser can fetch it without a Bearer token.
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      // Popup blocked — fall back to programmatic anchor download
      const a = document.createElement('a');
      a.href = url;
      a.download = `IRP_${companyName.replace(/\s+/g, '_')}.docx`;
      a.rel = 'noopener noreferrer';
      a.click();
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
