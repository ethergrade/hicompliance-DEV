import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Eye,
  UserX,
  Shield,
  TrendingDown,
  Activity,
  Clock3,
  Radar,
  RefreshCw,
  Mail,
  Server,
  Globe,
  FileText,
  Download,
  ExternalLink,
  Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AlertBellButton } from '@/components/dark-risk/AlertBellButton';
import { AlertConfigDialog } from '@/components/dark-risk/AlertConfigDialog';
import { DarkRiskKpiCard } from '@/components/dark-risk/DarkRiskKpiCard';
import { DarkRiskCoverageMatrix } from '@/components/dark-risk/DarkRiskCoverageMatrix';
import { DarkRiskThreatGroups } from '@/components/dark-risk/DarkRiskThreatGroups';
import { DarkRiskRecentAlerts } from '@/components/dark-risk/DarkRiskRecentAlerts';
import { DarkRiskFindingsTable, type DarkRiskFindingRow } from '@/components/dark-risk/DarkRiskFindingsTable';
import { DarkRiskAssetsTable, type DarkRiskAssetRow } from '@/components/dark-risk/DarkRiskAssetsTable';
import { useDarkRiskAlerts } from '@/hooks/useDarkRiskAlerts';
import { useDarkRiskOverview } from '@/hooks/useDarkRiskOverview';
import { useDarkRiskRoadmapStatus } from '@/hooks/useDarkRiskRoadmapStatus';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type DashboardTab = 'overview' | 'roadmap' | 'findings' | 'assets' | 'surface' | 'identity' | 'reports';

type FindingFilterState = {
  severity: 'all' | 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string | null;
  query: string;
  highlightedFindingId: string | null;
};

type DarkRiskFindingRowExtended = DarkRiskFindingRow & {
  category: string;
};

const severityOrder: Array<FindingFilterState['severity']> = ['all', 'critical', 'high', 'medium', 'low', 'info'];

const categoryIcon = (category: string): LucideIcon => {
  const text = category.toLowerCase();
  if (text.includes('credenzial')) return UserX;
  if (text.includes('email')) return Mail;
  if (text.includes('servizi')) return Server;
  if (text.includes('dns') || text.includes('tls')) return Globe;
  if (text.includes('reputation')) return Eye;
  return Shield;
};

const classifyThreatCategory = (title: string, findingType: string, source: string): string => {
  const sourceText = `${title} ${findingType} ${source}`.toLowerCase();

  if (/credential|credenzial|password|stealer|compromis/.test(sourceText)) return 'Credenziali compromesse';
  if (/mail|email/.test(sourceText) && /leak|expos|compromis/.test(sourceText)) return 'Email esposte';
  if (/database|dump|db /.test(sourceText)) return 'Database leak';
  if (/phish|brand|impersonation/.test(sourceText)) return 'Phishing e brand abuse';
  if (/open_port|open port|service_fingerprint|ports|pentest_tool|shodan/.test(sourceText)) return 'Servizi esposti';
  if (/dmarc|spf|dkim|mail_security|mx|bimi/.test(sourceText)) return 'Email security';
  if (/dns|tls|ssl|hsts|whois|rdap|http_security|headers/.test(sourceText)) return 'DNS e TLS';
  if (/safe_browsing|urlhaus|phishtank|reputation|dnsbl|threat/.test(sourceText)) return 'Reputation';
  return 'Minacce rilevate';
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('it-IT');
};

const formatDelta = (delta: number | null | undefined): string | null => {
  if (delta == null) return null;
  if (delta === 0) return 'Nessuna variazione';
  if (delta > 0) return `+${delta} vs ultima scansione`;
  return `${delta} vs ultima scansione`;
};

const roadmapStatusLabel: Record<string, string> = {
  completed: 'Completata',
  in_progress: 'In corso',
  planned: 'Pianificata',
  blocked: 'Bloccata',
};

const roadmapBadgeVariant = (status: string): 'default' | 'outline' | 'secondary' | 'destructive' => {
  if (status === 'completed') return 'default';
  if (status === 'in_progress') return 'secondary';
  if (status === 'blocked') return 'destructive';
  return 'outline';
};

