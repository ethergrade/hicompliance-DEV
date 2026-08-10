import { apiClient } from "@/lib/api-client";
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
		const opts = groupId ? { headers: { "X-Group-Id": groupId } } : undefined;
		const res = await apiClient.get<ApiResponse<AssessmentCategory[]>>(
			"/assessments-v2/categories",
			undefined,
			opts,
		);
		return res.data;
	},

	/** Get all 132 questions */
	async questions(groupId?: string | null): Promise<AssessmentQuestion[]> {
		const opts = groupId ? { headers: { "X-Group-Id": groupId } } : undefined;
		const res = await apiClient.get<ApiResponse<AssessmentQuestion[]>>(
			"/assessments-v2/questions",
			undefined,
			opts,
		);
		return res.data;
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
		const res = await apiClient.get<ApiResponse<AssessmentResponseItem[]>>(
			`/companies/${companyId}/assessment-responses`,
			undefined,
			_h(companyId, _g),
		);
		return res.data;
	},

	/** Batch update assessment responses */
	async updateResponses(
		companyId: string,
		payload: BatchAssessmentResponseRequest,
		_g?: string | null,
	): Promise<AssessmentResponseItem[]> {
		const res = await apiClient.put<ApiResponse<AssessmentResponseItem[]>>(
			`/companies/${companyId}/assessment-responses`,
			payload,
			_h(companyId, _g),
		);
		return res.data;
	},

	/** Update a single question response */
	async updateResponse(
		companyId: string,
		questionId: string,
		payload: { status: string; notes?: string | null },
		_g?: string | null,
	): Promise<AssessmentResponseItem> {
		const res = await apiClient.put<ApiResponse<AssessmentResponseItem>>(
			`/companies/${companyId}/assessment-responses/${questionId}`,
			payload,
			_h(companyId, _g),
		);
		return res.data;
	},

	// ─── Cicli di assessment ────────────────────────────────────────────────────

	/** Elenco dei cicli, quello corrente e lo stato di completezza. */
	async campaigns(
		companyId: string,
		_g?: string | null,
	): Promise<AssessmentCampaignsResponse> {
		const res = await apiClient.get<ApiResponse<AssessmentCampaignsResponse>>(
			`/companies/${companyId}/assessment-campaigns`,
			undefined,
			_h(companyId, _g),
		);
		return res.data;
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
		const res = await apiClient.get<ApiResponse<AssessmentSnapshot[]>>(
			`/companies/${companyId}/assessment-snapshots`,
			undefined,
			_h(companyId, _g),
		);
		return res.data;
	},

	/** Create a new snapshot (recalculates scores from current responses) */
	async createSnapshot(
		companyId: string,
		_g?: string | null,
	): Promise<AssessmentSnapshot> {
		const res = await apiClient.post<ApiResponse<AssessmentSnapshot>>(
			`/companies/${companyId}/assessment-snapshots`,
			undefined,
			_h(companyId, _g),
		);
		return res.data;
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
