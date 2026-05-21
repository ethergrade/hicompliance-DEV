import React, { useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Globe, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Search,
  Eye,
  TrendingUp,
  Filter,
  Calendar,
  BarChart3,
  Activity,
  Network,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Download,
  Plus,
  Trash2
} from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import SecurityFindings from '@/components/surface-scan/SecurityFindings';
import { AlertBellButton } from '@/components/dark-risk/AlertBellButton';
import { SurfaceScanAlertConfigDialog } from '@/components/surface-scan/SurfaceScanAlertConfigDialog';
import { useSurfaceScanAlerts, SurfaceScanAlertTypes } from '@/hooks/useSurfaceScanAlerts';
import { useSurfaceScanMonitoredIps } from '@/hooks/useSurfaceScanMonitoredIps';
import { isIpInRange, isValidDomain } from '@/lib/ipRange';
import { useProgressiveShodanScan } from '@/hooks/useProgressiveShodanScan';
import { useStartSurfaceScan } from '@/hooks/useSurfaceScanEngine';
import { useSurfaceScanHistory, triggerManualSurfaceScan } from '@/hooks/useSurfaceScanHistory';
import { Progress } from '@/components/ui/progress';
import { SurfaceScanTrendline } from '@/components/surface-scan/SurfaceScanTrendline';
import { useSubdomainDump } from '@/hooks/useSubdomainDump';
import { ValidatedCveTab } from '@/components/surface-scan/ValidatedCveTab';
import { OsintEnrichmentTab } from '@/components/surface-scan/OsintEnrichmentTab';
import { AiReportTab } from '@/components/surface-scan/AiReportTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SurfaceScan360: React.FC = () => {
  const exportContainerRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    organizations,
    selectedOrganization,
    setSelectedOrganization,
    canManageMultipleClients,
    hasFetchedOrganizations,
  } = useClientOrganization();

  // Sync ?org=<id> <-> selected client so refresh / link sharing preserves context
  useEffect(() => {
    if (!hasFetchedOrganizations || !canManageMultipleClients) return;
    const urlOrgId = searchParams.get('org');
    if (urlOrgId) {
      if (urlOrgId !== selectedOrganization?.id) {
        const target = organizations.find((o) => o.id === urlOrgId);
        if (target) setSelectedOrganization(target);
      }
    } else if (selectedOrganization) {
      const next = new URLSearchParams(searchParams);
      next.set('org', selectedOrganization.id);
      setSearchParams(next, { replace: true });
    }
  }, [hasFetchedOrganizations, canManageMultipleClients, searchParams, selectedOrganization, organizations, setSelectedOrganization, setSearchParams]);


  const [openTooltip, setOpenTooltip] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [triggeringScan, setTriggeringScan] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [newMonitoredIpInput, setNewMonitoredIpInput] = useState('');
  
  // Collapsible states for legends
  const [cveCollegendOpen, setCveLegendOpen] = useState(false);
  const [epssLegendOpen, setEpssLegendOpen] = useState(false);
  const [riskTrendLegendOpen, setRiskTrendLegendOpen] = useState(false);
  
  // Alert management
  const { alerts, createAlert } = useSurfaceScanAlerts();
  const activeAlertsCount = alerts.filter(a => a.is_active).length;
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
  
  const assetsPerPage = 5;

  // Engine progressivo: 1 query per regola, range espansi server-side
  const scanRules = React.useMemo(
    () => monitoredIpRules.map((r) => ({
      id: r.id,
      entry_type: r.entry_type as 'single' | 'range' | 'cidr' | 'domain',
      input_value: r.input_value,
      ip_start: r.ip_start,
      ip_end: r.ip_end,
    })),
    [monitoredIpRules]
  );

  const shodanScan = useProgressiveShodanScan(scanRules, hasMonitoredRules);
  const { assets: shodanAssets, isLoading: shodanLoading, error: shodanError, progress: scanProgress, completed: scanCompleted, total: scanTotal, truncatedRules } = shodanScan;

  // Storico settimanale REALE (cron + DB)
  const scanHistory = useSurfaceScanHistory(12);

  // Nessun dato mock: se non ci sono regole monitorate, l'elenco è vuoto
  const allPublicAssets = hasMonitoredRules
    ? shodanAssets.map((a: any) => ({
        ip: a.ip,
        hostname: a.hostname,
        hostnames: Array.isArray(a.hostnames) ? a.hostnames : [a.hostname].filter(Boolean),
        score: a.score,
        risk: a.risk,
        status: a.status,
        ports: a.ports,
        services: a.services,
      }))
    : [];



  const monitoredAssets = allPublicAssets.filter((asset) => {
    if (!hasMonitoredRules) return true;
    return monitoredIpRules.some((rule) => {
      if (rule.entry_type === 'domain') {
        const dom = rule.input_value.toLowerCase();
        const hostList = (asset.hostnames && asset.hostnames.length ? asset.hostnames : [asset.hostname]).filter(Boolean);
        return hostList.some((h: string) => h.toLowerCase().includes(dom));
      }
      return isIpInRange(asset.ip, rule.ip_start, rule.ip_end);
    });
  });

  // Aggiunge i sottodomini scoperti via Subdomain Dump come asset "virtuali"
  // se non già coperti da un risultato Shodan reale
  const normHost = (v: string) => String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const existingHosts = new Set<string>(
    monitoredAssets.flatMap((a: any) =>
      (a.hostnames && a.hostnames.length ? a.hostnames : [a.hostname]).filter(Boolean).map((h: string) => normHost(h))
    )
  );
  const dumpedVirtualAssets = (monitoredIpRules as any[])
    .filter((r) => r.discovered_via === 'subdomain_dump')
    .map((r) => ({ host: normHost(r.input_value), from: r.discovered_from || null }))
    .filter((r) => r.host && !existingHosts.has(r.host))
    .filter((r, i, arr) => arr.findIndex((x) => x.host === r.host) === i)
    .map((r) => ({
      ip: '—',
      hostname: r.host,
      hostnames: [r.host],
      score: 0,
      risk: 'Basso',
      status: 'unknown',
      ports: [] as number[],
      services: [] as string[],
      __dumpedFrom: r.from,
    }));
  const monitoredAssetsAll = [...monitoredAssets, ...dumpedVirtualAssets];

  const filteredAssets = monitoredAssetsAll.filter(asset => {


    const matchesSearch = searchTerm === '' || 
      asset.ip.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.services.some(service => service.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || asset.status === statusFilter;
    const matchesRisk = riskFilter === 'all' || asset.risk === riskFilter;
    
    return matchesSearch && matchesStatus && matchesRisk;
  });

  const totalPages = Math.ceil(filteredAssets.length / assetsPerPage);
  const indexOfLastAsset = currentPage * assetsPerPage;
  const indexOfFirstAsset = indexOfLastAsset - assetsPerPage;
  const currentAssets = filteredAssets.slice(indexOfFirstAsset, indexOfLastAsset);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, riskFilter, monitoredIpRules.length]);

  const scanResults = hasMonitoredRules
    ? shodanAssets.map((asset) => ({
        domain: asset.hostname || asset.ip,
        status: asset.status,
        issues: asset.cves.length,
        score: asset.score,
        cves: asset.cves,
      }))
    : [];


  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Basso': return 'text-green-500';
      case 'Medio': return 'text-yellow-500';
      case 'Alto': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Sicuro': return 'text-green-500';
      case 'Attenzione': return 'text-yellow-500';
      case 'Critico': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Sicuro': return 'default';
      case 'Attenzione': return 'secondary';
      case 'Critico': return 'destructive';
      default: return 'outline';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-orange-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  // Dati REALI derivati dal cron settimanale (surface_scan_history)
  const monthlyData = scanHistory.weekly.map(w => ({
    mese: w.label,
    porte_aperte: w.porte_aperte,
    porte_chiuse: w.porte_chiuse,
    cve_critiche: w.cve_critiche,
    cve_risolte: w.cve_risolte,
    epss_score: w.epss_score,
  }));

  const exposedServicesData = hasMonitoredRules ? (() => {
    // Aggregato servizi dalla snapshot Shodan live (best-effort)
    const counts = new Map<string, number>();
    for (const a of shodanAssets) {
      for (const s of (a.services ?? [])) {
        const key = String(s).split('/')[0].toUpperCase().slice(0, 12) || 'ALTRO';
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], i) => ({ name, value, color: palette[i % palette.length] }));
  })() : [];

  const riskTrendData = scanHistory.weekly.map(w => ({
    mese: w.label,
    rischio_alto: w.rischio_alto,
    rischio_medio: w.rischio_medio,
    rischio_basso: w.rischio_basso,
  }));



  const chartConfig = {
    porte_aperte: {
      label: "Porte Aperte",
      color: "hsl(var(--destructive))",
    },
    porte_chiuse: {
      label: "Porte Chiuse", 
      color: "hsl(var(--primary))",
    },
    cve_critiche: {
      label: "CVE Critiche",
      color: "hsl(var(--destructive))",
    },
    cve_risolte: {
      label: "CVE Risolte",
      color: "hsl(var(--primary))",
    },
    epss_score: {
      label: "EPSS Score",
      color: "hsl(var(--chart-3))",
    }
  };

  const toggleTooltip = (index: number) => {
    setOpenTooltip(openTooltip === index ? null : index);
  };

  const getEPSSRiskLevel = (score: number) => {
    if (score < 4) return { level: 'Basso', color: '#10b981' }; // Green
    if (score < 7) return { level: 'Medio', color: '#f59e0b' }; // Orange (more visible)
    return { level: 'Alto', color: '#ef4444' }; // Red
  };

  // Custom dot component for dynamic coloring
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    const riskInfo = getEPSSRiskLevel(payload.epss_score);
    
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={riskInfo.color}
        stroke="hsl(var(--background))"
        strokeWidth={2}
      />
    );
  };

  // Custom active dot component
  const CustomActiveDot = (props: any) => {
    const { cx, cy, payload } = props;
    const riskInfo = getEPSSRiskLevel(payload.epss_score);
    
    return (
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill={riskInfo.color}
        stroke="hsl(var(--background))"
        strokeWidth={3}
      />
    );
  };

  // Custom EPSS tooltip component
  const EPSSTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const currentScore = data.value;
      const currentIndex = monthlyData.findIndex(item => item.mese === label);
      const previousScore = currentIndex > 0 ? monthlyData[currentIndex - 1].epss_score : null;
      const variation = previousScore ? (currentScore - previousScore).toFixed(1) : null;
      const riskInfo = getEPSSRiskLevel(currentScore);
      
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <div className="font-medium text-foreground mb-2">{label} 2024</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: riskInfo.color }}
              />
              <span className="text-sm text-foreground font-medium">
                EPSS Score: {currentScore}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Livello di rischio: <span style={{ color: riskInfo.color }}>{riskInfo.level}</span>
            </div>
            {variation && (
              <div className="text-xs text-muted-foreground">
                Variazione: {parseFloat(variation) > 0 ? '+' : ''}{variation} vs mese precedente
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

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
      toast.error('Errore durante l\'export PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const startSurfaceScan = useStartSurfaceScan();

  const handleAddMonitoredIpRule = async () => {
    const input = newMonitoredIpInput.trim();
    const success = await addMonitoredIpRule(input);
    if (success) {
      setNewMonitoredIpInput('');
      // Se è un dominio, avvia anche il motore Web Check + Pentest-Tools (enrichment OSINT/CVE)
      if (input && !/^\d{1,3}(\.\d{1,3}){3}/.test(input) && !input.includes('/') && !input.includes('-')) {
        try {
          await startSurfaceScan.mutateAsync({ target: input });
          toast.success(`Scansione avviata su ${input}: Attack Surface + OSINT + validazione CVE attiva`);
        } catch (e: any) {
          console.warn('start surface scan failed', e);
        }
      }
    }
  };

  const handleRemoveMonitoredIpRule = async (ruleId: string) => {
    await removeMonitoredIpRule(ruleId);
  };

  return (
    <TooltipProvider>
      <DashboardLayout>
        <div className="space-y-6" ref={exportContainerRef}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">SurfaceScan360</h1>
              <p className="text-muted-foreground">
                Scansione completa della superficie di attacco esterna
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5 gap-1.5 py-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Scansione automatica settimanale
                {scanHistory.latest && (
                  <span className="text-muted-foreground font-normal ml-1">
                    · Ultima: {new Date(scanHistory.latest.scanned_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {!scanHistory.latest && !scanHistory.isLoading && (
                  <span className="text-muted-foreground font-normal ml-1">· In attesa primo snapshot</span>
                )}
              </Badge>
              <Button variant="outline" onClick={handleExportPdf} disabled={exportingPdf}>
                <Download className="w-4 h-4 mr-2" />
                {exportingPdf ? 'Esportazione...' : 'Esporta PDF'}
              </Button>
              <Button
                className="bg-primary text-primary-foreground"
                disabled={triggeringScan || !hasMonitoredRules}
                onClick={async () => {
                  if (!hasMonitoredRules) {
                    toast.error('Nessuna regola monitorata', { description: 'Aggiungi almeno un IP/dominio prima di lanciare la scansione.' });
                    return;
                  }
                  setTriggeringScan(true);
                  try {
                    const res = await triggerManualSurfaceScan(monitoredIpRules[0].organization_id);
                    const total = res?.results?.[0]?.total_assets ?? 0;
                    toast.success('Scansione completata', { description: `${total} asset analizzati e salvati su DB.` });
                    await scanHistory.refetch();
                  } catch (e: any) {
                    toast.error('Errore scansione', { description: e?.message ?? 'Riprova più tardi' });
                  } finally {
                    setTriggeringScan(false);
                  }
                }}
              >
                <Search className="w-4 h-4 mr-2" />
                {triggeringScan ? 'Scansione in corso...' : 'Esegui Scansione'}
              </Button>
            </div>
          </div>


          {isAdminUser && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle>Gestione Asset Monitorati (Solo Admin)</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Aggiungi <strong>domini</strong>, IP singoli, range o reti CIDR. Ogni asset viene analizzato dai nostri motori proprietari di Attack Surface Intelligence, OSINT e validazione attiva delle vulnerabilità.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col md:flex-row gap-2">
                  <Input
                    placeholder="Es. cliente.com | 203.0.113.10 | 203.0.113.10-203.0.113.20 | 203.0.113.0/24"
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
                  <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs text-muted-foreground flex items-center justify-between gap-3">
                    <span>Regole attive: {monitoredIpRules.length}</span>
                    {hasMonitoredRules && scanTotal > 0 && (
                      <div className="flex items-center gap-2 min-w-0 flex-1 max-w-xs">
                        <Progress value={scanProgress} className="h-1.5 flex-1" />
                        <span className="whitespace-nowrap">
                          {shodanLoading ? `Scansione ${scanCompleted}/${scanTotal}` : `Completata ${scanCompleted}/${scanTotal}`}
                        </span>
                      </div>
                    )}
                  </div>
                  {truncatedRules.length > 0 && (
                    <div className="px-3 py-2 border-b border-border bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400">
                      Range troncati a 256 IP: {truncatedRules.join(', ')}
                    </div>
                  )}
                  {shodanError && (
                    <div className="px-3 py-2 border-b border-border bg-destructive/10 text-xs text-destructive">
                      Errore scansione: {shodanError.message}
                    </div>
                  )}

                  {monitoredIpRulesLoading ? (
                    <div className="p-4 text-sm text-muted-foreground">Caricamento regole in corso...</div>
                  ) : monitoredIpRules.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      Nessuna regola configurata: vengono mostrati tutti gli asset disponibili.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {monitoredIpRules.map((rule: any) => (
                        <div key={rule.id} className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="uppercase">
                              {rule.entry_type}
                            </Badge>
                            <span className="text-sm font-medium">{rule.input_value}</span>
                            {rule.discovered_via === 'subdomain_dump' && (
                              <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                                <Globe className="w-3 h-3 mr-1" />
                                Subdomain Dump{rule.discovered_from ? ` · ${rule.discovered_from}` : ''}
                              </Badge>
                            )}
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

          {/* Subdomain Discovery — DNSDumpster-like */}
          <SubdomainDumpPanel isAdmin={isAdminUser} />

          {/* Trendline storico settimanale */}
          <SurfaceScanTrendline />

          <Tabs defaultValue="exposed" className="w-full">
            <TabsList>
              <TabsTrigger value="exposed">Asset esposti</TabsTrigger>
              <TabsTrigger value="validated">CVE validati</TabsTrigger>
              <TabsTrigger value="osint">OSINT enrichment</TabsTrigger>
              <TabsTrigger value="ai-report">Report AI</TabsTrigger>
            </TabsList>
            <TabsContent value="validated" className="mt-4">
              <ValidatedCveTab />
            </TabsContent>
            <TabsContent value="osint" className="mt-4">
              <OsintEnrichmentTab />
            </TabsContent>
            <TabsContent value="ai-report" className="mt-4">
              <AiReportTab />
            </TabsContent>
            <TabsContent value="exposed" className="mt-4 space-y-6">


          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {(() => {
              // Conta domini unici: normalizza (lowercase, no www., no path) e include sia entry_type='domain'
              // sia qualunque input_value che risulta un dominio valido.
              const normalize = (v: string) =>
                v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
              const domainSet = new Set<string>();
              if (hasMonitoredRules) {
                for (const r of monitoredIpRules) {
                  const n = normalize(r.input_value || '');
                  const isDomainType = String(r.entry_type).toLowerCase() === 'domain';
                  if (isDomainType || isValidDomain(n)) domainSet.add(n);
                }
              }
              if (typeof window !== 'undefined') {
                // Debug log per diagnosticare mismatch DB ↔ UI
                console.debug('[SurfaceScan360] monitoredIpRules:', monitoredIpRules.length, monitoredIpRules.map(r => `${r.entry_type}:${r.input_value}`), '→ uniqueDomains:', domainSet.size);
              }
              const domains = domainSet.size;
              const totalMonitored = hasMonitoredRules ? monitoredIpRules.length : 0;
              const criticalVulns = hasMonitoredRules ? shodanAssets.reduce((acc, a) => acc + a.cves.filter(c => c.severity === 'high').length, 0) : 0;
              const avgScore = hasMonitoredRules && shodanAssets.length > 0
                ? Math.round(shodanAssets.reduce((s, a) => s + (a.score || 0), 0) / shodanAssets.length)
                : 0;
              const lastScan = hasMonitoredRules && shodanAssets.length > 0 ? 'Adesso' : '—';
              return (
                <>
                  <Card className="border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Domini Monitorati</p>
                          <p className="text-2xl font-bold text-foreground">{domains}</p>
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
                            <AlertBellButton
                              alertCount={activeAlertsCount}
                              onClick={() => setAlertDialogOpen(true)}
                            />
                          </div>
                          <p className="text-2xl font-bold text-red-500">{criticalVulns}</p>
                        </div>
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Score Medio</p>
                          <p className="text-2xl font-bold text-yellow-500">{avgScore || '—'}</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-yellow-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Asset Monitorati</p>
                          <p className="text-2xl font-bold text-foreground">{totalMonitored}</p>
                        </div>
                        <Shield className="w-8 h-8 text-primary" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Ultima Scansione</p>
                          <p className="text-sm font-medium text-foreground">{lastScan}</p>
                        </div>
                        <Eye className="w-8 h-8 text-primary" />
                      </div>
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </div>

          {/* Security Findings Section - solo dati reali dai motori di scansione */}
          {hasMonitoredRules && (
            <SecurityFindings
              shodanAssets={shodanAssets}
              scanRunning={shodanLoading || startSurfaceScan.isPending}
              dumpedHosts={(monitoredIpRules as any[])
                .filter((r) => r.discovered_via === 'subdomain_dump')
                .map((r) => ({ host: normHost(r.input_value), from: r.discovered_from || null }))
                .filter((r) => r.host)}
            />
          )}

          {/* Weekly Monitoring Section — dati REALI dal cron settimanale (surface_scan_history) */}
          {hasMonitoredRules && scanHistory.hasHistory && (
            <>
              {/* Weekly KPI Cards — dati REALI */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Nuovi Asset Esposti</p>
                        <p className={`text-2xl font-bold ${scanHistory.newOpenLast > 0 ? 'text-destructive' : 'text-primary'}`}>
                          {scanHistory.newOpenLast > 0 ? `+${scanHistory.newOpenLast}` : '0'}
                        </p>
                        <p className="text-xs text-muted-foreground">vs settimana precedente</p>
                      </div>
                      <Network className={`w-8 h-8 ${scanHistory.newOpenLast > 0 ? 'text-destructive' : 'text-primary'}`} />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">CVE Risolte</p>
                        <p className="text-2xl font-bold text-primary">{scanHistory.cveResolvedLast}</p>
                        <p className="text-xs text-muted-foreground">vs settimana precedente</p>
                      </div>
                      <CheckCircle className="w-8 h-8 text-primary" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">EPSS Score Medio</p>
                        <p className="text-2xl font-bold text-chart-3">
                          {scanHistory.latest ? (Math.round(((100 - Number(scanHistory.latest.avg_score)) / 10) * 10) / 10).toFixed(1) : '—'}
                        </p>
                        <p className={`text-xs ${scanHistory.epssDelta < 0 ? 'text-green-500' : scanHistory.epssDelta > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {scanHistory.epssDelta === 0 ? '= invariato' : `${scanHistory.epssDelta > 0 ? '+' : ''}${scanHistory.epssDelta} vs settimana precedente`}
                        </p>
                      </div>
                      <BarChart3 className="w-8 h-8 text-chart-3" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        {(() => {
                          const total = scanHistory.latest ? scanHistory.latest.total_assets : 0;
                          const safePct = scanHistory.latest && total > 0
                            ? Math.round((scanHistory.latest.safe_count / total) * 100)
                            : 0;
                          return (
                            <>
                              <p className="text-sm text-muted-foreground">Asset Sicuri</p>
                              <p className="text-2xl font-bold text-green-500">{safePct}%</p>
                              <p className="text-xs text-muted-foreground">{scanHistory.latest?.safe_count ?? 0} / {total}</p>
                            </>
                          );
                        })()}
                      </div>
                      <Activity className="w-8 h-8 text-green-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Weekly Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Ports Timeline */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle>Trend Asset Esposti / Sicuri</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="mese" className="text-muted-foreground" />

                          <YAxis className="text-muted-foreground" />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line 
                            type="monotone" 
                            dataKey="porte_aperte" 
                            stroke="hsl(var(--destructive))" 
                            strokeWidth={2}
                            dot={{ fill: "hsl(var(--destructive))" }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="porte_chiuse" 
                            stroke="hsl(var(--primary))" 
                            strokeWidth={2}
                            dot={{ fill: "hsl(var(--primary))" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* CVE Timeline with Collapsible Legend */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle>CVE Critiche vs Risolte</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="mese" className="text-muted-foreground" />
                          <YAxis className="text-muted-foreground" />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="cve_critiche" fill="hsl(var(--destructive))" />
                          <Bar dataKey="cve_risolte" fill="hsl(var(--primary))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>

                    {/* Collapsible CVE Legend */}
                    <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border">
                      {/* Always visible color legend */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-3 bg-destructive rounded flex-shrink-0"></div>
                          <span className="text-sm font-medium">CVE Critiche</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-3 bg-primary rounded flex-shrink-0"></div>
                          <span className="text-sm font-medium">CVE Risolte</span>
                        </div>
                      </div>

                      {/* Collapsible detailed legend */}
                      <Collapsible open={cveCollegendOpen} onOpenChange={setCveLegendOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between text-sm p-2">
                            <span className="flex items-center gap-2">
                              <BarChart3 className="w-4 h-4" />
                              Dettagli Legenda
                            </span>
                            {cveCollegendOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-4 mt-3">
                          {/* CVE Definition */}
                          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-purple-800 mb-1">📋 Cosa sono le CVE?</p>
                                <p className="text-xs text-purple-700">
                                  Sistema di identificazione standardizzato per vulnerabilità di sicurezza note. 
                                  Ogni CVE ha un ID univoco e descrive una specifica falla di sicurezza.
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Trend Indicators */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                              <TrendingDown className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <div>
                                <span className="text-sm font-medium text-green-800">CVE Critiche ↓</span>
                                <div className="text-xs text-green-600">Tendenza positiva</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                              <TrendingUp className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              <div>
                                <span className="text-sm font-medium text-blue-800">CVE Risolte ↑</span>
                                <div className="text-xs text-blue-600">Attività remediation</div>
                              </div>
                            </div>
                          </div>

                          {/* Monthly Comparison */}
                          <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                            <div className="flex items-start gap-2">
                              <BarChart3 className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-orange-800 mb-1">💡 Confronto Settimanale</p>
                                <p className="text-xs text-orange-700">
                                  Il rapporto ideale mostra CVE critiche in diminuzione e CVE risolte stabili o in aumento, 
                                  indicando un miglioramento continuo della postura di sicurezza.
                                </p>
                              </div>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>

                    {/* Current Status */}
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        <span className="font-medium">Stato Attuale:</span>
                        <span className="text-primary">20 CVE risolte a Dicembre</span>
                        <span className="text-destructive">vs 5 critiche attive</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Enhanced EPSS Score Timeline with Collapsible Legend */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-chart-3" />
                      EPSS Score Settimanale
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Exploit Prediction Scoring System - predice la probabilità di sfruttamento delle vulnerabilità
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="mese" className="text-muted-foreground" />
                          <YAxis 
                            className="text-muted-foreground" 
                            domain={[0, 10]}
                            ticks={[0, 2, 4, 6, 8, 10]}
                          />
                          <defs>
                            <linearGradient id="epssGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <RechartsTooltip content={<EPSSTooltip />} />
                          <Line 
                            type="monotone" 
                            dataKey="epss_score" 
                            stroke="hsl(var(--chart-3))" 
                            strokeWidth={3}
                            dot={<CustomDot />}
                            activeDot={<CustomActiveDot />}
                            fill="url(#epssGradient)"
                          />
                          <Line 
                            type="monotone" 
                            dataKey={() => 4} 
                            stroke="#9ca3af" 
                            strokeWidth={1}
                            strokeDasharray="5 5"
                            dot={false}
                            activeDot={false}
                          />
                          <Line 
                            type="monotone" 
                            dataKey={() => 7} 
                            stroke="#9ca3af" 
                            strokeWidth={1}
                            strokeDasharray="5 5"
                            dot={false}
                            activeDot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                    
                    {/* Collapsible EPSS Legend */}
                    <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border">
                      {/* Always visible risk levels */}
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-green-500 flex-shrink-0"></div>
                          <span className="text-sm font-medium text-green-800">Basso &lt; 4.0</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-orange-500 flex-shrink-0"></div>
                          <span className="text-sm font-medium text-orange-800">Medio 4.0-7.0</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-red-500 flex-shrink-0"></div>
                          <span className="text-sm font-medium text-red-800">Alto &gt; 7.0</span>
                        </div>
                      </div>

                      {/* Collapsible detailed legend */}
                      <Collapsible open={epssLegendOpen} onOpenChange={setEpssLegendOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between text-sm p-2">
                            <span className="flex items-center gap-2">
                              <BarChart3 className="w-4 h-4" />
                              Dettagli Legenda
                            </span>
                            {epssLegendOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-4 mt-3">
                          {/* Chart Elements Legend */}
                          <div className="flex flex-wrap items-center gap-6 p-3 bg-gray-50 rounded-lg border">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-1 bg-chart-3 rounded"></div>
                              <span className="text-sm">Trend EPSS mensile</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-0.5 border-t-2 border-dashed border-gray-400"></div>
                              <span className="text-sm">Soglie di rischio</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full border-2 border-background bg-chart-3"></div>
                              <span className="text-sm">Punti colorati per rischio</span>
                            </div>
                          </div>
                          
                          {/* EPSS Explanation */}
                          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-blue-800 mb-1">📈 Cos'è l'EPSS Score?</p>
                                <p className="text-xs text-blue-700">
                                  Punteggio da 0 a 10 che indica la probabilità percentuale di sfruttamento 
                                  di una vulnerabilità nei prossimi 30 giorni. Più basso è meglio.
                                </p>
                              </div>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>

                    {/* Current Status */}
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <Activity className="w-4 h-4 text-chart-3" />
                        <span className="font-medium">Trend Attuale:</span>
                        <span className="text-green-500">↓ Miglioramento (-1.6 vs Gen 2024)</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Exposed Services */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle>Servizi Maggiormente Esposti</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={exposedServicesData}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}%`}
                          >
                            {exposedServicesData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Risk Trend Analysis with Collapsible Legend */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle>Analisi Trend Rischio Settimanale</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={riskTrendData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="mese" className="text-muted-foreground" />
                        <YAxis className="text-muted-foreground" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="rischio_alto" stackId="stack" fill="hsl(var(--destructive))" />
                        <Bar dataKey="rischio_medio" stackId="stack" fill="hsl(var(--chart-2))" />
                        <Bar dataKey="rischio_basso" stackId="stack" fill="hsl(var(--primary))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>

                  {/* Collapsible Risk Trend Legend */}
                  <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border">
                    {/* Always visible color legend */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-3 bg-destructive rounded flex-shrink-0"></div>
                        <span className="text-sm font-medium text-red-800">Rischio Alto</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-3 bg-chart-2 rounded flex-shrink-0"></div>
                        <span className="text-sm font-medium text-orange-800">Rischio Medio</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-3 bg-primary rounded flex-shrink-0"></div>
                        <span className="text-sm font-medium text-blue-800">Rischio Basso</span>
                      </div>
                    </div>

                    {/* Collapsible detailed legend */}
                    <Collapsible open={riskTrendLegendOpen} onOpenChange={setRiskTrendLegendOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between text-sm p-2">
                          <span className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Dettagli Legenda
                          </span>
                          {riskTrendLegendOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 mt-3">
                        {/* Stacked Bar Explanation */}
                        <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                          <div className="flex items-start gap-2">
                            <BarChart3 className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-indigo-800 mb-1">📊 Grafico a Barre Impilate</p>
                              <p className="text-xs text-indigo-700">
                                Ogni barra rappresenta il 100% degli asset, suddivisi per livello di rischio. 
                                L'altezza delle sezioni mostra la distribuzione percentuale dei rischi.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Risk Level Definitions */}
                        <div className="grid grid-cols-1 gap-3">
                          <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
                            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                            <div>
                              <span className="text-sm font-medium text-red-800">Rischio Alto:</span>
                              <div className="text-xs text-red-600">CVE critiche, porte critiche esposte, configurazioni pericolose</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg border border-orange-200">
                            <Eye className="w-4 h-4 text-orange-600 flex-shrink-0" />
                            <div>
                              <span className="text-sm font-medium text-orange-800">Rischio Medio:</span>
                              <div className="text-xs text-orange-600">Vulnerabilità moderate, configurazioni sub-ottimali</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <div>
                              <span className="text-sm font-medium text-green-800">Rischio Basso:</span>
                              <div className="text-xs text-green-600">Asset sicuri, configurazioni corrette, vulnerabilità minori</div>
                            </div>
                          </div>
                        </div>

                        {/* Trend Interpretation */}
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-start gap-2">
                            <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-blue-800 mb-1">📈 Interpretazione del Trend</p>
                              <p className="text-xs text-blue-700">
                                Un trend positivo mostra il rischio alto in diminuzione e il rischio basso in aumento nel tempo. 
                                Questo indica miglioramenti nella postura di sicurezza complessiva.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Security Objectives */}
                        <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                          <div className="flex items-start gap-2">
                            <Shield className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-purple-800 mb-1">🎯 Obiettivi di Sicurezza</p>
                              <p className="text-xs text-purple-700">
                                Idealmente: Rischio Alto &lt; 10%, Rischio Medio &lt; 30%, Rischio Basso &gt; 60%. 
                                Il trend dovrebbe mostrare una riduzione costante dei rischi alti e medi.
                              </p>
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>

                  {/* Current Status */}
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span className="font-medium">Trend Positivo:</span>
                      <span className="text-green-500">Rischio basso al 69% (+12% vs Gen 2024)</span>
                      <span className="text-red-500">Rischio alto ridotto al 6% (-9% vs Gen 2024)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Search and Filter Bar */}
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Cerca per IP, hostname o servizio..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Stato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti gli stati</SelectItem>
                      <SelectItem value="Sicuro">Sicuro</SelectItem>
                      <SelectItem value="Attenzione">Attenzione</SelectItem>
                      <SelectItem value="Critico">Critico</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Rischio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti i rischi</SelectItem>
                      <SelectItem value="Basso">Basso</SelectItem>
                      <SelectItem value="Medio">Medio</SelectItem>
                      <SelectItem value="Alto">Alto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Public Assets Table */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Asset IP Pubblici Monitorati ({filteredAssets.length} trovati)</CardTitle>
              <p className="text-sm text-muted-foreground">
                {hasMonitoredRules
                  ? `Filtrati da ${monitoredIpRules.length} regole IP attive`
                  : 'Nessuna regola IP configurata: visualizzazione completa'}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {currentAssets.length === 0 && (
                  <div className="p-4 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                    Nessun asset corrisponde ai filtri correnti.
                  </div>
                )}
                {currentAssets.map((asset: any, index) => {
                  const hostNorm = String(asset.hostname || '').trim().toLowerCase().replace(/^www\./, '');
                  const discoveredRule = (monitoredIpRules as any[]).find(
                    (r) => r.discovered_via === 'subdomain_dump'
                      && hostNorm === String(r.input_value || '').trim().toLowerCase().replace(/^www\./, '')
                  );
                  const dumpedFrom = asset.__dumpedFrom || discoveredRule?.discovered_from;
                  const isDumped = Boolean(discoveredRule) || Boolean(asset.__dumpedFrom);
                  return (
                  <div key={index} className={`flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors ${isDumped ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center space-x-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Shield className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium flex items-center gap-2 flex-wrap">
                          {asset.ip}
                          {isDumped && (
                            <Badge variant="secondary" className="text-[10px] bg-primary/15 text-primary border-primary/30">
                              <Globe className="w-3 h-3 mr-1" />
                              Reverse Dump{dumpedFrom ? ` · ${dumpedFrom}` : ''}
                            </Badge>
                          )}
                        </h4>
                        <p className="text-sm text-muted-foreground">{asset.hostname}</p>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-xs text-muted-foreground">Porte:</span>
                          <div className="flex space-x-1">
                            {asset.ports.map((port, portIndex) => (
                              <Badge key={portIndex} variant="outline" className="text-xs">
                                {port}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-center">
                        <div className="text-sm text-muted-foreground">Servizi</div>
                        <div className="flex space-x-1 mt-1">
                          {asset.services.map((service, serviceIndex) => (
                            <Badge key={serviceIndex} variant="secondary" className="text-xs">
                              {service}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">Score: {asset.score}/100</div>
                        <div className={`text-xs font-medium ${getRiskColor(asset.risk)}`}>
                          Rischio: {asset.risk}
                        </div>
                        <Badge variant={getStatusBadge(asset.status) as any} className="mt-1">
                          {asset.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
              
              {totalPages > 1 && (
                <div className="mt-6 flex justify-center">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scan Results */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Risultati Scansione</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {scanResults.map((result, index) => (
                  <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Globe className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">{result.domain}</h4>
                        <p className="text-sm text-muted-foreground">
                          {result.issues} vulnerabilità rilevate
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">Punteggio: {result.score}/100</div>
                        <Badge variant={getStatusBadge(result.status) as any}>
                          {result.status}
                        </Badge>
                      </div>
                      <Tooltip open={openTooltip === index} onOpenChange={() => toggleTooltip(index)}>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => toggleTooltip(index)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Dettagli
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent 
                          side="left" 
                          className="w-80 p-4 bg-background border border-border shadow-lg z-50"
                          align="start"
                        >
                          <div className="space-y-3">
                            <h4 className="font-semibold text-foreground">CVE Rilevate per {result.domain}</h4>
                            {result.cves.length > 0 ? (
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {result.cves.map((cve, cveIndex) => (
                                  <div key={cveIndex} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                    <div 
                                      className={`w-3 h-3 rounded-full ${getSeverityColor(cve.severity)} mt-1 flex-shrink-0`}
                                    />
                                    <div className="flex-1">
                                      <div className="font-medium text-sm text-foreground">{cve.id}</div>
                                      <div className="text-xs text-muted-foreground capitalize">{cve.severity} severity</div>
                                      <div className="text-xs text-muted-foreground mt-1">{cve.description}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">Nessuna CVE rilevata</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Alert Configuration Dialog */}
        <SurfaceScanAlertConfigDialog
          open={alertDialogOpen}
          onOpenChange={setAlertDialogOpen}
          onSubmit={handleCreateAlert}
          mode="create"
        />
      </DashboardLayout>
    </TooltipProvider>
  );
};

export default SurfaceScan360;
