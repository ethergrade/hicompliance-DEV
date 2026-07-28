export const DARKRISK_SCOPE_LIMIT = 4;
/** Limite elevato consentito ai super-admin (allineato al backend). */
export const DARKRISK_SCOPE_LIMIT_SUPERADMIN = 20;

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

/**
 * Snapshot settimanale aggregato, prodotto dal backend a fine scansione e
 * restituito da `darkrisk/overview` nel campo `weekly_snapshot`.
 *
 * È `null` finché il cliente non ha almeno una scansione completata: in quel
 * caso le pagine mostrano uno stato vuoto, non grafici azzerati.
 */
export interface DarkRiskWeeklySnapshot {
	weekKey: string;
	weekStartDate: string | null;
	tier: string;
	totalRecords: number;
	newRecordsThisWeek: number;
	riskIndex: number;
	/** bucket sorgente → occorrenze */
	resultsBySource: Record<string, number>;
	/** tipo file → occorrenze */
	resultsByFiletype: Record<string, number>;
	/** "YYYY-MM-DD" → occorrenze, per la heatmap */
	resultsByDay: Record<string, number>;
	resultsByAsset: Record<
		string,
		{ total: number; bySource: Record<string, number>; byFiletype: Record<string, number> }
	>;
	severityDistribution: Record<string, number>;
	deltaVsPrev: {
		totalRecords: number | null;
		riskIndex: number | null;
		newBuckets: string[];
		severityDelta: Record<string, number>;
	};
	computedAt: string | null;
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
	snapshot: DarkRiskWeeklySnapshot | null;
	/** Contatore aggregato delle credenziali esposte: visibile anche in Standard. */
	credentialLeaks: number;
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

/**
 * Credenziale esposta da `darkrisk/credential-leaks` (solo profilo Esteso).
 *
 * La password arriva sempre mascherata: il valore in chiaro non transita mai
 * da questo endpoint e si ottiene solo con il reveal audiato sull'evidenza,
 * da cui `evidenceId`.
 */
export interface CredentialLeak {
	id: string;
	selector: string;
	assetScope: string | null;
	maskedValue: string;
	passwordType: string | null;
	bucketCanonical: string | null;
	bucketDisplay: string | null;
	sourceShort: string | null;
	sourceLong: string | null;
	collectionName: string | null;
	confidence: string;
	evidenceDate: string | null;
	createdAt: string | null;
	evidenceId: string | null;
	findingId: string | null;
}

export interface CredentialLeakPage {
	records: CredentialLeak[];
	total: number;
	currentPage: number;
	lastPage: number;
	/** true quando il tenant non ha il profilo Esteso o un grant attivo. */
	forbidden: boolean;
}
