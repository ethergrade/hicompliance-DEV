import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  AssessmentData,
  AssessmentId,
  AssessmentReportData,
  AssessmentMonthlyReportData,
  UpdateAssessmentRequest,
  UpdateGanttRequest,
} from "@/types/api";

export const assessmentApi = {
  async list(): Promise<AssessmentData[]> {
    const res = await apiClient.get<ApiResponse<AssessmentData[]>>("/assessments");
    return res.data;
  },

  async create(payload: Partial<UpdateAssessmentRequest>): Promise<AssessmentData> {
    const res = await apiClient.post<ApiResponse<AssessmentData>>("/assessments", payload);
    return res.data;
  },

  async get(id: AssessmentId): Promise<AssessmentData> {
    const res = await apiClient.get<ApiResponse<AssessmentData>>(`/assessments/${id}`);
    return res.data;
  },

  async update(id: AssessmentId, payload: UpdateAssessmentRequest): Promise<AssessmentData> {
    const res = await apiClient.patch<ApiResponse<AssessmentData>>(`/assessments/${id}`, payload);
    return res.data;
  },

  async updateGantt(id: AssessmentId, payload: UpdateGanttRequest): Promise<AssessmentData> {
    const res = await apiClient.patch<ApiResponse<AssessmentData>>(`/assessments/${id}/gantt`, payload);
    return res.data;
  },

  async report(id: AssessmentId): Promise<AssessmentReportData> {
    const res = await apiClient.get<ApiResponse<AssessmentReportData>>(`/assessments/${id}/report`);
    return res.data;
  },

  async reportMonthly(id: AssessmentId): Promise<AssessmentMonthlyReportData> {
    const res = await apiClient.get<ApiResponse<AssessmentMonthlyReportData>>(`/assessments/${id}/report-monthly`);
    return res.data;
  },

  async getLegacy(): Promise<AssessmentData> {
    const res = await apiClient.get<ApiResponse<AssessmentData>>("/assessment");
    return res.data;
  },
  async updateLegacy(payload: UpdateAssessmentRequest): Promise<AssessmentData> {
    const res = await apiClient.patch<ApiResponse<AssessmentData>>("/assessment", payload);
    return res.data;
  },
  async reportLegacy(): Promise<AssessmentReportData> {
    const res = await apiClient.get<ApiResponse<AssessmentReportData>>("/assessment/report");
    return res.data;
  },
  async reportMonthlyLegacy(): Promise<AssessmentMonthlyReportData> {
    const res = await apiClient.get<ApiResponse<AssessmentMonthlyReportData>>("/assessment/report-monthly");
    return res.data;
  },
};
