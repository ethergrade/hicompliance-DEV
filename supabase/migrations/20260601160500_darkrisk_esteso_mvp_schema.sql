-- DARKRISK_ESTESO MVP schema
-- Separate enablement/profile from legacy DarkRisk360.

ALTER TABLE IF EXISTS public.organizations
  ADD COLUMN IF NOT EXISTS darkrisk_esteso_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.darkrisk_esteso_profiles (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  manual_only boolean NOT NULL DEFAULT true,
  identity_model_valid_until date NOT NULL DEFAULT DATE '2026-06-10',
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.darkrisk_esteso_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "DarkRisk esteso profile read" ON public.darkrisk_esteso_profiles;
CREATE POLICY "DarkRisk esteso profile read"
ON public.darkrisk_esteso_profiles
FOR SELECT
TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR organization_id IN (
    SELECT u.organization_id
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "DarkRisk esteso profile write" ON public.darkrisk_esteso_profiles;
CREATE POLICY "DarkRisk esteso profile write"
ON public.darkrisk_esteso_profiles
FOR ALL
TO authenticated
USING (
  can_manage_all_organizations(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.organization_id = darkrisk_esteso_profiles.organization_id
      AND lower(coalesce(u.user_type::text, '')) IN ('admin', 'super_admin', 'superadmin')
  )
)
WITH CHECK (
  can_manage_all_organizations(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.organization_id = darkrisk_esteso_profiles.organization_id
      AND lower(coalesce(u.user_type::text, '')) IN ('admin', 'super_admin', 'superadmin')
  )
);

DROP TRIGGER IF EXISTS trg_darkrisk_esteso_profiles_updated_at ON public.darkrisk_esteso_profiles;
CREATE TRIGGER trg_darkrisk_esteso_profiles_updated_at
BEFORE UPDATE ON public.darkrisk_esteso_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
