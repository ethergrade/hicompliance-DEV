import { useState, useEffect, useCallback } from 'react';
import { assessmentApi } from '@/lib/api';
import type {
  AssessmentData,
  AssessmentReportData,
  AssessmentMonthlyReportData,
  Vulnerability,
  ShodanScan,
  RadarCategory,
  AssessmentSummary,
} from '@/types/api';

interface UseAssessmentReportReturn {
  /** Full assessment data (questions, status, gantt) */
  assessment: AssessmentData | null;
  /** Report data (summary, shodan domain, intelx leaks, openai analysis, gantt) */
  report: AssessmentReportData | null;
  /** Monthly report (vulnerabilities, scans, radar, trend, delta) */
  monthly: AssessmentMonthlyReportData | null;
  /** Vulnerabilities list from monthly report (CVE data) */
  vulnerabilities: Vulnerability[];
  /** Shodan scans from monthly report */
  scans: ShodanScan[];
  /** Radar categories for radar/spider charts */
  radarCategories: RadarCategory[];
  /** Risk/completion summary */
  summary: AssessmentSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAssessmentReport(): UseAssessmentReportReturn {
  const [assessment, setAssessment] = useState<AssessmentData | null>(null);
  const [report, setReport] = useState<AssessmentReportData | null>(null);
  const [monthly, setMonthly] = useState<AssessmentMonthlyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Get current user's assessment
      const assessmentData = await assessmentApi.getLegacy();
      setAssessment(assessmentData);

      const assessmentId = assessmentData.id;

      // Fetch report and monthly report in parallel
      const [reportData, monthlyData] = await Promise.all([
        assessmentApi.report(assessmentId),
        assessmentApi.reportMonthly(assessmentId),
      ]);

      setReport(reportData);
      setMonthly(monthlyData);
    } catch (err: any) {
      // Legacy endpoint failed, try listing assessments
      try {
        const assessments = await assessmentApi.list();
        if (assessments.length > 0) {
          const firstAssessment = assessments[0];
          setAssessment(firstAssessment);

          const [reportData, monthlyData] = await Promise.all([
            assessmentApi.report(firstAssessment.id),
            assessmentApi.reportMonthly(firstAssessment.id),
          ]);

          setReport(reportData);
          setMonthly(monthlyData);
        } else {
          setError('Nessun assessment disponibile');
        }
      } catch (e: any) {
        setError(e?.message || 'Errore nel caricamento dei dati assessment');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    assessment,
    report,
    monthly,
    vulnerabilities: monthly?.vulnerabilities ?? [],
    scans: monthly?.scans ?? [],
    radarCategories: monthly?.radar_categories ?? [],
    summary: report?.summary ?? null,
    loading,
    error,
    refresh: fetchData,
  };
}
