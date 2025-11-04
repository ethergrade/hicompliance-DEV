-- Create table for role module permissions
CREATE TABLE IF NOT EXISTS public.role_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  module_path text NOT NULL,
  module_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(role, module_path)
);

-- Enable RLS
ALTER TABLE public.role_module_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Super admins can manage all permissions
CREATE POLICY "Super admins can manage permissions"
ON public.role_module_permissions
FOR ALL
USING (has_role(auth.uid(), 'super_admin'));

-- Policy: Users can view permissions for their role
CREATE POLICY "Users can view their role permissions"
ON public.role_module_permissions
FOR SELECT
USING (
  role IN (
    SELECT user_roles.role 
    FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid()
  )
);

-- Enable realtime
ALTER TABLE public.role_module_permissions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.role_module_permissions;

-- Insert default permissions for sales role (all modules disabled by default except allowed ones)
INSERT INTO public.role_module_permissions (role, module_path, module_name, is_enabled) VALUES
  ('sales', '/', 'Home', true),
  ('sales', '/dashboard', 'Dashboard', true),
  ('sales', '/assessment', 'Assessment', true),
  ('sales', '/surface-scan', 'SurfaceScan360', true),
  ('sales', '/dark-risk', 'DarkRisk360', true),
  ('sales', '/analytics', 'Analisi', true),
  ('sales', '/remediation', 'Remediation', true),
  ('sales', '/threats', 'Minacce', false),
  ('sales', '/reports', 'Report', true),
  ('sales', '/documents', 'Gestione Documenti', true),
  ('sales', '/incident-response', 'Incident Response', true),
  ('sales', '/threat-management', 'Threat Management', false),
  ('sales', '/settings/users', 'Utenti', true),
  ('sales', '/settings/integrations', 'Integrazioni', true)
ON CONFLICT (role, module_path) DO NOTHING;