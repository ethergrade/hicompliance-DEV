import { useState, useEffect, useRef, useCallback } from 'react';
import { Playbook, calculatePlaybookProgress } from '@/types/playbook';
import { savePlaybookWithVersion } from '@/lib/playbookMigration';
import { Packer } from 'docx';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'syncing';

interface UsePlaybookAutoSaveReturn {
  saveStatus: SaveStatus;
  lastSaved: Date | null;
  triggerSave: (playbook: Playbook) => void;
  resetSaveState: () => void;
}

// Auto-save DOCX to documents when playbook reaches 100%
// TODO: migrate to backend API (stub)
const autoSaveDocxToDocuments = async (_playbook: Playbook): Promise<boolean> => {
  console.warn('[migrate-stub] autoSaveDocxToDocuments disabled');
  return false;
};


// TODO: migrate to backend API (stub)
const syncToDatabase = async (_playbook: Playbook): Promise<{ isNewCompletion: boolean }> => {
  console.warn('[migrate-stub] syncToDatabase disabled');
  return { isNewCompletion: false };
};


export const usePlaybookAutoSave = (): UsePlaybookAutoSaveReturn => {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const lastSyncedProgressRef = useRef<number>(0);
  const hasAutoSavedDocxRef = useRef<Set<string>>(new Set());

  const triggerSave = useCallback((playbook: Playbook) => {
    // Skip save on first render (initial load)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Clear existing timers
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    setSaveStatus('saving');

    // Debounce: save to localStorage after 500ms (with version tag)
    saveTimeoutRef.current = setTimeout(() => {
      savePlaybookWithVersion(playbook.id, playbook);
      setSaveStatus('saved');
      setLastSaved(new Date());

      // Sync to database after 1 second (avoid too many DB calls)
      syncTimeoutRef.current = setTimeout(async () => {
        setSaveStatus('syncing');
        const { isNewCompletion } = await syncToDatabase(playbook);
        
        // Auto-save DOCX when first reaching 100%
        const progress = calculatePlaybookProgress(playbook);
        if (isNewCompletion && progress.percentage === 100 && !hasAutoSavedDocxRef.current.has(playbook.id)) {
          hasAutoSavedDocxRef.current.add(playbook.id);
          await autoSaveDocxToDocuments(playbook);
        }
        
        setSaveStatus('saved');
      }, 1000);
    }, 500);
  }, []);

  const resetSaveState = useCallback(() => {
    setSaveStatus('idle');
    setLastSaved(null);
    isFirstRender.current = true;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  return { saveStatus, lastSaved, triggerSave, resetSaveState };
};

// Helper to format relative time in Italian
export const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 5) return 'adesso';
  if (diffInSeconds < 60) return `${diffInSeconds} sec fa`;
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} min fa`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} ${diffInHours === 1 ? 'ora' : 'ore'} fa`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} ${diffInDays === 1 ? 'giorno' : 'giorni'} fa`;
};
