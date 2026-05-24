import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
} from 'lucide-react';
import { AlertBellButton } from '@/components/dark-risk/AlertBellButton';
import { AlertConfigDialog } from '@/components/dark-risk/AlertConfigDialog';
import { useDarkRiskAlerts } from '@/hooks/useDarkRiskAlerts';
import { useDarkRiskOverview } from '@/hooks/useDarkRiskOverview';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const severityClasses: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  info: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

const coverageClasses: Record<string, string> = {
  completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  partial: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  error: 'bg-red-500/20 text-red-300 border-red-500/40',
  not_run: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  planned: 'bg-primary/20 text-primary border-primary/40',
};

const categoryIcon = (category: string) => {
  const text = category.toLowerCase();
  if (text.includes('credenzial')) return UserX;
  if (text.includes('email')) return Mail;
  if (text.includes('servizi')) return Server;
  if (text.includes('dns') || text.includes('tls')) return Globe;
  if (text.includes('reputation')) return Eye;
  return Shield;
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

const DarkRisk360: React.FC = () => {
  const queryClient = useQueryClient();
  const { alerts, createAlert, loading: alertsLoading } = useDarkRiskAlerts();
  const { data: overview, isLoading, isError, error, refetch, isFetching } = useDarkRiskOverview();
  const { organizationId } = useClientOrganization();
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [syncingScan, setSyncingScan] = useState(false);

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
        .select('id, title, tier, classification, status, generated_at, scan_run_id, html_storage_path, pdf_storage_path, report_json')
        .eq('organization_id', organizationId)
        .order('generated_at', { ascending: false })
        .limit(12);
      if (queryError) throw queryError;
      return (data || []) as Array<Record<string, any>>;
    },
    staleTime: 60_000,
  });

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
      },
      {
        key: 'credential_leaks',
        title: 'Credenziali Leak',
        value: overview.kpis.credential_leaks.value,
        delta: overview.kpis.credential_leaks.delta,
        tone: 'text-orange-500',
        icon: UserX,
      },
      {
        key: 'monitored_domains',
        title: 'Domini Monitorati',
        value: overview.kpis.monitored_domains.value,
        delta: overview.kpis.monitored_domains.delta,
        tone: 'text-primary',
        icon: Shield,
      },
      {
        key: 'risk_score',
        title: 'Punteggio Rischio',
        value: `${overview.kpis.risk_score.value}`,
        delta: overview.kpis.risk_score.delta,
        tone: 'text-red-500',
        icon: TrendingDown,
        extra: overview.kpis.risk_score.level,
      },
      {
        key: 'last_scan',
        title: 'Ultima Scansione',
        value: overview.kpis.last_scan.value ? formatDateTime(overview.kpis.last_scan.value) : 'Nessuna scansione',
        delta: overview.kpis.last_scan.delta,
        tone: 'text-foreground',
        icon: Clock3,
      },
      {
        key: 'coverage',
        title: 'Copertura Controlli',
        value: `${overview.kpis.controls_coverage.value}%`,
        delta: null,
        tone: 'text-primary',
        icon: Radar,
        extra: `${overview.kpis.controls_coverage.completed}/${overview.kpis.controls_coverage.total} completati`,
      },
      {
        key: 'critical_findings',
        title: 'Finding Critici',
        value: overview.kpis.critical_findings.value,
        delta: overview.kpis.critical_findings.delta,
        tone: 'text-red-500',
        icon: Activity,
      },
      {
        key: 'new_alerts',
        title: 'Nuovi Alert',
        value: overview.kpis.new_alerts.value,
        delta: overview.kpis.new_alerts.delta,
        tone: 'text-yellow-500',
        icon: Eye,
      },
    ],
    [overview],
  );

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
      void refetch();
    } catch (invokeError: any) {
      toast.error(`Errore sync DarkRisk360: ${String(invokeError?.message || 'errore sconosciuto')}`);
    } finally {
      setSyncingScan(false);
    }
  };

  const downloadReportJson = (report: Record<string, any>) => {
    const payload = report?.report_json;
    if (!payload) {
      toast.error('Report JSON non disponibile');
      return;
    }
    const fileName = `darkrisk360-report-${String(report?.generated_at || '').slice(0, 10) || 'snapshot'}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openReportHtml = async (report: Record<string, any>) => {
    const path = String(report?.html_storage_path || '').trim();
    if (!path) {
      toast.error('HTML report non disponibile per questo snapshot');
      return;
    }

    const { data, error: signError } = await supabase.storage.from('darkrisk-reports').createSignedUrl(path, 3600);
    if (signError || !data?.signedUrl) {
      toast.error(`Impossibile aprire report HTML: ${String(signError?.message || 'firma non disponibile')}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
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
          <div className="flex items-center gap-2">
            <AlertBellButton
              alertCount={activeAlertsCount}
              onClick={() => setAlertDialogOpen(true)}
            />
            <Button
              variant="outline"
              onClick={() => void refetch()}
              disabled={isLoading || isFetching}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Aggiorna
            </Button>
            <Button
              className="bg-primary text-primary-foreground"
              disabled={syncingScan || isFetching}
              onClick={() => void handleSyncSurfaceScan()}
            >
              <Eye className="w-4 h-4 mr-2" />
              {syncingScan ? 'Sincronizzazione...' : 'Scansione Deep Web'}
            </Button>
          </div>
        </div>

        {(isLoading || alertsLoading) && (
          <Card className="border-border">
            <CardContent className="py-8 text-sm text-muted-foreground">
              Caricamento dati DarkRisk360 in corso...
            </CardContent>
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
              {kpiCards.map((card) => {
                const Icon = card.icon;
                const delta = formatDelta(card.delta);
                return (
                  <Card key={card.key} className="border-border">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-muted-foreground">{card.title}</p>
                          <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
                          {card.extra ? (
                            <p className="text-xs text-muted-foreground mt-1">{card.extra}</p>
                          ) : null}
                        </div>
                        <Icon className={`w-6 h-6 ${card.tone}`} />
                      </div>
                      {delta ? <p className="text-xs text-muted-foreground">{delta}</p> : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle>Copertura Controlli</CardTitle>
              </CardHeader>
              <CardContent>
                {overview.coverage_controls.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun controllo disponibile per l’asset selezionato.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-2 pr-4">Controllo</th>
                          <th className="py-2 pr-4">Stato</th>
                          <th className="py-2 pr-4">Ultima esecuzione</th>
                          <th className="py-2">Sorgente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.coverage_controls.map((control) => (
                          <tr key={control.key} className="border-b border-border/60">
                            <td className="py-2 pr-4 font-medium">{control.control}</td>
                            <td className="py-2 pr-4">
                              <Badge className={coverageClasses[control.status] || coverageClasses.not_run}>
                                {control.status}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">{formatDateTime(control.last_execution)}</td>
                            <td className="py-2">{control.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle>Minacce Rilevate</CardTitle>
              </CardHeader>
              <CardContent>
                {overview.threat_groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessuna minaccia attiva rilevata nell’ultima scansione.</p>
                ) : (
                  <div className="space-y-3">
                    {overview.threat_groups.map((group) => {
                      const Icon = categoryIcon(group.category);
                      return (
                        <div
                          key={group.category}
                          className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border bg-card"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Icon className="w-4 h-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{group.category}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2">{group.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-xl font-bold text-foreground">{group.count}</div>
                            <Badge className={severityClasses[group.severity_max] || severityClasses.info}>
                              {group.severity_max}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle>Alert Recenti</CardTitle>
              </CardHeader>
              <CardContent>
                {overview.recent_alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun alert recente disponibile.</p>
                ) : (
                  <div className="space-y-2">
                    {overview.recent_alerts.map((alert) => (
                      <div key={alert.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/70">
                        <Badge className={severityClasses[alert.severity] || severityClasses.info}>{alert.severity}</Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{alert.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {alert.type}
                            {alert.asset ? ` • ${alert.asset}` : ''}
                            {alert.source ? ` • ${alert.source}` : ''}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(alert.time)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

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
                        <Button variant="outline" size="sm" onClick={() => downloadReportJson(report)}>
                          <Download className="w-4 h-4 mr-2" />
                          JSON
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void openReportHtml(report)}>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          HTML
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
