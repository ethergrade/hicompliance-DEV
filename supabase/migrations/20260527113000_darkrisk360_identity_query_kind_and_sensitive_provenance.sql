-- DarkRisk360 coherence hardening:
-- 1) Add sensitive provenance fields (additive, backward-compatible)
-- 2) Backfill legacy email selectors misclassified as generic selector

alter table if exists public.darkrisk_dti_sensitive_hits
  add column if not exists match_policy text default 'standard',
  add column if not exists extraction_confidence text default 'medium',
  add column if not exists evidence_scope text default 'domain';

update public.darkrisk_dti_sensitive_hits
set query_kind = 'email_selector'
where coalesce(query_kind, '') = 'selector'
  and coalesce(query_term, '') ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

update public.darkrisk_dti_source_runs
set query_kind = 'email_selector'
where coalesce(query_kind, '') = 'selector'
  and coalesce(query_term, '') ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

update public.darkrisk_source_records
set query_kind = 'email_selector'
where coalesce(query_kind, '') = 'selector'
  and coalesce(query_term, '') ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

update public.darkrisk_findings
set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{query_kind}', '"email_selector"', true)
where coalesce(metadata->>'query_kind', '') = 'selector'
  and coalesce(metadata->>'query_term', '') ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
