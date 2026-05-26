-- Remove historical DTI sensitive-hit false positives generated from metadata-only records.
-- The scanner now prevents these values from being persisted on new runs.
delete from public.darkrisk_dti_sensitive_hits
where tag = 'credit_cards'
  and regexp_replace(coalesce(clear_value, masked_value, ''), '[^0-9]', '', 'g') ~ '^0{13,19}$';

delete from public.darkrisk_dti_sensitive_hits
where tag = 'phone_numbers'
  and (
    coalesce(clear_value, masked_value, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(clear_value, masked_value, '') ~ '^[0-9]{1,3}\.[0-9]{5,}$'
  );
