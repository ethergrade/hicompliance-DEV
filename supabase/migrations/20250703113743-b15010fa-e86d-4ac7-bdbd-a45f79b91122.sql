-- Fix infinite recursion in RLS policies
-- First, drop the problematic policy
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

-- Create a security definer function to get user type safely
CREATE OR REPLACE FUNCTION public.get_current_user_type()
RETURNS text AS $$
  SELECT user_type::text FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Recreate the admin policy using the function
CREATE POLICY "Admins can view all users" 
ON public.users 
FOR ALL 
TO authenticated
USING (public.get_current_user_type() = 'admin');

-- Insert comprehensive test data
-- First, ensure we have test organizations (some may already exist)
INSERT INTO public.organizations (name, code) 
VALUES 
  ('Azienda Cliente Demo 1', 'cliente1'),
  ('Banca Regionale Sud', 'cliente2'), 
  ('Tech Innovation SRL', 'cliente3'),
  ('Manifattura Italiana SpA', 'cliente4'),
  ('StartupHub Milano', 'cliente5')
ON CONFLICT (code) DO NOTHING;

-- Insert test users with auth_user_id as null (simulating real users would have actual auth ids)
INSERT INTO public.users (email, full_name, user_type, organization_id) 
SELECT 
  email,
  full_name,
  user_type::user_type,
  org.id
FROM (
  VALUES 
    ('admin@cliente1.com', 'Mario Rossi', 'client', 'cliente1'),
    ('security@cliente1.com', 'Lucia Bianchi', 'client', 'cliente1'),
    ('admin@cliente2.com', 'Giuseppe Verdi', 'client', 'cliente2'),
    ('tech@cliente2.com', 'Anna Ferrari', 'client', 'cliente2'),
    ('admin@cliente3.com', 'Francesco Neri', 'client', 'cliente3'),
    ('ciso@cliente3.com', 'Elena Rossi', 'client', 'cliente3'),
    ('admin@cliente4.com', 'Roberto Blu', 'client', 'cliente4'),
    ('security@cliente4.com', 'Chiara Verde', 'client', 'cliente4'),
    ('admin@cliente5.com', 'Marco Gialli', 'client', 'cliente5'),
    ('admin@hicompliance.com', 'Admin HiCompliance', 'admin', NULL),
    ('support@hicompliance.com', 'Support Team', 'admin', NULL)
) AS t(email, full_name, user_type, org_code)
JOIN public.organizations org ON org.code = t.org_code OR t.org_code IS NULL
ON CONFLICT (email) DO NOTHING;