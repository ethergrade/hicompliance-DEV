import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useDarkRiskWeeklyTrend } from '@/hooks/useDarkRiskWeeklyTrend';

const deltaLabel = (latest: number, previous: number): string => {
  const delta = latest - previous;
  if (delta === 0) return 'Nessuna variazione';
  return delta > 0 ? `+${delta}` : `${delta}`;
};

export const DarkRiskWeeklyTrend: React.FC = () => {
  const { data, isLoading, latest, previous } = useDarkRiskWeeklyTrend(12);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Trend settimanale DarkRisk360
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Badge variant="outline">Frequenza: settimanale</Badge>
            <Badge variant="secondary">Snapshot: {data.length}</Badge>
            {latest && previous && (
              <Badge variant="outline">
                Δ rischio: {deltaLabel(latest.risk_score_avg, previous.risk_score_avg)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento trend settimanale...</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuno storico DarkRisk360 disponibile.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Rischio medio ultima settimana</p>
                <p className="text-xl font-semibold">{latest?.risk_score_avg ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Finding ultima settimana</p>
                <p className="text-xl font-semibold">{latest?.findings_total ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">High/Critical ultima settimana</p>
                <p className="text-xl font-semibold text-destructive">{latest?.high_critical ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Segnali DTI ultima settimana</p>
                <p className="text-xl font-semibold">{latest?.dti_signals ?? 0}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="h-64 rounded-lg border border-border/70 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week_label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="risk_score_avg" name="Rischio medio" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="findings_total" name="Finding totali" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="h-64 rounded-lg border border-border/70 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week_label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="high_critical" name="High/Critical" stackId="sev" fill="hsl(var(--destructive))" />
                    <Bar dataKey="medium" name="Medium" stackId="sev" fill="hsl(var(--chart-4))" />
                    <Bar dataKey="low_info" name="Low/Info" stackId="sev" fill="hsl(var(--chart-3))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DarkRiskWeeklyTrend;
