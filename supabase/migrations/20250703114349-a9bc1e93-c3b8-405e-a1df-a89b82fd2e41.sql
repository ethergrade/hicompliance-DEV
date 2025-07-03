-- Insert assessment responses for organizations
DO $$
DECLARE
    org_record RECORD;
    question_record RECORD;
    response_status assessment_status;
    response_count INTEGER := 0;
BEGIN
    -- For each organization, add some assessment responses
    FOR org_record IN SELECT id, code FROM public.organizations WHERE code LIKE 'cliente%' LIMIT 3 LOOP
        response_count := 0;
        
        -- Insert responses for first 20 questions for each org
        FOR question_record IN SELECT id FROM public.assessment_questions ORDER BY order_index LIMIT 20 LOOP
            -- Generate realistic response distribution
            IF random() < 0.4 THEN
                response_status := 'completed';
            ELSIF random() < 0.7 THEN
                response_status := 'planned_in_progress';
            ELSE
                response_status := 'not_applicable';
            END IF;
            
            INSERT INTO public.assessment_responses (organization_id, question_id, status, notes, last_updated_by)
            SELECT 
                org_record.id,
                question_record.id,
                response_status,
                CASE response_status
                    WHEN 'completed' THEN 'Implementato e verificato con successo'
                    WHEN 'planned_in_progress' THEN 'In fase di implementazione, previsto completamento entro 30 giorni'
                    ELSE 'Non applicabile al nostro contesto operativo'
                END,
                u.id
            FROM public.users u 
            WHERE u.organization_id = org_record.id 
            LIMIT 1
            ON CONFLICT DO NOTHING;
            
            response_count := response_count + 1;
        END LOOP;
        
        RAISE NOTICE 'Inserted % assessment responses for organization %', response_count, org_record.code;
    END LOOP;
END $$;