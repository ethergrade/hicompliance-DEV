-- Rimuovere il vecchio constraint
ALTER TABLE emergency_contacts DROP CONSTRAINT IF EXISTS emergency_contacts_category_check;

-- Aggiungere il nuovo constraint con 'governance' incluso
ALTER TABLE emergency_contacts ADD CONSTRAINT emergency_contacts_category_check 
CHECK (category = ANY (ARRAY['security', 'it', 'authorities', 'governance']));