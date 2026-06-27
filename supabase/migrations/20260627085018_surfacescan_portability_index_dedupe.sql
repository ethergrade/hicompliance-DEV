-- DEV had manually-created indexes before the portability migration entered
-- version control. Drop only indexes duplicated by those legacy equivalents.

DO $$
BEGIN
  IF to_regclass('public.connectsecure_config_org_unique') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.connectsecure_config_organization_uidx;
  END IF;

  IF to_regclass('public.idx_cs_sensitive_org') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.connectsecure_sensitive_data_org_created_idx;
  END IF;

  IF to_regclass('public.idx_surface_scan_monthly_org') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.surface_scan_monthly_reports_org_month_idx;
  END IF;

  IF to_regclass('public.surface_scan_monthly_reports_unique') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.surface_scan_monthly_reports_org_month_uidx;
  END IF;
END $$;
