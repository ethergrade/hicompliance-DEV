-- Enable realtime for remediation_tasks table
ALTER TABLE public.remediation_tasks REPLICA IDENTITY FULL;

-- Add remediation_tasks to realtime publication if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'remediation_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.remediation_tasks;
  END IF;
END $$;