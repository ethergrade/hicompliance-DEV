-- Create storage bucket for incident response documents
INSERT INTO storage.buckets (id, name, public) VALUES ('incident-documents', 'incident-documents', false);

-- Create table for uploaded documents
CREATE TABLE public.incident_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Custom',
  uploaded_by UUID REFERENCES users(auth_user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.incident_documents ENABLE ROW LEVEL SECURITY;

-- Create policies for incident documents
CREATE POLICY "Users can view their organization's documents" 
ON public.incident_documents 
FOR SELECT 
USING (organization_id IN (
  SELECT users.organization_id 
  FROM users 
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can create documents for their organization" 
ON public.incident_documents 
FOR INSERT 
WITH CHECK (organization_id IN (
  SELECT users.organization_id 
  FROM users 
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can update their organization's documents" 
ON public.incident_documents 
FOR UPDATE 
USING (organization_id IN (
  SELECT users.organization_id 
  FROM users 
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can delete their organization's documents" 
ON public.incident_documents 
FOR DELETE 
USING (organization_id IN (
  SELECT users.organization_id 
  FROM users 
  WHERE users.auth_user_id = auth.uid()
));

-- Create storage policies for incident documents
CREATE POLICY "Users can view their organization's files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'incident-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload files for their organization" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'incident-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their organization's files" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'incident-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_incident_documents_updated_at
BEFORE UPDATE ON public.incident_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();