import { apiClient, getToken } from "@/lib/api-client";
import type {
  ApiResponse,
  DocumentResource,
  StoreDocumentRequest,
  UpdateDocumentRequest,
} from "@/types/api";

const API_BASE_URL = import.meta.env.DEV
  ? "/api"
  : (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "https://hiconsole.hisolution.it/api";

const _h = (companyId: string, groupId?: string | null) => ({
  headers: { "X-Group-Id": groupId || companyId },
});

async function uploadMultipart(companyId: string, path: string, formData: FormData, _g?: string | null): Promise<DocumentResource> {
  const token = getToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Group-Id": companyId,
    },
    body: formData,
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(json.message || `Upload failed with status ${res.status}`);
  }

  const json = await res.json();
  return json.data as DocumentResource;
}

export const documentsApi = {
  /** List all documents for a company */
  async list(companyId: string, _g?: string | null): Promise<DocumentResource[]> {
    const res = await apiClient.get<ApiResponse<DocumentResource[]>>(
      `/companies/${companyId}/documents`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Get a single document by ID */
  async get(companyId: string, documentId: string, _g?: string | null): Promise<DocumentResource> {
    const res = await apiClient.get<ApiResponse<DocumentResource>>(
      `/companies/${companyId}/documents/${documentId}`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Create a new document (JSON metadata only, no file) */
  async create(companyId: string, payload: StoreDocumentRequest, _g?: string | null): Promise<DocumentResource> {
    const res = await apiClient.post<ApiResponse<DocumentResource>>(
      `/companies/${companyId}/documents`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Create a new document with file upload (multipart/form-data) */
  async createWithFile(
    companyId: string,
    file: Blob,
    fileName: string,
    metadata: Partial<StoreDocumentRequest> = {}
  ): Promise<DocumentResource> {
    const formData = new FormData();
    formData.append("file", file, fileName);

    for (const [key, value] of Object.entries(metadata)) {
      if (value === undefined || value === null) continue;
      if (key === "tags" && Array.isArray(value)) {
        value.forEach((tag: string) => formData.append("tags[]", tag));
      } else {
        formData.append(key, String(value));
      }
    }

    return uploadMultipart(companyId, `/companies/${companyId}/documents`, formData);
  },

  /** Update document metadata */
  async update(companyId: string, documentId: string, payload: UpdateDocumentRequest, _g?: string | null): Promise<DocumentResource> {
    const res = await apiClient.put<ApiResponse<DocumentResource>>(
      `/companies/${companyId}/documents/${documentId}`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Delete a document */
  async delete(companyId: string, documentId: string, _g?: string | null): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/documents/${documentId}`,
      _h(companyId, _g)
    );
  },

  /** Get download URL or binary for a document */
  async download(companyId: string, documentId: string, _g?: string | null): Promise<Blob> {
    const res = await apiClient.get<Blob>(
      `/companies/${companyId}/documents/${documentId}/download`,
      undefined,
      _h(companyId, _g)
    );
    return res;
  },
};
