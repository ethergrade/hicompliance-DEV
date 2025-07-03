-- Create a real admin user in the auth system
-- First, we need to insert into auth.users, but we'll do this through a function

-- Create admin account directly
DO $$
DECLARE
    admin_user_id UUID;
    admin_org_id UUID;
BEGIN
    -- Get the admin organization ID
    SELECT id INTO admin_org_id FROM public.organizations WHERE code = 'admin';
    
    -- Check if admin user already exists
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE email = 'admin@hicompliance.local') THEN
        -- Insert admin user (we'll create the auth user manually through the interface)
        INSERT INTO public.users (
            email, 
            full_name, 
            user_type, 
            organization_id
        ) VALUES (
            'admin@hicompliance.local',
            'Administrator',
            'admin',
            admin_org_id
        );
    END IF;
END $$;