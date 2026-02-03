import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  RiskAnalysisAsset, 
  RiskAnalysisInsert, 
  RiskAnalysisUpdate,
  ThreatSource,
  ControlScores,
  AssetSummary
} from '@/types/riskAnalysis';
import { SECURITY_CONTROLS } from '@/data/securityControls';

export const useRiskAnalysis = () => {
  const [assets, setAssets] = useState<RiskAnalysisAsset[]>([]);
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
        .from('risk_analysis')
        .select('*')
        .eq('organization_id', userData.organization_id)
        .order('asset_name')
        .order('threat_source');

      if (error) throw error;

      // Parse control_scores from JSON
      const parsedAssets = (data || []).map(asset => ({
        ...asset,
        control_scores: (asset.control_scores || {}) as ControlScores,
      })) as RiskAnalysisAsset[];

      setAssets(parsedAssets);
    } catch (error) {
      console.error('Error loading risk analysis:', error);
      toast.error('Errore nel caricamento dell\'analisi rischi');
    } finally {
      setLoading(false);
    }
  }, []);

  const calculateRiskScore = (controlScores: ControlScores): number => {
    const values = Object.values(controlScores).filter((v): v is number => typeof v === 'number');
    if (values.length === 0) return 0;
    
    const sum = values.reduce((acc, val) => acc + val, 0);
    const maxPossible = values.length * 3;
    return Math.round((sum / maxPossible) * 100);
  };

  const addAsset = useCallback(async (assetName: string, threatSource: ThreatSource) => {
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
      const { data: user } = await supabase.auth.getUser();

      const newAsset: RiskAnalysisInsert = {
        organization_id: organizationId,
        asset_name: assetName,
        threat_source: threatSource,
        control_scores: {},
        risk_score: 0,
        created_by: user.user?.id || null,
      };

      const { data, error } = await supabase
        .from('risk_analysis')
        .insert(newAsset)
        .select()
        .single();

      if (error) throw error;

      const insertedAsset = {
        ...data,
        control_scores: (data.control_scores || {}) as ControlScores,
      } as RiskAnalysisAsset;
      
      setAssets(prev => [...prev, insertedAsset]);
      toast.success(`Asset "${assetName}" aggiunto`);
      return insertedAsset;
    } catch (error) {
      console.error('Error adding asset:', error);
      toast.error('Errore nella creazione dell\'asset');
      return null;
    } finally {
      setSaving(false);
    }
  }, [organizationId, assets]);

  const updateAsset = useCallback(async (id: string, updates: RiskAnalysisUpdate) => {
    try {
      setSaving(true);

      // If updating control_scores, recalculate risk_score
      let finalUpdates = { ...updates };
      if (updates.control_scores) {
        finalUpdates.risk_score = calculateRiskScore(updates.control_scores);
      }

      const { error } = await supabase
        .from('risk_analysis')
        .update(finalUpdates)
        .eq('id', id);

      if (error) throw error;

      setAssets(prev => prev.map(asset => 
        asset.id === id ? { ...asset, ...finalUpdates } : asset
      ));
    } catch (error) {
      console.error('Error updating asset:', error);
      toast.error('Errore nell\'aggiornamento');
      throw error;
    } finally {
      setSaving(false);
    }
  }, []);

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
    try {
      setSaving(true);
      const asset = assets.find(a => a.id === id);

      const { error } = await supabase
        .from('risk_analysis')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setAssets(prev => prev.filter(a => a.id !== id));
      toast.success(`Asset eliminato`);
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error('Errore nell\'eliminazione');
    } finally {
      setSaving(false);
    }
  }, [assets]);

  const deleteAssetAllSources = useCallback(async (assetName: string) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('risk_analysis')
        .delete()
        .eq('organization_id', organizationId)
        .eq('asset_name', assetName);

      if (error) throw error;

      setAssets(prev => prev.filter(a => a.asset_name !== assetName));
      toast.success(`Asset "${assetName}" eliminato con tutte le fonti`);
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error('Errore nell\'eliminazione');
    } finally {
      setSaving(false);
    }
  }, [organizationId]);

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
    loadAssets();
  }, [loadAssets]);

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
