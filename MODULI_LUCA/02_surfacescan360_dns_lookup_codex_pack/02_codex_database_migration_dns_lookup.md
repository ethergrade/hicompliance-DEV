# Codex Prompt - Supabase Migration DNS Lookup Results

## Obiettivo
Aggiungere persistenza per i risultati DNS Lookup dentro SurfaceScan360.

Prima di creare nuove tabelle, verifica se esistono già tabelle generiche per:
- surface scan results;
- scan findings;
- scan modules;
- report evidence.

Se esistono, preferisci estendere il modello attuale invece di duplicare.

## Opzione consigliata: tabelle dedicate

Crea migration:

```text
supabase/migrations/YYYYMMDDHHMMSS_add_surface_dns_lookup_results.sql
```

SQL:

```sql
create table if not exists public.surface_dns_lookup_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  scan_id uuid,
  asset_id uuid,
  domain text not null,
  normalized_domain text not null,
  resolver text not null,
  score integer not null check (score >= 0 and score <= 100),
  grade text not null check (grade in ('A','B','C','D','F')),
  records jsonb not null default '{}'::jsonb,
  additional_records jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  raw_result jsonb not null default '{}'::jsonb,
  duration_ms integer,
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.surface_dns_lookup_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  dns_lookup_result_id uuid not null references public.surface_dns_lookup_results(id) on delete cascade,
  scan_id uuid,
  asset_id uuid,
  domain text not null,
  finding_key text not null,
  category text not null,
  severity text not null check (severity in ('info','low','medium','high','critical')),
  status text not null check (status in ('pass','info','warn','fail')),
  title text not null,
  description text not null,
  evidence jsonb not null default '{}'::jsonb,
  recommendation text not null,
  report_summary text,
  created_at timestamptz not null default now()
);

create index if not exists idx_surface_dns_lookup_results_tenant_scan
  on public.surface_dns_lookup_results (tenant_id, scan_id, scanned_at desc);

create index if not exists idx_surface_dns_lookup_results_asset
  on public.surface_dns_lookup_results (tenant_id, asset_id, scanned_at desc);

create index if not exists idx_surface_dns_lookup_findings_result
  on public.surface_dns_lookup_findings (dns_lookup_result_id);

create index if not exists idx_surface_dns_lookup_findings_severity
  on public.surface_dns_lookup_findings (tenant_id, scan_id, severity, status);

alter table public.surface_dns_lookup_results enable row level security;
alter table public.surface_dns_lookup_findings enable row level security;
```

## RLS
Adatta le policy allo schema auth già presente nel progetto. Se esiste una funzione tipo `is_tenant_member(tenant_id)` o `current_tenant_id()`, usa quella.

Esempio generico da adattare:

```sql
create policy "tenant members can read dns lookup results"
  on public.surface_dns_lookup_results
  for select
  using (
    tenant_id in (
      select tenant_id
      from public.tenant_members
      where user_id = auth.uid()
    )
  );

create policy "tenant members can read dns lookup findings"
  on public.surface_dns_lookup_findings
  for select
  using (
    tenant_id in (
      select tenant_id
      from public.tenant_members
      where user_id = auth.uid()
    )
  );
```

Per insert/update/delete, preferire service role da Edge Function oppure policy dedicate per ruoli admin.

## Inserimento risultati da Edge Function

```ts
const { data: inserted, error } = await supabase
  .from("surface_dns_lookup_results")
  .insert({
    tenant_id,
    scan_id,
    asset_id,
    domain,
    normalized_domain: result.normalizedDomain,
    resolver: result.resolver,
    score: result.score,
    grade: result.grade,
    records: result.records,
    additional_records: result.additionalRecords,
    summary: result.summary,
    raw_result: result,
    duration_ms: result.durationMs,
    scanned_at: result.completedAt,
  })
  .select("id")
  .single();
```

Poi inserire findings:

```ts
await supabase.from("surface_dns_lookup_findings").insert(
  result.findings.map((f) => ({
    tenant_id,
    scan_id,
    asset_id,
    domain: result.normalizedDomain,
    dns_lookup_result_id: inserted.id,
    finding_key: f.id,
    category: f.category,
    severity: f.severity,
    status: f.status,
    title: f.title,
    description: f.description,
    evidence: f.evidence ?? {},
    recommendation: f.recommendation,
    report_summary: f.reportSummary,
  }))
);
```

## Acceptance criteria DB
- Query per scan_id veloce.
- Query per asset_id veloce.
- Finding filtrabili per severity/status/category.
- Raw evidence preservata in jsonb.
- RLS non espone risultati tra tenant diversi.
