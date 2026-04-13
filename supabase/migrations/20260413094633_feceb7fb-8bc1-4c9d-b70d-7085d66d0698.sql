
CREATE TABLE public.assessment_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_year INTEGER NOT NULL,
  category_scores JSONB NOT NULL DEFAULT '{}',
  overall_score INTEGER NOT NULL DEFAULT 0,
  total_answered INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(organization_id, snapshot_year)
);

ALTER TABLE public.assessment_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org snapshots"
  ON public.assessment_snapshots FOR SELECT
  USING (organization_id IN (
    SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can insert their org snapshots"
  ON public.assessment_snapshots FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can update their org snapshots"
  ON public.assessment_snapshots FOR UPDATE
  USING (organization_id IN (
    SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()
  ));

CREATE POLICY "Sales can manage all snapshots"
  ON public.assessment_snapshots FOR ALL
  USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can view all snapshots"
  ON public.assessment_snapshots FOR SELECT
  USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Admins can view all snapshots"
  ON public.assessment_snapshots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.auth_user_id = auth.uid() AND users.user_type = 'admin'::user_type
  ));

CREATE TRIGGER update_assessment_snapshots_updated_at
  BEFORE UPDATE ON public.assessment_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
