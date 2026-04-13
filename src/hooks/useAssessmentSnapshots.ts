import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useClientContext } from '@/contexts/ClientContext';
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
  category_scores: CategorySnapshot[];
  overall_score: number;
  total_answered: number;
  total_questions: number;
  created_at: string;
}

export const useAssessmentSnapshots = () => {
  const { user } = useAuth();
  const { selectedOrganization, userOrganizationId } = useClientContext();
  const orgId = selectedOrganization?.id || userOrganizationId;

  const [snapshots, setSnapshots] = useState<AssessmentSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSnapshots = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('assessment_snapshots')
        .select('*')
        .eq('organization_id', orgId)
        .order('snapshot_year', { ascending: false });

      if (error) throw error;
      setSnapshots(
        (data || []).map((row: any) => ({
          ...row,
          category_scores: Array.isArray(row.category_scores) ? row.category_scores : [],
        }))
      );
    } catch (err) {
      console.error('Error loading snapshots:', err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const saveSnapshot = useCallback(
    async (
      year: number,
      categoryData: { name: string; score: number; answered: number; total: number }[],
      overallScore: number,
      totalAnswered: number,
      totalQuestions: number
    ) => {
      if (!orgId || !user) return;
      setSaving(true);
      try {
        const { error } = await supabase
          .from('assessment_snapshots')
          .upsert(
            {
              organization_id: orgId,
              snapshot_year: year,
              category_scores: categoryData as any,
              overall_score: overallScore,
              total_answered: totalAnswered,
              total_questions: totalQuestions,
              created_by: user.id,
            },
            { onConflict: 'organization_id,snapshot_year' }
          );
        if (error) throw error;
        toast.success(`Snapshot ${year} salvato con successo`);
        await loadSnapshots();
      } catch (err: any) {
        toast.error('Errore nel salvataggio dello snapshot');
        console.error(err);
      } finally {
        setSaving(false);
      }
    },
    [orgId, user, loadSnapshots]
  );

  return { snapshots, loading, saving, saveSnapshot };
};
