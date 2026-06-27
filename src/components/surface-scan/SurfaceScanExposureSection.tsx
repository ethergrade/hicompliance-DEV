import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Loader2, Play, RefreshCw } from 'lucide-react';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchExposureJobs,
  fetchExposureSummary,
  fetchOpenPortsByJobIds,
  fetchTechnologiesByJobIds,
  type ExposureFindingRow,
  type ExposureOpenPortRow,
  type ExposureSummary,
  type ExposureTechnologyRow,
} from '@/lib/surfacescan/exposureApi';
import ExposureKpiCards from '@/components/surfacescan/ExposureKpiCards';
import ExposureCharts from '@/components/surfacescan/ExposureCharts';
import OpenPortsTable from '@/components/surfacescan/OpenPortsTable';
import TechnologiesTable from '@/components/surfacescan/TechnologiesTable';
import ExposureFindingsTable from '@/components/surfacescan/ExposureFindingsTable';
import { publicScanTypeLabel, publicSourceLabel } from '@/lib/surfaceSourceLabels';

interface SurfaceScanExposureSectionProps {
  isAdmin: boolean;
}

type AutoStartStatus = {
  kind: 'running' | 'success' | 'error';
  message: string;
  detail?: string;
  at: string;
};

const AUTO_START_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const hashAutoStartKey = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const autoStartStorageKey = (organizationId: string, scopeSignature: string): string =>
  `surfacescan360:auto-exposure:${organizationId}:${hashAutoStartKey(scopeSignature)}`;

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

const serviceEndpointKey = (value: { host?: string | null; ip?: string | null; port: number; protocol?: string | null }): string => [
  String(value.ip || value.host || '').trim().toLowerCase(),
  Number(value.port || 0),
  String(value.protocol || 'tcp').trim().toLowerCase(),
].join('|');

