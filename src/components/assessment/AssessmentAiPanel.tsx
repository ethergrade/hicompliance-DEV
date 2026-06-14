import React, { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { assessmentV2Api } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, CheckCircle, Clock, Loader2, XCircle, Pencil, Save, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { AssessmentSnapshotStatus, SnapshotJobStatus, OpenAiTextBlock } from '@/types/api';

interface Props {
  companyId: string;
  snapshotId: string;
  groupId?: string | null;
  openaiData?: unknown | null;
}

function parseBlocks(data: unknown): OpenAiTextBlock[] | null {
  if (!data) return null;
  if (Array.isArray(data)) return data as OpenAiTextBlock[];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed as OpenAiTextBlock[];
    } catch {
      return null;
    }
  }
  return null;
}

function extractText(data: unknown): string {
  const blocks = parseBlocks(data);
  return blocks?.[0]?.text?.value ?? '';
}

function rebuildBlocks(data: unknown, newText: string): OpenAiTextBlock[] {
  const blocks = parseBlocks(data);
  if (blocks && blocks.length > 0) {
    return blocks.map((block, i) =>
      i === 0 ? { ...block, text: { ...block.text, value: newText } } : block
    );
  }
  return [{ type: 'text', text: { value: newText, annotations: [] } }];
}

const JOB_LABELS: Record<string, string> = {
  shodan: 'SurfaceScan360',
  intelx: 'DarkRisk360',
  openai: 'Analisi assessment',
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: SnapshotJobStatus }> = ({ status }) => {
  switch (status) {
    case 'done':
      return <Badge className="bg-green-500/15 text-green-500 border-green-500/30 gap-1"><CheckCircle className="w-3 h-3" />Completato</Badge>;
    case 'running':
      return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 gap-1"><Loader2 className="w-3 h-3 animate-spin" />In corso</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 gap-1"><Clock className="w-3 h-3" />In attesa</Badge>;
    case 'failed':
      return <Badge className="bg-red-500/15 text-red-500 border-red-500/30 gap-1"><XCircle className="w-3 h-3" />Errore</Badge>;
  }
};

// ─── Markdown editor con preview ──────────────────────────────────────────────

const MarkdownEditor: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}> = ({ value, onChange, onSave, onCancel, saving }) => (
  <div className="space-y-3">
    <Tabs defaultValue="edit">
      <TabsList className="h-8">
        <TabsTrigger value="edit" className="text-xs px-3">Modifica</TabsTrigger>
        <TabsTrigger value="preview" className="text-xs px-3">Anteprima</TabsTrigger>
      </TabsList>

      <TabsContent value="edit" className="mt-2">
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={20}
          className="font-mono text-sm resize-y"
          placeholder="Testo Markdown…"
          autoFocus
        />
      </TabsContent>

      <TabsContent value="preview" className="mt-2">
        <div className="min-h-[480px] rounded-md border border-border bg-muted/30 px-4 py-3 overflow-y-auto prose prose-sm dark:prose-invert max-w-none">
          {value.trim() ? (
            <ReactMarkdown>{value}</ReactMarkdown>
          ) : (
            <p className="text-muted-foreground italic text-sm">Nessun contenuto da visualizzare.</p>
          )}
        </div>
      </TabsContent>
    </Tabs>

    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
        <X className="w-3.5 h-3.5 mr-1" />
        Annulla
      </Button>
      <Button size="sm" onClick={onSave} disabled={saving}>
        {saving
          ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          : <Save className="w-3.5 h-3.5 mr-1" />}
        Salva
      </Button>
    </div>
  </div>
);

// ─── Component principale ─────────────────────────────────────────────────────

export const AssessmentAiPanel: React.FC<Props> = ({ companyId, snapshotId, groupId, openaiData }) => {
  const currentAiText = extractText(openaiData);
  const [status, setStatus] = useState<AssessmentSnapshotStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const s = await assessmentV2Api.snapshotStatus(companyId, snapshotId, groupId);
      setStatus(s);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Errore nel caricamento dello stato');
    } finally {
      setLoadingStatus(false);
    }
  }, [companyId, snapshotId, groupId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleEdit = () => {
    setDraftText(currentAiText);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraftText('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await assessmentV2Api.updateSnapshotAiText(
        companyId,
        snapshotId,
        { openai_data: rebuildBlocks(openaiData, draftText) },
        groupId
      );
      toast.success('Testo aggiornato con successo');
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const canEdit = status?.openai === 'done';

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            Stato elaborazione — Snapshot {status?.snapshot_year ?? '…'}
          </CardTitle>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={fetchStatus} disabled={loadingStatus}>
            {loadingStatus
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            Aggiorna
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loadingStatus && !status ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Caricamento stato…
          </div>
        ) : status ? (
          <>
            {/* Status grid */}
            <div className="grid grid-cols-3 gap-3">
              {(['shodan', 'intelx', 'openai'] as const).map(job => (
                <div key={job} className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5">
                  <span className="text-xs font-medium text-muted-foreground">{JOB_LABELS[job]}</span>
                  <StatusBadge status={status[job]} />
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Ultimo aggiornamento: {new Date(status.updated_at).toLocaleString('it-IT')}
            </p>

            {/* Editor / preview testo AI */}
            {canEdit && (
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Analisi assessment</p>
                  {!editing && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleEdit}>
                      <Pencil className="w-3.5 h-3.5" />
                      Modifica
                    </Button>
                  )}
                </div>

                {editing ? (
                  <MarkdownEditor
                    value={draftText}
                    onChange={setDraftText}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    saving={saving}
                  />
                ) : (
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 max-h-96 overflow-y-auto prose prose-sm dark:prose-invert max-w-none">
                    {currentAiText?.trim() ? (
                      <ReactMarkdown>{currentAiText}</ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground italic text-sm">Nessun testo disponibile.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {!canEdit && (
              <p className="text-sm text-muted-foreground italic">
                Il testo sarà modificabile una volta completata l'analisi assessment.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Stato non disponibile.</p>
        )}
      </CardContent>
    </Card>
  );
};
