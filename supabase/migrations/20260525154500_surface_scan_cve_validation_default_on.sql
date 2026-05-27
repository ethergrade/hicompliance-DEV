-- SurfaceScan360: CVE active validation is always-on by default.
-- Keep the flag for backward compatibility, but force default true and backfill existing organizations.

ALTER TABLE public.organizations
  ALTER COLUMN pentest_tools_auto_validation SET DEFAULT true;

UPDATE public.organizations
SET pentest_tools_auto_validation = true
WHERE pentest_tools_auto_validation IS DISTINCT FROM true;

