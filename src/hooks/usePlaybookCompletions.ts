import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Playbook, calculatePlaybookProgress } from '@/types/playbook';
 import { useClientOrganization } from '@/hooks/useClientOrganization';

export interface PlaybookCompletion {
  id: string;
  organization_id: string | null;
  user_id: string;
  playbook_id: string;
  playbook_title: string;
  playbook_category: string;
  playbook_severity: string;
  progress_percentage: number;
  data: Playbook;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UsePlaybookCompletionsReturn {
  completions: PlaybookCompletion[];
  isLoading: boolean;
  error: string | null;
  fetchCompletions: () => Promise<void>;
  upsertCompletion: (playbook: Playbook) => Promise<PlaybookCompletion | null>;
  deleteCompletion: (playbookId: string) => Promise<boolean>;
  getCompletion: (playbookId: string) => PlaybookCompletion | undefined;
}

export const usePlaybookCompletions = (): UsePlaybookCompletionsReturn => {
  const [completions, setCompletions] = useState<PlaybookCompletion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { organizationId: clientOrgId, isLoading: clientLoading } = useClientOrganization();

  const fetchCompletions = useCallback(async () => {
    if (clientLoading || !clientOrgId) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('playbook_completions')
        .select('*')
        .eq('organization_id', clientOrgId)
        .order('updated_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching completions:', fetchError);
        setError('Errore nel caricamento dei playbook');
        return;
      }

      // Parse JSONB data field
      const parsed = (data || []).map(item => ({
        ...item,
        data: item.data as unknown as Playbook
      }));

      setCompletions(parsed);
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('Errore imprevisto');
    } finally {
      setIsLoading(false);
    }
  }, [clientOrgId, clientLoading]);

  const upsertCompletion = useCallback(async (playbook: Playbook): Promise<PlaybookCompletion | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('User not authenticated');
        return null;
      }

      if (!clientOrgId) {
        console.error('No organization selected');
        return null;
      }

      const progress = calculatePlaybookProgress(playbook);
      const isComplete = progress.percentage === 100;
      const now = new Date().toISOString();

      // Check if record exists
      const { data: existing } = await supabase
        .from('playbook_completions')
        .select('id, started_at, completed_at')
        .eq('organization_id', clientOrgId)
        .eq('user_id', user.id)
        .eq('playbook_id', playbook.id)
        .maybeSingle();

      const completionData = {
        organization_id: clientOrgId,
        user_id: user.id,
        playbook_id: playbook.id,
        playbook_title: playbook.title,
        playbook_category: playbook.category,
        playbook_severity: playbook.severity as string,
        progress_percentage: progress.percentage,
        data: JSON.parse(JSON.stringify(playbook)),
        updated_at: now,
        // Only set completed_at once when first reaching 100%
        completed_at: isComplete && !existing?.completed_at ? now : existing?.completed_at || null,
        // Keep original started_at or set new one
        started_at: existing?.started_at || now,
      };

      let result;
      if (existing) {
        // Update existing record
        const { data, error } = await supabase
          .from('playbook_completions')
          .update(completionData)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from('playbook_completions')
          .insert(completionData)
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      // Update local state
      setCompletions(prev => {
        const idx = prev.findIndex(c => c.playbook_id === playbook.id);
        const parsed = { ...result, data: result.data as Playbook };
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = parsed;
          return updated;
        }
        return [parsed, ...prev];
      });

      return { ...result, data: result.data as Playbook };
    } catch (err) {
      console.error('Error upserting completion:', err);
      return null;
    }
  }, [clientOrgId]);

  const deleteCompletion = useCallback(async (playbookId: string): Promise<boolean> => {
    try {
      if (!clientOrgId) return false;

      const { error } = await supabase
        .from('playbook_completions')
        .delete()
        .eq('organization_id', clientOrgId)
        .eq('playbook_id', playbookId);

      if (error) throw error;

      setCompletions(prev => prev.filter(c => c.playbook_id !== playbookId));
      return true;
    } catch (err) {
      console.error('Error deleting completion:', err);
      return false;
    }
  }, [clientOrgId]);

  const getCompletion = useCallback((playbookId: string): PlaybookCompletion | undefined => {
    return completions.find(c => c.playbook_id === playbookId);
  }, [completions]);

  // Initial fetch
  useEffect(() => {
    if (!clientLoading && clientOrgId) {
      fetchCompletions();
    }
  }, [fetchCompletions, clientLoading, clientOrgId]);

  return {
    completions,
    isLoading,
    error,
    fetchCompletions,
    upsertCompletion,
    deleteCompletion,
    getCompletion,
  };
};

