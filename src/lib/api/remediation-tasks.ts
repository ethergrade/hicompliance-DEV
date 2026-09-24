import { supabase } from "@/integrations/supabase/client";
import type {
	RemediationTask,
	StoreRemediationTaskRequest,
	UpdateRemediationTaskRequest,
} from "@/types/api";

type TaskRow = {
	id: string;
	organization_id: string | null;
	task: string;
	category: string;
	start_date: string;
	end_date: string;
	progress: number;
	assignee: string | null;
	priority: string;
	dependencies: string[] | null;
	color: string;
	created_at: string;
	updated_at: string;
	display_order: number | null;
	is_hidden: boolean | null;
	is_deleted: boolean | null;
	budget: number | null;
	source: string | null;
	source_ref: string | null;
};

const toTask = (row: TaskRow): RemediationTask => ({
	...row,
	tenant_id: row.organization_id ?? "",
	is_done: row.progress >= 100,
	is_hidden: row.is_hidden ?? false,
	is_deleted: row.is_deleted ?? false,
});

const dbPayload = (payload: UpdateRemediationTaskRequest) => {
	const { is_done, ...rest } = payload;
	return {
		...rest,
		...(typeof is_done === "boolean" ? { progress: is_done ? 100 : Math.min(Number(rest.progress ?? 0), 99) } : {}),
	};
};

async function readTask(companyId: string, id: string): Promise<RemediationTask> {
	const { data, error } = await supabase
		.from("remediation_tasks")
		.select("*")
		.eq("organization_id", companyId)
		.eq("id", id)
		.maybeSingle();
	if (error) throw error;
	if (!data) throw new Error("Task non trovato");
	return toTask(data as TaskRow);
}

export const remediationTasksApi = {
	async list(companyId: string, _groupId?: string | null): Promise<RemediationTask[]> {
		const { data, error } = await supabase
			.from("remediation_tasks")
			.select("*")
			.eq("organization_id", companyId)
			.order("display_order", { ascending: true })
			.order("created_at", { ascending: true });
		if (error) throw error;
		return (data ?? []).map((row) => toTask(row as TaskRow));
	},

	async get(companyId: string, id: string, _groupId?: string | null): Promise<RemediationTask> {
		return readTask(companyId, id);
	},

	async create(companyId: string, payload: StoreRemediationTaskRequest, _groupId?: string | null): Promise<RemediationTask> {
		const insertRow = {
			organization_id: companyId,
			task: payload.task,
			category: payload.category,
			start_date: payload.start_date,
			end_date: payload.end_date,
			...dbPayload(payload),
		};
		const { data, error } = await supabase
			.from("remediation_tasks")
			.insert(insertRow)
			.select("*")
			.single();
		if (error) throw error;
		return toTask(data as TaskRow);
	},

	async update(companyId: string, id: string, payload: UpdateRemediationTaskRequest, _groupId?: string | null): Promise<RemediationTask> {
		const { data, error } = await supabase
			.from("remediation_tasks")
			.update(dbPayload(payload))
			.eq("organization_id", companyId)
			.eq("id", id)
			.select("*")
			.maybeSingle();
		if (error) throw error;
		if (!data) throw new Error("Task non trovato");
		return toTask(data as TaskRow);
	},

	async updateProgress(companyId: string, id: string, progress: number, _groupId?: string | null): Promise<RemediationTask> {
		return this.update(companyId, id, { progress });
	},

	async updateDone(companyId: string, id: string, isDone: boolean, _groupId?: string | null): Promise<RemediationTask> {
		return this.update(companyId, id, { is_done: isDone });
	},

	async delete(companyId: string, id: string, _groupId?: string | null): Promise<void> {
		const { error } = await supabase
			.from("remediation_tasks")
			.update({ is_deleted: true })
			.eq("organization_id", companyId)
			.eq("id", id);
		if (error) throw error;
	},
};