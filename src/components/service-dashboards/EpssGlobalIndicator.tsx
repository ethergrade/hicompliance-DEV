import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';

interface Item { id: string; score: number; assets?: unknown[] }

const band = (p: number) =>
  p >= 0.7 ? { label: 'Critico', cls: 'text-red-500', bar: 'bg-red-500' }
  : p >= 0.4 ? { label: 'Alto', cls: 'text-orange-500', bar: 'bg-orange-500' }
  : p >= 0.15 ? { label: 'Moderato', cls: 'text-yellow-500', bar: 'bg-yellow-500' }
  : { label: 'Basso', cls: 'text-green-500', bar: 'bg-green-500' };

/**
 * Indicatore globale: probabilità che almeno una CVE venga sfruttata nei prossimi
 * 30 giorni = 1 - Π(1 - EPSS). Pesato sulle CVE ad alta probabilità.
 */
export const EpssGlobalIndicator: React.FC<{ cves: Item[] }> = ({ cves }) => {
  const stats = useMemo(() => {
    const scores = cves.map((c) => Math.min(1, Math.max(0, c.score || 0)));
    const top = [...scores].sort((a, b) => b - a).slice(0, 10);
    const combinedTop = 1 - top.reduce((acc, s) => acc * (1 - s * 0.35), 1);
    const avg = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
    const buckets = [
      { label: '≥ 0.70', n: scores.filter((s) => s >= 0.7).length, cls: 'bg-red-500' },
      { label: '0.40–0.70', n: scores.filter((s) => s >= 0.4 && s < 0.7).length, cls: 'bg-orange-500' },
      { label: '0.10–0.40', n: scores.filter((s) => s >= 0.1 && s < 0.4).length, cls: 'bg-yellow-500' },
      { label: '< 0.10', n: scores.filter((s) => s < 0.1).length, cls: 'bg-green-500' },
    ];
    const hotAssets = new Set(cves.filter((c) => c.score >= 0.4).flatMap((c) => (c.assets ?? []).map((a: any) => a['data.id']))).size;
    return { index: combinedTop, avg, buckets, total: scores.length, hotAssets };
  }, [cves]);

  const b = band(stats.index);
  const pct = Math.round(stats.index * 100);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">Indicatore globale rischio EPSS</h2>
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5" /> Probabilità di sfruttamento (30 giorni)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          <div className="flex flex-col justify-center">
            <div className={`text-5xl font-bold ${b.cls}`}>{pct}%</div>
            <div className={`text-sm font-medium mt-1 ${b.cls}`}>Rischio {b.label}</div>
            <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className={`h-full ${b.bar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-muted/40 p-3"><div className="text-2xl font-bold">{stats.avg.toFixed(3)}</div><div className="text-xs text-muted-foreground">EPSS medio</div></div>
            <div className="rounded-lg bg-muted/40 p-3"><div className="text-2xl font-bold">{stats.buckets[0].n + stats.buckets[1].n}</div><div className="text-xs text-muted-foreground">CVE EPSS ≥ 0.40</div></div>
            <div className="rounded-lg bg-muted/40 p-3"><div className="text-2xl font-bold">{stats.hotAssets}</div><div className="text-xs text-muted-foreground">Asset esposti</div></div>
          </div>
          <div className="space-y-2">
            {stats.buckets.map((x) => (
              <div key={x.label} className="flex items-center gap-2 text-sm">
                <span className="w-20 text-muted-foreground shrink-0">{x.label}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${x.cls}`} style={{ width: `${(x.n / (stats.total || 1)) * 100}%` }} />
                </div>
                <span className="w-8 text-right font-medium">{x.n}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
