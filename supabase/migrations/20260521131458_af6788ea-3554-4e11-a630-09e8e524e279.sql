
-- 1. Extend contact_directory to unify contacts + platform users
ALTER TABLE public.contact_directory
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS is_platform_user boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS module_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Unique auth_user_id when present (one contact record per auth user per org-set)
CREATE UNIQUE INDEX IF NOT EXISTS contact_directory_auth_user_unique
  ON public.contact_directory(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_directory_org_idx
  ON public.contact_directory(organization_id);

-- 2. Function: get current user's module permissions map
CREATE OR REPLACE FUNCTION public.get_my_module_permissions()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT
       CASE WHEN cd.account_disabled THEN '{"__disabled":true}'::jsonb
            ELSE cd.module_permissions END
     FROM public.contact_directory cd
     WHERE cd.auth_user_id = auth.uid()
       AND cd.is_platform_user = true
     LIMIT 1),
    '{}'::jsonb
  );
$$;

-- 3. Function: check a specific permission server-side
CREATE OR REPLACE FUNCTION public.has_module_permission(
  _user_id uuid,
  _module text,
  _subsection text,
  _action text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT module_permissions, account_disabled
    FROM public.contact_directory
    WHERE auth_user_id = _user_id AND is_platform_user = true
    LIMIT 1
  )
  SELECT CASE
    -- super_admin/sales bypass
    WHEN public.can_manage_all_organizations(_user_id) THEN true
    -- no contact-link → default allow (legacy users)
    WHEN NOT EXISTS (SELECT 1 FROM cfg) THEN true
    WHEN (SELECT account_disabled FROM cfg) THEN false
    ELSE COALESCE(
      ((SELECT module_permissions FROM cfg) #>> ARRAY[_module, COALESCE(_subsection,'_root'), _action])::boolean,
      ((SELECT module_permissions FROM cfg) #>> ARRAY[_module, '_root', _action])::boolean,
      true
    )
  END;
$$;

-- 4. RLS: only super_admin/sales or org admins can change permission fields
-- Drop and recreate update policy with stricter check on sensitive columns is complex;
-- instead add an extra policy that restricts UPDATE on these columns via trigger
CREATE OR REPLACE FUNCTION public.enforce_contact_permission_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_priv boolean;
  v_is_org_admin boolean;
BEGIN
  -- super_admin/sales always allowed
  v_is_priv := public.can_manage_all_organizations(auth.uid());

  -- org admin = user in same organization with user_type='admin'
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'admin'
      AND u.organization_id = NEW.organization_id
  ) INTO v_is_org_admin;

  IF (NEW.module_permissions IS DISTINCT FROM OLD.module_permissions
      OR NEW.account_disabled IS DISTINCT FROM OLD.account_disabled
      OR NEW.is_platform_user IS DISTINCT FROM OLD.is_platform_user
      OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id)
     AND NOT (v_is_priv OR v_is_org_admin) THEN
    RAISE EXCEPTION 'Permessi insufficienti per modificare i permessi del contatto';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_contact_permission_edits ON public.contact_directory;
CREATE TRIGGER trg_enforce_contact_permission_edits
  BEFORE UPDATE ON public.contact_directory
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contact_permission_edits();
