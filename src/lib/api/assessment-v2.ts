import { apiClient } from "@/lib/api-client";
import { supabase } from "@/integrations/supabase/client";
import type {
	AnalysisViolation,
	ApiResponse,
	AssessmentCampaign,
	AssessmentCampaignsResponse,
	AssessmentCategory,
	AssessmentQuestion,
	AssessmentResponseItem,
	AssessmentSnapshot,
	AssessmentSnapshotStatus,
	UpdateSnapshotStatusRequest,
	ReprocessSnapshotRequest,
	BatchAssessmentResponseRequest,
	RemediationTemplate,
	UpdateAssessmentQuestionRequest,
} from "@/types/api";

const _h = (companyId: string, groupId?: string | null) => ({
	headers: { "X-Group-Id": groupId || companyId },
});

export const assessmentV2Api = {
	/** Get all assessment categories with nested questions */
	async categories(groupId?: string | null): Promise<AssessmentCategory[]> {
		const [{ data: categories, error }, { data: questions, error: questionsError }] = await Promise.all([
			supabase.from("assessment_categories").select("*").order("order_index"),
			supabase.from("assessment_questions").select("*").order("order_index"),
		]);
		if (error) throw error;
		if (questionsError) throw questionsError;
		return (categories ?? []).map((category) => ({
			...category,
			questions: (questions ?? []).filter((question) => question.category_id === category.id),
		})) as AssessmentCategory[];
	},

	/** Get all 132 questions */
	async questions(groupId?: string | null): Promise<AssessmentQuestion[]> {
		const { data, error } = await supabase.from("assessment_questions").select("*").order("order_index");
		if (error) throw error;
		return (data ?? []) as AssessmentQuestion[];
	},

	/**
	 * Modifica i contenuti di una domanda del catalogo. Riservata al
	 * super-admin: il catalogo è globale e la modifica vale per tutti i clienti.
	 */
	async updateQuestion(
		questionId: string,
		payload: UpdateAssessmentQuestionRequest,
		groupId?: string | null,
	): Promise<AssessmentQuestion> {
		const opts = groupId ? { headers: { "X-Group-Id": groupId } } : undefined;
		const res = await apiClient.put<ApiResponse<AssessmentQuestion>>(
			`/assessments-v2/questions/${questionId}`,
			payload,
			opts,
		);
		return res.data;
	},

	/** Get remediation template catalog */
	async remediationTemplates(
		groupId?: string | null,
	): Promise<RemediationTemplate[]> {
		const opts = groupId ? { headers: { "X-Group-Id": groupId } } : undefined;
		const res = await apiClient.get<ApiResponse<RemediationTemplate[]>>(
			"/assessments-v2/remediation-templates",
			undefined,
			opts,
		);
		return res.data;
	},

	// ─── Company-scoped assessment responses ────────────────────────────────────

	/** Get all assessment responses for a company */
	async responses(
		companyId: string,
		_g?: string | null,
	): Promise<AssessmentResponseItem[]> {
		const { data, error } = await supabase.from("assessment_responses").select("*").eq("organization_id", companyId);
		if (error) throw error;
		return (data ?? []).map((item) => ({ ...item, score: 0 })) as AssessmentResponseItem[];
	},

	/** Batch update assessment responses */
	async updateResponses(
		companyId: string,
		payload: BatchAssessmentResponseRequest,
		_g?: string | null,
	): Promise<AssessmentResponseItem[]> {
		const { data: authData, error: authError } = await supabase.auth.getUser();
		if (authError || !authData.user) throw authError ?? new Error("Non autenticato");
		const rows = payload.responses.map((response) => ({
			organization_id: companyId,
			question_id: response.question_id,
			status: response.status,
			notes: response.notes ?? null,
		}));
		const { data, error } = await supabase.from("assessment_responses").upsert(rows, { onConflict: "organization_id,question_id" }).select("*");
		if (error) throw error;
		return (data ?? []).map((item) => ({ ...item, score: 0 })) as AssessmentResponseItem[];
	},

	/** Update a single question response */
	async updateResponse(
		companyId: string,
		questionId: string,
		payload: { status: string; notes?: string | null },
		_g?: string | null,
	): Promise<AssessmentResponseItem> {
		const rows = await this.updateResponses(companyId, { responses: [{ question_id: questionId, status: payload.status as AssessmentResponseItem["status"], notes: payload.notes }] });
		const item = rows[0];
		if (!item) throw new Error("Risposta non salvata");
		return item;
	},

	// ─── Cicli di assessment ────────────────────────────────────────────────────

	/** Elenco dei cicli, quello corrente e lo stato di completezza. */
	async campaigns(
		companyId: string,
		_g?: string | null,
	): Promise<AssessmentCampaignsResponse> {
		const responses = await this.responses(companyId);
		const total = await this.questions().then((items) => items.length);
		return { campaigns: [], current: null, readiness: { answered: responses.length, visible_total: total, percent: total ? Math.round(responses.length / total * 100) : 0, profile_missing: [], is_ready: responses.length === total && total > 0, blocking_reason: null } };
	},

	/**
	 * Apre un nuovo ciclo riportando le risposte del precedente, da rivedere.
	 * Riservato agli admin.
	 */
	async createCampaign(
		companyId: string,
		_g?: string | null,
	): Promise<AssessmentCampaign> {
		const res = await apiClient.post<ApiResponse<AssessmentCampaign>>(
			`/companies/${companyId}/assessment-campaigns`,
			undefined,
			_h(companyId, _g),
		);
		return res.data;
	},

	/** Rinomina il ciclo. Riservato agli admin. */
	async renameCampaign(
		companyId: string,
		campaignId: string,
		label: string,
		_g?: string | null,
	): Promise<AssessmentCampaign> {
		const res = await apiClient.patch<ApiResponse<AssessmentCampaign>>(
			`/companies/${companyId}/assessment-campaigns/${campaignId}`,
			{ label },
			_h(companyId, _g),
		);
		return res.data;
	},

	/**
	 * Chiude il questionario. È l'unico innesco dell'elaborazione: da qui il cron
	 * costruisce lo snapshot e accoda le scansioni.
	 */
	async confirmCampaign(
		companyId: string,
		campaignId: string,
		_g?: string | null,
	): Promise<AssessmentCampaign> {
		const res = await apiClient.post<ApiResponse<AssessmentCampaign>>(
			`/companies/${companyId}/assessment-campaigns/${campaignId}/confirm`,
			undefined,
			_h(companyId, _g),
		);
		return res.data;
	},

	/**
	 * Annulla la conferma e riapre il questionario, azzerando l'elaborazione che
	 * ne era uscita. Riservato agli admin.
	 *
	 * Con un report già presentato o pubblicato il backend rifiuta con 422 e
	 * `errors.force`: va ripetuta con `force` dopo un assenso esplicito.
	 */
	async unconfirmCampaign(
		companyId: string,
		campaignId: string,
		force = false,
		_g?: string | null,
	): Promise<AssessmentCampaign> {
		const res = await apiClient.post<ApiResponse<AssessmentCampaign>>(
			`/companies/${companyId}/assessment-campaigns/${campaignId}/unconfirm`,
			force ? { force: true } : undefined,
			_h(companyId, _g),
		);
		return res.data;
	},

	// ─── Snapshots ──────────────────────────────────────────────────────────────

	/** Get all snapshots for a company */
	async snapshots(
		companyId: string,
		_g?: string | null,
	): Promise<AssessmentSnapshot[]> {
		const { data, error } = await supabase.from("assessment_snapshots").select("*").eq("organization_id", companyId).order("created_at", { ascending: false });
		if (error) throw error;
		return (data ?? []) as AssessmentSnapshot[];
	},

	/** Create a new snapshot (recalculates scores from current responses) */
	async createSnapshot(
		companyId: string,
		_g?: string | null,
	): Promise<AssessmentSnapshot> {
		const [{ data: responses, error }, { data: categories, error: categoryError }, { data: authData }] = await Promise.all([
			supabase.from("assessment_responses").select("status,question_id,assessment_questions(category_id)").eq("organization_id", companyId),
			supabase.from("assessment_categories").select("id,name"),
			supabase.auth.getUser(),
		]);
		if (error) throw error;
		if (categoryError) throw categoryError;
		const total = await this.questions().then((items) => items.length);
		const completed = (responses ?? []).filter((item) => item.status === "completed").length;
		const score = total ? Math.round(completed / total * 100) : 0;
		const categoryScores = Object.fromEntries((categories ?? []).map((category) => [category.id, { category_id: category.id, category_name: category.name, score: 0, answered: 0, total: 0 }]));
		const year = new Date().getFullYear();
		const { data, error: saveError } = await supabase.from("assessment_snapshots").upsert({ organization_id: companyId, snapshot_year: year, category_scores: categoryScores, overall_score: score, total_answered: responses?.length ?? 0, total_questions: total, created_by: authData.user?.id ?? null }, { onConflict: "organization_id,snapshot_year" }).select("*").single();
		if (saveError) throw saveError;
		return data as AssessmentSnapshot;
	},

	/** Get elaboration status for a snapshot (admin/superadmin only) */
	async snapshotStatus(
		companyId: string,
		snapshotId: string,
		_g?: string | null,
	): Promise<AssessmentSnapshotStatus> {
		const res = await apiClient.get<ApiResponse<AssessmentSnapshotStatus>>(
			`/companies/${companyId}/assessment-snapshots/${snapshotId}/status`,
			undefined,
			_h(companyId, _g),
		);
		return res.data;
	},

	/**
	 * Corregge a mano i testi dell'analisi.
	 *
	 * Il corpo contiene la sola struttura parziale dei campi modificati. Il backend
	 * rifiuta con 422 qualunque campo fuori dall'allowlist di prosa: punteggi,
	 * evidenze e servizi non si toccano da qui.
	 */
	async updateSnapshotAnalysis(
		companyId: string,
		snapshotId: string,
		analysis: Record<string, unknown>,
		_g?: string | null,
	): Promise<{ snapshot: AssessmentSnapshot; violations: AnalysisViolation[] }> {
		const res = await apiClient.patch<
			ApiResponse<{ snapshot: AssessmentSnapshot; violations: AnalysisViolation[] }>
		>(
			`/companies/${companyId}/assessment-snapshots/${snapshotId}/analysis`,
			{ analysis },
			_h(companyId, _g),
		);
		return res.data;
	},

	/** Transition snapshot status (e.g. status=3 → SCANNING). Available to all roles including customer. */
	async updateSnapshotStatus(
		companyId: string,
		snapshotId: string,
		payload: UpdateSnapshotStatusRequest,
		_g?: string | null,
	): Promise<AssessmentSnapshotStatus> {
		const res = await apiClient.patch<ApiResponse<AssessmentSnapshotStatus>>(
			`/companies/${companyId}/assessment-snapshots/${snapshotId}/status`,
			payload,
			_h(companyId, _g),
		);
		return res.data;
	},

	/** Reprocess a specific field (admin/superadmin only). Resets field and sets status=SCANNING. */
	async reprocessSnapshot(
		companyId: string,
		payload: ReprocessSnapshotRequest,
		_g?: string | null,
	): Promise<AssessmentSnapshot> {
		const res = await apiClient.post<ApiResponse<AssessmentSnapshot>>(
			`/companies/${companyId}/assessment-snapshots/reprocess`,
			payload,
			_h(companyId, _g),
		);
		return res.data;
	},
};
