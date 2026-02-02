-- Tabella rubrica contatti centralizzata
CREATE TABLE contact_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  job_title text,
  phone text,
  email text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indici per ricerca veloce
CREATE INDEX idx_contact_directory_org ON contact_directory(organization_id);
CREATE INDEX idx_contact_directory_name ON contact_directory(organization_id, last_name, first_name);

-- RLS
ALTER TABLE contact_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization's directory contacts" ON contact_directory
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can insert directory contacts for their organization" ON contact_directory
  FOR INSERT WITH CHECK (organization_id IN (
    SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can update their organization's directory contacts" ON contact_directory
  FOR UPDATE USING (organization_id IN (
    SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their organization's directory contacts" ON contact_directory
  FOR DELETE USING (organization_id IN (
    SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
  ));

-- Trigger per updated_at
CREATE TRIGGER update_contact_directory_updated_at
  BEFORE UPDATE ON contact_directory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Aggiungere riferimento opzionale alla rubrica in emergency_contacts
ALTER TABLE emergency_contacts 
  ADD COLUMN directory_contact_id uuid REFERENCES contact_directory(id) ON DELETE SET NULL;