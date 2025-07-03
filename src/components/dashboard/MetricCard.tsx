import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
interface MetricCardProps {
  title: string;
  value: string | number;
  percentage?: number;
  status?: 'good' | 'warning' | 'critical';
  description?: string;
  trend?: 'up' | 'down' | 'stable';
}
export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  percentage,
  status = 'good',
  description,
  trend
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'good':
        return 'bg-gradient-success';
      case 'warning':
        return 'bg-cyber-orange';
      case 'critical':
        return 'bg-gradient-risk';
      default:
        return 'bg-gradient-cyber';
    }
  };
  const getStatusBadge = () => {
    switch (status) {
      case 'good':
        return <Badge variant="secondary" className="bg-cyber-green/20 text-cyber-green text-center">Buono</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="bg-cyber-orange/20 text-cyber-orange text-center">Attenzione</Badge>;
      case 'critical':
        return <Badge variant="secondary" className="bg-cyber-red/20 text-cyber-red text-center">Critico</Badge>;
      default:
        return null;
    }
  };
  return <Card className="relative overflow-hidden border-border shadow-cyber hover:shadow-glow transition-cyber animate-fade-in">
      <CardHeader className="pb-3 text-center">
        <CardTitle className="text-sm font-medium text-muted-foreground mb-2">
          {title}
        </CardTitle>
        {getStatusBadge()}
      </CardHeader>
      <CardContent className="pb-6">
        {percentage !== undefined ?
      // Layout con percentuale e cerchio
      <div className="flex flex-col items-center space-y-4">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" opacity="0.2" />
                <circle cx="32" cy="32" r="28" fill="none" strokeWidth="3" strokeDasharray={`${percentage / 100 * 175.93} 175.93`} strokeLinecap="round" className="transition-all duration-500" style={{
              stroke: status === 'good' ? 'hsl(var(--cyber-green))' : status === 'warning' ? 'hsl(var(--cyber-orange))' : 'hsl(var(--cyber-red))'
            }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-foreground">{percentage}%</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground mb-2">{value}</div>
              {description && <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>}
            </div>
          </div> :
      // Layout senza percentuale - solo valore centrato
      <div className="text-center space-y-3">
            <div className="text-4xl font-bold text-foreground">{value}</div>
            {description && <p className="text-sm text-muted-foreground leading-relaxed px-2">{description}</p>}
          </div>}
      </CardContent>
    </Card>;
};