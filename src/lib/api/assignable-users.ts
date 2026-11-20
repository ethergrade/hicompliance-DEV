import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

export interface AssignableUser {
	id: string;
	name: string;
	email: string | null;
}

/** Utenti attivi dell'azienda tra cui scegliere l'assegnatario di un'azione. */
export async function getAssignableUsers(companyId: string, groupId?: string | null): Promise<AssignableUser[]> {
	const res = await complianceApiClient.get<ApiResponse<AssignableUser[]>>(
		`/companies/${companyId}/assignable-users`,
		undefined,
		groupId ? { headers: { "X-Group-Id": groupId } } : undefined,
	);
	return Array.isArray(res.data) ? res.data : [];
}
