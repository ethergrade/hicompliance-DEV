-- Create enum for document categories
CREATE TYPE document_category AS ENUM (
  'Piano Generale',
  'Checklist / OPL / SOP',
  'Template',
  'Processo',
  'Legal',
  'Audit',
  'Tecnico',
  'Varie'
);

-- Create incident_documents table
CREATE TABLE incident_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  category document_category NOT NULL DEFAULT 'Varie'::document_category,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE incident_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for incident_documents
CREATE POLICY "Users can view their own documents"
ON incident_documents FOR SELECT
USING (uploaded_by IN (
  SELECT id FROM users WHERE auth_user_id = auth.uid()
));

CREATE POLICY "Users can insert their own documents"
ON incident_documents FOR INSERT
WITH CHECK (uploaded_by IN (
  SELECT id FROM users WHERE auth_user_id = auth.uid()
));

CREATE POLICY "Users can update their own documents"
ON incident_documents FOR UPDATE
USING (uploaded_by IN (
  SELECT id FROM users WHERE auth_user_id = auth.uid()
));

CREATE POLICY "Users can delete their own documents"
ON incident_documents FOR DELETE
USING (uploaded_by IN (
  SELECT id FROM users WHERE auth_user_id = auth.uid()
));

-- Create trigger for updated_at
CREATE TRIGGER update_incident_documents_updated_at
BEFORE UPDATE ON incident_documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Ensure the storage bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-documents', 'incident-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Users can upload documents to their folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'incident-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view documents in their folder"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'incident-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update documents in their folder"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'incident-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete documents in their folder"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'incident-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);