-- Aggiunge results_by_asset a darkrisk360_weekly_snapshots
-- es. {"cereriaterenzi.com": {"total": 36, "by_source": {...}, "by_filetype": {...}}}

ALTER TABLE public.darkrisk360_weekly_snapshots
  ADD COLUMN IF NOT EXISTS results_by_asset jsonb NOT NULL DEFAULT '{}';
