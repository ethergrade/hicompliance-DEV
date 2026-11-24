CREATE TABLE public.sales_targets (
  year integer PRIMARY KEY,
  target_value numeric NOT NULL DEFAULT 0,
  target_count integer NOT NULL DEFAULT 0,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_targets TO authenticated;
GRANT ALL ON public.sales_targets TO service_role;
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sales and super admin manage targets" ON public.sales_targets FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales'));
CREATE TRIGGER update_sales_targets_updated_at BEFORE UPDATE ON public.sales_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_targets; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.remediation_commercial; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.remediation_tasks; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;