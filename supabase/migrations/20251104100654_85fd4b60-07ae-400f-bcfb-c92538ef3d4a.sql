-- Add new document categories: NIS2 and "ISO & Audit"
-- Note: Cannot migrate existing data in the same transaction
DO $$ 
BEGIN
  -- Add NIS2 if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'NIS2' AND enumtypid = 'document_category'::regtype) THEN
    ALTER TYPE document_category ADD VALUE 'NIS2';
  END IF;
  
  -- Add ISO & Audit if it doesn't exist  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ISO & Audit' AND enumtypid = 'document_category'::regtype) THEN
    ALTER TYPE document_category ADD VALUE 'ISO & Audit';
  END IF;
END $$;