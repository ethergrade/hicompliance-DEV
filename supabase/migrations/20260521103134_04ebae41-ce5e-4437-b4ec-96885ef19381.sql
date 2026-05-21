
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS hicompliance_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS irp_extended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surface_scan_extended boolean NOT NULL DEFAULT false;
