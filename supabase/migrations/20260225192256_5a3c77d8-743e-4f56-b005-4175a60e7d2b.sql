ALTER TABLE public.asset_inventory
  ADD COLUMN IF NOT EXISTS hilog_syslog_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hilog_iis_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hilog_apache_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hilog_sql_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hilog_custom_path_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hilog_endpoint_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hilog_server_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hilog_dlp_linux_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hilog_dlp_windows_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hilog_sharepoint_dlp_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hilog_sharepoint_dlp_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hilog_entra_id_enabled boolean DEFAULT false;