import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Plus, Trash2, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { buildCategoryScore } from '@/lib/assessment/scoring';
import type { AssessmentCategory, AssessmentResponse } from '@/data/assessmentQuestions';

/**
 * Score da assessment esterni (audit, questionari prodotti dal cliente fuori
 * piattaforma). Sono mostrati AFFIANCATI allo score calcolato, mai mescolati:
 * lo score calcolato resta l'unica fonte per trend e Gap Analysis.
 * Lettura: tutti gli utenti dell'organizzazione. Scrittura: Super Admin e Sales.
 */

interface ExternalScore {
  id: string;
  category_name: string;
  score: number;
  assessment_date: string | null;
  notes: string | null;
  document_id: string | null;
}

interface DocumentOption {
  id: string;
  name: string;
}

interface ExternalScoresSectionProps {
  orgId: string;
  categories: AssessmentCategory[];
  responses: Record<number, AssessmentResponse>;
  canManage: boolean;
}

export function ExternalScoresSection({ orgId, categories, responses, canManage }: ExternalScoresSectionProps) {
  const [scores, setScores] = useState<ExternalScore[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [categoryName, setCategoryName] = useState('');
  const [score, setScore] = useState('');
  const [assessmentDate, setAssessmentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [documentId, setDocumentId] = useState<string>('');

  const calculatedByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    categories.forEach((cat) => {
      map[cat.name] = buildCategoryScore(cat, responses, categories).score;
    });
    return map;
  }, [categories, responses]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: scoreRows, error: scoreError }, { data: docRows, error: docError }] = await Promise.all([
        (supabase as any)
          .from('assessment_external_scores')
          .select('id, category_name, score, assessment_date, notes, document_id')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('incident_documents')
          .select('id, name')
          .eq('organization_id', orgId)
          .order('uploaded_at', { ascending: false })
          .limit(200),
      ]);
      if (scoreError) throw scoreError;
      if (docError) throw docError;
      setScores((scoreRows ?? []) as ExternalScore[]);
      setDocuments((docRows ?? []) as DocumentOption[]);
    } catch (error) {
      console.error('External scores load error:', error);
      toast.error('Errore nel caricamento degli score esterni');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setCategoryName('');
    setScore('');
    setAssessmentDate('');
    setNotes('');
    setDocumentId('');
    setFormOpen(false);
  };

  const handleAdd = async () => {
    const scoreNum = Number(score);
    if (!categoryName || !Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      toast.error('Controlla i campi', { description: 'Categoria obbligatoria e score tra 0 e 100.' });
      return;
    }
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from('assessment_external_scores').insert({
        organization_id: orgId,
        category_name: categoryName,
        score: Math.round(scoreNum),
        assessment_date: assessmentDate || null,
        notes: notes.trim() || null,
        document_id: documentId || null,
        created_by: authData.user?.id ?? null,
      });
      if (error) throw error;
      toast.success('Score esterno registrato');
      resetForm();
      void load();
    } catch (error) {
      console.error('External score save error:', error);
      toast.error('Errore nel salvataggio dello score esterno');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any).from('assessment_external_scores').delete().eq('id', id);
    if (error) {
      toast.error('Errore nell\'eliminazione');
      return;
    }
    setScores((prev) => prev.filter((s) => s.id !== id));
    toast.success('Score esterno eliminato');
  };

  const docName = (id: string | null) => documents.find((d) => d.id === id)?.name ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="w-5 h-5 text-primary" />
            Score da assessment esterni
          </CardTitle>
          <CardDescription>
            Punteggi da audit o assessment prodotti dal cliente fuori piattaforma. Sono mostrati
            affiancati allo score calcolato e non influenzano trend e Gap Analysis.
          </CardDescription>
        </div>
        {canManage && !formOpen && (
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setFormOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            Aggiungi score
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Caricamento…
          </div>
        ) : scores.length === 0 && !formOpen ? (
          <p className="text-sm text-muted-foreground">
            Nessuno score esterno registrato per questo cliente.
            {canManage && ' Usa "Aggiungi score" per registrarne uno da un audit o assessment esterno.'}
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Categoria</th>
                  <th className="text-left p-2 font-medium w-32">Score calcolato</th>
                  <th className="text-left p-2 font-medium w-32">Score esterno</th>
                  <th className="text-left p-2 font-medium w-28">Data</th>
                  <th className="text-left p-2 font-medium">Evidenza / Note</th>
                  {canManage && <th className="w-12" />}
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2 font-medium">{s.category_name}</td>
                    <td className="p-2">
                      {calculatedByCategory[s.category_name] !== undefined ? (
                        <Badge variant="secondary">{calculatedByCategory[s.category_name]}%</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <Badge className="bg-primary/10 text-primary border-primary/20">{s.score}%</Badge>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {s.assessment_date ? new Date(s.assessment_date).toLocaleDateString('it-IT') : '—'}
                    </td>
                    <td className="p-2 text-muted-foreground max-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {docName(s.document_id) && (
                          <span className="flex items-center gap-1 text-xs shrink-0">
                            <FileText className="w-3 h-3" />
                            {docName(s.document_id)}
                          </span>
                        )}
                        {s.notes && <span className="text-xs truncate" title={s.notes}>{s.notes}</span>}
                        {!docName(s.document_id) && !s.notes && '—'}
                      </div>
                    </td>
                    {canManage && (
                      <td className="p-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void handleDelete(s.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canManage && formOpen && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={categoryName} onValueChange={setCategoryName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Score (0-100)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="es. 75"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data assessment</Label>
                <Input type="date" value={assessmentDate} onChange={(e) => setAssessmentDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Documento di evidenza (opzionale)</Label>
                <Select value={documentId} onValueChange={setDocumentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Collega un documento" />
                  </SelectTrigger>
                  <SelectContent>
                    {documents.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Note (opzionale)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="es. Audit ISO 27001 del fornitore X"
                  rows={1}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetForm}>Annulla</Button>
              <Button size="sm" disabled={saving} onClick={() => void handleAdd()}>
                {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Salva score
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
