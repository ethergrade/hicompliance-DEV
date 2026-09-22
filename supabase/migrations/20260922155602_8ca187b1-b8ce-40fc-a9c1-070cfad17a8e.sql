CREATE TABLE IF NOT EXISTS public.platform_runtime_settings (
  id boolean PRIMARY KEY DEFAULT true,
  stage_mode boolean NOT NULL DEFAULT false,
  paused_jobs jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_runtime_settings_singleton CHECK (id)
);

GRANT SELECT ON public.platform_runtime_settings TO authenticated;
GRANT ALL ON public.platform_runtime_settings TO service_role;

ALTER TABLE public.platform_runtime_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read platform runtime settings" ON public.platform_runtime_settings;
CREATE POLICY "authenticated can read platform runtime settings"
ON public.platform_runtime_settings FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS update_platform_runtime_settings_updated_at ON public.platform_runtime_settings;
CREATE TRIGGER update_platform_runtime_settings_updated_at
BEFORE UPDATE ON public.platform_runtime_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_runtime_settings (id, stage_mode)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;