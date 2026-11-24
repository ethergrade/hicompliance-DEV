import { supabase } from "@/integrations/supabase/client";
import type { CommercialStatus, SalesRow } from "@/lib/salesManager/value";

const sb = supabase as any;

export const salesManagerApi = {
	async listRows(orgIds?: string[]): Promise<SalesRow[]> {
		let q = sb.from("remediation_tasks").select("id,organization_id,task,category,priority,progress,budget,updated_at")
			.or("is_deleted.is.null,is_deleted.eq.false").not("organization_id", "is", null);
		if (orgIds?.length) q = q.in("organization_id", orgIds);
		const { data: tasks, error } = await q.limit(5000);
		if (error) throw error;
		const { data: com, error: e2 } = await sb.from("remediation_commercial").select("*").limit(5000);
		if (e2) throw e2;
		const map = new Map<string, any>((com ?? []).map((c: any) => [c.task_id, c]));
		return (tasks ?? []).map((t: any) => {
			const c = map.get(t.id);
			return {
				taskId: t.id, organizationId: t.organization_id, task: t.task, category: t.category, priority: t.priority,
				progress: t.progress ?? 0, budget: t.budget, proposedValue: c?.proposed_value ?? null,
				status: (c?.status ?? "proposto") as CommercialStatus, notes: c?.notes ?? null,
				proposedAt: c?.proposed_at ?? null, closedAt: c?.closed_at ?? null,
				updatedAt: c?.updated_at && c.updated_at > t.updated_at ? c.updated_at : t.updated_at,
			};
		});
	},
	async save(row: { taskId: string; organizationId: string }, patch: Partial<{ status: CommercialStatus; proposed_value: number | null; notes: string | null; proposed_at: string | null; closed_at: string | null }>) {
		const { data: u } = await supabase.auth.getUser();
		const { error } = await sb.from("remediation_commercial").upsert(
			{ task_id: row.taskId, organization_id: row.organizationId, ...patch, updated_by: u.user?.id ?? null },
			{ onConflict: "task_id" },
		);
		if (error) throw error;
	},
};
