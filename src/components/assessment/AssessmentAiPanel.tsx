import React, { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { assessmentV2Api } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bot, CheckCircle, Clock, Loader2, XCircle, RefreshCw, Send, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { useUserRoles } from '@/hooks/useUserRoles';
import { AnalysisEditor } from '@/components/assessment/AnalysisEditor';
import type {
  AnalysisState,
  AnalysisViolation,
  AssessmentAnalysis,
  AssessmentSnapshotStatus,
  ReprocessTarget,
  SnapshotJobStatus,
} from '@/types/api';

interface Props {
  companyId: string;
  snapshotId: string;
  groupId?: string | null;
  /** L'analisi strutturata dello snapshot. Assente sugli snapshot mai rielaborati. */
  analysis?: AssessmentAnalysis | null;
  analysisState?: AnalysisState;
  analysisViolations?: AnalysisViolation[] | null;
  /** Markdown del vecchio flusso, solo per lo storico. */
  openaiData?: unknown | null;
  /**
   * Ricarica lo snapshot nel padre dopo un salvataggio.
   *
   * `openaiData` arriva da lì ed è caricato una volta sola: senza questo, dopo
   * aver salvato il pannello continua a mostrare il testo vecchio — e la
   * modifica successiva ripartirebbe da quello, non da ciò che è sul server.
   */
  onSaved?: () => void | Promise<void>;
}

function parseArray(data: unknown): unknown[] | null {
  if (!data) return null;
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    } catch { return null; }
  }
  return null;
}

function extractText(data: unknown): string {
  const arr = parseArray(data);
  if (!arr || arr.length === 0) return '';

  const first = arr[0] as Record<string, unknown>;

  // Formato thread message OpenAI: [{ content: [{ type: 'text', text: { value } }] }]
  const content = first?.content;
  if (Array.isArray(content) && content.length > 0) {
    const block = content[0] as Record<string, unknown>;
    const text = block?.text as Record<string, unknown> | undefined;
    if (typeof text?.value === 'string') return text.value;
  }

  // Formato semplice: [{ type: 'text', text: { value } }]
  const text = first?.text as Record<string, unknown> | undefined;
  if (typeof text?.value === 'string') return text.value;

  return '';
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


// ─── Component principale ─────────────────────────────────────────────────────

export const AssessmentAiPanel: React.FC<Props> = ({
  companyId,
  snapshotId,
  groupId,
  analysis,
  analysisState,
  analysisViolations,
  openaiData,
  onSaved,
}) => {
  const legacyText = extractText(openaiData);
  const [status, setStatus] = useState<AssessmentSnapshotStatus | null>(null);
  const { isSuperAdmin, hasRole } = useUserRoles();
  const [sending, setSending] = useState(false);
  const [reprocessingTarget, setReprocessingTarget] = useState<ReprocessTarget | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [saving, setSaving] = useState(false);
  const [violations, setViolations] = useState<AnalysisViolation[]>(analysisViolations ?? []);

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

  /**
   * Salva un singolo testo.
   *
   * Manda solo il campo modificato: rispedire la struttura intera significherebbe
   * rimandare anche punteggi ed evidenze, che l'allowlist del backend rifiuta.
   * Restituisce `true` se è andata, così l'editor sa se può chiudersi.
   */
  const handleSaveField = async (patch: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    try {
      const esito = await assessmentV2Api.updateSnapshotAnalysis(companyId, snapshotId, patch, groupId);
      setViolations(esito.violations ?? []);

      // Si ricarica prima di dichiarare fatto: a schermo resta ciò che il server ha
      // davvero salvato, non la bozza locale.
      await onSaved?.();

      toast.success(
        esito.violations?.length
          ? `Testo salvato. Restano ${esito.violations.length} rilievi da sistemare.`
          : 'Testo salvato.',
      );

      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Errore nel salvataggio');

      return false;
    } finally {
      setSaving(false);
    }
  };

  // ─── Snapshot status / reprocess logic ───────────────────────────────────

  const snapshotStatus = status?.status;
  const canSeeSendButton = hasRole('customer') || isSuperAdmin || hasRole('admin');
  const canSendBeEnabled = snapshotStatus === 0 || snapshotStatus === 2;
  const canSeeReprocessButton = isSuperAdmin || hasRole('admin');
  const canReprocessBeEnabled = snapshotStatus !== undefined && snapshotStatus !== 0;

  const handleSendForProcessing = async () => {
    setSending(true);
    try {
      await assessmentV2Api.updateSnapshotStatus(companyId, snapshotId, { status: 3 }, groupId);
      toast.success('Snapshot inviato per elaborazione');
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Errore nell\'invio per elaborazione');
    } finally {
      setSending(false);
    }
  };

  const handleReprocess = async (target: ReprocessTarget) => {
    setReprocessingTarget(target);
    try {
      await assessmentV2Api.reprocessSnapshot(companyId, { target }, groupId);
      toast.success(`Rielaborazione avviata (${target})`);
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Errore nella rielaborazione');
    } finally {
      setReprocessingTarget(null);
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

            {/* Azioni snapshot: Invia per elaborazione / Rielabora campo */}
            {(canSeeSendButton || canSeeReprocessButton) && (
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
                {canSeeSendButton && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={handleSendForProcessing}
                    disabled={!canSendBeEnabled || sending}
                  >
                    {sending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Send className="w-3.5 h-3.5" />}
                    Invia per elaborazione
                  </Button>
                )}

                {canSeeReprocessButton && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground mr-1">Rielabora:</span>
                    {([
                      { target: 'shodan', label: 'SurfaceScan360' },
                      { target: 'intelx', label: 'DarkRisk360' },
                      { target: 'openai', label: 'OpenAI' },
                      { target: 'all', label: 'Tutti' },
                    ] as const).map((item) => {
                      const isBusy = reprocessingTarget === item.target;
                      return (
                        <Button
                          key={item.target}
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => handleReprocess(item.target)}
                          disabled={!canReprocessBeEnabled || reprocessingTarget !== null}
                        >
                          {isBusy
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <RotateCw className="w-3.5 h-3.5" />}
                          {item.label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Analisi strutturata, un editor per ogni testo */}
            {analysis && (
              <div className="space-y-3 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Analisi assessment</p>
                  {analysisState === 'needs_review' && (
                    <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                      Da rivedere
                    </Badge>
                  )}
                </div>

                <AnalysisEditor
                  analysis={analysis}
                  violations={violations}
                  canEdit={canEdit}
                  saving={saving}
                  onSave={handleSaveField}
                />
              </div>
            )}

            {/* Storico: gli snapshot mai rielaborati hanno ancora il markdown del
                vecchio flusso. Si leggono, non si modificano — la correzione per
                campo esiste solo sulla struttura nuova. */}
            {!analysis && legacyText.trim() && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-sm font-medium">Analisi assessment (formato precedente)</p>
                <p className="text-xs text-muted-foreground">
                  Prodotta dal flusso precedente e non modificabile. Rielabora l'assessment per
                  ottenere la versione strutturata.
                </p>
                <div className="prose prose-sm dark:prose-invert max-h-96 max-w-none overflow-y-auto rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <ReactMarkdown>{legacyText}</ReactMarkdown>
                </div>
              </div>
            )}

            {!analysis && !legacyText.trim() && (
              <p className="text-sm italic text-muted-foreground">
                L'analisi comparirà qui una volta completata l'elaborazione.
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
