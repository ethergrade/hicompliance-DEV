-- Add new columns for IRP governance contacts
ALTER TABLE emergency_contacts 
ADD COLUMN IF NOT EXISTS job_title TEXT,
ADD COLUMN IF NOT EXISTS irp_role TEXT,
ADD COLUMN IF NOT EXISTS responsibilities TEXT;