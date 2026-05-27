-- DarkRisk360 report storage buckets + RLS policies

INSERT INTO storage.buckets (id, name, public)
VALUES ('darkrisk-reports', 'darkrisk-reports', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('darkrisk-evidence-private', 'darkrisk-evidence-private', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "DarkRisk reports read by organization" ON storage.objects;
CREATE POLICY "DarkRisk reports read by organization"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'darkrisk-reports'
  AND (
    public.can_manage_all_organizations(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT u.organization_id::text
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "DarkRisk reports write by platform admins" ON storage.objects;
CREATE POLICY "DarkRisk reports write by platform admins"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'darkrisk-reports'
  AND public.can_manage_all_organizations(auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk reports update by platform admins" ON storage.objects;
CREATE POLICY "DarkRisk reports update by platform admins"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'darkrisk-reports'
  AND public.can_manage_all_organizations(auth.uid())
)
WITH CHECK (
  bucket_id = 'darkrisk-reports'
  AND public.can_manage_all_organizations(auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk reports delete by platform admins" ON storage.objects;
CREATE POLICY "DarkRisk reports delete by platform admins"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'darkrisk-reports'
  AND public.can_manage_all_organizations(auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk private evidence read by platform admins" ON storage.objects;
CREATE POLICY "DarkRisk private evidence read by platform admins"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'darkrisk-evidence-private'
  AND public.can_manage_all_organizations(auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk private evidence write by platform admins" ON storage.objects;
CREATE POLICY "DarkRisk private evidence write by platform admins"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'darkrisk-evidence-private'
  AND public.can_manage_all_organizations(auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk private evidence update by platform admins" ON storage.objects;
CREATE POLICY "DarkRisk private evidence update by platform admins"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'darkrisk-evidence-private'
  AND public.can_manage_all_organizations(auth.uid())
)
WITH CHECK (
  bucket_id = 'darkrisk-evidence-private'
  AND public.can_manage_all_organizations(auth.uid())
);

DROP POLICY IF EXISTS "DarkRisk private evidence delete by platform admins" ON storage.objects;
CREATE POLICY "DarkRisk private evidence delete by platform admins"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'darkrisk-evidence-private'
  AND public.can_manage_all_organizations(auth.uid())
);
