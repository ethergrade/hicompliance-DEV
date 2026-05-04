import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

const COMPLIANCE_DATA = { percentage: 78, label: 'Buono', status: 'good' as const };

const RISK_DATA = { percentage: 28, label: 'Basso', status: 'good' as const };

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
  const navigate = useNavigate();
  const compliance = COMPLIANCE_DATA;
  const risk = RISK_DATA;

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

        <button
          onClick={() => navigate('/assessment')}
          className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors py-1.5 border-t border-border"
        >
          <ExternalLink className="w-3 h-3" />
          Visualizza Assessment
        </button>
      </CardContent>
    </Card>
  );
};
