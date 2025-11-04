-- Add budget column to remediation_tasks table
ALTER TABLE public.remediation_tasks 
ADD COLUMN IF NOT EXISTS budget numeric DEFAULT 0;