const DarkRisk360: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { alerts, createAlert, loading: alertsLoading } = useDarkRiskAlerts();
  const { data: overview, isLoading, isError, error, refetch, isFetching } = useDarkRiskOverview();
  const { organizationId } = useClientOrganization();
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [syncingScan, setSyncingScan] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [findingFilter, setFindingFilter] = useState<FindingFilterState>({
    severity: 'all',
    category: null,
    query: '',
    highlightedFindingId: null,
  });
  const [assetTypeFilter, setAssetTypeFilter] = useState<'all' | 'domain' | 'subdomain' | 'ip' | 'url' | 'email' | 'candidate'>('all');

  const {
    data: reportSnapshots = [],
    isLoading: reportsLoading,
    refetch: refetchReports,
  } = useQuery({
    queryKey: ['darkrisk360-report-snapshots', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error: queryError } = await supabase
        .from('darkrisk_report_snapshots' as any)
        .select('id, title, tier, classification, status, generated_at, scan_run_id, html_storage_path, json_storage_path, pdf_storage_path')
        .eq('organization_id', organizationId)
        .order('generated_at', { ascending: false })
        .limit(12);
      if (queryError) throw queryError;
      return (data || []) as Array<Record<string, any>>;
    },
    staleTime: 60_000,
  });

  const {
    data: findingRows = [],
    isLoading: findingsLoading,
  } = useQuery({
    queryKey: ['darkrisk360-findings', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskFindingRowExtended[]> => {
      if (!organizationId) return [];

      const { data: findingsData, error: findingsError } = await supabase
        .from('darkrisk_findings' as any)
        .select('id, title, finding_type, severity, confidence, status, risk_score, first_seen_at, last_seen_at, metadata, affected_asset_id')
        .eq('organization_id', organizationId)
        .order('risk_score', { ascending: false })
        .limit(400);

      if (findingsError) throw findingsError;

      const findings = (findingsData || []) as Array<Record<string, any>>;
      const assetIds = Array.from(
        new Set(
          findings
            .map((finding) => String(finding.affected_asset_id || '').trim())
            .filter(Boolean),
        ),
      );

      const assetsMap = new Map<string, string>();
      if (assetIds.length > 0) {
        const { data: assetsData, error: assetsError } = await supabase
          .from('darkrisk_assets' as any)
          .select('id, normalized_value, value')
          .eq('organization_id', organizationId)
          .in('id', assetIds);

        if (assetsError) throw assetsError;

        for (const asset of (assetsData || []) as Array<Record<string, any>>) {
          assetsMap.set(String(asset.id), String(asset.normalized_value || asset.value || '-'));
        }
      }

      return findings.map((finding) => {
        const source = String(finding?.metadata?.source_origin || 'surface_scan_engine');
        const findingType = String(finding.finding_type || 'unknown');
        const title = String(finding.title || findingType);
        const category = classifyThreatCategory(title, findingType, source);

        return {
          id: String(finding.id),
          severity: String(finding.severity || 'info') as DarkRiskFindingRow['severity'],
          risk_score: Number(finding.risk_score || 0),
          title,
          asset: assetsMap.get(String(finding.affected_asset_id || '')) || '-',
          finding_type: findingType,
          confidence: String(finding.confidence || 'medium') as DarkRiskFindingRow['confidence'],
          status: String(finding.status || 'new'),
          first_seen_at: String(finding.first_seen_at || ''),
          last_seen_at: String(finding.last_seen_at || ''),
          source,
          compromise_type: String(finding?.metadata?.compromise_type || 'unknown'),
          category,
        };
      });
    },
    staleTime: 60_000,
  });

  const {
    data: assetRows = [],
    isLoading: assetsLoading,
  } = useQuery({
    queryKey: ['darkrisk360-assets', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskAssetRow[]> => {
      if (!organizationId) return [];

      const [assetsRes, findingsRes] = await Promise.all([
        supabase
          .from('darkrisk_assets' as any)
          .select('id, asset_type, normalized_value, value, scope_status, source, first_seen_at, last_seen_at')
          .eq('organization_id', organizationId)
          .order('last_seen_at', { ascending: false })
          .limit(600),
        supabase
          .from('darkrisk_findings' as any)
          .select('id, affected_asset_id')
          .eq('organization_id', organizationId)
          .limit(1200),
      ]);

      if (assetsRes.error) throw assetsRes.error;
      if (findingsRes.error) throw findingsRes.error;

      const findingCountByAsset = new Map<string, number>();
      for (const finding of ((findingsRes.data || []) as Array<Record<string, any>>)) {
        const assetId = String(finding.affected_asset_id || '').trim();
        if (!assetId) continue;
        findingCountByAsset.set(assetId, (findingCountByAsset.get(assetId) || 0) + 1);
      }

      return ((assetsRes.data || []) as Array<Record<string, any>>).map((asset) => ({
        id: String(asset.id),
        asset_type: String(asset.asset_type || 'unknown'),
        value: String(asset.normalized_value || asset.value || '-'),
        scope_status: String(asset.scope_status || 'approved'),
        source: String(asset.source || 'manual'),
        first_seen_at: asset.first_seen_at ? String(asset.first_seen_at) : null,
        last_seen_at: asset.last_seen_at ? String(asset.last_seen_at) : null,
        findings_count: findingCountByAsset.get(String(asset.id)) || 0,
      }));
    },
    staleTime: 60_000,
  });

  const {
    data: roadmap,
    isLoading: roadmapLoading,
    isError: roadmapError,
  } = useDarkRiskRoadmapStatus();

  const generateReportMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      const { data, error: invokeError } = await supabase.functions.invoke('darkrisk360-generate-report', {
        body: {
          customer_id: organizationId,
          classification: 'confidential',
        },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(String(data.error));
      return data;
    },
    onSuccess: async (data) => {
      toast.success(data?.reused ? 'Report esistente riutilizzato' : 'Report DarkRisk360 generato');
      await Promise.all([
        refetchReports(),
        queryClient.invalidateQueries({ queryKey: ['darkrisk360-overview', organizationId] }),
      ]);
      setActiveTab('reports');
    },
    onError: (err: any) => {
      toast.error(`Errore generazione report: ${String(err?.message || 'errore sconosciuto')}`);
    },
  });

  const activeAlertsCount = alerts.filter((alert) => alert.is_active).length;

  const kpiCards = useMemo(
    () => [
      {
        key: 'active_threats',
        title: 'Minacce Attive',
        value: overview.kpis.active_threats.value,
        delta: overview.kpis.active_threats.delta,
        tone: 'text-red-500',
        icon: AlertTriangle,
        description: 'Numero di finding attivi (non risolti) rilevati nel ciclo corrente.',
      },
      {
        key: 'credential_leaks',
        title: 'Credenziali Leak',
        value: overview.kpis.credential_leaks.value,
        delta: overview.kpis.credential_leaks.delta,
        tone: 'text-orange-500',
        icon: UserX,
        description: 'Evidenze rilevate su credenziali, identità o possibili compromissioni account.',
      },
      {
        key: 'monitored_domains',
        title: 'Domini Monitorati',
        value: overview.kpis.monitored_domains.value,
        delta: overview.kpis.monitored_domains.delta,
        tone: 'text-primary',
        icon: Shield,
        description: 'Domini in perimetro autorizzato monitorati dal modulo DarkRisk360.',
      },
      {
        key: 'risk_score',
        title: 'Punteggio Rischio',
        value: `${overview.kpis.risk_score.value}`,
        delta: overview.kpis.risk_score.delta,
        tone: 'text-red-500',
        icon: TrendingDown,
        extra: overview.kpis.risk_score.level,
        description: 'Indice sintetico 0-100 calcolato da severità, confidenza e trend dei finding.',
      },
      {
        key: 'last_scan',
        title: 'Ultima Scansione',
        value: overview.kpis.last_scan.value ? formatDateTime(overview.kpis.last_scan.value) : 'Nessuna scansione',
        delta: overview.kpis.last_scan.delta,
        tone: 'text-foreground',
        icon: Clock3,
        description: 'Timestamp di completamento dell’ultimo ciclo disponibile per il cliente.',
      },
      {
        key: 'coverage',
        title: 'Copertura Controlli',
        value: `${overview.kpis.controls_coverage.value}%`,
        delta: null,
        tone: 'text-primary',
        icon: Radar,
        extra: `${overview.kpis.controls_coverage.completed}/${overview.kpis.controls_coverage.total} completati`,
        description: 'Percentuale dei controlli previsti eseguiti con successo nel ciclo corrente.',
      },
      {
        key: 'critical_findings',
        title: 'Finding Critici',
        value: overview.kpis.critical_findings.value,
        delta: overview.kpis.critical_findings.delta,
        tone: 'text-red-500',
        icon: Activity,
        description: 'Finding con severità critical da verificare o gestire con priorità immediata.',
      },
      {
        key: 'new_alerts',
        title: 'Nuovi Alert',
        value: overview.kpis.new_alerts.value,
        delta: overview.kpis.new_alerts.delta,
        tone: 'text-yellow-500',
        icon: Eye,
        description: 'Nuovi eventi emersi rispetto alla scansione precedente sullo stesso perimetro.',
      },
    ],
    [overview],
  );

  const filteredFindings = useMemo(() => {
    return findingRows
      .filter((row) => {
        if (findingFilter.severity !== 'all' && row.severity !== findingFilter.severity) return false;
        if (findingFilter.category && row.category !== findingFilter.category) return false;

        const query = findingFilter.query.trim().toLowerCase();
        if (!query) return true;

        const text = `${row.title} ${row.finding_type} ${row.asset} ${row.source} ${row.compromise_type}`.toLowerCase();
        return text.includes(query);
      })
      .sort((a, b) => {
        if (findingFilter.highlightedFindingId) {
          if (a.id === findingFilter.highlightedFindingId) return -1;
          if (b.id === findingFilter.highlightedFindingId) return 1;
        }
        return b.risk_score - a.risk_score;
      });
  }, [findingRows, findingFilter]);

  const filteredAssets = useMemo(() => {
    return assetRows.filter((row) => {
      const normalizedType = row.asset_type.toLowerCase();
      const normalizedScope = row.scope_status.toLowerCase();

      if (assetTypeFilter === 'all') return true;
      if (assetTypeFilter === 'candidate') return normalizedScope === 'candidate';
      return normalizedType === assetTypeFilter;
    });
  }, [assetRows, assetTypeFilter]);

  const handleSyncSurfaceScan = async () => {
    if (!organizationId) {
      toast.error('Nessun cliente selezionato');
      return;
    }

    setSyncingScan(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('darkrisk360-sync-surfacescan', {
        body: {
          customer_id: organizationId,
          trigger_type: 'manual',
        },
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(String(data.error));

      toast.success('Sincronizzazione DarkRisk360 completata');
      void Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['darkrisk360-findings', organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['darkrisk360-assets', organizationId] }),
      ]);
    } catch (invokeError: any) {
      toast.error(`Errore sync DarkRisk360: ${String(invokeError?.message || 'errore sconosciuto')}`);
    } finally {
      setSyncingScan(false);
    }
  };

  const openReportAsset = async (report: Record<string, any>, format: 'html' | 'json' | 'pdf') => {
    if (!organizationId) {
      toast.error('Nessun cliente selezionato');
      return;
    }

    const { data, error: invokeError } = await supabase.functions.invoke('darkrisk360-report-access', {
      body: {
        customer_id: organizationId,
        report_id: String(report?.id || ''),
        format,
        reason: 'manual_export_from_darkrisk_ui',
      },
    });

    if (invokeError) {
      toast.error(`Impossibile aprire export ${format.toUpperCase()}: ${String(invokeError.message || 'errore sconosciuto')}`);
      return;
    }

    if (!data?.ok || !data?.signed_url) {
      toast.error(String(data?.error || `Export ${format.toUpperCase()} non disponibile`));
      return;
    }

    window.open(String(data.signed_url), '_blank', 'noopener,noreferrer');
  };

  const openCategoryDetail = (category: string) => {
    setActiveTab('findings');
    setFindingFilter((prev) => ({ ...prev, category, highlightedFindingId: null }));
  };

  const openFindingDetail = (findingId: string, fallbackType: string) => {
    setActiveTab('findings');
    setFindingFilter((prev) => ({
      ...prev,
      highlightedFindingId: findingId,
      category: prev.category,
      query: prev.query || fallbackType,
    }));
  };

  const onKpiClick = (key: string) => {
    if (key === 'monitored_domains') {
      setActiveTab('assets');
      setAssetTypeFilter('domain');
      return;
    }

    setActiveTab('findings');

    if (key === 'critical_findings') {
      setFindingFilter((prev) => ({ ...prev, severity: 'critical', category: null, highlightedFindingId: null }));
      return;
    }

    if (key === 'credential_leaks') {
      setFindingFilter((prev) => ({ ...prev, severity: 'all', category: 'Credenziali compromesse', query: 'credential', highlightedFindingId: null }));
      return;
    }

    if (key === 'new_alerts') {
      setFindingFilter((prev) => ({ ...prev, severity: 'all', category: null, query: 'new', highlightedFindingId: null }));
      return;
    }

    setFindingFilter((prev) => ({ ...prev, severity: 'all', category: null, query: '', highlightedFindingId: null }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold text-foreground">DarkRisk360</h1>
              <Badge variant="outline">{overview.tier === 'extended' ? 'Estesa' : 'Standard'}</Badge>
              {!overview.enabled && <Badge variant="destructive">Servizio non abilitato</Badge>}
            </div>
            <p className="text-muted-foreground">
              Monitoraggio minacce, esposizione digitale e Domain Threat Intelligence
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <AlertBellButton alertCount={activeAlertsCount} onClick={() => setAlertDialogOpen(true)} />
            <Button variant="outline" onClick={() => void refetch()} disabled={isLoading || isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Aggiorna
            </Button>
            <Button className="bg-primary text-primary-foreground" disabled={syncingScan || isFetching} onClick={() => void handleSyncSurfaceScan()}>
              <Eye className="w-4 h-4 mr-2" />
              {syncingScan ? 'Scansione in corso...' : 'Nuova scansione'}
            </Button>
            <Button variant="outline" disabled={!organizationId || generateReportMutation.isPending} onClick={() => generateReportMutation.mutate()}>
              <FileText className="w-4 h-4 mr-2" />
              {generateReportMutation.isPending ? 'Generazione...' : 'Genera report'}
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin/clients')}>
              <Building2 className="w-4 h-4 mr-2" />
              Cambia cliente
            </Button>
          </div>
        </div>

        {(isLoading || alertsLoading) && (
          <Card className="border-border">
            <CardContent className="py-8 text-sm text-muted-foreground">Caricamento dati DarkRisk360 in corso...</CardContent>
          </Card>
        )}

        {isError && !isLoading && (
          <Card className="border-red-500/40">
            <CardContent className="py-6 text-sm text-red-300">
              Impossibile caricare i dati DarkRisk360: {String((error as any)?.message || 'errore sconosciuto')}.
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {kpiCards.map((card) => (
                <DarkRiskKpiCard
                  key={card.key}
                  title={card.title}
                  value={card.value}
                  delta={formatDelta(card.delta)}
                  extra={card.extra || null}
                  toneClass={card.tone}
                  icon={card.icon}
                  description={card.description}
                  onClick={() => onKpiClick(card.key)}
                />
              ))}
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DashboardTab)} className="space-y-4">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
                <TabsTrigger value="findings">Findings</TabsTrigger>
                <TabsTrigger value="assets">Assets</TabsTrigger>
                <TabsTrigger value="surface">Surface</TabsTrigger>
                <TabsTrigger value="identity">Identity</TabsTrigger>
                <TabsTrigger value="reports">Reports</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <DarkRiskCoverageMatrix controls={overview.coverage_controls} />
                <DarkRiskThreatGroups
                  groups={overview.threat_groups}
                  resolveIcon={categoryIcon}
                  onOpenCategory={openCategoryDetail}
                />
                <DarkRiskRecentAlerts alerts={overview.recent_alerts as any} onOpenFinding={openFindingDetail} />
              </TabsContent>

              <TabsContent value="roadmap" className="space-y-4">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>Roadmap Implementazione (MD09)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {roadmapLoading ? (
                      <p className="text-sm text-muted-foreground">Calcolo stato roadmap in corso...</p>
                    ) : roadmapError ? (
                      <p className="text-sm text-red-300">Impossibile calcolare lo stato roadmap.</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Avanzamento complessivo</span>
                            <span className="font-semibold">{roadmap.summary.progress_percent}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-primary transition-all"
                              style={{ width: `${Math.max(0, Math.min(100, roadmap.summary.progress_percent))}%` }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                          <Badge variant="default">Completate: {roadmap.summary.completed}</Badge>
                          <Badge variant="secondary">In corso: {roadmap.summary.in_progress}</Badge>
                          <Badge variant="outline">Pianificate: {roadmap.summary.planned}</Badge>
                          <Badge variant="destructive">Bloccate: {roadmap.summary.blocked}</Badge>
                          <Badge variant="outline">Tier: {roadmap.tier}</Badge>
                        </div>

                        <div className="space-y-2">
                          {roadmap.phases.map((phase) => (
                            <div key={phase.key} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium">{phase.title}</p>
                                <Badge variant={roadmapBadgeVariant(phase.status)}>
                                  {roadmapStatusLabel[phase.status] || phase.status}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{phase.evidence}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="findings" className="space-y-4">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>Filtri Finding</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {severityOrder.map((severity) => (
                        <Button
                          key={severity}
                          size="sm"
                          variant={findingFilter.severity === severity ? 'default' : 'outline'}
                          onClick={() => setFindingFilter((prev) => ({ ...prev, severity }))}
                        >
                          {severity}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant={findingFilter.category ? 'default' : 'outline'}
                        onClick={() => setFindingFilter((prev) => ({ ...prev, category: null, highlightedFindingId: null }))}
                      >
                        Tutte le categorie
                      </Button>
                    </div>
                    <Input
                      placeholder="Cerca per titolo, tipo, asset, source..."
                      value={findingFilter.query}
                      onChange={(event) => setFindingFilter((prev) => ({ ...prev, query: event.target.value, highlightedFindingId: null }))}
                    />
                    {findingFilter.category ? (
                      <p className="text-xs text-muted-foreground">Categoria attiva: {findingFilter.category}</p>
                    ) : null}
                  </CardContent>
                </Card>
                <DarkRiskFindingsTable
                  rows={filteredFindings}
                  subtitle={findingsLoading ? 'Caricamento finding in corso...' : `${filteredFindings.length} finding filtrati`}
                />
              </TabsContent>

              <TabsContent value="assets" className="space-y-4">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>Filtri Asset</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {(['all', 'domain', 'subdomain', 'ip', 'url', 'email', 'candidate'] as const).map((filterValue) => (
                      <Button
                        key={filterValue}
                        size="sm"
                        variant={assetTypeFilter === filterValue ? 'default' : 'outline'}
                        onClick={() => setAssetTypeFilter(filterValue)}
                      >
                        {filterValue}
                      </Button>
                    ))}
                  </CardContent>
                </Card>
                <DarkRiskAssetsTable
                  rows={filteredAssets}
                  subtitle={assetsLoading ? 'Caricamento asset in corso...' : `${filteredAssets.length} asset nel filtro corrente`}
                />
              </TabsContent>

              <TabsContent value="surface">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>Surface</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {overview.latest_scan ? (
                      <>
                        <p>Questa vista aggrega i segnali SurfaceScan360 (domini, IP, porte, servizi, TLS, CVE) sui dati reali già sincronizzati.</p>
                        <p>Usa la tab Findings per consultare le evidenze operative filtrate per severità, categoria e contesto.</p>
                      </>
                    ) : (
                      <p>I dati SurfaceScan360 non sono disponibili per questa scansione. Verificare integrazione o rilanciare il job.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="identity">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>Identity Exposure</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>Identità impattate: <span className="font-semibold text-foreground">{overview.kpis.impacted_identities.value}</span></p>
                    {overview.tier === 'extended' ? (
                      <p>Modalità Estesa attiva: è possibile abilitare workflow avanzati analyst per evidenze sensibili con audit.</p>
                    ) : (
                      <p>Modalità Standard: dettagli raw non esposti. Sono mostrati solo indicatori sintetici e raccomandazioni.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="reports" className="space-y-4">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle>Repository Report DarkRisk360</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!organizationId || generateReportMutation.isPending}
                        onClick={() => generateReportMutation.mutate()}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        {generateReportMutation.isPending ? 'Generazione...' : 'Genera report'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(reportsLoading || generateReportMutation.isPending) && (
                      <p className="text-sm text-muted-foreground">Aggiornamento repository report in corso...</p>
                    )}
                    {!reportsLoading && reportSnapshots.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nessun report snapshot disponibile per il cliente selezionato.</p>
                    )}
                    {!reportsLoading && reportSnapshots.length > 0 && (
                      <div className="space-y-2">
                        {reportSnapshots.map((report) => (
                          <div key={String(report.id)} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{String(report.title || 'DarkRisk360 Report')}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {String(report.tier || 'standard')} • {String(report.classification || 'confidential')} • {formatDateTime(report.generated_at)}
                              </p>
                            </div>
                            <Badge variant="outline">{String(report.status || 'completed')}</Badge>
                            <Button variant="outline" size="sm" onClick={() => void openReportAsset(report, 'json')}>
                              <Download className="w-4 h-4 mr-2" />
                              JSON
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void openReportAsset(report, 'html')}>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              HTML
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        <AlertConfigDialog
          open={alertDialogOpen}
          onOpenChange={setAlertDialogOpen}
          onSubmit={createAlert}
          mode="create"
        />
      </div>
    </DashboardLayout>
  );
};

export default DarkRisk360;
