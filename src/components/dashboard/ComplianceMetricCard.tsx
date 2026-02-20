import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type YearRange = '1y' | '2y' | '3y' | '4y';

const YEAR_OPTIONS: YearRange[] = ['1y', '2y', '3y', '4y'];

const DATA: Record<YearRange, { percentage: number; label: string; status: 'critical' | 'warning' | 'good' }> = {
  '1y': { percentage: 38, label: 'Basso',    status: 'critical' },
  '2y': { percentage: 52, label: 'Moderato', status: 'warning'  },
  '3y': { percentage: 65, label: 'Moderato', status: 'warning'  },
  '4y': { percentage: 78, label: 'Buono',    status: 'good'     },
};

const CIRCUMFERENCE = 2 * Math.PI * 28; // r=28

export const ComplianceMetricCard: React.FC = () => {
  const [selected, setSelected] = useState<YearRange>('2y');
  const { percentage, label, status } = DATA[selected];

  const strokeColor =
    status === 'good'     ? 'hsl(var(--cyber-green))'  :
    status === 'warning'  ? 'hsl(var(--cyber-orange))' :
                            'hsl(var(--cyber-red))';

  const badgeClass =
    status === 'good'    ? 'bg-cyber-green/20 text-cyber-green'   :
    status === 'warning' ? 'bg-cyber-orange/20 text-cyber-orange' :
                           'bg-cyber-red/20 text-cyber-red';

  const dashArray = `${(percentage / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;

  return (
    <Card className="relative overflow-hidden border-border shadow-cyber hover:shadow-glow transition-cyber animate-fade-in">
      <CardHeader className="pb-2 text-center">
        <CardTitle className="text-sm font-medium text-muted-foreground mb-3">
          Conformità NIS2/NIST/ISO
        </CardTitle>

        {/* Pill selector */}
        <div className="flex items-center justify-center gap-1">
          {YEAR_OPTIONS.map((opt) => (
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

      <CardContent className="pb-6">
        <div className="flex flex-col items-center space-y-4">
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
            <div className="text-3xl font-bold text-foreground mt-2">{label}</div>
            <p className="text-sm text-muted-foreground">Conformità generale</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