const dedupeOpenPortsRows = (rows: ExposureOpenPortRow[]): ExposureOpenPortRow[] => {
  const map = new Map<string, ExposureOpenPortRow>();
  for (const row of rows || []) {
    const key = [
      String(row.host || '').toLowerCase(),
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
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [summary, setSummary] = useState<ExposureSummary | null>(null);
  const [openPorts, setOpenPorts] = useState<ExposureOpenPortRow[]>([]);
  const [technologies, setTechnologies] = useState<ExposureTechnologyRow[]>([]);
  const [findings, setFindings] = useState<ExposureFindingRow[]>([]);
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(true);
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(false);
  const [targetSnapshots, setTargetSnapshots] = useState<ExposureSummary['target_snapshots']>([]);
  const [autoStartStatus, setAutoStartStatus] = useState<AutoStartStatus | null>(null);

  const [scopeDomains, setScopeDomains] = useState<string[]>([]);
  const [scopePublicIps, setScopePublicIps] = useState<string[]>([]);
  const autoStartInFlightKeyRef = useRef('');
  const autoStartFailedKeyRef = useRef('');
  const assetListRef = useRef<HTMLDivElement>(null);

  const assetPortList = useMemo(() => {
    const grouped = new Map<string, {
      key: string;
      label: string;
      ports: ExposureOpenPortRow[];
      ips: Set<string>;
      snapshotSource: 'live' | 'last_good' | null;
      snapshotStatus: string | null;
      snapshotAt: string | null;
    }>();

    const ensureGroup = (key: string, label: string) => {
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          label,
          ports: [],
          ips: new Set<string>(),
          snapshotSource: null,
          snapshotStatus: null,
          snapshotAt: null,
        });
      }
      return grouped.get(key)!;
    };

    for (const snapshot of targetSnapshots || []) {
      const label = String(snapshot?.target_value || '').trim();
      if (!label) continue;
      const key = targetMatchKey(label);
      if (!key) continue;
      const group = ensureGroup(key, label);
      group.snapshotSource = snapshot.snapshot_source;
      group.snapshotStatus = snapshot.live?.status || snapshot.last_good?.status || null;
      group.snapshotAt = snapshot.snapshot_source === 'last_good'
        ? snapshot.last_good?.completed_at || snapshot.last_good?.created_at || null
        : snapshot.live?.created_at || snapshot.last_good?.completed_at || null;
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
        snapshotSource: entry.snapshotSource,
        snapshotStatus: entry.snapshotStatus,
        snapshotAt: entry.snapshotAt,
      }))
      .sort((a, b) => {
        if (b.ports.length !== a.ports.length) return b.ports.length - a.ports.length;
        return a.label.localeCompare(b.label);
      });
  }, [openPorts, targetSnapshots]);

  const scrollToAssetList = useCallback(() => {
    assetListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const exposureUpdatedAt = useMemo(() => {
    const candidates = [
      ...openPorts.map((row) => row.last_seen_at || row.first_seen_at),
      ...jobs.map((job) => job.completed_at || job.created_at),
      summary?.target_snapshots?.[0]?.last_good?.completed_at,
      summary?.target_snapshots?.[0]?.live?.created_at,
    ]
      .map((value) => Date.parse(String(value || '')))
      .filter((value) => Number.isFinite(value));
    if (candidates.length === 0) return null;
    return new Date(Math.max(...candidates)).toISOString();
  }, [jobs, openPorts, summary]);

  const noOpenPortsMessage = useMemo(() => {
    const when = exposureUpdatedAt
      ? ` il ${new Date(exposureUpdatedAt).toLocaleString('it-IT')}`
      : '';
    return `Nessuna porta aperta trovata${when}.`;
  }, [exposureUpdatedAt]);

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
        fetchExposureSummary({
          customerId: organizationId,
          scopeMode: 'scope_latest_per_target',
        }),
        supabase
          .from('surface_scan_monitored_ips' as any)
          .select('entry_type, input_value')
          .eq('organization_id', organizationId)
          .order('input_value', { ascending: true }),
      ]);

      const jobsData = jobsResult.status === 'fulfilled' ? jobsResult.value : [];
      const summaryData = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
      const scopeDomainsRes = scopeDomainsResult.status === 'fulfilled' ? scopeDomainsResult.value : null;
      if (scopeDomainsRes && (scopeDomainsRes as any).error) throw (scopeDomainsRes as any).error;

      const monitoredRules = ((scopeDomainsRes as any)?.data || []) as Array<{ entry_type: string; input_value: string }>;
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

      const [portsRes, techRes] = await Promise.allSettled([
        fetchOpenPortsByJobIds(effectiveJobIds),
        fetchTechnologiesByJobIds(effectiveJobIds),
      ]);
      const assessmentByEndpoint = new Map(
        (summaryData?.service_assessments || []).map((assessment) => [serviceEndpointKey(assessment), assessment]),
      );
      const normalizedPorts = portsRes.status === 'fulfilled' ? dedupeOpenPortsRows(portsRes.value) : [];
      setOpenPorts(normalizedPorts.map((row) => {
        const assessment = assessmentByEndpoint.get(serviceEndpointKey(row));
        if (!assessment) return row;
        return {
          ...row,
          exposure_level: assessment.severity,
          remediation_hint: assessment.remediation,
          risk_assessment: assessment,
        };
      }));
      setTechnologies(techRes.status === 'fulfilled' ? dedupeTechnologiesRows(techRes.value) : []);
      setFindings(dedupeFindingsRows(summaryData?.exposure_findings || []));
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

  const runBackgroundAsm = useCallback(
    async (options?: { auto?: boolean; autoKey?: string }) => {
      if (!organizationId) return null;
      setStartingScan(true);
      try {
        const { data, error } = await supabase.functions.invoke('connectsecure-scan', {
          body: { action: 'scan', organization_id: organizationId },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error(String((data as any).error));

        const enqueued = Number((data as any)?.enqueued || 0);
        const detail = enqueued > 0
          ? `${enqueued} domini accodati`
          : 'Nessun nuovo dominio accodato';

        if (options?.auto) {
          autoStartInFlightKeyRef.current = '';
          autoStartFailedKeyRef.current = '';
          setAutoStartStatus({
            kind: 'success',
            message: 'ASM scope accodato in background',
            detail,
            at: new Date().toISOString(),
          });
        } else {
          toast.success('ASM avviato in background', { description: detail });
        }
        await refreshData();
        return data;
      } catch (error: any) {
        if (options?.auto && options.autoKey) {
          autoStartInFlightKeyRef.current = '';
          autoStartFailedKeyRef.current = options.autoKey;
          setAutoStartStatus({
            kind: 'error',
            message: 'ASM automatico non accodato',
            detail: error?.message || 'Errore durante avvio',
            at: new Date().toISOString(),
          });
          return null;
        }
        toast.error('Avvio scansione non riuscito', {
          description: error?.message || 'Errore durante avvio',
        });
        throw error;
      } finally {
        setStartingScan(false);
      }
    },
    [organizationId, refreshData],
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

    await runBackgroundAsm();
  };

  useEffect(() => {
    if (!isAdmin || !organizationId) return;
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

    const scopeSignature = [
      organizationId,
      [...scopeDomains].sort().join(','),
      [...scopePublicIps].sort().join(','),
    ].join('::');
    const autoStartKey = `scope:${hashAutoStartKey(scopeSignature)}`;
    if (typeof window !== 'undefined') {
      try {
        const storageKey = autoStartStorageKey(organizationId, scopeSignature);
        const lastAttempt = Number(window.localStorage.getItem(storageKey) || 0);
        if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < AUTO_START_COOLDOWN_MS) return;
        window.localStorage.setItem(storageKey, String(Date.now()));
      } catch (storageError) {
        console.warn('SurfaceScan auto-start cooldown unavailable:', storageError);
      }
    }

    const autoStartReason = [
      jobs
        .slice(0, 8)
        .map((job) => `${String(job?.id || '')}:${String(job?.status || '')}`)
        .join('|'),
      targetSnapshots
        .map((snapshot) => `${String(snapshot?.target_key || '')}:${String(snapshot?.live?.status || '')}:${String(snapshot?.last_good?.job_id || '')}`)
        .sort()
        .join('|'),
    ].join('::');

    if (autoStartInFlightKeyRef.current === autoStartKey) return;
    if (autoStartFailedKeyRef.current === autoStartKey) return;
    autoStartInFlightKeyRef.current = autoStartKey;
    setAutoStartStatus({
      kind: 'running',
      message: 'Auto-scan scope accodato in background',
      detail: autoStartReason ? 'Cooldown anti-duplicazione attivo per questo scope.' : undefined,
      at: new Date().toISOString(),
    });

    void runBackgroundAsm({ auto: true, autoKey: autoStartKey });
  }, [
    isAdmin,
    organizationId,
    loading,
    startingScan,
    scopeDomains,
    scopePublicIps,
    jobs,
    targetSnapshots,
    runBackgroundAsm,
  ]);

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
            {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={refreshData}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Aggiorna
            </Button>
            )}
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
          {autoStartStatus && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={autoStartStatus.kind === 'error' ? 'destructive' : autoStartStatus.kind === 'running' ? 'secondary' : 'outline'}
                >
                  {autoStartStatus.kind === 'error' ? 'Auto-scan' : 'Background'}
                </Badge>
                <span className="font-medium text-foreground">{autoStartStatus.message}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(autoStartStatus.at).toLocaleString('it-IT')}
                </span>
              </div>
              {autoStartStatus.detail && (
                <p className="mt-1 text-xs text-muted-foreground">{autoStartStatus.detail}</p>
              )}
            </div>
          )}
          <ExposureKpiCards
            summary={summary}
            onAssetsClick={assetPortList.length > 0 ? scrollToAssetList : undefined}
          />
          {targetSnapshots && targetSnapshots.length > 0 && (
            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              {(() => {
                const liveRunning = targetSnapshots.filter((entry) => ['running', 'waiting'].includes(String(entry.live?.status || '').toLowerCase())).length;
                const liveQueued = targetSnapshots.filter((entry) => ['queued', 'pending'].includes(String(entry.live?.status || '').toLowerCase())).length;
                const lastGood = targetSnapshots.filter((entry) => entry.snapshot_source === 'last_good').length;
                const sourceCounts = Object.entries(summary?.source_counts || {});
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Target scope: {targetSnapshots.length}</Badge>
                    <Badge variant="outline">Live running: {liveRunning}</Badge>
                    <Badge variant="outline">Live queued: {liveQueued}</Badge>
                    <Badge variant="secondary">Last-good fallback: {lastGood}</Badge>
                    {(summary?.included_scan_types || []).map((scanType) => (
                      <Badge key={`scan-type-${scanType}`} variant="outline">{publicScanTypeLabel(scanType)}</Badge>
                    ))}
                    {sourceCounts.map(([source, count]) => (
                      <Badge key={`source-${source}`} variant="secondary">{publicSourceLabel(source)}: {count}</Badge>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          <ExposureCharts summary={summary} openPorts={openPorts} technologies={technologies} />
          {!loading && openPorts.length === 0 && (
            <div className="rounded-lg border border-border bg-muted/15 p-4 text-sm text-muted-foreground">
              {noOpenPortsMessage}
            </div>
          )}

          {assetPortList.length > 0 && (
            <Card ref={assetListRef} className="scroll-mt-28 border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Asset scansionati</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Elenco latest-per-target completo, inclusi gli asset per cui non risultano porte aperte.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
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
                          {asset.snapshotAt && (
                            <span>Aggiornato: {new Date(asset.snapshotAt).toLocaleString('it-IT')}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {asset.snapshotSource === 'last_good' && (
                          <Badge variant="outline">Ultimo snapshot valido</Badge>
                        )}
                        <Badge variant={asset.ports.length > 0 ? 'secondary' : 'outline'}>
                          {asset.ports.length > 0 ? 'Porte rilevate' : statusLabel(asset.snapshotStatus || 'completed')}
                        </Badge>
                      </div>
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
                      <div className="mt-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                        Nessuna porta aperta rilevata nello snapshot disponibile.
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {isAdmin && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Azioni Background Exposure (Admin)</CardTitle>
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
                  <div className="space-y-2">
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
                      L'avvio manuale manda in background l'ASM per l'organizzazione corrente. I dati vengono letti dalle tabelle SurfaceScan360 canoniche.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={handleStartScan} disabled={startingScan || (scopeDomains.length === 0 && scopePublicIps.length === 0)}>
                      {startingScan ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                      Avvia ASM org corrente
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

          {openPorts.length > 0 && <OpenPortsTable rows={openPorts} />}
          {technologies.length > 0 && <TechnologiesTable rows={technologies} />}
          {findings.length > 0 && <ExposureFindingsTable rows={findings} />}
        </CardContent>
      )}
    </Card>
  );
};

export default SurfaceScanExposureSection;
