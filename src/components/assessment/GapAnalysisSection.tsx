import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, History, ArrowRightLeft, Plus, FileDown, X, Loader2 } from 'lucide-react';
import { useAssessmentSnapshots, snapshotTitle } from '@/hooks/useAssessmentSnapshots';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { exportAssessmentComparisonPdf, criticalAreas } from '@/lib/report/exportAssessmentComparisonPdf';

interface GapAnalysisSectionProps {
  currentCategories: { name: string; score: number; completed: number; questions: number }[];
  overallScore: number;
  overallProgress: number;
}

const COLORE_SNAPSHOT = 'hsl(var(--muted-foreground) / 0.45)';
const COLORE_SU = 'hsl(142, 71%, 45%)';
const COLORE_GIU = 'hsl(0, 72%, 51%)';
const COLORE_STABILE = 'hsl(var(--primary))';
const CURRENT = 'current';

const deltaColor = (d: number) => (d > 0 ? COLORE_SU : d < 0 ? COLORE_GIU : COLORE_STABILE);
const signed = (d: number) => `${d > 0 ? '+' : ''}${d}`;

const GapAnalysisSection: React.FC<GapAnalysisSectionProps> = ({ currentCategories, overallScore }) => {
  const { snapshots, saving, saveSnapshot, deleteSnapshot } = useAssessmentSnapshots();
  const { isAdmin, isSuperAdmin, isSales } = useUserRoles();
  const canDelete = isAdmin || isSuperAdmin || isSales;
  const { selectedOrganization } = useClientOrganization();
  const currentYear = new Date().getFullYear();

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState(CURRENT);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [year, setYear] = useState(String(currentYear));

  // Default: confronta lo snapshot più vecchio con la situazione attuale
  useEffect(() => {
    if (!snapshots.find(s => s.id === fromId)) setFromId(snapshots[snapshots.length - 1]?.id ?? '');
    if (toId !== CURRENT && !snapshots.find(s => s.id === toId)) setToId(CURRENT);
  }, [snapshots]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = useMemo(() => ({
    title: `Situazione attuale (${currentYear})`,
    overall: overallScore,
    categories: currentCategories.map(c => ({ name: c.name, score: c.score })),
  }), [currentCategories, overallScore, currentYear]);

  const resolve = (id: string) => {
    if (id === CURRENT) return current;
    const s = snapshots.find(x => x.id === id);
    return s ? { title: snapshotTitle(s), overall: s.overall_score, categories: s.category_scores } : null;
  };
  const from = resolve(fromId);
  const to = resolve(toId);

  const gapData = useMemo(() => {
    if (!from || !to) return [];
    const names = Array.from(new Set([...to.categories.map(c => c.name), ...from.categories.map(c => c.name)])).filter(Boolean);
    return names.map(name => {
      const previous = from.categories.find(c => c.name === name)?.score ?? 0;
      const cur = to.categories.find(c => c.name === name)?.score ?? 0;
      return {
        name,
        shortName: name.length > 16 ? name.substring(0, 14) + '…' : name,
        previous, current: cur, delta: cur - previous,
      };
    });
  }, [from, to]);

  const overallDelta = from && to ? to.overall - from.overall : 0;
  const gains = gapData.filter(r => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const critical = criticalAreas(gapData).slice(0, 3);
  const sameSelection = fromId === toId;

  const handleCreate = async () => {
    const answered = currentCategories.reduce((a, c) => a + c.completed, 0);
    const total = currentCategories.reduce((a, c) => a + c.questions, 0);
    const created = await saveSnapshot({
      label, year: parseInt(year) || currentYear, overall_score: overallScore,
      total_answered: answered, total_questions: total,
      categories: currentCategories.map(c => ({ name: c.name, score: c.score, answered: c.completed, total: c.questions })),
    });
    if (created) { setDialogOpen(false); setLabel(''); }
  };

  const handleExport = () => {
    if (!from || !to) return;
    exportAssessmentComparisonPdf({
      organizationName: selectedOrganization?.name ?? 'Cliente',
      fromTitle: from.title, toTitle: to.title,
      fromScore: from.overall, toScore: to.overall,
      rows: gapData.map(({ name, previous, current, delta }) => ({ name, previous, current, delta })),
    });
  };

  const legend = from && to ? [
    { label: `Partenza · ${from.title}`, color: COLORE_SNAPSHOT },
    { label: 'Migliorata', color: COLORE_SU },
    { label: 'Peggiorata', color: COLORE_GIU },
    { label: 'Stabile', color: COLORE_STABILE },
  ] : [];

  const Row = ({ item, value }: { item: typeof gapData[number]; value: string }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 min-w-0">
      <span className="text-xs text-foreground truncate flex-1 mr-2">{item.name}</span>
      <span className="text-xs font-semibold" style={{ color: deltaColor(item.delta) }}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="text-base">Storico & Gap Analysis</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Confronta l'evoluzione fra un assessment e l'altro</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-1" />Genera nuovo snapshot</Button>
              <Button size="sm" variant="outline" disabled={!from || !to || sameSelection} onClick={handleExport}>
                <FileDown className="w-4 h-4 mr-1" />Esporta report di confronto (PDF)
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {snapshots.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground mr-1">Snapshot:</span>
                {snapshots.map(s => (
                  <Badge
                    key={s.id}
                    variant={fromId === s.id ? 'default' : 'outline'}
                    className="cursor-pointer text-xs gap-1"
                    onClick={() => setFromId(s.id)}
                    title={`Salvato il ${new Date(s.snapshot_date).toLocaleDateString('it-IT')}`}
                  >
                    {snapshotTitle(s)} — {s.overall_score}/100
                    {canDelete && (
                      <button
                        type="button"
                        aria-label="Elimina snapshot"
                        className="ml-1 opacity-60 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Eliminare lo snapshot ${snapshotTitle(s)}?`)) deleteSnapshot(s.id);
                        }}
                      ><X className="w-3 h-3" /></button>
                    )}
                  </Badge>
                ))}
                <span className="text-[10px] text-muted-foreground ml-2">(clicca per impostarlo come partenza)</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Da</span>
                  <Select value={fromId} onValueChange={setFromId}>
                    <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Snapshot" /></SelectTrigger>
                    <SelectContent>
                      {snapshots.map(s => <SelectItem key={s.id} value={s.id}>{snapshotTitle(s)} — {s.overall_score}/100</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">A</span>
                  <Select value={toId} onValueChange={setToId}>
                    <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CURRENT}>Situazione attuale — {overallScore}/100</SelectItem>
                      {snapshots.map(s => <SelectItem key={s.id} value={s.id}>{snapshotTitle(s)} — {s.overall_score}/100</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {sameSelection && <span className="text-xs text-destructive">Scegli due elementi diversi</span>}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Nessuno snapshot salvato. Usa "Genera nuovo snapshot" per fissare la situazione attuale.</p>
          )}
        </CardContent>
      </Card>

      {from && to && !sameSelection && gapData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="border-border">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2 min-w-0">
                <ArrowRightLeft className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground truncate">Confronto {from.title} → {to.title}</span>
              </div>
              <div className="rounded-lg border border-border p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Punteggio Globale</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-foreground">{to.overall}/100</span>
                    <span className="text-xs text-muted-foreground">da {from.overall}/100</span>
                  </div>
                  <Badge variant="outline" className="text-xs font-semibold" style={{ color: deltaColor(overallDelta), borderColor: deltaColor(overallDelta) }}>
                    {overallDelta > 0 && <TrendingUp className="w-3 h-3 mr-1" />}
                    {overallDelta < 0 && <TrendingDown className="w-3 h-3 mr-1" />}
                    {overallDelta === 0 && <Minus className="w-3 h-3 mr-1" />}
                    {signed(overallDelta)}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Migliori miglioramenti</div>
                {gains.length ? gains.map(i => <Row key={i.name} item={i} value={signed(i.delta)} />)
                  : <p className="text-xs text-muted-foreground">Nessuna categoria migliorata.</p>}
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Aree critiche (gap)</div>
                {critical.length ? critical.map(i => <Row key={i.name} item={i} value={`${i.current}/100 (${signed(i.delta)})`} />)
                  : <p className="text-xs text-muted-foreground">Nessuna area critica.</p>}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Variazione per Categoria ({from.title} → {to.title})</CardTitle>
              <div className="flex flex-wrap gap-4 pt-2">
                {legend.map(l => (
                  <span key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-3 h-3 rounded-sm" style={{ background: l.color }} />{l.label}
                  </span>
                ))}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gapData} layout="vertical" barGap={2} barCategoryGap="25%" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis type="category" dataKey="shortName" width={120} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted) / 0.25)' }}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))', fontSize: '12px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: number, key: string, props: any) => {
                        if (key === 'previous') return [`${value}/100`, from.title];
                        return [`${value}/100 (${signed(props.payload.delta)})`, to.title];
                      }}
                      labelFormatter={(_: string, payload: any[]) => payload?.[0]?.payload?.name ?? ''}
                    />
                    <Bar dataKey="previous" fill={COLORE_SNAPSHOT} radius={[0, 4, 4, 0]} maxBarSize={12} />
                    <Bar dataKey="current" radius={[0, 4, 4, 0]} maxBarSize={12}>
                      {gapData.map((e, i) => <Cell key={i} fill={deltaColor(e.delta)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Genera nuovo snapshot</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Salva la situazione attuale ({overallScore}/100). Gli snapshot precedenti restano invariati.</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Anno</Label>
              <Input type="number" value={year} onChange={e => setYear(e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Etichetta (facoltativa)</Label>
              <Input value={label} maxLength={60} placeholder="es. Q3, Pre-audit" onChange={e => setLabel(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Salva snapshot</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GapAnalysisSection;
