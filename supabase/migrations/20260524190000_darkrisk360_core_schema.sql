-- DarkRisk360 core schema (MD02 + MD03 foundation)
-- Additive, organization-scoped, backward-compatible.

DO $$ BEGIN
  CREATE TYPE public.darkrisk_source AS ENUM ('surfacescan360', 'intelx', 'openai', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_scan_status AS ENUM ('queued', 'running', 'completed', 'completed_with_warnings', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_asset_type AS ENUM ('domain', 'subdomain', 'url', 'ip', 'cidr', 'email', 'mx', 'ns', 'host', 'service', 'certificate', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_selector_type AS ENUM ('email', 'domain', 'wildcard_domain', 'url', 'ipv4', 'ipv6', 'cidrv4', 'cidrv6', 'phone', 'bitcoin', 'mac', 'ipfs', 'uuid', 'storageid', 'systemid', 'simhash', 'credit_card', 'iban');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_severity AS ENUM ('info', 'low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_confidence AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_finding_status AS ENUM ('new', 'triaged', 'validated', 'false_positive', 'accepted_risk', 'remediation_in_progress', 'resolved', 'suppressed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_visibility AS ENUM ('customer', 'analyst', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE IF EXISTS public.darkrisk_entitlements
  ADD COLUMN IF NOT EXISTS scan_frequency text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS max_intelx_results_per_selector integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS enable_phonebook boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_raw_evidence boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_recommendations boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS retention_days integer NOT NULL DEFAULT 365;

CREATE TABLE IF NOT EXISTS public.darkrisk_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  asset_type public.darkrisk_asset_type NOT NULL,
  value text NOT NULL,
  normalized_value text NOT NULL,
  source public.darkrisk_source NOT NULL DEFAULT 'manual',
  scope_status text NOT NULL DEFAULT 'approved',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, asset_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_assets_org ON public.darkrisk_assets(organization_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_darkrisk_assets_normalized ON public.darkrisk_assets(normalized_value);

CREATE TABLE IF NOT EXISTS public.darkrisk_selectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  asset_id uuid REFERENCES public.darkrisk_assets(id) ON DELETE SET NULL,
  selector_type public.darkrisk_selector_type NOT NULL,
  value text NOT NULL,
  normalized_value text NOT NULL,
  source public.darkrisk_source NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'approved',
  sensitivity text NOT NULL DEFAULT 'normal',
  discovered_from uuid REFERENCES public.darkrisk_selectors(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, selector_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_selectors_org ON public.darkrisk_selectors(organization_id, selector_type);
CREATE INDEX IF NOT EXISTS idx_darkrisk_selectors_status ON public.darkrisk_selectors(status);

CREATE TABLE IF NOT EXISTS public.darkrisk_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  tier public.darkrisk_tier NOT NULL DEFAULT 'standard',
  status public.darkrisk_scan_status NOT NULL DEFAULT 'queued',
  trigger_type text NOT NULL DEFAULT 'manual',
  requested_by uuid,
  surface_scan_job_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_scan_runs_org_created ON public.darkrisk_scan_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_darkrisk_scan_runs_status ON public.darkrisk_scan_runs(status);

CREATE TABLE IF NOT EXISTS public.darkrisk_source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  scan_run_id uuid NOT NULL REFERENCES public.darkrisk_scan_runs(id) ON DELETE CASCADE,
  source public.darkrisk_source NOT NULL,
  asset_id uuid REFERENCES public.darkrisk_assets(id) ON DELETE SET NULL,
  selector_id uuid REFERENCES public.darkrisk_selectors(id) ON DELETE SET NULL,
  source_record_key text,
  source_system_id text,
  source_storage_id text,
  source_bucket text,
  source_media text,
  source_type text,
  source_score numeric,
  source_date timestamptz,
  source_added_at timestamptz,
  source_simhash text,
  title text,
  description text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  safe_preview text,
  preview_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_record_key, scan_run_id)
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_source_records_org ON public.darkrisk_source_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_darkrisk_source_records_scan ON public.darkrisk_source_records(scan_run_id);

CREATE TABLE IF NOT EXISTS public.darkrisk_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  scan_run_id uuid NOT NULL REFERENCES public.darkrisk_scan_runs(id) ON DELETE CASCADE,
  source_record_id uuid REFERENCES public.darkrisk_source_records(id) ON DELETE SET NULL,
  source public.darkrisk_source NOT NULL,
  evidence_class text NOT NULL,
  asset_id uuid REFERENCES public.darkrisk_assets(id) ON DELETE SET NULL,
  selector_id uuid REFERENCES public.darkrisk_selectors(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  masked_value text,
  severity_hint public.darkrisk_severity NOT NULL DEFAULT 'info',
  confidence public.darkrisk_confidence NOT NULL DEFAULT 'medium',
  observed_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  visibility public.darkrisk_visibility NOT NULL DEFAULT 'customer',
  contains_sensitive_data boolean NOT NULL DEFAULT false,
  raw_evidence_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_evidence_org ON public.darkrisk_evidence(organization_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_darkrisk_evidence_class ON public.darkrisk_evidence(evidence_class);

CREATE TABLE IF NOT EXISTS public.darkrisk_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  scan_run_id uuid REFERENCES public.darkrisk_scan_runs(id) ON DELETE SET NULL,
  finding_type text NOT NULL,
  title text NOT NULL,
  description text,
  affected_asset_id uuid REFERENCES public.darkrisk_assets(id) ON DELETE SET NULL,
  affected_selector_id uuid REFERENCES public.darkrisk_selectors(id) ON DELETE SET NULL,
  severity public.darkrisk_severity NOT NULL,
  confidence public.darkrisk_confidence NOT NULL DEFAULT 'medium',
  status public.darkrisk_finding_status NOT NULL DEFAULT 'new',
  risk_score integer NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_findings_org_status ON public.darkrisk_findings(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_darkrisk_findings_org_severity ON public.darkrisk_findings(organization_id, severity);

CREATE TABLE IF NOT EXISTS public.darkrisk_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  finding_id uuid REFERENCES public.darkrisk_findings(id) ON DELETE CASCADE,
  source public.darkrisk_source NOT NULL DEFAULT 'openai',
  title text NOT NULL,
  priority text NOT NULL,
  why_it_matters text,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_outcome text,
  confidence public.darkrisk_confidence NOT NULL DEFAULT 'medium',
  model text,
  prompt_version text,
  output_schema_version text,
  grounded_on_evidence_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_recommendations_org ON public.darkrisk_recommendations(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.darkrisk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  finding_id uuid REFERENCES public.darkrisk_findings(id) ON DELETE SET NULL,
  alert_type text NOT NULL,
  title text NOT NULL,
  message text,
  severity public.darkrisk_severity NOT NULL,
  status text NOT NULL DEFAULT 'open',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_alerts_org_occurred ON public.darkrisk_alerts(organization_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.darkrisk_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  scan_run_id uuid REFERENCES public.darkrisk_scan_runs(id) ON DELETE SET NULL,
  tier public.darkrisk_tier NOT NULL DEFAULT 'standard',
  title text NOT NULL,
  classification text NOT NULL DEFAULT 'confidential',
  status text NOT NULL DEFAULT 'draft',
  report_json jsonb NOT NULL,
  html_storage_path text,
  pdf_storage_path text,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  model_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_report_snapshots_org ON public.darkrisk_report_snapshots(organization_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS public.darkrisk_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_audit_log_org ON public.darkrisk_audit_log(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.darkrisk_raw_evidence_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  evidence_id uuid NOT NULL REFERENCES public.darkrisk_evidence(id) ON DELETE CASCADE,
  storage_provider text NOT NULL DEFAULT 'supabase',
  storage_path text NOT NULL,
  encryption_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  sha256 text,
  size_bytes bigint,
  retention_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_raw_evidence_refs_org ON public.darkrisk_raw_evidence_refs(organization_id);

CREATE TABLE IF NOT EXISTS public.darkrisk_source_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.darkrisk_source NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  requires_extended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, key)
);

ALTER TABLE public.darkrisk_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_selectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_raw_evidence_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_source_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "DarkRisk assets read" ON public.darkrisk_assets;
CREATE POLICY "DarkRisk assets read" ON public.darkrisk_assets
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk selectors read" ON public.darkrisk_selectors;
CREATE POLICY "DarkRisk selectors read" ON public.darkrisk_selectors
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk scan runs read" ON public.darkrisk_scan_runs;
CREATE POLICY "DarkRisk scan runs read" ON public.darkrisk_scan_runs
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk source records read" ON public.darkrisk_source_records;
CREATE POLICY "DarkRisk source records read" ON public.darkrisk_source_records
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk evidence read" ON public.darkrisk_evidence;
CREATE POLICY "DarkRisk evidence read" ON public.darkrisk_evidence
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk findings read" ON public.darkrisk_findings;
CREATE POLICY "DarkRisk findings read" ON public.darkrisk_findings
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk recommendations read" ON public.darkrisk_recommendations;
CREATE POLICY "DarkRisk recommendations read" ON public.darkrisk_recommendations
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk alerts read" ON public.darkrisk_alerts;
CREATE POLICY "DarkRisk alerts read" ON public.darkrisk_alerts
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk report snapshots read" ON public.darkrisk_report_snapshots;
CREATE POLICY "DarkRisk report snapshots read" ON public.darkrisk_report_snapshots
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk audit log read" ON public.darkrisk_audit_log;
CREATE POLICY "DarkRisk audit log read" ON public.darkrisk_audit_log
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk raw refs read" ON public.darkrisk_raw_evidence_refs;
CREATE POLICY "DarkRisk raw refs read" ON public.darkrisk_raw_evidence_refs
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk source config read" ON public.darkrisk_source_config;
CREATE POLICY "DarkRisk source config read" ON public.darkrisk_source_config
FOR SELECT TO authenticated
USING (can_manage_all_organizations(auth.uid()));

-- admin-like write policies
DROP POLICY IF EXISTS "DarkRisk assets write" ON public.darkrisk_assets;
CREATE POLICY "DarkRisk assets write" ON public.darkrisk_assets
FOR ALL TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = darkrisk_assets.organization_id AND u.user_type = 'admin')
)
WITH CHECK (
  can_manage_all_organizations(auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = darkrisk_assets.organization_id AND u.user_type = 'admin')
);

DROP POLICY IF EXISTS "DarkRisk selectors write" ON public.darkrisk_selectors;
CREATE POLICY "DarkRisk selectors write" ON public.darkrisk_selectors
FOR ALL TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = darkrisk_selectors.organization_id AND u.user_type = 'admin')
)
WITH CHECK (
  can_manage_all_organizations(auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = darkrisk_selectors.organization_id AND u.user_type = 'admin')
);

DROP POLICY IF EXISTS "DarkRisk scan runs write" ON public.darkrisk_scan_runs;
CREATE POLICY "DarkRisk scan runs write" ON public.darkrisk_scan_runs
FOR ALL TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = darkrisk_scan_runs.organization_id AND u.user_type = 'admin')
)
WITH CHECK (
  can_manage_all_organizations(auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = darkrisk_scan_runs.organization_id AND u.user_type = 'admin')
);

DROP POLICY IF EXISTS "DarkRisk source records write" ON public.darkrisk_source_records;
CREATE POLICY "DarkRisk source records write" ON public.darkrisk_source_records
FOR ALL TO authenticated
USING (can_manage_all_organizations(auth.uid()))
WITH CHECK (can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "DarkRisk evidence write" ON public.darkrisk_evidence;
CREATE POLICY "DarkRisk evidence write" ON public.darkrisk_evidence
FOR ALL TO authenticated
USING (can_manage_all_organizations(auth.uid()))
WITH CHECK (can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "DarkRisk findings write" ON public.darkrisk_findings;
CREATE POLICY "DarkRisk findings write" ON public.darkrisk_findings
FOR ALL TO authenticated
USING (can_manage_all_organizations(auth.uid()))
WITH CHECK (can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "DarkRisk recommendations write" ON public.darkrisk_recommendations;
CREATE POLICY "DarkRisk recommendations write" ON public.darkrisk_recommendations
FOR ALL TO authenticated
USING (can_manage_all_organizations(auth.uid()))
WITH CHECK (can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "DarkRisk alerts write" ON public.darkrisk_alerts;
CREATE POLICY "DarkRisk alerts write" ON public.darkrisk_alerts
FOR ALL TO authenticated
USING (can_manage_all_organizations(auth.uid()))
WITH CHECK (can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "DarkRisk report snapshots write" ON public.darkrisk_report_snapshots;
CREATE POLICY "DarkRisk report snapshots write" ON public.darkrisk_report_snapshots
FOR ALL TO authenticated
USING (can_manage_all_organizations(auth.uid()))
WITH CHECK (can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "DarkRisk audit log write" ON public.darkrisk_audit_log;
CREATE POLICY "DarkRisk audit log write" ON public.darkrisk_audit_log
FOR ALL TO authenticated
USING (can_manage_all_organizations(auth.uid()))
WITH CHECK (can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "DarkRisk raw refs write" ON public.darkrisk_raw_evidence_refs;
CREATE POLICY "DarkRisk raw refs write" ON public.darkrisk_raw_evidence_refs
FOR ALL TO authenticated
USING (can_manage_all_organizations(auth.uid()))
WITH CHECK (can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "DarkRisk source config write" ON public.darkrisk_source_config;
CREATE POLICY "DarkRisk source config write" ON public.darkrisk_source_config
FOR ALL TO authenticated
USING (can_manage_all_organizations(auth.uid()))
WITH CHECK (can_manage_all_organizations(auth.uid()));

DROP TRIGGER IF EXISTS trg_darkrisk_assets_updated_at ON public.darkrisk_assets;
CREATE TRIGGER trg_darkrisk_assets_updated_at
BEFORE UPDATE ON public.darkrisk_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_darkrisk_selectors_updated_at ON public.darkrisk_selectors;
CREATE TRIGGER trg_darkrisk_selectors_updated_at
BEFORE UPDATE ON public.darkrisk_selectors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_darkrisk_scan_runs_updated_at ON public.darkrisk_scan_runs;
CREATE TRIGGER trg_darkrisk_scan_runs_updated_at
BEFORE UPDATE ON public.darkrisk_scan_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_darkrisk_findings_updated_at ON public.darkrisk_findings;
CREATE TRIGGER trg_darkrisk_findings_updated_at
BEFORE UPDATE ON public.darkrisk_findings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_darkrisk_entitlements_updated_at ON public.darkrisk_entitlements;
CREATE TRIGGER trg_darkrisk_entitlements_updated_at
BEFORE UPDATE ON public.darkrisk_entitlements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_darkrisk_source_config_updated_at ON public.darkrisk_source_config;
CREATE TRIGGER trg_darkrisk_source_config_updated_at
BEFORE UPDATE ON public.darkrisk_source_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
