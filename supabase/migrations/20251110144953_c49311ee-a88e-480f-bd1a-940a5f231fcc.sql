-- Add permission for sales role to access asset inventory
INSERT INTO public.role_module_permissions (role, module_path, module_name, is_enabled)
VALUES ('sales', '/asset-inventory', 'Inventario Asset', true)
ON CONFLICT DO NOTHING;