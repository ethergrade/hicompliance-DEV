import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Package, TrendingUp } from 'lucide-react';
import type { ConsistenzeItem, ConsistenzeArea } from '@/types/consistenze';
import { AREA_LABELS, AREA_WEIGHTS, getRiskLevel } from '@/types/consistenze';

interface Props {
  items: ConsistenzeItem[];
  calcAreaScore: (area: ConsistenzeArea) => number;
  calcTotalIRP: () => number;
  nrSedi: number;
}

const AREAS: ConsistenzeArea[] = ['UCC', 'SECURITY', 'CONN_FONIA', 'NETWORKING', 'IT'];

export const ConsistenzeOverview: React.FC<Props> = ({ items, calcAreaScore, calcTotalIRP, nrSedi }) => {
  const totalIRP = calcTotalIRP();
  const riskLevel = getRiskLevel(totalIRP);

  return (
    <div className="space-y-6">
      {/* IRP Total Gauge */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Indice di Rischio Posturale (IRP) Totale
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
                <circle
                  cx="60" cy="60" r="50" fill="none" strokeWidth="8"
                  strokeDasharray={`${(totalIRP / 100) * 314} 314`}
                  strokeLinecap="round"
                  className={totalIRP <= 40 ? 'text-green-500' : totalIRP <= 70 ? 'text-orange-400' : 'text-red-500'}
                  stroke="currentColor"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{totalIRP}</span>
                <span className="text-xs text-muted-foreground">/100</span>
              </div>
            </div>
            <div>
              <Badge variant={totalIRP > 60 ? 'destructive' : 'secondary'} className="mb-2">
                {riskLevel.label}
              </Badge>
              <p className="text-sm text-muted-foreground">
                Calcolato su {items.length} asset in {AREAS.filter(a => items.some(i => i.area === a)).length} aree
              </p>
              {totalIRP > 70 && (
                <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Rischio elevato: consigliata Remediation o Assessment avanzato
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Area cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {AREAS.map(area => {
          const areaItems = items.filter(i => i.area === area);
          const score = calcAreaScore(area);
          const level = getRiskLevel(score);
          return (
            <Card key={area}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{AREA_LABELS[area]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{areaItems.length} asset</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Rischio medio</span>
                  <Badge variant={score > 60 ? 'destructive' : 'secondary'} className="text-xs">
                    {score} - {level.label}
                  </Badge>
                </div>
                {score > 60 && (
                  <Badge variant="destructive" className="text-[10px] w-full justify-center">
                    Intervento Prioritario
                  </Badge>
                )}
                <div className="text-xs text-muted-foreground">
                  Peso: {(AREA_WEIGHTS[area] * 100).toFixed(0)}%
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* KPI summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">KPI Riepilogo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Totale Asset</p>
              <p className="text-lg font-semibold">{items.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Nr. Sedi</p>
              <p className="text-lg font-semibold">{nrSedi}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Asset / Sede</p>
              <p className="text-lg font-semibold">{nrSedi > 0 ? (items.length / nrSedi).toFixed(1) : '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Aree Coperte</p>
              <p className="text-lg font-semibold">{AREAS.filter(a => items.some(i => i.area === a)).length}/5</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
