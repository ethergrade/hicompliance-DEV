-- Create emergency_contacts table
CREATE TABLE public.emergency_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('security', 'it', 'authorities')),
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

-- Create policies for emergency contacts
CREATE POLICY "Users can view their organization's emergency contacts" 
ON public.emergency_contacts 
FOR SELECT 
USING (organization_id IN (
  SELECT users.organization_id 
  FROM public.users 
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can create emergency contacts for their organization" 
ON public.emergency_contacts 
FOR INSERT 
WITH CHECK (organization_id IN (
  SELECT users.organization_id 
  FROM public.users 
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can update their organization's emergency contacts" 
ON public.emergency_contacts 
FOR UPDATE 
USING (organization_id IN (
  SELECT users.organization_id 
  FROM public.users 
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can delete their organization's emergency contacts" 
ON public.emergency_contacts 
FOR DELETE 
USING (organization_id IN (
  SELECT users.organization_id 
  FROM public.users 
  WHERE users.auth_user_id = auth.uid()
));

-- Create trigger for updated_at
CREATE TRIGGER update_emergency_contacts_updated_at
BEFORE UPDATE ON public.emergency_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default contacts for demo purposes
INSERT INTO public.emergency_contacts (name, role, phone, email, category, organization_id) VALUES
('CISO', 'Chief Information Security Officer', '+39 02 1234 5678', 'security@company.com', 'security', (SELECT id FROM public.organizations LIMIT 1)),
('Security Emergency', 'Emergency Line', '+39 02 1234 9999', 'emergency@company.com', 'security', (SELECT id FROM public.organizations LIMIT 1)),
('IT Manager', 'IT Department Manager', '+39 02 1234 5679', 'it-support@company.com', 'it', (SELECT id FROM public.organizations LIMIT 1)),
('Helpdesk', 'IT Support', '+39 02 1234 1000', 'helpdesk@company.com', 'it', (SELECT id FROM public.organizations LIMIT 1)),
('Polizia Postale', 'Cyber Crime Unit', '113', 'contact@poliziapostale.it', 'authorities', (SELECT id FROM public.organizations LIMIT 1)),
('CSIRT-IT', 'Computer Security Incident Response Team', '+39 06 8544 1', 'csirt@cert-it.gov', 'authorities', (SELECT id FROM public.organizations LIMIT 1));