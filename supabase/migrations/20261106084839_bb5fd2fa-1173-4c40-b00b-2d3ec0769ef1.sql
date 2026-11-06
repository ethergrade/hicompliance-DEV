CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.incident_documents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  file_path text,
  file_size bigint,
  mime_type text,
  status text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT document_versions_unique_revision UNIQUE (document_id, revision)
);

CREATE INDEX idx_document_versions_document_id ON public.document_versions(document_id);

GRANT SELECT, INSERT ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view versions of their organization documents"
  ON public.document_versions
  FOR SELECT
  TO authenticated
  USING (public.doc_can_access_org(organization_id));

CREATE POLICY "Users can add versions to their organization documents"
  ON public.document_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.doc_can_access_org(organization_id));

CREATE POLICY "Super admin and sales can manage versions"
  ON public.document_versions
  FOR ALL
  TO authenticated
  USING (public.can_manage_all_organizations(auth.uid()))
  WITH CHECK (public.can_manage_all_organizations(auth.uid()));