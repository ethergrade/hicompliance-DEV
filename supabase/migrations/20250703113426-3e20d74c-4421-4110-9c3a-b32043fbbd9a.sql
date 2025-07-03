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

-- Populate organization_services with realistic test data
DO $$
DECLARE
    org_record RECORD;
    service_record RECORD;
    random_health INTEGER;
    random_status text;
BEGIN
    -- For each organization
    FOR org_record IN SELECT id, code FROM public.organizations LOOP
        -- For each service  
        FOR service_record IN SELECT id, code FROM public.services LOOP
            -- Generate realistic data based on service type and organization
            CASE 
                WHEN service_record.code LIKE 'hi_%' THEN
                    -- HiSolution services - more varied status
                    CASE 
                        WHEN org_record.code = 'cliente1' THEN
                            -- Cliente1 has several issues
                            CASE service_record.code
                                WHEN 'hi_firewall' THEN random_health := 15; random_status := 'alert';
                                WHEN 'hi_endpoint' THEN random_health := 70; random_status := 'alert';
                                WHEN 'hi_mail' THEN random_health := 80; random_status := 'alert';
                                WHEN 'hi_log' THEN random_health := 10; random_status := 'alert';
                                WHEN 'hi_patch' THEN random_health := 50; random_status := 'alert';
                                WHEN 'hi_mfa' THEN random_health := 95; random_status := 'active';
                                WHEN 'hi_track' THEN random_health := 90; random_status := 'active';
                            END CASE;
                        WHEN org_record.code = 'cliente2' THEN
                            -- Cliente2 moderate issues
                            CASE service_record.code
                                WHEN 'hi_firewall' THEN random_health := 85; random_status := 'active';
                                WHEN 'hi_endpoint' THEN random_health := 78; random_status := 'active';
                                WHEN 'hi_mail' THEN random_health := 45; random_status := 'alert';
                                WHEN 'hi_log' THEN random_health := 60; random_status := 'alert';
                                WHEN 'hi_patch' THEN random_health := 75; random_status := 'maintenance';
                                WHEN 'hi_mfa' THEN random_health := 88; random_status := 'active';
                                WHEN 'hi_track' THEN random_health := 92; random_status := 'active';
                            END CASE;
                        ELSE
                            -- Other organizations - generally good
                            random_health := 75 + (random() * 20)::integer;
                            random_status := CASE 
                                WHEN random() > 0.8 THEN 'alert'
                                WHEN random() > 0.9 THEN 'maintenance'  
                                ELSE 'active'
                            END;
                    END CASE;
                ELSE
                    -- Traditional security services
                    random_health := 60 + (random() * 35)::integer;
                    random_status := CASE 
                        WHEN random() > 0.7 THEN 'alert'
                        WHEN random() > 0.85 THEN 'maintenance'
                        ELSE 'active'
                    END;
            END CASE;
            
            -- Insert the service for this organization
            INSERT INTO public.organization_services (organization_id, service_id, status, health_score, last_updated)
            VALUES (
                org_record.id, 
                service_record.id, 
                random_status::service_status, 
                random_health,
                now() - interval '1 hour' * (random() * 48)::integer
            )
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- Insert assessment responses for some organizations
DO $$
DECLARE
    org_id uuid;
    question_id uuid;
    response_status assessment_status;
BEGIN
    -- Get cliente1 organization
    SELECT id INTO org_id FROM public.organizations WHERE code = 'cliente1';
    
    -- Insert some assessment responses
    FOR question_id IN SELECT id FROM public.assessment_questions LIMIT 15 LOOP
        response_status := (ARRAY['not_applicable', 'planned_in_progress', 'completed'])[floor(random() * 3 + 1)];
        
        INSERT INTO public.assessment_responses (organization_id, question_id, status, notes)
        VALUES (
            org_id,
            question_id,
            response_status,
            CASE response_status
                WHEN 'completed' THEN 'Implementato e verificato'
                WHEN 'planned_in_progress' THEN 'In fase di implementazione'
                ELSE 'Non applicabile al nostro contesto'
            END
        ) ON CONFLICT DO NOTHING;
    END LOOP;
END $$;