import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, History, ArrowRightLeft } from 'lucide-react';
import { AssessmentSnapshot, CategorySnapshot, useAssessmentSnapshots } from '@/hooks/useAssessmentSnapshots';

interface GapAnalysisSectionProps {
  currentCategories: {
    name: string;
    score: number;
    completed: number;
    questions: number;
  }[];
  overallScore: number;
  overallProgress: number;
}

const COLORE_SNAPSHOT = 'hsl(var(--muted-foreground) / 0.45)';
const COLORE_SU = 'hsl(142, 71%, 45%)';
const COLORE_GIU = 'hsl(0, 72%, 51%)';
const COLORE_STABILE = 'hsl(var(--primary))';

const GapAnalysisSection: React.FC<GapAnalysisSectionProps> = ({
  currentCategories,
  overallScore,
  overallProgress,
}) => {
  // Lo snapshot non si crea più da qui: nasce dalla conferma del ciclo di
  // assessment. Il pulsante che stava qui poteva legare uno snapshot a un ciclo
  // ancora in compilazione, escludendolo per sempre dall'elaborazione automatica.
  const { snapshots, loading } = useAssessmentSnapshots();
  // Serve alle etichette di confronto: "2025 → 2026"
  const currentYear = new Date().getFullYear();
  const [compareYear, setCompareYear] = useState<string>('');

  const selectedSnapshot = useMemo(() => {
    if (!compareYear) return null;
    return snapshots.find(s => s.snapshot_year === parseInt(compareYear)) || null;
  }, [compareYear, snapshots]);

  const gapData = useMemo(() => {
    if (!selectedSnapshot) return [];
    return currentCategories.map(curr => {
      const prev = (selectedSnapshot.category_scores as CategorySnapshot[]).find(
        (s) => s.name === curr.name
      );
      const prevScore = prev?.score ?? 0;
      const delta = curr.score - prevScore;
      return {
        name: curr.name,
        shortName: curr.name.length > 16 ? curr.name.substring(0, 14) + '…' : curr.name,
        current: curr.score,
        previous: prevScore,
        delta,
      };
    });
  }, [currentCategories, selectedSnapshot]);

  const overallDelta = selectedSnapshot ? overallScore - selectedSnapshot.overall_score : 0;

  return (
    <div className="space-y-6">
      {/* Header with save + compare controls */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="text-base">Storico & Gap Analysis</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Confronta l'evoluzione fra un assessment e l'altro
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Snapshots timeline */}
          {snapshots.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Snapshot:</span>
              {snapshots.map(s => (
                <Badge
                  key={s.id}
                  variant={compareYear === String(s.snapshot_year) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => setCompareYear(
                    compareYear === String(s.snapshot_year) ? '' : String(s.snapshot_year)
                  )}
                >
                  {s.snapshot_year} — {s.overall_score}/100
                </Badge>
              ))}
              <span className="text-[10px] text-muted-foreground ml-2">
                (clicca per confrontare)
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Rispondi ad almeno una domanda per generare automaticamente il primo snapshot.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Gap/Gain Analysis */}
      {selectedSnapshot && gapData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Summary cards */}
          <Card className="border-border">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRightLeft className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Confronto {selectedSnapshot.snapshot_year} → {currentYear}
                </span>
              </div>

              {/* Overall delta */}
              <div className="rounded-lg border border-border p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Punteggio Globale</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-foreground">{overallScore}/100</span>
                    <span className="text-xs text-muted-foreground">
                      da {selectedSnapshot.overall_score}/100
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs font-semibold ${
                      overallDelta > 0
                        ? 'text-green-500 border-green-500/30'
                        : overallDelta < 0
                        ? 'text-red-500 border-red-500/30'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {overallDelta > 0 && <TrendingUp className="w-3 h-3 mr-1" />}
                    {overallDelta < 0 && <TrendingDown className="w-3 h-3 mr-1" />}
                    {overallDelta === 0 && <Minus className="w-3 h-3 mr-1" />}
                    {overallDelta > 0 ? '+' : ''}{overallDelta}
                  </Badge>
                </div>
              </div>

              {/* Top gains */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Migliori miglioramenti
                </div>
                {[...gapData]
                  .sort((a, b) => b.delta - a.delta)
                  .slice(0, 3)
                  .map(item => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                    >
                      <span className="text-xs text-foreground truncate flex-1 mr-2">{item.name}</span>
                      <span
                        className={`text-xs font-semibold ${
                          item.delta > 0 ? 'text-green-500' : item.delta < 0 ? 'text-red-500' : 'text-muted-foreground'
                        }`}
                      >
                        {item.delta > 0 ? '+' : ''}{item.delta}
                      </span>
                    </div>
                  ))}
              </div>

              {/* Top gaps */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Aree critiche (gap)
                </div>
                {[...gapData]
                  .sort((a, b) => a.delta - b.delta)
                  .slice(0, 3)
                  .map(item => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                    >
                      <span className="text-xs text-foreground truncate flex-1 mr-2">{item.name}</span>
                      <span
                        className={`text-xs font-semibold ${
                          item.delta > 0 ? 'text-green-500' : item.delta < 0 ? 'text-red-500' : 'text-muted-foreground'
                        }`}
                      >
                        {item.delta > 0 ? '+' : ''}{item.delta}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Delta bar chart */}
          <Card className="border-border lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Variazione per Categoria ({selectedSnapshot.snapshot_year} → {currentYear})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Due barre per categoria, punteggio prima e punteggio adesso, su scala
                  0–100. Il solo delta nascondeva dov'è la categoria: una al 100 stabile
                  spariva del tutto, e sembrava un grafico rotto. */}
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={gapData}
                    layout="vertical"
                    barGap={2}
                    barCategoryGap="25%"
                    margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortName"
                      width={120}
                      tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted) / 0.25)' }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                        fontSize: '12px',
                      }}
                      // Il colore del contenitore non arriva alle righe: Recharts
                      // le colora col colore della serie e, mancando (le barre
                      // usano Cell), ripiega su nero. Nero su card scura.
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: number, key: string, props: any) => {
                        const item = props.payload;
                        if (key === 'previous') return [`${value}/100`, `${selectedSnapshot.snapshot_year}`];
                        const segno = item.delta > 0 ? '+' : '';
                        return [`${value}/100 (${segno}${item.delta})`, `${currentYear}`];
                      }}
                      labelFormatter={(_: string, payload: any[]) => payload?.[0]?.payload?.name ?? ''}
                    />
                    {/* La legenda si scrive a mano: la barra "attuale" non ha un fill
                        unico (le Cell lo decidono per riga) e Recharts la disegnerebbe
                        nera. Meglio dire cosa vuol dire ogni colore. */}
                    <Legend
                      wrapperStyle={{ fontSize: '11px' }}
                      payload={[
                        { value: `Snapshot ${selectedSnapshot.snapshot_year}`, type: 'square', color: COLORE_SNAPSHOT },
                        { value: `${currentYear} · migliorata`, type: 'square', color: COLORE_SU },
                        { value: `${currentYear} · peggiorata`, type: 'square', color: COLORE_GIU },
                        { value: `${currentYear} · stabile`, type: 'square', color: COLORE_STABILE },
                      ]}
                    />
                    <Bar dataKey="previous" fill={COLORE_SNAPSHOT} radius={[0, 4, 4, 0]} maxBarSize={12} />
                    <Bar dataKey="current" radius={[0, 4, 4, 0]} maxBarSize={12}>
                      {gapData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.delta > 0 ? COLORE_SU : entry.delta < 0 ? COLORE_GIU : COLORE_STABILE}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default GapAnalysisSection;
