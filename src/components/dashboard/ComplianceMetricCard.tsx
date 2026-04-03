import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

type YearRange = '1y' | '2y' | '3y' | '4y';

const YEAR_OPTIONS: YearRange[] = ['1y', '2y', '3y', '4y'];

const COMPLIANCE_DATA: Record<YearRange, { percentage: number; label: string; status: 'critical' | 'warning' | 'good' }> = {
  '1y': { percentage: 78, label: 'Buono',    status: 'good'     },
  '2y': { percentage: 65, label: 'Moderato', status: 'warning'  },
  '3y': { percentage: 52, label: 'Moderato', status: 'warning'  },
  '4y': { percentage: 38, label: 'Basso',    status: 'critical' },
};

const RISK_DATA: Record<YearRange, { percentage: number; label: string; status: 'critical' | 'warning' | 'good' }> = {
  '1y': { percentage: 28, label: 'Basso',    status: 'good'     },
  '2y': { percentage: 45, label: 'Moderato', status: 'warning'  },
  '3y': { percentage: 62, label: 'Alto',     status: 'warning'  },
  '4y': { percentage: 81, label: 'Critico',  status: 'critical' },
};

const CIRCUMFERENCE = 2 * Math.PI * 28;

const getColor = (status: string) =>
  status === 'good'    ? 'hsl(var(--cyber-green))'  :
  status === 'warning' ? 'hsl(var(--cyber-orange))' :
                         'hsl(var(--cyber-red))';

const getBadgeClass = (status: string) =>
  status === 'good'    ? 'bg-cyber-green/20 text-cyber-green'   :
  status === 'warning' ? 'bg-cyber-orange/20 text-cyber-orange' :
                         'bg-cyber-red/20 text-cyber-red';

export const ComplianceMetricCard: React.FC = () => {
  const [selected, setSelected] = useState<YearRange>('1y');
  const compliance = COMPLIANCE_DATA[selected];
  const navigate = useNavigate();
  const risk = RISK_DATA[selected];

  const renderGauge = (percentage: number, status: string) => {
    const dashArray = `${(percentage / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
    return (
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor"
            strokeWidth="3" className="text-muted" opacity="0.2" />
          <circle
            cx="32" cy="32" r="28" fill="none" strokeWidth="3"
            strokeDasharray={dashArray}
            strokeLinecap="round"
            className="transition-all duration-500"
            style={{ stroke: getColor(status) }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-foreground">{percentage}%</span>
        </div>
      </div>
    );
  };

  return (
    <Card className="relative overflow-hidden border-border shadow-cyber hover:shadow-glow transition-cyber animate-fade-in">
      <CardHeader className="pb-2 text-center">
        <CardTitle className="text-sm font-medium text-muted-foreground mb-3">
          Conformità & Rischio Assessment
        </CardTitle>
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

      <CardContent className="pb-5">
        <div className="grid grid-cols-2 divide-x divide-border">
          {/* Conformità */}
          <div className="flex flex-col items-center space-y-2 pr-3">
            <p className="text-xs font-medium text-muted-foreground">Conformità NIS2/NIST/ISO</p>
            {renderGauge(compliance.percentage, compliance.status)}
            <Badge variant="secondary" className={`text-[10px] ${getBadgeClass(compliance.status)}`}>
              {compliance.label}
            </Badge>
            <p className="text-xs text-muted-foreground">Conformità generale</p>
          </div>

          {/* Rischio da Assessment */}
          <div className="flex flex-col items-center space-y-2 pl-3">
            <p className="text-xs font-medium text-muted-foreground">Rischio da Assessment</p>
            {renderGauge(risk.percentage, risk.status)}
            <Badge variant="secondary" className={`text-[10px] ${getBadgeClass(risk.status)}`}>
              {risk.label}
            </Badge>
            <p className="text-xs text-muted-foreground">Livello di rischio</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
