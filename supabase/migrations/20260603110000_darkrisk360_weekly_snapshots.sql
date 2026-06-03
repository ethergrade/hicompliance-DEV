-- darkrisk360_weekly_snapshots: snapshot settimanale per trending e dashboard charts
-- Popolata da darkrisk360-snapshot edge function dopo ogni scan run

CREATE TABLE IF NOT EXISTS public.darkrisk360_weekly_snapshots (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scan_run_id               uuid        REFERENCES public.darkrisk_scan_runs(id) ON DELETE SET NULL,
  week_key                  text        NOT NULL,  -- formato ISO: '2026-W23'
  week_start_date           date        NOT NULL,  -- lunedì della settimana
  tier                      text        NOT NULL DEFAULT 'standard',
  total_records             integer     NOT NULL DEFAULT 0,
  new_records_this_week     integer     NOT NULL DEFAULT 0,
  risk_index                integer     NOT NULL DEFAULT 0 CHECK (risk_index BETWEEN 0 AND 100),

  -- Dati per pie chart "Results per Data Source"
  -- es. {"leaks_restricted":12,"leaks_logs":4,"leaks_public":2,"dns":8,".com":3}
  results_by_source         jsonb       NOT NULL DEFAULT '{}',

  -- Dati per pie chart "Results per File Type"
  -- es. {"html":27,"text":6,"csv":2,"domain":1}
  results_by_filetype       jsonb       NOT NULL DEFAULT '{}',

  -- Dati per calendar heatmap "Results per Day"
  -- es. {"2026-05-26":4,"2026-05-27":9} — usa source_date (data indexing IntelX), non created_at
  results_by_day            jsonb       NOT NULL DEFAULT '{}',

  -- Delta vs settimana precedente
  -- es. {"total_records":3,"risk_index":-2,"new_buckets":["leaks_logs"]}
  delta_vs_prev             jsonb       NOT NULL DEFAULT '{}',

  -- Distribuzione severity dei finding attivi
  -- es. {"critical":1,"high":4,"medium":8,"low":5,"info":3}
  severity_distribution     jsonb       NOT NULL DEFAULT '{}',

  computed_at               timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, week_key)
);

CREATE INDEX IF NOT EXISTS idx_darkrisk360_weekly_snapshots_org_week
  ON public.darkrisk360_weekly_snapshots (organization_id, week_start_date DESC);

-- RLS
ALTER TABLE public.darkrisk360_weekly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read weekly snapshots"
  ON public.darkrisk360_weekly_snapshots
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service role bypass for weekly snapshots"
  ON public.darkrisk360_weekly_snapshots
  FOR ALL
  USING (auth.role() = 'service_role');
