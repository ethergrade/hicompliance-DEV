import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, PlayCircle, Eye, AlertTriangle, Server, Users, Shield } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  useStartSurfaceScan,
  useSurfaceEngineJobs,
  useSurfaceObservations,
  useSurfaceEngineFindings,
  useSurfaceExternalIntel,
  type SurfaceFinding,
} from '@/hooks/useSurfaceScanEngine';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const severityColor: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-red-500 text-white',
  medium: 'bg-amber-500 text-white',
  low: 'bg-yellow-400 text-black',
  info: 'bg-muted text-foreground',
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  queued: 'secondary',
  running: 'default',
  completed: 'outline',
  partial: 'secondary',
  failed: 'destructive',
};

export const OsintEnrichmentTab = () => {
  const { toast } = useToast();
  const [target, setTarget] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [findingDetail, setFindingDetail] = useState<SurfaceFinding | null>(null);

  const startScan = useStartSurfaceScan();
  const { data: jobs = [], isLoading: jobsLoading } = useSurfaceEngineJobs();
  const { data: observations = [] } = useSurfaceObservations(selectedJobId ?? undefined);
  const { data: findings = [] } = useSurfaceEngineFindings(selectedJobId ?? undefined);
  const { data: intel = [] } = useSurfaceExternalIntel(selectedJobId ?? undefined);

  const handleStart = async () => {
    if (!target.trim()) {
      toast({ title: 'Target richiesto', description: 'Inserisci un dominio o URL', variant: 'destructive' });
      return;
    }
    try {
      const res = await startScan.mutateAsync({ target: target.trim() });
      toast({ title: 'Scan avviato', description: `Job ${res.job_id?.slice(0, 8)} in coda` });
      setTarget('');
      if (res.job_id) setSelectedJobId(res.job_id);
    } catch (e) {
      toast({ title: 'Errore', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const observationsByModule = observations.reduce<Record<string, typeof observations>>((acc, o) => {
    (acc[o.module] = acc[o.module] || []).push(o);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>OSINT Enrichment Engine</CardTitle>
          <CardDescription>
            Scan passivo (safe_recon): DNS, HTTP/security headers, HSTS, robots.txt, security.txt, sitemap, redirect chain, mail security (SPF/DMARC/BIMI). Nessuna scansione intrusiva.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 items-center min-w-0">
            <Input
              placeholder="es. esempio.com oppure https://www.esempio.com/path"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              className="flex-1 min-w-0"
            />
            <Button onClick={handleStart} disabled={startScan.isPending}>
              {startScan.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              Avvia scan
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            L'avvio implica conferma di autorizzazione sul target. Target privati/loopback sono rifiutati.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader><CardTitle className="text-base">Job recenti</CardTitle></CardHeader>
          <CardContent>
            {jobsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Caricamento…</div>
            ) : jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun job. Avvia il primo scan qui sopra.</p>
            ) : (
              <ScrollArea className="h-[420px]">
                <div className="space-y-2 pr-2">
                  {jobs.map((j) => (
                    <button
                      key={j.id}
                      onClick={() => setSelectedJobId(j.id)}
                      className={`w-full text-left p-3 rounded-md border transition ${selectedJobId === j.id ? 'border-primary bg-accent/40' : 'border-border hover:bg-accent/20'}`}
                    >
                      <div className="flex justify-between items-start gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{j.normalized_target}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(j.created_at).toLocaleString('it-IT')} · {j.target_type}
                          </div>
                        </div>
                        <Badge variant={statusVariant[j.status] ?? 'outline'}>{j.status}</Badge>
                      </div>
                      {j.error_message && (
                        <div className="text-xs text-destructive mt-1 truncate">{j.error_message}</div>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">Risultati job</CardTitle>
            <CardDescription>{selectedJobId ? `Job ${selectedJobId.slice(0, 8)}` : 'Seleziona un job a sinistra'}</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedJobId ? (
              <p className="text-sm text-muted-foreground">Nessun job selezionato.</p>
            ) : (
              <Tabs defaultValue="findings">
                <TabsList>
                  <TabsTrigger value="findings">Findings ({findings.length})</TabsTrigger>
                  <TabsTrigger value="observations">Observations ({observations.length})</TabsTrigger>
                  <TabsTrigger value="intel">Intel ({intel.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="findings" className="mt-3">
                  {findings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessun finding (scan in corso o pulito).</p>
                  ) : (
                    <ScrollArea className="h-[380px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Severity</TableHead>
                            <TableHead>Titolo</TableHead>
                            <TableHead>Modulo</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {findings.map((f) => (
                            <TableRow key={f.id}>
                              <TableCell><span className={`px-2 py-0.5 rounded text-xs ${severityColor[f.severity] ?? ''}`}>{f.severity}</span></TableCell>
                              <TableCell className="font-medium">{f.title}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{f.module}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" onClick={() => setFindingDetail(f)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </TabsContent>
                <TabsContent value="observations" className="mt-3">
                  {observations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessuna observation.</p>
                  ) : (
                    <ScrollArea className="h-[380px]">
                      <div className="space-y-3 pr-2">
                        {Object.entries(observationsByModule).map(([module, obs]) => (
                          <div key={module} className="border rounded-md p-3">
                            <div className="font-medium text-sm capitalize mb-2">{module.replace(/_/g, ' ')}</div>
                            {obs.map((o) => (
                              <pre key={o.id} className="text-[11px] bg-muted/40 p-2 rounded overflow-auto max-h-48">
                                {JSON.stringify(o.value, null, 2)}
                              </pre>
                            ))}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>
                <TabsContent value="intel" className="mt-3">
                  {intel.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessuna intel esterna disponibile.</p>
                  ) : (
                    <ScrollArea className="h-[380px]">
                      <div className="space-y-3 pr-2">
                        {intel.map((i) => (
                          <div key={i.id} className="border rounded-md p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-medium text-sm capitalize">{i.provider.replace(/_/g, ' ')} — {i.target}</div>
                              <div className="flex gap-2">
                                <Badge variant={i.found ? 'default' : 'secondary'}>{i.found ? 'found' : 'not found'}</Badge>
                                <Badge variant="outline">conf. {i.confidence}</Badge>
                              </div>
                            </div>
                            <pre className="text-[11px] bg-muted/40 p-2 rounded overflow-auto max-h-48">
                              {JSON.stringify(i.summary, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!findingDetail} onOpenChange={(o) => !o && setFindingDetail(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {findingDetail && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> {findingDetail.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <div><Badge className={severityColor[findingDetail.severity]}>{findingDetail.severity}</Badge> <span className="text-muted-foreground ml-2">{findingDetail.module}</span></div>
                {findingDetail.affected_url && <div><span className="font-medium">URL: </span><span className="break-all">{findingDetail.affected_url}</span></div>}
                {findingDetail.affected_asset && <div><span className="font-medium">Asset: </span>{findingDetail.affected_asset}</div>}
                {findingDetail.description && <p>{findingDetail.description}</p>}
                {findingDetail.remediation && (
                  <div><div className="font-medium mb-1">Remediation</div><p className="text-muted-foreground">{findingDetail.remediation}</p></div>
                )}
                {findingDetail.evidence && (
                  <div><div className="font-medium mb-1">Evidence</div>
                    <pre className="text-[11px] bg-muted/40 p-2 rounded overflow-auto max-h-64">{JSON.stringify(findingDetail.evidence, null, 2)}</pre>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
