import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  AssessmentData,
  AssessmentReportData,
  AssessmentMonthlyReportData,
  UpdateAssessmentRequest,
} from "@/types/api";

export const assessmentApi = {
  /** Get assessment for the authenticated tenant */
  async get(): Promise<AssessmentData> {
    const res = await apiClient.get<ApiResponse<AssessmentData>>("/assessment");
    return res.data;
  },

  /** Update assessment (questions, status, etc.) */
  async update(payload: UpdateAssessmentRequest): Promise<AssessmentData> {
    const res = await apiClient.patch<ApiResponse<AssessmentData>>("/assessment", payload);
    return res.data;
  },

  /** Full NIS2 report for the authenticated tenant */
  async report(): Promise<AssessmentReportData> {
    const res = await apiClient.get<ApiResponse<AssessmentReportData>>("/assessment/report");
    return res.data;
  },

  /** Monthly report with Shodan scans */
  async reportMonthly(): Promise<AssessmentMonthlyReportData> {
    const res = await apiClient.get<ApiResponse<AssessmentMonthlyReportData>>("/assessment/report-monthly");
    return res.data;
  },

  /** Full report for a specific assessment ID (admin) */
  async reportById(assessmentId: number): Promise<AssessmentReportData> {
    const res = await apiClient.get<ApiResponse<AssessmentReportData>>(`/assessments/${assessmentId}/report`);
    return res.data;
  },

  /** Monthly report for a specific assessment ID (admin) */
  async reportMonthlyById(assessmentId: number): Promise<AssessmentMonthlyReportData> {
    const res = await apiClient.get<ApiResponse<AssessmentMonthlyReportData>>(`/assessments/${assessmentId}/report-monthly`);
    return res.data;
  },
};
