DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('public.bia_compute(uuid)'::regprocedure) INTO src;
  src := replace(src, 'WHEN round(bis) >= (cfg.class_thresholds->>''critical'')::numeric', 'WHEN bis > (cfg.class_thresholds->>''critical'')::numeric - 1');
  src := replace(src, 'WHEN round(bis) >= (cfg.class_thresholds->>''high'')::numeric', 'WHEN bis > (cfg.class_thresholds->>''high'')::numeric - 1');
  src := replace(src, 'WHEN round(bis) >= (cfg.class_thresholds->>''medium'')::numeric', 'WHEN bis > (cfg.class_thresholds->>''medium'')::numeric - 1');
  EXECUTE src;
END $$;