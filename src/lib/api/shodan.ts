import { complianceApiClient } from "@/lib/api-client";

const groupHeader = (groupId: string) => ({
	headers: { "X-Group-Id": groupId },
});

export interface ShodanAsset {
	ip: string;
	hostname: string;
	ports: number[];
	services: string[];
	score: number;
	risk: "Basso" | "Medio" | "Alto";
	status: "Sicuro" | "Attenzione" | "Critico";
	cves: Array<{
		id: string;
		severity: "low" | "medium" | "high";
		description: string;
	}>;
	banners?: Array<{
		port: number;
		transport?: string;
		product?: string;
		module?: string;
		version?: string;
	}>;
	org?: string;
	os?: string;
	country?: string;
	last_update?: string;
	raw_service_count: number;
}

export interface ShodanScanResponse {
	assets: ShodanAsset[];
	errors: Array<{ target: string; error: string }>;
	scanned_at: string;
	truncated?: boolean;
	rule_id?: string;
}

function isWrappedShodanResponse(
	value: unknown,
): value is { data: ShodanScanResponse } {
	return (
		!!value &&
		typeof value === "object" &&
		"data" in value &&
		!!(value as Record<string, unknown>).data
	);
}

export const shodanApi = {
	async scan(
		companyId: string,
		body: {
			targets?: string[];
			rule?: {
				entry_type: string;
				input_value: string;
				ip_start?: string;
				ip_end?: string;
			};
		},
		groupId?: string | null,
	): Promise<ShodanScanResponse> {
		const res = await complianceApiClient.post<unknown>(
			`/companies/${companyId}/shodan/scan`,
			body,
			groupId ? groupHeader(groupId) : undefined,
		);
		const raw = (res as { data?: unknown })?.data;
		if (isWrappedShodanResponse(raw)) {
			return raw.data;
		}
		return raw as ShodanScanResponse;
	},
};
