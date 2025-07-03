-- Populate organization_services with realistic test data
DO $$
DECLARE
    org_record RECORD;
    service_record RECORD;
    random_health INTEGER;
    random_status text;
BEGIN
    -- For each organization
    FOR org_record IN SELECT id, code FROM public.organizations LOOP
        -- For each service  
        FOR service_record IN SELECT id, code FROM public.services LOOP
            -- Generate realistic data based on service type and organization
            IF service_record.code LIKE 'hi_%' THEN
                -- HiSolution services - more varied status
                IF org_record.code = 'cliente1' THEN
                    -- Cliente1 has several issues
                    CASE service_record.code
                        WHEN 'hi_firewall' THEN random_health := 15; random_status := 'alert';
                        WHEN 'hi_endpoint' THEN random_health := 70; random_status := 'alert';
                        WHEN 'hi_mail' THEN random_health := 80; random_status := 'alert';
                        WHEN 'hi_log' THEN random_health := 10; random_status := 'alert';
                        WHEN 'hi_patch' THEN random_health := 50; random_status := 'alert';
                        WHEN 'hi_mfa' THEN random_health := 95; random_status := 'active';
                        WHEN 'hi_track' THEN random_health := 90; random_status := 'active';
                        ELSE random_health := 75; random_status := 'active';
                    END CASE;
                ELSIF org_record.code = 'cliente2' THEN
                    -- Cliente2 moderate issues
                    CASE service_record.code
                        WHEN 'hi_firewall' THEN random_health := 85; random_status := 'active';
                        WHEN 'hi_endpoint' THEN random_health := 78; random_status := 'active';
                        WHEN 'hi_mail' THEN random_health := 45; random_status := 'alert';
                        WHEN 'hi_log' THEN random_health := 60; random_status := 'alert';
                        WHEN 'hi_patch' THEN random_health := 75; random_status := 'maintenance';
                        WHEN 'hi_mfa' THEN random_health := 88; random_status := 'active';
                        WHEN 'hi_track' THEN random_health := 92; random_status := 'active';
                        ELSE random_health := 80; random_status := 'active';
                    END CASE;
                ELSE
                    -- Other organizations - generally good
                    random_health := 75 + (random() * 20)::integer;
                    IF random() > 0.8 THEN 
                        random_status := 'alert';
                    ELSIF random() > 0.9 THEN 
                        random_status := 'maintenance';
                    ELSE 
                        random_status := 'active';
                    END IF;
                END IF;
            ELSE
                -- Traditional security services
                random_health := 60 + (random() * 35)::integer;
                IF random() > 0.7 THEN 
                    random_status := 'alert';
                ELSIF random() > 0.85 THEN 
                    random_status := 'maintenance';
                ELSE 
                    random_status := 'active';
                END IF;
            END IF;
            
            -- Insert the service for this organization
            INSERT INTO public.organization_services (organization_id, service_id, status, health_score, last_updated)
            VALUES (
                org_record.id, 
                service_record.id, 
                random_status::service_status, 
                random_health,
                now() - interval '1 hour' * (random() * 48)::integer
            )
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END $$;