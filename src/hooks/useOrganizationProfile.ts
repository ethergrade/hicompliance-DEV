import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { OrganizationProfile, NIS2Classification } from '@/types/organization';
 import { useClientOrganization } from '@/hooks/useClientOrganization';

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
  const { organizationId: clientOrgId, isLoading: clientLoading } = useClientOrganization();
  const organizationId = clientOrgId ?? null;

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    if (clientLoading || !organizationId) {
      setProfile(null);
      setFormData(INITIAL_FORM_DATA);
      latestFormDataRef.current = INITIAL_FORM_DATA;
      lastPersistedHashRef.current = JSON.stringify(INITIAL_FORM_DATA);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organization_profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const profileData = data as unknown as OrganizationProfile;
        const nextFormData: ProfileFormData = {
          legal_name: profileData.legal_name || '',
          vat_number: profileData.vat_number || '',
          fiscal_code: profileData.fiscal_code || '',
          legal_address: profileData.legal_address || '',
          operational_address: profileData.operational_address || '',
          pec: profileData.pec || '',
          phone: profileData.phone || '',
          email: profileData.email || '',
          business_sector: profileData.business_sector || '',
          nis2_classification: profileData.nis2_classification,
          ciso_substitute: profileData.ciso_substitute || ''
        };

        setProfile(profileData);
        setFormData(nextFormData);
        latestFormDataRef.current = nextFormData;
        lastPersistedHashRef.current = JSON.stringify(nextFormData);
      } else {
        setProfile(null);
        setFormData(INITIAL_FORM_DATA);
        latestFormDataRef.current = INITIAL_FORM_DATA;
        lastPersistedHashRef.current = JSON.stringify(INITIAL_FORM_DATA);
      }
    } catch (error) {
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

  // Save profile with debounce
  const saveProfile = useCallback(async (data: ProfileFormData) => {
    if (!organizationId) return;

    setSaving(true);
    try {
      const payload = {
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
        nis2_classification: data.nis2_classification,
        ciso_substitute: data.ciso_substitute || null
      };

      if (profile?.id) {
        // Update existing
        const { data: updatedProfile, error } = await supabase
          .from('organization_profiles')
          .update(payload)
          .eq('id', profile.id)
          .select()
          .single();

        if (error) throw error;
        setProfile(updatedProfile as unknown as OrganizationProfile);
      } else {
        // Insert new
        const { data: newProfile, error } = await supabase
          .from('organization_profiles')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        setProfile(newProfile as unknown as OrganizationProfile);
      }

      lastPersistedHashRef.current = JSON.stringify(data);
      setLastSaved(new Date());

      window.dispatchEvent(
        new CustomEvent<OrganizationProfileUpdatedEventDetail>('organization-profile-updated', {
          detail: {
            organizationId,
            sourceId: sourceIdRef.current,
          },
        })
      );
    } catch (error) {
      console.error('Error saving organization profile:', error);
      toast({
        title: "Errore",
        description: "Errore nel salvataggio del profilo aziendale",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }, [organizationId, profile?.id, toast]);

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

  // Update form field with auto-save
  const updateField = useCallback((field: keyof ProfileFormData, value: string | NIS2Classification | null) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      latestFormDataRef.current = newData;
      
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new debounced save (1.5 seconds)
      saveTimeoutRef.current = setTimeout(() => {
        void saveProfile(newData);
      }, 1500);

      return newData;
    });
  }, [saveProfile]);

  useEffect(() => {
    organizationIdRef.current = organizationId;
  }, [organizationId]);

  useEffect(() => {
    saveProfileRef.current = saveProfile;
  }, [saveProfile]);

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

  // Initial fetch
  useEffect(() => {
    if (!clientLoading) {
      void fetchProfile();
    }
  }, [fetchProfile, clientLoading, clientOrgId]);

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
