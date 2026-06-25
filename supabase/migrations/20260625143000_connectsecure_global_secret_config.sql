-- Allow per-organization ConnectSecure rows to act as enable/disable overrides
-- when credentials are provided through global Supabase secrets.
ALTER TABLE IF EXISTS public.connectsecure_config
  ALTER COLUMN client_auth_token DROP NOT NULL,
  ALTER COLUMN company_id DROP NOT NULL;
