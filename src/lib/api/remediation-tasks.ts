import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  RemediationTask,
  StoreRemediationTaskRequest,
  UpdateRemediationTaskRequest,
} from "@/types/api";

const _h = (companyId: string, groupId?: string | null) => ({
  headers: { "X-Group-Id": groupId || companyId },
});

export const remediationTasksApi = { 
  async list(companyId: string, _g?: string | null): Promise<RemediationTask[]> {
    const res = await apiClient.get<ApiResponse<RemediationTask[]>>(
      `/companies/${companyId}/remediation-tasks`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  async get(companyId: string, id: string, _g?: string | null): Promise<RemediationTask> {
    const res = await apiClient.get<ApiResponse<RemediationTask>>(
      `/companies/${companyId}/remediation-tasks/${id}`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  async create(companyId: string, payload: StoreRemediationTaskRequest, _g?: string | null): Promise<RemediationTask> {
    const res = await apiClient.post<ApiResponse<RemediationTask>>(
      `/companies/${companyId}/remediation-tasks`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  async update(companyId: string, id: string, payload: UpdateRemediationTaskRequest, _g?: string | null): Promise<RemediationTask> {
    const res = await apiClient.put<ApiResponse<RemediationTask>>(
      `/companies/${companyId}/remediation-tasks/${id}`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  async delete(companyId: string, id: string, _g?: string | null): Promise<void> {
    await apiClient.delete(
      `/companies/${companyId}/remediation-tasks/${id}`,
      _h(companyId, _g)
    );
  },
};
