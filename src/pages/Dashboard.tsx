import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { useClientContext } from '@/contexts/ClientContext';
import { supabase } from '@/integrations/supabase/client';
import { SecurityFeedsSection } from '@/components/dashboard/SecurityFeedsSection';
import { EPSSWidget } from '@/components/dashboard/EPSSWidget';
import { ServiceQuickConnect } from '@/components/dashboard/ServiceQuickConnect';
import { ComplianceMetricCard } from '@/components/dashboard/ComplianceMetricCard';
import { RiskScoreMetricCard } from '@/components/dashboard/RiskScoreMetricCard';
import { useServiceIntegrations } from '@/hooks/useServiceIntegrations';
import { useUserRoles } from '@/hooks/useUserRoles';
import { 
  Shield, Monitor, Mail, FileText, Download, 
  BarChart3, Laptop, Link2, Unlink, Smartphone, Settings
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
  const { userProfile } = useAuth();
  const { selectedOrganization } = useClientContext();
  const activeOrgId = selectedOrganization?.id || userProfile?.organization_id;
  const activeOrgName = selectedOrganization?.name || userProfile?.organizations?.name || 'Organizzazione';
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { isServiceConnected, getIntegrationByCode, connectService, disconnectService, isConnecting, isDisconnecting } = useServiceIntegrations();
  const { isSuperAdmin, isSales } = useUserRoles();
  const canManage = isSuperAdmin || isSales;

  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<{ name: string; code: string; id: string } | null>(null);

  useEffect(() => {
    setServices([
      { id: '1', status: 'alert', health_score: 15, services: { name: 'HiFirewall', code: 'hi_firewall', id: 's1' } },
      { id: '2', status: 'alert', health_score: 70, services: { name: 'HiEndpoint', code: 'hi_endpoint', id: 's2' } },
      { id: '3', status: 'maintenance', health_score: 75, services: { name: 'HiMail', code: 'hi_mail', id: 's3' } },
      { id: '4', status: 'alert', health_score: 10, services: { name: 'HiLog', code: 'hi_log', id: 's4' } },
      { id: '5', status: 'maintenance', health_score: 65, services: { name: 'HiPatch', code: 'hi_patch', id: 's5' } },
      { id: '6', status: 'active', health_score: 90, services: { name: 'HiTrack', code: 'hi_track', id: 's6' } },
      { id: '7', status: 'active', health_score: 92, services: { name: 'HiDetect', code: 'hi_detect', id: 's7' } },
      { id: '8', status: 'alert', health_score: 24, services: { name: 'HiMobile', code: 'hi_mobile', id: 's8' } },
    ]);
    setLoading(false);
  }, []);

  const excludedServices = ['hi_mfa', 'hi_cloud_optix', 'hi_phish_threat', 'hi_ztna'];
  const hiSolutionServices = services.filter(s => 
    s.services?.code?.startsWith('hi_') && !excludedServices.includes(s.services?.code)
  );

  const servicesWithCriticalHealth = hiSolutionServices.filter(s => (s.health_score || 0) < 50);
  const servicesWithWarningHealth = hiSolutionServices.filter(s => (s.health_score || 0) >= 50 && (s.health_score || 0) < 80);
  const servicesWithGoodHealth = hiSolutionServices.filter(s => (s.health_score || 0) >= 80);

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
    { name: 'HiFirewall', code: 'hi_firewall', id: '', healthScore: 56, resolved: 124 },
    { name: 'HiEndpoint', code: 'hi_endpoint', id: '', healthScore: 26, resolved: 54 },
    { name: 'HiMail', code: 'hi_mail', id: '', healthScore: 13, resolved: 98 },
    { name: 'HiLog', code: 'hi_log', id: '', healthScore: 55, resolved: 54 },
    { name: 'HiPatch', code: 'hi_patch', id: '', healthScore: 23, resolved: 78 },
    { name: 'HiTrack', code: 'hi_track', id: '', healthScore: 88, resolved: 89 },
    { name: 'HiDetect', code: 'hi_detect', id: '', healthScore: 89, resolved: 127 },
    { name: 'HiMobile', code: 'hi_mobile', id: '', healthScore: 24, resolved: 89 },
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
          <ComplianceMetricCard />
          <RiskScoreMetricCard />
          {/* Merged card: Servizi Monitorati + Issues Totali */}
          <Card className="relative overflow-hidden border-border shadow-cyber hover:shadow-glow transition-cyber animate-fade-in">
            <CardContent className="p-0 h-full">
              <div className="grid grid-cols-2 divide-x divide-border h-full">
                {/* Servizi Monitorati */}
                <div className="flex flex-col items-center justify-center p-5 text-center space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Servizi Monitorati</p>
                  <Badge variant="secondary" className="bg-cyber-green/20 text-cyber-green w-full justify-center">Buono</Badge>
                  <div className="text-4xl font-bold text-foreground">{hiSolutionServices.length}</div>
                  <p className="text-sm text-muted-foreground">Servizi attivi</p>
                </div>
                {/* Issues Totali */}
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
                <CardTitle className="text-xl mb-2">Servizi HiSolution</CardTitle>
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-primary mb-1">8</div>
                  <div className="text-sm text-muted-foreground">Servizi Connessi</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-red-500 mb-1">6</div>
                  <div className="text-sm text-muted-foreground">Servizi in Allerta</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-green-500 mb-1">8</div>
                  <div className="text-sm text-muted-foreground">Servizi Operativi</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-blue-500 mb-1">
                    {hiSolutionServices.length > 0 ? hiSolutionServices.reduce((acc) => acc + Math.floor(50 + Math.random() * 100), 0) : 642}
                  </div>
                  <div className="text-sm text-muted-foreground">Totale Risolte</div>
                </div>
              </div>
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
