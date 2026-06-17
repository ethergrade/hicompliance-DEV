import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  AssessmentCategory,
  AssessmentQuestion,
  AssessmentResponseItem,
  AssessmentSnapshot,
  AssessmentSnapshotStatus,
  UpdateSnapshotAiTextRequest,
  BatchAssessmentResponseRequest,
  RemediationTemplate,
} from "@/types/api";

const _h = (companyId: string, groupId?: string | null) => ({
  headers: { "X-Group-Id": groupId || companyId },
});

export const assessmentV2Api = {
  /** Get all assessment categories with nested questions */
  async categories(groupId?: string | null): Promise<AssessmentCategory[]> {
    const opts = groupId ? { headers: { "X-Group-Id": groupId } } : undefined;
    const res = await apiClient.get<ApiResponse<AssessmentCategory[]>>("/assessments-v2/categories", undefined, opts);
    return res.data;
  },

  /** Get all 132 questions */
  async questions(groupId?: string | null): Promise<AssessmentQuestion[]> {
    const opts = groupId ? { headers: { "X-Group-Id": groupId } } : undefined;
    const res = await apiClient.get<ApiResponse<AssessmentQuestion[]>>("/assessments-v2/questions", undefined, opts);
    return res.data;
  },

  /** Get remediation template catalog */
  async remediationTemplates(groupId?: string | null): Promise<RemediationTemplate[]> {
    const opts = groupId ? { headers: { "X-Group-Id": groupId } } : undefined;
    const res = await apiClient.get<ApiResponse<RemediationTemplate[]>>("/assessments-v2/remediation-templates", undefined, opts);
    return res.data;
  },

  // ─── Company-scoped assessment responses ────────────────────────────────────

  /** Get all assessment responses for a company */
  async responses(companyId: string, _g?: string | null): Promise<AssessmentResponseItem[]> {
    const res = await apiClient.get<ApiResponse<AssessmentResponseItem[]>>(
      `/companies/${companyId}/assessment-responses`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Batch update assessment responses */
  async updateResponses(companyId: string, payload: BatchAssessmentResponseRequest, _g?: string | null): Promise<AssessmentResponseItem[]> {
    const res = await apiClient.put<ApiResponse<AssessmentResponseItem[]>>(
      `/companies/${companyId}/assessment-responses`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Update a single question response */
  async updateResponse(
    companyId: string,
    questionId: string,
    payload: { status: string; notes?: string | null }
  ): Promise<AssessmentResponseItem> {
    const res = await apiClient.put<ApiResponse<AssessmentResponseItem>>(
      `/companies/${companyId}/assessment-responses/${questionId}`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },

  // ─── Snapshots ──────────────────────────────────────────────────────────────

  /** Get all snapshots for a company */
  async snapshots(companyId: string, _g?: string | null): Promise<AssessmentSnapshot[]> {
    const res = await apiClient.get<ApiResponse<AssessmentSnapshot[]>>(
      `/companies/${companyId}/assessment-snapshots`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Create a new snapshot (recalculates scores from current responses) */
  async createSnapshot(companyId: string, _g?: string | null): Promise<AssessmentSnapshot> {
    const res = await apiClient.post<ApiResponse<AssessmentSnapshot>>(
      `/companies/${companyId}/assessment-snapshots`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Get elaboration status for a snapshot (admin/superadmin only) */
  async snapshotStatus(companyId: string, snapshotId: string, _g?: string | null): Promise<AssessmentSnapshotStatus> {
    const res = await apiClient.get<ApiResponse<AssessmentSnapshotStatus>>(
      `/companies/${companyId}/assessment-snapshots/${snapshotId}/status`,
      undefined,
      _h(companyId, _g)
    );
    return res.data;
  },

  /** Update AI-generated text for a snapshot (admin/superadmin only, only when openai=done) */
  async updateSnapshotAiText(companyId: string, snapshotId: string, payload: UpdateSnapshotAiTextRequest, _g?: string | null): Promise<AssessmentSnapshot> {
    const res = await apiClient.patch<ApiResponse<AssessmentSnapshot>>(
      `/companies/${companyId}/assessment-snapshots/${snapshotId}/ai-text`,
      payload,
      _h(companyId, _g)
    );
    return res.data;
  },
};
