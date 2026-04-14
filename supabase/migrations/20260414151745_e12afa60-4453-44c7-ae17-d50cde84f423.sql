
-- Add ISO 9001/27001 fields to incident_documents
ALTER TABLE public.incident_documents
  ADD COLUMN IF NOT EXISTS document_code TEXT,
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision_date TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Bozza',
  ADD COLUMN IF NOT EXISTS drafted_by UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prepared_by UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approved_by UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confidentiality TEXT NOT NULL DEFAULT 'Interno',
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Create index on document_code for fast lookups
CREATE INDEX IF NOT EXISTS idx_incident_documents_code ON public.incident_documents(document_code);
CREATE INDEX IF NOT EXISTS idx_incident_documents_org ON public.incident_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_incident_documents_status ON public.incident_documents(status);
CREATE INDEX IF NOT EXISTS idx_incident_documents_tags ON public.incident_documents USING GIN(tags);

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Users can view their own documents" ON public.incident_documents;
DROP POLICY IF EXISTS "Users can insert their own documents" ON public.incident_documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON public.incident_documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.incident_documents;

-- New RLS: organization-scoped + admin/sales full access
CREATE POLICY "Users can view org documents"
  ON public.incident_documents FOR SELECT
  USING (
    organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid())
    OR uploaded_by IN (SELECT users.id FROM users WHERE users.auth_user_id = auth.uid())
    OR can_manage_all_organizations(auth.uid())
  );

CREATE POLICY "Users can insert org documents"
  ON public.incident_documents FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid())
    OR uploaded_by IN (SELECT users.id FROM users WHERE users.auth_user_id = auth.uid())
    OR can_manage_all_organizations(auth.uid())
  );

CREATE POLICY "Users can update org documents"
  ON public.incident_documents FOR UPDATE
  USING (
    organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid())
    OR uploaded_by IN (SELECT users.id FROM users WHERE users.auth_user_id = auth.uid())
    OR can_manage_all_organizations(auth.uid())
  );

CREATE POLICY "Users can delete org documents"
  ON public.incident_documents FOR DELETE
  USING (
    organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid())
    OR uploaded_by IN (SELECT users.id FROM users WHERE users.auth_user_id = auth.uid())
    OR can_manage_all_organizations(auth.uid())
  );
