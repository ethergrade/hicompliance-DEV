import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const DATA = {
  percentage: 35,
  label: 'Basso',
  status: 'good' as const,
  sparkline: [48, 42, 38, 35],
};

const CIRCUMFERENCE = 2 * Math.PI * 28;

export const RiskScoreMetricCard: React.FC = () => {
  const { percentage, label, status, sparkline } = DATA;

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
