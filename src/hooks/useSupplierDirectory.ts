import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { SupplierDirectoryEntry } from '@/types/irp';

export interface SupplierAssetOption {
  id: string;
  label: string;
  asset_id: string;
  component_name: string;
}

type SupplierInput = Omit<
  SupplierDirectoryEntry,
  'id' | 'organization_id' | 'linked_asset_label' | 'created_at' | 'updated_at'
>;

interface UseSupplierDirectoryReturn {
  suppliers: SupplierDirectoryEntry[];
  filteredSuppliers: SupplierDirectoryEntry[];
  assetOptions: SupplierAssetOption[];
  loading: boolean;
  saving: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  fetchSuppliers: () => Promise<void>;
  addSupplier: (supplier: SupplierInput) => Promise<SupplierDirectoryEntry | null>;
  updateSupplier: (id: string, supplier: Partial<SupplierInput>) => Promise<boolean>;
  deleteSupplier: (id: string) => Promise<boolean>;
}

export const useSupplierDirectory = (): UseSupplierDirectoryReturn => {
  const [suppliers, setSuppliers] = useState<SupplierDirectoryEntry[]>([]);
  const [assetOptions, setAssetOptions] = useState<SupplierAssetOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { toast } = useToast();
  const { organizationId: clientOrgId, isLoading: clientLoading } = useClientOrganization();

  const fetchSuppliers = useCallback(async () => {
    if (clientLoading || !clientOrgId) return;

    setLoading(true);
    try {
      const { data: assetsData, error: assetsError } = await supabase
        .from('critical_infrastructure')
        .select('id, asset_id, component_name')
        .eq('organization_id', clientOrgId)
        .order('asset_id', { ascending: true });

      if (assetsError) throw assetsError;

      const assets = (assetsData || []) as Array<{
        id: string;
        asset_id: string;
        component_name: string | null;
      }>;

      const options: SupplierAssetOption[] = assets.map((asset) => ({
        id: asset.id,
        asset_id: asset.asset_id,
        component_name: asset.component_name || '',
        label: asset.component_name
          ? `${asset.component_name} (${asset.asset_id})`
          : asset.asset_id,
      }));

      const assetLabelById = new Map(options.map((option) => [option.id, option.label]));

      const suppliersRes = await supabase
        .from('supplier_directory' as any)
        .select('*')
        .eq('organization_id', clientOrgId)
        .order('supplier_name', { ascending: true });

      if (suppliersRes.error) throw suppliersRes.error;

      const normalizedSuppliers: SupplierDirectoryEntry[] = ((suppliersRes.data || []) as any[]).map((supplier) => ({
        ...supplier,
        linked_asset_label: supplier.linked_asset_id
          ? (assetLabelById.get(supplier.linked_asset_id) || null)
          : null,
      }));

      setAssetOptions(options);
      setSuppliers(normalizedSuppliers);
    } catch (error) {
      console.error('Error fetching suppliers directory:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare la rubrica fornitori',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientLoading, clientOrgId, toast]);

  useEffect(() => {
    if (!clientLoading && clientOrgId) {
      fetchSuppliers();
    }
  }, [clientLoading, clientOrgId, fetchSuppliers]);

  const filteredSuppliers = suppliers.filter((supplier) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    return (
      supplier.supplier_name.toLowerCase().includes(query) ||
      supplier.service_type?.toLowerCase().includes(query) ||
      supplier.contact_name?.toLowerCase().includes(query) ||
      supplier.email?.toLowerCase().includes(query) ||
      supplier.linked_asset_label?.toLowerCase().includes(query)
    );
  });

  const addSupplier = async (supplierData: SupplierInput): Promise<SupplierDirectoryEntry | null> => {
    if (!clientOrgId) {
      toast({
        title: 'Errore',
        description: 'Organizzazione non trovata',
        variant: 'destructive',
      });
      return null;
    }

    setSaving(true);
    try {
      const payload = {
        ...supplierData,
        organization_id: clientOrgId,
        linked_asset_id: supplierData.linked_asset_id || null,
      };

      const { data, error } = await supabase
        .from('supplier_directory' as any)
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      toast({
        title: 'Successo',
        description: 'Fornitore aggiunto alla rubrica',
      });

      await fetchSuppliers();
      return data as unknown as SupplierDirectoryEntry;
    } catch (error) {
      console.error('Error adding supplier:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile aggiungere il fornitore',
        variant: 'destructive',
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const updateSupplier = async (id: string, supplierData: Partial<SupplierInput>): Promise<boolean> => {
    setSaving(true);
    try {
      const payload = {
        ...supplierData,
        linked_asset_id: supplierData.linked_asset_id === '' ? null : supplierData.linked_asset_id,
      };

      const { error } = await supabase
        .from('supplier_directory' as any)
        .update(payload)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Successo',
        description: 'Fornitore aggiornato',
      });

      await fetchSuppliers();
      return true;
    } catch (error) {
      console.error('Error updating supplier:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile aggiornare il fornitore',
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteSupplier = async (id: string): Promise<boolean> => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('supplier_directory' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Successo',
        description: 'Fornitore rimosso dalla rubrica',
      });

      await fetchSuppliers();
      return true;
    } catch (error) {
      console.error('Error deleting supplier:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile eliminare il fornitore',
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    suppliers,
    filteredSuppliers,
    assetOptions,
    loading,
    saving,
    searchQuery,
    setSearchQuery,
    fetchSuppliers,
    addSupplier,
    updateSupplier,
    deleteSupplier,
  };
};
