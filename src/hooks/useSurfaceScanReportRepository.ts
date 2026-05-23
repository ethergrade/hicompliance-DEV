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
      setReports(((data || []) as SurfaceScanAiReportRow[]).filter((row) => row?.payload));
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
    const reportJobIds = new Set(
      reports
        .map((row) => String(row.scan_job_id || '').trim())
        .filter(Boolean),
    );
    return completed.filter((job) => !reportJobIds.has(job.id));
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
    let created = 0;
    let skipped = 0;
    for (const job of missingCompletedJobs) {
      const ok = await generateReport({ jobId: job.id, silent: true });
      if (ok) created += 1;
      else skipped += 1;
    }
    await fetchReports();
    return { created, skipped };
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
