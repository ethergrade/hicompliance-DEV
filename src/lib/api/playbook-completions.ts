import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  PlaybookCompletion,
  StorePlaybookCompletionRequest,
  UpdatePlaybookCompletionRequest,
} from "@/types/api";

const _h = (companyId: string, groupId?: string | null) => ({
  headers: { "X-Group-Id": groupId || companyId },
});

export const playbookCompletionsApi = {
  async list(companyId: string, _g?: string | null): Promise<PlaybookCompletion[]> {
    const res = await apiClient.get<ApiResponse<PlaybookCompletion[]>>(
      `/companies/${companyId}/playbook-completions`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  async get(companyId: string, id: string, _g?: string | null): Promise<PlaybookCompletion> {
    const res = await apiClient.get<ApiResponse<PlaybookCompletion>>(
      `/companies/${companyId}/playbook-completions/${id}`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  async create(companyId: string, payload: StorePlaybookCompletionRequest, _g?: string | null): Promise<PlaybookCompletion> {
    const res = await apiClient.post<ApiResponse<PlaybookCompletion>>(
      `/companies/${companyId}/playbook-completions`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  async update(companyId: string, id: string, payload: UpdatePlaybookCompletionRequest, _g?: string | null): Promise<PlaybookCompletion> {
    const res = await apiClient.put<ApiResponse<PlaybookCompletion>>(
      `/companies/${companyId}/playbook-completions/${id}`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  async delete(companyId: string, id: string, _g?: string | null): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/playbook-completions/${id}`,
      _h(companyId, _g)
    );
  },
};
