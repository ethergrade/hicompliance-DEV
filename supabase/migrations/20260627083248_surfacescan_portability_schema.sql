-- SurfaceScan360 portability schema.
-- Forward-only and data-free: credentials and tenant rows are supplied per environment.

CREATE TABLE IF NOT EXISTS public.connectsecure_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pod_host text NOT NULL DEFAULT 'pod401.myconnectsecure.com',
  client_auth_token text NOT NULL,
  company_id integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connectsecure_config_organization_key UNIQUE (organization_id),
  CONSTRAINT connectsecure_config_company_id_positive CHECK (company_id > 0)
);

CREATE TABLE IF NOT EXISTS public.connectsecure_domain_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain text NOT NULL,
  cs_domain_id integer NOT NULL,
  depth integer NOT NULL DEFAULT 0,
  parent_domain text,
  last_scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connectsecure_domain_registry_org_domain_key UNIQUE (organization_id, domain),
  CONSTRAINT connectsecure_domain_registry_depth_check CHECK (depth BETWEEN 0 AND 10),
  CONSTRAINT connectsecure_domain_registry_domain_check CHECK (btrim(domain) <> '')
);

CREATE TABLE IF NOT EXISTS public.connectsecure_sensitive_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scan_job_id uuid REFERENCES public.surface_scan_jobs(id) ON DELETE SET NULL,
  domain text NOT NULL,
  creds_count integer NOT NULL DEFAULT 0,
  hashes_count integer NOT NULL DEFAULT 0,
  creds jsonb,
  hashes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connectsecure_sensitive_data_counts_check CHECK (creds_count >= 0 AND hashes_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.surface_scan_monthly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month_key text NOT NULL,
  month_start date NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_url text,
  triggered_by text NOT NULL DEFAULT 'cron',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surface_scan_monthly_reports_org_month_key UNIQUE (organization_id, month_key),
  CONSTRAINT surface_scan_monthly_reports_month_key_check CHECK (month_key ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

CREATE UNIQUE INDEX IF NOT EXISTS connectsecure_domain_registry_org_domain_uidx
  ON public.connectsecure_domain_registry (organization_id, lower(domain));
CREATE INDEX IF NOT EXISTS connectsecure_domain_registry_org_scan_idx
  ON public.connectsecure_domain_registry (organization_id, last_scanned_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS connectsecure_sensitive_data_org_created_idx
  ON public.connectsecure_sensitive_data (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS connectsecure_sensitive_data_job_idx
  ON public.connectsecure_sensitive_data (scan_job_id)
  WHERE scan_job_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_connectsecure_config_updated_at ON public.connectsecure_config;
CREATE TRIGGER set_connectsecure_config_updated_at
BEFORE UPDATE ON public.connectsecure_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_surface_scan_monthly_reports_updated_at ON public.surface_scan_monthly_reports;
CREATE TRIGGER set_surface_scan_monthly_reports_updated_at
BEFORE UPDATE ON public.surface_scan_monthly_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.connectsecure_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connectsecure_domain_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connectsecure_sensitive_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_scan_monthly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connectsecure_config_admin_manage ON public.connectsecure_config;
DROP POLICY IF EXISTS connectsecure_config_admin_select ON public.connectsecure_config;
DROP POLICY IF EXISTS cs_domain_registry_service_only ON public.connectsecure_domain_registry;
DROP POLICY IF EXISTS cs_sensitive_admin_select ON public.connectsecure_sensitive_data;
DROP POLICY IF EXISTS cs_sensitive_service_manage ON public.connectsecure_sensitive_data;
DROP POLICY IF EXISTS monthly_reports_admin_manage ON public.surface_scan_monthly_reports;
DROP POLICY IF EXISTS monthly_reports_user_select ON public.surface_scan_monthly_reports;

DROP POLICY IF EXISTS "Surface operators can view domain registry" ON public.connectsecure_domain_registry;
CREATE POLICY "Surface operators can view domain registry"
ON public.connectsecure_domain_registry
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.organization_id = connectsecure_domain_registry.organization_id
  )
  OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'sales'::public.app_role)
);

DROP POLICY IF EXISTS "Organization users can view monthly reports" ON public.surface_scan_monthly_reports;
CREATE POLICY "Organization users can view monthly reports"
ON public.surface_scan_monthly_reports
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.organization_id = surface_scan_monthly_reports.organization_id
  )
  OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'sales'::public.app_role)
);

DROP POLICY IF EXISTS "Surface admins can manage monthly reports" ON public.surface_scan_monthly_reports;
CREATE POLICY "Surface admins can manage monthly reports"
ON public.surface_scan_monthly_reports
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.organization_id = surface_scan_monthly_reports.organization_id
      AND u.user_type = 'admin'::public.user_type
  )
  OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'sales'::public.app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.organization_id = surface_scan_monthly_reports.organization_id
      AND u.user_type = 'admin'::public.user_type
  )
  OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'sales'::public.app_role)
);

REVOKE ALL ON TABLE public.connectsecure_config FROM anon, authenticated;
REVOKE ALL ON TABLE public.connectsecure_domain_registry FROM anon, authenticated;
REVOKE ALL ON TABLE public.connectsecure_sensitive_data FROM anon, authenticated;
REVOKE ALL ON TABLE public.surface_scan_monthly_reports FROM anon, authenticated;

GRANT ALL ON TABLE public.connectsecure_config TO service_role;
GRANT SELECT ON TABLE public.connectsecure_domain_registry TO authenticated;
GRANT ALL ON TABLE public.connectsecure_domain_registry TO service_role;
GRANT ALL ON TABLE public.connectsecure_sensitive_data TO service_role;
GRANT SELECT ON TABLE public.surface_scan_monthly_reports TO authenticated;
GRANT ALL ON TABLE public.surface_scan_monthly_reports TO service_role;

COMMENT ON TABLE public.connectsecure_config IS
  'Per-organization ConnectSecure override. Global CS_* Edge secrets take precedence at runtime.';
COMMENT ON COLUMN public.connectsecure_config.client_auth_token IS
  'Sensitive Client-Auth-Token. Service-role only; never expose through the Data API.';
COMMENT ON TABLE public.connectsecure_domain_registry IS
  'Canonical domain-to-ConnectSecure registration mapping and BFS depth metadata.';
COMMENT ON TABLE public.connectsecure_sensitive_data IS
  'Restricted credential/hash evidence summaries and encrypted-or-provider payloads.';
COMMENT ON TABLE public.surface_scan_monthly_reports IS
  'Monthly SurfaceScan360 report payloads generated by the canonical Edge function.';
