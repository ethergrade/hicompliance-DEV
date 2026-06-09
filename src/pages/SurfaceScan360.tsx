import React, { useMemo, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Globe,
  Shield,
  AlertTriangle,
  Eye,
  Plus,
  Trash2,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import SecurityFindings from '@/components/surface-scan/SecurityFindings';
import SurfaceScanModuleCards from '@/components/surface-scan/SurfaceScanModuleCards';
import SurfaceScanReportRepository from '@/components/surface-scan/SurfaceScanReportRepository';
import SurfaceScanExposureSection from '@/components/surface-scan/SurfaceScanExposureSection';
import { SurfaceScanTrendline } from '@/components/surface-scan/SurfaceScanTrendline';
import { AlertBellButton } from '@/components/dark-risk/AlertBellButton';
import { SurfaceScanAlertConfigDialog } from '@/components/surface-scan/SurfaceScanAlertConfigDialog';
import { useSurfaceScanAlerts, SurfaceScanAlertTypes } from '@/hooks/useSurfaceScanAlerts';
import { useSurfaceScanMonitoredIps } from '@/hooks/useSurfaceScanMonitoredIps';
import { useSurfaceScanEngine, type SurfaceScanProfile } from '@/hooks/useSurfaceScanEngine';
import { useSurfaceScanDiscoveredAssets } from '@/hooks/useSurfaceScanDiscoveredAssets';
import { useSurfaceScanFindings } from '@/hooks/useSurfaceScanFindings';
import { isIpInRange, parseMonitoredScopeMixedEntries } from '@/lib/ipRange';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useSubdomainDump } from '@/hooks/useSubdomainDump';
import { SubdomainDumpPanel } from '@/components/surface-scan/SubdomainDumpPanel';
import { SurfaceScanJobsPanel } from '@/components/surface-scan/SurfaceScanJobsPanel';
import {
  classifySurfaceHostForScope,
  isIpWithinScopeRules,
  splitMonitoredScopeRules,
} from '@/lib/surfaceScopeGuard';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

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

const statusProgressMeta = (
  status: string,
): { value: number; barClass: string; trackClass: string; title: string } => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') {
    return {
      value: 100,
      barClass: 'bg-green-500',
      trackClass: 'bg-green-500/20',
      title: 'Completata',
    };
  }
  if (normalized === 'failed') {
    return {
      value: 100,
      barClass: 'bg-red-500',
      trackClass: 'bg-red-500/20',
      title: 'Fallita',
    };
  }
  if (normalized === 'running') {
    return {
      value: 65,
      barClass: 'bg-amber-500',
      trackClass: 'bg-amber-500/20',
      title: 'In esecuzione',
    };
  }
  if (normalized === 'queued') {
    return {
      value: 25,
      barClass: 'bg-sky-500',
      trackClass: 'bg-sky-500/20',
      title: 'In coda',
    };
  }
  return {
    value: 35,
    barClass: 'bg-slate-500',
    trackClass: 'bg-slate-500/20',
    title: 'In attesa',
  };
};

const formatExposureJobError = (errorMessage: string | null | undefined): string => {
  const raw = String(errorMessage || '').trim();
  if (!raw) return '-';

  const normalized = raw.toLowerCase();
  if (normalized.includes('no pentest-tools tasks for this exposure job')) {
    return 'Recovery automatica task Pentest in corso';
  }
  if (normalized.includes('all pentest-tools tasks failed')) {
    return 'Provider exposure non ha completato i task: retry automatico pianificato';
  }
  if (normalized.includes('completed with partial optional-phase failures')) {
    return 'Completata con moduli opzionali non disponibili';
  }
  if (normalized.includes('optional phase skipped')) {
    return 'Modulo opzionale saltato dal provider';
  }
  return raw;
};

const SCAN_PROFILES: SurfaceScanProfile[] = [
  'safe_recon',
  'domain_exposure',
  'ip_exposure',
  'cve_api_validation',
];

const hostingLabel = (context: string | null): string => {
  if (context === 'excluded_noise') return 'Fuori scope (PTR/shared)';
  if (context === 'excluded_scope') return 'Fuori scope (scope guard)';
  if (context === 'shared_hosting') return 'Servizio in shared host';
  if (context === 'cdn_proxy') return 'Servizio dietro CDN/Proxy';
  if (context === 'dedicated') return 'Server dedicato';
  return 'Non classificato';
};

