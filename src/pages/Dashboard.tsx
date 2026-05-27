import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { useClientContext } from '@/contexts/ClientContext';
import { SecurityFeedsSection } from '@/components/dashboard/SecurityFeedsSection';
import { EPSSWidget } from '@/components/dashboard/EPSSWidget';
import { ComplianceMetricCard } from '@/components/dashboard/ComplianceMetricCard';
import { RiskScoreMetricCard } from '@/components/dashboard/RiskScoreMetricCard';
import { useServiceIntegrations } from '@/hooks/useServiceIntegrations';
import { useUserRoles } from '@/hooks/useUserRoles';
import { configApi } from '@/lib/api/config';
import { tenantServicesApi } from '@/lib/api/tenant-services';
import type { ServiceCatalogItem, TenantServiceResource } from '@/types/api';
import ClientServicesDialog from '@/components/clients/ClientServicesDialog';
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
  const activeOrgId = selectedOrganization?.id || user?.tenant_id;
  const activeOrgName = selectedOrganization?.name || user?.name || 'Organizzazione';
  const { isServiceConnected, hasAnyIntegrationsConfigured } = useServiceIntegrations();
  const { isSuperAdmin, isSales } = useUserRoles();
  const canManageIntegrationSettings = isSuperAdmin || isSales;
  const [modulesDialogOpen, setModulesDialogOpen] = useState(false);

  // Real API data: service catalog and tenant services
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogItem[]>([]);
  const [tenantServices, setTenantServices] = useState<TenantServiceResource[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    configApi.tenantServices().then(catalog => {
      if (!cancelled) {
        // Convert catalog object to ServiceCatalogItem[]
        const items: ServiceCatalogItem[] = Object.entries(catalog).map(([key, value]) => {
          const svc = value as any;
          return { id: key, code: key, name: svc.label || key, description: svc.description || '', icon: svc.icon || '', is_active: true };
        });
        setServiceCatalog(items);
      }
    }).catch(() => {
      if (!cancelled) setServiceCatalog([]);
    }).finally(() => {
      if (!cancelled) setCatalogLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    setServicesLoading(true);
    tenantServicesApi.listByOrganization(activeOrgId).then(services => {
      if (!cancelled) setTenantServices(services);
    }).catch(() => {
      if (!cancelled) setTenantServices([]);
    }).finally(() => {
      if (!cancelled) setServicesLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeOrgId]);

  // Derive service status from real API data
  // Since backend service dashboard endpoints don't exist yet (404),
  // we build service cards from the catalog + tenant services status
  const hiSolutionServices = useMemo(() => {
    return serviceCatalog.map(cat => {
      const tenantSvc = tenantServices.find(ts => ts.service_type === cat.code || ts.service_type === cat.id);
      const status = tenantSvc?.status || 'inactive';
      // Health score: active=100, maintenance=70, alert=30, inactive=0
      const health_score = status === 'active' ? 100 : status === 'maintenance' ? 70 : status === 'alert' ? 30 : 0;
      return {
        id: cat.id,
        status,
        health_score,
        services: {
          name: cat.name,
          code: cat.code,
          id: cat.id,
          description: cat.description || '',
          icon: cat.icon || '',
        },
      };
    });
  }, [serviceCatalog, tenantServices]);

  // Use tenant extra fields for dashboard metrics if available
  const tenantExtra = selectedOrganization?.extra || null;
  const tenantCounts = {
    firewalls: selectedOrganization?.firewalls_count || 0,
    endpoints: selectedOrganization?.endpoints_count || 0,
    servers: selectedOrganization?.servers_count || 0,
    vms: selectedOrganization?.vms_count || 0,
    totalDevices: (tenantExtra?.dispositivi_rete_totali || 0) + (tenantExtra?.server || 0) + (tenantExtra?.endpoint || 0),
    totalIPs: tenantExtra?.ip_totali || 0,
    users: tenantExtra?.utenti || 0,
  };

  const totalAssets = tenantCounts.totalDevices || hiSolutionServices.length || 8;
  const connectedServicesCount = hiSolutionServices.filter(s => s.status === 'active').length;
  const alertServicesCount = hiSolutionServices.filter(s => s.status === 'alert').length;
  const operativeServicesCount = hiSolutionServices.filter(s => s.status === 'active' || s.status === 'maintenance').length;
  const totalResolvedCount = hiSolutionServices.reduce((acc, s) => acc + s.health_score, 0);

  const isModuleEnabledForDashboard = (serviceCode: string) => {
    if (!hasAnyIntegrationsConfigured) return true;
    return isServiceConnected(serviceCode);
  };

  const handleServiceClick = (service: { code: string }) => {
    navigate(`/dashboard/service/${service.code}`);
  };

  const renderServiceCard = (service: { name: string; code: string; id?: string }, healthScore: number, status: string, resolved: number, index: number) => {
    const moduleEnabled = isModuleEnabledForDashboard(service.code);
    const isGood = healthScore >= 80;
    const issues = isGood ? 0 : Math.ceil((100 - healthScore) / 20);
    const criticalityScore = status === 'alert' 
      ? Math.min(100, 100 - healthScore + issues * 5)
      : status === 'maintenance' ? Math.min(80, 100 - healthScore) : Math.max(10, 100 - healthScore);

    return (
      <div
        key={index}
        className={`flex flex-col p-4 rounded-xl border border-border bg-card transition-all duration-200 ${
          moduleEnabled
            ? 'hover:bg-muted/30 hover:shadow-lg cursor-pointer'
            : 'opacity-70 cursor-not-allowed'
        }`}
        onClick={() => moduleEnabled && handleServiceClick(service)}
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
            {moduleEnabled ? (
              <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-[10px] px-1.5 py-0">
                <Link2 className="w-3 h-3 mr-1" />API
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">
                <Unlink className="w-3 h-3 mr-1" />Spento
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

          {!moduleEnabled && (
            <p className="text-xs text-muted-foreground mt-3">
              Modulo non abilitato per questo cliente.
            </p>
          )}

          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setModulesDialogOpen(true);
              }}
            >
              Gestisci modulo
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">{activeOrgName}</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-red-500 mb-1">{alertServicesCount}</div>
            <p className="text-sm text-muted-foreground">Issues Attive</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            I moduli <span className="font-medium text-foreground">Conformità &amp; Rischio Assessment</span> e{" "}
            <span className="font-medium text-foreground">True Risk Score</span> sono disponibili perché questo ambiente demo include{" "}
            <span className="font-medium text-primary">HiCompliance</span>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ComplianceMetricCard />
          <RiskScoreMetricCard />
          {/* Merged card: Servizi Monitorati + Issues Totali */}
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
                  <div className="text-4xl font-bold text-foreground">{alertServicesCount}</div>
                  <p className="text-sm text-muted-foreground">Da risolvere</p>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
        </div>

        <Card className="border-border">
          <CardHeader className="pb-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl mb-2">Servizi HiConsole</CardTitle>
                <p className="text-sm text-muted-foreground">Stato dei servizi in tempo reale</p>
              </div>
              <div className="flex items-center gap-4">
                {isSuperAdmin && activeOrgId && (
                  <Button variant="outline" size="sm" onClick={() => setModulesDialogOpen(true)}>
                    <Settings className="w-4 h-4 mr-1" />
                    Gestione Moduli Cliente
                  </Button>
                )}
                {canManageIntegrationSettings && (
                    <Button variant="outline" size="sm" onClick={() => navigate('/settings/integrations')}>
                      <Settings className="w-4 h-4 mr-1" />
                      Impostazioni
                    </Button>
                )}
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary mb-1">{alertServicesCount}</div>
                  <p className="text-xs text-muted-foreground">Issues Attive</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {catalogLoading || servicesLoading
                ? <p className="col-span-full text-center text-muted-foreground py-8">Caricamento servizi...</p>
                : hiSolutionServices.map((orgService, index) => {
                    const service = orgService.services;
                    return renderServiceCard(
                      service, orgService.health_score || 0, orgService.status,
                      orgService.health_score || 0, index
                    );
                  })
              }
            </div>

            <div className="border-t border-border pt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-primary mb-1">{connectedServicesCount}</div>
                  <div className="text-sm text-muted-foreground">Servizi Connessi</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-red-500 mb-1">{alertServicesCount}</div>
                  <div className="text-sm text-muted-foreground">Servizi in Allerta</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-green-500 mb-1">{operativeServicesCount}</div>
                  <div className="text-sm text-muted-foreground">Servizi Operativi</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-blue-500 mb-1">
                    {totalResolvedCount}
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

      {isSuperAdmin && activeOrgId && (
        <ClientServicesDialog
          open={modulesDialogOpen}
          onOpenChange={setModulesDialogOpen}
          organizationId={activeOrgId}
          organizationName={activeOrgName}
        />
      )}
    </DashboardLayout>
  );
};

export default Dashboard;
