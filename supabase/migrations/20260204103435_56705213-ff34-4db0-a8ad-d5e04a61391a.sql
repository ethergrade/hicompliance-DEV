-- Add module permission for the new Compliance Events page
-- Insert permissions for all existing roles (super_admin, sales, client)

INSERT INTO public.role_module_permissions (role, module_path, module_name, is_enabled)
VALUES 
  ('super_admin', '/compliance-events', 'Eventi Compliance', true),
  ('sales', '/compliance-events', 'Eventi Compliance', true),
  ('client', '/compliance-events', 'Eventi Compliance', true)
ON CONFLICT (role, module_path) DO NOTHING;