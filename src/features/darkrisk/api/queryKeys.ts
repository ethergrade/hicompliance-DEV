export const darkRiskQueryKeys = {
	root: (companyId: string | null) => ["darkrisk-v2", companyId] as const,
	scope: (companyId: string | null) => [...darkRiskQueryKeys.root(companyId), "scope"] as const,
	overview: (companyId: string | null) => [...darkRiskQueryKeys.root(companyId), "standard-overview"] as const,
	reports: (companyId: string | null, mode: "standard" | "extended") =>
		[...darkRiskQueryKeys.root(companyId), "reports", mode] as const,
	extendedResult: (companyId: string | null, runId: string | null) =>
		[...darkRiskQueryKeys.root(companyId), "extended-result", runId] as const,
};
