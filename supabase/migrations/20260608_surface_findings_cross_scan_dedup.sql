-- SurfaceScan360 — Fix 3: DEDUP cross-scan per surface_findings
-- Aggiunge fingerprint deterministica, elimina duplicati storici, crea UNIQUE INDEX
-- e trigger BEFORE UPDATE che preserva first_seen_at e incrementa occurrence_count.
-- Include backfill 8A: porte da surface_findings → surface_open_ports.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Colonne lifecycle
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.surface_findings
  ADD COLUMN IF NOT EXISTS first_seen_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at     timestamptz,
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1;

UPDATE public.surface_findings
  SET first_seen_at = created_at,
      last_seen_at  = created_at
  WHERE first_seen_at IS NULL;

ALTER TABLE public.surface_findings
  ALTER COLUMN first_seen_at SET DEFAULT now(),
  ALTER COLUMN last_seen_at  SET DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Colonna fingerprint (GENERATED ALWAYS AS STORED)
--    Combinazione: cliente + tipo + asset (lowercase) + porta
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.surface_findings
  ADD COLUMN IF NOT EXISTS dedup_fingerprint text GENERATED ALWAYS AS (
    md5(
      coalesce(customer_id::text, organization_id::text, '') || '|' ||
      coalesce(finding_type, '')                            || '|' ||
      lower(coalesce(affected_asset, ''))                   || '|' ||
      coalesce(port::text, '0')
    )
  ) STORED;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Elimina duplicati esistenti — mantiene il record più vecchio per fingerprint
-- ─────────────────────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY dedup_fingerprint
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.surface_findings
  WHERE dedup_fingerprint IS NOT NULL
)
DELETE FROM public.surface_findings
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. UNIQUE INDEX sulla fingerprint
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS surface_findings_dedup_fp_idx
  ON public.surface_findings (dedup_fingerprint);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Trigger BEFORE UPDATE: preserva first_seen_at, incrementa counter
--    Logica dedup: upsert nostro invia sempre occurrence_count=1 come marker.
--    Se NEW.occurrence_count=1 e OLD>=1 → merge (incrementa, riapre se chiuso).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_surface_findings_dedup()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.first_seen_at IS NOT NULL THEN
    NEW.first_seen_at := OLD.first_seen_at;
  END IF;
  NEW.last_seen_at := now();

  IF NEW.occurrence_count = 1 AND OLD.occurrence_count >= 1 THEN
    NEW.occurrence_count := OLD.occurrence_count + 1;
    IF OLD.status IN ('resolved', 'suppressed') THEN
      NEW.status := 'open';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_surface_findings_dedup ON public.surface_findings;
CREATE TRIGGER trg_surface_findings_dedup
  BEFORE UPDATE ON public.surface_findings
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_surface_findings_dedup();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8A. Backfill retroattivo: open_port_exposed findings → surface_open_ports
--     Per ogni finding già in DB con porta, inserisce la riga in surface_open_ports
--     solo se ancora assente (idempotente via ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.surface_open_ports (
  scan_job_id,
  organization_id,
  tenant_id,
  customer_id,
  host,
  ip,
  port,
  protocol,
  state,
  service_name,
  exposure_level,
  is_web,
  is_tls,
  first_seen_at,
  last_seen_at,
  raw
)
SELECT DISTINCT ON (
    sf.scan_job_id,
    coalesce(sf.affected_asset, sf.ip::text),
    sf.port,
    coalesce(sf.protocol, 'tcp')
  )
  sf.scan_job_id,
  sf.organization_id,
  sf.tenant_id,
  coalesce(sf.customer_id, sf.organization_id)                         AS customer_id,
  coalesce(sf.affected_asset, sf.ip::text)                             AS host,
  sf.ip::text,
  sf.port,
  coalesce(sf.protocol, 'tcp'),
  'open',
  NULL                                                                  AS service_name,
  CASE
    WHEN sf.port IN (3389,5900,6379,9200,9300,27017,11211,2375,10250)  THEN 'critical'
    WHEN sf.port IN (21,23,445,1433,1521,3306,5432,2049,111,15672)     THEN 'high'
    WHEN sf.port IN (22,25,8080,8443,9443,8888,9000,9090,3000)         THEN 'medium'
    WHEN sf.port IN (80,443,587,993,995,53,110,143,465)                THEN 'info'
    ELSE 'low'
  END                                                                   AS exposure_level,
  sf.port IN (80,443,8080,8443,8888,9000,3000,4000,5000,7080,7443,9090,10000) AS is_web,
  sf.port IN (443,8443,993,995,465,636,2376,5986)                      AS is_tls,
  sf.created_at                                                         AS first_seen_at,
  sf.created_at                                                         AS last_seen_at,
  jsonb_build_object(
    'source',     coalesce(sf.provider, 'backfill'),
    'backfilled', true
  )                                                                     AS raw
FROM public.surface_findings sf
WHERE sf.finding_type IN ('open_port_exposed')
  AND sf.port IS NOT NULL
  AND sf.port > 0
  AND coalesce(sf.affected_asset, sf.ip::text) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.surface_open_ports sop
    WHERE sop.scan_job_id = sf.scan_job_id
      AND sop.host        = coalesce(sf.affected_asset, sf.ip::text)
      AND sop.port        = sf.port
      AND sop.protocol    = coalesce(sf.protocol, 'tcp')
  )
ON CONFLICT (scan_job_id, host, port, protocol) DO NOTHING;
