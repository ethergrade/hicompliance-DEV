-- Subdomain Dump module
-- Settings per organization
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subdomain_dump_depth integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS subdomain_dump_enabled boolean NOT NULL DEFAULT true;

-- Persisted dumps (history + cache)
CREATE TABLE IF NOT EXISTS public.subdomain_dumps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  root_domain text NOT NULL,
  depth_limit integer NOT NULL DEFAULT 10,
  total_discovered integer NOT NULL DEFAULT 0,
  total_returned integer NOT NULL DEFAULT 0,
  truncated boolean NOT NULL DEFAULT false,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  triggered_by text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subdomain_dumps_org_domain
  ON public.subdomain_dumps (organization_id, root_domain, created_at DESC);

ALTER TABLE public.subdomain_dumps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own org subdomain dumps" ON public.subdomain_dumps;
CREATE POLICY "Users view own org subdomain dumps"
  ON public.subdomain_dumps FOR SELECT
  USING (organization_id IN (
    SELECT users.organization_id FROM public.users
    WHERE users.auth_user_id = auth.uid()
  ) OR public.can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "Users insert own org subdomain dumps" ON public.subdomain_dumps;
CREATE POLICY "Users insert own org subdomain dumps"
  ON public.subdomain_dumps FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT users.organization_id FROM public.users
    WHERE users.auth_user_id = auth.uid()
  ) OR public.can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "Users delete own org subdomain dumps" ON public.subdomain_dumps;
CREATE POLICY "Users delete own org subdomain dumps"
  ON public.subdomain_dumps FOR DELETE
  USING (organization_id IN (
    SELECT users.organization_id FROM public.users
    WHERE users.auth_user_id = auth.uid()
  ) OR public.can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "Sales manage all subdomain dumps" ON public.subdomain_dumps;
CREATE POLICY "Sales manage all subdomain dumps"
  ON public.subdomain_dumps FOR ALL
  USING (public.can_manage_all_organizations(auth.uid()))
  WITH CHECK (public.can_manage_all_organizations(auth.uid()));