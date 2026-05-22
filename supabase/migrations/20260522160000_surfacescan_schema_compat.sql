-- SurfaceScan360 compatibility layer for existing organization_id schema.
-- This keeps older data model compatible with new engine fields (customer_id, tenant_id).

ALTER TABLE IF EXISTS public.surface_scan_jobs
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid;

ALTER TABLE IF EXISTS public.surface_assets
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid;

ALTER TABLE IF EXISTS public.surface_observations
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid;

ALTER TABLE IF EXISTS public.surface_findings
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid;

ALTER TABLE IF EXISTS public.surface_external_intel
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid;

ALTER TABLE IF EXISTS public.surface_scan_audit_log
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid;

-- Backfill from organization_id where available.
UPDATE public.surface_scan_jobs
SET customer_id = organization_id
WHERE customer_id IS NULL AND organization_id IS NOT NULL;

UPDATE public.surface_scan_jobs
SET tenant_id = COALESCE(tenant_id, customer_id, organization_id)
WHERE tenant_id IS NULL;

UPDATE public.surface_assets
SET customer_id = organization_id
WHERE customer_id IS NULL AND organization_id IS NOT NULL;

UPDATE public.surface_assets
SET tenant_id = COALESCE(tenant_id, customer_id, organization_id)
WHERE tenant_id IS NULL;

UPDATE public.surface_observations
SET customer_id = organization_id
WHERE customer_id IS NULL AND organization_id IS NOT NULL;

UPDATE public.surface_observations
SET tenant_id = COALESCE(tenant_id, customer_id, organization_id)
WHERE tenant_id IS NULL;

UPDATE public.surface_findings
SET customer_id = organization_id
WHERE customer_id IS NULL AND organization_id IS NOT NULL;

UPDATE public.surface_findings
SET tenant_id = COALESCE(tenant_id, customer_id, organization_id)
WHERE tenant_id IS NULL;

UPDATE public.surface_external_intel
SET customer_id = organization_id
WHERE customer_id IS NULL AND organization_id IS NOT NULL;

UPDATE public.surface_external_intel
SET tenant_id = COALESCE(tenant_id, customer_id, organization_id)
WHERE tenant_id IS NULL;

UPDATE public.surface_scan_audit_log l
SET customer_id = j.customer_id,
    tenant_id = COALESCE(j.tenant_id, j.customer_id, j.organization_id)
FROM public.surface_scan_jobs j
WHERE l.scan_job_id = j.id
  AND (l.customer_id IS NULL OR l.tenant_id IS NULL);

-- Optional consistency backfill if legacy rows have customer_id but null organization_id.
UPDATE public.surface_scan_jobs
SET organization_id = customer_id
WHERE organization_id IS NULL AND customer_id IS NOT NULL;

UPDATE public.surface_assets
SET organization_id = customer_id
WHERE organization_id IS NULL AND customer_id IS NOT NULL;

UPDATE public.surface_observations
SET organization_id = customer_id
WHERE organization_id IS NULL AND customer_id IS NOT NULL;

UPDATE public.surface_findings
SET organization_id = customer_id
WHERE organization_id IS NULL AND customer_id IS NOT NULL;

UPDATE public.surface_external_intel
SET organization_id = customer_id
WHERE organization_id IS NULL AND customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_surface_scan_jobs_customer_status
  ON public.surface_scan_jobs(customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_assets_customer
  ON public.surface_assets(customer_id, asset_type, asset_value);

CREATE INDEX IF NOT EXISTS idx_surface_findings_customer
  ON public.surface_findings(customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_observations_customer
  ON public.surface_observations(customer_id, module, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_external_intel_customer
  ON public.surface_external_intel(customer_id, provider, created_at DESC);
