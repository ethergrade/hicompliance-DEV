import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { useClientContext } from '@/contexts/ClientContext';
import { SecurityFeedsSection } from '@/components/dashboard/SecurityFeedsSection';
import { EPSSWidget } from '@/components/dashboard/EPSSWidget';
import { ServiceQuickConnect } from '@/components/dashboard/ServiceQuickConnect';
import { ComplianceMetricCard } from '@/components/dashboard/ComplianceMetricCard';
import { RiskScoreMetricCard } from '@/components/dashboard/RiskScoreMetricCard';
import { useServiceIntegrations } from '@/hooks/useServiceIntegrations';
import { useUserRoles } from '@/hooks/useUserRoles';
import { moduleVisibility } from '@/config/moduleVisibility';
import { tenantsApi } from '@/lib/api/tenants';
import { assessmentApi } from '@/lib/api/assessment';
import type { TenantDashboardExtra, AssessmentSummary } from '@/types/api';
import { 
  Shield, Monitor, Mail, FileText, Download, 
  BarChart3, Laptop, Link2, Unlink, Smartphone, Settings,
  Server, Users, Globe, Router, HardDrive
} from 'lucide-react';

const getServiceIcon = (code: string) => {
  switch (code) {
    case 'hi_firewall': return <Shield className="w-4 h-4" />;
    case 'hi_endpoint': return <Laptop className="w-4 h-4" />;
    case 'hi_mail': return <Mail className="w-4 h-4" />;
    case 'hi_log': return <FileText className="w-4 h-4" />;
    case 'hi_patch': return <Download className="w-4 h-4" />;
    case 'hi_track': return <BarChart3 className="w-4 h-4" />;
    case 'hi_detect': return <Monitor className="w-4 h-4" />;
    case 'hi_mobile': return <Smartphone className="w-4 h-4" />;
    default: return <Shield className="w-4 h-4" />;
  }
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrganization } = useClientContext();
  const activeOrgName = selectedOrganization?.name || 'Organizzazione';
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { isServiceConnected, getIntegrationByCode, connectService, disconnectService, isConnecting, isDisconnecting } = useServiceIntegrations();
  const { isAdmin, isSales } = useUserRoles();
  const canManage = (isAdmin || isSales) && moduleVisibility.integrations;

  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<{ name: string; code: string; id: string } | null>(null);
  const [dashboardExtra, setDashboardExtra] = useState<TenantDashboardExtra | null>(null);
  const [extraLoading, setExtraLoading] = useState(true);
  const [assessmentSummary, setAssessmentSummary] = useState<AssessmentSummary | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  // Fetch tenant dashboard data from API
  useEffect(() => {
    let cancelled = false;
    async function fetchDashboardData() {
      try {
        setExtraLoading(true);
        const tenant = await tenantsApi.getOwn();
        if (!cancelled && tenant?.extra) {
          setDashboardExtra(tenant.extra);
        }
      } catch (err) {
        console.warn('Failed to fetch tenant dashboard data:', err);
      } finally {
        if (!cancelled) setExtraLoading(false);
      }
    }
    fetchDashboardData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchAssessmentReport() {
      try {
        setReportLoading(true);
        const assessments = await assessmentApi.list();
        if (cancelled || !assessments.length) return;
        const report = await assessmentApi.report(assessments[0].id);
        if (!cancelled && report?.summary) {
          setAssessmentSummary(report.summary);
        }
      } catch (err) {
        console.warn('Failed to fetch assessment report:', err);
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    }
    fetchAssessmentReport();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setServices([
      { id: '5', status: 'maintenance', health_score: 65, services: { name: 'HiPatch', code: 'hi_patch', id: 's5' } },
    ]);
    setLoading(false);
  }, []);

  const hiSolutionServices = services.filter(s => 
    s.services?.code === 'hi_patch'
  );

  const servicesWithCriticalHealth = hiSolutionServices.filter(s => (s.health_score || 0) < 50);

  const totalIssues = hiSolutionServices.reduce((acc, service) => {
    const healthScore = service.health_score || 0;
    if (healthScore < 80) return acc + Math.ceil((100 - healthScore) / 20);
    return acc;
  }, 0);

  const fallbackData = { alertCount: 4, activeCount: 2, warningCount: 2, avgScore: 47, totalIssues: 22 };

  const mockData = {
    nis2Compliance: servicesWithCriticalHealth.length > 3 ? 35 : 65,
    riskIndicator: 51,
    totalAssets: services.length || 8,
    activeThreats: totalIssues || fallbackData.totalIssues
  };

  // Derived infrastructure metrics from tenant extra data
  const infraTotalAssets = dashboardExtra
    ? (dashboardExtra.server || 0) + (dashboardExtra.endpoint || 0) + (dashboardExtra.firewall || 0)
      + (dashboardExtra.switch_core || 0) + (dashboardExtra.switch_access || 0)
      + (dashboardExtra.access_point || 0) + (dashboardExtra.virtual_machine || 0)
      + (dashboardExtra.hypervisor || 0) + (dashboardExtra.dispositivi_rete_totali || 0)
    : null;
  const infraTotalIPs = dashboardExtra
    ? (dashboardExtra.ip_totali || 0) + (dashboardExtra.ip_puntuali || 0)
    : null;

  const handleServiceClick = (service: any, _connected: boolean) => {
    navigate(`/dashboard/service/${service.code}`);
  };

  const handleManageClick = (e: React.MouseEvent, service: any) => {
    e.stopPropagation();
    if (!canManage) return;
    setSelectedService({ name: service.name, code: service.code, id: service.id });
    setQuickConnectOpen(true);
  };

  const selectedConnected = selectedService ? isServiceConnected(selectedService.code) : false;
  const selectedIntegration = selectedService ? getIntegrationByCode(selectedService.code) : undefined;

  const renderServiceCard = (service: { name: string; code: string; id?: string }, healthScore: number, status: string, resolved: number, index: number) => {
    const connected = isServiceConnected(service.code);
    const isGood = healthScore >= 80;
    const issues = isGood ? 0 : Math.ceil((100 - healthScore) / 20);
    const criticalityScore = status === 'alert' 
      ? Math.min(100, 100 - healthScore + issues * 5)
      : status === 'maintenance' ? Math.min(80, 100 - healthScore) : Math.max(10, 100 - healthScore);

    return (
      <div
        key={index}
        className="flex flex-col p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-all duration-200 hover:shadow-lg cursor-pointer"
        onClick={() => handleServiceClick(service, connected)}
      >
        <div className="flex items-center justify-between mb-3">
          <div className={`p-2 rounded-lg flex items-center justify-center ${
            healthScore < 50 ? 'bg-red-500/10' : healthScore < 80 ? 'bg-yellow-500/10' : 'bg-green-500/10'
          }`}>
            <div className={`w-3 h-3 rounded-full ${
              healthScore < 50 ? 'bg-red-500' : healthScore < 80 ? 'bg-yellow-500' : 'bg-green-500'
            }`} />
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-[10px] px-1.5 py-0">
                <Link2 className="w-3 h-3 mr-1" />API
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">
                <Unlink className="w-3 h-3 mr-1" />N/C
              </Badge>
            )}
            {!isGood && (
              <div className={`text-xl font-bold ${healthScore < 50 ? 'text-red-500' : 'text-yellow-500'}`}>
                {issues}
              </div>
            )}
            {isGood && <div className="text-sm text-green-500 font-semibold">OK</div>}
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-primary">{getServiceIcon(service.code)}</div>
            <h4 className="font-semibold text-base">{service.name}</h4>
          </div>

          <div className="space-y-2 mb-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Health Score:</span>
              <span className={`text-sm font-semibold ${healthScore >= 80 ? 'text-green-500' : healthScore >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                {healthScore}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Criticità:</span>
              <span className={`text-sm font-semibold ${criticalityScore >= 70 ? 'text-red-500' : criticalityScore >= 40 ? 'text-yellow-500' : 'text-green-500'}`}>
                {criticalityScore}/100
              </span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{resolved} risolte negli ultimi 90 giorni</p>

          {canManage && (
            <button
              className="mt-3 w-full text-xs py-1.5 rounded-md border border-border hover:bg-muted/50 transition-colors text-muted-foreground"
              onClick={(e) => handleManageClick(e, service)}
            >
              {connected ? 'Gestisci connessione' : 'Collega API'}
            </button>
          )}
        </div>
      </div>
    );
  };

  const fallbackServices = [
    { name: 'HiPatch', code: 'hi_patch', id: '', healthScore: 23, resolved: 78 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">{activeOrgName}</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-red-500 mb-1">{totalIssues || fallbackData.totalIssues}</div>
            <p className="text-sm text-muted-foreground">Issues Attive</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ComplianceMetricCard
            completionScore={assessmentSummary?.completion_score}
            riskScore={assessmentSummary?.risk_score}
          />
          <RiskScoreMetricCard
            score={assessmentSummary?.risk_score}
          />
          <Card className="relative overflow-hidden border-border shadow-cyber hover:shadow-glow transition-cyber animate-fade-in">
            <CardContent className="p-0 h-full">
              <div className="grid grid-cols-2 divide-x divide-border h-full">
                <div className="flex flex-col items-center justify-center p-5 text-center space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Servizi Monitorati</p>
                  <Badge variant="secondary" className="bg-cyber-green/20 text-cyber-green w-full justify-center">Buono</Badge>
                  <div className="text-4xl font-bold text-foreground">{hiSolutionServices.length}</div>
                  <p className="text-sm text-muted-foreground">Servizi attivi</p>
                </div>
                <div className="flex flex-col items-center justify-center p-5 text-center space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Issues Totali</p>
                  <Badge variant="secondary" className="bg-cyber-red/20 text-cyber-red w-full justify-center">Critico</Badge>
                  <div className="text-4xl font-bold text-foreground">{mockData.activeThreats}</div>
                  <p className="text-sm text-muted-foreground">Da risolvere</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border">
          <CardHeader className="pb-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl mb-2">Servizi HiConsole</CardTitle>
                <p className="text-sm text-muted-foreground">Stato dei servizi in tempo reale</p>
              </div>
              <div className="flex items-center gap-4">
                {canManage && (
                    <Button variant="outline" size="sm" onClick={() => navigate('/settings/integrations')}>
                      <Settings className="w-4 h-4 mr-1" />
                      Impostazioni
                    </Button>
                )}
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary mb-1">{totalIssues || 23}</div>
                  <p className="text-xs text-muted-foreground">Issues Attive</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {hiSolutionServices.length > 0
                ? hiSolutionServices.map((orgService, index) => {
                    const service = orgService.services;
                    return renderServiceCard(
                      service, orgService.health_score || 0, orgService.status,
                      Math.floor(50 + Math.random() * 100), index
                    );
                  })
                : fallbackServices.map((s, i) =>
                    renderServiceCard({ name: s.name, code: s.code, id: s.id }, s.healthScore, 'alert', s.resolved, i)
                  )
              }
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4">Infrastruttura</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="text-center p-3 rounded-lg bg-muted/30">
                  <Server className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <div className="text-xl font-bold text-foreground">{dashboardExtra?.server ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">Server</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/30">
                  <Laptop className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                  <div className="text-xl font-bold text-foreground">{dashboardExtra?.endpoint ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">Endpoint</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/30">
                  <Shield className="w-5 h-5 mx-auto mb-1 text-red-500" />
                  <div className="text-xl font-bold text-foreground">{dashboardExtra?.firewall ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">Firewall</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/30">
                  <Users className="w-5 h-5 mx-auto mb-1 text-green-500" />
                  <div className="text-xl font-bold text-foreground">{dashboardExtra?.utenti ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">Utenti</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/30">
                  <HardDrive className="w-5 h-5 mx-auto mb-1 text-purple-500" />
                  <div className="text-xl font-bold text-foreground">{dashboardExtra?.virtual_machine ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">VM</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/30">
                  <Globe className="w-5 h-5 mx-auto mb-1 text-amber-500" />
                  <div className="text-xl font-bold text-foreground">{dashboardExtra?.sedi_cliente ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">Sedi</div>
                </div>
              </div>
              {dashboardExtra && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <Router className="w-5 h-5 mx-auto mb-1 text-cyan-500" />
                    <div className="text-xl font-bold text-foreground">
                      {(dashboardExtra.switch_core || 0) + (dashboardExtra.switch_access || 0)}
                    </div>
                    <div className="text-xs text-muted-foreground">Switch</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <div className="text-xl font-bold text-foreground">{dashboardExtra.access_point ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">Access Point</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <div className="text-xl font-bold text-foreground">{infraTotalIPs}</div>
                    <div className="text-xs text-muted-foreground">IP Totali</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <div className="text-xl font-bold text-foreground">{infraTotalAssets}</div>
                    <div className="text-xs text-muted-foreground">Dispositivi Totali</div>
                  </div>
                </div>
              )}
              {!dashboardExtra && !extraLoading && (
                <p className="text-center text-xs text-muted-foreground mt-4">
                  Dati infrastruttura non disponibili
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1"><EPSSWidget /></div>
          <div className="lg:col-span-2"><SecurityFeedsSection compact /></div>
        </div>
      </div>

      {selectedService && (
        <ServiceQuickConnect
          open={quickConnectOpen}
          onOpenChange={setQuickConnectOpen}
          serviceName={selectedService.name}
          serviceId={selectedService.id}
          isConnected={selectedConnected}
          integrationId={selectedIntegration?.id}
          onConnect={connectService}
          onDisconnect={disconnectService}
          isConnecting={isConnecting}
          isDisconnecting={isDisconnecting}
        />
      )}
    </DashboardLayout>
  );
};

export default Dashboard;
