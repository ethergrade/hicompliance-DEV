import React, { useMemo, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import {
  Globe,
  Shield,
  AlertTriangle,
  Eye,
  Download,
  Plus,
  Trash2,
  Search,
} from 'lucide-react';
import SecurityFindings from '@/components/surface-scan/SecurityFindings';
import { AlertBellButton } from '@/components/dark-risk/AlertBellButton';
import { SurfaceScanAlertConfigDialog } from '@/components/surface-scan/SurfaceScanAlertConfigDialog';
import { useSurfaceScanAlerts, SurfaceScanAlertTypes } from '@/hooks/useSurfaceScanAlerts';
import { useSurfaceScanMonitoredIps } from '@/hooks/useSurfaceScanMonitoredIps';
import { useSurfaceScanEngine, type SurfaceScanProfile } from '@/hooks/useSurfaceScanEngine';
import { useSurfaceScanDiscoveredAssets } from '@/hooks/useSurfaceScanDiscoveredAssets';
import { useSurfaceScanFindings } from '@/hooks/useSurfaceScanFindings';
import { isIpInRange } from '@/lib/ipRange';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useSubdomainDump } from '@/hooks/useSubdomainDump';
import { SubdomainDumpPanel } from '@/components/surface-scan/SubdomainDumpPanel';

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const isIpv6 = (value: string): boolean => value.includes(':');
const isDomainLike = (value: string): boolean => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
const simpleRootDomain = (hostname: string): string => {
  const parts = hostname.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
};

const extractHostFromTarget = (rawTarget: string): string | null => {
  const raw = String(rawTarget || '').trim();
  if (!raw) return null;

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    // continue
  }

  try {
    if (!raw.includes('://') && /[/:]/.test(raw)) {
      return new URL(`https://${raw}`).hostname.toLowerCase();
    }
  } catch {
    // continue
  }

  return raw.toLowerCase().replace(/\.$/, '');
};

const formatLastScanLabel = (timestamp: string | null): string => {
  if (!timestamp) return 'Nessuna';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Nessuna';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin <= 1) return 'Adesso';
  if (diffMin < 60) return `${diffMin} min fa`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h fa`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}g fa`;
};

const statusBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') return 'default';
  if (normalized === 'failed') return 'destructive';
  if (normalized === 'running') return 'secondary';
  return 'outline';
};

const SCAN_PROFILES: SurfaceScanProfile[] = [
  'safe_recon',
  'domain_exposure',
  'ip_exposure',
  'cve_api_validation',
];

const profileLabel = (profile: SurfaceScanProfile): string => {
  if (profile === 'safe_recon') return 'Safe Recon';
  if (profile === 'domain_exposure') return 'Domain Exposure';
  if (profile === 'ip_exposure') return 'IP Exposure';
  return 'CVE API Validation';
};

const hostingLabel = (context: string | null): string => {
  if (context === 'shared_hosting') return 'Servizio in shared host';
  if (context === 'cdn_proxy') return 'Servizio dietro CDN/Proxy';
  if (context === 'dedicated') return 'Server dedicato';
  return 'In analisi';
};

interface ReverseAssetRow {
  asset_value: string;
  raw: { ip?: string } | null;
}

