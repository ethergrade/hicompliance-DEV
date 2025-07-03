-- Insert test organizations
INSERT INTO public.organizations (name, code) VALUES 
('Cliente1', 'cliente1'),
('Cliente2', 'cliente2'),
('Cliente3', 'cliente3')
ON CONFLICT (code) DO NOTHING;

-- Insert services based on the screenshot
INSERT INTO public.services (name, code, description, icon) VALUES 
('Cloud Security', 'cloud_security', 'Sicurezza infrastruttura cloud', 'cloud'),
('Endpoint Security', 'endpoint_security', 'Protezione dispositivi endpoint', 'shield'),
('Email Security', 'email_security', 'Sicurezza comunicazioni email', 'mail'),
('User Data Governance', 'user_data_governance', 'Governance dati utente', 'users'),
('Network Security', 'network_security', 'Configurazione sicurezza rete', 'network'),
('Microsoft 365', 'microsoft_365', 'Microsoft 365 Security', 'microsoft'),
('Google Workplace', 'google_workplace', 'Google Workspace Security', 'google'),
('Salesforce', 'salesforce', 'Salesforce Security', 'salesforce')
ON CONFLICT (code) DO NOTHING;

-- Get organization IDs for inserting organization services
DO $$
DECLARE
    org_id_1 uuid;
    org_id_2 uuid;
    org_id_3 uuid;
    service_ids uuid[];
    service_id uuid;
BEGIN
    -- Get organization IDs
    SELECT id INTO org_id_1 FROM public.organizations WHERE code = 'cliente1';
    SELECT id INTO org_id_2 FROM public.organizations WHERE code = 'cliente2';
    SELECT id INTO org_id_3 FROM public.organizations WHERE code = 'cliente3';
    
    -- Get all service IDs
    SELECT ARRAY(SELECT id FROM public.services) INTO service_ids;
    
    -- Insert organization services for Cliente1 (full setup)
    FOREACH service_id IN ARRAY service_ids
    LOOP
        INSERT INTO public.organization_services (organization_id, service_id, status, health_score)
        VALUES (org_id_1, service_id, 
                CASE 
                    WHEN random() < 0.7 THEN 'active'::service_status
                    WHEN random() < 0.9 THEN 'alert'::service_status
                    ELSE 'maintenance'::service_status
                END,
                (random() * 100)::integer)
        ON CONFLICT DO NOTHING;
    END LOOP;
    
    -- Insert partial services for Cliente2
    FOR i IN 1..(array_length(service_ids, 1) / 2)
    LOOP
        INSERT INTO public.organization_services (organization_id, service_id, status, health_score)
        VALUES (org_id_2, service_ids[i], 
                CASE 
                    WHEN random() < 0.8 THEN 'active'::service_status
                    ELSE 'alert'::service_status
                END,
                (random() * 100)::integer)
        ON CONFLICT DO NOTHING;
    END LOOP;
    
    -- Insert minimal services for Cliente3
    FOR i IN 1..3
    LOOP
        INSERT INTO public.organization_services (organization_id, service_id, status, health_score)
        VALUES (org_id_3, service_ids[i], 'active'::service_status, (random() * 100)::integer)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;