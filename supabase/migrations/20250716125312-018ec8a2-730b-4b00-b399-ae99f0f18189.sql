-- Tabella per le sedi dell'organizzazione
CREATE TABLE public.organization_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'Italia',
  tags TEXT[] DEFAULT '{}',
  is_main_location BOOLEAN DEFAULT false,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organization_locations ENABLE ROW LEVEL SECURITY;

-- Policies for organization_locations
CREATE POLICY "Users can view their organization's locations" 
ON public.organization_locations 
FOR SELECT 
USING (organization_id IN (
  SELECT users.organization_id
  FROM users
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can create locations for their organization" 
ON public.organization_locations 
FOR INSERT 
WITH CHECK (organization_id IN (
  SELECT users.organization_id
  FROM users
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can update their organization's locations" 
ON public.organization_locations 
FOR UPDATE 
USING (organization_id IN (
  SELECT users.organization_id
  FROM users
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can delete their organization's locations" 
ON public.organization_locations 
FOR DELETE 
USING (organization_id IN (
  SELECT users.organization_id
  FROM users
  WHERE users.auth_user_id = auth.uid()
));

-- Add update trigger for organization_locations
CREATE TRIGGER update_organization_locations_updated_at
  BEFORE UPDATE ON public.organization_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Allow users to update their organization name
CREATE POLICY "Users can update their organization" 
ON public.organizations 
FOR UPDATE 
USING (id IN (
  SELECT users.organization_id
  FROM users
  WHERE users.auth_user_id = auth.uid()
));