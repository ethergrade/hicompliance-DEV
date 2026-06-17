import { apiClient } from "@/lib/api-client";
import type {
	ApiResponse,
	RemediationTask,
	StoreRemediationTaskRequest,
	UpdateRemediationTaskRequest,
} from "@/types/api";

const _h = (groupId?: string | null) =>
	groupId ? { headers: { "X-Group-Id": groupId } } : undefined;

export const remediationTasksApi = {
	async list(companyId: string, groupId?: string | null): Promise<RemediationTask[]> {
		const res = await apiClient.get<ApiResponse<RemediationTask[]>>(
			`/companies/${companyId}/remediation-tasks`,
			undefined,
			_h(groupId),
		);
		return res.data;
	},

	async get(companyId: string, id: string, groupId?: string | null): Promise<RemediationTask> {
		const res = await apiClient.get<ApiResponse<RemediationTask>>(
			`/companies/${companyId}/remediation-tasks/${id}`,
			undefined,
			_h(groupId),
		);
		return res.data;
	},

	async create(
		companyId: string,
		payload: StoreRemediationTaskRequest,
		groupId?: string | null,
	): Promise<RemediationTask> {
		const res = await apiClient.post<ApiResponse<RemediationTask>>(
			`/companies/${companyId}/remediation-tasks`,
			payload,
			_h(groupId),
		);
		return res.data;
	},

	async update(
		companyId: string,
		id: string,
		payload: UpdateRemediationTaskRequest,
		groupId?: string | null,
	): Promise<RemediationTask> {
		const res = await apiClient.put<ApiResponse<RemediationTask>>(
			`/companies/${companyId}/remediation-tasks/${id}`,
			payload,
			_h(groupId),
		);
		return res.data;
	},

	async updateProgress(companyId: string, id: string, progress: number, groupId?: string | null): Promise<RemediationTask> {
		const res = await apiClient.patch<ApiResponse<RemediationTask>>(
			`/companies/${companyId}/remediation-tasks/${id}/progress`,
			{ progress },
			_h(groupId),
		);
		return res.data;
	},

	async delete(companyId: string, id: string, groupId?: string | null): Promise<void> {
		await apiClient.delete(
			`/companies/${companyId}/remediation-tasks/${id}`,
			_h(groupId),
		);
	},
};
