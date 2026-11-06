import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Upload, Loader2, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { mapToV2Status } from '@/lib/assessmentV2Mapper';
import type { AssessmentCategory } from '@/data/assessmentQuestions';

/**
 * Importa le risposte dell'assessment da un file Excel compilato dal cliente.
 *
 * Flusso: download template → upload file compilato → anteprima di validazione
 * → conferma → upsert in assessment_responses con source='import'.
 * Le domande assenti o con stato vuoto restano invariate (import parziale).
 * La logica di scoring esistente non viene toccata: legge dalle stesse tabelle.
 */

type UiStatus = 'completato' | 'pianificato_in_corso' | 'non_iniziato' | 'non_applicabile';

const STATUS_ALIASES: Record<string, UiStatus> = {
  completato: 'completato',
  completed: 'completato',
  pianificato_in_corso: 'pianificato_in_corso',
  'pianificato/in corso': 'pianificato_in_corso',
  'pianificato in corso': 'pianificato_in_corso',
  planned_in_progress: 'pianificato_in_corso',
  non_iniziato: 'non_iniziato',
  'non iniziato': 'non_iniziato',
  not_started: 'non_iniziato',
  non_applicabile: 'non_applicabile',
  'non applicabile': 'non_applicabile',
  not_applicable: 'non_applicabile',
  'n/a': 'non_applicabile',
  na: 'non_applicabile',
};

interface ParsedRow {
  rowNumber: number;
  id: number | null;
  question: string;
  statusRaw: string;
  status: UiStatus | null;
  error: string | null; // errore bloccante (id sconosciuto o stato non valido)
}

interface ImportAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  categories: AssessmentCategory[];
  indexToUuid: Record<number, string>;
  onImported: () => void;
}

