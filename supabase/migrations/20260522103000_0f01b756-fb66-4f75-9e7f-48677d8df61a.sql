-- SurfaceScan360: core scan engine tables

CREATE TABLE IF NOT EXISTS public.surface_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  customer_id uuid,
  requested_by uuid,
  raw_target text NOT NULL,
  normalized_target text NOT NULL,
  target_type text NOT NULL,
  hostname text,
  root_domain text,
  resolved_ips text[],
  scan_profile text NOT NULL DEFAULT 'safe_recon',
  status text NOT NULL DEFAULT 'queued',
  authorization_confirmed boolean DEFAULT false,
  hosting_context text DEFAULT 'unknown',
  shodan_status text DEFAULT 'unknown',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surface_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  customer_id uuid,
  scan_job_id uuid REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  asset_value text NOT NULL,
  hostname text,
  root_domain text,
  ip inet,
  source text NOT NULL,
  confidence text DEFAULT 'medium',
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  raw jsonb
);

CREATE TABLE IF NOT EXISTS public.surface_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  customer_id uuid,
  scan_job_id uuid REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  asset_id uuid,
  module text NOT NULL,
  observation_type text NOT NULL,
  title text,
  value jsonb NOT NULL,
  severity text DEFAULT 'info',
  confidence text DEFAULT 'medium',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surface_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  customer_id uuid,
  scan_job_id uuid REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  provider text,
  module text,
  finding_type text NOT NULL,
  title text NOT NULL,
  description text,
  severity text DEFAULT 'info',
  affected_asset text,
  affected_url text,
  ip inet,
  port int,
  protocol text,
  cve text[],
  cwe text[],
  cvss numeric,
  epss numeric,
  cisa_kev boolean DEFAULT false,
  remediation text,
  evidence jsonb,
  attribution_confidence text DEFAULT 'medium',
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surface_external_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  customer_id uuid,
  scan_job_id uuid REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  target text NOT NULL,
  found boolean DEFAULT false,
  summary jsonb,
  raw_response jsonb,
  confidence text DEFAULT 'medium',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surface_scan_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid,
  user_id uuid,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surface_scan_jobs_customer_status
  ON public.surface_scan_jobs(customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_surface_scan_jobs_requested_by
  ON public.surface_scan_jobs(requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_assets_job
  ON public.surface_assets(scan_job_id);
CREATE INDEX IF NOT EXISTS idx_surface_assets_customer
  ON public.surface_assets(customer_id, asset_type, asset_value);

CREATE INDEX IF NOT EXISTS idx_surface_observations_job
  ON public.surface_observations(scan_job_id, module);
CREATE INDEX IF NOT EXISTS idx_surface_findings_job
  ON public.surface_findings(scan_job_id, severity);
CREATE INDEX IF NOT EXISTS idx_surface_findings_customer
  ON public.surface_findings(customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_external_intel_job
  ON public.surface_external_intel(scan_job_id, provider);
CREATE INDEX IF NOT EXISTS idx_surface_scan_audit_job
  ON public.surface_scan_audit_log(scan_job_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.surface_scan_is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE auth_user_id = _user_id
      AND user_type = 'admin'::user_type
  ) OR public.has_role(_user_id, 'super_admin'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.surface_scan_can_access_customer(_user_id uuid, _customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE auth_user_id = _user_id
      AND organization_id = _customer_id
  ) OR public.can_manage_all_organizations(_user_id)
$$;

ALTER TABLE public.surface_scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_external_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_scan_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SurfaceScan jobs readable by customer scope" ON public.surface_scan_jobs;
CREATE POLICY "SurfaceScan jobs readable by customer scope"
  ON public.surface_scan_jobs FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), customer_id));

DROP POLICY IF EXISTS "SurfaceScan jobs writable by admin scope" ON public.surface_scan_jobs;
CREATE POLICY "SurfaceScan jobs writable by admin scope"
  ON public.surface_scan_jobs FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "SurfaceScan assets readable by customer scope" ON public.surface_assets;
CREATE POLICY "SurfaceScan assets readable by customer scope"
  ON public.surface_assets FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), customer_id));

DROP POLICY IF EXISTS "SurfaceScan assets writable by admin scope" ON public.surface_assets;
CREATE POLICY "SurfaceScan assets writable by admin scope"
  ON public.surface_assets FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "SurfaceScan observations readable by customer scope" ON public.surface_observations;
CREATE POLICY "SurfaceScan observations readable by customer scope"
  ON public.surface_observations FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), customer_id));

DROP POLICY IF EXISTS "SurfaceScan observations writable by admin scope" ON public.surface_observations;
CREATE POLICY "SurfaceScan observations writable by admin scope"
  ON public.surface_observations FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "SurfaceScan findings readable by customer scope" ON public.surface_findings;
CREATE POLICY "SurfaceScan findings readable by customer scope"
  ON public.surface_findings FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), customer_id));

DROP POLICY IF EXISTS "SurfaceScan findings writable by admin scope" ON public.surface_findings;
CREATE POLICY "SurfaceScan findings writable by admin scope"
  ON public.surface_findings FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "SurfaceScan external intel readable by customer scope" ON public.surface_external_intel;
CREATE POLICY "SurfaceScan external intel readable by customer scope"
  ON public.surface_external_intel FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), customer_id));

DROP POLICY IF EXISTS "SurfaceScan external intel writable by admin scope" ON public.surface_external_intel;
CREATE POLICY "SurfaceScan external intel writable by admin scope"
  ON public.surface_external_intel FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "SurfaceScan audit readable by customer scope" ON public.surface_scan_audit_log;
CREATE POLICY "SurfaceScan audit readable by customer scope"
  ON public.surface_scan_audit_log FOR SELECT
  TO authenticated
  USING (
    scan_job_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.surface_scan_jobs j
      WHERE j.id = surface_scan_audit_log.scan_job_id
        AND public.surface_scan_can_access_customer(auth.uid(), j.customer_id)
    )
  );

DROP POLICY IF EXISTS "SurfaceScan audit writable by admin scope" ON public.surface_scan_audit_log;
CREATE POLICY "SurfaceScan audit writable by admin scope"
  ON public.surface_scan_audit_log FOR ALL
  TO authenticated
  USING (public.surface_scan_is_admin(auth.uid()))
  WITH CHECK (public.surface_scan_is_admin(auth.uid()));
