import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  Group,
  IrpContactResource,
  IrpEmergencyContactResource,
  StoreIrpContactRequest,
  StoreIrpEmergencyContactRequest,
} from "@/types/api";

const groupHeader = (companyId: string) => ({
  headers: { "X-Group-Id": companyId },
});

export const irpApi = {
  // ─── IRP Contacts ──────────────────────────────────────────────────────────

  /** List all IRP contacts for a company */
  async contacts(companyId: string): Promise<IrpContactResource[]> {
    const res = await apiClient.get<ApiResponse<IrpContactResource[]>>(
      `/companies/${companyId}/irp/contacts`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Create an IRP contact */
  async createContact(companyId: string, payload: StoreIrpContactRequest): Promise<IrpContactResource> {
    const res = await apiClient.post<ApiResponse<IrpContactResource>>(
      `/companies/${companyId}/irp/contacts`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Update an IRP contact */
  async updateContact(companyId: string, contactId: string, payload: Partial<StoreIrpContactRequest>): Promise<IrpContactResource> {
    const res = await apiClient.put<ApiResponse<IrpContactResource>>(
      `/companies/${companyId}/irp/contacts/${contactId}`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Delete an IRP contact */
  async deleteContact(companyId: string, contactId: string): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/irp/contacts/${contactId}`,
      groupHeader(companyId)
    );
  },

  // ─── IRP Emergency Contacts ────────────────────────────────────────────────

  /** List all emergency contacts for a company */
  async emergencyContacts(companyId: string): Promise<IrpEmergencyContactResource[]> {
    const res = await apiClient.get<ApiResponse<IrpEmergencyContactResource[]>>(
      `/companies/${companyId}/irp/emergency-contacts`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Create an emergency contact */
  async createEmergencyContact(companyId: string, payload: StoreIrpEmergencyContactRequest): Promise<IrpEmergencyContactResource> {
    const res = await apiClient.post<ApiResponse<IrpEmergencyContactResource>>(
      `/companies/${companyId}/irp/emergency-contacts`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Update an emergency contact */
  async updateEmergencyContact(companyId: string, contactId: string, payload: Partial<StoreIrpEmergencyContactRequest>): Promise<IrpEmergencyContactResource> {
    const res = await apiClient.put<ApiResponse<IrpEmergencyContactResource>>(
      `/companies/${companyId}/irp/emergency-contacts/${contactId}`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Delete an emergency contact */
  async deleteEmergencyContact(companyId: string, contactId: string): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/irp/emergency-contacts/${contactId}`,
      groupHeader(companyId)
    );
  },

  // ─── IRP Document ────────────────────────────────────────────────────────

  /** Get the IRP document for a company */
  async document(companyId: string): Promise<Record<string, unknown> | null> {
    const res = await apiClient.get<ApiResponse<Record<string, unknown> | null>>(
      `/companies/${companyId}/irp/document`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Save/update the IRP document for a company */
  async saveDocument(companyId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(
      `/companies/${companyId}/irp/document`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  // ─── IRP History ────────────────────────────────────────────────────────

  /** Get IRP document history for a company */
  async history(companyId: string): Promise<Record<string, unknown>[]> {
    const res = await apiClient.get<ApiResponse<Record<string, unknown>[]>>(
      `/companies/${companyId}/irp/history`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  // ─── IRP Document Publish ────────────────────────────────────────────────

  /** Publish the IRP document for a company */
  async publishDocument(companyId: string): Promise<Record<string, unknown>> {
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(
      `/companies/${companyId}/irp/document/publish`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  // ─── Import Emergency Contacts from Directory ─────────────────────────────

  /** Import emergency contacts from the directory */
  async importEmergencyContactsFromDirectory(companyId: string): Promise<IrpEmergencyContactResource[]> {
    const res = await apiClient.post<ApiResponse<IrpEmergencyContactResource[]>>(
      `/companies/${companyId}/irp/emergency-contacts/import-from-directory`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** List all groups */
  async groups(): Promise<Group[]> {
    const res = await apiClient.get<ApiResponse<Group[]>>("/groups");
    return res.data;
  },

  /** Get a single group by ID */
  async group(groupId: string): Promise<Group> {
    const res = await apiClient.get<ApiResponse<Group>>(`/groups/${groupId}`);
    return res.data;
  },
};
