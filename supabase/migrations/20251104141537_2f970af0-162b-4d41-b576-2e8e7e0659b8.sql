-- Create table for storing IRP document drafts and published versions
CREATE TABLE public.irp_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.irp_documents ENABLE ROW LEVEL SECURITY;

-- Users can view their organization's documents
CREATE POLICY "Users can view their organization's IRP documents"
ON public.irp_documents
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()
  )
);

-- Users can create documents for their organization
CREATE POLICY "Users can create IRP documents for their organization"
ON public.irp_documents
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()
  ) AND user_id = auth.uid()
);

-- Users can update their organization's documents
CREATE POLICY "Users can update their organization's IRP documents"
ON public.irp_documents
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()
  )
);

-- Users can delete their organization's documents
CREATE POLICY "Users can delete their organization's IRP documents"
ON public.irp_documents
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_irp_documents_updated_at
BEFORE UPDATE ON public.irp_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_irp_documents_organization_id ON public.irp_documents(organization_id);
CREATE INDEX idx_irp_documents_user_id ON public.irp_documents(user_id);