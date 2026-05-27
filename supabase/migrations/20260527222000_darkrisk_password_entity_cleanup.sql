-- Remove legacy/non-actionable password evidence artifacts from DarkRisk DTI.
-- Keeps strict pair evidence only for email selectors and removes HTML entity tokens.

DELETE FROM public.darkrisk_dti_sensitive_hits
WHERE lower(coalesce(tag, '')) = 'passwords'
  AND (
    trim(coalesce(clear_value, masked_value, '')) ~* '^&#[0-9]{1,6};?$'
    OR trim(coalesce(clear_value, masked_value, '')) ~* '^&[a-z]{2,8};$'
    OR lower(trim(coalesce(clear_value, masked_value, ''))) IN ('&#39', '&apos;', '&quot;')
    OR (
      lower(coalesce(query_kind, '')) = 'email_selector'
      AND lower(coalesce(match_policy, '')) <> 'strict_pair'
    )
  );