interface ReverseAssetRow {
  asset_value: string;
  raw: { ip?: string } | null;
}

const SurfaceScan360: React.FC = () => {
  const dependencyMapRef = useRef<HTMLDivElement>(null);
  const exposureSectionRef = useRef<HTMLDivElement>(null);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [newMonitoredIpInput, setNewMonitoredIpInput] = useState('');
  const [ownershipProof, setOwnershipProof] = useState('');
  const [assetSearch, setAssetSearch] = useState('');
  const [assetPage, setAssetPage] = useState(1);
  const [isDiscoveryCollapsed, setIsDiscoveryCollapsed] = useState(true);
  const [isLiveResultsCollapsed, setIsLiveResultsCollapsed] = useState(true);
  const [showScopeDiagnostics, setShowScopeDiagnostics] = useState(false);
  const [reverseDnsMap, setReverseDnsMap] = useState<Record<string, string[]>>({});

  const assetsPerPage = 15;
  const { organizationId } = useClientOrganization();

  const { alerts, createAlert } = useSurfaceScanAlerts();
  const activeAlertsCount = alerts.filter((a) => a.is_active).length;

  const { jobs: scanJobs, startScanQueue, isAdmin } = useSurfaceScanEngine();
  const {
    subdomains: discoveredSubdomains,
    ips: discoveredIps,
    hostMeta,
    scopeDomains,
    scopeCounters,
    loading: discoveredAssetsLoading,
  } = useSurfaceScanDiscoveredAssets();
  const subdomainDump = useSubdomainDump();
  const { counts: findingsCounts } = useSurfaceScanFindings();

  const {
    rules: monitoredIpRules,
    loading: monitoredIpRulesLoading,
    saving: monitoredIpRulesSaving,
    isAdmin: isAdminUser,
    addRule: addMonitoredIpRule,
    removeRule: removeMonitoredIpRule,
  } = useSurfaceScanMonitoredIps();

  const { ipScopeRules } = useMemo(
    () => splitMonitoredScopeRules(monitoredIpRules as any),
    [monitoredIpRules],
  );

  const handleCreateAlert = async (data: { alert_email: string; alert_types: SurfaceScanAlertTypes }) => {
    return await createAlert(data);
  };

  const scrollToDependencyMap = () => {
    if (isDiscoveryCollapsed) {
      setIsDiscoveryCollapsed(false);
      setTimeout(() => {
        dependencyMapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
      return;
    }
    dependencyMapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToExposureSection = () => {
    exposureSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      .flatMap((dump) =>
        dump.results
          .map((entry) => String(entry.subdomain || '').trim().toLowerCase())
          .filter(Boolean)
          .filter((host) => !classifySurfaceHostForScope(host, scopeDomains).blocked),
      );

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
  }, [scanJobs, discoveredSubdomains, discoveredIps, subdomainDump.history, scopeDomains]);

  const visibleScannedTargets = useMemo(() => {
    return scanDiscovery.scannedTargets.filter((target) => {
      const host = extractHostFromTarget(target);
      if (!host) return false;
      if (IPV4_REGEX.test(host) || isIpv6(host)) {
        return isIpWithinScopeRules(host, ipScopeRules);
      }
      return !classifySurfaceHostForScope(host, scopeDomains).blocked;
    });
  }, [scanDiscovery.scannedTargets, scopeDomains, ipScopeRules]);

  const excludedScannedTargets = useMemo(() => {
    return scanDiscovery.scannedTargets.filter((target) => !visibleScannedTargets.includes(target));
  }, [scanDiscovery.scannedTargets, visibleScannedTargets]);

  const excludedHostDiagnostics = useMemo(() => {
    return Object.values(hostMeta)
      .filter((meta) => Boolean(meta.exclusionReason))
      .sort((a, b) => a.host.localeCompare(b.host));
  }, [hostMeta]);

  const dumpedSubdomainMeta = useMemo(() => {
    const map: Record<string, { ip: string | null; note: string; sources: string[] }> = {};
    for (const dump of subdomainDump.history) {
      for (const entry of dump.results) {
        const key = String(entry.subdomain || '').trim().toLowerCase();
        if (!key || map[key]) continue;
        if (classifySurfaceHostForScope(key, scopeDomains).blocked) continue;
        const note = [entry.country, entry.asn_name].filter(Boolean).join(' · ');
        map[key] = {
          ip: entry.ip || null,
          note: note || `Fonte: ${dump.sources.join(', ')}`,
          sources: dump.sources || [],
        };
      }
    }
    return map;
  }, [subdomainDump.history, scopeDomains]);

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
    if (!organizationId) return;
    const reverseDnsChannel = supabase
      .channel(`surface-reverse-dns-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'surface_assets',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
          const next = payload.new as Record<string, any> | null;
          const old = payload.old as Record<string, any> | null;
          const nextType = String(next?.asset_type || '');
          const oldType = String(old?.asset_type || '');
          if (nextType === 'reverse_dns_hostname' || oldType === 'reverse_dns_hostname') {
            void loadReverseDnsMap();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reverseDnsChannel);
    };
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

  const resolvedIpsByHost = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const job of scanJobs) {
      const host = String(job.hostname || '').trim().toLowerCase();
      if (!host) continue;
      const ips = Array.isArray(job.resolved_ips)
        ? job.resolved_ips.map((ip) => String(ip).trim()).filter(Boolean)
        : [];
      if (ips.length === 0) continue;
      if (!map.has(host)) map.set(host, []);
      const current = map.get(host)!;
      for (const ip of ips) {
        if (!current.includes(ip)) current.push(ip);
      }
    }
    return map;
  }, [scanJobs]);

  const reverseAnalysisRows = useMemo(() => {
    const rows: Array<{
      host: string;
      hostingContext: string | null;
      resolvedIps: string[];
      reverseHosts: string[];
      inScope: boolean;
    }> = [];

    const hostsToAnalyze = [...new Set([
      ...scanDiscovery.scannedDomains,
      ...scanDiscovery.discoveredSubdomains,
    ])].slice(0, 50);

    for (const host of hostsToAnalyze) {
      const hostScope = classifySurfaceHostForScope(host, scopeDomains);
      if (hostScope.blocked) continue;
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
        inScope: hostScope.inScope,
      });
    }

    return rows;
  }, [scanDiscovery.scannedDomains, scanDiscovery.discoveredSubdomains, latestJobByHost, reverseDnsMap, scopeDomains]);

  const domainIpDependencyGraph = useMemo(() => {
    const edgeSet = new Set<string>();
    const domainToIps = new Map<string, string[]>();
    const candidateDomains = [...new Set([
      ...scanDiscovery.scannedDomains,
      ...scanDiscovery.discoveredSubdomains,
    ])]
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean)
      .filter((host) => !classifySurfaceHostForScope(host, scopeDomains).blocked)
      .slice(0, 60);

    for (const domain of candidateDomains) {
      const ipSet = new Set<string>();
      const jobIps = resolvedIpsByHost.get(domain) || [];
      const metaIps = hostMeta[domain]?.ips || [];
      const dumpIp = dumpedSubdomainMeta[domain]?.ip ? [dumpedSubdomainMeta[domain]?.ip as string] : [];
      for (const ip of [...jobIps, ...metaIps, ...dumpIp]) {
        const normalizedIp = String(ip || '').trim().toLowerCase();
        if (!normalizedIp) continue;
        if (!isIpWithinScopeRules(normalizedIp, ipScopeRules)) continue;
        ipSet.add(normalizedIp);
      }
      if (ipSet.size === 0) continue;
      const ips = [...ipSet].slice(0, 12);
      domainToIps.set(domain, ips);
      for (const ip of ips) {
        edgeSet.add(`${domain}|${ip}`);
      }
    }

    const edges = [...edgeSet].map((entry) => {
      const [domain, ip] = entry.split('|');
      return { domain, ip };
    });

    const ips = [...new Set(edges.map((entry) => entry.ip))].slice(0, 30);
    const allowedIpSet = new Set(ips);
    const filteredEdges = edges.filter((edge) => allowedIpSet.has(edge.ip)).slice(0, 180);
    const domains = [...new Set(filteredEdges.map((entry) => entry.domain))].slice(0, 30);
    const allowedDomainSet = new Set(domains);
    const finalEdges = filteredEdges.filter((edge) => allowedDomainSet.has(edge.domain));

    const maxRows = Math.max(domains.length, ips.length, 1);
    const viewBoxHeight = Math.max(320, maxRows * 28 + 50);

    return {
      domains,
      ips,
      edges: finalEdges,
      viewBoxHeight,
      truncated: candidateDomains.length > domains.length || edges.length > finalEdges.length,
      totalRelations: finalEdges.length,
    };
  }, [
    dumpedSubdomainMeta,
    hostMeta,
    ipScopeRules,
    resolvedIpsByHost,
    scanDiscovery.discoveredSubdomains,
    scanDiscovery.scannedDomains,
    scopeDomains,
  ]);

  const rescanTargets = useMemo(() => {
    const unique = new Set<string>();
    for (const job of scanJobs) {
      const target = String(job.raw_target || job.normalized_target || '').trim();
      if (!target) continue;
      const host = extractHostFromTarget(target);
      if (host) {
        if (IPV4_REGEX.test(host) || isIpv6(host)) {
          if (!isIpWithinScopeRules(host, ipScopeRules)) continue;
        } else if (classifySurfaceHostForScope(host, scopeDomains).blocked) {
          continue;
        }
      }
      unique.add(target);
    }
    for (const subdomain of scanDiscovery.discoveredSubdomains) {
      if (!subdomain) continue;
      if (classifySurfaceHostForScope(subdomain, scopeDomains).blocked) continue;
      unique.add(subdomain);
    }
    for (const ip of scanDiscovery.discoveredIps) {
      if (!ip) continue;
      if (!isIpWithinScopeRules(ip, ipScopeRules)) continue;
      unique.add(ip);
    }
    return [...unique];
  }, [scanJobs, scanDiscovery.discoveredSubdomains, scanDiscovery.discoveredIps, scopeDomains, ipScopeRules]);

  const monitoredLiveIps = useMemo(() => {
    let ips = [...scanDiscovery.discoveredIps].filter((ip) => isIpWithinScopeRules(ip, ipScopeRules));

    const term = assetSearch.trim().toLowerCase();
    if (term) {
      ips = ips.filter((ip) => ip.toLowerCase().includes(term));
    }

    return ips.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [scanDiscovery.discoveredIps, ipScopeRules, assetSearch]);

  const totalAssetPages = Math.max(1, Math.ceil(monitoredLiveIps.length / assetsPerPage));
  const paginatedLiveIps = monitoredLiveIps.slice((assetPage - 1) * assetsPerPage, assetPage * assetsPerPage);

  React.useEffect(() => {
    setAssetPage(1);
  }, [assetSearch, ipScopeRules.length, scanDiscovery.discoveredIps.length]);

  const handleAddMonitoredIpRule = async () => {
    const entries = parseMonitoredScopeMixedEntries(newMonitoredIpInput);
    if (entries.length === 0) {
      toast.error('Inserisci almeno un dominio/IP/range/CIDR');
      return;
    }

    let successCount = 0;
    const failedEntries: string[] = [];

    for (const entry of entries) {
      const success = await addMonitoredIpRule(entry, { silent: true });
      if (success) {
        successCount += 1;
      } else {
        failedEntries.push(entry);
      }
    }

    if (successCount > 0) {
      toast.success(`Scope aggiornato: ${successCount} regole aggiunte`);
      setNewMonitoredIpInput('');
    }

    if (failedEntries.length > 0) {
      toast.error(
        `Regole non aggiunte: ${failedEntries.slice(0, 3).join(', ')}${failedEntries.length > 3 ? ' ...' : ''}`,
      );
    }
  };

  const handleRemoveMonitoredIpRule = async (ruleId: string) => {
    await removeMonitoredIpRule(ruleId);
  };

  const handleAddSubdomainToScope = async (subdomain: string) => {
    if (!isAdminUser) return;
    const candidate = String(subdomain || '').trim().toLowerCase();
    if (!candidate) return;
    await addMonitoredIpRule(candidate, {
      discovered_via: 'subdomain_dump',
      discovered_from: 'surface-module-cards',
      silent: false,
    });
  };

  const handleScanSingleSubdomain = async (subdomain: string) => {
    if (!isAdmin) return;
    const target = String(subdomain || '').trim().toLowerCase();
    if (!target) return;
    const scanProfiles = [...SCAN_PROFILES];
    await startScanQueue({
      targets: [target],
      scan_profiles: scanProfiles,
      authorization_confirmed: true,
      ownership_proof: ownershipProof || 'subdomain_module_card',
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">SurfaceScan360</h1>
            <p className="text-muted-foreground">
              Scansione completa della superficie di attacco esterna
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={scrollToExposureSection}>
              Ports &amp; Technologies
            </Button>
          </div>
        </div>

        <SurfaceScanJobsPanel />

        {isAdminUser && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle>Gestione IP Monitorati (Solo Admin)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Aggiungi IP singoli, range o reti CIDR per controllare quali asset pubblici rientrano nel monitoraggio.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <div className="font-medium text-foreground">Legenda input scope (misto supportato)</div>
                <div>Separatore lista: `,` `;` `|` oppure a capo.</div>
                <div>Esempio: `panapesca.it, 203.0.113.10, 203.0.113.10-203.0.113.20, 203.0.113.0/24`</div>
                <div>Tipi supportati: dominio, IP singolo, range IP, CIDR.</div>
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  placeholder="Es. panapesca.it, 203.0.113.10, 203.0.113.10-203.0.113.20, 203.0.113.0/24"
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
                  <p className="text-sm text-muted-foreground">Host unici scansionati</p>
                  <p className="text-2xl font-bold text-foreground">
                    {scanDiscovery.scannedDomains.length + scanDiscovery.scannedIps.length}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Target lanciati: {scanDiscovery.scannedTargets.length}
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

        <SurfaceScanTrendline />

        <Card className="border-border">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Domini/IP Scansionati e Subdomain Trovati</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Vista rapida dei target lanciati e degli asset scoperti via enrichment OSINT.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={scrollToDependencyMap}>
                  Vai alla mappa DNS
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDiscoveryCollapsed((prev) => !prev)}
                >
                  {isDiscoveryCollapsed ? (
                    <ChevronRight className="w-4 h-4 mr-2" />
                  ) : (
                    <ChevronDown className="w-4 h-4 mr-2" />
                  )}
                  {isDiscoveryCollapsed ? 'Espandi' : 'Collassa'}
                </Button>
              </div>
            </div>
          </CardHeader>
          {!isDiscoveryCollapsed ? (
            <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">Target scansionati</div>
            <div className="text-xl font-semibold">{visibleScannedTargets.length}</div>
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
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">In scope</div>
            <div className="text-xl font-semibold">{discoveredAssetsLoading ? '...' : scopeCounters.in_scope}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">Esclusi scope</div>
            <div className="text-xl font-semibold">{discoveredAssetsLoading ? '...' : scopeCounters.excluded_by_scope}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">Esclusi shared/noise</div>
            <div className="text-xl font-semibold">{discoveredAssetsLoading ? '...' : scopeCounters.excluded_shared_noise}</div>
          </div>
        </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Ultimi target scansionati</p>
                <div className="flex flex-wrap gap-2">
                  {visibleScannedTargets.slice(0, 12).map((target) => (
                    <Badge key={target} variant="outline" className="max-w-full truncate">
                      {target}
                    </Badge>
                  ))}
                  {visibleScannedTargets.length === 0 && (
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

            {isAdminUser && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Diagnostica Scope Guard (Admin)</p>
                    <p className="text-xs text-muted-foreground">
                      Vista opzionale di elementi esclusi automaticamente da scope guard.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={showScopeDiagnostics}
                      onCheckedChange={setShowScopeDiagnostics}
                      aria-label="Mostra elementi esclusi da scope guard"
                    />
                    <span className="text-xs text-muted-foreground">Mostra esclusi</span>
                  </div>
                </div>

                {showScopeDiagnostics && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary">Target esclusi: {excludedScannedTargets.length}</Badge>
                      <Badge variant="secondary">Host esclusi: {excludedHostDiagnostics.length}</Badge>
                      <Badge variant="secondary">IP esclusi scope: {scopeCounters.excluded_by_scope}</Badge>
                      <Badge variant="secondary">Shared/noise esclusi: {scopeCounters.excluded_shared_noise}</Badge>
                    </div>
                    <div className="rounded-md border border-border overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Elemento escluso</TableHead>
                            <TableHead>Motivo</TableHead>
                            <TableHead>Origine</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {excludedHostDiagnostics.slice(0, 50).map((entry) => (
                            <TableRow key={`excluded-${entry.host}`}>
                              <TableCell className="font-mono text-xs">{entry.host}</TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {entry.exclusionReason === 'scope_excluded_shared_noise'
                                    ? 'Shared/Noise'
                                    : 'Out of Scope'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {(entry.sourceLabels || []).join(', ') || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                          {excludedHostDiagnostics.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                                Nessun host escluso disponibile
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subdomain / Dominio</TableHead>
                    <TableHead>IP Dominio/Host</TableHead>
                    <TableHead>Tipo Hosting</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead>Evidenza</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanDiscovery.discoveredSubdomains.slice(0, 20).map((subdomain) => {
                    const directJob = latestJobByHost.get(subdomain);
                    const rootJob = latestJobByHost.get(simpleRootDomain(subdomain));
                    const classification = classifySurfaceHostForScope(subdomain, scopeDomains);
                    const context = directJob?.hosting_context ?? rootJob?.hosting_context ?? (classification.blocked ? 'excluded_noise' : null);
                    const isShared = context === 'shared_hosting' || context === 'excluded_noise';
                    const dumpMeta = dumpedSubdomainMeta[subdomain];
                    const meta = hostMeta[subdomain];
                    const ipCandidates = [
                      ...(resolvedIpsByHost.get(subdomain) || []),
                      ...(resolvedIpsByHost.get(simpleRootDomain(subdomain)) || []),
                      ...(meta?.ips || []),
                      ...(dumpMeta?.ip ? [dumpMeta.ip] : []),
                    ].filter(Boolean);
                    const uniqueIps = [...new Set(ipCandidates)];
                    const role = classification.blocked
                      ? 'Fuori scope (shared/noise)'
                      : classification.inScope
                        ? 'Scope monitorato'
                        : meta?.fromReverseDns
                          ? 'Subdomain reverse/dump'
                          : 'Subdomain scoperto';
                    const evidenceLabels = [...new Set([...(meta?.sourceLabels || []), ...(dumpMeta?.sources || [])])];
                    return (
                      <TableRow key={subdomain}>
                        <TableCell className="font-medium">{subdomain}</TableCell>
                        <TableCell className="text-sm">{uniqueIps.length > 0 ? uniqueIps.join(', ') : '-'}</TableCell>
                        <TableCell>
                          <Badge variant={isShared ? 'destructive' : 'outline'}>
                            {hostingLabel(context)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {role}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground space-y-1">
                          <div>{dumpMeta?.note || 'Da scansione SurfaceScan360'}</div>
                          {evidenceLabels.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {evidenceLabels.map((label) => (
                                <Badge key={`${subdomain}-${label}`} variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {label}
                                </Badge>
                              ))}
                            </div>
                          )}
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

            <div
              ref={dependencyMapRef}
              id="domain-ip-dependency-map"
              className="rounded-lg border border-border p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Mappa Dipendenze Dominio/IP (Scope)</p>
                  <p className="text-xs text-muted-foreground">
                    Relazioni DNS operative tra domini/subdomini in scope e IP associati.
                  </p>
                </div>
                <Badge variant="secondary">
                  Relazioni: {domainIpDependencyGraph.totalRelations}
                </Badge>
              </div>
              {domainIpDependencyGraph.edges.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">
                  Nessuna relazione dominio/IP disponibile al momento.
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/10 p-3 overflow-auto">
                  <svg
                    viewBox={`0 0 1000 ${domainIpDependencyGraph.viewBoxHeight}`}
                    className="w-full min-w-[780px]"
                    role="img"
                    aria-label="Mappa dipendenze domini e IP"
                  >
                    <g>
                      <text x="120" y="22" className="text-[12px]" fill="hsl(var(--muted-foreground))">Domini/Subdomini</text>
                      <text x="760" y="22" className="text-[12px]" fill="hsl(var(--muted-foreground))">IP correlati</text>
                    </g>
                    {domainIpDependencyGraph.edges.map((edge) => {
                      const domainIndex = domainIpDependencyGraph.domains.indexOf(edge.domain);
                      const ipIndex = domainIpDependencyGraph.ips.indexOf(edge.ip);
                      const domainY = 42 + domainIndex * 28;
                      const ipY = 42 + ipIndex * 28;
                      return (
                        <line
                          key={`edge-${edge.domain}-${edge.ip}`}
                          x1={280}
                          y1={domainY}
                          x2={720}
                          y2={ipY}
                          stroke="rgba(99, 102, 241, 0.35)"
                          strokeWidth="1.2"
                        />
                      );
                    })}
                    {domainIpDependencyGraph.domains.map((domain, index) => {
                      const y = 42 + index * 28;
                      const label = domain.length > 44 ? `${domain.slice(0, 41)}...` : domain;
                      return (
                        <g key={`domain-${domain}`}>
                          <circle cx={275} cy={y} r={4} fill="rgb(99, 102, 241)" />
                          <text x={268} y={y + 4} textAnchor="end" className="text-[11px]" fill="hsl(var(--foreground))">
                            {label}
                          </text>
                        </g>
                      );
                    })}
                    {domainIpDependencyGraph.ips.map((ip, index) => {
                      const y = 42 + index * 28;
                      return (
                        <g key={`ip-${ip}`}>
                          <circle cx={725} cy={y} r={4} fill="rgb(34, 197, 94)" />
                          <text x={734} y={y + 4} textAnchor="start" className="text-[11px]" fill="hsl(var(--foreground))">
                            {ip}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
              {domainIpDependencyGraph.truncated && (
                <p className="text-xs text-muted-foreground">
                  Mappa ottimizzata: alcune relazioni aggiuntive sono disponibili nei dettagli tabellari.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dominio Scansionato</TableHead>
                    <TableHead>IP Puntuale</TableHead>
                    <TableHead>Reverse DNS (PTR)</TableHead>
                    <TableHead>Hosting</TableHead>
                    <TableHead>Scope</TableHead>
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
                      <TableCell>
                        <Badge variant={row.inScope ? 'default' : 'secondary'}>
                          {row.inScope ? 'In Scope' : 'Scoperta OSINT'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {reverseAnalysisRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                        Nessuna analisi reverse disponibile
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            </CardContent>
          ) : (
            <CardContent className="pt-0">
              <div className="rounded-lg border border-border p-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Sezione Discovery collassata</p>
                  <p className="text-xs text-muted-foreground">
                    La mappa dipendenze dominio↔IP è disponibile ({domainIpDependencyGraph.totalRelations} relazioni).
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={scrollToDependencyMap}>
                  Apri mappa DNS
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        <SurfaceScanModuleCards
          isAdminView={isAdminUser}
          subdomains={scanDiscovery.discoveredSubdomains}
          onAddSubdomainToScope={handleAddSubdomainToScope}
          onScanSubdomain={handleScanSingleSubdomain}
        />

        <div ref={exposureSectionRef}>
          <SurfaceScanExposureSection isAdmin={isAdmin} />
        </div>

        <SecurityFindings />

        <SurfaceScanReportRepository scanJobs={scanJobs} />

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Asset IP Pubblici Monitorati ({monitoredLiveIps.length} trovati)</CardTitle>
            <p className="text-sm text-muted-foreground">
              {ipScopeRules.length > 0
                ? `Filtrati da ${ipScopeRules.length} regole IP attive`
                : 'Nessuna regola IP attiva: con strict scope gli IP fuori regola sono esclusi'}
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
                      const matchedRules = monitoredIpRules.filter(
                        (rule) =>
                          ['single', 'range', 'cidr'].includes(String(rule.entry_type || '').toLowerCase()) &&
                          isIpInRange(ip, rule.ip_start, rule.ip_end),
                      );
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
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Risultati Scansione (Live)</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsLiveResultsCollapsed((prev) => !prev)}
              >
                {isLiveResultsCollapsed ? (
                  <ChevronRight className="w-4 h-4 mr-2" />
                ) : (
                  <ChevronDown className="w-4 h-4 mr-2" />
                )}
                {isLiveResultsCollapsed ? 'Espandi' : 'Collassa'}
              </Button>
            </div>
          </CardHeader>
          {!isLiveResultsCollapsed && (
            <CardContent>
            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target</TableHead>
                    <TableHead>Profilo</TableHead>
                    <TableHead>Avanzamento</TableHead>
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
                        {(() => {
                          const progress = statusProgressMeta(job.status);
                          return (
                            <div className="w-32" title={progress.title}>
                              <div className={`h-2 rounded-full overflow-hidden ${progress.trackClass}`}>
                                <div
                                  className={`h-2 rounded-full ${progress.barClass}`}
                                  style={{ width: `${progress.value}%` }}
                                />
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-1">{progress.value}%</div>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>{new Date(job.created_at).toLocaleString('it-IT')}</TableCell>
                      <TableCell>
                        {job.completed_at ? new Date(job.completed_at).toLocaleString('it-IT') : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" title={job.error_message || ''}>
                        {formatExposureJobError(job.error_message)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
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
