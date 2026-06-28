export const DARKRISK_SCOPE_LIMIT = 4;

export type DarkRiskScopeType = "domain" | "ip";

export interface DarkRiskScopeTarget {
	id: string;
	type: DarkRiskScopeType;
	value: string;
	enabled: boolean;
}

export interface DarkRiskScope {
	targets: DarkRiskScopeTarget[];
}

export type DarkRiskRunStatus =
	| "queued"
	| "running"
	| "completed"
	| "partial"
	| "failed";

export interface DarkRiskRun {
	id: string;
	status: DarkRiskRunStatus;
	mode: "standard" | "extended";
	startedAt: string | null;
	completedAt: string | null;
}

export interface StandardOverview {
	totalLeaks: number;
	isMinimum: boolean;
	newLeaks: number;
	riskScore: number;
	riskLevel: string;
	lastScanAt: string | null;
	monitoredTargets: number;
	weeklyTrend: Array<{ period: string; total: number; newLeaks: number }>;
}

export interface DarkRiskReport {
	id: string;
	mode: "standard" | "extended";
	period: string | null;
	status: string;
	createdAt: string | null;
	downloadUrl: string | null;
	runId: string | null;
}

export interface ExtendedLeakRecord {
	id: string;
	selector: string;
	user: string;
	password: string;
	passwordType: string;
	bucket: "leaks.private.general";
	date: string | null;
	sourceShort: string;
	sourceLong: string;
	matchType: "direct" | "correlated_from_ip";
}

export interface ExtendedRunResult {
	run: DarkRiskRun | null;
	records: ExtendedLeakRecord[];
	discardedBucketRecords: number;
}
