ALTER TABLE public.assessment_snapshots DROP CONSTRAINT IF EXISTS assessment_snapshots_organization_id_snapshot_year_key;
ALTER TABLE public.assessment_snapshots ADD COLUMN IF NOT EXISTS label text, ADD COLUMN IF NOT EXISTS snapshot_date date NOT NULL DEFAULT current_date;
UPDATE public.assessment_snapshots SET snapshot_date = created_at::date;
GRANT DELETE ON public.assessment_snapshots TO authenticated;
CREATE POLICY "Org admins can delete their org snapshots" ON public.assessment_snapshots FOR DELETE TO authenticated
USING (public.can_manage_all_organizations(auth.uid()) OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = assessment_snapshots.organization_id AND u.user_type = 'admin'));