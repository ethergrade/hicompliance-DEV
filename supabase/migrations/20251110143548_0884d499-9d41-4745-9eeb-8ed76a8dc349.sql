-- Create asset inventory table
CREATE TABLE public.asset_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  users_count INTEGER DEFAULT 0,
  locations_count INTEGER DEFAULT 0,
  endpoints_count INTEGER DEFAULT 0,
  servers_count INTEGER DEFAULT 0,
  hypervisors_count INTEGER DEFAULT 0,
  virtual_machines_count INTEGER DEFAULT 0,
  firewalls_count INTEGER DEFAULT 0,
  core_switches_count INTEGER DEFAULT 0,
  access_switches_count INTEGER DEFAULT 0,
  access_points_count INTEGER DEFAULT 0,
  total_network_devices_count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.asset_inventory ENABLE ROW LEVEL SECURITY;

-- Users can view their organization's asset inventory
CREATE POLICY "Users can view their organization's asset inventory"
ON public.asset_inventory
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id 
    FROM users 
    WHERE auth_user_id = auth.uid()
  )
);

-- Users can create asset inventory for their organization
CREATE POLICY "Users can create asset inventory for their organization"
ON public.asset_inventory
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM users 
    WHERE auth_user_id = auth.uid()
  )
);

-- Users can update their organization's asset inventory
CREATE POLICY "Users can update their organization's asset inventory"
ON public.asset_inventory
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id 
    FROM users 
    WHERE auth_user_id = auth.uid()
  )
);

-- Admins can view all asset inventories
CREATE POLICY "Admins can view all asset inventories"
ON public.asset_inventory
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE auth_user_id = auth.uid() 
    AND user_type = 'admin'
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_asset_inventory_updated_at
BEFORE UPDATE ON public.asset_inventory
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();