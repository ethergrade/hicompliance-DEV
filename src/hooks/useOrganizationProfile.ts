import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { OrganizationProfile, NIS2Classification } from '@/types/organization';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { tenantsApi } from '@/lib/api/tenants';
import type { TenantResource, UpdateTenantRequest } from '@/types/api';

interface ProfileFormData {
  legal_name: string;
  vat_number: string;
  fiscal_code: string;
  legal_address: string;
  operational_address: string;
  pec: string;
  phone: string;
  email: string;
  business_sector: string;
  nis2_classification: NIS2Classification | null;
  ciso_substitute: string;
}

const INITIAL_FORM_DATA: ProfileFormData = {
  legal_name: '',
  vat_number: '',
  fiscal_code: '',
  legal_address: '',
  operational_address: '',
  pec: '',
  phone: '',
  email: '',
  business_sector: '',
  nis2_classification: null,
  ciso_substitute: ''
};

interface OrganizationProfileUpdatedEventDetail {
  organizationId: string;
  sourceId: string;
}

export interface UseOrganizationProfileReturn {
  profile: OrganizationProfile | null;
  formData: ProfileFormData;
  loading: boolean;
  saving: boolean;
  lastSaved: Date | null;
  updateField: (field: keyof ProfileFormData, value: string | NIS2Classification | null) => void;
  flushPendingSave: () => Promise<void>;
  refetch: () => Promise<void>;
}

/** Map TenantResource to OrganizationProfile */
function tenantToProfile(t: TenantResource): OrganizationProfile {
  return {
    id: t.id,
    organization_id: t.id,
    legal_name: t.legal_name ?? null,
    vat_number: t.vat_number ?? null,
    fiscal_code: t.fiscal_code ?? null,
    legal_address: t.legal_address ?? null,
    operational_address: t.operational_address ?? null,
    pec: t.pec ?? null,
    phone: t.phone ?? null,
    email: t.email ?? null,
    business_sector: t.business_sector ?? null,
    nis2_classification: (t.nis2_classification as NIS2Classification) ?? null,
    ciso_substitute: t.ciso_substitute ?? null,
    created_at: t.created_at ?? '',
    updated_at: t.updated_at ?? '',
  };
}

/** Map TenantResource fields to ProfileFormData */
function tenantToFormData(t: TenantResource): ProfileFormData {
  return {
    legal_name: t.legal_name || t.name || '',
    vat_number: t.vat_number || '',
    fiscal_code: t.fiscal_code || '',
    legal_address: t.legal_address || '',
    operational_address: t.operational_address || '',
    pec: t.pec || '',
    phone: t.phone || '',
    email: t.email || '',
    business_sector: t.business_sector || t.industry || '',
    nis2_classification: (t.nis2_classification as NIS2Classification) ?? null,
    ciso_substitute: t.ciso_substitute || '',
  };
}

/** Build UpdateTenantRequest from ProfileFormData */
function formDataToUpdatePayload(data: ProfileFormData): UpdateTenantRequest {
  return {
    legal_name: data.legal_name || null,
    vat_number: data.vat_number || null,
    fiscal_code: data.fiscal_code || null,
    legal_address: data.legal_address || null,
    operational_address: data.operational_address || null,
    pec: data.pec || null,
    phone: data.phone || null,
    email: data.email || null,
    business_sector: data.business_sector || null,
    industry: data.business_sector || null,
    nis2_classification: data.nis2_classification,
    ciso_substitute: data.ciso_substitute || null,
  };
}