const SurfaceScan360: React.FC = () => {
  const exportContainerRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [newMonitoredIpInput, setNewMonitoredIpInput] = useState('');
  const [scanTargetInput, setScanTargetInput] = useState('');
  const [selectedProfiles, setSelectedProfiles] = useState<SurfaceScanProfile[]>(['domain_exposure']);
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);
  const [ownershipProof, setOwnershipProof] = useState('');
  const [queueRescanExisting, setQueueRescanExisting] = useState(false);
  const [rescanLimit, setRescanLimit] = useState('10');
  const [assetSearch, setAssetSearch] = useState('');
  const [assetPage, setAssetPage] = useState(1);
  const [reverseDnsMap, setReverseDnsMap] = useState<Record<string, string[]>>({});

  const assetsPerPage = 15;
  const { organizationId } = useClientOrganization();

  const { alerts, createAlert } = useSurfaceScanAlerts();
  const activeAlertsCount = alerts.filter((a) => a.is_active).length;

  const { jobs: scanJobs, startingScan, startScanQueue, activeJobsCount, isAdmin } = useSurfaceScanEngine();
  const {
    subdomains: discoveredSubdomains,
    ips: discoveredIps,
    loading: discoveredAssetsLoading,
  } = useSurfaceScanDiscoveredAssets();
  const subdomainDump = useSubdomainDump();
  const { counts: findingsCounts } = useSurfaceScanFindings();

  const {
    rules: monitoredIpRules,
    loading: monitoredIpRulesLoading,
    saving: monitoredIpRulesSaving,
    isAdmin: isAdminUser,
    hasRules: hasMonitoredRules,
    addRule: addMonitoredIpRule,
    removeRule: removeMonitoredIpRule,
  } = useSurfaceScanMonitoredIps();

  const handleCreateAlert = async (data: { alert_email: string; alert_types: SurfaceScanAlertTypes }) => {
    return await createAlert(data);
  };

  const scanDiscovery = useMemo(() => {
    const scannedTargets = new Set<string>();
    const scannedDomains = new Set<string>();
    const scannedIps = new Set<string>();

    for (const job of scanJobs) {
      const rawTarget = String(job.raw_target || '').trim();
      if (rawTarget) {
        scannedTargets.add(rawTarget);
      }

      const host = extractHostFromTarget(rawTarget);
      if (!host) continue;

      if (IPV4_REGEX.test(host) || isIpv6(host)) {
        scannedIps.add(host);
      } else if (isDomainLike(host)) {
        scannedDomains.add(host);
      }
    }

    const lastScanAt = scanJobs.length > 0 ? scanJobs[0].created_at : null;

    const dumpedSubdomains = subdomainDump.history
      .flatMap((dump) => dump.results.map((entry) => String(entry.subdomain || '').trim().toLowerCase()))
      .filter(Boolean);

    const mergedSubdomains = [...new Set([...discoveredSubdomains, ...dumpedSubdomains])];

    return {
      scannedTargets: [...scannedTargets],
      scannedDomains: [...scannedDomains],
      scannedIps: [...scannedIps],
      discoveredSubdomains: mergedSubdomains,
      discoveredIps,
      lastScanAt,
      lastScanLabel: formatLastScanLabel(lastScanAt),
    };
  }, [scanJobs, discoveredSubdomains, discoveredIps, subdomainDump.history]);

  const dumpedSubdomainMeta = useMemo(() => {
    const map: Record<string, { ip: string | null; note: string }> = {};
    for (const dump of subdomainDump.history) {
      for (const entry of dump.results) {
        const key = String(entry.subdomain || '').trim().toLowerCase();
        if (!key || map[key]) continue;
        const note = [entry.country, entry.asn_name].filter(Boolean).join(' · ');
        map[key] = {
          ip: entry.ip || null,
          note: note || `Fonte: ${dump.sources.join(', ')}`,
        };
      }
    }
    return map;
  }, [subdomainDump.history]);

  React.useEffect(() => {
    const loadReverseDnsMap = async () => {
      if (!organizationId) {
        setReverseDnsMap({});
        return;
      }

      const { data, error } = await supabase
        .from('surface_assets' as any)
        .select('asset_value, raw')
        .eq('organization_id', organizationId)
        .eq('asset_type', 'reverse_dns_hostname')
        .order('last_seen', { ascending: false })
        .limit(1500);

      if (error) {
        console.error('Error loading reverse DNS assets:', error);
        return;
      }

      const map: Record<string, string[]> = {};
      for (const row of (data || []) as ReverseAssetRow[]) {
        const ip = String(row?.raw?.ip || '').trim().toLowerCase();
        const host = String(row?.asset_value || '').trim().toLowerCase();
        if (!ip || !host) continue;
        if (!map[ip]) map[ip] = [];
        if (!map[ip].includes(host)) map[ip].push(host);
      }

      setReverseDnsMap(map);
    };

    void loadReverseDnsMap();
    const interval = setInterval(() => {
      void loadReverseDnsMap();
    }, 12000);

    return () => clearInterval(interval);
  }, [organizationId]);

  const latestJobByHost = useMemo(() => {
    const map = new Map<string, (typeof scanJobs)[number]>();
    for (const job of scanJobs) {
      const host = String(job.hostname || '').trim().toLowerCase();
      if (!host) continue;
      if (!map.has(host)) map.set(host, job);
    }
    return map;
  }, [scanJobs]);

  const reverseAnalysisRows = useMemo(() => {
    const rows: Array<{
      host: string;
      hostingContext: string | null;
      resolvedIps: string[];
      reverseHosts: string[];
    }> = [];

    const hostsToAnalyze = [...new Set([
      ...scanDiscovery.scannedDomains,
      ...scanDiscovery.discoveredSubdomains,
    ])].slice(0, 50);

    for (const host of hostsToAnalyze) {
      const job = latestJobByHost.get(host);
      const resolvedIps = Array.isArray(job?.resolved_ips)
        ? job?.resolved_ips.filter(Boolean).map((ip) => String(ip).toLowerCase())
        : [];

      const reverseHosts = [...new Set(resolvedIps.flatMap((ip) => reverseDnsMap[ip] || []))];

      rows.push({
        host,
        hostingContext: job?.hosting_context || null,
        resolvedIps,
        reverseHosts,
      });
    }

    return rows;
  }, [scanDiscovery.scannedDomains, scanDiscovery.discoveredSubdomains, latestJobByHost, reverseDnsMap]);

  const rescanTargets = useMemo(() => {
    const unique = new Set<string>();
    for (const job of scanJobs) {
      const target = String(job.raw_target || job.normalized_target || '').trim();
      if (target) unique.add(target);
    }
    for (const subdomain of scanDiscovery.discoveredSubdomains) {
      if (subdomain) unique.add(subdomain);
    }
    for (const ip of scanDiscovery.discoveredIps) {
      if (ip) unique.add(ip);
    }
    return [...unique];
  }, [scanJobs, scanDiscovery.discoveredSubdomains, scanDiscovery.discoveredIps]);

  const monitoredLiveIps = useMemo(() => {
    let ips = [...scanDiscovery.discoveredIps];

    if (hasMonitoredRules) {
      ips = ips.filter((ip) =>
        monitoredIpRules.some((rule) => isIpInRange(ip, rule.ip_start, rule.ip_end)),
      );
    }

    const term = assetSearch.trim().toLowerCase();
    if (term) {
      ips = ips.filter((ip) => ip.toLowerCase().includes(term));
    }

    return ips.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [scanDiscovery.discoveredIps, hasMonitoredRules, monitoredIpRules, assetSearch]);

  const totalAssetPages = Math.max(1, Math.ceil(monitoredLiveIps.length / assetsPerPage));
  const paginatedLiveIps = monitoredLiveIps.slice((assetPage - 1) * assetsPerPage, assetPage * assetsPerPage);

  React.useEffect(() => {
    setAssetPage(1);
  }, [assetSearch, monitoredIpRules.length, scanDiscovery.discoveredIps.length]);

  const handleExportPdf = async () => {
    if (!exportContainerRef.current) return;

    setExportingPdf(true);

    try {
      const target = exportContainerRef.current;
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0b1120',
        windowWidth: target.scrollWidth,
        windowHeight: target.scrollHeight,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;

      const imgWidth = printableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, '', 'FAST');
      heightLeft -= printableHeight;

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, '', 'FAST');
        heightLeft -= printableHeight;
      }

      const fileName = `surfacescan360-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);
      toast.success('Export PDF completato');
    } catch (error) {
      console.error('SurfaceScan360 PDF export error:', error);
      toast.error("Errore durante l'export PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleAddMonitoredIpRule = async () => {
    const success = await addMonitoredIpRule(newMonitoredIpInput);
    if (success) {
      setNewMonitoredIpInput('');
    }
  };

  const handleRemoveMonitoredIpRule = async (ruleId: string) => {
    await removeMonitoredIpRule(ruleId);
  };

  const toggleProfile = (profile: SurfaceScanProfile) => {
    setSelectedProfiles((prev) => {
      if (prev.includes(profile)) {
        return prev.filter((entry) => entry !== profile);
      }
      return [...prev, profile];
    });
  };

  const handleStartScan = async () => {
    const manualTarget = scanTargetInput.trim();
    const includeRescan = queueRescanExisting;
    const parsedRescanLimit = Math.max(1, Math.min(50, Number.parseInt(rescanLimit || '10', 10) || 10));
    const reTargets = includeRescan ? rescanTargets.slice(0, parsedRescanLimit) : [];

    const targets = [...new Set([manualTarget, ...reTargets].filter(Boolean))];
    if (targets.length === 0) {
      toast.error('Inserisci un target o abilita re-scan asset esistenti');
      return;
    }

    if (selectedProfiles.length === 0) {
      toast.error('Seleziona almeno un profilo di scansione');
      return;
    }

    await startScanQueue({
      targets,
      scan_profiles: selectedProfiles,
      authorization_confirmed: authorizationConfirmed,
      ownership_proof: ownershipProof,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" ref={exportContainerRef}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">SurfaceScan360</h1>
            <p className="text-muted-foreground">
              Scansione completa della superficie di attacco esterna
            </p>
          </div>
          <Button variant="outline" onClick={handleExportPdf} disabled={exportingPdf}>
            <Download className="w-4 h-4 mr-2" />
            {exportingPdf ? 'Esportazione...' : 'Esporta PDF'}
          </Button>
        </div>

        {isAdmin && (
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Start Scan (Admin)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Seleziona profili multipli, crea una coda di scansione e rilancia anche asset già scansionati.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Target primario: dominio, subdominio, URL, IPv4 o IPv6"
                value={scanTargetInput}
                onChange={(event) => setScanTargetInput(event.target.value)}
              />

              <div className="rounded-md border border-border p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Profili scansione</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedProfiles(SCAN_PROFILES)}
                  >
                    Seleziona tutti
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedProfiles([])}
                  >
                    Pulisci
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SCAN_PROFILES.map((profile) => (
                    <label key={profile} className="flex items-center gap-2 text-sm rounded-md border border-border px-2 py-2">
                      <Checkbox
                        checked={selectedProfiles.includes(profile)}
                        onCheckedChange={() => toggleProfile(profile)}
                      />
                      <span>{profileLabel(profile)}</span>
                      <span className="text-xs text-muted-foreground">({profile})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center justify-between px-3 py-2 rounded-md border border-border">
                  <span className="text-sm">Autorizzazione confermata</span>
                  <Switch checked={authorizationConfirmed} onCheckedChange={setAuthorizationConfirmed} />
                </div>
                <div className="flex items-center justify-between px-3 py-2 rounded-md border border-border">
                  <span className="text-sm">Riscansiona anche asset già fatti</span>
                  <Switch checked={queueRescanExisting} onCheckedChange={setQueueRescanExisting} />
                </div>
              </div>

              {queueRescanExisting && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={rescanLimit}
                    onChange={(event) => setRescanLimit(event.target.value)}
                    placeholder="Limite asset da re-scan"
                  />
                  <div className="text-xs text-muted-foreground flex items-center">
                    Target storici disponibili: {rescanTargets.length}
                  </div>
                </div>
              )}

              <Textarea
                placeholder="Ownership proof (consigliato per scansioni IP/CVE validation)"
                value={ownershipProof}
                onChange={(event) => setOwnershipProof(event.target.value)}
                rows={2}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  Job attivi: {activeJobsCount} • Target storici: {rescanTargets.length}
                </div>
                <Button
                  onClick={handleStartScan}
                  disabled={
                    startingScan ||
                    selectedProfiles.length === 0 ||
                    !authorizationConfirmed ||
                    (!scanTargetInput.trim() && !queueRescanExisting)
                  }
                >
                  {startingScan ? 'Creazione coda...' : 'Avvia coda scansioni'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isAdminUser && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle>Gestione IP Monitorati (Solo Admin)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Aggiungi IP singoli, range o reti CIDR per controllare quali asset pubblici rientrano nel monitoraggio.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  placeholder="Es. 203.0.113.10 | 203.0.113.10-203.0.113.20 | 203.0.113.0/24"
                  value={newMonitoredIpInput}
                  onChange={(event) => setNewMonitoredIpInput(event.target.value)}
                  disabled={monitoredIpRulesSaving}
                />
                <Button
                  onClick={handleAddMonitoredIpRule}
                  disabled={monitoredIpRulesSaving || !newMonitoredIpInput.trim()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi
                </Button>
              </div>

              <div className="rounded-lg border border-border">
                <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  Regole attive: {monitoredIpRules.length}
                </div>

                {monitoredIpRulesLoading ? (
                  <div className="p-4 text-sm text-muted-foreground">Caricamento regole in corso...</div>
                ) : monitoredIpRules.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    Nessuna regola configurata: vengono mostrati tutti gli IP scoperti.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {monitoredIpRules.map((rule) => (
                      <div key={rule.id} className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="uppercase">
                            {rule.entry_type}
                          </Badge>
                          <span className="text-sm font-medium">{rule.input_value}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMonitoredIpRule(rule.id)}
                          disabled={monitoredIpRulesSaving}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Rimuovi
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <SubdomainDumpPanel isAdmin={isAdminUser} />

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Domini/IP Scansionati</p>
                  <p className="text-2xl font-bold text-foreground">
                    {scanDiscovery.scannedDomains.length + scanDiscovery.scannedIps.length}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {scanDiscovery.scannedDomains.length} domini • {scanDiscovery.scannedIps.length} IP
                  </p>
                </div>
                <Globe className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-muted-foreground">Vulnerabilità Critiche</p>
                    <AlertBellButton alertCount={activeAlertsCount} onClick={() => setAlertDialogOpen(true)} />
                  </div>
                  <p className="text-2xl font-bold text-red-500">{findingsCounts.critical}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Finding Totali</p>
                  <p className="text-2xl font-bold text-foreground">{findingsCounts.total}</p>
                  <p className="text-xs text-muted-foreground">
                    High: {findingsCounts.high} • Medium: {findingsCounts.medium} • Low: {findingsCounts.low}
                  </p>
                </div>
                <Shield className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Asset IP Monitorati</p>
                  <p className="text-2xl font-bold text-foreground">{monitoredLiveIps.length}</p>
                </div>
                <Eye className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ultima Scansione</p>
                  <p className="text-sm font-medium text-foreground">{scanDiscovery.lastScanLabel}</p>
                </div>
                <Eye className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Domini/IP Scansionati e Subdomain Trovati</CardTitle>
            <p className="text-sm text-muted-foreground">
              Vista rapida dei target lanciati e degli asset scoperti via enrichment OSINT.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Target scansionati</div>
                <div className="text-xl font-semibold">{scanDiscovery.scannedTargets.length}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Subdomain trovati</div>
                <div className="text-xl font-semibold">
                  {discoveredAssetsLoading ? '...' : scanDiscovery.discoveredSubdomains.length}
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">IP trovati</div>
                <div className="text-xl font-semibold">
                  {discoveredAssetsLoading ? '...' : scanDiscovery.discoveredIps.length}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Ultimi target scansionati</p>
                <div className="flex flex-wrap gap-2">
                  {scanDiscovery.scannedTargets.slice(0, 12).map((target) => (
                    <Badge key={target} variant="outline" className="max-w-full truncate">
                      {target}
                    </Badge>
                  ))}
                  {scanDiscovery.scannedTargets.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nessun target scansionato</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Subdomain trovati</p>
                <div className="flex flex-wrap gap-2">
                  {scanDiscovery.discoveredSubdomains.slice(0, 16).map((subdomain) => (
                    <Badge key={subdomain} variant="secondary" className="max-w-full truncate">
                      {subdomain}
                    </Badge>
                  ))}
                  {scanDiscovery.discoveredSubdomains.length === 0 && !discoveredAssetsLoading && (
                    <p className="text-sm text-muted-foreground">Nessun subdomain trovato</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subdomain / Dominio</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Tipo Hosting</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead>Evidenza</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanDiscovery.discoveredSubdomains.slice(0, 20).map((subdomain) => {
                    const directJob = latestJobByHost.get(subdomain);
                    const rootJob = latestJobByHost.get(simpleRootDomain(subdomain));
                    const context = directJob?.hosting_context ?? rootJob?.hosting_context ?? null;
                    const isShared = context === 'shared_hosting';
                    const dumpMeta = dumpedSubdomainMeta[subdomain];
                    return (
                      <TableRow key={subdomain}>
                        <TableCell className="font-medium">{subdomain}</TableCell>
                        <TableCell className="text-sm">{dumpMeta?.ip || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={isShared ? 'destructive' : 'outline'}>
                            {hostingLabel(context)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {isShared ? 'Servizio (multi-tenant)' : 'Server/servizio dedicato'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {dumpMeta?.note || 'Da scansione SurfaceScan360'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {scanDiscovery.discoveredSubdomains.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                        Nessun subdomain disponibile
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dominio Scansionato</TableHead>
                    <TableHead>IP Puntuale</TableHead>
                    <TableHead>Reverse DNS (PTR)</TableHead>
                    <TableHead>Hosting</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reverseAnalysisRows.map((row) => (
                    <TableRow key={row.host}>
                      <TableCell className="font-medium">{row.host}</TableCell>
                      <TableCell className="text-sm">
                        {row.resolvedIps.length > 0 ? row.resolvedIps.join(', ') : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.reverseHosts.length > 0 ? row.reverseHosts.slice(0, 4).join(', ') : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.hostingContext === 'shared_hosting' ? 'destructive' : 'outline'}>
                          {hostingLabel(row.hostingContext)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {reverseAnalysisRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                        Nessuna analisi reverse disponibile
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <SecurityFindings />

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Asset IP Pubblici Monitorati ({monitoredLiveIps.length} trovati)</CardTitle>
            <p className="text-sm text-muted-foreground">
              {hasMonitoredRules
                ? `Filtrati da ${monitoredIpRules.length} regole IP attive`
                : 'Nessuna regola IP configurata: visualizzazione completa degli IP scoperti'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Cerca IP..."
                value={assetSearch}
                onChange={(event) => setAssetSearch(event.target.value)}
                className="pl-10"
              />
            </div>

            {paginatedLiveIps.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                Nessun asset corrisponde ai filtri correnti.
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP</TableHead>
                      <TableHead>Regole Match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLiveIps.map((ip) => {
                      const matchedRules = monitoredIpRules.filter((rule) => isIpInRange(ip, rule.ip_start, rule.ip_end));
                      return (
                        <TableRow key={ip}>
                          <TableCell className="font-medium">{ip}</TableCell>
                          <TableCell>
                            {matchedRules.length === 0 ? (
                              <span className="text-muted-foreground text-sm">Nessuna (visualizzazione completa)</span>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {matchedRules.slice(0, 3).map((rule) => (
                                  <Badge key={rule.id} variant="outline" className="text-xs">
                                    {rule.input_value}
                                  </Badge>
                                ))}
                                {matchedRules.length > 3 && (
                                  <Badge variant="secondary" className="text-xs">+{matchedRules.length - 3}</Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {totalAssetPages > 1 && (
              <div className="flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setAssetPage((prev) => Math.max(prev - 1, 1))}
                        className={assetPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalAssetPages }, (_, index) => index + 1).map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setAssetPage(page)}
                          isActive={assetPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setAssetPage((prev) => Math.min(prev + 1, totalAssetPages))}
                        className={assetPage === totalAssetPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Risultati Scansione (Live)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target</TableHead>
                    <TableHead>Profilo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Creata</TableHead>
                    <TableHead>Completata</TableHead>
                    <TableHead>Errore</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanJobs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        Nessuna scansione disponibile.
                      </TableCell>
                    </TableRow>
                  )}
                  {scanJobs.slice(0, 20).map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">{job.raw_target || job.normalized_target}</TableCell>
                      <TableCell>{job.scan_profile}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge>
                      </TableCell>
                      <TableCell>{new Date(job.created_at).toLocaleString('it-IT')}</TableCell>
                      <TableCell>
                        {job.completed_at ? new Date(job.completed_at).toLocaleString('it-IT') : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{job.error_message || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <SurfaceScanAlertConfigDialog
        open={alertDialogOpen}
        onOpenChange={setAlertDialogOpen}
        onSubmit={handleCreateAlert}
        mode="create"
      />
    </DashboardLayout>
  );
};

export default SurfaceScan360;
