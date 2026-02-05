-- Create audit log table for integration changes
CREATE TABLE public.integration_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  service_name TEXT NOT NULL,
  changed_by UUID,
  changed_by_email TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.integration_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view audit logs for their organization or if they can manage all orgs
CREATE POLICY "Users can view audit logs for their organization"
ON public.integration_audit_logs
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()
  )
  OR public.can_manage_all_organizations(auth.uid())
);

-- Policy: Only system (triggers) can insert - use service role
CREATE POLICY "System can insert audit logs"
ON public.integration_audit_logs
FOR INSERT
WITH CHECK (true);

-- Create function to log integration changes
CREATE OR REPLACE FUNCTION public.log_integration_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_service_name TEXT;
  v_user_email TEXT;
  v_old_values JSONB := NULL;
  v_new_values JSONB := NULL;
BEGIN
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
  END IF;

  -- Get service name
  IF TG_OP = 'DELETE' THEN
    SELECT name INTO v_service_name FROM public.hisolution_services WHERE id = OLD.service_id;
  ELSE
    SELECT name INTO v_service_name FROM public.hisolution_services WHERE id = NEW.service_id;
  END IF;

  -- Get user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  -- Build old/new values (excluding sensitive api_key)
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_values := jsonb_build_object(
      'api_url', OLD.api_url,
      'is_active', OLD.is_active,
      'api_methods', OLD.api_methods
    );
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_values := jsonb_build_object(
      'api_url', NEW.api_url,
      'is_active', NEW.is_active,
      'api_methods', NEW.api_methods
    );
  END IF;

  -- Insert audit log
  INSERT INTO public.integration_audit_logs (
    integration_id,
    organization_id,
    action,
    service_name,
    changed_by,
    changed_by_email,
    old_values,
    new_values
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.organization_id, OLD.organization_id),
    v_action,
    COALESCE(v_service_name, 'Unknown'),
    auth.uid(),
    v_user_email,
    v_old_values,
    v_new_values
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on organization_integrations
CREATE TRIGGER integration_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.organization_integrations
FOR EACH ROW
EXECUTE FUNCTION public.log_integration_change();

-- Create index for faster queries
CREATE INDEX idx_integration_audit_logs_org_id ON public.integration_audit_logs(organization_id);
CREATE INDEX idx_integration_audit_logs_created_at ON public.integration_audit_logs(created_at DESC);