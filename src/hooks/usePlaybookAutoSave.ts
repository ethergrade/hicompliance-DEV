import { useState, useEffect, useRef, useCallback } from 'react';
import { Playbook } from '@/types/playbook';

export type SaveStatus = 'idle' | 'saving' | 'saved';

interface UsePlaybookAutoSaveReturn {
  saveStatus: SaveStatus;
  lastSaved: Date | null;
  triggerSave: (playbook: Playbook) => void;
  resetSaveState: () => void;
}

export const usePlaybookAutoSave = (): UsePlaybookAutoSaveReturn => {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const triggerSave = useCallback((playbook: Playbook) => {
    // Skip save on first render (initial load)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Clear existing timer
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSaveStatus('saving');

    // Debounce: save after 500ms of no changes
    saveTimeoutRef.current = setTimeout(() => {
      const storageKey = `playbook_progress_${playbook.id}`;
      localStorage.setItem(storageKey, JSON.stringify(playbook));
      setSaveStatus('saved');
      setLastSaved(new Date());
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
