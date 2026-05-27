-- SurfaceScan360: riduce la finestra cache CVE da 7 giorni a 1 giorno
-- per mantenere NVD/EPSS/KEV più freschi con enrichment automatico continuo.
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

    -- Skip solo se arricchito con successo nelle ultime 24h.
    IF EXISTS (
      SELECT 1
      FROM public.cve_intel_cache
      WHERE cve_id = upper(_cve)
        AND fetch_status = 'ok'
        AND refreshed_at > now() - interval '1 day'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.cve_enrichment_queue (cve_id, organization_id, source, status)
    VALUES (upper(_cve), _org_id, _source, 'queued')
    ON CONFLICT (cve_id, status) DO NOTHING;
  END LOOP;
END;
$$;

