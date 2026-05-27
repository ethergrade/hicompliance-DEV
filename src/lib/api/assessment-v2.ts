import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  AssessmentCategory,
  AssessmentQuestion,
  AssessmentResponseItem,
  AssessmentSnapshot,
  BatchAssessmentResponseRequest,
  RemediationTemplate,
} from "@/types/api";

export const assessmentV2Api = {
  /** Get all assessment categories with nested questions */
  async categories(): Promise<AssessmentCategory[]> {
    const res = await apiClient.get<ApiResponse<AssessmentCategory[]>>("/assessments-v2/categories");
    return res.data;
  },

  /** Get all 132 questions */
  async questions(): Promise<AssessmentQuestion[]> {
    const res = await apiClient.get<ApiResponse<AssessmentQuestion[]>>("/assessments-v2/questions");
    return res.data;
  },

  /** Get remediation template catalog */
  async remediationTemplates(): Promise<RemediationTemplate[]> {
    const res = await apiClient.get<ApiResponse<RemediationTemplate[]>>("/assessments-v2/remediation-templates");
    return res.data;
  },

  // ─── Company-scoped assessment responses ────────────────────────────────────

  /** Get all assessment responses for a company */
  async responses(companyId: string): Promise<AssessmentResponseItem[]> {
    const res = await apiClient.get<ApiResponse<AssessmentResponseItem[]>>(
      `/companies/${companyId}/assessment-responses`
    );
    return res.data;
  },

  /** Batch update assessment responses */
  async updateResponses(companyId: string, payload: BatchAssessmentResponseRequest): Promise<AssessmentResponseItem[]> {
    const res = await apiClient.put<ApiResponse<AssessmentResponseItem[]>>(
      `/companies/${companyId}/assessment-responses`,
      payload
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
      payload
    );
    return res.data;
  },

  // ─── Snapshots ──────────────────────────────────────────────────────────────

  /** Get all snapshots for a company */
  async snapshots(companyId: string): Promise<AssessmentSnapshot[]> {
    const res = await apiClient.get<ApiResponse<AssessmentSnapshot[]>>(
      `/companies/${companyId}/assessment-snapshots`
    );
    return res.data;
  },

  /** Create a new snapshot (recalculates scores from current responses) */
  async createSnapshot(companyId: string): Promise<AssessmentSnapshot> {
    const res = await apiClient.post<ApiResponse<AssessmentSnapshot>>(
      `/companies/${companyId}/assessment-snapshots`
    );
    return res.data;
  },
};
