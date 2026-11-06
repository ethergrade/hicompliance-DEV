CREATE TABLE public.nis2_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  stato text,
  tipologia text,
  fonte text,
  via_inclusione text,
  regime text,
  classe_dimensionale text,
  motivi jsonb NOT NULL DEFAULT '[]'::jsonb,
  profilo_assessment text NOT NULL DEFAULT 'base',
  rules_version text NOT NULL DEFAULT '2026.11',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nis2_classifications TO authenticated;
GRANT ALL ON public.nis2_classifications TO service_role;
ALTER TABLE public.nis2_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nis2 class org access" ON public.nis2_classifications FOR ALL TO authenticated
  USING (public.doc_can_access_org(organization_id)) WITH CHECK (public.doc_can_access_org(organization_id));
CREATE TRIGGER trg_nis2_class_updated BEFORE UPDATE ON public.nis2_classifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nis2_acn_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requirement_code text NOT NULL,
  status text NOT NULL,
  note text,
  owner text,
  due_date date,
  document_id uuid REFERENCES public.incident_documents(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, requirement_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nis2_acn_responses TO authenticated;
GRANT ALL ON public.nis2_acn_responses TO service_role;
ALTER TABLE public.nis2_acn_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nis2 acn org access" ON public.nis2_acn_responses FOR ALL TO authenticated
  USING (public.doc_can_access_org(organization_id)) WITH CHECK (public.doc_can_access_org(organization_id));
CREATE TRIGGER trg_nis2_acn_updated BEFORE UPDATE ON public.nis2_acn_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();