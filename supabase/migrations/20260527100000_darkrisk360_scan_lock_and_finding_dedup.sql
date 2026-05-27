-- DarkRisk360: scan concurrency lock + finding dedup index
-- Fixes BUG-04 (race condition on concurrent scans) and BUG-06 (duplicate findings)

-- ── Scan lock table ───────────────────────────────────────────────────────────
-- One row per org while a scan is running. INSERT fails if scan already active.
-- Stale locks (older than 30 min) are cleaned up at scan start.
CREATE TABLE IF NOT EXISTS darkrisk_scan_locks (
  organization_id uuid NOT NULL,
  locked_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT darkrisk_scan_locks_pkey PRIMARY KEY (organization_id)
);

ALTER TABLE darkrisk_scan_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "darkrisk_scan_locks_service_only"
  ON darkrisk_scan_locks
  USING (false);

-- ── source_record_key dedup index on darkrisk_findings ───────────────────────
-- Enables upsert on (organization_id, source_record_key) to prevent duplicate
-- findings across repeated scans for the same IntelX/Firecrawl record.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'darkrisk_findings' AND column_name = 'source_record_key'
  ) THEN
    ALTER TABLE darkrisk_findings ADD COLUMN source_record_key text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS darkrisk_findings_org_source_record_key_idx
  ON darkrisk_findings (organization_id, source_record_key)
  WHERE source_record_key IS NOT NULL;

-- ── source_record_key dedup index on darkrisk_source_records ─────────────────
CREATE UNIQUE INDEX IF NOT EXISTS darkrisk_source_records_org_source_key_idx
  ON darkrisk_source_records (organization_id, source, source_record_key)
  WHERE source_record_key IS NOT NULL;
