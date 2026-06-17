import { complianceApiClient } from "@/lib/api-client";

const groupHeader = (groupId: string) => ({
	headers: { "X-Group-Id": groupId },
});

export interface SubdomainResult {
	subdomain: string;
	ip: string | null;
	asn: number | null;
	asn_name: string | null;
	cidr: string | null;
	country: string | null;
	source: string[];
}

export interface SubdomainDump {
	id: string;
	organization_id: string;
	root_domain: string;
	depth_limit: number;
	total_discovered: number;
	total_returned: number;
	truncated: boolean;
	sources: string[];
	results: SubdomainResult[];
	triggered_by: string;
	created_at: string;
}

function unwrap<T>(res: { success?: boolean; data?: T } | T[]): T[] {
	if (Array.isArray(res)) return res;
	const r = res as { data?: T };
	if (r && typeof r === "object" && "data" in r && r.data)
		return (r.data as unknown as T[]) ?? [];
	return [];
}

function unwrapOne<T>(res: { success?: boolean; data?: T } | T): T | null {
	if (res && typeof res === "object" && "data" in res) {
		return (res as { data?: T }).data ?? null;
	}
	return res as T;
}

export const subdomainDumpApi = {
	/**
	 * Esegue un subdomain dump per un dato root_domain.
	 * Backend: POST /companies/{companyId}/subdomain-dump
	 */
	async store(
		companyId: string,
		body: { root_domain: string; depth_limit?: number; triggered_by?: string },
		groupId?: string | null,
	): Promise<SubdomainDump | null> {
		const res = await complianceApiClient.post<{
			success: boolean;
			data: SubdomainDump;
		}>(
			`/companies/${companyId}/subdomain-dump`,
			body,
			groupId ? groupHeader(groupId) : undefined,
		);
		return unwrapOne(res.data);
	},

	/**
	 * Recupera la history dei subdomain dump per la company.
	 * Backend: GET /companies/{companyId}/subdomain-dump/history
	 */
	async history(
		companyId: string,
		groupId?: string | null,
	): Promise<SubdomainDump[]> {
		const res = await complianceApiClient.get<{
			success: boolean;
			data: SubdomainDump[];
		}>(
			`/companies/${companyId}/subdomain-dump/history`,
			undefined,
			groupId ? groupHeader(groupId) : undefined,
		);
		return unwrap(res.data);
	},
};
