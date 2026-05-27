import { useState, useCallback, useEffect } from 'react';
import { playbookCompletionsApi } from '@/lib/api';
import type { PlaybookCompletion as ApiPlaybookCompletion } from '@/types/api';
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

/** Map API PlaybookCompletion to the hook's local shape */
function toLocalCompletion(item: ApiPlaybookCompletion, orgId: string): PlaybookCompletion {
  return {
    id: item.id,
    organization_id: orgId,
    user_id: '', // Backend manages user via auth token — not returned in response
    playbook_id: item.playbook_id,
    playbook_title: item.playbook_title ?? '',
    playbook_category: item.playbook_category ?? '',
    playbook_severity: item.playbook_severity ?? '',
    progress_percentage: item.progress_percentage ?? 0,
    data: (item.data as unknown as Playbook) ?? ({} as Playbook),
    started_at: item.started_at ?? '',
    completed_at: item.completed_at ?? null,
    created_at: item.created_at ?? '',
    updated_at: item.updated_at ?? '',
  };
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
      const items = await playbookCompletionsApi.list(clientOrgId);
      const parsed = (items || []).map(item => toLocalCompletion(item, clientOrgId));
      setCompletions(parsed);
    } catch (err) {
      console.error('Error fetching completions:', err);
      setError('Errore nel caricamento dei playbook');
    } finally {
      setIsLoading(false);
    }
  }, [clientOrgId, clientLoading]);

  const upsertCompletion = useCallback(async (playbook: Playbook): Promise<PlaybookCompletion | null> => {
    try {
      if (!clientOrgId) {
        console.error('No organization selected');
        return null;
      }

      const progress = calculatePlaybookProgress(playbook);
      const isComplete = progress.percentage === 100;
      const now = new Date().toISOString();

      // Find existing completion for this playbook
      const existing = completions.find(c => c.playbook_id === playbook.id);

      const payload = {
        playbook_id: playbook.id,
        playbook_title: playbook.title,
        playbook_category: playbook.category,
        playbook_severity: playbook.severity as string,
        progress_percentage: progress.percentage,
        data: JSON.parse(JSON.stringify(playbook)) as Record<string, unknown>,
        started_at: existing?.started_at || now,
        completed_at: isComplete && !existing?.completed_at ? now : existing?.completed_at || null,
      };

      let result: ApiPlaybookCompletion;
      if (existing) {
        result = await playbookCompletionsApi.update(clientOrgId, existing.id, payload);
      } else {
        result = await playbookCompletionsApi.create(clientOrgId, payload);
      }

      const localResult = toLocalCompletion(result, clientOrgId);

      // Update local state
      setCompletions(prev => {
        const idx = prev.findIndex(c => c.playbook_id === playbook.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = localResult;
          return updated;
        }
        return [localResult, ...prev];
      });

      return localResult;
    } catch (err) {
      console.error('Error upserting completion:', err);
      return null;
    }
  }, [clientOrgId, completions]);

  const deleteCompletion = useCallback(async (playbookId: string): Promise<boolean> => {
    try {
      if (!clientOrgId) return false;

      const existing = completions.find(c => c.playbook_id === playbookId);
      if (!existing) {
        // Already gone from state — silently succeed
        return true;
      }

      await playbookCompletionsApi.delete(clientOrgId, existing.id);
      setCompletions(prev => prev.filter(c => c.playbook_id !== playbookId));
      return true;
    } catch (err) {
      console.error('Error deleting completion:', err);
      return false;
    }
  }, [clientOrgId, completions]);

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
