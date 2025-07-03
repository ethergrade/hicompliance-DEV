-- Create enum for user types
CREATE TYPE public.user_type AS ENUM ('admin', 'client');

-- Create enum for assessment status
CREATE TYPE public.assessment_status AS ENUM ('not_applicable', 'planned_in_progress', 'completed');

-- Create enum for service status
CREATE TYPE public.service_status AS ENUM ('active', 'inactive', 'maintenance', 'alert');

-- Create organizations table
CREATE TABLE public.organizations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create users table with organization reference
CREATE TABLE public.users (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    user_type public.user_type NOT NULL DEFAULT 'client',
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create assessment categories table
CREATE TABLE public.assessment_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create assessment questions table
CREATE TABLE public.assessment_questions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES public.assessment_categories(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create assessment responses table
CREATE TABLE public.assessment_responses (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    question_id UUID REFERENCES public.assessment_questions(id) ON DELETE CASCADE,
    status public.assessment_status NOT NULL DEFAULT 'not_applicable',
    notes TEXT,
    last_updated_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(organization_id, question_id)
);

-- Create services table
CREATE TABLE public.services (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create organization services table
CREATE TABLE public.organization_services (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
    status public.service_status NOT NULL DEFAULT 'inactive',
    health_score INTEGER DEFAULT 0 CHECK (health_score >= 0 AND health_score <= 100),
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(organization_id, service_id)
);

-- Enable Row Level Security
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_services ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for organizations
CREATE POLICY "Admins can view all organizations" 
ON public.organizations 
FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE auth_user_id = auth.uid() AND user_type = 'admin'
    )
);

CREATE POLICY "Clients can view their organization" 
ON public.organizations 
FOR SELECT 
TO authenticated 
USING (
    id IN (
        SELECT organization_id FROM public.users 
        WHERE auth_user_id = auth.uid()
    )
);

-- Create RLS policies for users
CREATE POLICY "Admins can view all users" 
ON public.users 
FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE auth_user_id = auth.uid() AND user_type = 'admin'
    )
);

CREATE POLICY "Users can view their own data" 
ON public.users 
FOR SELECT 
TO authenticated 
USING (auth_user_id = auth.uid());

-- Assessment categories and questions are readable by all authenticated users
CREATE POLICY "Authenticated users can view assessment categories" 
ON public.assessment_categories 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can view assessment questions" 
ON public.assessment_questions 
FOR SELECT 
TO authenticated 
USING (true);

-- Assessment responses policies
CREATE POLICY "Admins can view all assessment responses" 
ON public.assessment_responses 
FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE auth_user_id = auth.uid() AND user_type = 'admin'
    )
);

CREATE POLICY "Clients can view their organization's responses" 
ON public.assessment_responses 
FOR SELECT 
TO authenticated 
USING (
    organization_id IN (
        SELECT organization_id FROM public.users 
        WHERE auth_user_id = auth.uid()
    )
);

CREATE POLICY "Clients can update their organization's responses" 
ON public.assessment_responses 
FOR ALL 
TO authenticated 
USING (
    organization_id IN (
        SELECT organization_id FROM public.users 
        WHERE auth_user_id = auth.uid()
    )
);

-- Services policies
CREATE POLICY "Authenticated users can view services" 
ON public.services 
FOR SELECT 
TO authenticated 
USING (true);

-- Organization services policies
CREATE POLICY "Admins can view all organization services" 
ON public.organization_services 
FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE auth_user_id = auth.uid() AND user_type = 'admin'
    )
);

CREATE POLICY "Clients can view their organization's services" 
ON public.organization_services 
FOR SELECT 
TO authenticated 
USING (
    organization_id IN (
        SELECT organization_id FROM public.users 
        WHERE auth_user_id = auth.uid()
    )
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assessment_responses_updated_at
    BEFORE UPDATE ON public.assessment_responses
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Insert assessment categories
INSERT INTO public.assessment_categories (name, code, order_index) VALUES
('Business Continuity, Disaster recovery, Backup', 'business_continuity', 1),
('Certificazioni', 'certifications', 2),
('Crittografia', 'cryptography', 3),
('Gestione delle identità Gestione degli accessi', 'identity_access_management', 4),
('Gestione degli incidenti', 'incident_management', 5),
('Gestione del rischio', 'risk_management', 6),
('Gestione delle risorse', 'resource_management', 7),
('Gestione fornitori e acquisti', 'vendor_management', 8),
('Governance', 'governance', 9),
('HR e formazione', 'hr_training', 10),
('Igiene informatica', 'cyber_hygiene', 11),
('Manutenzione e miglioramento continuo', 'maintenance_improvement', 12),
('Network Security Best Practices & Operations', 'network_security', 13),
('Sviluppo software', 'software_development', 14);

-- Insert services
INSERT INTO public.services (name, code, description, icon) VALUES
('HiFirewall', 'hi_firewall', 'Servizio di Firewall as a Service con incident management proattivo', 'shield'),
('HiEndpoint', 'hi_endpoint', 'Servizio di Endpoint Protection XDR con AI predittiva', 'monitor'),
('HiMail', 'hi_mail', 'Protezione email avanzata', 'mail'),
('HiLog', 'hi_log', 'Servizio di Log Management centralizzato', 'file'),
('HiPatch', 'hi_patch', 'Vulnerability Assessment e Patch Management', 'settings'),
('HiMFA', 'hi_mfa', 'Servizio di Autenticazione Multi-Fattore', 'key'),
('HiTrack', 'hi_track', 'Monitoraggio proattivo e incident management', 'zap'),
('HiDetect', 'hi_detect', 'Managed Detection & Response 24/7', 'search'),
('HiCloud Optix', 'hi_cloud_optix', 'Sicurezza negli ambienti cloud AWS, Azure, GCP', 'cloud'),
('HiPhish Threat', 'hi_phish_threat', 'Simulazioni di attacchi di phishing e formazione', 'user'),
('HiZTNA', 'hi_ztna', 'Zero Trust Network Access', 'lock'),
('HiMobile', 'hi_mobile', 'Mobile Device Management', 'monitor');

-- Insert sample organization and admin user
INSERT INTO public.organizations (name, code) VALUES ('HiCompliance Admin', 'admin');

-- Note: The admin user will be created when someone logs in with admin credentials