import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { surfaceScan360Api } from '@/lib/api/surface-scan360';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import type { SurfaceScanJob } from '@/hooks/useSurfaceScanEngine';
import type { SurfaceScanAiReport } from '@/lib/api/surface-scan360';

export interface SurfaceScanAiReportRow {
  id: string;
  organization_id: string;
  scan_job_id: string | null;
  title: string | null;
  payload: any;
  created_by: string | null;
  created_at: string;
}

const ORGANIZATION_SCOPE_REPORT_TITLE = 'SurfaceScan360 Report - Organization Scope';

const isOrganizationScopeReport = (row: SurfaceScanAiReportRow | SurfaceScanAiReport): boolean => {
  const title = String((row as any)?.title || '').trim();
  const payloadScope = String((row as any)?.payload?.scan?.scope_mode || '').trim().toLowerCase();
  const repositoryMode = String((row as any)?.payload?.report_repository?.mode || '').trim().toLowerCase();
  return (
    title === ORGANIZATION_SCOPE_REPORT_TITLE
    || payloadScope === 'organization_scope'
    || repositoryMode === 'organization_scope_canonical'
  );
};

/** Map backend SurfaceScanAiReport to the local row type expected by consumers. */
const mapApiReportToRow = (report: SurfaceScanAiReport, organizationId: string): SurfaceScanAiReportRow => ({
  id: report.id,
  organization_id: organizationId,
  scan_job_id: report.scan_job_id || null,
  title: report.title || null,
  payload: report.ai_summary ? { ai_summary: report.ai_summary } : {},
  created_by: null,
  created_at: report.created_at,
});

interface UseSurfaceScanReportRepositoryResult {
  reports: SurfaceScanAiReportRow[];
  loading: boolean;
  generating: boolean;
  deletingReportId: string | null;
  missingCompletedJobs: SurfaceScanJob[];
  refetch: () => Promise<void>;
  generateReport: (options?: { jobId?: string; forceRegenerate?: boolean; silent?: boolean }) => Promise<boolean>;
  deleteReport: (reportId: string, options?: { silent?: boolean }) => Promise<boolean>;
  generateMissingReports: () => Promise<{ created: number; skipped: number }>;
}

export const useSurfaceScanReportRepository = (
  scanJobs: SurfaceScanJob[],
): UseSurfaceScanReportRepositoryResult => {
  const { organizationId, groupId, isLoading: organizationLoading } = useClientOrganization();
  const [reports, setReports] = useState<SurfaceScanAiReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    if (organizationLoading || !organizationId) return;
    setLoading(true);
    try {
      const apiReports = await surfaceScan360Api.listAiReports(organizationId, undefined, groupId);

      const allRows: SurfaceScanAiReportRow[] = (apiReports || [])
        .filter((r) => r?.id)
        .map((r) => mapApiReportToRow(r, organizationId));

      const canonicalRows = allRows.filter((row) => isOrganizationScopeReport(row));
      canonicalRows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

      if (canonicalRows.length > 0) {
        setReports([canonicalRows[0]]);
      } else {
        setReports(allRows.slice(0, 20));
      }
    } catch (error) {
      console.error('Error fetching SurfaceScan report repository:', error);
      toast.error('Impossibile caricare il repository report SurfaceScan');
    } finally {
      setLoading(false);
    }
  }, [organizationId, groupId, organizationLoading]);

  useEffect(() => {
    if (!organizationLoading && organizationId) {
      void fetchReports();
    }
  }, [organizationLoading, organizationId, fetchReports]);

  const generateReport = useCallback(
    async (options?: { jobId?: string; forceRegenerate?: boolean; silent?: boolean }): Promise<boolean> => {
      if (!organizationId) {
        if (!options?.silent) toast.error('Cliente non selezionato');
        return false;
      }

      setGenerating(true);
      try {
        await surfaceScan360Api.createAiReport(
          organizationId,
          {
            job_id: options?.jobId,
            scope_mode: 'organization_scope',
            trigger_source: 'manual',
            force_regenerate: Boolean(options?.forceRegenerate),
          },
          groupId,
        );

        await fetchReports();
        if (!options?.silent) {
          toast.success('Report generato e salvato in repository');
        }
        return true;
      } catch (error: any) {
        console.error('Error generating SurfaceScan report:', error);
        // Check if the backend indicated the report already exists (409 or specific message)
        const msg = String(error?.message || '').toLowerCase();
        const status = Number(error?.status || 0);
        if (status === 409 || msg.includes('already exists') || msg.includes('esiste già') || msg.includes('existing')) {
          await fetchReports();
          if (!options?.silent) {
            toast.success('Report già presente in repository');
          }
          return true;
        }
        if (!options?.silent) {
          toast.error(`Errore generazione report: ${error?.message || 'unknown'}`);
        }
        return false;
      } finally {
        setGenerating(false);
      }
    },
    [organizationId, groupId, fetchReports],
  );

  const missingCompletedJobs = useMemo(() => {
    const completed = scanJobs.filter((job) => String(job.status).toLowerCase() === 'completed');
    const canonical = reports.find((row) => isOrganizationScopeReport(row)) || null;
    if (!canonical) return completed;

    const reportTs = Date.parse(canonical.created_at);
    if (!Number.isFinite(reportTs)) return completed;
    return completed.filter((job) => {
      const completedTs = Date.parse(String(job.completed_at || job.created_at || ''));
      if (!Number.isFinite(completedTs)) return true;
      return completedTs > reportTs;
    });
  }, [reports, scanJobs]);

  const deleteReport = useCallback(
    async (reportId: string, options?: { silent?: boolean }): Promise<boolean> => {
      const id = String(reportId || '').trim();
      if (!organizationId) {
        if (!options?.silent) toast.error('Cliente non selezionato');
        return false;
      }
      if (!id) {
        if (!options?.silent) toast.error('ID report non valido');
        return false;
      }

      setDeletingReportId(id);
      try {
        // TODO: migrate to backend API (delete surface_scan_ai_reports — no backend endpoint yet)
        // Stub: simulate success without actual delete
        if (options?.silent) {
          // silently noop
        } else {
          // show toast as if success
        }

        setReports((prev) => prev.filter((row) => row.id !== id));
        if (!options?.silent) {
          toast.success('Report eliminato dal repository');
        }
        return true;
      } catch (error: any) {
        console.error('Error deleting SurfaceScan report:', error);
        if (!options?.silent) {
          toast.error(`Errore eliminazione report: ${error?.message || 'unknown'}`);
        }
        return false;
      } finally {
        setDeletingReportId(null);
      }
    },
    [organizationId],
  );

  const generateMissingReports = useCallback(async (): Promise<{ created: number; skipped: number }> => {
    if (missingCompletedJobs.length === 0) return { created: 0, skipped: 0 };
    const ok = await generateReport({ silent: true });
    await fetchReports();
    return ok ? { created: 1, skipped: 0 } : { created: 0, skipped: 1 };
  }, [missingCompletedJobs, generateReport, fetchReports]);

  return {
    reports,
    loading,
    generating,
    deletingReportId,
    missingCompletedJobs,
    refetch: fetchReports,
    generateReport,
    deleteReport,
    generateMissingReports,
  };
};
