import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { presentDarkRiskSource } from '@/lib/darkrisk/presentation';

type AlertItem = {
  id: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  asset: string | null;
  type: string;
  time: string | null;
  status: string;
  confidence: string;
  source: string;
  finding_id?: string | null;
};

const severityClasses: Record<AlertItem['severity'], string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  info: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('it-IT');
};

export const DarkRiskRecentAlerts: React.FC<{
  alerts: AlertItem[];
  onOpenFinding: (findingId: string, fallbackType: string) => void;
}> = ({ alerts, onOpenFinding }) => {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle>Alert Recenti</CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessun risultato aggiuntivo rilevante nel ciclo DarkRisk360 corrente.
          </p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/70">
                <Badge className={severityClasses[alert.severity]}>{alert.severity}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{alert.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {alert.type}
                    {alert.asset ? ` • ${alert.asset}` : ''}
                    {alert.source ? ` • ${presentDarkRiskSource(alert.source)}` : ''}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(alert.time)}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenFinding(String(alert.finding_id || alert.id), alert.type)}
                >
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  Vedi finding
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
