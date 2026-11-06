import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import {
  ACN_FLAG_LABELS, ACN_FUNCTIONS, ACN_PHASES, ACN_STATUS_LABELS, measuresForProfile, scoreMeasure, scoreOverall,
  type AcnMeasure, type AcnStatus, type Nis2Profile,
} from '@/lib/nis2Acn/catalog';
import { measuresForQuestion, suggestFromLegacy, type LegacyStatus } from '@/lib/nis2Acn/legacyMapping';

const db = supabase as any;

interface Row { requirement_code: string; status: AcnStatus; note: string | null; owner: string | null; due_date: string | null; document_id: string | null }

const STATUS_STYLE: Record<AcnStatus, string> = {
  implementato: 'bg-primary text-primary-foreground',
  parziale: 'bg-secondary text-secondary-foreground',
  non_implementato: 'bg-destructive text-destructive-foreground',
  deroga: 'bg-muted text-foreground',
};

interface Props { orgId: string; profile: Nis2Profile; readOnly?: boolean }

export function Nis2AcnAssessment({ orgId, profile, readOnly }: Props) {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [legacy, setLegacy] = useState<Record<string, { text: string; status: LegacyStatus }[]>>({});
  const [docs, setDocs] = useState<{ id: string; name: string }[]>([]);
  const [phase, setPhase] = useState(1);
  const measures = useMemo(() => measuresForProfile(profile), [profile]);
  const answers = useMemo(() => Object.fromEntries(Object.values(rows).map((r) => [r.requirement_code, r.status])) as Record<string, AcnStatus>, [rows]);
  const overall = scoreOverall(measures, answers, profile);

  useEffect(() => {
    db.from('nis2_acn_responses').select('requirement_code,status,note,owner,due_date,document_id').eq('organization_id', orgId)
      .then(({ data }: any) => setRows(Object.fromEntries((data ?? []).map((r: Row) => [r.requirement_code, r]))));
    supabase.from('incident_documents').select('id, name').eq('organization_id', orgId).order('uploaded_at', { ascending: false }).limit(300)
      .then(({ data }) => setDocs((data as any) ?? []));
    supabase.from('assessment_responses').select('status, assessment_questions(question_text)').eq('organization_id', orgId)
      .then(({ data }) => {
        const map: Record<string, { text: string; status: LegacyStatus }[]> = {};
        for (const r of (data as any[]) ?? []) {
          const text = r.assessment_questions?.question_text;
          if (!text || !r.status) continue;
          for (const code of measuresForQuestion(text)) (map[code] ??= []).push({ text, status: r.status });
        }
        setLegacy(map);
      });
  }, [orgId]);

  const save = async (code: string, rawPatch: Partial<Row> & { _fromLegacy?: boolean }) => {
    const { _fromLegacy, ...patch } = rawPatch;
    const prev = rows[code];
    const next: Row = { requirement_code: code, status: prev?.status ?? 'non_implementato', note: null, owner: null, due_date: null, document_id: null, ...prev, ...patch };
    setRows((r) => ({ ...r, [code]: next }));
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from('nis2_acn_responses').upsert({ organization_id: orgId, ...next, source: _fromLegacy ? 'suggested_from_assessment' : 'manual', updated_by: u.user?.id }, { onConflict: 'organization_id,requirement_code' });
    if (error) toast.error('Salvataggio non riuscito');
  };

  const phaseMeasures = measures.filter((m) => m.phase === phase);

  const byFunction = Object.keys(ACN_FUNCTIONS).map((f) => {
    const ms = measures.filter((m) => m.function === f);
    return { f, s: scoreOverall(ms, answers, profile) };
  }).filter((x) => x.s.total > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 grid gap-4 md:grid-cols-[200px_1fr]">
          <div>
            <p className="text-sm text-muted-foreground">Punteggio ACN</p>
            <p className="text-4xl font-bold">{overall.score ?? '—'}{overall.score !== null && '%'}</p>
            <p className="text-xs text-muted-foreground">{overall.answered}/{overall.total} risposte · profilo {profile === 'ess' ? 'Essenziali' : profile === 'imp' ? 'Importanti' : 'Base'}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {byFunction.map(({ f, s }) => (
              <div key={f} className="min-w-0">
                <div className="flex justify-between text-sm"><span>{f} · {ACN_FUNCTIONS[f as AcnMeasure['function']]}</span><span>{s.score ?? '—'}{s.score !== null && '%'}</span></div>
                <Progress value={s.score ?? 0} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {Object.entries(ACN_PHASES).map(([p, t]) => {
          const ms = measures.filter((m) => m.phase === Number(p));
          if (!ms.length) return null;
          const s = scoreOverall(ms, answers, profile);
          return (
            <Button key={p} size="sm" variant={phase === Number(p) ? 'default' : 'outline'} onClick={() => setPhase(Number(p))}>
              {p}. {t} <span className="ml-2 text-xs opacity-80">{s.answered}/{s.total}</span>
            </Button>
          );
        })}
      </div>

      <Accordion type="multiple" className="space-y-2">
        {phaseMeasures.map((m) => {
          const s = scoreMeasure(m, answers, profile);
          const leg = legacy[m.code] ?? [];
          const suggestion = suggestFromLegacy(leg.map((l) => l.status));
          const items = profile === 'base'
            ? [{ code: m.code, question: m.guideQuestion ?? m.title, acnText: m.requirements.map((r) => r.acnText).join(' '), flags: [] as string[], type: null as string | null, policy: null as string | null }]
            : m.requirements;
          return (
            <AccordionItem key={m.code} value={m.code} className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex flex-1 items-center gap-3 min-w-0 text-left">
                  <Badge variant="outline">{m.code}</Badge>
                  <span className="font-medium truncate">{m.title}</span>
                  {m.profiles.length === 1 && m.profiles[0] === 'ess' && <Badge variant="secondary">solo essenziali</Badge>}
                  <span className="ml-auto text-sm text-muted-foreground shrink-0">{s.answered}/{s.total} · {s.score ?? '—'}{s.score !== null && '%'}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4">
                <div className="grid gap-2 md:grid-cols-2 text-sm bg-muted/40 rounded-md p-3">
                  <div><p className="font-medium">In parole semplici</p><p className="text-muted-foreground">{m.simple}</p></div>
                  <div className="space-y-1">
                    <p><span className="font-medium">Evidenza attesa:</span> <span className="text-muted-foreground">{m.evidence}</span></p>
                    <p><span className="font-medium">Remediation suggerita:</span> <span className="text-muted-foreground">{m.remediation} (stima indicativa)</span></p>
                    <p className="text-xs text-muted-foreground">Peso {m.weight} · Art. 24 c.2 {m.art24}{m.dependsOn.length ? ` · Dipende da ${m.dependsOn.join(', ')}` : ''}</p>
                  </div>
                </div>
                {leg.length > 0 && (
                  <div className="text-sm border rounded-md p-3 space-y-1">
                    <p className="font-medium">Correlazione con l'assessment HiCompliance ({leg.length} domande, proposta da validare)</p>
                    <ul className="list-disc pl-4 text-muted-foreground max-h-32 overflow-auto">
                      {leg.slice(0, 8).map((l, i) => <li key={i}>{l.text} — <em>{l.status.replace(/_/g, ' ')}</em></li>)}
                    </ul>
                    {suggestion && <p>Risposta suggerita: <strong>{ACN_STATUS_LABELS[suggestion]}</strong></p>}
                  </div>
                )}
                {items.map((r) => {
                  const row = rows[r.code];
                  const allowDeroga = r.flags.includes('D');
                  return (
                    <div key={r.code} className="border-t pt-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{r.code}</Badge>
                        {r.type && <Badge variant="secondary">{r.type}</Badge>}
                        {r.flags.map((f) => <Badge key={f} variant="outline" className="text-xs">{ACN_FLAG_LABELS[f] ?? f}</Badge>)}
                        {r.policy && <span className="text-xs text-muted-foreground">Politica: {r.policy}</span>}
                      </div>
                      <p className="font-medium text-sm">{r.question}</p>
                      <blockquote className="text-xs text-muted-foreground border-l-2 pl-2">Testo ACN: «{r.acnText}»</blockquote>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(ACN_STATUS_LABELS) as AcnStatus[]).filter((st) => st !== 'deroga' || allowDeroga).map((st) => (
                          <Button key={st} size="sm" disabled={readOnly} variant={row?.status === st ? 'default' : 'outline'} className={row?.status === st ? STATUS_STYLE[st] : ''} onClick={() => save(r.code, { status: st })}>
                            {ACN_STATUS_LABELS[st]}
                          </Button>
                        ))}
                        {suggestion && !row && !readOnly && (
                          <Button size="sm" variant="ghost" onClick={() => save(r.code, { status: suggestion, _fromLegacy: true })}>Usa suggerimento</Button>
                        )}
                      </div>
                      {row && (
                        <div className="grid gap-2 md:grid-cols-[1fr_180px_160px_220px]">
                          <Textarea rows={1} disabled={readOnly} placeholder={row.status === 'implementato' ? 'Evidenza (nota o link)' : row.status === 'deroga' ? 'Motivazione e misure compensative' : 'Descrizione del gap'} defaultValue={row.note ?? ''} onBlur={(e) => e.target.value !== (row.note ?? '') && save(r.code, { note: e.target.value })} />
                          <Input disabled={readOnly} placeholder="Responsabile" defaultValue={row.owner ?? ''} onBlur={(e) => e.target.value !== (row.owner ?? '') && save(r.code, { owner: e.target.value })} />
                          <Input disabled={readOnly} type="date" defaultValue={row.due_date ?? ''} onChange={(e) => save(r.code, { due_date: e.target.value || null })} />
                          <Select disabled={readOnly} value={row.document_id ?? 'none'} onValueChange={(v) => save(r.code, { document_id: v === 'none' ? null : v })}>
                            <SelectTrigger><SelectValue placeholder="Documento evidenza" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nessun documento</SelectItem>
                              {docs.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

export function Nis2GapList({ orgId, profile }: { orgId: string; profile: Nis2Profile }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    db.from('nis2_acn_responses').select('requirement_code,status,note,owner,due_date,document_id').eq('organization_id', orgId)
      .then(({ data }: any) => setRows(data ?? []));
  }, [orgId]);
  const measures = measuresForProfile(profile);
  const answered = Object.fromEntries(rows.map((r) => [r.requirement_code, r]));
  const gaps = measures.flatMap((m) => (profile === 'base' ? [{ code: m.code, question: m.guideQuestion ?? m.title }] : m.requirements).map((r) => ({ m, r, row: answered[r.code] })))
    .filter((x) => !x.row || x.row.status === 'non_implementato' || x.row.status === 'parziale')
    .sort((a, b) => b.m.weight - a.m.weight);
  return (
    <Card>
      <CardHeader><CardTitle>Piano di adeguamento (ID.IM-01) · {gaps.length} requisiti aperti</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">Requisiti non implementati, parziali o non ancora valutati, ordinati per peso della misura. Il piano va approvato dagli organi di amministrazione.</p>
        <div className="divide-y">
          {gaps.map(({ m, r, row }) => (
            <div key={r.code} className="py-2 text-sm flex gap-3 items-start">
              <Badge variant="outline" className="shrink-0">{r.code}</Badge>
              <div className="min-w-0 flex-1">
                <p>{r.question}</p>
                <p className="text-xs text-muted-foreground">{m.remediation} · peso {m.weight}{row?.owner ? ` · ${row.owner}` : ''}{row?.due_date ? ` · entro ${row.due_date}` : ''}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">{row ? ACN_STATUS_LABELS[row.status] : 'Da valutare'}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
