import { apiClient } from "@/lib/api-client";
import type {
	ApiResponse,
	RemediationTask,
	StoreRemediationTaskRequest,
	UpdateRemediationTaskRequest,
} from "@/types/api";

export const remediationTasksApi = {
	async list(companyId: string): Promise<RemediationTask[]> {
		const res = await apiClient.get<ApiResponse<RemediationTask[]>>(
			`/companies/${companyId}/remediation-tasks`,
		);
		return res.data;
	},

	async get(companyId: string, id: string): Promise<RemediationTask> {
		const res = await apiClient.get<ApiResponse<RemediationTask>>(
			`/companies/${companyId}/remediation-tasks/${id}`,
		);
		return res.data;
	},

	async create(
		companyId: string,
		payload: StoreRemediationTaskRequest,
	): Promise<RemediationTask> {
		const res = await apiClient.post<ApiResponse<RemediationTask>>(
			`/companies/${companyId}/remediation-tasks`,
			payload,
		);
		return res.data;
	},

	async update(
		companyId: string,
		id: string,
		payload: UpdateRemediationTaskRequest,
	): Promise<RemediationTask> {
		const res = await apiClient.put<ApiResponse<RemediationTask>>(
			`/companies/${companyId}/remediation-tasks/${id}`,
			payload,
		);
		return res.data;
	},

	async delete(companyId: string, id: string): Promise<void> {
		await apiClient.delete(`/companies/${companyId}/remediation-tasks/${id}`);
	},
};
