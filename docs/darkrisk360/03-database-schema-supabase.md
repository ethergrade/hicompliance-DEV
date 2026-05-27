<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 03 - Database Schema Supabase

## Obiettivo

Creare lo schema dati Supabase per DarkRisk360.

Il modello deve supportare:

- multi-tenancy;
- Standard ed Estesa;
- asset e selector;
- scan run;
- source record;
- evidence;
- finding;
- recommendation;
- alert;
- report snapshot;
- audit;
- masking e raw evidence controllata.

## Convenzioni

Prima di creare nuove tabelle, Codex deve verificare se nel repository esistono già:

- `customers`
- `profiles`
- `organizations`
- `tenants`
- `assets`
- `scan_runs`
- `reports`

Se esistono, usare FK verso tabelle esistenti.

Gli esempi seguenti assumono una tabella `customers(id uuid primary key)`.

## Estensioni

```sql
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
```

## Enum

```sql
do $$ begin
  create type darkrisk_tier as enum ('standard', 'extended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_source as enum ('surfacescan360', 'intelx', 'openai', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_scan_status as enum ('queued', 'running', 'completed', 'completed_with_warnings', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_asset_type as enum ('domain', 'subdomain', 'url', 'ip', 'cidr', 'email', 'mx', 'ns', 'host', 'service', 'certificate', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_selector_type as enum ('email', 'domain', 'wildcard_domain', 'url', 'ipv4', 'ipv6', 'cidrv4', 'cidrv6', 'phone', 'bitcoin', 'mac', 'ipfs', 'uuid', 'storageid', 'systemid', 'simhash', 'credit_card', 'iban');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_severity as enum ('info', 'low', 'medium', 'high', 'critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_confidence as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_finding_status as enum ('new', 'triaged', 'validated', 'false_positive', 'accepted_risk', 'remediation_in_progress', 'resolved', 'suppressed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_visibility as enum ('customer', 'analyst', 'admin');
exception when duplicate_object then null; end $$;
```

## Entitlements

```sql
create table if not exists darkrisk_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  tier darkrisk_tier not null default 'standard',
  enabled boolean not null default true,
  scan_frequency text not null default 'manual',
  max_intelx_results_per_selector integer not null default 1000,
  enable_phonebook boolean not null default false,
  enable_raw_evidence boolean not null default false,
  enable_ai_recommendations boolean not null default true,
  retention_days integer not null default 365,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id)
);
```

## Asset registry

```sql
create table if not exists darkrisk_assets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  asset_type darkrisk_asset_type not null,
  value text not null,
  normalized_value text not null,
  source darkrisk_source not null default 'manual',
  scope_status text not null default 'approved',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id, asset_type, normalized_value)
);

create index if not exists idx_darkrisk_assets_customer on darkrisk_assets(customer_id);
create index if not exists idx_darkrisk_assets_value on darkrisk_assets(normalized_value);
```

## Selector registry

```sql
create table if not exists darkrisk_selectors (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  asset_id uuid references darkrisk_assets(id) on delete set null,
  selector_type darkrisk_selector_type not null,
  value text not null,
  normalized_value text not null,
  source darkrisk_source not null default 'manual',
  status text not null default 'approved',
  sensitivity text not null default 'normal',
  discovered_from uuid references darkrisk_selectors(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id, selector_type, normalized_value)
);

create index if not exists idx_darkrisk_selectors_customer on darkrisk_selectors(customer_id);
create index if not exists idx_darkrisk_selectors_status on darkrisk_selectors(status);
```

## Scan runs

```sql
create table if not exists darkrisk_scan_runs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  tier darkrisk_tier not null,
  status darkrisk_scan_status not null default 'queued',
  trigger_type text not null default 'manual',
  requested_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  sources jsonb not null default '[]',
  stats jsonb not null default '{}',
  warnings jsonb not null default '[]',
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_scan_runs_customer_created on darkrisk_scan_runs(customer_id, created_at desc);
create index if not exists idx_darkrisk_scan_runs_status on darkrisk_scan_runs(status);
```

## Source records

```sql
create table if not exists darkrisk_source_records (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  scan_run_id uuid not null references darkrisk_scan_runs(id) on delete cascade,
  source darkrisk_source not null,
  asset_id uuid references darkrisk_assets(id) on delete set null,
  selector_id uuid references darkrisk_selectors(id) on delete set null,
  source_record_key text,
  source_system_id text,
  source_storage_id text,
  source_bucket text,
  source_media text,
  source_type text,
  source_score numeric,
  source_date timestamptz,
  source_added_at timestamptz,
  source_simhash text,
  title text,
  description text,
  raw_metadata jsonb not null default '{}',
  safe_preview text,
  preview_hash text,
  created_at timestamptz not null default now(),
  unique(source, source_record_key, scan_run_id)
);

create index if not exists idx_darkrisk_source_records_customer on darkrisk_source_records(customer_id);
create index if not exists idx_darkrisk_source_records_scan on darkrisk_source_records(scan_run_id);
create index if not exists idx_darkrisk_source_records_system_id on darkrisk_source_records(source_system_id);
create index if not exists idx_darkrisk_source_records_simhash on darkrisk_source_records(source_simhash);
```

## Evidence

