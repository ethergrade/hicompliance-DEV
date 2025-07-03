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
        return <Badge variant="secondary" className="bg-cyber-green/20 text-cyber-green">Buono</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="bg-cyber-orange/20 text-cyber-orange">Attenzione</Badge>;
      case 'critical':
        return <Badge variant="secondary" className="bg-cyber-red/20 text-cyber-red">Critico</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className="relative overflow-hidden border-border shadow-cyber hover:shadow-glow transition-cyber">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
          {title}
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex items-center space-x-4">
          {percentage !== undefined && (
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-muted"
                  opacity="0.2"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  strokeWidth="4"
                  strokeDasharray={`${(percentage / 100) * 175.93} 175.93`}
                  strokeLinecap="round"
                  className={`${getStatusColor()} transition-all duration-500`}
                  style={{
                    stroke: status === 'good' ? 'hsl(var(--cyber-green))' : 
                           status === 'warning' ? 'hsl(var(--cyber-orange))' : 
                           'hsl(var(--cyber-red))'
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-foreground">{percentage}%</span>
              </div>
            </div>
          )}
          <div className="flex-1">
            <div className="text-2xl font-bold text-foreground">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};