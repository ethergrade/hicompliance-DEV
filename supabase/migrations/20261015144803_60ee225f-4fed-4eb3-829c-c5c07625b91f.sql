CREATE TABLE public.document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.document_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, parent_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_folders TO authenticated;
GRANT ALL ON public.document_folders TO service_role;
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org users manage folders" ON public.document_folders FOR ALL TO authenticated
  USING (public.doc_can_access_org(organization_id)) WITH CHECK (public.doc_can_access_org(organization_id));
CREATE TRIGGER trg_document_folders_updated BEFORE UPDATE ON public.document_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.incident_documents ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.document_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_incident_documents_folder ON public.incident_documents(folder_id);