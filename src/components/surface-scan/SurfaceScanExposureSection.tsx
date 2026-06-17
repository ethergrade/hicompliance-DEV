import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
// Status: exposure-findings migrated to backend API. Remaining: module_results, observations (no backend endpoints)
import { surfaceScan360Api } from '@/lib/api/surface-scan360';
import {
  fetchExposureFindingsByJobIds,
  fetchExposureJobs,
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

const normalizeScopeDomain = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');

const normalizeScopeIp = (value: string): string => String(value || '').trim();

const targetMatchKey = (value: string): string => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return String(parsed.hostname || raw).trim().toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
};

const exposureSeverityClass = (severity: string): string => {
  const key = String(severity || '').toLowerCase();
  if (key === 'critical') return 'bg-red-500/20 text-red-300 border-red-500/30';
  if (key === 'high') return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
  if (key === 'medium') return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
  if (key === 'low') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
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
  const { organizationId, groupId } = useClientOrganization();
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
  const [targetSnapshots, setTargetSnapshots] = useState<ExposureSummary['target_snapshots']>([]);

  const [scanName, setScanName] = useState('Exposure Full Scan');
  const [customPorts, setCustomPorts] = useState('top1000');
  const [scopeDomains, setScopeDomains] = useState<string[]>([]);
  const [scopePublicIps, setScopePublicIps] = useState<string[]>([]);
  const autoStartAttemptedRef = useRef(false);

  const fullControls = useMemo(
    () => ({
      includeSubDiscovery: true,
      includePortScan: true,
      includeWebTech: true,
      includeSsl: true,
      includeNetworkVuln: false,
      detectOs: true,
      detectServiceVersion: true,
      checkAlive: true,
      traceroute: false,
    }),
    [],
  );

  const assetPortList = useMemo(() => {
    const grouped = new Map<string, {
      key: string;
      label: string;
      ports: ExposureOpenPortRow[];
      ips: Set<string>;
    }>();

    const ensureGroup = (key: string, label: string) => {
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          label,
          ports: [],
          ips: new Set<string>(),
        });
      }
      return grouped.get(key)!;
    };

    for (const snapshot of targetSnapshots || []) {
      const label = String(snapshot?.target_value || '').trim();
      if (!label) continue;
      const key = targetMatchKey(label);
      if (!key) continue;
      ensureGroup(key, label);
    }

    for (const row of openPorts || []) {
      const host = String(row.host || '').trim();
      if (!host) continue;
      const key = targetMatchKey(host);
      if (!key) continue;
      const group = ensureGroup(key, host);
      group.ports.push(row);
      if (row.ip) group.ips.add(String(row.ip));
    }

    return Array.from(grouped.values())
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        ips: Array.from(entry.ips.values()).sort((a, b) => a.localeCompare(b)),
        ports: [...entry.ports].sort((a, b) => Number(a.port || 0) - Number(b.port || 0)),
      }))
      .sort((a, b) => {
        if (b.ports.length !== a.ports.length) return b.ports.length - a.ports.length;
        return a.label.localeCompare(b.label);
      });
  }, [openPorts, targetSnapshots]);

  const selectedJob = useMemo(
    () => jobs.find((job) => String(job.id) === String(selectedJobId)) || null,
    [jobs, selectedJobId],
  );

  const refreshData = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [jobsResult, summaryResult, scopeDomainsResult] = await Promise.allSettled([
        fetchExposureJobs(organizationId, 50),
        surfaceScan360Api.getExposureSummary(organizationId, { scope_mode: 'scope_latest_per_target' }, groupId),
        surfaceScan360Api.listMonitoredIps(organizationId, groupId),
      ]);

      const jobsData = jobsResult.status === 'fulfilled' ? jobsResult.value : [];
      const summaryData = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
      const scopeDomainsData = scopeDomainsResult.status === 'fulfilled' ? scopeDomainsResult.value : null;
      const monitoredRules: Array<{ entry_type: string; input_value: string }> = Array.isArray(scopeDomainsData) ? scopeDomainsData : [];
      const normalizedScopeDomains = Array.from(
        new Set(
          monitoredRules
            .filter((entry) => String(entry.entry_type || '').toLowerCase() === 'domain')
            .map((entry) => normalizeScopeDomain(entry.input_value))
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b));
      const normalizedScopePublicIps = Array.from(
        new Set(
          monitoredRules
            .filter((entry) => String(entry.entry_type || '').toLowerCase() === 'single')
            .map((entry) => String(entry.input_value || '').trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b));

      setScopeDomains(normalizedScopeDomains);
      setScopePublicIps(normalizedScopePublicIps);

      setJobs(jobsData);
      const fallbackSelected = String(jobsData[0]?.id || '');
      setSelectedJobId((prev) => prev || fallbackSelected);
      setSummary(summaryData);
      setTargetSnapshots(summaryData?.target_snapshots || []);

      const effectiveJobIds = (summaryData?.job_ids || []).map((entry) => String(entry || '').trim()).filter(Boolean);
      if (effectiveJobIds.length === 0 && summaryData?.job_id) {
        effectiveJobIds.push(String(summaryData.job_id));
      }
      if (effectiveJobIds.length === 0) {
        for (const job of jobsData) {
          const id = String(job?.id || '').trim();
          if (!id) continue;
          effectiveJobIds.push(id);
          if (effectiveJobIds.length >= 120) break;
        }
      }

      const [portsRes, techRes, findingsRes2] = await Promise.allSettled([
        fetchOpenPortsByJobIds(effectiveJobIds),
        fetchTechnologiesByJobIds(effectiveJobIds),
        fetchExposureFindingsByJobIds(effectiveJobIds),
      ]);
      setOpenPorts(portsRes.status === 'fulfilled' ? dedupeOpenPortsRows(portsRes.value) : []);
      setTechnologies(techRes.status === 'fulfilled' ? dedupeTechnologiesRows(techRes.value) : []);
      setFindings(findingsRes2.status === 'fulfilled' ? dedupeFindingsRows(findingsRes2.value) : []);
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

  const runExposureScan = useCallback(
    async (payload: ExposureStartRequest, options?: { auto?: boolean }) => {
      setStartingScan(true);
      try {
        const result = await startExposureScan(payload);
        setSelectedJobId(String(result?.job_id || ''));
        toast.success(options?.auto ? 'Scansione scope avviata automaticamente' : 'Scansione exposure avviata', {
          description: `Job ${result?.job_id || '-'} • Queue: ${result?.queue?.total || 0}`,
        });

        // Kick immediato del poll per evitare job in coda senza avvio motori.
        try {
          await triggerExposurePoll();
        } catch (pollError) {
          console.warn('Immediate exposure poll failed:', pollError);
        }

        await refreshData();
        return result;
      } catch (error: any) {
        if (options?.auto) {
          autoStartAttemptedRef.current = false;
        }
        toast.error(options?.auto ? 'Auto-avvio scope non riuscito' : 'Avvio scansione non riuscito', {
          description: error?.message || 'Errore durante avvio',
        });
        throw error;
      } finally {
        setStartingScan(false);
      }
    },
    [refreshData],
  );

  const handleStartScan = async () => {
    if (!organizationId) {
      toast.error('Cliente non selezionato');
      return;
    }

    const normalizedDomains = Array.from(new Set(scopeDomains.map(normalizeScopeDomain).filter(Boolean)));
    const normalizedIps = Array.from(new Set(scopePublicIps.map(normalizeScopeIp).filter(Boolean)));
    if (normalizedDomains.length === 0 && normalizedIps.length === 0) {
      toast.error('Nessun target disponibile nello scope monitorato');
      return;
    }

    const payload: ExposureStartRequest = {
      tenant_id: organizationId,
      customer_id: organizationId,
      scan_name: scanName.trim() || `Exposure Full Scan · Scope ${new Date().toISOString().slice(0, 16)}`,
      root_domains: normalizedDomains,
      subdomains: [],
      public_ips: normalizedIps,
      include_subdomain_discovery: fullControls.includeSubDiscovery,
      include_port_scan: fullControls.includePortScan,
      include_web_technology_detection: fullControls.includeWebTech,
      include_ssl_scan: fullControls.includeSsl,
      include_network_vuln_scan: fullControls.includeNetworkVuln,
      scan_depth: 'deep',
      protocol: 'tcp',
      custom_ports: customPorts,
      check_alive: fullControls.checkAlive,
      detect_service_version: fullControls.detectServiceVersion,
      detect_os: fullControls.detectOs,
      traceroute: fullControls.traceroute,
    };
    await runExposureScan(payload);
  };

  useEffect(() => {
    if (!isAdmin || !organizationId) return;
    if (autoStartAttemptedRef.current) return;
    if (loading || startingScan) return;

    const scopeHasTargets = scopeDomains.length > 0 || scopePublicIps.length > 0;
    if (!scopeHasTargets) return;

    const hasActiveJob = jobs.some((job) => {
      const status = String(job?.status || '').toLowerCase();
      return status === 'queued' || status === 'running' || status === 'waiting';
    });
    if (hasActiveJob) return;

    const latestJobTs = toTimestamp(jobs[0]?.created_at);
    const isStale = !latestJobTs || (Date.now() - latestJobTs) > 1000 * 60 * 60 * 12;
    const hasFailedLatestTargets = targetSnapshots.some((snapshot) => {
      const liveStatus = String(snapshot?.live?.status || '').toLowerCase();
      return ['failed', 'stopped', 'aborted', 'timed out'].includes(liveStatus);
    });
    const scannedTargetKeys = new Set(
      jobs
        .map((job) => targetMatchKey(String(job?.normalized_target || job?.raw_target || '')))
        .filter(Boolean),
    );
    const scopeTargetKeys = new Set([
      ...scopeDomains.map(targetMatchKey),
      ...scopePublicIps.map(targetMatchKey),
    ]);
    const missingScopeTargets = Array.from(scopeTargetKeys).filter((key) => !scannedTargetKeys.has(key));
    const shouldAutoStart =
      jobs.length === 0
      || isStale
      || missingScopeTargets.length > 0
      || hasFailedLatestTargets;
    if (!shouldAutoStart) return;

    autoStartAttemptedRef.current = true;

    const payload: ExposureStartRequest = {
      tenant_id: organizationId,
      customer_id: organizationId,
      scan_name: `Exposure Scope Auto · ${new Date().toISOString().slice(0, 16)}`,
      root_domains: scopeDomains,
      subdomains: [],
      public_ips: scopePublicIps,
      include_subdomain_discovery: fullControls.includeSubDiscovery,
      include_port_scan: fullControls.includePortScan,
      include_web_technology_detection: fullControls.includeWebTech,
      include_ssl_scan: fullControls.includeSsl,
      include_network_vuln_scan: fullControls.includeNetworkVuln,
      scan_depth: 'deep',
      protocol: 'tcp',
      custom_ports: customPorts,
      check_alive: fullControls.checkAlive,
      detect_service_version: fullControls.detectServiceVersion,
      detect_os: fullControls.detectOs,
      traceroute: fullControls.traceroute,
    };

    void runExposureScan(payload, { auto: true });
  }, [
    isAdmin,
    organizationId,
    loading,
    startingScan,
    scopeDomains,
    scopePublicIps,
    jobs,
    targetSnapshots,
    fullControls,
    customPorts,
    runExposureScan,
  ]);

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
          {targetSnapshots && targetSnapshots.length > 0 && (
            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              {(() => {
                const liveRunning = targetSnapshots.filter((entry) => ['running', 'waiting'].includes(String(entry.live?.status || '').toLowerCase())).length;
                const liveQueued = targetSnapshots.filter((entry) => ['queued', 'pending'].includes(String(entry.live?.status || '').toLowerCase())).length;
                const lastGood = targetSnapshots.filter((entry) => entry.snapshot_source === 'last_good').length;
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Target scope: {targetSnapshots.length}</Badge>
                    <Badge variant="outline">Live running: {liveRunning}</Badge>
                    <Badge variant="outline">Live queued: {liveQueued}</Badge>
                    <Badge variant="secondary">Last-good fallback: {lastGood}</Badge>
                  </div>
                );
              })()}
            </div>
          )}
          <ExposureCharts summary={summary} openPorts={openPorts} technologies={technologies} />

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lista Asset con Porte</CardTitle>
              <p className="text-xs text-muted-foreground">
                Vista rapida per asset in scope: sotto ogni dominio/IP trovi le porte aperte rilevate.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {assetPortList.length === 0 && (
                <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                  Nessun asset disponibile nello scope.
                </div>
              )}
              {assetPortList.map((asset) => (
                <div key={asset.key} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground break-all">{asset.label}</p>
                      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                        <Badge variant="outline">{asset.ports.length} porte</Badge>
                        {asset.ips.length > 0 && (
                          <span className="break-all">IP: {asset.ips.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <Badge variant={asset.ports.length > 0 ? 'secondary' : 'outline'}>
                      {asset.ports.length > 0 ? 'Porte rilevate' : 'Nessuna porta'}
                    </Badge>
                  </div>
                  {asset.ports.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {asset.ports.map((portRow, index) => {
                        const serviceLabel = [
                          portRow.service_name,
                          portRow.service_product,
                          portRow.service_version,
                        ]
                          .filter(Boolean)
                          .join(' ')
                          .trim();
                        return (
                          <div
                            key={`${asset.key}-${portRow.port}-${portRow.protocol}-${index}`}
                            className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-1"
                          >
                            <Badge className={exposureSeverityClass(portRow.exposure_level)}>
                              {portRow.port}/{String(portRow.protocol || 'tcp').toLowerCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {serviceLabel || 'servizio n/d'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Nessuna porta aperta rilevata su questo asset nell’ultimo snapshot valido.
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

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
                    <div className="space-y-2 md:col-span-2">
                      <Label>Target in scope (auto)</Label>
                      <div className="rounded-md border border-border p-2 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {scopeDomains.map((domain) => (
                            <Badge key={`scope-domain-${domain}`} variant="secondary">{domain}</Badge>
                          ))}
                          {scopePublicIps.map((ip) => (
                            <Badge key={`scope-ip-${ip}`} variant="outline">{ip}</Badge>
                          ))}
                          {scopeDomains.length === 0 && scopePublicIps.length === 0 && (
                            <span className="text-xs text-muted-foreground">Nessun target in scope.</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        La scansione include sempre tutti i domini e IP in scope con controlli completi.
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <label className="flex items-center gap-2"><Checkbox checked={fullControls.includeSubDiscovery} disabled />Subdomain discovery</label>
                    <label className="flex items-center gap-2"><Checkbox checked={fullControls.includePortScan} disabled />Port scan</label>
                    <label className="flex items-center gap-2"><Checkbox checked={fullControls.includeWebTech} disabled />Web technologies</label>
                    <label className="flex items-center gap-2"><Checkbox checked={fullControls.includeSsl} disabled />SSL/TLS</label>
                    <label className="flex items-center gap-2"><Checkbox checked={fullControls.includeNetworkVuln} disabled />Network vulnerability scan</label>
                    <label className="flex items-center gap-2"><Checkbox checked={fullControls.detectOs} disabled />OS detection</label>
                    <label className="flex items-center gap-2"><Checkbox checked={fullControls.detectServiceVersion} disabled />Service version</label>
                    <label className="flex items-center gap-2"><Checkbox checked={fullControls.checkAlive} disabled />Check alive</label>
                    <label className="flex items-center gap-2"><Checkbox checked={fullControls.traceroute} disabled />Traceroute</label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={handleStartScan} disabled={startingScan || (scopeDomains.length === 0 && scopePublicIps.length === 0)}>
                      {startingScan ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                      Avvia scansione scope completa
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

                  {scopeDomains.length === 0 && (
                    <p className="text-xs text-amber-300">
                      Nessun dominio disponibile nello scope monitorato: aggiungi prima una regola di tipo dominio.
                    </p>
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
