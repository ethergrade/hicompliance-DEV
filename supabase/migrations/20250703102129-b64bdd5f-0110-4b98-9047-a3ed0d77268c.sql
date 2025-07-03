-- Update admin user email to admin@admin.com
UPDATE public.users 
SET email = 'admin@admin.com' 
WHERE email = 'admin@hicompliance.local' OR user_type = 'admin';

-- Insert admin user if it doesn't exist
DO $$
DECLARE
    admin_org_id UUID;
BEGIN
    -- Get the admin organization ID
    SELECT id INTO admin_org_id FROM public.organizations WHERE code = 'admin';
    
    -- Insert admin user if not exists
    INSERT INTO public.users (
        email, 
        full_name, 
        user_type, 
        organization_id
    ) 
    SELECT 
        'admin@admin.com',
        'Administrator',
        'admin',
        admin_org_id
    WHERE NOT EXISTS (
        SELECT 1 FROM public.users WHERE email = 'admin@admin.com'
    );
END $$;