```sql
create table if not exists darkrisk_evidence (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  scan_run_id uuid not null references darkrisk_scan_runs(id) on delete cascade,
  source_record_id uuid references darkrisk_source_records(id) on delete set null,
  source darkrisk_source not null,
  evidence_class text not null,
  asset_id uuid references darkrisk_assets(id) on delete set null,
  selector_id uuid references darkrisk_selectors(id) on delete set null,
  title text not null,
  summary text,
  masked_value text,
  severity_hint darkrisk_severity not null default 'info',
  confidence darkrisk_confidence not null default 'medium',
  observed_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visibility darkrisk_visibility not null default 'customer',
  contains_sensitive_data boolean not null default false,
  raw_evidence_ref text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_evidence_customer on darkrisk_evidence(customer_id);
create index if not exists idx_darkrisk_evidence_class on darkrisk_evidence(evidence_class);
create index if not exists idx_darkrisk_evidence_observed on darkrisk_evidence(observed_at desc);
```

## Findings

```sql
create table if not exists darkrisk_findings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  scan_run_id uuid references darkrisk_scan_runs(id) on delete set null,
  finding_type text not null,
  title text not null,
  description text,
  affected_asset_id uuid references darkrisk_assets(id) on delete set null,
  affected_selector_id uuid references darkrisk_selectors(id) on delete set null,
  severity darkrisk_severity not null,
  confidence darkrisk_confidence not null default 'medium',
  status darkrisk_finding_status not null default 'new',
  risk_score integer not null default 0 check (risk_score >= 0 and risk_score <= 100),
  risk_dimensions jsonb not null default '{}',
  evidence_ids uuid[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_findings_customer_status on darkrisk_findings(customer_id, status);
create index if not exists idx_darkrisk_findings_customer_severity on darkrisk_findings(customer_id, severity);
create index if not exists idx_darkrisk_findings_type on darkrisk_findings(finding_type);
```

## Recommendations

```sql
create table if not exists darkrisk_recommendations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  finding_id uuid references darkrisk_findings(id) on delete cascade,
  source darkrisk_source not null default 'openai',
  title text not null,
  priority text not null,
  why_it_matters text,
  actions jsonb not null default '[]',
  expected_outcome text,
  confidence darkrisk_confidence not null default 'medium',
  model text,
  prompt_version text,
  output_schema_version text,
  grounded_on_evidence_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_recommendations_customer on darkrisk_recommendations(customer_id);
```

## Alerts

```sql
create table if not exists darkrisk_alerts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  finding_id uuid references darkrisk_findings(id) on delete set null,
  alert_type text not null,
  title text not null,
  message text,
  severity darkrisk_severity not null,
  status text not null default 'open',
  occurred_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_alerts_customer_occurred on darkrisk_alerts(customer_id, occurred_at desc);
```

## Report snapshots

```sql
create table if not exists darkrisk_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  scan_run_id uuid references darkrisk_scan_runs(id) on delete set null,
  tier darkrisk_tier not null,
  title text not null,
  classification text not null default 'confidential',
  status text not null default 'draft',
  report_json jsonb not null,
  html_storage_path text,
  pdf_storage_path text,
  generated_by uuid,
  generated_at timestamptz not null default now(),
  model_metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_reports_customer_generated on darkrisk_report_snapshots(customer_id, generated_at desc);
```

## Audit log

```sql
create table if not exists darkrisk_audit_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_audit_customer_created on darkrisk_audit_log(customer_id, created_at desc);
create index if not exists idx_darkrisk_audit_entity on darkrisk_audit_log(entity_type, entity_id);
```

## Raw evidence references

Non salvare raw evidence in tabelle leggibili dalla UI.

```sql
create table if not exists darkrisk_raw_evidence_refs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  evidence_id uuid not null references darkrisk_evidence(id) on delete cascade,
  storage_provider text not null default 'supabase',
  storage_path text not null,
  encryption_context jsonb not null default '{}',
  sha256 text,
  size_bytes bigint,
  retention_until timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(evidence_id)
);

create index if not exists idx_darkrisk_raw_refs_customer on darkrisk_raw_evidence_refs(customer_id);
```

## Source config

```sql
create table if not exists darkrisk_source_config (
  id uuid primary key default gen_random_uuid(),
  source darkrisk_source not null,
  key text not null,
  value jsonb not null,
  enabled boolean not null default true,
  requires_extended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source, key)
);
```

## RLS

Abilitare RLS su tutte le tabelle.

Esempio:

```sql
alter table darkrisk_assets enable row level security;
alter table darkrisk_selectors enable row level security;
alter table darkrisk_scan_runs enable row level security;
alter table darkrisk_source_records enable row level security;
alter table darkrisk_evidence enable row level security;
alter table darkrisk_findings enable row level security;
alter table darkrisk_recommendations enable row level security;
alter table darkrisk_alerts enable row level security;
alter table darkrisk_report_snapshots enable row level security;
alter table darkrisk_audit_log enable row level security;
alter table darkrisk_raw_evidence_refs enable row level security;
```

Codex deve adattare le policy al sistema auth esistente.

Policy concettuali:

- customer user vede solo dati del proprio cliente;
- customer user non vede raw evidence;
- analyst vede clienti assegnati;
- admin vede tutto;
- service role può scrivere da Edge Function.

## Helper masking

Creare funzioni applicative, non necessariamente SQL, per:

- `maskEmail("name.surname@example.com") -> "n***@example.com"`
- `maskPassword("anything") -> "[REDACTED]"`
- `maskToken("abc...") -> "[TOKEN_REDACTED]"`
- `maskCreditCard("4111111111111111") -> "411111******1111"`
- `maskIban("IT...") -> "IT** **** **** ****"`

## Acceptance criteria

- Migrazione idempotente.
- Nessuna tabella espone password raw.
- Evidence e finding sono separati.
- Ogni finding può referenziare più evidence.
- Report snapshot è immutabile.
- Raw evidence ha retention e audit.
- RLS impedisce accessi cross-customer.
