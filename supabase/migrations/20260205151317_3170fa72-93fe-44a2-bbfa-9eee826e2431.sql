-- Enable CyberNews module for relevant roles (idempotent)
DO $$
BEGIN
  -- Sales
  IF NOT EXISTS (
    SELECT 1 FROM public.role_module_permissions 
    WHERE role = 'sales' AND module_path = '/cyber-news'
  ) THEN
    INSERT INTO public.role_module_permissions (role, module_path, module_name, is_enabled)
    VALUES ('sales', '/cyber-news', 'CyberNews', true);
  END IF;

  -- Client
  IF NOT EXISTS (
    SELECT 1 FROM public.role_module_permissions 
    WHERE role = 'client' AND module_path = '/cyber-news'
  ) THEN
    INSERT INTO public.role_module_permissions (role, module_path, module_name, is_enabled)
    VALUES ('client', '/cyber-news', 'CyberNews', true);
  END IF;

  -- Super admin (optional; super admins bypass checks, but we add it for completeness)
  IF NOT EXISTS (
    SELECT 1 FROM public.role_module_permissions 
    WHERE role = 'super_admin' AND module_path = '/cyber-news'
  ) THEN
    INSERT INTO public.role_module_permissions (role, module_path, module_name, is_enabled)
    VALUES ('super_admin', '/cyber-news', 'CyberNews', true);
  END IF;
END $$;
