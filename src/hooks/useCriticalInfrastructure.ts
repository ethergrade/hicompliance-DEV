import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CriticalInfrastructureAsset, CriticalInfrastructureUpdate } from '@/types/infrastructure';

export const useCriticalInfrastructure = () => {
  const [assets, setAssets] = useState<CriticalInfrastructureAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    try {
      setLoading(true);
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!userData?.organization_id) {
        setLoading(false);
        return;
      }

      setOrganizationId(userData.organization_id);

      const { data, error } = await supabase
        .from('critical_infrastructure')
        .select('*')
        .eq('organization_id', userData.organization_id)
        .order('asset_id');

      if (error) throw error;

      setAssets((data || []) as unknown as CriticalInfrastructureAsset[]);
    } catch (error) {
      console.error('Error loading critical infrastructure:', error);
      toast.error('Errore nel caricamento degli asset');
    } finally {
      setLoading(false);
    }
  }, []);

  const generateNextAssetId = useCallback(() => {
    if (assets.length === 0) return 'C-01';
    
    const numbers = assets
      .map(a => {
        const match = a.asset_id.match(/C-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n));
    
    const maxNumber = Math.max(...numbers, 0);
    return `C-${String(maxNumber + 1).padStart(2, '0')}`;
  }, [assets]);

  const addAsset = useCallback(async () => {
    if (!organizationId) {
      toast.error('Organizzazione non trovata');
      return null;
    }

    try {
      setSaving(true);
      const newAssetId = generateNextAssetId();
      const { data: user } = await supabase.auth.getUser();

      const newAsset = {
        organization_id: organizationId,
        asset_id: newAssetId,
        component_name: '',
        criticality: null,
        owner_team: '',
        management_type: null,
        location: '',
        sensitive_data: null,
        dependencies: '',
        main_controls: '',
        has_backup: null,
        backup_frequency: '',
        last_test_date: null,
        rpo_hours: null,
        rto_hours: null,
        runbook_link: '',
        ir_notes: '',
        created_by: user.user?.id || null,
      };

      const { data, error } = await supabase
        .from('critical_infrastructure')
        .insert(newAsset)
        .select()
        .single();

      if (error) throw error;

      const insertedAsset = data as unknown as CriticalInfrastructureAsset;
      setAssets(prev => [...prev, insertedAsset]);
      toast.success(`Asset ${newAssetId} creato`);
      return insertedAsset;
    } catch (error) {
      console.error('Error adding asset:', error);
      toast.error('Errore nella creazione dell\'asset');
      return null;
    } finally {
      setSaving(false);
    }
  }, [organizationId, generateNextAssetId]);

  const updateAsset = useCallback(async (id: string, updates: CriticalInfrastructureUpdate) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('critical_infrastructure')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setAssets(prev => prev.map(asset => 
        asset.id === id ? { ...asset, ...updates } : asset
      ));
    } catch (error) {
      console.error('Error updating asset:', error);
      toast.error('Errore nell\'aggiornamento');
      throw error;
    } finally {
      setSaving(false);
    }
  }, []);

  const deleteAsset = useCallback(async (id: string) => {
    try {
      setSaving(true);
      const asset = assets.find(a => a.id === id);

      const { error } = await supabase
        .from('critical_infrastructure')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setAssets(prev => prev.filter(a => a.id !== id));
      toast.success(`Asset ${asset?.asset_id} eliminato`);
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error('Errore nell\'eliminazione');
    } finally {
      setSaving(false);
    }
  }, [assets]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  return {
    assets,
    loading,
    saving,
    addAsset,
    updateAsset,
    deleteAsset,
    reloadAssets: loadAssets,
  };
};
