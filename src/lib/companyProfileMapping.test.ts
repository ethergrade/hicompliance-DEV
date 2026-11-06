import { describe, it, expect } from 'vitest';
import { mergeCompanyProfile, toStoredNis2, toUiNis2 } from './companyProfileMapping';
import type { TenantResource } from '@/types/api';

describe('Anagrafica NIS2', () => {
  it('Essenziale round-trips between UI and persisted enum', () => {
    expect(toStoredNis2('soggetto_essenziale')).toBe('essential');
    expect(toUiNis2('essential')).toBe('soggetto_essenziale');
  });
  it('Importante round-trips between UI and persisted enum', () => {
    expect(toStoredNis2('soggetto_importante')).toBe('important');
    expect(toUiNis2('important')).toBe('soggetto_importante');
  });
  it('Nessuna round-trips between UI and persisted enum', () => {
    expect(toStoredNis2('nessuna')).toBe('none');
    expect(toUiNis2('none')).toBe('nessuna');
  });
  it('Profile values survive reopening without replacing tenant identity', () => {
    const tenant = { id: 'client-1', name: 'Cliente' } as TenantResource;
    const merged = mergeCompanyProfile(tenant, { id: 'profile-1', organization_id: 'client-1', vat_number: '12345678901', primary_domain: 'example.test', revenue: 3000000, employees_count: 30, business_sector: 'Energia', nis2_classification: 'important' });
    expect(merged.id).toBe('client-1');
    expect(merged.primary_domain).toBe('example.test');
    expect(merged.vat_number).toBe('12345678901');
    expect(merged.revenue).toBe(3000000);
    expect(merged.employees_count).toBe(30);
    expect(merged.industry).toBe('Energia');
    expect(merged.nis2_classification).toBe('soggetto_importante');
  });
});