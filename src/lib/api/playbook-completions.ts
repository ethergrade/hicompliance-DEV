import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  PlaybookCompletion,
  StorePlaybookCompletionRequest,
  UpdatePlaybookCompletionRequest,
} from "@/types/api";

export const playbookCompletionsApi = {
  async list(companyId: string): Promise<PlaybookCompletion[]> {
    const res = await apiClient.get<ApiResponse<PlaybookCompletion[]>>(
      `/companies/${companyId}/playbook-completions`
    );
    return res.data;
  },

  async get(companyId: string, id: string): Promise<PlaybookCompletion> {
    const res = await apiClient.get<ApiResponse<PlaybookCompletion>>(
      `/companies/${companyId}/playbook-completions/${id}`
    );
    return res.data;
  },

  async create(companyId: string, payload: StorePlaybookCompletionRequest): Promise<PlaybookCompletion> {
    const res = await apiClient.post<ApiResponse<PlaybookCompletion>>(
      `/companies/${companyId}/playbook-completions`,
      payload
    );
    return res.data;
  },

  async update(companyId: string, id: string, payload: UpdatePlaybookCompletionRequest): Promise<PlaybookCompletion> {
    const res = await apiClient.put<ApiResponse<PlaybookCompletion>>(
      `/companies/${companyId}/playbook-completions/${id}`,
      payload
    );
    return res.data;
  },

  async delete(companyId: string, id: string): Promise<void> {
    await apiClient.delete(`/companies/${companyId}/playbook-completions/${id}`);
  },
};
