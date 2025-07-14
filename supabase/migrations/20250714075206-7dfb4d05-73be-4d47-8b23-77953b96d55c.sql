-- Create table for HiSolution service types
CREATE TABLE public.hisolution_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hisolution_services ENABLE ROW LEVEL SECURITY;

-- Create policy for viewing services
CREATE POLICY "Authenticated users can view HiSolution services" 
ON public.hisolution_services 
FOR SELECT 
USING (true);

-- Create table for organization integrations
CREATE TABLE public.organization_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.hisolution_services(id) ON DELETE CASCADE,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  api_methods JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, service_id)
);

-- Enable RLS
ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;

-- Create policies for organization integrations
CREATE POLICY "Admins can view all organization integrations" 
ON public.organization_integrations 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.users 
  WHERE users.auth_user_id = auth.uid() 
  AND users.user_type = 'admin'
));

CREATE POLICY "Organizations can manage their own integrations" 
ON public.organization_integrations 
FOR ALL
USING (organization_id IN (
  SELECT users.organization_id 
  FROM public.users 
  WHERE users.auth_user_id = auth.uid()
));

-- Create trigger for updated_at
CREATE TRIGGER update_organization_integrations_updated_at
BEFORE UPDATE ON public.organization_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default HiSolution services
INSERT INTO public.hisolution_services (code, name, description, icon) VALUES
('hiendpoint', 'HiEndpoint', 'Endpoint security and monitoring', 'shield'),
('himobile', 'HiMobile', 'Mobile device management', 'smartphone'),
('hifirewall', 'HiFirewall', 'Network firewall protection', 'shield-ban'),
('hipatch', 'HiPatch', 'System patch management', 'download'),
('hilog', 'HiLog', 'Log management and analysis', 'file-text'),
('himfa', 'HiMfa', 'Multi-factor authentication', 'key'),
('himail', 'HiMail', 'Email security solution', 'mail');