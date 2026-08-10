// Types derived from HiConsole OpenAPI spec (https://hiapi.websoupcloud.it/docs/api.json)

// ─── Generic API envelope ─────────────────────────────────────────────────

export interface ApiResponse<T> {
	success: boolean;
	message: string;
	data: T;
}

export interface ApiErrorResponse {
	success?: boolean;
	message: string;
	errors: Record<string, string[]> | null;
}

// ─── Pagination ─────────────────────────────────────────────────────────────

export interface PaginationLink {
	url: string | null;
	label: string;
	active: boolean;
}

export interface PaginationMeta {
	current_page: number;
	from: number | null;
	last_page: number;
	links: PaginationLink[];
	path: string | null;
	per_page: number;
	to: number | null;
	total: number;
}

export interface PaginatedResponse<T> {
	data: T[];
	links: {
		first: string | null;
		last: string | null;
		prev: string | null;
		next: string | null;
	};
	meta: PaginationMeta;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface LoginRequest {
	/** Username or email — backend accepts either */
	login: string;
	password: string;
}

export interface Group {
	id: string;
	name: string;
	slug?: string;
	description?: string;
	is_active: boolean;
	/** Dotted capabilities for this group from GET /auth/groups */
	capabilities?: Record<string, boolean>;
}

export interface LoginUser {
	id: string | number;
	name: string;
	email: string;
	is_super_admin: boolean;
	groups: Group[];
	/** Dotted capabilities map from /auth/me (e.g. `users.manage`, `hicompliance.assessment.view`). */
	capabilities?: Record<string, boolean>;
	/** MFA already configured by this user */
	mfa_configured?: boolean;
	/** MFA not mandatory but user hasn't set it up yet */
	mfa_recommended?: boolean;
	/** Role string from backend (e.g. 'admin', 'sales', 'client') */
	user_type?: string;
	/** Authentication method from /auth/me */
	auth_method?: 'native' | 'microsoft';
}

export interface LoginData {
	token?: string;
	mfa_required: boolean;
	mfa_configured: boolean;
	/** Present only when mfa_configured=true — no token yet */
	mfa_challenge_token?: string;
	user?: LoginUser;
}

export interface MfaVerifyRequest {
	mfa_challenge_token: string;
	code: string;
}

export interface MfaVerifyData {
	token: string;
	user: LoginUser;
}

export interface MfaSetupData {
	secret: string;
	qr_code: string;
	qr_mime: string;
}

export interface MfaEnableData {
	recovery_codes: string[];
}

export interface MfaRecoveryCodesData {
	recovery_codes: string[];
}

export interface ChangePasswordRequest {
	current_password: string;
	password: string;
	password_confirmation: string;
}

// ─── User ─────────────────────────────────────────────────────────────────

export interface UserResource {
	id: string;
	name: string;
	email: string;
	/** Spatie role names */
	roles: string[];
	/** Group memberships (loaded via pivot) */
	groups?: Array<{ id: string; name: string; role: string }>;
	created_at: string;
}

export interface StoreUserRequest {
	name: string;
	email: string;
	password: string;
	role?: string;
}

export interface UpdateUserRequest {
	name?: string;
	email?: string;
	role?: string;
	tenant_id?: string | null;
	password?: string;
}

// ─── Tenant ─────────────────────────────────────────────────────────────────

export interface TenantResource {
	id: string;
	group_id: string | null;
	customer_code: string | null;
	name: string;
	ms_tenant_id: string | null;
	contact_first_name: string | null;
	contact_last_name: string | null;
	phone: string | null;
	vat_number: string | null;
	primary_domain: string | null;
	primary_subnet: string | null;
	secondary_domain: string | null;
	secondary_subnet: string | null;
	revenue: string | null;
	employees_count: string | null;
	industry: string | null;
	customer_sectors: string[] | null;
	implemented_technologies: string[] | null;
	status: number;
	firewalls_count: number | null;
	endpoints_count: number | null;
	servers_count: number | null;
	vms_count: number | null;
	contract_start?: string | null;
	contract_duration?: number | null;
	last_scan_at?: string | null;
	is_multiple?: boolean;
	extra?: TenantDashboardExtra | null;
	created_at?: string | null;
	// Anagrafica / Organization Profile fields
	legal_name?: string | null;
	fiscal_code?: string | null;
	legal_address?: string | null;
	operational_address?: string | null;
	pec?: string | null;
	email?: string | null;
	nis2_classification?:
		| "soggetto_essenziale"
		| "soggetto_importante"
		| "nessuna"
		| null;
	ciso_substitute?: string | null;
}


// ─── Tenant Dashboard Extra ──────────────────────────────────────────────────

export interface TenantDashboardExtra {
	note?: string;
	server?: number;
	utenti?: number;
	endpoint?: number;
	firewall?: number;
	ip_totali?: number;
	subnet_21?: number;
	subnet_22?: number;
	subnet_23?: number;
	subnet_24?: number;
	subnet_25?: number;
	hypervisor?: number;
	ip_puntuali?: number;
	switch_core?: number;
	access_point?: number;
	sedi_cliente?: number;
	switch_access?: number;
	virtual_machine?: number;
	dispositivi_rete_varie?: number;
	dispositivi_rete_totali?: number;
	// HiCompliance extended scope
	hicompliance_scope_domains?: string[];
	hicompliance_scope_ips?: { start_ip: string; end_ip: string }[];
}

export interface StoreTenantRequest {
	name: string;
	ms_tenant_id?: string | null;
	contract_start?: string | null;
	contract_duration?: number | null;
	is_multiple?: boolean | null;
	nis2_classification?:
		| "soggetto_essenziale"
		| "soggetto_importante"
		| "nessuna"
		| null;
}

export interface UpdateTenantRequest {
	name?: string;
	ms_tenant_id?: string | null;
	contact_first_name?: string | null;
	contact_last_name?: string | null;
	phone?: string | null;
	vat_number?: string | null;
	primary_domain?: string | null;
	primary_subnet?: string | null;
	secondary_domain?: string | null;
	secondary_subnet?: string | null;
	revenue?: string | null;
	employees_count?: string | null;
	industry?: string | null;
	customer_sectors?: string[] | null;
	implemented_technologies?: string[] | null;
	status?: number;
	firewalls_count?: number;
	endpoints_count?: number;
	servers_count?: number;
	vms_count?: number;
	contract_start?: string | null;
	contract_duration?: number;
	last_scan_at?: string | null;
	is_multiple?: boolean;
	extra?: TenantDashboardExtra | null;
	// Ragione sociale, codice fiscale, sedi, PEC, email e sostituto CISO NON
	// stanno qui: vivono su company_profiles e vanno inviati a
	// PUT /companies/{id}/profile. Elencarli in questo payload li faceva
	// scartare in silenzio dalla validazione lato server.
	nis2_classification?:
		| "soggetto_essenziale"
		| "soggetto_importante"
		| "nessuna"
		| null;
}

// ─── Company profile (tabella company_profiles) ─────────────────────────────

export interface CompanyProfileResource {
	id: string;
	tenant_id: string;
	group_id: string;
	legal_name: string | null;
	fiscal_code: string | null;
	vat_number: string | null;
	legal_address: string | null;
	operational_address: string | null;
	pec: string | null;
	phone: string | null;
	email: string | null;
	business_sector: string | null;
	nis2_classification: string | null;
	ciso_substitute: string | null;
	created_at?: string | null;
	updated_at?: string | null;
}

export interface UpdateCompanyProfileRequest {
	legal_name?: string | null;
	fiscal_code?: string | null;
	vat_number?: string | null;
	legal_address?: string | null;
	operational_address?: string | null;
	pec?: string | null;
	phone?: string | null;
	email?: string | null;
	business_sector?: string | null;
	/** Su questo endpoint il backend accetta solo none|essential|important. */
	nis2_classification?: "none" | "essential" | "important";
	ciso_substitute?: string | null;
}

// ─── Assessment ─────────────────────────────────────────────────────────────

export type AssessmentQuestionValue = string | number | null;
export type AssessmentQuestions = Record<
	string,
	AssessmentQuestionValue
> | null;
export type AssessmentId = string | number;

export interface UpdateAssessmentRequest {
	status?: number;
	follow_up?: string | null;
	followup_reminder?: string | null;
	presentation_date?: string | null;
	hide_gantt?: boolean;
	custom_gantt?: GanttItem[] | null;
	questions?:
		| Record<string, AssessmentQuestionValue>
		| AssessmentQuestionValue[];
}

export interface UpdateGanttRequest {
	custom_gantt?: GanttItem[] | null;
	hide_gantt?: boolean;
}

export interface AssessmentData {
	id: AssessmentId;
	tenant_id?: string | null;
	status: number;
	questions: AssessmentQuestions;
	follow_up: string | null;
	followup_reminder?: string | null;
	presentation_date: string | null;
	hide_gantt: boolean;
	custom_gantt: GanttItem[] | Record<string, unknown>[] | null;
	generated_at: string | null;
	updated_by?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
}

export interface AssessmentSummary {
	completion_score: number;
	risk_score: number;
	completion_color: string;
	risk_color: string;
	risk_label: string;
	totals_by_answer: [number, number, number, number];
	answer_labels: [string, string, string, string];
}

export interface RadarCategory {
	name: string;
	completion_percent: number;
}

export interface GanttItem {
	id?: string | number;
	name?: string;
	task?: string;
	start: string;
	end: string;
	duration?: string | number;
	progress?: boolean;
	hidden?: boolean;
	withprev?: string | number | boolean;
	[key: string]: unknown;
}

/**
 * RemediationTask — v2 API (Trello #55)
 * Backend: GET/POST /api/companies/{companyId}/remediation-tasks
 *          GET/PUT/DELETE /api/companies/{companyId}/remediation-tasks/{taskId}
 * Replace legacy v1 `assessment.custom_gantt` array.
 * Filter `is_deleted = false` client-side.
 */
export interface RemediationTask {
	id: string;
	tenant_id: string;
	task: string;
	category: string;
	priority: "low" | "medium" | "high" | "critical" | string;
	color: string;
	start_date: string;
	end_date: string;
	progress: number;
	assignee: string | null;
	budget: number | null;
	dependencies: string[] | null;
	display_order: number | null;
	is_deleted: boolean;
	is_hidden: boolean;
	source: "assessment_v2" | string | null;
	source_ref: string | null;
	created_at: string;
	updated_at: string;
}

export interface StoreRemediationTaskRequest {
	task: string;
	category: string;
	start_date: string;
	end_date: string;
	priority?: "low" | "medium" | "high" | "critical";
	color?: string;
	progress?: number;
	assignee?: string | null;
	budget?: number | null;
	display_order?: number | null;
	is_deleted?: boolean;
	is_hidden?: boolean;
	source?: string | null;
	source_ref?: string | null;
	dependencies?: string[] | null;
}

export type UpdateRemediationTaskRequest = Partial<StoreRemediationTaskRequest>;

export interface OpenAIAnalysis {
	intro: string[];
	analysis: string[];
	categories: string[];
	outro: string[];
}

export interface IntelXData {
	raw: unknown[] | null;
	buckets: string;
	mediahs: string;
}

export interface ShodanScanAggregated {
	total_hosts: number;
	hosts: unknown[];
	top_ports: unknown[];
	cve_counts: unknown[];
	countries: string;
}

export interface ShodanScan {
	date: string;
	aggregated: ShodanScanAggregated;
}

export interface Vulnerability {
	cve: string;
	count: string;
	affected_ips: string[];
	epss_score: number | null;
	severity: string;
}

export interface AssessmentReportAssessment {
	id: number;
	status: number;
	follow_up: string;
	followup_reminder: string;
	presentation_date: string;
	hide_gantt: boolean;
	generated_at: string | null;
	updated_at: string;
}

export interface AssessmentReportCategoryByPriorityItem {
	questions: number;
	na: number;
	completed: number;
	planned: number;
	not_started: number;
	m: number;
	l: number;
}

export interface AssessmentReportCategory {
	name: string;
	total_questions: number;
	/** Maturità (0–1). null se tutte le domande sono N/A. */
	maturity: number | null;
	points: number;
	/** Rischio residuo (0–1). null quando is_not_applicable è true. */
	risk: number | null;
	risk_label: string;
	risk_color: string;
	is_not_applicable: boolean;
	total_m: number;
	total_l: number;
	by_priority: {
		ALTA: AssessmentReportCategoryByPriorityItem;
		MEDIA: AssessmentReportCategoryByPriorityItem;
		BASSA: AssessmentReportCategoryByPriorityItem;
	};
	totals_by_answer: Record<string, number>;
	totals_by_priority: Record<string, number>;
	at_risk_by_priority: Record<string, number>;
	gantt_priority: number;
	questions: unknown[];
}

export interface AssessmentReportData {
	assessment: AssessmentReportAssessment;
	tenant: TenantResource;
	summary: AssessmentSummary;
	categories: AssessmentReportCategory[];
	gantt: GanttItem[] | null;
	openai: OpenAIAnalysis | string[];
	shodan: unknown[] | null;
	intelx: IntelXData | string[];
}

export interface MonthlyReportDelta {
	hosts: string | null;
	cves: string | null;
}

export interface AssessmentMonthlyReportData {
	tenant: TenantResource;
	assessment: AssessmentReportAssessment;
	scans: ShodanScan[];
	vulnerabilities: Vulnerability[];
	radar_categories: RadarCategory[];
	trend: unknown[];
	delta: MonthlyReportDelta;
}
// ─── Tenant Service ──────────────────────────────────────────────────────────

export interface TenantServiceResource {
	id: string;
	tenant_id: string;
	site_id: string | null;
	service_type: string;
	status: string;
	settings: Record<string, unknown> | null;
	api_methods: Record<string, unknown> | null;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface StoreTenantServiceRequest {
	tenant_id?: string | null;
	site_id?: string | null;
	service_type: string;
	status?: "active" | "inactive" | null;
	settings?: Record<string, unknown> | null;
}

export interface UpdateTenantServiceRequest {
	tenant_id?: string | null;
	site_id?: string | null;
	service_type?: string;
	status?: "active" | "inactive";
	settings?: Record<string, unknown> | null;
}
// ─── Asset Inventory ────────────────────────────────────────────────────────

export interface AssetInventoryResource {
	id: string;
	organization_id: string;
	users_count: number;
	locations_count: number;
	endpoints_count: number;
	servers_count: number;
	hypervisors_count: number;
	virtual_machines_count: number;
	firewalls_count: number;
	core_switches_count: number;
	access_switches_count: number;
	access_points_count: number;
	miscellaneous_network_devices_count: number;
	total_network_devices_count: number;
	va_ip_punctual_count: number;
	va_subnet_25_count: number;
	va_subnet_24_count: number;
	va_subnet_23_count: number;
	va_subnet_22_count: number;
	va_subnet_21_count: number;
	va_total_ips_count: number;
	notes: string;
	hilog_syslog_count: number;
	hilog_iis_count: number;
	hilog_apache_count: number;
	hilog_sql_count: number;
	hilog_custom_path_count: number;
	hilog_endpoint_count: number;
	hilog_server_count: number;
	hilog_dlp_linux_count: number;
	hilog_dlp_windows_count: number;
	hilog_sharepoint_dlp_enabled: boolean;
	hilog_sharepoint_dlp_count: number;
	hilog_entra_id_enabled: boolean;
	created_at?: string;
	updated_at?: string;
}

export interface StoreAssetInventoryRequest {
	organization_id: string;
	users_count?: number;
	locations_count?: number;
	endpoints_count?: number;
	servers_count?: number;
	hypervisors_count?: number;
	virtual_machines_count?: number;
	firewalls_count?: number;
	core_switches_count?: number;
	access_switches_count?: number;
	access_points_count?: number;
	miscellaneous_network_devices_count?: number;
	total_network_devices_count?: number;
	va_ip_punctual_count?: number;
	va_subnet_25_count?: number;
	va_subnet_24_count?: number;
	va_subnet_23_count?: number;
	va_subnet_22_count?: number;
	va_subnet_21_count?: number;
	va_total_ips_count?: number;
	notes?: string;
	hilog_syslog_count?: number;
	hilog_iis_count?: number;
	hilog_apache_count?: number;
	hilog_sql_count?: number;
	hilog_custom_path_count?: number;
	hilog_endpoint_count?: number;
	hilog_server_count?: number;
	hilog_dlp_linux_count?: number;
	hilog_dlp_windows_count?: number;
	hilog_sharepoint_dlp_enabled?: boolean;
	hilog_sharepoint_dlp_count?: number;
	hilog_entra_id_enabled?: boolean;
}

export type UpdateAssetInventoryRequest = Partial<StoreAssetInventoryRequest>;

// ─── Integrations ───────────────────────────────────────────────────────────

export interface IntegrationResource {
	id: string;
	organization_id: string;
	service_id: string;
	service_code: string;
	service_name: string;
	api_url: string;
	is_active: boolean;
	api_methods?: Record<string, unknown>;
	created_at?: string;
	updated_at?: string;
}

export interface ServiceCatalogItem {
	id: string;
	code: string;
	name: string;
	description?: string;
	icon?: string;
	is_active?: boolean;
}

export interface RoleModulePermission {
	id: string;
	role: string;
	module_path: string;
	module_name: string;
	is_enabled: boolean;
}

export interface StoreIntegrationRequest {
	organization_id: string;
	service_id: string;
	api_url: string;
	api_key?: string;
	api_methods?: Record<string, unknown>;
}

export interface UpdateIntegrationRequest {
	api_url?: string;
	api_key?: string;
	is_active?: boolean;
	api_methods?: Record<string, unknown>;
}

// ─── Assessment v2 ───────────────────────────────────────────────────────────

export interface AssessmentCategory {
	id: string;
	name: string;
	code: string;
	description: string | null;
	order_index: number;
	questions: AssessmentQuestion[];
}

export interface AssessmentQuestion {
	id: string;
	category_id: string;
	category_name?: string | null;
	question_text: string;
	description?: string | null;
	order_index: number;
	priority?: string | null;
	priority_numeric?: number | null;
	/** Alimenta l'ordinamento del piano di remediation; 0 esclude la domanda. */
	gantt_priority?: number | null;
	deadline?: string | null;
	dependency?: string | null;
	solution_1?: string | null;
	solution_2?: string | null;
	solution_3?: string | null;
	updated_at?: string | null;
	updated_by?: string | null;
}

/**
 * Modifica dei contenuti di una domanda del catalogo (solo super-admin).
 *
 * Struttura, ordinamento e categoria non sono modificabili: `dependency`
 * referenzia le domande per posizione, quindi riordinare scollegherebbe in
 * silenzio le dipendenze, e spostare una domanda di categoria ne cambierebbe
 * il punteggio retroattivamente su tutti i clienti.
 */
export interface UpdateAssessmentQuestionRequest {
	question_text?: string;
	description?: string | null;
	priority?: "ALTA" | "MEDIA" | "BASSA" | null;
	gantt_priority?: number | null;
	deadline?: string | null;
	solution_1?: string | null;
	solution_2?: string | null;
	solution_3?: string | null;
}

export interface AssessmentResponseItem {
	id: string;
	question_id: string;
	status: "not_applicable" | "planned_in_progress" | "completed";
	notes: string | null;
	score: number;
	updated_at: string;
	question?: AssessmentQuestion;
}

export interface BatchAssessmentResponseRequest {
	responses: {
		question_id: string;
		status: "not_applicable" | "planned_in_progress" | "completed";
		notes?: string | null;
	}[];
}

export interface CategoryScore {
	name: string;
	score: number;
	answered: number;
	total: number;
}

export interface AssessmentSnapshot {
	id: string;
	snapshot_year: number;
	overall_score: number;
	total_answered: number;
	total_questions: number;
	category_scores: Record<string, CategoryScore>;
	analysis?: AssessmentAnalysis | null;
	analysis_state?: AnalysisState;
	analysis_violations?: AnalysisViolation[] | null;
	analysis_model?: string | null;
	analysis_generated_at?: string | null;
	analysis_edited_at?: string | null;
	/** Testo markdown del vecchio flusso. Non viene più scritto: resta per lo storico. */
	openai_data?: unknown | null;
	shodan_data?: unknown | null;
	intelx_data?: unknown | null;
	created_at: string;
}

/** `needs_review`: il validatore ha rilievi aperti, il report non è pubblicabile. */
export type AnalysisState = "pending" | "ok" | "needs_review";

export interface AnalysisViolation {
	regola: string;
	dettaglio: string;
}

export interface AnalysisStatusCounts {
	completed: number;
	planned_in_progress: number;
	not_started: number;
	not_applicable: number;
}

export interface AnalysisCategory {
	category_id: string;
	category_name: string;
	score: number | null;
	counts: AnalysisStatusCounts;
	classification: "well_covered" | "targeted_improvement" | "remediation_needed" | "not_assessed";
	state_summary: string;
	advice: string;
	evidence_question_ids: string[];
	recommended_service_ids: string[];
}

export interface AnalysisImprovement {
	title: string;
	rationale: string;
	category_ids: string[];
	evidence_question_ids: string[];
	service_ids: string[];
}

export interface AnalysisSwotItem {
	text: string;
	category_ids: string[];
	evidence_question_ids: string[];
}

/**
 * L'analisi strutturata, conforme a `docs/assessment-ai/assessment-analysis.schema.json`.
 *
 * Sostituisce il markdown che andava riconosciuto a colpi di espressioni regolari
 * sulle intestazioni: qui ogni pezzo ha il suo campo e i consigli per categoria si
 * leggono senza indovinare dove finisce una sezione.
 */
export interface AssessmentAnalysis {
	analysis_status: "ok" | "blocked";
	input_hash: string;
	blocked_reasons: string[];
	overall: {
		headline: string;
		executive_summary: string;
		posture_score: number | null;
		strength_category_ids: string[];
		priority_category_ids: string[];
	};
	categories: AnalysisCategory[];
	improvements: AnalysisImprovement[];
	cyberswot: {
		strengths: AnalysisSwotItem[];
		weaknesses: AnalysisSwotItem[];
		opportunities: AnalysisSwotItem[];
		threats: AnalysisSwotItem[];
	};
	conclusion: string;
}

/**
 * Correzione manuale: struttura parziale con i soli testi.
 *
 * Il backend accetta un'allowlist di campi di prosa e rifiuta tutto il resto —
 * punteggi, conteggi, evidenze e servizi non si toccano a mano, perché sono ciò su
 * cui il testo poggia.
 */
export type UpdateAnalysisRequest = {
	analysis: Record<string, unknown>;
};

/**
 * Un ciclo di compilazione dell'assessment. Lo stato riguarda solo il
 * questionario: quelli di elaborazione restano sullo snapshot, che nasce dopo
 * la conferma.
 */
export interface AssessmentCampaign {
	id: string;
	label: string;
	status: "draft" | "confirmed";
	is_confirmed: boolean;
	confirmed_at: string | null;
	confirmed_by: string | null;
	/** Valorizzati quando un admin ha annullato una conferma data per errore. */
	reopened_at: string | null;
	reopened_by: string | null;
	snapshot_id: string | null;
	created_at: string;
}

/** Perché un assessment non è ancora confermabile. */
export interface AssessmentReadiness {
	answered: number;
	visible_total: number;
	percent: number;
	profile_missing: string[];
	is_ready: boolean;
	blocking_reason: string | null;
}

export interface AssessmentCampaignsResponse {
	campaigns: AssessmentCampaign[];
	current: AssessmentCampaign | null;
	readiness: AssessmentReadiness;
}

export type SnapshotJobStatus = "pending" | "running" | "done" | "failed";

export interface AssessmentSnapshotStatus {
	snapshot_id: string;
	snapshot_year: number;
	/** Snapshot-level status: 0 = IN_PROGRESS, 2 = HELP_NEEDED, 3 = SCANNING */
	status?: number;
	shodan: SnapshotJobStatus;
	intelx: SnapshotJobStatus;
	openai: SnapshotJobStatus;
	updated_at: string;
}

/** Forma dei blocchi del vecchio flusso Assistants. Serve solo a leggere lo storico. */
export interface OpenAiTextBlock {
	type: "text";
	text: { value: string; annotations: unknown[] };
}

// ─── Snapshot status / reprocess ───────────────────────────────────────────

export interface UpdateSnapshotStatusRequest {
	status: number;
}

export type ReprocessTarget = "shodan" | "intelx" | "openai" | "all";

export interface ReprocessSnapshotRequest {
	target: ReprocessTarget;
}

export interface RemediationTemplate {
	id: string;
	title: string;
	description?: string;
	category?: string;
	priority?: string;
}

// ─── Asset Inventory v2 (company-scoped) ────────────────────────────────────

export interface AssetInventoryV2Payload {
	workstations?: number;
	servers_physical?: number;
	servers_virtual?: number;
	nas_san?: number;
	routers?: number;
	switches?: number;
	firewalls?: number;
	wap?: number;
	printers?: number;
	voip_phones?: number;
	iot_devices?: number;
	mobile_devices?: number;
	cloud_services?: number;
	saas_apps?: number;
	databases?: number;
	web_apps?: number;
	email_accounts?: number;
	domain_accounts?: number;
	local_accounts?: number;
	service_accounts?: number;
	privileged_accounts?: number;
	external_contractors?: number;
	backup_solutions_count?: number;
	dr_sites?: number;
	data_centers_owned?: number;
	data_centers_cloud?: number;
	internet_connections?: number;
	vpn_tunnels?: number;
	critical_servers?: number;
	public_ips?: number;
	domains_owned?: number;
	ssl_certificates?: number;
	security_cameras?: number;
	access_control_systems?: number;
	hilog_sharepoint_dlp_enabled?: boolean;
	hilog_entra_id_enabled?: boolean;
	notes?: string;
}

export interface AssetInventoryV2Resource extends AssetInventoryV2Payload {
	id?: string;
	company_id?: string;
	created_at?: string;
	updated_at?: string;
}

// ─── Remediation Tasks ──────────────────────────────────────────────────────

export interface RemediationTask {
	id: string;
	task: string;
	category?: string | null;
	priority?: "low" | "medium" | "high" | "critical" | null;
	color?: string | null;
	start_date?: string | null;
	end_date?: string | null;
	progress?: number;
	assignee?: string | null;
	budget?: string | null;
	dependencies?: string[];
	display_order?: number;
	is_deleted?: boolean;
	is_hidden?: boolean;
	created_at?: string;
	updated_at?: string;
}

export interface StoreRemediationTaskRequest {
	task: string;
	category?: string | null;
	priority?: "low" | "medium" | "high" | "critical" | null;
	color?: string | null;
	start_date?: string | null;
	end_date?: string | null;
	progress?: number;
	assignee?: string | null;
	budget?: string | null;
	dependencies?: string[];
	display_order?: number;
}

export interface UpdateRemediationTaskRequest
	extends Partial<StoreRemediationTaskRequest> {
	is_deleted?: boolean;
	is_hidden?: boolean;
}

// ─── Risk Analysis ──────────────────────────────────────────────────────────

export interface RiskAnalysisItem {
	id: string;
	asset_name: string;
	threat_source?: "non_umana" | "umana_esterna" | "umana_interna" | null;
	control_scores?: Record<string, unknown> | null;
	risk_score?: number;
	notes?: string | null;
	created_at?: string;
	updated_at?: string;
}

export interface StoreRiskAnalysisRequest {
	asset_name: string;
	threat_source?: "non_umana" | "umana_esterna" | "umana_interna" | null;
	control_scores?: Record<string, unknown> | null;
	risk_score?: number;
	notes?: string | null;
}

export type UpdateRiskAnalysisRequest = Partial<StoreRiskAnalysisRequest>;

// ─── Playbook Completions ───────────────────────────────────────────────────

export interface PlaybookCompletion {
	id: string;
	playbook_id: string;
	playbook_title?: string | null;
	playbook_category?: string | null;
	playbook_severity?: string | null;
	progress_percentage?: number;
	data?: Record<string, unknown> | null;
	started_at?: string | null;
	completed_at?: string | null;
	created_at?: string;
	updated_at?: string;
}

export interface StorePlaybookCompletionRequest {
	playbook_id: string;
	playbook_title?: string | null;
	playbook_category?: string | null;
	playbook_severity?: string | null;
	progress_percentage?: number;
	data?: Record<string, unknown> | null;
	started_at?: string | null;
	completed_at?: string | null;
}

export interface UpdatePlaybookCompletionRequest
	extends Partial<StorePlaybookCompletionRequest> {
	progress_percentage?: number;
	completed_at?: string | null;
}

// ─── Dark Risk Alerts ───────────────────────────────────────────────────────

export interface DarkRiskAlert {
	id: string;
	company_id?: string | null;
	alert_email: string;
	alert_types?: string[];
	is_active?: boolean;
	created_at?: string;
	updated_at?: string;
}

export interface StoreDarkRiskAlertRequest {
	alert_email: string;
	alert_types?: string[];
	is_active?: boolean;
	company_id?: string | null;
}

export interface UpdateDarkRiskAlertRequest {
	alert_email?: string;
	alert_types?: string[];
	is_active?: boolean;
}

// ─── Documents ──────────────────────────────────────────────────────────────

export interface DocumentResource {
	id: string;
	tenant_id: string;
	group_id: string;
	name: string;
	file_size: number | null;
	file_type: string | null;
	category: string;
	document_code: string | null;
	revision: number;
	revision_date: string | null;
	status: string;
	description: string | null;
	tags: string[] | null;
	confidentiality: string;
	uploaded_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface StoreDocumentRequest {
	name: string;
	category?: string;
	document_code?: string | null;
	status?: string;
	confidentiality?: string;
	description?: string | null;
	tags?: string[] | null;
}

export interface UpdateDocumentRequest {
	name?: string;
	category?: string;
	document_code?: string | null;
	revision?: number;
	status?: string;
	confidentiality?: string;
	description?: string | null;
	tags?: string[] | null;
}

// ─── IRP Contacts ───────────────────────────────────────────────────────────

export interface IrpContactResource {
	id: string;
	tenant_id: string;
	group_id: string;
	first_name: string;
	last_name: string;
	role?: string;
	job_title?: string | null;
	irp_role?: string | null;
	phone: string;
	email: string;
	category: string;
	responsibilities?: string | null;
	notes?: string | null;
	directory_contact_id?: string | null;
	/** Present when backend returns ContactDirectory rows (real platform fields) */
	user_id?: string | null;
	is_platform_user?: boolean;
	account_disabled?: boolean;
	module_permissions?: unknown[] | null;
	created_at: string;
	updated_at: string;
}

export interface StoreIrpContactRequest {
	first_name: string;
	last_name: string;
	role?: string;
	job_title?: string | null;
	irp_role?: string | null;
	phone: string;
	email: string;
	category?: string;
	responsibilities?: string | null;
	notes?: string | null;
	directory_contact_id?: string | null;
	is_platform_user?: boolean;
	account_disabled?: boolean;
}

// ─── IRP Emergency Contacts ─────────────────────────────────────────────────

export interface IrpEmergencyContactResource {
	id: string;
	tenant_id: string;
	group_id: string;
	name: string;
	role?: string | null;
	job_title?: string | null;
	irp_role?: string | null;
	phone: string;
	email: string;
	category?: string;
	responsibilities?: string | null;
	directory_contact_id?: string | null;
	created_at: string;
	updated_at: string;
}

export interface StoreIrpEmergencyContactRequest {
	name: string;
	role?: string | null;
	job_title?: string | null;
	irp_role?: string | null;
	phone: string;
	email: string;
	category?: string;
	responsibilities?: string | null;
	directory_contact_id?: string | null;
}

// ─── Consistenze ───────────────────────────────────────────────────────────

export interface ConsistenzeItem {
	id: string;
	tenant_id: string;
	group_id: string;
	area: string;
	categoria: string;
	tecnologia: string;
	fornitore: string;
	quantita: number;
	scadenza?: string | null;
	metriche_json: Record<string, unknown>;
	created_at?: string | null;
	updated_at?: string | null;
}

export interface ConsistenzeSummary {
	id: string;
	tenant_id: string;
	group_id: string;
	nr_sedi: number;
	nr_interni_telefonici: number;
	descrizione_telefoni: string;
	nr_canali_fonia: number;
	note_generali: string;
	created_at?: string | null;
	updated_at?: string | null;
}

// ─── Critical Infrastructure ────────────────────────────────────────────────

export interface CriticalInfrastructureAsset {
	id: string;
	tenant_id: string;
	group_id: string;
	asset_id: string;
	component_name: string;
	criticality: "H" | "M" | "L" | null;
	owner_team: string;
	management_type: "internal" | "external" | null;
	location: string;
	sensitive_data: "S" | "N" | "N/A" | null;
	dependencies: string;
	main_controls: string;
	has_backup: "S" | "N" | null;
	backup_frequency: string;
	last_test_date: string | null;
	rpo_hours: number | null;
	rto_hours: number | null;
	runbook_link: string;
	ir_notes: string;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export type CriticalInfrastructureUpdate = Partial<
	Omit<CriticalInfrastructureAsset, "id" | "group_id" | "created_at">
>;

// ─── Asset IRP ─────────────────────────────────────────────────────────────

export interface AssetIrpItem {
	id: string;
	tenant_id: string;
	group_id: string;
	consistenza_item_id: string | null;
	area: string | null;
	categoria: string | null;
	tecnologia: string | null;
	fornitore: string | null;
	quantita: number | null;
	esposizione_score: number | null;
	criticita_score: number | null;
	superficie_score: number | null;
	rischio_intrinseco: string | null;
	rischio_residuo: string | null;
	last_sync_from_consistenze: string | null;
	created_at: string;
	updated_at: string;
}

// ─── User Preferences ──────────────────────────────────────────────────────

export interface UserPreferenceValue {
	key: string;
	value: unknown;
}

// ─── Service Catalog (Tenant Services v2) ──────────────────────────────────

export interface ServiceCatalogField {
	label: string;
	type: "select" | "checkbox" | "text";
	options?: string[];
	required?: boolean;
	is_secret?: boolean;
}

export interface ServiceCatalogEntry {
	label: string;
	fields: Record<string, ServiceCatalogField>;
}

export type ServiceCatalog = Record<string, ServiceCatalogEntry>;
