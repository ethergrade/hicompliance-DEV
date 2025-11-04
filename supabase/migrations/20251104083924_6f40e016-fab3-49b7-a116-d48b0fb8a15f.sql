-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'sales', 'client');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user roles
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS SETOF app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
$$;

-- RLS Policies
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can manage all roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'));

-- Insert roles for admin@admin.com (assuming the user exists)
INSERT INTO public.user_roles (user_id, role)
SELECT auth_user_id, 'super_admin'::app_role
FROM public.users
WHERE email = 'admin@admin.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Create sales user if not exists and assign role
DO $$
DECLARE
  sales_auth_id UUID;
  sales_user_id UUID;
  default_org_id UUID;
BEGIN
  -- Get a default organization (first one)
  SELECT id INTO default_org_id FROM public.organizations LIMIT 1;
  
  -- Check if sales user already exists in users table
  SELECT auth_user_id INTO sales_auth_id FROM public.users WHERE email = 'sales@sales.com';
  
  -- If not in users table, we'll add a placeholder that will be updated on first login
  IF sales_auth_id IS NULL THEN
    -- Create placeholder in users table
    INSERT INTO public.users (email, full_name, user_type, organization_id)
    VALUES ('sales@sales.com', 'Sales User', 'client', default_org_id)
    RETURNING id INTO sales_user_id;
  END IF;
END $$;