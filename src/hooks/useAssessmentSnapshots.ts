import { useState, useEffect, useCallback } from 'react';
import { assessmentV2Api } from '@/lib/api';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { toast } from 'sonner';

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
  label: string | null;
  snapshot_date: string;
  category_scores: CategorySnapshot[];
  overall_score: number;
  total_answered: number;
  total_questions: number;
  created_at: string;
}

export interface NewSnapshotInput {
  label?: string;
  year: number;
  overall_score: number;
  total_answered: number;
  total_questions: number;
  categories: CategorySnapshot[];
}

/** Il backend chiama la categoria `category_name`; qui si normalizza a `name`. */
function toSnapshot(item: any, orgId: string): AssessmentSnapshot {
  return {
    id: item.id,
    organization_id: orgId,
    snapshot_year: item.snapshot_year,
    label: item.label ?? null,
    snapshot_date: item.snapshot_date ?? item.created_at,
    category_scores: item.category_scores
      ? Object.values(item.category_scores as Record<string, any>).map((c: any) => ({
          name: c.category_name ?? c.name ?? '',
          score: c.score ?? 0,
          answered: c.answered ?? 0,
          total: c.total ?? 0,
        }))
      : [],
    overall_score: item.overall_score,
    total_answered: item.total_answered,
    total_questions: item.total_questions,
    created_at: item.created_at,
  };
}

export const snapshotTitle = (s: AssessmentSnapshot) =>
  s.label ? `${s.snapshot_year} · ${s.label}` : String(s.snapshot_year);

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

  const saveSnapshot = useCallback(async (input: NewSnapshotInput) => {
    if (!orgId) return null;
    setSaving(true);
    try {
      const created = await assessmentV2Api.createSnapshot(orgId, input);
      toast.success('Snapshot salvato');
      await loadSnapshots();
      return created;
    } catch (err) {
      toast.error('Errore nel salvataggio dello snapshot');
      console.error(err);
      return null;
    } finally {
      setSaving(false);
    }
  }, [orgId, loadSnapshots]);

  const deleteSnapshot = useCallback(async (id: string) => {
    try {
      await assessmentV2Api.deleteSnapshot(id);
      toast.success('Snapshot eliminato');
      await loadSnapshots();
    } catch (err) {
      toast.error('Impossibile eliminare lo snapshot (permessi insufficienti)');
      console.error(err);
    }
  }, [loadSnapshots]);

  return { snapshots, loading, saving, saveSnapshot, deleteSnapshot };
};
