import { useQuery } from "@tanstack/react-query";
import { shodanApi } from "@/lib/api/shodan";
import { useClientOrganization } from "@/hooks/useClientOrganization";

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

interface ShodanScanResponse {
	assets: ShodanAsset[];
	errors: Array<{ target: string; error: string }>;
	scanned_at: string;
}

/**
 * Esegue scan Shodan per una lista di IP/hostname.
 * Restituisce assets parsati pronti per il rendering in SurfaceScan360.
 * Cache 10 min per evitare richieste duplicate (Shodan ha rate limit).
 */
export const useShodanScan = (targets: string[], enabled = true) => {
	const { organizationId, groupId } = useClientOrganization();

	return useQuery<ShodanScanResponse>({
		queryKey: ["shodan-scan", organizationId, groupId, ...[...targets].sort()],
		enabled: enabled && targets.length > 0 && !!organizationId,
		staleTime: 10 * 60 * 1000,
		queryFn: () => {
			if (!organizationId) throw new Error("organizationId mancante");
			return shodanApi.scan(organizationId, { targets }, groupId);
		},
	});
};
