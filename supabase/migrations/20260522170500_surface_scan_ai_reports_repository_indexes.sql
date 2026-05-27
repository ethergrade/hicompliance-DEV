-- SurfaceScan360 report repository performance indexes
CREATE INDEX IF NOT EXISTS idx_ssai_org_job_created
  ON public.surface_scan_ai_reports(organization_id, scan_job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ssai_scan_job_created
  ON public.surface_scan_ai_reports(scan_job_id, created_at DESC);

