-- Clarify legacy storage-bucket findings that were created without a concrete
-- bucket name, URL, endpoint, or host. These are ASM signals to validate, not
-- confirmed public buckets.

UPDATE public.surface_findings
SET
  title = 'Possibile esposizione storage da verificare',
  description = concat(
    'Il motore ASM esterno ha segnalato un indicatore storage per ',
    coalesce(nullif(affected_asset, ''), nullif(affected_url, ''), 'asset monitorato'),
    ', ma non ha fornito nome, URL o endpoint del bucket. ',
    'Il dato va validato manualmente prima di considerarlo un bucket pubblico confermato.'
  ),
  severity = CASE
    WHEN lower(coalesce(severity, '')) IN ('critical', 'high') THEN 'medium'
    ELSE severity
  END,
  remediation = 'Verificare manualmente nel portale ASM/cloud se esistono bucket o endpoint storage collegati al dominio. Se confermato, disabilitare accesso pubblico anonimo e restringere policy/ACL.',
  evidence = coalesce(evidence, '{}'::jsonb)
    || jsonb_build_object(
      'storage_signal_quality', 'unverified',
      'needs_manual_validation', true,
      'normalization_reason', 'missing_bucket_identifier'
    ),
  attribution_confidence = 'low'
WHERE finding_type = 'exposed_storage_bucket'
  AND status = 'open'
  AND coalesce(nullif(trim(evidence #>> '{bucket_name}'), ''), '') = ''
  AND coalesce(nullif(trim(evidence #>> '{bucket_url}'), ''), '') = ''
  AND (
    lower(coalesce(title, '')) LIKE '%sconosciuto%'
    OR lower(coalesce(title, '')) LIKE '%unknown%'
    OR lower(coalesce(description, '')) LIKE 'bucket  ()%'
    OR evidence->'bucket' = '[]'::jsonb
    OR evidence->'bucket' IS NULL
  );
