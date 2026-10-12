ALTER TABLE public.managed_assets
  ADD COLUMN created_by uuid DEFAULT auth.uid(),
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN flag_color text, ADD COLUMN flag_note text,
  ADD COLUMN hitrack_device_id text, ADD COLUMN hitrack_link_mode text,
  ADD COLUMN ip_address text;

DROP POLICY ma_all ON public.managed_assets;
CREATE POLICY ma_select ON public.managed_assets FOR SELECT TO authenticated USING (public.doc_can_access_org(organization_id));
CREATE POLICY ma_insert ON public.managed_assets FOR INSERT TO authenticated WITH CHECK (public.doc_can_access_org(organization_id));
CREATE POLICY ma_update ON public.managed_assets FOR UPDATE TO authenticated
  USING (public.doc_can_access_org(organization_id) AND (created_by = auth.uid() OR source = 'halo' OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales')))
  WITH CHECK (public.doc_can_access_org(organization_id));
CREATE POLICY ma_delete ON public.managed_assets FOR DELETE TO authenticated
  USING (public.doc_can_access_org(organization_id) AND (created_by = auth.uid() OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales')));

CREATE TABLE public.asset_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, organization_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_groups TO authenticated;
GRANT ALL ON public.asset_groups TO service_role;
ALTER TABLE public.asset_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY ag_own ON public.asset_groups FOR ALL TO authenticated
  USING (owner_user_id = auth.uid() AND public.doc_can_access_org(organization_id))
  WITH CHECK (owner_user_id = auth.uid() AND public.doc_can_access_org(organization_id));

CREATE TABLE public.asset_group_members (
  group_id uuid NOT NULL REFERENCES public.asset_groups(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.managed_assets(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, asset_id)
);
GRANT SELECT, INSERT, DELETE ON public.asset_group_members TO authenticated;
GRANT ALL ON public.asset_group_members TO service_role;
ALTER TABLE public.asset_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY agm_own ON public.asset_group_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.asset_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.asset_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid()));