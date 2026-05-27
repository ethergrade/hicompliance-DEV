import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { TrendingUp, Calendar, PlayCircle, Loader2 } from 'lucide-react';
import { useSurfaceScanHistory, triggerManualSurfaceScan } from '@/hooks/useSurfaceScanHistory';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export const SurfaceScanTrendline: React.FC = () => {
  const { data: history, isLoading } = useSurfaceScanHistory(12);
  const { organizationId } = useClientOrganization();
  const qc = useQueryClient();
  const [running, setRunning] = React.useState(false);

  const handleManualScan = async () => {
    if (!organizationId) return;
    setRunning(true);
    try {
      const res = await triggerManualSurfaceScan(organizationId);
      toast.success('Scansione completata', {
        description: `${res?.results?.[0]?.total_assets ?? 0} asset analizzati`,
      });
      await qc.invalidateQueries({ queryKey: ['surface-scan-history'] });
    } catch (e: any) {
      toast.error('Errore scansione', { description: e?.message ?? 'Riprova più tardi' });
    } finally {
      setRunning(false);
    }
  };

  const chartData = (history ?? []).map((s) => ({
    date: new Date(s.scanned_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }),
    score: s.avg_score,
    critici: s.critical_count,
    attenzione: s.warning_count,
    sicuri: s.safe_count,
    cve: s.high_cves + s.medium_cves + s.low_cves,
  }));

  const lastSnap = history?.[history.length - 1];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Trendline scansioni settimanali
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            <Calendar className="inline w-3 h-3 mr-1" />
            Cron automatico ogni lunedì alle 04:00 UTC · snapshot salvati su Supabase
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastSnap && (
            <Badge variant="outline" className="text-xs">
              Ultima: {new Date(lastSnap.scanned_at).toLocaleString('it-IT')}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={handleManualScan} disabled={running || !organizationId}>
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            Esegui ora
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Caricamento storico...</div>
        ) : chartData.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-lg">
            Nessuno snapshot ancora disponibile. Lancia una scansione manuale o attendi il prossimo cron settimanale.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Score medio</p>
                <p className="text-2xl font-bold">{lastSnap?.avg_score?.toFixed(1) ?? '-'}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Asset analizzati</p>
                <p className="text-2xl font-bold">{lastSnap?.total_assets}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Critici</p>
                <p className="text-2xl font-bold text-destructive">{lastSnap?.critical_count}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">CVE totali</p>
                <p className="text-2xl font-bold">{(lastSnap?.high_cves ?? 0) + (lastSnap?.medium_cves ?? 0) + (lastSnap?.low_cves ?? 0)}</p>
              </div>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <RechartsTooltip
                    contentStyle={{
                      background: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="score" name="Score medio" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="critici" name="Critici" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="cve" name="CVE" stroke="hsl(var(--accent-foreground))" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
