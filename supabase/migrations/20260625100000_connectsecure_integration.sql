-- ConnectSecure Attack Surface Mapper integration
-- Tables: connectsecure_config, connectsecure_domain_registry,
--         connectsecure_sensitive_data, surface_scan_monthly_reports

-- ── 1. connectsecure_config ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.connectsecure_config (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pod_host          text        NOT NULL DEFAULT 'pod401.myconnectsecure.com',
  client_auth_token text        NOT NULL,
  company_id        integer     NOT NULL,
  enabled           boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connectsecure_config_org_unique UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_connectsecure_config_org
  ON public.connectsecure_config (organization_id)
  WHERE enabled = true;

CREATE OR REPLACE FUNCTION public.trg_fn_connectsecure_config_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connectsecure_config_updated ON public.connectsecure_config;
CREATE TRIGGER trg_connectsecure_config_updated
  BEFORE UPDATE ON public.connectsecure_config
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_connectsecure_config_updated();

ALTER TABLE public.connectsecure_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connectsecure_config_admin_select" ON public.connectsecure_config
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND public.surface_scan_is_admin(auth.uid())
  );
CREATE POLICY "connectsecure_config_admin_manage" ON public.connectsecure_config
  FOR ALL USING (
    public.surface_scan_is_admin(auth.uid())
    OR public.can_manage_all_organizations(auth.uid())
  );

-- ── 2. connectsecure_domain_registry ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.connectsecure_domain_registry (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  domain           text        NOT NULL,
  cs_domain_id     integer     NOT NULL,
  depth            integer     NOT NULL DEFAULT 0,
  parent_domain    text,
  last_scanned_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connectsecure_domain_registry_unique UNIQUE (organization_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_cs_domain_registry_org
  ON public.connectsecure_domain_registry (organization_id, depth);

ALTER TABLE public.connectsecure_domain_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_domain_registry_service_only" ON public.connectsecure_domain_registry
  FOR ALL USING (public.can_manage_all_organizations(auth.uid()));

-- ── 3. connectsecure_sensitive_data ──────────────────────────────────────────
-- creds/hashes visibili agli admin (cliente autorizza esplicitamente)
CREATE TABLE IF NOT EXISTS public.connectsecure_sensitive_data (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  scan_job_id      uuid        REFERENCES public.surface_scan_jobs(id) ON DELETE SET NULL,
  domain           text        NOT NULL,
  creds_count      integer     NOT NULL DEFAULT 0,
  hashes_count     integer     NOT NULL DEFAULT 0,
  creds            jsonb,
  hashes           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_sensitive_org
  ON public.connectsecure_sensitive_data (organization_id, created_at DESC);

ALTER TABLE public.connectsecure_sensitive_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_sensitive_admin_select" ON public.connectsecure_sensitive_data
  FOR SELECT USING (
    public.surface_scan_is_admin(auth.uid())
    OR public.can_manage_all_organizations(auth.uid())
  );
CREATE POLICY "cs_sensitive_service_manage" ON public.connectsecure_sensitive_data
  FOR ALL USING (public.can_manage_all_organizations(auth.uid()));

-- ── 4. surface_scan_monthly_reports ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.surface_scan_monthly_reports (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  month_key        text        NOT NULL,   -- '2026-06'
  month_start      date        NOT NULL,
  payload          jsonb       NOT NULL DEFAULT '{}',
  pdf_url          text,
  triggered_by     text        NOT NULL DEFAULT 'cron',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surface_scan_monthly_reports_unique UNIQUE (organization_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_surface_scan_monthly_org
  ON public.surface_scan_monthly_reports (organization_id, month_key DESC);

ALTER TABLE public.surface_scan_monthly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_reports_user_select" ON public.surface_scan_monthly_reports
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
  );
CREATE POLICY "monthly_reports_admin_manage" ON public.surface_scan_monthly_reports
  FOR ALL USING (
    public.surface_scan_is_admin(auth.uid())
    OR public.can_manage_all_organizations(auth.uid())
  );

-- ── 5. pg_cron mensile per monthly report ────────────────────────────────────
-- Esegue il primo giorno di ogni mese alle 06:00 Europe/Rome (= 05:00 UTC invernale)
SELECT cron.schedule(
  'surfacescan360-monthly-report',
  '0 5 1 * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.settings.supabase_functions_url') || '/surfacescan360-monthly-report',
    headers := jsonb_build_object(
      'Content-Type',               'application/json',
      'Authorization',              'Bearer ' || current_setting('app.settings.service_role_key'),
      'x-surface-internal-secret',  current_setting('app.settings.surface_scan_cron_internal_secret')
    ),
    body   := jsonb_build_object('triggered_by', 'cron_monthly', 'at', now()::text)
  )
  $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule;
