-- Older DEV tables were created outside migration history and missed these
-- organization ownership constraints. Clean environments already have them.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'connectsecure_domain_registry_organization_id_fkey'
      AND conrelid = 'public.connectsecure_domain_registry'::regclass
  ) THEN
    ALTER TABLE public.connectsecure_domain_registry
      ADD CONSTRAINT connectsecure_domain_registry_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'connectsecure_sensitive_data_organization_id_fkey'
      AND conrelid = 'public.connectsecure_sensitive_data'::regclass
  ) THEN
    ALTER TABLE public.connectsecure_sensitive_data
      ADD CONSTRAINT connectsecure_sensitive_data_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'surface_scan_monthly_reports_organization_id_fkey'
      AND conrelid = 'public.surface_scan_monthly_reports'::regclass
  ) THEN
    ALTER TABLE public.surface_scan_monthly_reports
      ADD CONSTRAINT surface_scan_monthly_reports_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.connectsecure_domain_registry
  VALIDATE CONSTRAINT connectsecure_domain_registry_organization_id_fkey;
ALTER TABLE public.connectsecure_sensitive_data
  VALIDATE CONSTRAINT connectsecure_sensitive_data_organization_id_fkey;
ALTER TABLE public.surface_scan_monthly_reports
  VALIDATE CONSTRAINT surface_scan_monthly_reports_organization_id_fkey;
