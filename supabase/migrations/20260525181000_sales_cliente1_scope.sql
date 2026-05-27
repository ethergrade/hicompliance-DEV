-- Lock sales@sales.com to Cliente1 and ensure Cliente1 has demo modules enabled.
DO $$
DECLARE
  v_cliente1_id uuid;
BEGIN
  SELECT id INTO v_cliente1_id
  FROM public.organizations
  WHERE code = 'cliente1'
  LIMIT 1;

  IF v_cliente1_id IS NULL THEN
    RAISE NOTICE 'Organization code=cliente1 not found, skipping sales lock migration.';
    RETURN;
  END IF;

  UPDATE public.users
  SET organization_id = v_cliente1_id
  WHERE lower(email) = 'sales@sales.com';

  UPDATE public.organizations
  SET
    hicompliance_enabled = true,
    surface_scan360_enabled = true,
    dark_risk360_enabled = true
  WHERE id = v_cliente1_id;
END
$$;
