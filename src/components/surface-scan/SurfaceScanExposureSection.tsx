import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Loader2, Play, RefreshCw, RotateCw, ShieldAlert } from 'lucide-react';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import {
  fetchExposureFindingsByJobIds,
  fetchExposureJobs,
  fetchExposureSummary,
  fetchOpenPortsByJobIds,
  fetchTechnologiesByJobIds,
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

interface SurfaceScanExposureSectionProps {
  isAdmin: boolean;
}

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

const toTimestamp = (value: string | null | undefined): number => {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
};

const dedupeOpenPortsRows = (rows: ExposureOpenPortRow[]): ExposureOpenPortRow[] => {
  const map = new Map<string, ExposureOpenPortRow>();
  for (const row of rows || []) {
    const key = [
      String(row.host || '').toLowerCase(),
      String(row.ip || '').toLowerCase(),
      Number(row.port || 0),
      String(row.protocol || 'tcp').toLowerCase(),
    ].join('|');
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    if (toTimestamp(row.last_seen_at) >= toTimestamp(existing.last_seen_at)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => Number(a.port || 0) - Number(b.port || 0));
};

const dedupeTechnologiesRows = (rows: ExposureTechnologyRow[]): ExposureTechnologyRow[] => {
  const map = new Map<string, ExposureTechnologyRow>();
  for (const row of rows || []) {
    const key = [
      String(row.host || '').toLowerCase(),
      String(row.url || '').toLowerCase(),
      String(row.technology_name || '').toLowerCase(),
      String(row.technology_version || '').toLowerCase(),
    ].join('|');
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    if (toTimestamp(row.created_at) >= toTimestamp(existing.created_at)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
};

const dedupeFindingsRows = (rows: ExposureFindingRow[]): ExposureFindingRow[] => {
  const map = new Map<string, ExposureFindingRow>();
  for (const row of rows || []) {
    const cves = (row.cve_ids || []).map((entry) => String(entry || '').toUpperCase()).sort().join(',');
    const key = [
      String(row.finding_type || '').toLowerCase(),
      String(row.title || '').toLowerCase(),
      String(row.affected_host || '').toLowerCase(),
      String(row.affected_url || '').toLowerCase(),
      Number(row.affected_port || 0),
      cves,
      String(row.severity || '').toLowerCase(),
    ].join('|');
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    if (toTimestamp(row.created_at) >= toTimestamp(existing.created_at)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at));
};

export const SurfaceScanExposureSection: React.FC<SurfaceScanExposureSectionProps> = ({ isAdmin }) => {
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
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(true);
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(false);

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

  const refreshData = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [jobsData, summaryData] = await Promise.all([
        fetchExposureJobs(organizationId, 50),
        fetchExposureSummary({
          customerId: organizationId,
          scopeMode: 'scope_latest_per_target',
        }),
      ]);

      setJobs(jobsData);
      const fallbackSelected = String(jobsData[0]?.id || '');
      setSelectedJobId((prev) => prev || fallbackSelected);
      setSummary(summaryData);

      const effectiveJobIds = (summaryData.job_ids || []).map((entry) => String(entry || '').trim()).filter(Boolean);
      if (effectiveJobIds.length === 0 && summaryData.job_id) {
        effectiveJobIds.push(String(summaryData.job_id));
      }

      const [portsData, techData, findingsData] = await Promise.all([
        fetchOpenPortsByJobIds(effectiveJobIds),
        fetchTechnologiesByJobIds(effectiveJobIds),
        fetchExposureFindingsByJobIds(effectiveJobIds),
      ]);
      setOpenPorts(dedupeOpenPortsRows(portsData));
      setTechnologies(dedupeTechnologiesRows(techData));
      setFindings(dedupeFindingsRows(findingsData));
    } catch (error: any) {
      console.error('Exposure refresh error:', error);
      toast.error('Impossibile caricare dati exposure', {
        description: error?.message || 'Errore di caricamento',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

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
      await refreshData();
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
      await refreshData();
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
      await refreshData();
    } catch (error: any) {
      toast.error('Resync non riuscito', {
        description: error?.message || 'Errore durante resync',
      });
    } finally {
      setPolling(false);
    }
  };

  return (
    <Card className="border-border" id="surface-scan-exposure-unified">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-xl">Ports & Technologies (Scope Unificato)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Dati exposure consolidati su tutti i target in scope (latest-per-target).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshData}
              disabled={loading || polling}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Aggiorna
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSectionCollapsed((prev) => !prev)}
            >
              {isSectionCollapsed ? <ChevronRight className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
              {isSectionCollapsed ? 'Espandi' : 'Collassa'}
            </Button>
          </div>
        </div>
      </CardHeader>

      {!isSectionCollapsed && (
        <CardContent className="space-y-5">
          <ExposureKpiCards summary={summary} />
          <ExposureCharts summary={summary} openPorts={openPorts} technologies={technologies} />

          {isAdmin && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Controlli avanzati Exposure (Admin)</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsControlsCollapsed((prev) => !prev)}
                  >
                    {isControlsCollapsed ? <ChevronRight className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                    {isControlsCollapsed ? 'Espandi' : 'Collassa'}
                  </Button>
                </div>
              </CardHeader>
              {!isControlsCollapsed && (
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
                      <Label>Public IPs (CSV)</Label>
                      <Input value={publicIpsInput} onChange={(event) => setPublicIpsInput(event.target.value)} placeholder="203.0.113.10, 203.0.113.20" />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <label className="flex items-center gap-2"><Checkbox checked={includeSubDiscovery} onCheckedChange={(v) => setIncludeSubDiscovery(Boolean(v))} />Subdomain discovery</label>
                    <label className="flex items-center gap-2"><Checkbox checked={includePortScan} onCheckedChange={(v) => setIncludePortScan(Boolean(v))} />Port scan</label>
                    <label className="flex items-center gap-2"><Checkbox checked={includeWebTech} onCheckedChange={(v) => setIncludeWebTech(Boolean(v))} />Web technologies</label>
                    <label className="flex items-center gap-2"><Checkbox checked={includeSsl} onCheckedChange={(v) => setIncludeSsl(Boolean(v))} />SSL/TLS</label>
                    <label className="flex items-center gap-2"><Checkbox checked={includeNetworkVuln} onCheckedChange={(v) => setIncludeNetworkVuln(Boolean(v))} />Network vulnerability scan</label>
                    <label className="flex items-center gap-2"><Checkbox checked={detectOs} onCheckedChange={(v) => setDetectOs(Boolean(v))} />OS detection</label>
                    <label className="flex items-center gap-2"><Checkbox checked={detectServiceVersion} onCheckedChange={(v) => setDetectServiceVersion(Boolean(v))} />Service version</label>
                    <label className="flex items-center gap-2"><Checkbox checked={checkAlive} onCheckedChange={(v) => setCheckAlive(Boolean(v))} />Check alive</label>
                    <label className="flex items-center gap-2"><Checkbox checked={traceroute} onCheckedChange={(v) => setTraceroute(Boolean(v))} />Traceroute</label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={handleStartScan} disabled={startingScan}>
                      {startingScan ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                      Avvia scansione exposure
                    </Button>
                    <Button variant="outline" onClick={handlePoll} disabled={polling}>
                      {polling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCw className="w-4 h-4 mr-2" />}
                      Poll scans
                    </Button>
                    <Button variant="outline" onClick={handleResync} disabled={!selectedJobId || polling}>
                      <ShieldAlert className="w-4 h-4 mr-2" />
                      Resync job selezionato
                    </Button>
                  </div>

                  {selectedJob && (
                    <div className="rounded-lg border border-border p-3 text-sm flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">Job: {selectedJob.id}</Badge>
                      <Badge variant="outline">Stato: {statusLabel(String(selectedJob.status || ''))}</Badge>
                      <Badge variant="outline">Progress: {statusProgress(String(selectedJob.status || ''))}%</Badge>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          <OpenPortsTable rows={openPorts} />
          <TechnologiesTable rows={technologies} />
          <ExposureFindingsTable rows={findings} />
        </CardContent>
      )}
    </Card>
  );
};

export default SurfaceScanExposureSection;
