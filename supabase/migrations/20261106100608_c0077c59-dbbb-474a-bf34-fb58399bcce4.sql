INSERT INTO public.organization_profiles (organization_id, vat_number, nis2_classification, business_sector)
SELECT id, 'IT02008500460', 'essential'::public.nis2_classification, 'Trattamento acqua e servizi'
FROM public.organizations
WHERE id = '77c665c0-a9f1-4e9f-81ad-ba0bbe3c1223' AND name = 'Innovatech Group S.r.l.'
ON CONFLICT (organization_id) DO UPDATE SET
  vat_number = EXCLUDED.vat_number,
  nis2_classification = EXCLUDED.nis2_classification,
  business_sector = EXCLUDED.business_sector,
  updated_at = now();