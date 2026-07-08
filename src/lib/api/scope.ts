import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

const groupHeader = (groupId: string) => ({
	headers: { "X-Group-Id": groupId },
});

/** Estrae array da risposta API (gestisce array semplice e {data:[]}). */
const extractArray = <T>(data: unknown): T[] => {
	if (Array.isArray(data)) return data;
	if (
		data &&
		typeof data === "object" &&
		"data" in data &&
		Array.isArray((data as { data?: T[] }).data)
	)
		return (data as { data: T[] }).data;
	return [];
};

export type ScopeEntryKind = "domain" | "single" | "range";
export type ScopeEntryOrigin = "anagrafica" | "manual" | "import" | "manual_target";

export interface ScopeEntry {
	id: string;
	kind: ScopeEntryKind;
	input_value: string;
	normalized_value: string;
	ip_start: string;
	ip_end: string;
	origin: ScopeEntryOrigin;
	label: string | null;
	enabled: boolean;
	created_at: string | null;
}

export const scopeApi = {
	async list(companyId: string, groupId?: string | null): Promise<ScopeEntry[]> {
		const res = await complianceApiClient.get<ApiResponse<ScopeEntry[]>>(
			`/companies/${companyId}/scope`,
			undefined,
			groupId ? groupHeader(groupId) : undefined,
		);
		return extractArray<ScopeEntry>(res.data);
	},

	async add(
		companyId: string,
		payload: { input_value: string; label?: string },
		groupId?: string | null,
	): Promise<ScopeEntry> {
		const res = await complianceApiClient.post<ApiResponse<ScopeEntry>>(
			`/companies/${companyId}/scope`,
			payload,
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},

	async remove(
		companyId: string,
		entryId: string,
		groupId?: string | null,
	): Promise<void> {
		await complianceApiClient.delete(
			`/companies/${companyId}/scope/${entryId}`,
			groupId ? groupHeader(groupId) : undefined,
		);
	},

	async toggle(
		companyId: string,
		entryId: string,
		groupId?: string | null,
	): Promise<ScopeEntry> {
		const res = await complianceApiClient.patch<ApiResponse<ScopeEntry>>(
			`/companies/${companyId}/scope/${entryId}/toggle`,
			{},
			groupId ? groupHeader(groupId) : undefined,
		);
		return res.data;
	},
};
