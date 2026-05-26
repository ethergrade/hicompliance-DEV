-- Prevent historical Spamhaus public-resolver block responses from being treated as real listings.
-- Spamhaus returns 127.255.255.x when the lookup is blocked/unsupported; that code is not a DNSBL hit.

update public.surface_findings
set
  status = 'false_positive',
  evidence = coalesce(evidence, '{}'::jsonb)
    || jsonb_build_object(
      'suppressed_by', 'surfacescan360_dnsbl_guard',
      'suppressed_reason', 'spamhaus_public_resolver_block_response',
      'suppressed_at', now()
    )
where module = 'dns_blocklists'
  and finding_type = 'dnsbl_listed'
  and coalesce(status, 'open') not in ('false_positive', 'resolved', 'suppressed', 'accepted_risk')
  and coalesce(evidence->>'provider', '') = 'zen.spamhaus.org'
  and exists (
    select 1
    from jsonb_array_elements_text(coalesce(evidence->'records', '[]'::jsonb)) as record(value)
    where record.value ~ '^127[.]255[.]255[.][0-9]+$'
  );

create or replace function public.surfacescan360_normalize_dnsbl_summary_false_positives(payload jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  item jsonb;
  normalized_checked jsonb := '[]'::jsonb;
  listed_count integer := 0;
  blocked_count integer := 0;
  error_count integer := 0;
  is_blocked boolean;
  is_listed boolean;
begin
  if payload is null or jsonb_typeof(payload->'checked') <> 'array' then
    return payload;
  end if;

  for item in select value from jsonb_array_elements(payload->'checked') loop
    is_blocked := coalesce(item->>'provider', '') = 'zen.spamhaus.org'
      and exists (
        select 1
        from jsonb_array_elements_text(coalesce(item->'records', '[]'::jsonb)) as record(value)
        where record.value ~ '^127[.]255[.]255[.][0-9]+$'
      );

    if is_blocked then
      item := item || jsonb_build_object(
        'listed', false,
        'status', 'lookup_blocked',
        'reason', 'dnsbl_lookup_blocked_or_rate_limited'
      );
    elsif not (item ? 'status') then
      item := item || jsonb_build_object(
        'status', case when coalesce((item->>'listed')::boolean, false) then 'listed' else 'not_listed' end
      );
    end if;

    normalized_checked := normalized_checked || jsonb_build_array(item);
    is_listed := coalesce((item->>'listed')::boolean, false);
    if is_listed then
      listed_count := listed_count + 1;
    end if;
    if item->>'status' = 'lookup_blocked' then
      blocked_count := blocked_count + 1;
    end if;
    if item->>'status' = 'lookup_error' then
      error_count := error_count + 1;
    end if;
  end loop;

  return payload
    || jsonb_build_object(
      'checked', normalized_checked,
      'listed_count', listed_count,
      'lookup_blocked_count', blocked_count,
      'lookup_error_count', error_count,
      'not_listed', listed_count = 0
    );
end;
$$;

update public.surface_observations
set value = public.surfacescan360_normalize_dnsbl_summary_false_positives(value)
where module = 'dns_blocklists'
  and observation_type = 'dnsbl_summary'
  and value::text like '%127.255.255.%';

drop function public.surfacescan360_normalize_dnsbl_summary_false_positives(jsonb);
