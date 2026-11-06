import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { documentsApi } from '@/lib/api';
import { daysUntil, reviewState, withReviewDates, type ReviewDoc, type ReviewState } from '@/lib/documentReview';
import { cn } from '@/lib/utils';

const STATE_STYLE: Record<ReviewState, { label: string; bar: string; badge: string }> = {
  scaduto: { label: 'Scaduti', bar: 'bg-destructive', badge: 'bg-destructive text-destructive-foreground' },
  imminente: { label: 'Entro 7 giorni', bar: 'bg-primary', badge: 'bg-primary text-primary-foreground' },
  prossimo: { label: 'Entro 30 giorni', bar: 'bg-primary/60', badge: 'bg-primary/20 text-foreground' },
  pianificato: { label: 'Pianificati', bar: 'bg-muted-foreground/50', badge: 'bg-muted text-foreground' },
};

let sweepDone = false;
function triggerSweepOnce() {
  if (sweepDone) return;
  sweepDone = true;
  supabase.functions.invoke('document-review-reminders', { body: {} }).catch(() => {});
}

const MONTHS = 6;

export const DocumentReviewBoard: React.FC<{ documents: ReviewDoc[]; onOpen?: (id: string) => void; title?: string }> = ({ documents, onOpen, title = 'Revisioni documentali' }) => {
  const [offset, setOffset] = useState(0);
  useEffect(() => { triggerSweepOnce(); }, []);
  const items = useMemo(() => withReviewDates(documents), [documents]);
  const counts = useMemo(() => {
    const c: Record<ReviewState, number> = { scaduto: 0, imminente: 0, prossimo: 0, pianificato: 0 };
    items.forEach(d => c[reviewState(d.review_due_date)]++);
    return c;
  }, [items]);

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 1 + offset, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + MONTHS, 1);
  const span = end.getTime() - start.getTime();
  const pct = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - start.getTime()) / span) * 100));
  const months = Array.from({ length: MONTHS }, (_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1));
  const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const visible = items.filter(d => { const due = parse(d.review_due_date); return due >= start && due < end || reviewState(d.review_due_date) === 'scaduto'; }).slice(0, 25);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="w-5 h-5" />{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.keys(STATE_STYLE) as ReviewState[]).map(s => (
            <div key={s} className="rounded-md border border-border p-3 min-w-0">
              <div className="text-xs text-muted-foreground">{STATE_STYLE[s].label}</div>
              <div className="text-2xl font-bold">{counts[s]}</div>
            </div>
          ))}
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun documento con data di revisione. Imposta «Da revisionare o controllare il» nei metadati di un documento.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Calendario revisioni</span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Mesi precedenti" onClick={() => setOffset(o => o - 3)}><ChevronLeft className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setOffset(0)}>Oggi</Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Mesi successivi" onClick={() => setOffset(o => o + 3)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-x-3 text-xs">
              <div />
              <div className="relative flex border-b border-border">
                {months.map(m => <div key={m.toISOString()} className="flex-1 px-1 py-1 text-muted-foreground border-l border-border capitalize">{m.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}</div>)}
              </div>
              {visible.map(d => {
                const st = reviewState(d.review_due_date);
                const due = parse(d.review_due_date);
                const from = pct(today < due ? today : due);
                const to = pct(today < due ? due : today);
                const n = daysUntil(d.review_due_date);
                return (
                  <React.Fragment key={d.id}>
                    <button type="button" onClick={() => onOpen?.(d.id)} className="truncate text-left py-1.5 hover:underline" title={d.name}>{d.name}</button>
                    <div className="relative h-7 border-l border-border">
                      <div className="absolute top-0 bottom-0 w-px bg-foreground/40" style={{ left: `${pct(today)}%` }} />
                      <div className={cn('absolute top-1.5 h-4 rounded', STATE_STYLE[st].bar)} style={{ left: `${from}%`, width: `${Math.max(1, to - from)}%` }}
                        title={`${d.name} — ${due.toLocaleDateString('it-IT')}`} />
                      <Badge className={cn('absolute top-1 text-[10px] px-1.5 py-0', STATE_STYLE[st].badge)} style={{ left: `min(calc(${to}% + 4px), calc(100% - 5.5rem))` }}>
                        {n < 0 ? `${-n}g fa` : n === 0 ? 'oggi' : `tra ${n}g`}
                      </Badge>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/** Self-loading variant for the dashboard. */
export const DocumentReviewBoardForOrg: React.FC<{ organizationId?: string | null; onOpen?: () => void }> = ({ organizationId, onOpen }) => {
  const [docs, setDocs] = useState<ReviewDoc[]>([]);
  useEffect(() => {
    if (!organizationId) return;
    documentsApi.list(organizationId).then(d => setDocs(d as any)).catch(() => setDocs([]));
  }, [organizationId]);
  if (!organizationId) return null;
  return <DocumentReviewBoard documents={docs} onOpen={onOpen ? () => onOpen() : undefined} title="Revisioni documentali in scadenza" />;
};
