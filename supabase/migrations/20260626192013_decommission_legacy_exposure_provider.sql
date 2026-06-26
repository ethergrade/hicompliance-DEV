-- Forward-only decommissioning of the legacy active exposure provider.
-- Runtime code now relies on SurfaceScan360 canonical tables, ConnectSecure ASM,
-- subdomain_enrichment jobs, and internal engines.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'pentest_tools_auto_validation'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'surface_scan_auto_validation'
  ) THEN
    ALTER TABLE public.organizations
      RENAME COLUMN pentest_tools_auto_validation TO surface_scan_auto_validation;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'pentest_tools_auto_validation'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'surface_scan_auto_validation'
  ) THEN
    UPDATE public.organizations
    SET surface_scan_auto_validation = COALESCE(surface_scan_auto_validation, pentest_tools_auto_validation);

    ALTER TABLE public.organizations
      DROP COLUMN pentest_tools_auto_validation;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'surface_scan_auto_validation'
  ) THEN
    ALTER TABLE public.organizations
      ADD COLUMN surface_scan_auto_validation boolean NOT NULL DEFAULT true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'surface_scan_auto_validation'
  ) THEN
    ALTER TABLE public.organizations
      ALTER COLUMN surface_scan_auto_validation SET DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.pentest_tools_scans') IS NOT NULL
     AND to_regclass('public.external_exposure_scan_tasks') IS NULL THEN
    ALTER TABLE public.pentest_tools_scans
      RENAME TO external_exposure_scan_tasks;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'surface_open_ports')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'surface_open_ports' AND column_name = 'source') THEN
    UPDATE public.surface_open_ports
    SET source = 'legacy_external_scan'
    WHERE source ILIKE '%pentest%' OR source ILIKE '%ptools%';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'surface_technologies')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'surface_technologies' AND column_name = 'source') THEN
    UPDATE public.surface_technologies
    SET source = 'legacy_external_scan'
    WHERE source ILIKE '%pentest%' OR source ILIKE '%ptools%';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'surface_assets')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'surface_assets' AND column_name = 'source') THEN
    UPDATE public.surface_assets
    SET source = 'legacy_external_scan'
    WHERE source ILIKE '%pentest%' OR source ILIKE '%ptools%';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'surface_findings') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'surface_findings' AND column_name = 'provider') THEN
      UPDATE public.surface_findings
      SET provider = 'legacy_external_scan'
      WHERE provider ILIKE '%pentest%' OR provider ILIKE '%ptools%';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'surface_findings' AND column_name = 'module') THEN
      UPDATE public.surface_findings
      SET module = 'legacy_external_scan'
      WHERE module ILIKE '%pentest%' OR module ILIKE '%ptools%';
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  job_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    FOREACH job_name IN ARRAY ARRAY[
      'pentest-tools-poll-every-2min',
      'ptools-poll-scans-every-2min',
      'surface-ptools-poll-scans-every-2min'
    ] LOOP
      BEGIN
        PERFORM cron.unschedule(job_name);
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END LOOP;
  END IF;
END $$;
