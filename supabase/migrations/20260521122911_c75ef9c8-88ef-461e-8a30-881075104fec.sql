-- Engine OSINT SurfaceScan360 — Fase 1

CREATE TABLE public.surface_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  requested_by uuid,
  raw_target text NOT NULL,
  normalized_target text NOT NULL,
  target_type text NOT NULL,
  hostname text,
  root_domain text,
  protocol text,
  port int,
  resolved_ips text[] NOT NULL DEFAULT '{}',
  scan_profile text NOT NULL DEFAULT 'safe_recon',
  status text NOT NULL DEFAULT 'queued',
  authorization_confirmed boolean NOT NULL DEFAULT false,
  hosting_context text NOT NULL DEFAULT 'unknown',
  shodan_status text NOT NULL DEFAULT 'unknown',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ssj_org_created ON public.surface_scan_jobs(organization_id, created_at DESC);
CREATE INDEX idx_ssj_status ON public.surface_scan_jobs(status);

CREATE TABLE public.surface_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  scan_job_id uuid NOT NULL REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  asset_value text NOT NULL,
  hostname text,
  root_domain text,
  ip inet,
  source text NOT NULL,
  confidence text NOT NULL DEFAULT 'medium',
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  raw jsonb
);
CREATE INDEX idx_sa_org_job ON public.surface_assets(organization_id, scan_job_id);

CREATE TABLE public.surface_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  scan_job_id uuid NOT NULL REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  asset_id uuid,
  module text NOT NULL,
  observation_type text NOT NULL,
  title text,
  value jsonb NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  confidence text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_so_org_job ON public.surface_observations(organization_id, scan_job_id);
CREATE INDEX idx_so_module ON public.surface_observations(module);

CREATE TABLE public.surface_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  scan_job_id uuid NOT NULL REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  provider text,
  module text,
  finding_type text NOT NULL,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'info',
  affected_asset text,
  affected_url text,
  ip inet,
  port int,
  protocol text,
  cve text[] NOT NULL DEFAULT '{}',
  cwe text[] NOT NULL DEFAULT '{}',
  cvss numeric,
  epss numeric,
  cisa_kev boolean NOT NULL DEFAULT false,
  remediation text,
  evidence jsonb,
  attribution_confidence text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sf_org_job ON public.surface_findings(organization_id, scan_job_id);
CREATE INDEX idx_sf_severity ON public.surface_findings(severity);

CREATE TABLE public.surface_external_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  scan_job_id uuid NOT NULL REFERENCES public.surface_scan_jobs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  target text NOT NULL,
  found boolean NOT NULL DEFAULT false,
  summary jsonb,
  raw_response jsonb,
  confidence text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sei_org_job ON public.surface_external_intel(organization_id, scan_job_id);

CREATE TABLE public.surface_scan_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  scan_job_id uuid,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ssal_org_created ON public.surface_scan_audit_log(organization_id, created_at DESC);

-- RLS
ALTER TABLE public.surface_scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_external_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_scan_audit_log ENABLE ROW LEVEL SECURITY;

-- surface_scan_jobs
CREATE POLICY "Users view own org scan jobs" ON public.surface_scan_jobs FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Sales view all scan jobs" ON public.surface_scan_jobs FOR SELECT
USING (can_manage_all_organizations(auth.uid()));
CREATE POLICY "Admins insert own org scan jobs" ON public.surface_scan_jobs FOR INSERT
WITH CHECK (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() AND user_type = 'admin'::user_type));
CREATE POLICY "Sales manage all scan jobs" ON public.surface_scan_jobs FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- surface_assets
CREATE POLICY "Users view own org assets" ON public.surface_assets FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Sales manage all assets" ON public.surface_assets FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- surface_observations
CREATE POLICY "Users view own org observations" ON public.surface_observations FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Sales manage all observations" ON public.surface_observations FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- surface_findings
CREATE POLICY "Users view own org sf" ON public.surface_findings FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Admins update own org sf" ON public.surface_findings FOR UPDATE
USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() AND user_type = 'admin'::user_type));
CREATE POLICY "Sales manage all sf" ON public.surface_findings FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- surface_external_intel
CREATE POLICY "Users view own org sei" ON public.surface_external_intel FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Sales manage all sei" ON public.surface_external_intel FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- surface_scan_audit_log
CREATE POLICY "Users view own org audit" ON public.surface_scan_audit_log FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Sales view all audit" ON public.surface_scan_audit_log FOR SELECT
USING (can_manage_all_organizations(auth.uid()));
CREATE POLICY "Service inserts audit" ON public.surface_scan_audit_log FOR INSERT
WITH CHECK (true);
