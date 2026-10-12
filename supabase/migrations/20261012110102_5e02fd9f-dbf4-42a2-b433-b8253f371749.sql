CREATE TABLE public.hitrack_device_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, organization_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hitrack_device_groups TO authenticated;
GRANT ALL ON public.hitrack_device_groups TO service_role;
ALTER TABLE public.hitrack_device_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY hdg_own ON public.hitrack_device_groups FOR ALL TO authenticated
  USING (owner_user_id = auth.uid() AND public.doc_can_access_org(organization_id))
  WITH CHECK (owner_user_id = auth.uid() AND public.doc_can_access_org(organization_id));

CREATE TABLE public.hitrack_device_group_members (
  group_id uuid NOT NULL REFERENCES public.hitrack_device_groups(id) ON DELETE CASCADE,
  device_key text NOT NULL,
  PRIMARY KEY (group_id, device_key)
);
GRANT SELECT, INSERT, DELETE ON public.hitrack_device_group_members TO authenticated;
GRANT ALL ON public.hitrack_device_group_members TO service_role;
ALTER TABLE public.hitrack_device_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY hdgm_own ON public.hitrack_device_group_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hitrack_device_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hitrack_device_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid()));

CREATE TABLE public.hitrack_device_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  device_key text NOT NULL,
  tag text NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, device_key, tag)
);
GRANT SELECT, INSERT, DELETE ON public.hitrack_device_tags TO authenticated;
GRANT ALL ON public.hitrack_device_tags TO service_role;
ALTER TABLE public.hitrack_device_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY hdt_org ON public.hitrack_device_tags FOR ALL TO authenticated
  USING (public.doc_can_access_org(organization_id))
  WITH CHECK (public.doc_can_access_org(organization_id));