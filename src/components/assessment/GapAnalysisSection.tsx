import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { Save, TrendingUp, TrendingDown, Minus, History, ArrowRightLeft } from 'lucide-react';
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

const GapAnalysisSection: React.FC<GapAnalysisSectionProps> = ({
  currentCategories,
  overallScore,
  overallProgress,
}) => {
  const { snapshots, loading, saving, saveSnapshot } = useAssessmentSnapshots();
  const currentYear = new Date().getFullYear();
  const [compareYear, setCompareYear] = useState<string>('');

  const handleSaveSnapshot = () => {
    const catData = currentCategories.map(c => ({
      name: c.name,
      score: c.score,
      answered: c.completed,
      total: c.questions,
    }));
    const totalAnswered = currentCategories.reduce((a, c) => a + c.completed, 0);
    const totalQuestions = currentCategories.reduce((a, c) => a + c.questions, 0);
    saveSnapshot(currentYear, catData, overallScore, totalAnswered, totalQuestions);
  };

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
                  Salva snapshot annuali e confronta l'evoluzione nel tempo
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveSnapshot}
                disabled={saving}
                className="h-8 text-xs"
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {saving ? 'Salvataggio...' : `Salva Snapshot ${currentYear}`}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Snapshots timeline */}
          {snapshots.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Snapshot salvati:</span>
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
              Nessuno snapshot salvato. Salva il primo snapshot per abilitare la gap analysis.
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
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={gapData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={['auto', 'auto']}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortName"
                      width={120}
                      tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                        fontSize: '12px',
                      }}
                      formatter={(value: number, _: string, props: any) => {
                        const item = props.payload;
                        return [
                          `Delta: ${value > 0 ? '+' : ''}${value} (${item.previous} → ${item.current})`,
                          item.name,
                        ];
                      }}
                      labelFormatter={() => ''}
                    />
                    <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
                    <Bar dataKey="delta" radius={[0, 4, 4, 0]} maxBarSize={20}>
                      {gapData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={
                            entry.delta > 0
                              ? 'hsl(142, 71%, 45%)'
                              : entry.delta < 0
                              ? 'hsl(0, 72%, 51%)'
                              : 'hsl(var(--muted-foreground))'
                          }
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
