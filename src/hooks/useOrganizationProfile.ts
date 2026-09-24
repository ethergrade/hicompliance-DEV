import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { OrganizationProfile, NIS2Classification } from '@/types/organization';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { supabase } from '@/integrations/supabase/client';
import type { CompanyProfileResource, TenantResource } from '@/types/api';

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

/** Unisce tenant e profilo nella vista usata dai consumatori del hook. */
function toProfile(t: TenantResource, p: CompanyProfileResource | null): OrganizationProfile {
  return {
    id: t.id,
    organization_id: t.id,
    legal_name: p?.legal_name ?? null,
    vat_number: t.vat_number ?? p?.vat_number ?? null,
    fiscal_code: p?.fiscal_code ?? null,
    legal_address: p?.legal_address ?? null,
    operational_address: p?.operational_address ?? null,
    pec: p?.pec ?? null,
    phone: t.phone ?? p?.phone ?? null,
    email: p?.email ?? null,
    business_sector: t.industry ?? p?.business_sector ?? null,
    nis2_classification: (t.nis2_classification as NIS2Classification) ?? null,
    ciso_substitute: p?.ciso_substitute ?? null,
    created_at: t.created_at ?? '',
    updated_at: p?.updated_at ?? t.created_at ?? '',
  };
}

function toCompanyProfileResource(row: Record<string, unknown> | null): CompanyProfileResource | null {
  if (!row) return null;
  return {
    ...row,
    tenant_id: String(row.organization_id ?? ''),
    group_id: null,
  } as CompanyProfileResource;
}

/**
 * Unisce le due risorse in un unico form.
 *
 * Ragione sociale, codice fiscale, sedi, PEC, email e sostituto CISO stanno su
 * `company_profiles`, non su `tenants`: il tenant non li restituisce e non li
 * accetta in scrittura, quindi vanno letti e scritti dal proprio endpoint.
 */
function toFormData(t: TenantResource, p: CompanyProfileResource | null): ProfileFormData {
  return {
    legal_name: p?.legal_name || t.name || '',
    vat_number: t.vat_number || p?.vat_number || '',
    fiscal_code: p?.fiscal_code || '',
    legal_address: p?.legal_address || '',
    operational_address: p?.operational_address || '',
    pec: p?.pec || '',
    phone: t.phone || p?.phone || '',
    email: p?.email || '',
    business_sector: t.industry || p?.business_sector || '',
    nis2_classification: (t.nis2_classification as NIS2Classification) ?? null,
    ciso_substitute: p?.ciso_substitute || '',
  };
}

/** Campi che vivono su `tenants`. */
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
  const { organizationId: clientOrgId, isLoading: clientLoading, selectedOrganization } = useClientOrganization();
  const organizationId = clientOrgId ?? null;
  const groupId = selectedOrganization?.group_id ?? null;

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
	  const tenant = selectedOrganization;
	  if (!tenant) throw new Error('Azienda non selezionata');
	  const { data: companyProfile, error } = await supabase
		.from('organization_profiles')
		.select('*')
		.eq('organization_id', organizationId)
		.maybeSingle();
	  if (error) throw error;
      const normalizedProfile = toCompanyProfileResource(companyProfile as Record<string, unknown> | null);
      const nextFormData = toFormData(tenant, normalizedProfile);
      const prof = toProfile(tenant, normalizedProfile);

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
    if (!organizationId) return;

    setSaving(true);
    try {
	  const { data: authData, error: authError } = await supabase.auth.getUser();
	  if (authError || !authData.user) throw authError ?? new Error('Non autenticato');
	  const { data: updatedProfile, error } = await supabase
		.from('organization_profiles')
		.upsert({
		  organization_id: organizationId,
		  legal_name: data.legal_name || null,
		  vat_number: data.vat_number || null,
		  fiscal_code: data.fiscal_code || null,
		  legal_address: data.legal_address || null,
		  operational_address: data.operational_address || null,
		  pec: data.pec || null,
		  phone: data.phone || null,
		  email: data.email || null,
		  business_sector: data.business_sector || null,
		  nis2_classification: data.nis2_classification === 'nessuna' ? 'none' : data.nis2_classification,
		  ciso_substitute: data.ciso_substitute || null,
		}, { onConflict: 'organization_id' })
		.select('*')
		.single();
	  if (error) throw error;
	  const updatedTenant = selectedOrganization;
	  if (!updatedTenant) throw new Error('Azienda non selezionata');

	  setProfile(toProfile(updatedTenant, toCompanyProfileResource(updatedProfile as Record<string, unknown>)));
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
  }, [organizationId, selectedOrganization, toast]);

  // ─── Flush pending save ────────────────────────────────────────────────

  const flushPendingSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (!organizationId) return;

    const currentData = latestFormDataRef.current;
    const currentHash = JSON.stringify(currentData);
    if (currentHash === lastPersistedHashRef.current) return;

    await saveProfile(currentData);
  }, [organizationId, saveProfile]);

  // ─── Before unload handler to prevent data loss ────────────────────────

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const currentData = latestFormDataRef.current;
      const currentHash = JSON.stringify(currentData);
      const hasPendingChanges = currentHash !== lastPersistedHashRef.current;

      if (hasPendingChanges) {
        // Trigger save (may not complete before page unload)
        void saveProfileRef.current(currentData);
        // Show warning
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

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
      if (!orgId) return;

      const currentData = latestFormDataRef.current;
      const currentHash = JSON.stringify(currentData);
      if (currentHash === lastPersistedHashRef.current) return;

      void saveProfileRef.current(currentData);
    };
  }, []);

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
