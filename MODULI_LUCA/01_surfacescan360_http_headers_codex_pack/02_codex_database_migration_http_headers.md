# Codex - Migration Supabase per HTTP Headers Scanner

## Obiettivo
Aggiungere persistenza per risultati e finding HTTP Security Headers di SurfaceScan360.

## File da creare

```text
supabase/migrations/YYYYMMDDHHMMSS_add_surface_http_header_scanner.sql
```

## SQL proposto

```sql
create table if not exists public.surface_http_header_results (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null,
  project_id uuid not null,
  asset_id uuid,
  asset_type text not null check (asset_type in ('domain', 'url')),
  input_url text not null,
  normalized_url text not null,
  final_url text,
  status_code int,
  is_https boolean not null default false,
  response_time_ms int not null default 0,
  score int not null check (score >= 0 and score <= 100),
  grade text not null check (grade in ('A', 'B', 'C', 'D', 'F')),
  ok_count int not null default 0,
  weak_count int not null default 0,
  missing_count int not null default 0,
  high_impact_open_count int not null default 0,
  raw_headers jsonb not null default '{}'::jsonb,
  error_message text,
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.surface_http_header_findings (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.surface_http_header_results(id) on delete cascade,
  scan_id uuid not null,
  project_id uuid not null,
  asset_id uuid,
  rule_id text not null,
  header_name text not null,
  category text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  status text not null check (status in ('ok', 'weak', 'missing', 'error')),
  weight int not null default 0,
  earned_points numeric not null default 0,
  actual_value text,
  note text not null,
  description text not null,
  recommendation text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_surface_http_header_results_scan_id
  on public.surface_http_header_results(scan_id);

create index if not exists idx_surface_http_header_results_project_id
  on public.surface_http_header_results(project_id);

create index if not exists idx_surface_http_header_results_asset_id
  on public.surface_http_header_results(asset_id);

create index if not exists idx_surface_http_header_results_grade
  on public.surface_http_header_results(grade);

create index if not exists idx_surface_http_header_findings_result_id
  on public.surface_http_header_findings(result_id);

create index if not exists idx_surface_http_header_findings_scan_status
  on public.surface_http_header_findings(scan_id, status);

create index if not exists idx_surface_http_header_findings_header_name
  on public.surface_http_header_findings(header_name);
```

## RLS
Prima controlla come il repo gestisce tenant e policy esistenti. Se ci sono tabelle `profiles`, `organizations`, `projects` o `tenant_id`, adatta le policy.

Esempio da adattare:

```sql
alter table public.surface_http_header_results enable row level security;
alter table public.surface_http_header_findings enable row level security;

create policy "Users can read own project header results"
on public.surface_http_header_results
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = surface_http_header_results.project_id
      and p.user_id = auth.uid()
  )
);

create policy "Users can read own project header findings"
on public.surface_http_header_findings
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = surface_http_header_findings.project_id
      and p.user_id = auth.uid()
  )
);
```

## View per dashboard
Crea una view se utile alla UI:

```sql
create or replace view public.surface_http_header_scan_summary as
select
  scan_id,
  project_id,
  count(*) as total_assets,
  round(avg(score))::int as average_score,
  count(*) filter (where grade in ('A','B')) as secure_assets,
  count(*) filter (where grade in ('D','F')) as weak_assets,
  sum(high_impact_open_count) as high_impact_open_total,
  max(scanned_at) as last_scanned_at
from public.surface_http_header_results
group by scan_id, project_id;
```

## Integrazione con tabelle esistenti
Se SurfaceScan360 ha già una tabella generica tipo `surface_scan_modules` o `surface_scan_results`, non duplicare il concetto di job. Usa queste nuove tabelle solo per il dettaglio specifico HTTP headers.
