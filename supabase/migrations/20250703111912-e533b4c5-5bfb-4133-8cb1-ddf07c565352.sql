-- Insert HiSolution services
INSERT INTO public.services (name, code, description, icon) VALUES 
('HiFirewall', 'hi_firewall', 'Sistema firewall avanzato HiSolution', 'shield'),
('HiEndpoint', 'hi_endpoint', 'Protezione endpoint HiSolution', 'monitor'),
('HiMail', 'hi_mail', 'Sicurezza email HiSolution', 'mail'),
('HiLog', 'hi_log', 'Sistema di logging HiSolution', 'file-text'),
('HiPatch', 'hi_patch', 'Gestione patch HiSolution', 'download'),
('HiMfa', 'hi_mfa', 'Autenticazione multi-fattore HiSolution', 'key'),
('HiTrack', 'hi_track', 'Sistema di tracciamento HiSolution', 'activity')
ON CONFLICT (code) DO NOTHING;

-- Update organization services with HiSolution services
DO $$
DECLARE
    org_id_1 uuid;
    service_ids uuid[];
    service_id uuid;
BEGIN
    -- Get cliente1 organization ID
    SELECT id INTO org_id_1 FROM public.organizations WHERE code = 'cliente1';
    
    -- Get HiSolution service IDs
    SELECT ARRAY(SELECT id FROM public.services WHERE code LIKE 'hi_%') INTO service_ids;
    
    -- Insert HiSolution services for Cliente1 with specific statuses matching screenshots
    -- HiFirewall - alert (8 issues)
    INSERT INTO public.organization_services (organization_id, service_id, status, health_score)
    SELECT org_id_1, id, 'alert'::service_status, 15
    FROM public.services WHERE code = 'hi_firewall'
    ON CONFLICT DO NOTHING;
    
    -- HiEndpoint - alert (3 issues)  
    INSERT INTO public.organization_services (organization_id, service_id, status, health_score)
    SELECT org_id_1, id, 'alert'::service_status, 70
    FROM public.services WHERE code = 'hi_endpoint'
    ON CONFLICT DO NOTHING;
    
    -- HiMail - alert (2 issues)
    INSERT INTO public.organization_services (organization_id, service_id, status, health_score)
    SELECT org_id_1, id, 'alert'::service_status, 80
    FROM public.services WHERE code = 'hi_mail'
    ON CONFLICT DO NOTHING;
    
    -- HiLog - alert (9 issues)
    INSERT INTO public.organization_services (organization_id, service_id, status, health_score)
    SELECT org_id_1, id, 'alert'::service_status, 10
    FROM public.services WHERE code = 'hi_log'
    ON CONFLICT DO NOTHING;
    
    -- HiPatch - alert (5 issues)
    INSERT INTO public.organization_services (organization_id, service_id, status, health_score)
    SELECT org_id_1, id, 'alert'::service_status, 50
    FROM public.services WHERE code = 'hi_patch'
    ON CONFLICT DO NOTHING;
    
    -- HiMfa - active
    INSERT INTO public.organization_services (organization_id, service_id, status, health_score)
    SELECT org_id_1, id, 'active'::service_status, 95
    FROM public.services WHERE code = 'hi_mfa'
    ON CONFLICT DO NOTHING;
    
    -- HiTrack - active
    INSERT INTO public.organization_services (organization_id, service_id, status, health_score)
    SELECT org_id_1, id, 'active'::service_status, 90
    FROM public.services WHERE code = 'hi_track'
    ON CONFLICT DO NOTHING;
    
END $$;