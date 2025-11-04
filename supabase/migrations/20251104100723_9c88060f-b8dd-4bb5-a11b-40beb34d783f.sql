-- Migrate existing "Audit" documents to "ISO & Audit"
-- This must be done in a separate migration after the enum values are committed
UPDATE incident_documents 
SET category = 'ISO & Audit'::document_category 
WHERE category = 'Audit'::document_category;