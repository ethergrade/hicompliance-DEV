-- NUCLEI-SCAN360 LAB pipeline: Nmap -> wait window -> Nuclei -> CVE persistence.
-- Additive and idempotent: preserves existing queued scans and findings.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.nuclei_scan360_jobs
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_input text,
  ADD COLUMN IF NOT EXISTS target_kind text,
  ADD COLUMN IF NOT EXISTS nmap_target text,
  ADD COLUMN IF NOT EXISTS nmap_profile text NOT NULL DEFAULT 'web_top',
  ADD COLUMN IF NOT EXISTS nmap_status text,
  ADD COLUMN IF NOT EXISTS nmap_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS nmap_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS nmap_duration_ms integer,
  ADD COLUMN IF NOT EXISTS nmap_version text,
  ADD COLUMN IF NOT EXISTS open_port_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nmap_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_nmap_result jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  ALTER TABLE public.nuclei_scan360_jobs
    ADD CONSTRAINT nuclei_scan360_jobs_stage_check
    CHECK (stage IN ('queued', 'nmap_running', 'waiting_nuclei', 'nuclei_running', 'completed', 'failed', 'timeout', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.nuclei_scan360_jobs
    ADD CONSTRAINT nuclei_scan360_jobs_nmap_duration_check
    CHECK (nmap_duration_ms IS NULL OR nmap_duration_ms >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.nuclei_scan360_jobs
    ADD CONSTRAINT nuclei_scan360_jobs_open_port_count_check
    CHECK (open_port_count >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

ALTER TABLE public.nuclei_scan360_findings
  ADD COLUMN IF NOT EXISTS cve_ids text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS cvss_score numeric,
  ADD COLUMN IF NOT EXISTS epss_score numeric,
  ADD COLUMN IF NOT EXISTS kev_known_exploited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cve_details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.nuclei_scan360_open_ports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.nuclei_scan360_jobs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  host text,
  hostname text,
  protocol text NOT NULL DEFAULT 'tcp',
  port integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  state text NOT NULL DEFAULT 'open',
  service text,
  product text,
  version text,
  extrainfo text,
  cpe text[] NOT NULL DEFAULT '{}'::text[],
  url_candidates text[] NOT NULL DEFAULT '{}'::text[],
  raw_port jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nuclei_scan360_cve_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.nuclei_scan360_jobs(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.nuclei_scan360_findings(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_host text,
  cve_id text NOT NULL,
  severity text,
  template_id text,
  matched_at text,
  cvss_score numeric,
  epss_score numeric,
  kev_known_exploited boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'nuclei',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nuclei_jobs_stage_next_run
  ON public.nuclei_scan360_jobs(stage, next_run_at, created_at);

CREATE INDEX IF NOT EXISTS idx_nuclei_jobs_org_stage
  ON public.nuclei_scan360_jobs(organization_id, stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nuclei_open_ports_job
  ON public.nuclei_scan360_open_ports(job_id);

CREATE INDEX IF NOT EXISTS idx_nuclei_open_ports_org_port
  ON public.nuclei_scan360_open_ports(organization_id, port, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nuclei_cve_matches_job
  ON public.nuclei_scan360_cve_matches(job_id);

CREATE INDEX IF NOT EXISTS idx_nuclei_cve_matches_org_cve
  ON public.nuclei_scan360_cve_matches(organization_id, cve_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nuclei_findings_cve_ids
  ON public.nuclei_scan360_findings USING gin(cve_ids);

ALTER TABLE public.nuclei_scan360_open_ports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nuclei_scan360_cve_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read nuclei open ports" ON public.nuclei_scan360_open_ports;
CREATE POLICY "Super admins read nuclei open ports"
  ON public.nuclei_scan360_open_ports
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage nuclei open ports" ON public.nuclei_scan360_open_ports;
CREATE POLICY "Super admins manage nuclei open ports"
  ON public.nuclei_scan360_open_ports
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins read nuclei cve matches" ON public.nuclei_scan360_cve_matches;
CREATE POLICY "Super admins read nuclei cve matches"
  ON public.nuclei_scan360_cve_matches
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage nuclei cve matches" ON public.nuclei_scan360_cve_matches;
CREATE POLICY "Super admins manage nuclei cve matches"
  ON public.nuclei_scan360_cve_matches
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nuclei_scan360_open_ports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nuclei_scan360_cve_matches TO authenticated;

DO $$
BEGIN
  UPDATE public.nuclei_scan360_jobs
  SET
    stage = CASE
      WHEN status = 'completed' THEN 'completed'
      WHEN status IN ('failed', 'timeout', 'cancelled') THEN status
      WHEN status = 'running' THEN 'nuclei_running'
      ELSE 'queued'
    END,
    target_input = COALESCE(target_input, target_url),
    target_kind = COALESCE(target_kind, 'url'),
    nmap_target = COALESCE(nmap_target, target_host, target_url)
  WHERE stage = 'queued' OR target_input IS NULL OR nmap_target IS NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'nuclei-scan360-process-ready-every-minute';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'nuclei-scan360-process-ready-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/nuclei-scan360',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-surface-cron', '1'
    ) || CASE
      WHEN COALESCE(current_setting('app.settings.service_role_key', true), '') <> ''
      THEN jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'apikey', current_setting('app.settings.service_role_key', true)
      )
      ELSE '{}'::jsonb
    END || CASE
      WHEN COALESCE(current_setting('app.settings.surface_scan_cron_internal_secret', true), '') <> ''
      THEN jsonb_build_object(
        'x-surface-internal-secret', current_setting('app.settings.surface_scan_cron_internal_secret', true)
      )
      ELSE '{}'::jsonb
    END || CASE
      WHEN COALESCE(current_setting('app.settings.nuclei_scan360_internal_secret', true), '') <> ''
      THEN jsonb_build_object(
        'x-nuclei-scan360-internal-secret', current_setting('app.settings.nuclei_scan360_internal_secret', true)
      )
      ELSE '{}'::jsonb
    END,
    body := jsonb_build_object(
      'action', 'process_queue',
      'limit', 1,
      'trigger', 'cron',
      'at', now()::text
    ),
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);
