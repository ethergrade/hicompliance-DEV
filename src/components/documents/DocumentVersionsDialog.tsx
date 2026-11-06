import React, { useCallback, useEffect, useRef, useState } from 'react';
import { History, Upload, Download, Loader2, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { documentsApi } from '@/lib/api/documents';
import { formatDocumentCodeWithRevision } from './DocumentCodeGenerator';

/**
 * Storico versioni + workflow di stato di un documento.
 * incident_documents resta la versione corrente; document_versions contiene
 * tutte le revisioni scaricabili. Transizioni guidate: Bozza → In Revisione
 * → Approvato (→ Obsoleto); da Approvato si torna indietro solo con una nuova revisione.
 */

const STATUS_COLORS: Record<string, string> = {
  Bozza: 'text-yellow-600 border-yellow-500/30',
  'In Revisione': 'text-blue-600 border-blue-500/30',
  Approvato: 'text-green-600 border-green-500/30',
  Obsoleto: 'text-muted-foreground border-muted',
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Bozza: ['In Revisione'],
  'In Revisione': ['Approvato', 'Bozza'],
  Approvato: ['Obsoleto'],
  Obsoleto: [],
};

interface VersionRow {
  id: string;
  revision: number;
  status: string | null;
  notes: string | null;
  file_path: string | null;
  created_at: string;
}

interface DocumentVersionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: any | null;
  organizationId: string;
  onChanged: () => void;
}

export function DocumentVersionsDialog({ open, onOpenChange, document: doc, organizationId, onChanged }: DocumentVersionsDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const loadVersions = useCallback(async () => {
    if (!doc) return;
    setLoading(true);
    try {
      const rows = await documentsApi.listVersions(doc.id);
      setVersions(rows as VersionRow[]);
    } catch (e: any) {
      toast.error('Errore nel caricamento dello storico', { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [doc]);

  useEffect(() => {
    if (open && doc) {
      setNotes('');
      setSelectedFile(null);
      void loadVersions();
    }
  }, [open, doc, loadVersions]);

  if (!doc) return null;

  const transitions = ALLOWED_TRANSITIONS[doc.status] ?? [];
  const canRevise = !!doc.file_path;

  const handleTransition = async (next: string) => {
    setWorking(true);
    try {
      await documentsApi.setStatus(organizationId, doc.id, next);
      toast.success(`Stato aggiornato: ${next}`);
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Transizione non riuscita', { description: e?.message });
    } finally {
      setWorking(false);
    }
  };

  const handleNewRevision = async () => {
    if (!selectedFile || !notes.trim()) {
      toast.error('Servono file e nota di revisione', { description: 'La nota ("cosa è cambiato") è obbligatoria.' });
      return;
    }
    setWorking(true);
    try {
      await documentsApi.createRevision(organizationId, doc.id, selectedFile, selectedFile.name, notes);
      toast.success(`Rev${String(doc.revision + 1).padStart(2, '0')} creata`, { description: 'Il documento è tornato in stato Bozza.' });
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Errore nella creazione della revisione', { description: e?.message });
    } finally {
      setWorking(false);
    }
  };

  const handleDownloadVersion = async (v: VersionRow) => {
    try {
      const blob = await documentsApi.downloadVersion(v.id);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${doc.document_code || 'doc'}_Rev${String(v.revision).padStart(2, '0')}_${doc.name}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error('Download non riuscito', { description: e?.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Versioni e stato
          </DialogTitle>
          <DialogDescription>
            {doc.name} · {doc.document_code ? formatDocumentCodeWithRevision(doc.document_code, doc.revision) : 'senza codice'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Workflow di stato */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Stato attuale:</span>
            <Badge variant="outline" className={STATUS_COLORS[doc.status] || ''}>{doc.status}</Badge>
            {transitions.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">→</span>
                {transitions.map((t) => (
                  <Button key={t} size="sm" variant="outline" disabled={working} onClick={() => void handleTransition(t)}>
                    {t}
                  </Button>
                ))}
              </div>
            )}
            {doc.status === 'Approvato' && (
              <span className="text-xs text-muted-foreground">Per modificare un documento approvato carica una nuova revisione.</span>
            )}
          </div>

          {/* Nuova revisione */}
          {canRevise && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
              <Label className="text-sm font-medium">Carica nuova revisione (Rev{String(doc.revision + 1).padStart(2, '0')})</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" />
                  {selectedFile ? selectedFile.name : 'Scegli file'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Nota di revisione obbligatoria: cosa è cambiato?"
                rows={2}
              />
              <div className="flex justify-end">
                <Button size="sm" disabled={working || !selectedFile || !notes.trim()} onClick={() => void handleNewRevision()}>
                  {working && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Crea Rev{String(doc.revision + 1).padStart(2, '0')}
                </Button>
              </div>
            </div>
          )}

          {/* Storico */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Storico versioni</Label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna versione nello storico. Lo storico parte dalla prossima revisione caricata.
              </p>
            ) : (
              <div className="border rounded-lg divide-y">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono font-medium">Rev{String(v.revision).padStart(2, '0')}</span>
                        {v.status && <Badge variant="outline" className={`text-xs ${STATUS_COLORS[v.status] || ''}`}>{v.status}</Badge>}
                        <span className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString('it-IT')}</span>
                        {v.revision === doc.revision && <Badge className="text-xs">corrente</Badge>}
                      </div>
                      {v.notes && <p className="text-xs text-muted-foreground mt-1 truncate" title={v.notes}>{v.notes}</p>}
                    </div>
                    {v.file_path && (
                      <Button size="sm" variant="ghost" onClick={() => void handleDownloadVersion(v)} title="Scarica questa revisione">
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
