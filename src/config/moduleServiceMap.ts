/**
 * Regola unica pagina → servizio richiesto (service_type in tenant_services).
 * `null` / assente = modulo generale, sempre visibile.
 */
export const MODULE_SERVICE_MAP: Array<{ prefix: string; service: string }> = [
	{ prefix: "/assessment", service: "hicompliance" },
	{ prefix: "/analytics", service: "hicompliance" },
	{ prefix: "/remediation", service: "hicompliance" },
	{ prefix: "/compliance-events", service: "hicompliance" },
	{ prefix: "/incident-response", service: "hicompliance" },
	{ prefix: "/supply-chain", service: "hicompliance" },
	{ prefix: "/business-impact-analysis", service: "hicompliance" },
	{ prefix: "/surface-scan", service: "surfacescan" },
	{ prefix: "/dark-risk-esteso", service: "darkrisk" },
	{ prefix: "/dark-risk", service: "darkrisk" },
	{ prefix: "/asset-management", service: "assetmanagement" },
	{ prefix: "/dashboard/service/hitrack", service: "hitrack" },
	{ prefix: "/dashboard/service/hipatch", service: "hipatch" },
	{ prefix: "/dashboard/service/hiendpoint", service: "hiendpoint" },
	{ prefix: "/dashboard/service/hifirewall", service: "hifirewall" },
	{ prefix: "/dashboard/service/hidetect", service: "hidetect" },
	{ prefix: "/dashboard/service/himail", service: "himail" },
	{ prefix: "/dashboard/service/himobile", service: "himobile" },
	{ prefix: "/dashboard/service/hilog", service: "hilog" },
];

export function getRequiredService(path: string): string | null {
	const hit = MODULE_SERVICE_MAP.find(
		(m) => path === m.prefix || path.startsWith(`${m.prefix}/`),
	);
	return hit?.service ?? null;
}
