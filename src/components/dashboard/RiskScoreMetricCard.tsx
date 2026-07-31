import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

type TimeRange = '1d' | '7d' | '1m' | '3m' | '6m' | '1y';

const TIME_OPTIONS: TimeRange[] = ['1d', '7d', '1m', '3m', '6m', '1y'];

const DATA: Record<TimeRange, { percentage: number; label: string; status: 'critical' | 'warning' | 'good'; sparkline: number[] }> = {
  '1d': { percentage: 35, label: 'Basso', status: 'good',     sparkline: [48, 42, 38, 35] },
  '7d': { percentage: 42, label: 'Medio', status: 'warning',  sparkline: [55, 50, 46, 44, 42] },
  '1m': { percentage: 50, label: 'Medio', status: 'warning',  sparkline: [60, 55, 52, 50] },
  '3m': { percentage: 55, label: 'Medio', status: 'warning',  sparkline: [65, 60, 57, 56, 55] },
  '6m': { percentage: 65, label: 'Alto',  status: 'critical',  sparkline: [75, 70, 68, 66, 65] },
  '1y': { percentage: 74, label: 'Alto',  status: 'critical', sparkline: [80, 78, 76, 75, 74] },
};

const CIRCUMFERENCE = 2 * Math.PI * 28;

// Deriva la serie per timeframe partendo dal rischio corrente (100 - health media servizi).
// Il passato e' peggiore del presente: il trend migliora avvicinandosi ad oggi.
const OFFSETS: Record<TimeRange, number> = { '1d': 0, '7d': 3, '1m': 7, '3m': 12, '6m': 18, '1y': 24 };

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

const buildSeries = (base: number): typeof DATA => {
  const out = {} as typeof DATA;
  TIME_OPTIONS.forEach((opt) => {
    const value = clamp(base + OFFSETS[opt]);
    const status: 'critical' | 'warning' | 'good' = value >= 60 ? 'critical' : value >= 40 ? 'warning' : 'good';
    const label = value >= 60 ? 'Alto' : value >= 40 ? 'Medio' : 'Basso';
    const spark = [4, 3, 2, 1, 0].map((step) => clamp(value + step * 2));
    out[opt] = { percentage: value, label, status, sparkline: spark };
  });
  return out;
};

interface RiskScoreMetricCardProps {
  /** Rischio corrente 0-100 (100 - health score medio dei servizi). */
  baseScore?: number;
}

export const RiskScoreMetricCard: React.FC<RiskScoreMetricCardProps> = ({ baseScore }) => {
  const [selected, setSelected] = useState<TimeRange>('1d');
  const dataset = typeof baseScore === 'number' ? buildSeries(baseScore) : DATA;
  const { percentage, label, status, sparkline } = dataset[selected];

  const strokeColor =
    status === 'good'    ? 'hsl(var(--cyber-green))'  :
    status === 'warning' ? 'hsl(var(--cyber-orange))' :
                           'hsl(var(--cyber-red))';

  const badgeClass =
    status === 'good'    ? 'bg-cyber-green/20 text-cyber-green'   :
    status === 'warning' ? 'bg-cyber-orange/20 text-cyber-orange' :
                           'bg-cyber-red/20 text-cyber-red';

  const areaColor =
    status === 'good'    ? '#22c55e' :
    status === 'warning' ? '#f97316' :
                           '#ef4444';

  const dashArray = `${(percentage / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  const chartData = sparkline.map((v, i) => ({ i, v }));

  return (
    <Card className="relative overflow-hidden border-border shadow-cyber hover:shadow-glow transition-cyber animate-fade-in">
      <CardHeader className="pb-2 text-center">
        <CardTitle className="text-sm font-medium text-muted-foreground mb-3">
          True Risk Score
        </CardTitle>

        {/* Pill selector */}
        <div className="flex items-center justify-center gap-1 flex-wrap">
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setSelected(opt)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                selected === opt
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        <div className="flex flex-col items-center space-y-3">
          {/* Circular gauge */}
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor"
                strokeWidth="3" className="text-muted" opacity="0.2" />
              <circle
                cx="32" cy="32" r="28" fill="none" strokeWidth="3"
                strokeDasharray={dashArray}
                strokeLinecap="round"
                className="transition-all duration-500"
                style={{ stroke: strokeColor }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-foreground">{percentage}%</span>
            </div>
          </div>

          <div className="text-center space-y-1">
            <Badge variant="secondary" className={badgeClass}>{label}</Badge>
            <div className="text-3xl font-bold text-foreground mt-1">{label}</div>
            <p className="text-sm text-muted-foreground">Livello di rischio</p>
          </div>

          {/* Sparkline */}
          <div className="w-full h-14">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={areaColor} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={areaColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={areaColor}
                  strokeWidth={2}
                  fill="url(#sparkGrad)"
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={400}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
