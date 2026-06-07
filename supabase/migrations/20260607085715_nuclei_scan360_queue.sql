-- NUCLEI-SCAN360 queued scans and normalized findings.
-- Additive schema: no changes to existing SurfaceScan360 tables.

CREATE TABLE IF NOT EXISTS public.nuclei_scan360_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'surface_assets', 'mixed')),
  target_url text NOT NULL,
  normalized_target_url text NOT NULL,
  resolved_target_url text,
  target_host text,
  profile text NOT NULL
    CHECK (profile IN ('baseline_headers', 'exposure_medium', 'web_vuln_safe', 'web_vuln_authorized')),
  authorized_scan boolean NOT NULL DEFAULT false,
  timeout_seconds integer NOT NULL DEFAULT 45 CHECK (timeout_seconds BETWEEN 15 AND 180),
  rate_limit integer NOT NULL DEFAULT 5 CHECK (rate_limit BETWEEN 1 AND 10),
  max_findings integer NOT NULL DEFAULT 25 CHECK (max_findings BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'timeout', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  nuclei_version text,
  templates_loaded_count integer CHECK (templates_loaded_count IS NULL OR templates_loaded_count >= 0),
  templates_executed_count integer CHECK (templates_executed_count IS NULL OR templates_executed_count >= 0),
  findings_count integer NOT NULL DEFAULT 0 CHECK (findings_count >= 0),
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nuclei_scan360_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.nuclei_scan360_jobs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id text,
  name text,
  severity text,
  type text,
  category text,
  matcher_name text,
  matched_at text,
  asset_host text,
  extracted_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_finding jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nuclei_jobs_org_status
  ON public.nuclei_scan360_jobs(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nuclei_jobs_customer_created
  ON public.nuclei_scan360_jobs(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nuclei_jobs_active_dedupe
  ON public.nuclei_scan360_jobs(organization_id, normalized_target_url, profile)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_nuclei_findings_job
  ON public.nuclei_scan360_findings(job_id);

CREATE INDEX IF NOT EXISTS idx_nuclei_findings_org_severity
  ON public.nuclei_scan360_findings(organization_id, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nuclei_findings_asset
  ON public.nuclei_scan360_findings(organization_id, asset_host, created_at DESC);

ALTER TABLE public.nuclei_scan360_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nuclei_scan360_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read nuclei jobs" ON public.nuclei_scan360_jobs;
CREATE POLICY "Super admins read nuclei jobs"
  ON public.nuclei_scan360_jobs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage nuclei jobs" ON public.nuclei_scan360_jobs;
CREATE POLICY "Super admins manage nuclei jobs"
  ON public.nuclei_scan360_jobs
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins read nuclei findings" ON public.nuclei_scan360_findings;
CREATE POLICY "Super admins read nuclei findings"
  ON public.nuclei_scan360_findings
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage nuclei findings" ON public.nuclei_scan360_findings;
CREATE POLICY "Super admins manage nuclei findings"
  ON public.nuclei_scan360_findings
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nuclei_scan360_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nuclei_scan360_findings TO authenticated;