export function useOrganizationProfile() {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [formData, setFormData] = useState<ProfileFormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const { toast } = useToast();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestFormDataRef = useRef<ProfileFormData>(INITIAL_FORM_DATA);
  const lastPersistedHashRef = useRef<string>(JSON.stringify(INITIAL_FORM_DATA));
  const organizationIdRef = useRef<string | null>(null);
  const saveProfileRef = useRef<(data: ProfileFormData) => Promise<void>>(async () => {});
  const sourceIdRef = useRef<string>(`org-profile-${Math.random().toString(36).slice(2, 11)}`);
  const { organizationId: clientOrgId, isLoading: clientLoading, canManageMultipleClients } = useClientOrganization();
  const organizationId = clientOrgId ?? null;

  // ─── Fetch profile ──────────────────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    if (clientLoading) return;

    if (!organizationId) {
      setProfile(null);
      setFormData(INITIAL_FORM_DATA);
      latestFormDataRef.current = INITIAL_FORM_DATA;
      lastPersistedHashRef.current = JSON.stringify(INITIAL_FORM_DATA);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const tenant = await tenantsApi.get(organizationId);
      const nextFormData = tenantToFormData(tenant);
      const prof = tenantToProfile(tenant);

      setProfile(prof);
      setFormData(nextFormData);
      latestFormDataRef.current = nextFormData;
      lastPersistedHashRef.current = JSON.stringify(nextFormData);
    } catch (error: any) {
      console.error('Error fetching organization profile:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento del profilo aziendale",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, clientLoading, toast]);

  // ─── Save profile ───────────────────────────────────────────────────────

  const saveProfile = useCallback(async (data: ProfileFormData) => {
    if (canManageMultipleClients && !organizationId) return;

    setSaving(true);
    try {
      const payload = formDataToUpdatePayload(data);

      if (organizationId) {
        await tenantsApi.update(organizationId, payload);
      } else {
        await tenantsApi.updateOwn(payload);
      }

      // Re-fetch to get the updated profile with server-side computed fields
      let updatedTenant: TenantResource;
      if (organizationId) {
        updatedTenant = await tenantsApi.get(organizationId);
      } else {
        updatedTenant = await tenantsApi.getOwn();
      }

      setProfile(tenantToProfile(updatedTenant));
      lastPersistedHashRef.current = JSON.stringify(data);
      setLastSaved(new Date());

      window.dispatchEvent(
        new CustomEvent<OrganizationProfileUpdatedEventDetail>('organization-profile-updated', {
          detail: {
            organizationId: organizationId ?? updatedTenant.id,
            sourceId: sourceIdRef.current,
          },
        })
      );
    } catch (error: any) {
      console.error('Error saving organization profile:', error);

      if (error?.status === 403 || error?.status === 401) {
        toast({
          title: "Permessi insufficienti",
          description: "Non sei autorizzato a modificare i dati dell'azienda con il profilo corrente.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Errore",
          description: "Errore nel salvataggio del profilo aziendale",
          variant: "destructive"
        });
      }
    } finally {
      setSaving(false);
    }
  }, [organizationId, canManageMultipleClients, toast]);

  // ─── Flush pending save ────────────────────────────────────────────────

  const flushPendingSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (!organizationId && canManageMultipleClients) return;

    const currentData = latestFormDataRef.current;
    const currentHash = JSON.stringify(currentData);
    if (currentHash === lastPersistedHashRef.current) return;

    await saveProfile(currentData);
  }, [organizationId, canManageMultipleClients, saveProfile]);

  // ─── Update field with auto-save ───────────────────────────────────────

  const updateField = useCallback((field: keyof ProfileFormData, value: string | NIS2Classification | null) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      latestFormDataRef.current = newData;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        void saveProfile(newData);
      }, 1500);

      return newData;
    });
  }, [saveProfile]);

  // ─── Refs sync ─────────────────────────────────────────────────────────

  useEffect(() => {
    organizationIdRef.current = organizationId;
  }, [organizationId]);

  useEffect(() => {
    saveProfileRef.current = saveProfile;
  }, [saveProfile]);

  // ─── Cross-tab sync ────────────────────────────────────────────────────

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<OrganizationProfileUpdatedEventDetail>;
      const detail = customEvent.detail;

      if (!detail?.organizationId || !organizationId) return;
      if (detail.organizationId !== organizationId) return;
      if (detail.sourceId === sourceIdRef.current) return;

      void fetchProfile();
    };

    window.addEventListener('organization-profile-updated', handleProfileUpdated);
    return () => {
      window.removeEventListener('organization-profile-updated', handleProfileUpdated);
    };
  }, [organizationId, fetchProfile]);

  // ─── Initial fetch ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!clientLoading) {
      void fetchProfile();
    }
  }, [fetchProfile, clientLoading, clientOrgId]);

  // ─── Cleanup on unmount ────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      const orgId = organizationIdRef.current;
      if (!orgId && canManageMultipleClients) return;

      const currentData = latestFormDataRef.current;
      const currentHash = JSON.stringify(currentData);
      if (currentHash === lastPersistedHashRef.current) return;

      void saveProfileRef.current(currentData);
    };
  }, [canManageMultipleClients]);

  return {
    profile,
    formData,
    loading,
    saving,
    lastSaved,
    updateField,
    flushPendingSave,
    refetch: fetchProfile
  } satisfies UseOrganizationProfileReturn;
}
