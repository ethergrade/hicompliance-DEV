ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS surface_scan360_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dark_risk360_enabled boolean NOT NULL DEFAULT false;