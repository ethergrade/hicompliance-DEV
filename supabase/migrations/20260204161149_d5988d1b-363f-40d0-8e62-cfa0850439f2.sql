-- Create enum for NIS2 classification
CREATE TYPE public.nis2_classification AS ENUM ('essential', 'important', 'none');

-- Create organization_profiles table
CREATE TABLE public.organization_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legal_name TEXT,
  vat_number TEXT,
  fiscal_code TEXT,
  legal_address TEXT,
  operational_address TEXT,
  pec TEXT,
  phone TEXT,
  email TEXT,
  business_sector TEXT,
  nis2_classification public.nis2_classification,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Enable RLS
ALTER TABLE public.organization_profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their organization profile"
ON public.organization_profiles
FOR SELECT
USING (organization_id IN (
  SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can insert their organization profile"
ON public.organization_profiles
FOR INSERT
WITH CHECK (organization_id IN (
  SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can update their organization profile"
ON public.organization_profiles
FOR UPDATE
USING (organization_id IN (
  SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Admins can view all organization profiles"
ON public.organization_profiles
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM users WHERE users.auth_user_id = auth.uid() AND users.user_type = 'admin'::user_type
));

-- Create trigger for updated_at
CREATE TRIGGER update_organization_profiles_updated_at
BEFORE UPDATE ON public.organization_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();