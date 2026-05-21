ALTER TABLE public.surface_scan_monitored_ips
  ADD COLUMN IF NOT EXISTS discovered_via text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS discovered_from text;

CREATE INDEX IF NOT EXISTS idx_surface_scan_monitored_ips_discovered_via
  ON public.surface_scan_monitored_ips (organization_id, discovered_via);