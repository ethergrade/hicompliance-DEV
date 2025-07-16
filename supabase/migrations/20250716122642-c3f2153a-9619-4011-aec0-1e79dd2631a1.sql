-- Create remediation templates table
CREATE TABLE public.remediation_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  task_name TEXT NOT NULL,
  description TEXT,
  estimated_days INTEGER NOT NULL DEFAULT 7,
  priority TEXT NOT NULL DEFAULT 'medium',
  dependencies TEXT[] DEFAULT '{}',
  complexity TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.remediation_templates ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to view templates
CREATE POLICY "Authenticated users can view remediation templates"
ON public.remediation_templates
FOR SELECT
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_remediation_templates_updated_at
BEFORE UPDATE ON public.remediation_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample remediation templates organized by category
INSERT INTO public.remediation_templates (category, task_name, description, estimated_days, priority, complexity) VALUES
-- Business Continuity
('Business Continuity', 'Implementare Piano di Disaster Recovery', 'Sviluppare e testare un piano completo di disaster recovery', 21, 'high', 'high'),
('Business Continuity', 'Test Backup Mensili', 'Eseguire test di ripristino backup su base mensile', 3, 'high', 'low'),
('Business Continuity', 'Aggiornare Business Continuity Plan', 'Rivedere e aggiornare il piano di continuità operativa', 14, 'medium', 'medium'),
('Business Continuity', 'Configurare Backup Automatici', 'Implementare sistema di backup automatico dei dati critici', 7, 'high', 'medium'),

-- Network Security
('Network Security', 'Patch Management Firewall', 'Aggiornare firmware e regole del firewall', 2, 'high', 'medium'),
('Network Security', 'Configurare IDS/IPS', 'Implementare sistema di rilevamento e prevenzione intrusioni', 14, 'high', 'high'),
('Network Security', 'Audit Configurazioni di Rete', 'Revisione completa delle configurazioni di sicurezza di rete', 7, 'medium', 'medium'),
('Network Security', 'Segmentazione di Rete', 'Implementare segmentazione della rete per limitare movimenti laterali', 21, 'high', 'high'),

-- Identity Management
('Identity Management', 'Implementare Multi-Factor Authentication', 'Attivare MFA per tutti gli account utente', 7, 'high', 'medium'),
('Identity Management', 'Review Account Privilegiati', 'Audit e pulizia degli account con privilegi amministrativi', 5, 'high', 'low'),
('Identity Management', 'Policy Password Aziendali', 'Implementare policy password robuste e sicure', 3, 'medium', 'low'),
('Identity Management', 'Single Sign-On (SSO)', 'Implementare soluzione SSO per centralizzare autenticazione', 14, 'medium', 'high'),

-- Endpoint Security
('Endpoint Security', 'Deploy Antivirus Centralizzato', 'Installare e configurare antivirus su tutti gli endpoint', 5, 'high', 'medium'),
('Endpoint Security', 'Patch Management Endpoints', 'Implementare sistema di gestione patch per workstation', 10, 'high', 'medium'),
('Endpoint Security', 'Device Encryption', 'Attivare crittografia completa del disco su tutti i dispositivi', 7, 'high', 'medium'),
('Endpoint Security', 'Mobile Device Management', 'Implementare MDM per dispositivi mobili aziendali', 14, 'medium', 'high'),

-- Email Security
('Email Security', 'Configurare SPF/DKIM/DMARC', 'Implementare protezioni anti-phishing per email', 3, 'high', 'low'),
('Email Security', 'Email Gateway Security', 'Installare gateway di sicurezza email avanzato', 7, 'high', 'medium'),
('Email Security', 'Training Anti-Phishing', 'Formazione utenti su riconoscimento email di phishing', 5, 'medium', 'low'),
('Email Security', 'Email Encryption', 'Implementare crittografia email per comunicazioni sensibili', 10, 'medium', 'medium'),

-- Cryptography
('Cryptography', 'Aggiornare Certificati SSL/TLS', 'Rinnovare e aggiornare tutti i certificati scaduti', 2, 'high', 'low'),
('Cryptography', 'Implementare Encryption at Rest', 'Crittografare dati sensibili sui database', 14, 'high', 'high'),
('Cryptography', 'Key Management System', 'Implementare sistema centralizzato di gestione chiavi', 21, 'medium', 'high'),
('Cryptography', 'Certificate Authority Interna', 'Configurare CA interna per certificati aziendali', 14, 'low', 'high'),

