-- Reconcile legacy DarkRisk DNSBL findings with SurfaceScan false-positive suppression.
-- If the originating SurfaceScan finding has already been marked false_positive/suppressed/resolved,
-- mark the mirrored DarkRisk finding as false_positive as well.

WITH linked AS (
  SELECT
    df.id AS darkrisk_finding_id
  FROM public.darkrisk_findings df
  JOIN public.surface_findings sf
    ON (
      (df.metadata ->> 'source_finding_id') ~* '^[0-9a-f-]{36}$'
      AND sf.id = (df.metadata ->> 'source_finding_id')::uuid
    )
  WHERE COALESCE(df.finding_type, '') = 'dnsbl_listed'
    AND COALESCE(df.status, 'new') NOT IN ('false_positive', 'suppressed', 'resolved')
    AND COALESCE(sf.status, 'new') IN ('false_positive', 'suppressed', 'resolved')
)
UPDATE public.darkrisk_findings df
SET
  status = 'false_positive',
  metadata = COALESCE(df.metadata, '{}'::jsonb) || jsonb_build_object(
    'suppressed_by', 'darkrisk_dnsbl_reconciliation',
    'suppressed_reason', 'linked_surface_finding_marked_false_positive',
    'suppressed_at', now()
  )
FROM linked
WHERE df.id = linked.darkrisk_finding_id;
