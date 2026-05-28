import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { riskAnalysisApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import type {
  RiskAnalysisItem,
  StoreRiskAnalysisRequest,
} from '@/types/api';
import { 
  RiskAnalysisAsset, 
  ThreatSource,
  ControlScores,
  AssetSummary
} from '@/types/riskAnalysis';
import { SECURITY_CONTROLS } from '@/data/securityControls';
import { useClientOrganization } from '@/hooks/useClientOrganization';

/** Map an API RiskAnalysisItem to the hook's local RiskAnalysisAsset shape */
function toAsset(item: RiskAnalysisItem, orgId: string): RiskAnalysisAsset {
  return {
    id: item.id,
    organization_id: orgId,
    asset_name: item.asset_name,
    threat_source: item.threat_source as ThreatSource,
    control_scores: (item.control_scores || {}) as ControlScores,
    risk_score: item.risk_score ?? 0,
    notes: item.notes ?? null,
    created_at: item.created_at ?? '',
    updated_at: item.updated_at ?? '',
    created_by: null,
  };
}

export const useRiskAnalysis = () => {
  const [assets, setAssets] = useState<RiskAnalysisAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const { organizationId: clientOrgId, isLoading: clientLoading } = useClientOrganization();

  const loadAssets = useCallback(async () => {
    if (clientLoading || !clientOrgId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setOrganizationId(clientOrgId);

      const items = await riskAnalysisApi.list(clientOrgId, groupId);
      const parsedAssets = (items || []).map(item => toAsset(item, clientOrgId));
      setAssets(parsedAssets);
    } catch (error) {
      console.error('Error loading risk analysis:', error);
      toast.error('Errore nel caricamento dell\'analisi rischi');
    } finally {
      setLoading(false);
    }
  }, [clientOrgId, clientLoading]);

  const calculateRiskScore = (controlScores: ControlScores): number => {
    const values = Object.values(controlScores).filter((v): v is number => typeof v === 'number');
    if (values.length === 0) return 0;
    
    const sum = values.reduce((acc, val) => acc + val, 0);
    const maxPossible = values.length * 3;
    return Math.round((sum / maxPossible) * 100);
  };

  const addAsset = useCallback(async (
    assetName: string, 
    threatSource: ThreatSource,
    syncToInfrastructure: boolean = false
  ) => {
    if (!organizationId) {
      toast.error('Organizzazione non trovata');
      return null;
    }

    // Check if asset with this source already exists
    const existing = assets.find(
      a => a.asset_name === assetName && a.threat_source === threatSource
    );
    if (existing) {
      toast.error('Questo asset con questa fonte di rischio esiste già');
      return null;
    }

    try {
      setSaving(true);

      const payload: StoreRiskAnalysisRequest = {
        asset_name: assetName,
        threat_source: threatSource,
        control_scores: {},
        risk_score: 0,
      };

      const created = await riskAnalysisApi.create(organizationId, payload, groupId);
      const insertedAsset = toAsset(created, organizationId);
      
      setAssets(prev => [...prev, insertedAsset]);

      // If syncToInfrastructure is enabled, also create in critical_infrastructure
      // (no API endpoint for critical infrastructure — use supabase, warn on failure)
      if (syncToInfrastructure) {
        try {
          const { data: infraAssets } = await supabase
            .from('critical_infrastructure')
            .select('asset_id')
            .eq('organization_id', organizationId)
            .order('asset_id');

          let nextNumber = 1;
          if (infraAssets && infraAssets.length > 0) {
            const numbers = infraAssets
              .map((a: any) => {
                const match = a.asset_id.match(/C-(\d+)/);
                return match ? parseInt(match[1], 10) : 0;
              })
              .filter((n: number) => !isNaN(n));
            nextNumber = Math.max(...numbers, 0) + 1;
          }
          const newAssetId = `C-${String(nextNumber).padStart(2, '0')}`;

          const { error: infraError } = await supabase
            .from('critical_infrastructure')
            .insert({
              organization_id: organizationId,
              asset_id: newAssetId,
              component_name: assetName,
            });

          if (infraError) throw infraError;
          toast.success(`Asset "${assetName}" creato e sincronizzato (${newAssetId})`);
        } catch (infraErr) {
          console.error('Error syncing to infrastructure:', infraErr);
          toast.warning('Asset creato ma sincronizzazione con Infrastruttura fallita');
        }
      } else {
        toast.success(`Asset "${assetName}" aggiunto`);
      }

      return insertedAsset;
    } catch (error) {
      console.error('Error adding asset:', error);
      toast.error('Errore nella creazione dell\'asset');
      return null;
    } finally {
      setSaving(false);
    }
  }, [organizationId, assets]);

  const updateAsset = useCallback(async (id: string, updates: { asset_name?: string; threat_source?: ThreatSource; control_scores?: ControlScores; risk_score?: number; notes?: string | null }) => {
    if (!organizationId) return;
    try {
      setSaving(true);

      // If updating control_scores, recalculate risk_score
      let finalUpdates: Partial<{ asset_name: string; threat_source: ThreatSource; control_scores: Record<string, unknown>; risk_score: number; notes: string | null }> = { ...updates };
      if (updates.control_scores) {
        finalUpdates.risk_score = calculateRiskScore(updates.control_scores);
      }

      await riskAnalysisApi.update(organizationId, id, finalUpdates as any, groupId);

      setAssets(prev => prev.map(asset => 
        asset.id === id ? { ...asset, ...updates, risk_score: finalUpdates.risk_score ?? updates.risk_score ?? asset.risk_score } : asset
      ));
    } catch (error) {
      console.error('Error updating asset:', error);
      toast.error('Errore nell\'aggiornamento');
      throw error;
    } finally {
      setSaving(false);
    }
  }, [organizationId]);

  const updateControlScore = useCallback(async (
    id: string, 
    controlId: string, 
    score: number | null
  ) => {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    const newControlScores = {
      ...asset.control_scores,
      [controlId]: score,
    };

    await updateAsset(id, { control_scores: newControlScores });
  }, [assets, updateAsset]);

  const deleteAsset = useCallback(async (id: string) => {
    if (!organizationId) return;
    try {
      setSaving(true);

      await riskAnalysisApi.delete(organizationId, id, groupId);

      setAssets(prev => prev.filter(a => a.id !== id));
      toast.success('Asset eliminato');
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error('Errore nell\'eliminazione');
    } finally {
      setSaving(false);
    }
  }, [organizationId]);

  const deleteAssetAllSources = useCallback(async (assetName: string) => {
    if (!organizationId) return;
    try {
      setSaving(true);

      const matching = assets.filter(a => a.asset_name === assetName);
      for (const a of matching) {
        await riskAnalysisApi.delete(organizationId, a.id, groupId);
      }

      setAssets(prev => prev.filter(a => a.asset_name !== assetName));
      toast.success(`Asset "${assetName}" eliminato con tutte le fonti`);
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error('Errore nell\'eliminazione');
    } finally {
      setSaving(false);
    }
  }, [organizationId, assets]);

  // Get unique asset names with their summary
  const getAssetSummaries = useCallback((): AssetSummary[] => {
    const assetMap = new Map<string, RiskAnalysisAsset[]>();
    
    for (const asset of assets) {
      const existing = assetMap.get(asset.asset_name) || [];
      existing.push(asset);
      assetMap.set(asset.asset_name, existing);
    }

    return Array.from(assetMap.entries()).map(([assetName, assetList]) => {
      const sources = assetList.map(a => a.threat_source);
      
      // Calculate average completeness across all sources
      const completenessValues = assetList.map(a => {
        const scoredControls = Object.values(a.control_scores).filter(v => typeof v === 'number');
        return (scoredControls.length / SECURITY_CONTROLS.length) * 100;
      });
      const avgCompleteness = completenessValues.length > 0 
        ? completenessValues.reduce((a, b) => a + b, 0) / completenessValues.length 
        : 0;

      // Calculate average risk score
      const avgScore = assetList.length > 0
        ? assetList.reduce((sum, a) => sum + (a.risk_score || 0), 0) / assetList.length
        : 0;

      // Determine risk level
      let riskLevel: 'low' | 'medium' | 'high' = 'high';
      if (avgScore >= 71) riskLevel = 'low';
      else if (avgScore >= 41) riskLevel = 'medium';

      return {
        assetName,
        sources,
        completeness: Math.round(avgCompleteness),
        riskLevel,
        avgScore: Math.round(avgScore),
      };
    });
  }, [assets]);

  const getAssetByNameAndSource = useCallback((assetName: string, threatSource: ThreatSource) => {
    return assets.find(a => a.asset_name === assetName && a.threat_source === threatSource);
  }, [assets]);

  useEffect(() => {
    if (!clientLoading) {
      loadAssets();
    }
  }, [loadAssets, clientLoading, clientOrgId]);

  return {
    assets,
    loading,
    saving,
    organizationId,
    addAsset,
    updateAsset,
    updateControlScore,
    deleteAsset,
    deleteAssetAllSources,
    reloadAssets: loadAssets,
    getAssetSummaries,
    getAssetByNameAndSource,
    calculateRiskScore,
  };
};
