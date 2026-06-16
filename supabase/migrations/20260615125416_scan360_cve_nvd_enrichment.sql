-- NUCLEI-SCAN360 LAB CVE intelligence: confirmed Nuclei matches + potential NVD/CPE matches.
-- Additive and idempotent; keeps previous Nuclei/Nmap pipeline data intact.

ALTER TABLE public.nuclei_scan360_jobs
  DROP CONSTRAINT IF EXISTS nuclei_scan360_jobs_profile_check;

ALTER TABLE public.nuclei_scan360_jobs
  ADD CONSTRAINT nuclei_scan360_jobs_profile_check
  CHECK (profile IN (
    'baseline_headers',
    'exposure_medium',
    'web_vuln_safe',
    'web_cve_recent',
    'web_cve_2026',
    'web_cve_2025',
    'web_cve_2024',
    'web_cve_2023',
    'web_cve_2022',
    'web_vuln_authorized'
  ));

ALTER TABLE public.nuclei_scan360_cve_matches
  ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'high',
  ADD COLUMN IF NOT EXISTS cpe text,
  ADD COLUMN IF NOT EXISTS port_id uuid REFERENCES public.nuclei_scan360_open_ports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS nvd_status text,
  ADD COLUMN IF NOT EXISTS cvss_vector text,
  ADD COLUMN IF NOT EXISTS cvss_version text,
  ADD COLUMN IF NOT EXISTS epss_percentile numeric,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_modified_at timestamptz;

DO $$
BEGIN
  ALTER TABLE public.nuclei_scan360_cve_matches
    ADD CONSTRAINT nuclei_scan360_cve_matches_status_check
    CHECK (match_status IN ('confirmed', 'potential'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.nuclei_scan360_cve_matches
    ADD CONSTRAINT nuclei_scan360_cve_matches_confidence_check
    CHECK (confidence IN ('high', 'medium', 'low'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_nuclei_cve_matches_job_status
  ON public.nuclei_scan360_cve_matches(job_id, match_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nuclei_cve_matches_port
  ON public.nuclei_scan360_cve_matches(port_id);

CREATE INDEX IF NOT EXISTS idx_nuclei_cve_matches_cpe
  ON public.nuclei_scan360_cve_matches(cpe)
  WHERE cpe IS NOT NULL;

UPDATE public.nuclei_scan360_cve_matches
SET
  match_status = COALESCE(match_status, 'confirmed'),
  confidence = COALESCE(confidence, CASE WHEN source = 'nuclei' THEN 'high' ELSE 'medium' END);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nuclei_scan360_cve_matches TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cve_enrichment_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cve_intel_cache TO authenticated;

DROP POLICY IF EXISTS "Authenticated can manage cve enrichment queue" ON public.cve_enrichment_queue;
CREATE POLICY "Authenticated can manage cve enrichment queue"
  ON public.cve_enrichment_queue
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can upsert cve intel cache" ON public.cve_intel_cache;
CREATE POLICY "Authenticated can upsert cve intel cache"
  ON public.cve_intel_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update cve intel cache" ON public.cve_intel_cache;
CREATE POLICY "Authenticated can update cve intel cache"
  ON public.cve_intel_cache
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
