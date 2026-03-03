-- Ensure superadmin profile exists in public.users
WITH superadmin_auth AS (
  SELECT id
  FROM auth.users
  WHERE email = 'superadmin@superadmin.com'
  LIMIT 1
), admin_org AS (
  SELECT id
  FROM public.organizations
  WHERE code = 'admin'
  LIMIT 1
)
UPDATE public.users u
SET
  auth_user_id = sa.id,
  full_name = COALESCE(NULLIF(u.full_name, ''), 'Super Administrator'),
  user_type = 'admin',
  organization_id = COALESCE(u.organization_id, ao.id),
  updated_at = now()
FROM superadmin_auth sa
LEFT JOIN admin_org ao ON true
WHERE u.email = 'superadmin@superadmin.com';

WITH superadmin_auth AS (
  SELECT id
  FROM auth.users
  WHERE email = 'superadmin@superadmin.com'
  LIMIT 1
), admin_org AS (
  SELECT id
  FROM public.organizations
  WHERE code = 'admin'
  LIMIT 1
)
INSERT INTO public.users (auth_user_id, email, full_name, user_type, organization_id)
SELECT sa.id, 'superadmin@superadmin.com', 'Super Administrator', 'admin', ao.id
FROM superadmin_auth sa
LEFT JOIN admin_org ao ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.users WHERE email = 'superadmin@superadmin.com'
);

-- Ensure superadmin role exists in public.user_roles
WITH superadmin_auth AS (
  SELECT id
  FROM auth.users
  WHERE email = 'superadmin@superadmin.com'
  LIMIT 1
)
INSERT INTO public.user_roles (user_id, role)
SELECT sa.id, 'super_admin'::public.app_role
FROM superadmin_auth sa
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles ur
  WHERE ur.user_id = sa.id
    AND ur.role = 'super_admin'::public.app_role
);