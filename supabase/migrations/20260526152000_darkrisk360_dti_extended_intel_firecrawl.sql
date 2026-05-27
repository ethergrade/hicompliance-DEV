-- DarkRisk360 DTI Extended additive schema
-- Adds source-run telemetry, sensitive hit inventory and firecrawl source support.

DO $$ BEGIN
  ALTER TYPE public.darkrisk_source ADD VALUE IF NOT EXISTS 'firecrawl';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE IF EXISTS public.darkrisk_source_records
  ADD COLUMN IF NOT EXISTS query_kind text,
  ADD COLUMN IF NOT EXISTS query_term text,
  ADD COLUMN IF NOT EXISTS asset_scope text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS extraction_source text,
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS extraction_error text;

CREATE TABLE IF NOT EXISTS public.darkrisk_dti_source_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  scan_run_id uuid NOT NULL REFERENCES public.darkrisk_scan_runs(id) ON DELETE CASCADE,
  source public.darkrisk_source NOT NULL,
  source_key text NOT NULL,
  source_label text,
  source_kind text NOT NULL DEFAULT 'dti',
  query_kind text,
  query_term text,
  asset_scope text,
  selector_value text,
  target_url text,
  status text NOT NULL DEFAULT 'completed',
  result_count integer NOT NULL DEFAULT 0,
  warning text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_run_id, source, source_key)
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_dti_source_runs_org ON public.darkrisk_dti_source_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_darkrisk_dti_source_runs_scan ON public.darkrisk_dti_source_runs(scan_run_id, source, status);
CREATE INDEX IF NOT EXISTS idx_darkrisk_dti_source_runs_query ON public.darkrisk_dti_source_runs(query_kind, query_term);

CREATE TABLE IF NOT EXISTS public.darkrisk_dti_sensitive_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid,
  scan_run_id uuid NOT NULL REFERENCES public.darkrisk_scan_runs(id) ON DELETE CASCADE,
  source_run_id uuid REFERENCES public.darkrisk_dti_source_runs(id) ON DELETE SET NULL,
  source_record_id uuid REFERENCES public.darkrisk_source_records(id) ON DELETE SET NULL,
  evidence_id uuid REFERENCES public.darkrisk_evidence(id) ON DELETE SET NULL,
  finding_id uuid REFERENCES public.darkrisk_findings(id) ON DELETE SET NULL,
  source public.darkrisk_source NOT NULL,
  source_label text,
  query_kind text,
  query_term text,
  asset_scope text,
  selector_value text,
  tag text NOT NULL,
  clear_value text,
  masked_value text NOT NULL,
  match_type text,
  extraction_source text,
  context_excerpt text,
  confidence public.darkrisk_confidence NOT NULL DEFAULT 'medium',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_dti_sensitive_hits_org ON public.darkrisk_dti_sensitive_hits(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_darkrisk_dti_sensitive_hits_scan ON public.darkrisk_dti_sensitive_hits(scan_run_id, source, tag);
CREATE INDEX IF NOT EXISTS idx_darkrisk_dti_sensitive_hits_query ON public.darkrisk_dti_sensitive_hits(query_kind, query_term);

ALTER TABLE public.darkrisk_dti_source_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_dti_sensitive_hits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "DarkRisk DTI source runs read" ON public.darkrisk_dti_source_runs;
CREATE POLICY "DarkRisk DTI source runs read" ON public.darkrisk_dti_source_runs
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk DTI sensitive hits read privileged" ON public.darkrisk_dti_sensitive_hits;
CREATE POLICY "DarkRisk DTI sensitive hits read privileged" ON public.darkrisk_dti_sensitive_hits
FOR SELECT TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.organization_id = darkrisk_dti_sensitive_hits.organization_id
      AND lower(coalesce(u.user_type::text, '')) IN ('admin', 'super_admin', 'superadmin', 'analyst')
  )
);
