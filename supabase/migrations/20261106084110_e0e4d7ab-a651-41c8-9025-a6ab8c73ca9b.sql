ALTER TABLE public.assessment_responses
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE TABLE public.assessment_external_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  score integer NOT NULL,
  document_id uuid REFERENCES public.incident_documents(id) ON DELETE SET NULL,
  assessment_date date,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT assessment_external_scores_score_range CHECK (score >= 0 AND score <= 100)
);

GRANT SELECT ON public.assessment_external_scores TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.assessment_external_scores TO authenticated;
GRANT ALL ON public.assessment_external_scores TO service_role;

ALTER TABLE public.assessment_external_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view external scores of their organization"
  ON public.assessment_external_scores
  FOR SELECT
  TO authenticated
  USING (public.doc_can_access_org(organization_id));

CREATE POLICY "Only super admin and sales can manage external scores"
  ON public.assessment_external_scores
  FOR ALL
  TO authenticated
  USING (public.can_manage_all_organizations(auth.uid()))
  WITH CHECK (public.can_manage_all_organizations(auth.uid()));

CREATE TRIGGER update_assessment_external_scores_updated_at
  BEFORE UPDATE ON public.assessment_external_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();