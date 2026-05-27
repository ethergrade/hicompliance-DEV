-- Remove invalid parser-artifact password evidence from historical DarkRisk DTI rows.

DELETE FROM public.darkrisk_dti_sensitive_hits
WHERE lower(coalesce(tag, '')) = 'passwords'
  AND (
    lower(trim(coalesce(clear_value, masked_value, ''))) IN (
      'query','selector','metadata','record','source','field',
      'password','passwd','pwd','secret','token',
      'unknown','null','none','n/a','na'
    )
    OR strpos(lower(trim(coalesce(clear_value, masked_value, ''))), '@') > 0
    OR trim(coalesce(clear_value, masked_value, '')) ~ '[=:]'
    OR trim(coalesce(clear_value, masked_value, '')) ~* '^https?://'
    OR trim(coalesce(clear_value, masked_value, '')) ~ '^[*_#\-.]+$'
    OR length(trim(coalesce(clear_value, masked_value, ''))) < 4
    OR length(trim(coalesce(clear_value, masked_value, ''))) > 120
  );
