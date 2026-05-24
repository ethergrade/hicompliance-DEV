-- DarkRisk360 tier entitlement (Standard / Extended)
-- Additive and backward-compatible with organizations.dark_risk360_enabled.

DO $$
BEGIN
  CREATE TYPE public.darkrisk_tier AS ENUM ('standard', 'extended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.darkrisk_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tier public.darkrisk_tier NOT NULL DEFAULT 'standard',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_darkrisk_entitlements_org
  ON public.darkrisk_entitlements(organization_id, enabled, tier);

-- Backfill from organization feature flag
INSERT INTO public.darkrisk_entitlements (organization_id, tier, enabled)
SELECT id, 'standard'::public.darkrisk_tier, COALESCE(dark_risk360_enabled, false)
FROM public.organizations
ON CONFLICT (organization_id) DO UPDATE
SET enabled = EXCLUDED.enabled;

ALTER TABLE public.darkrisk_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "DarkRisk entitlements read" ON public.darkrisk_entitlements;
CREATE POLICY "DarkRisk entitlements read"
  ON public.darkrisk_entitlements FOR SELECT
  TO authenticated
  USING (
    can_manage_all_organizations(auth.uid())
    OR organization_id IN (
      SELECT u.organization_id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "DarkRisk entitlements write" ON public.darkrisk_entitlements;
CREATE POLICY "DarkRisk entitlements write"
  ON public.darkrisk_entitlements FOR ALL
  TO authenticated
  USING (
    can_manage_all_organizations(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.organization_id = darkrisk_entitlements.organization_id
        AND u.user_type = 'admin'
    )
  )
  WITH CHECK (
    can_manage_all_organizations(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.organization_id = darkrisk_entitlements.organization_id
        AND u.user_type = 'admin'
    )
  );
