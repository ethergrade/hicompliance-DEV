import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { criticalInfrastructureApi } from '@/lib/api/critical-infrastructure';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import type { CriticalInfrastructureAsset, CriticalInfrastructureUpdate } from '@/types/api';

export const useCriticalInfrastructure = () => {
  const [assets, setAssets] = useState<CriticalInfrastructureAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { organizationId: clientOrgId, isLoading: clientLoading } = useClientOrganization();

  const loadAssets = useCallback(async () => {
    if (clientLoading || !clientOrgId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const items = await criticalInfrastructureApi.list(clientOrgId);
      setAssets(items || []);
    } catch (error) {
      console.error('Error loading critical infrastructure:', error);
      toast.error('Errore nel caricamento degli asset');
    } finally {
      setLoading(false);
    }
  }, [clientOrgId, clientLoading]);

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
    if (!clientOrgId) {
      toast.error('Organizzazione non trovata');
      return null;
    }

    try {
      setSaving(true);
      const newAssetId = generateNextAssetId();

      const newAsset: Partial<CriticalInfrastructureAsset> = {
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
        created_by: null,
        // tenant_id and group_id are auto-assigned by the backend
      };

      const insertedAsset = await criticalInfrastructureApi.create(clientOrgId, newAsset);
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
  }, [clientOrgId, generateNextAssetId]);

  const updateAsset = useCallback(async (id: string, updates: CriticalInfrastructureUpdate) => {
    if (!clientOrgId) {
      toast.error('Organizzazione non trovata');
      throw new Error('Organizzazione non trovata');
    }

    try {
      setSaving(true);
      await criticalInfrastructureApi.update(clientOrgId, id, updates);
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
  }, [clientOrgId]);

  const deleteAsset = useCallback(async (id: string) => {
    if (!clientOrgId) {
      toast.error('Organizzazione non trovata');
      return;
    }

    try {
      setSaving(true);
      const asset = assets.find(a => a.id === id);
      await criticalInfrastructureApi.delete(clientOrgId, id);
      setAssets(prev => prev.filter(a => a.id !== id));
      toast.success(`Asset ${asset?.asset_id} eliminato`);
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error('Errore nell\'eliminazione');
    } finally {
      setSaving(false);
    }
  }, [clientOrgId, assets]);

  useEffect(() => {
    if (!clientLoading) {
      loadAssets();
    }
  }, [loadAssets, clientLoading, clientOrgId]);

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
