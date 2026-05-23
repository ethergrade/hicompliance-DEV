-- SurfaceScan360 module registry (Web-Check style orchestration visibility)
-- Additive migration: no destructive changes.

CREATE TABLE IF NOT EXISTS public.surface_scan_module_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  tenant_id uuid,
  customer_id uuid,
  scan_job_id uuid NOT NULL REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  module_label text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','success','skipped','error','timeout')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  score integer,
  source text,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_job_id, module_key)
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_surface_scan_module_results_job
  ON public.surface_scan_module_results(scan_job_id, module_key);

CREATE INDEX IF NOT EXISTS idx_surface_scan_module_results_customer
  ON public.surface_scan_module_results(customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_scan_module_results_org
  ON public.surface_scan_module_results(organization_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_surface_scan_module_results_updated_at ON public.surface_scan_module_results;
CREATE TRIGGER trg_surface_scan_module_results_updated_at
BEFORE UPDATE ON public.surface_scan_module_results
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.surface_scan_module_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SurfaceScan module results readable by customer scope" ON public.surface_scan_module_results;
CREATE POLICY "SurfaceScan module results readable by customer scope"
  ON public.surface_scan_module_results FOR SELECT
  USING (
    customer_id IN (
      SELECT u.organization_id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
    )
    OR can_manage_all_organizations(auth.uid())
  );

DROP POLICY IF EXISTS "SurfaceScan module results writable by admin scope" ON public.surface_scan_module_results;
CREATE POLICY "SurfaceScan module results writable by admin scope"
  ON public.surface_scan_module_results FOR ALL
  USING (can_manage_all_organizations(auth.uid()))
  WITH CHECK (can_manage_all_organizations(auth.uid()));
