import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { OrganizationProfile, NIS2Classification } from '@/types/organization';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { tenantsApi } from '@/lib/api/tenants';

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
  const { organizationId: clientOrgId, isLoading: clientLoading, canManageMultipleClients } = useClientOrganization();

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    if (clientLoading) {
      return;
    }
    
    // Non-admin base users use getOwn. If they are admin but haven't selected a client, wait.
    if (canManageMultipleClients && !clientOrgId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      setOrganizationId(clientOrgId);

      const tenant = canManageMultipleClients && clientOrgId 
        ? await tenantsApi.get(clientOrgId) 
        : await tenantsApi.getOwn();

      if (tenant) {
        // Map TenantResource to OrganizationProfile
        const profileData: OrganizationProfile = {
          id: tenant.id,
          organization_id: tenant.id,
          legal_name: tenant.legal_name || tenant.name || null,
          vat_number: tenant.vat_number || null,
          fiscal_code: tenant.fiscal_code || null,
          legal_address: tenant.legal_address || null,
          operational_address: tenant.operational_address || null,
          pec: tenant.pec || null,
          phone: tenant.phone || null,
          email: tenant.email || null,
          business_sector: tenant.business_sector || tenant.industry || null,
          nis2_classification: tenant.nis2_classification || null,
          ciso_substitute: tenant.ciso_substitute || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
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
  }, [clientOrgId, clientLoading, canManageMultipleClients, toast]);

  // Save profile with debounce
  const saveProfile = useCallback(async (data: ProfileFormData) => {
    // If it's an admin, we need an org ID. For base users, we can just updateOwn.
    if (canManageMultipleClients && !organizationId) return;

    setSaving(true);
    try {
      const payload = {
        name: data.legal_name || undefined,
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
        ciso_substitute: data.ciso_substitute || null
      };

      let newTenant;
      if (organizationId) {
        newTenant = await tenantsApi.update(organizationId, payload);
      } else {
        newTenant = await tenantsApi.updateOwn(payload);
      }

      if (newTenant && profile) {
        setProfile({
          ...profile,
          legal_name: newTenant.legal_name || newTenant.name || null,
          vat_number: newTenant.vat_number || null,
          fiscal_code: newTenant.fiscal_code || null,
          legal_address: newTenant.legal_address || null,
          operational_address: newTenant.operational_address || null,
          pec: newTenant.pec || null,
          phone: newTenant.phone || null,
          email: newTenant.email || null,
          business_sector: newTenant.business_sector || newTenant.industry || null,
          nis2_classification: newTenant.nis2_classification || null,
          ciso_substitute: newTenant.ciso_substitute || null,
        });
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
  }, [organizationId, canManageMultipleClients, profile, toast]);

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
    if (!clientLoading) {
      fetchProfile();
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [fetchProfile, clientLoading, clientOrgId]);

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
