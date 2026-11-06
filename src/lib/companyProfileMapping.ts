import type { CompanyProfileResource, TenantResource } from '@/types/api';

export function toUiNis2(value: unknown): TenantResource['nis2_classification'] {
  if (value === 'essential' || value === 'soggetto_essenziale') return 'soggetto_essenziale';
  if (value === 'important' || value === 'soggetto_importante') return 'soggetto_importante';
  return 'nessuna';
}

export function toStoredNis2(value: unknown): 'essential' | 'important' | 'none' {
  const normalized = toUiNis2(value);
  return normalized === 'soggetto_essenziale' ? 'essential' : normalized === 'soggetto_importante' ? 'important' : 'none';
}

export function profileResource(row: Record<string, unknown>): CompanyProfileResource {
  return { ...row, tenant_id: row.organization_id, group_id: 'supabase' } as unknown as CompanyProfileResource;
}

export function mergeCompanyProfile(tenant: TenantResource, row: Record<string, unknown> | null): TenantResource {
  if (!row) return { ...tenant, nis2_classification: toUiNis2(tenant.nis2_classification) };
  return {
    ...tenant,
    ...row,
    id: tenant.id,
    name: tenant.name,
    industry: row.business_sector ?? null,
    nis2_classification: toUiNis2(row.nis2_classification),
  } as TenantResource;
}