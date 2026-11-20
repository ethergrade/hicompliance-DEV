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
	/** Record raccolti; null se non c'è ancora uno snapshot (≠ zero trovati). */
	totalLeaks: number | null;
	isMinimum: boolean;
	/** Record nuovi nella settimana dello snapshot; null senza snapshot. */
	newLeaks: number | null;
	/** Indice DarkRisk 0–100 dallo snapshot: più alto = più esposto. */
	riskScore: number | null;
	/** Fascia calcolata dal server sullo stesso indice; null senza snapshot. */
	riskLevel: string | null;
	/** Lunedì della settimana a cui si riferiscono i numeri dello snapshot. */
	snapshotWeekStart: string | null;
	/** Ultimo run DarkRisk (non l'ultima scansione SurfaceScan). */
	lastScanAt: string | null;
	/** Voci dello scope DarkRisk; null se la copertura non è disponibile. */
	monitoredTargets: number | null;
	/** newPublicWeb: quanti dei nuovi sono web pubblico (null se non disponibile). */
	weeklyTrend: Array<{ period: string; total: number; newLeaks: number; newPublicWeb: number | null }>;
	/** Di cui web pubblico, sui nuovi della settimana corrente. */
	newPublicWeb: number | null;
	snapshot: DarkRiskWeeklySnapshot | null;
	/** Contatore aggregato delle credenziali esposte: visibile anche in Standard. */
	credentialLeaks: number;
	monitoringCoverage: MonitoringCoverage | null;
}

/** Quanto è coperto il monitoraggio DarkRisk (backend overview.monitoring_coverage). */
export interface MonitoringCoverage {
	status: "sufficient" | "insufficient";
	reasons: string[];
	scopeEntries: number;
	scopeByKind: Record<string, number>;
	selectors: number;
	runsLast30Days: number;
	lastRunAt: string | null;
	daysSinceLastRun: number | null;
	monthly: Array<{ period: string; status: string | null; riskLevel: string | null; findings: number | null }>;
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
	/** true sugli hit ingeriti prima che l'account venisse conservato: `user` è mascherato. */
	accountMasked: boolean;
	password: string;
	passwordType: string;
	bucket: string;
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
 * Nel profilo Esteso il backend manda password e account in chiaro
 * (`clearValue`, `clearAccount`); `clearAccount` è null sugli hit ingeriti
 * prima che venisse conservato, e allora resta il `selector`. Il reveal
 * audiato sull'evidenza (`evidenceId`) resta disponibile per il dato grezzo.
 */
export interface CredentialLeak {
	id: string;
	/** Identità stabile della credenziale (account + password): una riga per chiave, l'ACK va qui. */
	credentialKey: string;
	/** Prima e ultima scansione che l'hanno vista, e quante. */
	firstSeenAt: string | null;
	lastSeenAt: string | null;
	seenCount: number;
	selector: string;
	assetScope: string | null;
	maskedValue: string;
	clearValue: string | null;
	clearAccount: string | null;
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
	/** Il leak: le credenziali con lo stesso findingId vengono dallo stesso. */
	findingId: string | null;
	acknowledged: boolean;
	acknowledgedAt: string | null;
	acknowledgedBy: string | null;
	acknowledgementNote: string | null;
}

/** Un'evidenza DarkRisk, con l'eventuale riconoscimento (ACK) del cliente. */
export interface DarkRiskFinding {
	id: string;
	title: string;
	findingType: string;
	severity: string;
	status: string;
	asset: string | null;
	leakDate: string | null;
	firstSeenAt: string | null;
	lastSeenAt: string | null;
	acknowledged: boolean;
	acknowledgedAt: string | null;
	acknowledgedBy: string | null;
	acknowledgementNote: string | null;
	/** Chi interviene; null = da assegnare. */
	assignee: string | null;
	/** Utente dell'azienda assegnato; il nome sta in `assignee`. */
	assigneeUserId: string | null;
	/** Stato della verifica: da_fare, in_corso, da_verificare; null = da valutare. */
	actionStatus: string | null;
	/** direct = riguarda direttamente il perimetro, indirect = terze parti. */
	compromiseType: string | null;
}

export interface DarkRiskFindingPage {
	rows: DarkRiskFinding[];
	total: number;
	page: number;
	lastPage: number;
}

export interface DarkRiskFindingEvent {
	action: string;
	actor: string | null;
	note: string | null;
	createdAt: string | null;
}

export interface CredentialLeakPage {
	records: CredentialLeak[];
	total: number;
	currentPage: number;
	lastPage: number;
	/** true quando il tenant non ha il profilo Esteso o un grant attivo. */
	forbidden: boolean;
}
