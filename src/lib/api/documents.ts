import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  DocumentResource,
  StoreDocumentRequest,
  UpdateDocumentRequest,
} from "@/types/api";

const groupHeader = (companyId: string) => ({
  headers: { "X-Group-Id": companyId },
});

export const documentsApi = {
  /** List all documents for a company */
  async list(companyId: string): Promise<DocumentResource[]> {
    const res = await apiClient.get<ApiResponse<DocumentResource[]>>(
      `/companies/${companyId}/documents`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Get a single document by ID */
  async get(companyId: string, documentId: string): Promise<DocumentResource> {
    const res = await apiClient.get<ApiResponse<DocumentResource>>(
      `/companies/${companyId}/documents/${documentId}`,
      undefined,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Create a new document */
  async create(companyId: string, payload: StoreDocumentRequest): Promise<DocumentResource> {
    const res = await apiClient.post<ApiResponse<DocumentResource>>(
      `/companies/${companyId}/documents`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Update document metadata */
  async update(companyId: string, documentId: string, payload: UpdateDocumentRequest): Promise<DocumentResource> {
    const res = await apiClient.put<ApiResponse<DocumentResource>>(
      `/companies/${companyId}/documents/${documentId}`,
      payload,
      groupHeader(companyId)
    );
    return res.data;
  },

  /** Delete a document */
  async delete(companyId: string, documentId: string): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/documents/${documentId}`,
      groupHeader(companyId)
    );
  },
};
