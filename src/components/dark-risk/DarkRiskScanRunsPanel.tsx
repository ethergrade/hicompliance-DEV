import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDarkRiskScanRuns } from '@/hooks/useDarkRiskScanRuns';
import { RefreshCw, Play, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const statusIcon: Record<string, React.ReactNode> = {
  queued: <Clock className="h-4 w-4 text-muted-foreground" />,
  running: <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  completed_with_warnings: <CheckCircle className="h-4 w-4 text-yellow-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  cancelled: <XCircle className="h-4 w-4 text-gray-400" />,
};

const statusTone: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
  completed_with_warnings: 'bg-yellow-50 text-yellow-700',
  failed: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-50 text-gray-500',
};

export function DarkRiskScanRunsPanel() {
  const { list, create } = useDarkRiskScanRuns();

  const handleStart = async () => {
    try {
      await create.mutateAsync({ notes: 'Avviata manualmente da HiConsole' });
      toast.success('Scansione DarkRisk360 accodata');
    } catch (e: any) {
      toast.error('Errore avvio scansione: ' + (e.message || 'unknown'));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Scan Runs</CardTitle>
        <Button size="sm" onClick={handleStart} disabled={create.isPending}>
          <Play className="h-4 w-4 mr-1" />
          {create.isPending ? 'Accodamento...' : 'Avvia scansione'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {list.isError && (
          <div className="text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Errore caricamento scan runs
          </div>
        )}
        {(list.data || []).length === 0 && !list.isLoading && (
          <p className="text-sm text-muted-foreground">Nessuna scansione registrata.</p>
        )}
        {(list.data || []).map((run: any) => (
          <div
            key={run.id}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <div className="flex items-center gap-2">
              {statusIcon[run.status] || statusIcon.queued}
              <div>
                <p className="font-medium">{run.trigger_type || 'manuale'}</p>
                <p className="text-xs text-muted-foreground">
                  {run.started_at ? new Date(run.started_at).toLocaleString('it-IT') : 'In attesa'}
                </p>
              </div>
            </div>
            <Badge className={statusTone[run.status] || statusTone.queued}>
              {run.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
