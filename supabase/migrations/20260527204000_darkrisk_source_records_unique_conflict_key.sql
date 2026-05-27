-- Ensure ON CONFLICT(organization_id, source, source_record_key) is valid and deterministic
-- for DarkRisk source record upserts across reruns.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id, source, source_record_key
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.darkrisk_source_records
  WHERE source_record_key IS NOT NULL
)
DELETE FROM public.darkrisk_source_records d
USING ranked r
WHERE d.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS darkrisk_source_records_org_source_record_key_uidx
  ON public.darkrisk_source_records (organization_id, source, source_record_key);
