-- NUCLEI-SCAN360 LAB: Nikto engine and unified multi-engine verdict.
-- Additive and idempotent; keeps Nuclei as the only confirmed-CVE engine.

ALTER TABLE public.nuclei_scan360_jobs
  ADD COLUMN IF NOT EXISTS nikto_status text,
  ADD COLUMN IF NOT EXISTS nikto_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS nikto_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS nikto_duration_ms integer,
  ADD COLUMN IF NOT EXISTS nikto_version text,
  ADD COLUMN IF NOT EXISTS nikto_findings_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_nikto_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS unified_verdict jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.nuclei_scan360_jobs
  DROP CONSTRAINT IF EXISTS nuclei_scan360_jobs_stage_check;

ALTER TABLE public.nuclei_scan360_jobs
  ADD CONSTRAINT nuclei_scan360_jobs_stage_check
  CHECK (stage IN ('queued', 'nmap_running', 'nikto_running', 'waiting_nuclei', 'nuclei_running', 'completed', 'failed', 'timeout', 'cancelled'));

DO $$
BEGIN
  ALTER TABLE public.nuclei_scan360_jobs
    ADD CONSTRAINT nuclei_scan360_jobs_nikto_duration_check
    CHECK (nikto_duration_ms IS NULL OR nikto_duration_ms >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.nuclei_scan360_jobs
    ADD CONSTRAINT nuclei_scan360_jobs_nikto_findings_count_check
    CHECK (nikto_findings_count >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.nuclei_scan360_nikto_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.nuclei_scan360_jobs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  port_id uuid REFERENCES public.nuclei_scan360_open_ports(id) ON DELETE SET NULL,
  target_url text,
  asset_host text,
  port integer CHECK (port IS NULL OR port BETWEEN 1 AND 65535),
  tls boolean NOT NULL DEFAULT false,
  severity text NOT NULL DEFAULT 'info',
  category text NOT NULL DEFAULT 'web_exposure',
  nikto_id text,
  method text,
  uri text,
  message text NOT NULL,
  "references" text[] NOT NULL DEFAULT '{}'::text[],
  raw_finding jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.nuclei_scan360_nikto_findings
    ADD CONSTRAINT nuclei_scan360_nikto_findings_severity_check
    CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_nuclei_nikto_findings_job
  ON public.nuclei_scan360_nikto_findings(job_id, created_at);

CREATE INDEX IF NOT EXISTS idx_nuclei_nikto_findings_org_severity
  ON public.nuclei_scan360_nikto_findings(organization_id, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nuclei_nikto_findings_port
  ON public.nuclei_scan360_nikto_findings(port_id);

CREATE INDEX IF NOT EXISTS idx_nuclei_nikto_findings_refs
  ON public.nuclei_scan360_nikto_findings USING gin("references");

ALTER TABLE public.nuclei_scan360_nikto_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read nuclei nikto findings" ON public.nuclei_scan360_nikto_findings;
CREATE POLICY "Super admins read nuclei nikto findings"
  ON public.nuclei_scan360_nikto_findings
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage nuclei nikto findings" ON public.nuclei_scan360_nikto_findings;
CREATE POLICY "Super admins manage nuclei nikto findings"
  ON public.nuclei_scan360_nikto_findings
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nuclei_scan360_nikto_findings TO authenticated;

COMMENT ON TABLE public.nuclei_scan360_nikto_findings IS
  'Nikto LAB findings for NUCLEI-SCAN360. Findings inform exposure/misconfiguration verdicts and are not confirmed CVE validation.';
