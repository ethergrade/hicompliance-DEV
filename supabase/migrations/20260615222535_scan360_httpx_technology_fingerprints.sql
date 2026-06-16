-- NUCLEI-SCAN360 LAB: safe HTTP technology fingerprinting with httpx/Wappalyzer signals.
-- Additive and idempotent; CVE validation remains owned by Nuclei, while NVD/CPE matches stay potential.

ALTER TABLE public.nuclei_scan360_jobs
  ADD COLUMN IF NOT EXISTS raw_technology_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS technology_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fingerprint_status text,
  ADD COLUMN IF NOT EXISTS fingerprint_duration_ms integer;

DO $$
BEGIN
  ALTER TABLE public.nuclei_scan360_jobs
    ADD CONSTRAINT nuclei_scan360_jobs_technology_count_check
    CHECK (technology_count >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.nuclei_scan360_jobs
    ADD CONSTRAINT nuclei_scan360_jobs_fingerprint_duration_check
    CHECK (fingerprint_duration_ms IS NULL OR fingerprint_duration_ms >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.nuclei_scan360_technologies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.nuclei_scan360_jobs(id) ON DELETE CASCADE,
  port_id uuid REFERENCES public.nuclei_scan360_open_ports(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url text,
  asset_host text,
  port integer CHECK (port IS NULL OR port BETWEEN 1 AND 65535),
  name text NOT NULL,
  version text,
  source text NOT NULL DEFAULT 'httpx_wappalyzer',
  confidence text NOT NULL DEFAULT 'low',
  category text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  cpe_candidates text[] NOT NULL DEFAULT '{}'::text[],
  raw_technology jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.nuclei_scan360_technologies
    ADD CONSTRAINT nuclei_scan360_technologies_confidence_check
    CHECK (confidence IN ('high', 'medium', 'low'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_nuclei_technologies_job
  ON public.nuclei_scan360_technologies(job_id, created_at);

CREATE INDEX IF NOT EXISTS idx_nuclei_technologies_org_name
  ON public.nuclei_scan360_technologies(organization_id, lower(name), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nuclei_technologies_port
  ON public.nuclei_scan360_technologies(port_id);

CREATE INDEX IF NOT EXISTS idx_nuclei_technologies_cpe_candidates
  ON public.nuclei_scan360_technologies USING gin(cpe_candidates);

ALTER TABLE public.nuclei_scan360_technologies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read nuclei technologies" ON public.nuclei_scan360_technologies;
CREATE POLICY "Super admins read nuclei technologies"
  ON public.nuclei_scan360_technologies
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage nuclei technologies" ON public.nuclei_scan360_technologies;
CREATE POLICY "Super admins manage nuclei technologies"
  ON public.nuclei_scan360_technologies
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nuclei_scan360_technologies TO authenticated;
