INSERT INTO public.hisolution_services (code,name,description,icon)
SELECT 'documents','Gestione Documenti','Archivio documentale ISO del cliente','folder'
WHERE NOT EXISTS (SELECT 1 FROM public.hisolution_services WHERE code='documents');

INSERT INTO public.tenant_services (tenant_id, service_type, status)
SELECT o.id, 'documents', 'active' FROM public.organizations o
WHERE o.name <> 'AKC'
  AND NOT EXISTS (SELECT 1 FROM public.tenant_services t WHERE t.tenant_id=o.id AND t.service_type='documents');