import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, Play, RefreshCw, RotateCw, ShieldAlert } from 'lucide-react';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import {
  fetchExposureFindings,
  fetchExposureJobs,
  fetchExposureSummary,
  fetchOpenPorts,
  fetchTechnologies,
  resyncExposureJob,
  startExposureScan,
  triggerExposurePoll,
  type ExposureFindingRow,
  type ExposureOpenPortRow,
  type ExposureStartRequest,
  type ExposureSummary,
  type ExposureTechnologyRow,
} from '@/lib/surfacescan/exposureApi';
import ExposureKpiCards from '@/components/surfacescan/ExposureKpiCards';
import ExposureCharts from '@/components/surfacescan/ExposureCharts';
import OpenPortsTable from '@/components/surfacescan/OpenPortsTable';
import TechnologiesTable from '@/components/surfacescan/TechnologiesTable';
import ExposureFindingsTable from '@/components/surfacescan/ExposureFindingsTable';

const csvToList = (value: string): string[] =>
  String(value || '')
    .split(/[\n,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const statusLabel = (status: string): string => {
  const key = String(status || '').toLowerCase();
  if (key === 'completed') return 'Completata';
  if (key === 'failed') return 'Fallita';
  if (key === 'running') return 'In esecuzione';
  if (key === 'queued') return 'In coda';
  return key || 'n/d';
};

const statusProgress = (status: string): number => {
  const key = String(status || '').toLowerCase();
  if (key === 'completed') return 100;
  if (key === 'failed') return 100;
  if (key === 'running') return 65;
  if (key === 'queued') return 25;
  return 10;
};

const ExposurePortsPage: React.FC = () => {
  const { organizationId } = useClientOrganization();

  const [loading, setLoading] = useState(false);
  const [startingScan, setStartingScan] = useState(false);
  const [polling, setPolling] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [summary, setSummary] = useState<ExposureSummary | null>(null);
  const [openPorts, setOpenPorts] = useState<ExposureOpenPortRow[]>([]);
  const [technologies, setTechnologies] = useState<ExposureTechnologyRow[]>([]);
  const [findings, setFindings] = useState<ExposureFindingRow[]>([]);

  const [scanName, setScanName] = useState('Exposure Full Scan');
  const [rootDomainsInput, setRootDomainsInput] = useState('');
  const [subdomainsInput, setSubdomainsInput] = useState('');
  const [publicIpsInput, setPublicIpsInput] = useState('');
  const [customPorts, setCustomPorts] = useState('top1000');

  const [includeSubDiscovery, setIncludeSubDiscovery] = useState(true);
  const [includePortScan, setIncludePortScan] = useState(true);
  const [includeWebTech, setIncludeWebTech] = useState(true);
  const [includeSsl, setIncludeSsl] = useState(true);
  const [includeNetworkVuln, setIncludeNetworkVuln] = useState(false);
  const [detectOs, setDetectOs] = useState(true);
  const [detectServiceVersion, setDetectServiceVersion] = useState(true);
  const [checkAlive, setCheckAlive] = useState(true);
  const [traceroute, setTraceroute] = useState(false);

  const selectedJob = useMemo(
    () => jobs.find((job) => String(job.id) === String(selectedJobId)) || null,
    [jobs, selectedJobId],
  );

  const refreshData = useCallback(async (options?: { keepSelection?: boolean }) => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const jobsData = await fetchExposureJobs(organizationId, 40);
      setJobs(jobsData);

      const targetJobId = options?.keepSelection && selectedJobId
        ? selectedJobId
        : String(jobsData[0]?.id || selectedJobId || '');

      if (targetJobId) {
        setSelectedJobId(targetJobId);

        const [summaryData, portsData, techData, findingsData] = await Promise.all([
          fetchExposureSummary({ customerId: organizationId, jobId: targetJobId }),
          fetchOpenPorts(targetJobId),
          fetchTechnologies(targetJobId),
          fetchExposureFindings(targetJobId),
        ]);

        setSummary(summaryData);
        setOpenPorts(portsData);
        setTechnologies(techData);
        setFindings(findingsData);
      } else {
        setSummary(null);
        setOpenPorts([]);
        setTechnologies([]);
        setFindings([]);
      }
    } catch (error: any) {
      console.error('Exposure refresh error:', error);
      toast.error('Impossibile caricare dati exposure', {
        description: error?.message || 'Errore di caricamento',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, selectedJobId]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const handleStartScan = async () => {
    if (!organizationId) {
      toast.error('Cliente non selezionato');
      return;
    }

    const rootDomains = csvToList(rootDomainsInput);
    const subdomains = csvToList(subdomainsInput);
    const publicIps = csvToList(publicIpsInput);

    if (rootDomains.length === 0 && subdomains.length === 0 && publicIps.length === 0) {
      toast.error('Inserisci almeno un dominio/sottodominio/IP pubblico');
      return;
    }

    const payload: ExposureStartRequest = {
      tenant_id: organizationId,
      customer_id: organizationId,
      scan_name: scanName.trim() || 'Exposure Full Scan',
      root_domains: rootDomains,
      subdomains,
      public_ips: publicIps,
      include_subdomain_discovery: includeSubDiscovery,
      include_port_scan: includePortScan,
      include_web_technology_detection: includeWebTech,
      include_ssl_scan: includeSsl,
      include_network_vuln_scan: includeNetworkVuln,
      scan_depth: 'custom',
      protocol: 'tcp',
      custom_ports: customPorts,
      check_alive: checkAlive,
      detect_service_version: detectServiceVersion,
      detect_os: detectOs,
      traceroute,
    };

    setStartingScan(true);
    try {
      const result = await startExposureScan(payload);
      toast.success('Scansione exposure avviata', {
        description: `Job ${result?.job_id || '-'} • Queue: ${result?.queue?.total || 0}`,
      });
      setSelectedJobId(String(result?.job_id || ''));
      await refreshData({ keepSelection: true });
    } catch (error: any) {
      toast.error('Avvio scansione non riuscito', {
        description: error?.message || 'Errore durante avvio',
      });
    } finally {
      setStartingScan(false);
    }
  };

  const handlePoll = async () => {
    setPolling(true);
    try {
      await triggerExposurePoll();
      toast.success('Poll Pentest-Tools completato');
      await refreshData({ keepSelection: true });
    } catch (error: any) {
      toast.error('Poll non riuscito', { description: error?.message || 'Errore di polling' });
    } finally {
      setPolling(false);
    }
  };

  const handleResync = async () => {
    if (!selectedJobId) {
      toast.error('Seleziona prima un job');
      return;
    }
    setPolling(true);
    try {
      await resyncExposureJob(selectedJobId);
      toast.success('Resync job avviato');
      await refreshData({ keepSelection: true });
    } catch (error: any) {
      toast.error('Resync non riuscito', {
        description: error?.message || 'Errore durante resync',
      });
    } finally {
      setPolling(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-10">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">SurfaceScan360 · Exposure</h1>
            <p className="text-sm text-muted-foreground">
              Ports & Technologies con pipeline Pentest-Tools (subdomain, port scan, web tech, SSL, network findings opzionali).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refreshData({ keepSelection: true })} disabled={loading || polling}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Aggiorna
            </Button>
            <Button variant="outline" onClick={handlePoll} disabled={polling}>
              {polling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCw className="w-4 h-4 mr-2" />}
              Poll scans
            </Button>
          </div>
        </div>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Start Scan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome scansione</Label>
                <Input value={scanName} onChange={(event) => setScanName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Profilo porte (custom_ports)</Label>
                <Input value={customPorts} onChange={(event) => setCustomPorts(event.target.value)} placeholder="top1000 oppure 22,80,443,8443" />
              </div>
              <div className="space-y-2">
                <Label>Root domains (CSV)</Label>
                <Input value={rootDomainsInput} onChange={(event) => setRootDomainsInput(event.target.value)} placeholder="example.com, azienda.it" />
              </div>
              <div className="space-y-2">
                <Label>Subdomains (CSV)</Label>
                <Input value={subdomainsInput} onChange={(event) => setSubdomainsInput(event.target.value)} placeholder="api.example.com, vpn.example.com" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>IP pubblici (CSV)</Label>
                <Input value={publicIpsInput} onChange={(event) => setPublicIpsInput(event.target.value)} placeholder="203.0.113.10, 198.51.100.25" />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={includeSubDiscovery} onCheckedChange={(checked) => setIncludeSubDiscovery(Boolean(checked))} /> Subdomain Discovery</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={includePortScan} onCheckedChange={(checked) => setIncludePortScan(Boolean(checked))} /> Port Scan</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={includeWebTech} onCheckedChange={(checked) => setIncludeWebTech(Boolean(checked))} /> Web Technology Detection</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={includeSsl} onCheckedChange={(checked) => setIncludeSsl(Boolean(checked))} /> SSL Scan</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={includeNetworkVuln} onCheckedChange={(checked) => setIncludeNetworkVuln(Boolean(checked))} /> Deep Vulnerability Validation (Network Scanner)</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={checkAlive} onCheckedChange={(checked) => setCheckAlive(Boolean(checked))} /> check_alive</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={detectServiceVersion} onCheckedChange={(checked) => setDetectServiceVersion(Boolean(checked))} /> detect_service_version</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={detectOs} onCheckedChange={(checked) => setDetectOs(Boolean(checked))} /> detect_os</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={traceroute} onCheckedChange={(checked) => setTraceroute(Boolean(checked))} /> traceroute</label>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleStartScan} disabled={startingScan}>
                {startingScan ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Avvia scansione exposure
              </Button>
              {selectedJobId && (
                <Button variant="outline" onClick={handleResync} disabled={polling}>
                  <RotateCw className="w-4 h-4 mr-2" />
                  Resync job
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Scan Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun job exposure disponibile.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {jobs.slice(0, 20).map((job) => {
                    const isSelected = String(job.id) === String(selectedJobId);
                    return (
                      <Button
                        key={job.id}
                        size="sm"
                        variant={isSelected ? 'default' : 'outline'}
                        onClick={() => {
                          setSelectedJobId(String(job.id));
                        }}
                      >
                        {job.scan_name || job.id.slice(0, 8)}
                      </Button>
                    );
                  })}
                </div>

                {selectedJob && (
                  <div className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge>{statusLabel(String(selectedJob.status || ''))}</Badge>
                      <Badge variant="secondary">{selectedJob.scan_profile || '-'}</Badge>
                      <Badge variant="secondary">{selectedJob.scan_type || '-'}</Badge>
                      <span className="text-xs text-muted-foreground">Creata: {new Date(selectedJob.created_at).toLocaleString('it-IT')}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-2 bg-primary"
                        style={{ width: `${statusProgress(String(selectedJob.status || ''))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <ExposureKpiCards summary={summary} loading={loading} />

        <ExposureCharts
          summary={summary}
          openPorts={openPorts}
          technologies={technologies}
        />

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Delta Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            {summary ? (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase">Nuove porte</p>
                  <p className="text-2xl font-semibold">{summary.diff?.new_open_ports?.length || 0}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase">Porte chiuse</p>
                  <p className="text-2xl font-semibold">{summary.diff?.closed_ports?.length || 0}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase">Stabili</p>
                  <p className="text-2xl font-semibold">{summary.diff?.unchanged_ports?.length || 0}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase">Nuove tech</p>
                  <p className="text-2xl font-semibold">{summary.diff?.new_technologies?.length || 0}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase">Tech rimosse</p>
                  <p className="text-2xl font-semibold">{summary.diff?.removed_technologies?.length || 0}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nessun delta disponibile.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Open Ports</CardTitle>
          </CardHeader>
          <CardContent>
            <OpenPortsTable rows={openPorts} loading={loading} />
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Technologies</CardTitle>
          </CardHeader>
          <CardContent>
            <TechnologiesTable rows={technologies} loading={loading} />
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              <CardTitle>Exposure Findings</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ExposureFindingsTable rows={findings} loading={loading} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ExposurePortsPage;