export function ImportAssessmentDialog({
  open,
  onOpenChange,
  orgId,
  categories,
  indexToUuid,
  onImported,
}: ImportAssessmentDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);

  const questionById = useMemo(() => {
    const map: Record<number, string> = {};
    categories.forEach((cat) => cat.questions.forEach((q) => { map[q.id] = q.question; }));
    return map;
  }, [categories]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const valid = rows.filter((r) => r.status && !r.error).length;
    const skipped = rows.filter((r) => !r.status && !r.error).length;
    const errors = rows.filter((r) => r.error).length;
    return { valid, skipped, errors };
  }, [rows]);

  const reset = () => {
    setRows(null);
    setFileName(null);
    setParsing(false);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const header = ['ID', 'Categoria', 'Domanda', 'Priorità', 'Stato'];
    const data: (string | number)[][] = [header];
    categories.forEach((cat) => {
      cat.questions.forEach((q) => {
        data.push([q.id, cat.name, q.question, q.priority, '']);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 90 }, { wch: 10 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assessment');
    XLSX.writeFile(wb, 'template-assessment.xlsx');
    toast.success('Template scaricato', {
      description: 'Compila la colonna "Stato" con: completato, pianificato_in_corso, non_iniziato, non_applicabile',
    });
  };

  const parseFile = async (file: File) => {
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      const parsed: ParsedRow[] = [];
      json.slice(1).forEach((row, i) => {
        const rowNumber = i + 2; // riga Excel (1 = intestazione)
        const rawId = row[0];
        const statusRaw = String(row[4] ?? '').trim();
        if (rawId === null || rawId === undefined || String(rawId).trim() === '') {
          if (statusRaw) {
            parsed.push({ rowNumber, id: null, question: '', statusRaw, status: null, error: 'ID domanda mancante' });
          }
          return; // riga vuota: ignora
        }
        const id = Number(rawId);
        if (!Number.isInteger(id) || !indexToUuid[id]) {
          parsed.push({ rowNumber, id: null, question: '', statusRaw, status: null, error: `ID "${String(rawId)}" non riconosciuto` });
          return;
        }
        const question = questionById[id] ?? '';
        if (!statusRaw) {
          parsed.push({ rowNumber, id, question, statusRaw, status: null, error: null }); // saltata
          return;
        }
        const status = STATUS_ALIASES[statusRaw.toLowerCase()] ?? null;
        if (!status) {
          parsed.push({ rowNumber, id, question, statusRaw, status: null, error: `Stato "${statusRaw}" non valido` });
          return;
        }
        parsed.push({ rowNumber, id, question, statusRaw, status, error: null });
      });

      if (parsed.length === 0) {
        toast.error('Nessuna riga trovata', { description: 'Il file non contiene righe dati sotto l\'intestazione.' });
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch {
      toast.error('Errore nella lettura del file', { description: 'Usa il template Excel scaricato da questa finestra.' });
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!rows) return;
    const toImport = rows.filter((r) => r.status && !r.error && r.id !== null);
    if (toImport.length === 0) return;

    setImporting(true);
    try {
      const payload = toImport.map((r) => ({
        organization_id: orgId,
        question_id: indexToUuid[r.id as number],
        status: mapToV2Status(r.status),
        notes: null,
        source: 'import',
      }));
      const { error } = await (supabase as any)
        .from('assessment_responses')
        .upsert(payload, { onConflict: 'organization_id,question_id' });
      if (error) throw error;

      toast.success('Import completato', {
        description: `${toImport.length} risposte importate. Gli score sono stati ricalcolati.`,
      });
      onImported();
      onOpenChange(false);
      reset();
    } catch (error) {
      console.error('Import assessment error:', error);
      toast.error('Errore durante l\'import', { description: 'Nessuna modifica è stata salvata.' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importa assessment da Excel</DialogTitle>
          <DialogDescription>
            Importa le risposte da un assessment già prodotto dal cliente. Scarica il template,
            compilalo e caricalo: le risposte importate aggiornano score e report come quelle inserite a mano.
            Le domande lasciate vuote restano invariate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2" onClick={downloadTemplate}>
              <Download className="w-4 h-4" />
              Scarica template
            </Button>
            <Button variant="outline" className="gap-2" disabled={parsing} onClick={() => fileInputRef.current?.click()}>
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Carica file compilato
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void parseFile(f);
              }}
            />
          </div>

          {rows && summary && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="gap-1.5">
                  <FileSpreadsheet className="w-3 h-3" />
                  {fileName}
                </Badge>
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20">{summary.valid} da importare</Badge>
                {summary.skipped > 0 && <Badge variant="secondary">{summary.skipped} saltate (stato vuoto)</Badge>}
                {summary.errors > 0 && <Badge className="bg-red-500/10 text-red-500 border-red-500/20">{summary.errors} con errore</Badge>}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium w-14">Riga</th>
                        <th className="text-left p-2 font-medium w-14">ID</th>
                        <th className="text-left p-2 font-medium">Domanda</th>
                        <th className="text-left p-2 font-medium w-40">Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.rowNumber} className={r.error ? 'bg-red-500/5' : r.status ? '' : 'bg-muted/30'}>
                          <td className="p-2 text-muted-foreground">{r.rowNumber}</td>
                          <td className="p-2">{r.id ?? '—'}</td>
                          <td className="p-2 max-w-0 truncate" title={r.question}>{r.question || '—'}</td>
                          <td className="p-2">
                            {r.error ? (
                              <span className="flex items-center gap-1 text-red-500 text-xs">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                {r.error}
                              </span>
                            ) : r.status ? (
                              <span className="flex items-center gap-1 text-green-600 text-xs">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                {r.status}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">saltata</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Le righe con errore e quelle con stato vuoto non verranno importate. Le risposte importate
                sovrascrivono quelle esistenti per le stesse domande e vengono marcate come "importate".
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>
            Annulla
          </Button>
          <Button
            disabled={!rows || !summary || summary.valid === 0 || importing}
            onClick={() => void handleConfirm()}
          >
            {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Importa {summary && summary.valid > 0 ? `${summary.valid} risposte` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
