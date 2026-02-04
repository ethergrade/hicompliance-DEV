import { useState, useEffect, useRef, useCallback } from 'react';
import { Playbook, calculatePlaybookProgress } from '@/types/playbook';
import { supabase } from '@/integrations/supabase/client';
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
const autoSaveDocxToDocuments = async (playbook: Playbook): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!userData) return false;

    // Generate DOCX blob
    const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ImageRun } = await import('docx');
    
    // Use existing generator but get the blob instead of saving
    const progress = calculatePlaybookProgress(playbook);
    const currentDate = new Date().toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Create a simplified DOCX for auto-save
    const children: (typeof Paragraph | typeof Table)[] = [];
    
    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: [
          new Paragraph({
            children: [new TextRun({ text: `PLAYBOOK: ${playbook.title}`, bold: true, size: 36, color: '1e3a5f' })],
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ 
              text: `Categoria: ${playbook.category} | Severity: ${playbook.severity} | Durata: ${playbook.duration}`,
              size: 22, color: '6b7280' 
            })],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ 
              text: `Completato il: ${currentDate} | Progresso: ${progress.percentage}%`,
              size: 20, color: '16a34a' 
            })],
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Documento generato automaticamente al completamento del playbook', size: 18, color: '9ca3af', italics: true })],
            alignment: AlignmentType.CENTER,
          }),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    
    // Create filename with date
    const dateStr = new Date().toISOString().split('T')[0];
    const sanitizedTitle = playbook.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const fileName = `Playbook_${sanitizedTitle}_${dateStr}.docx`;
    const filePath = `${user.id}/${Date.now()}_${fileName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('incident-documents')
      .upload(filePath, blob);

    if (uploadError) {
      console.error('Auto-save upload error:', uploadError);
      return false;
    }

    // Save to database
    const { error: dbError } = await supabase
      .from('incident_documents')
      .insert({
        name: fileName,
        file_path: filePath,
        file_size: blob.size,
        file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        category: 'Checklist / OPL / SOP',
        uploaded_by: userData.id
      });

    if (dbError) {
      console.error('Auto-save DB error:', dbError);
      await supabase.storage.from('incident-documents').remove([filePath]);
      return false;
    }

    console.log('Playbook auto-saved to documents:', fileName);
    return true;
  } catch (error) {
    console.error('Auto-save error:', error);
    return false;
  }
};

// Sync playbook to Supabase
const syncToDatabase = async (playbook: Playbook): Promise<{ isNewCompletion: boolean }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { isNewCompletion: false };

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('auth_user_id', user.id)
      .single();

    if (!userData?.organization_id) return { isNewCompletion: false };

    const progress = calculatePlaybookProgress(playbook);
    const isComplete = progress.percentage === 100;
    const now = new Date().toISOString();

    // Check if record exists
    const { data: existing } = await supabase
      .from('playbook_completions')
      .select('id, started_at, completed_at')
      .eq('organization_id', userData.organization_id)
      .eq('user_id', user.id)
      .eq('playbook_id', playbook.id)
      .maybeSingle();

    // Determine if this is a new completion (first time reaching 100%)
    const isNewCompletion = isComplete && !existing?.completed_at;

    const completionData = {
      organization_id: userData.organization_id,
      user_id: user.id,
      playbook_id: playbook.id,
      playbook_title: playbook.title,
      playbook_category: playbook.category,
      playbook_severity: playbook.severity as string,
      progress_percentage: progress.percentage,
      data: JSON.parse(JSON.stringify(playbook)),
      updated_at: now,
      completed_at: isNewCompletion ? now : existing?.completed_at || null,
      started_at: existing?.started_at || now,
    };

    if (existing) {
      await supabase
        .from('playbook_completions')
        .update(completionData)
        .eq('id', existing.id);
    } else {
      await supabase
        .from('playbook_completions')
        .insert(completionData);
    }

    return { isNewCompletion };
  } catch (error) {
    console.error('Sync error:', error);
    return { isNewCompletion: false };
  }
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
