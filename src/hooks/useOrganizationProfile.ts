import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { OrganizationProfile, NIS2Classification } from '@/types/organization';

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

export function useOrganizationProfile() {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [formData, setFormData] = useState<ProfileFormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const { toast } = useToast();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch current user's organization
  const fetchOrganizationId = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('auth_user_id', user.id)
      .single();

    return userData?.organization_id || null;
  }, []);

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const orgId = await fetchOrganizationId();
      if (!orgId) {
        setLoading(false);
        return;
      }
      setOrganizationId(orgId);

      const { data, error } = await supabase
        .from('organization_profiles')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const profileData = data as unknown as OrganizationProfile;
        setProfile(profileData);
        setFormData({
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
        });
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
  }, [fetchOrganizationId, toast]);

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

      if (profile) {
        // Update existing
        const { error } = await supabase
          .from('organization_profiles')
          .update(payload)
          .eq('id', profile.id);

        if (error) throw error;
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

      setLastSaved(new Date());
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
  }, [organizationId, profile, toast]);

  // Update form field with auto-save
  const updateField = useCallback((field: keyof ProfileFormData, value: string | NIS2Classification | null) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new debounced save (1.5 seconds)
      saveTimeoutRef.current = setTimeout(() => {
        saveProfile(newData);
      }, 1500);

      return newData;
    });
  }, [saveProfile]);

  // Initial fetch
  useEffect(() => {
    fetchProfile();
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [fetchProfile]);

  return {
    profile,
    formData,
    loading,
    saving,
    lastSaved,
    updateField,
    refetch: fetchProfile
  };
}