-- Application Security
('Application Security', 'Vulnerability Assessment Web Apps', 'Eseguire test di vulnerabilità su applicazioni web', 7, 'high', 'medium'),
('Application Security', 'Secure Code Review', 'Revisione sicurezza del codice delle applicazioni critiche', 14, 'medium', 'high'),
('Application Security', 'Web Application Firewall', 'Implementare WAF per proteggere applicazioni web', 10, 'high', 'medium'),
('Application Security', 'API Security Assessment', 'Valutazione sicurezza delle API esposte', 7, 'medium', 'medium'),

-- Data Protection
('Data Protection', 'Classificazione Dati Sensibili', 'Identificare e classificare tutti i dati sensibili', 10, 'high', 'medium'),
('Data Protection', 'Data Loss Prevention (DLP)', 'Implementare sistema DLP per prevenire perdite dati', 14, 'high', 'high'),
('Data Protection', 'GDPR Compliance Audit', 'Audit completo conformità GDPR', 21, 'medium', 'medium'),
('Data Protection', 'Database Security Hardening', 'Rafforzare sicurezza dei database aziendali', 7, 'high', 'medium'),

-- Physical Security
('Physical Security', 'Controllo Accessi Fisici', 'Implementare badge e controllo accessi agli uffici', 7, 'medium', 'medium'),
('Physical Security', 'Videosorveglianza', 'Installare sistema di videosorveglianza', 10, 'low', 'medium'),
('Physical Security', 'Sicurezza Server Room', 'Rafforzare sicurezza fisica del centro dati', 5, 'medium', 'low'),
('Physical Security', 'Policy Clean Desk', 'Implementare politica scrivania pulita', 2, 'low', 'low'),

-- Incident Response
('Incident Response', 'Piano di Incident Response', 'Sviluppare piano formale di gestione incidenti', 14, 'high', 'medium'),
('Incident Response', 'Team di Risposta Incidenti', 'Formare team dedicato alla gestione incidenti', 7, 'medium', 'low'),
('Incident Response', 'Playbook Sicurezza', 'Creare playbook per scenari di incidente comuni', 10, 'medium', 'medium'),
('Incident Response', 'Forensic Tools', 'Acquisire strumenti per analisi forense digitale', 3, 'low', 'medium'),

-- Compliance Management
('Compliance Management', 'Audit ISO 27001', 'Preparazione e audit certificazione ISO 27001', 60, 'medium', 'high'),
('Compliance Management', 'Documentazione Policies', 'Creare documentazione completa policy sicurezza', 21, 'medium', 'medium'),
('Compliance Management', 'Risk Assessment Annuale', 'Eseguire valutazione rischi annuale completa', 14, 'high', 'medium'),
('Compliance Management', 'Compliance Monitoring', 'Implementare monitoraggio continuo conformità', 14, 'medium', 'high'),

-- Vendor Management
('Vendor Management', 'Security Assessment Fornitori', 'Valutare sicurezza di tutti i fornitori critici', 21, 'medium', 'medium'),
('Vendor Management', 'Contratti di Sicurezza', 'Aggiornare contratti con clausole di sicurezza', 14, 'medium', 'low'),
('Vendor Management', 'Third-party Risk Assessment', 'Valutazione rischi di terze parti', 10, 'medium', 'medium'),
('Vendor Management', 'Vendor Access Management', 'Controllare accessi dei fornitori ai sistemi', 7, 'high', 'medium'),

-- Security Awareness
('Security Awareness', 'Training Sicurezza Generale', 'Formazione base sicurezza per tutti i dipendenti', 5, 'high', 'low'),
('Security Awareness', 'Phishing Simulation', 'Campagna di simulazione phishing periodica', 3, 'medium', 'low'),
('Security Awareness', 'Security Champions Program', 'Programma ambassador sicurezza per reparto', 14, 'low', 'medium'),
('Security Awareness', 'Incident Reporting Training', 'Formazione su come segnalare incidenti sicurezza', 2, 'medium', 'low'),

-- Cloud Security
('Cloud Security', 'Cloud Configuration Review', 'Audit configurazioni sicurezza cloud', 7, 'high', 'medium'),
('Cloud Security', 'Cloud Access Security Broker', 'Implementare CASB per controllo accessi cloud', 14, 'medium', 'high'),
('Cloud Security', 'Container Security', 'Implementare sicurezza per container e Kubernetes', 14, 'medium', 'high'),
('Cloud Security', 'Cloud Backup Strategy', 'Sviluppare strategia backup multi-cloud', 10, 'medium', 'medium');