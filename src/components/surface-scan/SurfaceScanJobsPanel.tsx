import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSurfaceScan360Jobs } from '@/hooks/useSurfaceScan360';
import { Play, AlertTriangle, CheckCircle, Clock, XCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const statusIcon: Record<string, React.ReactNode> = {
  queued: <Clock className="h-4 w-4 text-muted-foreground" />,
  running: <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  partial: <CheckCircle className="h-4 w-4 text-yellow-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
};

const statusTone: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
  partial: 'bg-yellow-50 text-yellow-700',
  failed: 'bg-red-50 text-red-700',
};

export function SurfaceScanJobsPanel() {
  const { list, create } = useSurfaceScan360Jobs();

  const handleStart = async () => {
    const target = window.prompt('Inserisci target (dominio, IP o URL):');
    if (!target) return;
    try {
      await create.mutateAsync({ target, scan_profile: 'standard' });
      toast.success('Scansione SurfaceScan360 accodata');
    } catch (e: any) {
      toast.error('Errore avvio scansione: ' + (e.message || 'unknown'));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Jobs SurfaceScan360</CardTitle>
        <Button size="sm" onClick={handleStart} disabled={create.isPending}>
          <Play className="h-4 w-4 mr-1" />
          {create.isPending ? 'Accodamento...' : 'Nuova scansione'}
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
            Errore caricamento jobs
          </div>
        )}
        {(list.data || []).length === 0 && !list.isLoading && (
          <p className="text-sm text-muted-foreground">Nessuna scansione registrata.</p>
        )}
        {(list.data || []).map((job: any) => (
          <div
            key={job.id}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <div className="flex items-center gap-2">
              {statusIcon[job.status] || statusIcon.queued}
              <div>
                <p className="font-medium">{job.normalized_target || job.raw_target}</p>
                <p className="text-xs text-muted-foreground">
                  {job.started_at ? new Date(job.started_at).toLocaleString('it-IT') : 'In attesa'}
                  {' · '}
                  {job.scan_profile}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {job.summary && (
                <span className="text-xs text-muted-foreground">
                  Score {job.summary.overall_score} ({job.summary.risk_level})
                </span>
              )}
              <Badge className={statusTone[job.status] || statusTone.queued}>
                {job.status}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
