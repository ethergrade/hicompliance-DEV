-- SurfaceScan360 exposure pipeline (Pentest-Tools): additive schema
-- NOTE: keeps existing SurfaceScan360 schema compatible and avoids destructive changes.

-- Extend existing jobs table with exposure metadata if missing
ALTER TABLE IF EXISTS public.surface_scan_jobs
  ADD COLUMN IF NOT EXISTS scan_name text,
  ADD COLUMN IF NOT EXISTS scan_type text NOT NULL DEFAULT 'exposure_port_technology',
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'surface_scan_jobs' AND column_name = 'organization_id'
  ) THEN
    UPDATE public.surface_scan_jobs
    SET organization_id = COALESCE(organization_id, customer_id)
    WHERE organization_id IS NULL;
  END IF;
END $$;

-- 1) Scan targets for each exposure job
CREATE TABLE IF NOT EXISTS public.surface_scan_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid NOT NULL REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  organization_id uuid,
  tenant_id uuid,
  customer_id uuid NOT NULL,
  target_value text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('domain', 'subdomain', 'ip', 'url')),
  root_domain text,
  source text NOT NULL DEFAULT 'manual',
  resolved_ips text[] DEFAULT '{}'::text[],
  is_authorized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_job_id, target_value, target_type)
);

CREATE INDEX IF NOT EXISTS idx_surface_scan_targets_job
  ON public.surface_scan_targets(scan_job_id);
CREATE INDEX IF NOT EXISTS idx_surface_scan_targets_customer
  ON public.surface_scan_targets(customer_id, target_type, target_value);

-- 2) Pentest-Tools scan queue/state per task
CREATE TABLE IF NOT EXISTS public.pentest_tools_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid NOT NULL REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.surface_scan_targets(id) ON DELETE SET NULL,
  organization_id uuid,
  tenant_id uuid,
  customer_id uuid NOT NULL,
  remote_scan_id bigint,
  remote_target_id bigint,
  tool_id int NOT NULL,
  tool_name text NOT NULL,
  phase text NOT NULL,
  target_name text NOT NULL,
  tool_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  progress int,
  raw_output jsonb,
  error_message text,
  retry_count int NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pentest_tools_scans_remote
  ON public.pentest_tools_scans(remote_scan_id)
  WHERE remote_scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pentest_tools_scans_job
  ON public.pentest_tools_scans(scan_job_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pentest_tools_scans_retry
  ON public.pentest_tools_scans(status, next_retry_at)
  WHERE status IN ('queued', 'running', 'waiting', 'retry');

-- 3) Normalized open ports/services
CREATE TABLE IF NOT EXISTS public.surface_open_ports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid NOT NULL REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.surface_scan_targets(id) ON DELETE SET NULL,
  organization_id uuid,
  tenant_id uuid,
  customer_id uuid NOT NULL,
  host text NOT NULL,
  ip text,
  port int NOT NULL,
  protocol text NOT NULL DEFAULT 'tcp',
  state text NOT NULL,
  service_name text,
  service_product text,
  service_version text,
  service_extra_info text,
  os_guess text,
  banner text,
  is_web boolean NOT NULL DEFAULT false,
  is_tls boolean NOT NULL DEFAULT false,
  exposure_level text NOT NULL DEFAULT 'info',
  business_risk text,
  remediation_hint text,
  source_scan_id uuid REFERENCES public.pentest_tools_scans(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (scan_job_id, host, port, protocol)
);

CREATE INDEX IF NOT EXISTS idx_surface_open_ports_customer
  ON public.surface_open_ports(customer_id, exposure_level, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_surface_open_ports_host
  ON public.surface_open_ports(scan_job_id, host, port);

-- 4) Web technology fingerprinting
CREATE TABLE IF NOT EXISTS public.surface_web_technologies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid NOT NULL REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.surface_scan_targets(id) ON DELETE SET NULL,
  organization_id uuid,
  tenant_id uuid,
  customer_id uuid NOT NULL,
  url text NOT NULL,
  host text NOT NULL,
  port int,
  technology_name text NOT NULL,
  technology_version text,
  category text,
  confidence numeric,
  source text NOT NULL DEFAULT 'pentest_tools_website_recon',
  source_scan_id uuid REFERENCES public.pentest_tools_scans(id) ON DELETE SET NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_surface_web_tech_unique
  ON public.surface_web_technologies(scan_job_id, url, technology_name, COALESCE(technology_version, ''));
CREATE INDEX IF NOT EXISTS idx_surface_web_tech_customer
  ON public.surface_web_technologies(customer_id, technology_name, created_at DESC);

