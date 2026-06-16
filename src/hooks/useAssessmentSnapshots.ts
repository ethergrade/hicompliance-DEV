import { useState, useEffect, useCallback } from 'react';
import { assessmentV2Api } from '@/lib/api';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { toast } from 'sonner';
import type { AssessmentSnapshot as ApiAssessmentSnapshot } from '@/types/api';

export interface CategorySnapshot {
  name: string;
  score: number;
  answered: number;
  total: number;
}

export interface AssessmentSnapshot {
  id: string;
  organization_id: string;
  snapshot_year: number;
  category_scores: CategorySnapshot[];
  overall_score: number;
  total_answered: number;
  total_questions: number;
  created_at: string;
}

/** Map API snapshot (Record category_scores) to local shape (array category_scores) */
function toSnapshot(item: ApiAssessmentSnapshot, orgId: string): AssessmentSnapshot {
  return {
    id: item.id,
    organization_id: orgId,
    snapshot_year: item.snapshot_year,
    category_scores: item.category_scores
      ? Object.values(item.category_scores)
      : [],
    overall_score: item.overall_score,
    total_answered: item.total_answered,
    total_questions: item.total_questions,
    created_at: item.created_at,
  };
}

export const useAssessmentSnapshots = () => {
  const { organizationId: orgId, groupId } = useClientOrganization();

  const [snapshots, setSnapshots] = useState<AssessmentSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSnapshots = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const items = await assessmentV2Api.snapshots(orgId, groupId);
      setSnapshots((items || []).map(item => toSnapshot(item, orgId)));
    } catch (err) {
      console.error('Error loading snapshots:', err);
    } finally {
      setLoading(false);
    }
  }, [orgId, groupId]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  /** Trigger a snapshot recalculation on the backend (no manual data needed) */
  const saveSnapshot = useCallback(async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      await assessmentV2Api.createSnapshot(orgId, groupId);
      toast.success('Snapshot ricalcolato e salvato con successo');
      await loadSnapshots();
    } catch (err: any) {
      toast.error('Errore nel salvataggio dello snapshot');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [orgId, groupId, loadSnapshots]);

  return { snapshots, loading, saving, saveSnapshot };
};
