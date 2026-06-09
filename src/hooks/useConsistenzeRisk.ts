import { useState, useCallback } from 'react';
import { assetIrpApi } from '@/lib/api/asset-irp';
import { irpApi } from '@/lib/api/irp';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import type { ConsistenzeItem, ConsistenzeArea, AssetIRP } from '@/types/consistenze';
import { AREA_WEIGHTS } from '@/types/consistenze';

// Default risk scores by category
const CATEGORY_RISK_DEFAULTS: Record<string, { esposizione: number; criticita: number; superficie: number }> = {
  'Firewall': { esposizione: 4, criticita: 5, superficie: 2 },
  'EDR': { esposizione: 3, criticita: 4, superficie: 2 },
  'SIEM': { esposizione: 2, criticita: 4, superficie: 1 },
  'MDR': { esposizione: 3, criticita: 4, superficie: 1 },
  'Email Security': { esposizione: 4, criticita: 3, superficie: 2 },
  'Backup': { esposizione: 2, criticita: 5, superficie: 1 },
  'Server': { esposizione: 3, criticita: 5, superficie: 2 },
  'PC': { esposizione: 2, criticita: 2, superficie: 3 },
  'Notebook': { esposizione: 3, criticita: 2, superficie: 3 },
  'Hypervisor': { esposizione: 2, criticita: 5, superficie: 1 },
  'Switch centro stella': { esposizione: 2, criticita: 5, superficie: 1 },
  'Access Point': { esposizione: 3, criticita: 3, superficie: 2 },
  'Router': { esposizione: 3, criticita: 4, superficie: 1 },
  'Centralino': { esposizione: 2, criticita: 3, superficie: 1 },
  'SIP Trunk': { esposizione: 3, criticita: 3, superficie: 1 },
};

const DEFAULT_RISK = { esposizione: 2, criticita: 2, superficie: 1 };

function calcRiskIntrinseco(esp: number, crit: number, sup: number): number {
  return Math.min((esp * crit * sup) * 4, 100);
}

function toAssetIRP(api: { id: string; consistenza_item_id: string | null; area: string | null; categoria: string | null; tecnologia: string | null; fornitore: string | null; quantita: number | null; esposizione_score: number | null; criticita_score: number | null; superficie_score: number | null; rischio_intrinseco: string | null; rischio_residuo: string | null }): AssetIRP {
  return {
    id: api.id,
    organization_id: '', // filled by caller context
    consistenza_item_id: api.consistenza_item_id,
    area: api.area ?? '',
    categoria: api.categoria ?? '',
    tecnologia: api.tecnologia ?? '',
    fornitore: api.fornitore ?? '',
    quantita: api.quantita ?? 0,
    esposizione_score: api.esposizione_score ?? 0,
    criticita_score: api.criticita_score ?? 0,
    superficie_score: api.superficie_score ?? 0,
    rischio_intrinseco: Number(api.rischio_intrinseco) || 0,
    rischio_residuo: Number(api.rischio_residuo) || 0,
  };
}

export function useConsistenzeRisk() {
  const { organizationId, groupId } = useClientOrganization();
  const [irpAssets, setIrpAssets] = useState<AssetIRP[]>([]);
  const [loading, setLoading] = useState(false);

  const loadIRPAssets = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const items = await assetIrpApi.list(organizationId, groupId);
      const mapped = items.map(toAssetIRP);
      setIrpAssets(mapped);
    } catch (err) {
      console.error('Error loading IRP assets:', err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, groupId]);

  const syncItemToIRP = useCallback(async (item: ConsistenzeItem) => {
    if (!organizationId || !item.id) return;
    
    const defaults = CATEGORY_RISK_DEFAULTS[item.categoria] || DEFAULT_RISK;
    const rischio_intrinseco = calcRiskIntrinseco(defaults.esposizione, defaults.criticita, defaults.superficie);

    const payload = {
      consistenza_item_id: item.id,
      area: item.area,
      categoria: item.categoria,
      tecnologia: item.tecnologia,
      fornitore: item.fornitore,
      quantita: item.quantita,
      esposizione_score: defaults.esposizione,
      criticita_score: defaults.criticita,
      superficie_score: defaults.superficie,
      rischio_intrinseco: String(rischio_intrinseco),
      rischio_residuo: String(rischio_intrinseco), // will be adjusted when maturity is available
      last_sync_from_consistenze: new Date().toISOString(),
    };

    try {
      // Upsert by consistenza_item_id
      const existing = irpAssets.find(a => a.consistenza_item_id === item.id);
      if (existing?.id) {
        await assetIrpApi.update(organizationId, existing.id, payload as any, groupId);
      } else {
        await assetIrpApi.create(organizationId, payload as any, groupId);
      }
      await loadIRPAssets();
    } catch (err) {
      console.error('Error syncing to IRP:', err);
    }
  }, [organizationId, irpAssets, loadIRPAssets, groupId]);

  const calcAreaScore = useCallback((area: ConsistenzeArea): number => {
    const areaAssets = irpAssets.filter(a => a.area === area);
    if (areaAssets.length === 0) return 0;
    const sum = areaAssets.reduce((acc, a) => acc + (a.rischio_residuo || 0), 0);
    return Math.round(sum / areaAssets.length);
  }, [irpAssets]);

  const calcTotalIRP = useCallback((): number => {
    const areas: ConsistenzeArea[] = ['UCC', 'SECURITY', 'CONN_FONIA', 'NETWORKING', 'IT'];
    let totalScore = 0;
    let totalWeight = 0;

    for (const area of areas) {
      const score = calcAreaScore(area);
      if (score > 0) {
        totalScore += score * AREA_WEIGHTS[area];
        totalWeight += AREA_WEIGHTS[area];
      }
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }, [calcAreaScore]);

  const saveSnapshot = useCallback(async () => {
    if (!organizationId) return;
    const areas: ConsistenzeArea[] = ['UCC', 'SECURITY', 'CONN_FONIA', 'NETWORKING', 'IT'];
    const areaScores: Record<string, number> = {};
    for (const area of areas) {
      areaScores[area] = calcAreaScore(area);
    }

    try {
      await irpApi.saveHistory(organizationId, {
        irp_score: calcTotalIRP(),
        area_scores_json: areaScores,
      }, groupId);
    } catch (err) {
      console.error('Error saving IRP snapshot:', err);
    }
  }, [organizationId, calcAreaScore, calcTotalIRP, groupId]);

  return {
    irpAssets,
    loading,
    loadIRPAssets,
    syncItemToIRP,
    calcAreaScore,
    calcTotalIRP,
    saveSnapshot,
  };
}