-- 5) SSL/TLS scan snapshots
CREATE TABLE IF NOT EXISTS public.surface_ssl_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid NOT NULL REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.surface_scan_targets(id) ON DELETE SET NULL,
  organization_id uuid,
  tenant_id uuid,
  customer_id uuid NOT NULL,
  url text NOT NULL,
  host text NOT NULL,
  port int NOT NULL,
  certificate_subject text,
  certificate_issuer text,
  certificate_not_before timestamptz,
  certificate_not_after timestamptz,
  grade text,
  weak_protocols text[],
  weak_ciphers text[],
  source_scan_id uuid REFERENCES public.pentest_tools_scans(id) ON DELETE SET NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surface_ssl_results_customer
  ON public.surface_ssl_results(customer_id, host, created_at DESC);

-- 6) Exposure findings (separate from generic surface_findings for focused UX)
CREATE TABLE IF NOT EXISTS public.surface_exposure_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid NOT NULL REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.surface_scan_targets(id) ON DELETE SET NULL,
  organization_id uuid,
  tenant_id uuid,
  customer_id uuid NOT NULL,
  finding_type text NOT NULL,
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  cvss numeric,
  cve_ids text[],
  affected_host text,
  affected_port int,
  affected_url text,
  description text,
  evidence text,
  recommendation text,
  source text NOT NULL DEFAULT 'surface_exposure_engine',
  source_scan_id uuid REFERENCES public.pentest_tools_scans(id) ON DELETE SET NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surface_exposure_findings_job
  ON public.surface_exposure_findings(scan_job_id, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_surface_exposure_findings_customer
  ON public.surface_exposure_findings(customer_id, status, created_at DESC);

-- 7) Latest open-port snapshot view for quick comparisons
CREATE OR REPLACE VIEW public.surface_open_ports_latest AS
SELECT DISTINCT ON (customer_id, host, port, protocol)
  *
FROM public.surface_open_ports
ORDER BY customer_id, host, port, protocol, last_seen_at DESC;

-- keep updated_at fresh where available
DROP TRIGGER IF EXISTS trg_surface_scan_jobs_updated_at ON public.surface_scan_jobs;
CREATE TRIGGER trg_surface_scan_jobs_updated_at
BEFORE UPDATE ON public.surface_scan_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pentest_tools_scans_updated_at ON public.pentest_tools_scans;
CREATE TRIGGER trg_pentest_tools_scans_updated_at
BEFORE UPDATE ON public.pentest_tools_scans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.surface_scan_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pentest_tools_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_open_ports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_web_technologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_ssl_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_exposure_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Surface scan targets readable" ON public.surface_scan_targets;
CREATE POLICY "Surface scan targets readable"
  ON public.surface_scan_targets FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), customer_id));

DROP POLICY IF EXISTS "Surface scan targets writable" ON public.surface_scan_targets;
CREATE POLICY "Surface scan targets writable"
  ON public.surface_scan_targets FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Pentest scans readable" ON public.pentest_tools_scans;
CREATE POLICY "Pentest scans readable"
  ON public.pentest_tools_scans FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), customer_id));

DROP POLICY IF EXISTS "Pentest scans writable" ON public.pentest_tools_scans;
CREATE POLICY "Pentest scans writable"
  ON public.pentest_tools_scans FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Surface open ports readable" ON public.surface_open_ports;
CREATE POLICY "Surface open ports readable"
  ON public.surface_open_ports FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), customer_id));

DROP POLICY IF EXISTS "Surface open ports writable" ON public.surface_open_ports;
CREATE POLICY "Surface open ports writable"
  ON public.surface_open_ports FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Surface web tech readable" ON public.surface_web_technologies;
CREATE POLICY "Surface web tech readable"
  ON public.surface_web_technologies FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), customer_id));

DROP POLICY IF EXISTS "Surface web tech writable" ON public.surface_web_technologies;
CREATE POLICY "Surface web tech writable"
  ON public.surface_web_technologies FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Surface ssl readable" ON public.surface_ssl_results;
CREATE POLICY "Surface ssl readable"
  ON public.surface_ssl_results FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), customer_id));

DROP POLICY IF EXISTS "Surface ssl writable" ON public.surface_ssl_results;
CREATE POLICY "Surface ssl writable"
  ON public.surface_ssl_results FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Surface exposure findings readable" ON public.surface_exposure_findings;
CREATE POLICY "Surface exposure findings readable"
  ON public.surface_exposure_findings FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), customer_id));

DROP POLICY IF EXISTS "Surface exposure findings writable" ON public.surface_exposure_findings;
CREATE POLICY "Surface exposure findings writable"
  ON public.surface_exposure_findings FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), customer_id)
    AND public.surface_scan_is_admin(auth.uid())
  );
