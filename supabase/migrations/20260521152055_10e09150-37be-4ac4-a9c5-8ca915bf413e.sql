
-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- CVE intel cache (NVD + EPSS + KEV merged)
CREATE TABLE IF NOT EXISTS public.cve_intel_cache (
  cve_id TEXT PRIMARY KEY,
  description TEXT,
  cvss_v3_score NUMERIC,
  cvss_v3_vector TEXT,
  cvss_v3_severity TEXT,
  cvss_v2_score NUMERIC,
  cvss_v2_vector TEXT,
  cwe_ids TEXT[] DEFAULT '{}',
  references_json JSONB DEFAULT '[]'::jsonb,
  cpe_json JSONB DEFAULT '[]'::jsonb,
  exploit_links JSONB DEFAULT '[]'::jsonb,
  epss_score NUMERIC,
  epss_percentile NUMERIC,
  cisa_kev BOOLEAN DEFAULT false,
  kev_date_added DATE,
  kev_due_date DATE,
  kev_required_action TEXT,
  published_at TIMESTAMPTZ,
  last_modified_at TIMESTAMPTZ,
  nvd_status TEXT,
  fetch_status TEXT DEFAULT 'pending',
  fetch_error TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cve_intel_kev ON public.cve_intel_cache(cisa_kev) WHERE cisa_kev = true;
CREATE INDEX IF NOT EXISTS idx_cve_intel_epss ON public.cve_intel_cache(epss_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_cve_intel_refreshed ON public.cve_intel_cache(refreshed_at);

ALTER TABLE public.cve_intel_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read cve intel" ON public.cve_intel_cache;
CREATE POLICY "Authenticated can read cve intel"
  ON public.cve_intel_cache FOR SELECT TO authenticated USING (true);

-- Enrichment queue (auto-populated, processed sequentially)
CREATE TABLE IF NOT EXISTS public.cve_enrichment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cve_id TEXT NOT NULL,
  organization_id UUID,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (cve_id, status)
);

CREATE INDEX IF NOT EXISTS idx_cve_queue_status ON public.cve_enrichment_queue(status, queued_at);

ALTER TABLE public.cve_enrichment_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read queue" ON public.cve_enrichment_queue;
CREATE POLICY "Authenticated can read queue"
  ON public.cve_enrichment_queue FOR SELECT TO authenticated USING (true);

-- CISA KEV full catalog
CREATE TABLE IF NOT EXISTS public.cisa_kev_catalog (
  cve_id TEXT PRIMARY KEY,
  vendor_project TEXT,
  product TEXT,
  vulnerability_name TEXT,
  date_added DATE,
  short_description TEXT,
  required_action TEXT,
  due_date DATE,
  known_ransomware_use TEXT,
  notes TEXT,
  cwes TEXT[] DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kev_date ON public.cisa_kev_catalog(date_added DESC);

ALTER TABLE public.cisa_kev_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read kev catalog" ON public.cisa_kev_catalog;
CREATE POLICY "Authenticated can read kev catalog"
  ON public.cisa_kev_catalog FOR SELECT TO authenticated USING (true);

-- Helper: enqueue CVE for enrichment (called by triggers)
CREATE OR REPLACE FUNCTION public.enqueue_cve_enrichment(_cves TEXT[], _org_id UUID, _source TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cve TEXT;
BEGIN
  IF _cves IS NULL THEN RETURN; END IF;
  FOREACH _cve IN ARRAY _cves LOOP
    IF _cve IS NULL OR _cve = '' THEN CONTINUE; END IF;
    -- Skip if already cached recently (<7 days)
    IF EXISTS (
      SELECT 1 FROM public.cve_intel_cache
      WHERE cve_id = upper(_cve)
        AND fetch_status = 'ok'
        AND refreshed_at > now() - interval '7 days'
    ) THEN CONTINUE; END IF;
    -- Enqueue if not already queued/processing
    INSERT INTO public.cve_enrichment_queue (cve_id, organization_id, source, status)
    VALUES (upper(_cve), _org_id, _source, 'queued')
    ON CONFLICT (cve_id, status) DO NOTHING;
  END LOOP;
END;
$$;

-- Trigger on surface_findings: enqueue CVEs
CREATE OR REPLACE FUNCTION public.trg_surface_findings_enqueue_cve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cve IS NOT NULL AND array_length(NEW.cve, 1) > 0 THEN
    PERFORM public.enqueue_cve_enrichment(NEW.cve, NEW.organization_id, 'surface_findings');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS surface_findings_enqueue_cve ON public.surface_findings;
CREATE TRIGGER surface_findings_enqueue_cve
AFTER INSERT OR UPDATE OF cve ON public.surface_findings
FOR EACH ROW EXECUTE FUNCTION public.trg_surface_findings_enqueue_cve();

-- Trigger on external_cve_findings: enqueue CVEs
CREATE OR REPLACE FUNCTION public.trg_external_cve_enqueue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cve IS NOT NULL AND array_length(NEW.cve, 1) > 0 THEN
    PERFORM public.enqueue_cve_enrichment(NEW.cve, NEW.organization_id, 'external_cve_findings');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS external_cve_enqueue ON public.external_cve_findings;
CREATE TRIGGER external_cve_enqueue
AFTER INSERT OR UPDATE OF cve ON public.external_cve_findings
FOR EACH ROW EXECUTE FUNCTION public.trg_external_cve_enqueue();
