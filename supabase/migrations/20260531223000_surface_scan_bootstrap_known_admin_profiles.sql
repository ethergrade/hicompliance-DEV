DO $$
DECLARE
  v_sales_org_id uuid;
BEGIN
  SELECT id
    INTO v_sales_org_id
    FROM public.organizations
   WHERE code = 'cliente1'
   LIMIT 1;

  INSERT INTO public.users (auth_user_id, email, full_name, user_type, organization_id)
  SELECT
    au.id,
    lower(au.email),
    CASE
      WHEN lower(au.email) = 'superadmin@superadmin.com' THEN 'Super Administrator'
      WHEN lower(au.email) = 'admin@admin.com' THEN 'Administrator'
      ELSE 'Sales User'
    END,
    CASE
      WHEN lower(au.email) = 'sales@sales.com' THEN 'client'::public.user_type
      ELSE 'admin'::public.user_type
    END,
    CASE
      WHEN lower(au.email) = 'sales@sales.com' THEN v_sales_org_id
      ELSE NULL
    END
  FROM auth.users au
  WHERE lower(au.email) IN ('superadmin@superadmin.com', 'admin@admin.com', 'sales@sales.com')
    AND NOT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE lower(u.email) = lower(au.email)
         OR u.auth_user_id = au.id
    );

  UPDATE public.users u
     SET auth_user_id = au.id,
         full_name = CASE
           WHEN lower(au.email) = 'superadmin@superadmin.com' THEN COALESCE(NULLIF(u.full_name, ''), 'Super Administrator')
           WHEN lower(au.email) = 'admin@admin.com' THEN COALESCE(NULLIF(u.full_name, ''), 'Administrator')
           ELSE COALESCE(NULLIF(u.full_name, ''), 'Sales User')
         END,
         user_type = CASE
           WHEN lower(au.email) = 'sales@sales.com' THEN 'client'::public.user_type
           ELSE 'admin'::public.user_type
         END,
         organization_id = CASE
           WHEN lower(au.email) = 'sales@sales.com' THEN v_sales_org_id
           ELSE u.organization_id
         END,
         updated_at = now()
    FROM auth.users au
   WHERE lower(au.email) IN ('superadmin@superadmin.com', 'admin@admin.com', 'sales@sales.com')
     AND lower(u.email) = lower(au.email);

  INSERT INTO public.user_roles (user_id, role)
  SELECT
    au.id,
    CASE
      WHEN lower(au.email) = 'sales@sales.com' THEN 'sales'::public.app_role
      ELSE 'super_admin'::public.app_role
    END
  FROM auth.users au
  WHERE lower(au.email) IN ('superadmin@superadmin.com', 'admin@admin.com', 'sales@sales.com')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
