import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import type { SurfaceScanJob } from '@/hooks/useSurfaceScanEngine';

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

const isOrganizationScopeReport = (row: SurfaceScanAiReportRow): boolean => {
  const title = String(row?.title || '').trim();
  const payloadScope = String(row?.payload?.scan?.scope_mode || '').trim().toLowerCase();
  const repositoryMode = String(row?.payload?.report_repository?.mode || '').trim().toLowerCase();
  return (
    title === ORGANIZATION_SCOPE_REPORT_TITLE
    || payloadScope === 'organization_scope'
    || repositoryMode === 'organization_scope_canonical'
  );
};

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
  const { organizationId, isLoading: organizationLoading } = useClientOrganization();
  const [reports, setReports] = useState<SurfaceScanAiReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    if (organizationLoading || !organizationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('surface_scan_ai_reports')
        .select('id, organization_id, scan_job_id, title, payload, created_by, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const allRows = ((data || []) as SurfaceScanAiReportRow[]).filter((row) => row?.payload);
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
  }, [organizationId, organizationLoading]);

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
        const { data, error } = await supabase.functions.invoke('surfacescan360-ai-report', {
          body: {
            organization_id: organizationId,
            job_id: options?.jobId,
            scope_mode: 'organization_scope',
            trigger_source: 'manual',
            force_regenerate: Boolean(options?.forceRegenerate),
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        await fetchReports();
        if (!options?.silent) {
          if ((data as any)?.existing) {
            toast.success('Report già presente in repository');
          } else {
            toast.success('Report generato e salvato in repository');
          }
        }
        return true;
      } catch (error: any) {
        console.error('Error generating SurfaceScan report:', error);
        if (!options?.silent) {
          toast.error(`Errore generazione report: ${error?.message || 'unknown'}`);
        }
        return false;
      } finally {
        setGenerating(false);
      }
    },
    [organizationId, fetchReports],
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
        const { error } = await supabase
          .from('surface_scan_ai_reports')
          .delete()
          .eq('id', id)
          .eq('organization_id', organizationId);

        if (error) throw error;

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
