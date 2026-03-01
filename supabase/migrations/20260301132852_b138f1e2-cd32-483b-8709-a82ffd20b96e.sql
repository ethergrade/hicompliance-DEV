
INSERT INTO public.role_module_permissions (role, module_path, module_name, is_enabled)
VALUES
  ('super_admin', '/consistenze', 'Consistenze', true),
  ('sales', '/consistenze', 'Consistenze', true),
  ('client', '/consistenze', 'Consistenze', true)
ON CONFLICT DO NOTHING;
