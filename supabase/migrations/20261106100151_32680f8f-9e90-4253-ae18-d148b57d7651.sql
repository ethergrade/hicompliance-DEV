ALTER TABLE public.organization_profiles
 ADD COLUMN IF NOT EXISTS primary_domain text,
 ADD COLUMN IF NOT EXISTS primary_subnet text,
 ADD COLUMN IF NOT EXISTS secondary_domain text,
 ADD COLUMN IF NOT EXISTS secondary_subnet text,
 ADD COLUMN IF NOT EXISTS revenue numeric,
 ADD COLUMN IF NOT EXISTS employees_count integer,
 ADD COLUMN IF NOT EXISTS customer_sectors text[] DEFAULT '{}'::text[],
 ADD COLUMN IF NOT EXISTS implemented_technologies text[] DEFAULT '{}'::text[];