import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { useClientContext } from "@/contexts/ClientContext";
import { ComplianceMetricCard } from "@/components/dashboard/ComplianceMetricCard";
import { RiskScoreMetricCard } from "@/components/dashboard/RiskScoreMetricCard";
import { useServiceIntegrations } from "@/hooks/useServiceIntegrations";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useAssessmentTrends } from "@/hooks/useAssessmentTrends";
import { AssessmentRadarChart } from "@/components/assessment/AssessmentRadarChart";
import ClientServicesDialog from "@/components/clients/ClientServicesDialog";
import { Shield, BarChart3, Unlink, Settings } from "lucide-react";

const getServiceIcon = (code: string) => {
  const key = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  switch (key) {
    case "surfacescan":
      return <BarChart3 className="w-4 h-4" />;
    case "hipatch":
      return <Shield className="w-4 h-4" />;
    case "darkrisk":
      return <Shield className="w-4 h-4" />;
    default:
      return <Shield className="w-4 h-4" />;
  }
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { selectedOrganization } = useClientContext();
  const activeOrgId = selectedOrganization?.id || userProfile?.organization_id;
  const activeOrgName =
    selectedOrganization?.name ||
    userProfile?.organizations?.name ||
    "Organizzazione";
  const activeGroupId = selectedOrganization?.group_id ?? null;
  const { integrations, isServiceConnected, hasAnyIntegrationsConfigured } =
    useServiceIntegrations();
  const { isSuperAdmin, isSales } = useUserRoles();
  const canManageIntegrationSettings = isSuperAdmin || isSales;
  const [modulesDialogOpen, setModulesDialogOpen] = useState(false);

  // Per-tenant assessment metrics + trends for dashboard widgets
  const { completionScore, riskScore, assessmentId } = useDashboardMetrics(
    activeOrgId,
    activeGroupId,
  );
  const { radarCategories, vulnerabilities, deltaHosts, deltaCves } =
    useAssessmentTrends(assessmentId, activeGroupId);

  // Catalogo servizi — chiavi normalizzate (lowercase, no underscore/punteggiatura)
  // per confronto case-insensitive con i service_type del backend.
  const SERVICE_CATALOG: Record<string, { name: string; icon: string }> = {
    hicompliance: { name: "HiCompliance", icon: "shield" },
    surfacescan:  { name: "SurfaceScan360", icon: "chart" },
    darkrisk:     { name: "DarkRisk360", icon: "shield" },
    hipatch:      { name: "HiPatch", icon: "shield" },
    hifirewall:   { name: "HiFirewall", icon: "shield" },
    hiendpoint:   { name: "HiEndpoint", icon: "shield" },
    himail:       { name: "HiMail", icon: "shield" },
    hidetect:     { name: "HiDetect", icon: "shield" },
    hilog:        { name: "HiLog", icon: "shield" },
    himobile:     { name: "HiMobile", icon: "shield" },
  };

  const normalizeCode = (code: string) =>
    code.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Mostra SOLO i servizi HiSolution attivi per questo tenant.
  const hiSolutionServices = useMemo(() => {
    return integrations
      .filter((i) => i.is_active && i.service_code)
      .map((i) => {
        const key = normalizeCode(i.service_code!);
        const meta = SERVICE_CATALOG[key];
        if (!meta) return null;
        return {
          id: i.service_code!,
          status: "active" as const,
          health_score: null as number | null,
          services: {
            name: meta.name,
            code: i.service_code!,
            id: i.service_code!,
          },
        };
      })
      .filter(Boolean) as typeof hiSolutionServices;
  }, [integrations]);

  const totalIssues = integrations.filter((i) => !i.is_active).length;

  // Tutte le tile sono cliccabili: in assenza di integration mostriamo dashboard mock funzionante
  const isModuleEnabledForDashboard = (_serviceCode: string) => true;

  const connectedServicesCount = hiSolutionServices.length;
  const alertServicesCount = 0;
  const operativeServicesCount = connectedServicesCount;

  const handleServiceClick = (service: { code: string; name: string }) => {
    // HiCompliance è il container dei servizi hisolution, non ha una pagina
    // dashboard dedicata → resta sulla dashboard generale.
    if (
      service.code.toLowerCase().includes('compliance') ||
      service.name.toLowerCase().includes('compliance')
    ) {
      navigate('/dashboard');
      return;
    }
    navigate(`/dashboard/service/${service.code}`);
  };

  const renderServiceCard = (
    service: { name: string; code: string; id?: string },
    healthScore: number,
    index: number,
  ) => {
    const moduleEnabled = isModuleEnabledForDashboard(service.code);
    const isGood = healthScore >= 80;
    const issues = isGood ? 0 : Math.ceil((100 - healthScore) / 20);

    return (
      <div
        key={index}
        className={`flex flex-col p-4 rounded-xl border border-border bg-card transition-all duration-200 ${
          moduleEnabled
            ? "hover:bg-muted/30 hover:shadow-lg cursor-pointer"
            : "opacity-70 cursor-not-allowed"
        }`}
        onClick={() => moduleEnabled && handleServiceClick(service)}
      >
        <div className="flex items-center justify-between mb-3">
          <div
            className={`p-2 rounded-lg flex items-center justify-center ${
              healthScore < 50
                ? "bg-red-500/10"
                : healthScore < 80
                  ? "bg-yellow-500/10"
                  : "bg-green-500/10"
            }`}
          >
            <div
              className={`w-3 h-3 rounded-full ${
                healthScore < 50
                  ? "bg-red-500"
                  : healthScore < 80
                    ? "bg-yellow-500"
                    : "bg-green-500"
              }`}
            />
          </div>
          <div className="flex items-center gap-2">
            {!moduleEnabled && (
              <Badge
                variant="outline"
                className="text-muted-foreground text-[10px] px-1.5 py-0"
              >
                <Unlink className="w-3 h-3 mr-1" />
                Spento
              </Badge>
            )}
            {!isGood && (
              <div
                className={`text-xl font-bold ${healthScore < 50 ? "text-red-500" : "text-yellow-500"}`}
              >
                {issues}
              </div>
            )}
            {isGood && (
              <div className="text-sm text-green-500 font-semibold">OK</div>
            )}
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-primary">{getServiceIcon(service.code)}</div>
            <h4 className="font-semibold text-base">{service.name}</h4>
          </div>

          <div className="space-y-2 mb-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Health Score:
              </span>
              <span
                className={`text-sm font-semibold ${healthScore >= 80 ? "text-green-500" : healthScore >= 50 ? "text-yellow-500" : "text-red-500"}`}
              >
                {healthScore}%
              </span>
            </div>
          </div>

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

  // Nessun servizio di fallback: si mostrano solo gli integration reali del cliente

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">{activeOrgName}</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-red-500 mb-1">
              {totalIssues}
            </div>
            <p className="text-sm text-muted-foreground">Issues Attive</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ComplianceMetricCard
              completionScore={completionScore}
              riskScore={riskScore}
            />
            <RiskScoreMetricCard score={riskScore} />
            {/* Merged card: Servizi Monitorati + Issues Totali */}
            <Card className="relative overflow-hidden border-border shadow-cyber hover:shadow-glow transition-cyber animate-fade-in">
              <CardContent className="p-0 h-full">
                <div className="grid grid-cols-2 divide-x divide-border h-full">
                  {/* Servizi Monitorati */}
                  <div className="flex flex-col items-center justify-center p-5 text-center space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">
                      Servizi Monitorati
                    </p>
                    <Badge
                      variant="secondary"
                      className="bg-cyber-green/20 text-cyber-green w-full justify-center"
                    >
                      Buono
                    </Badge>
                    <div className="text-4xl font-bold text-foreground">
                      {integrations.filter((i) => i.is_active).length}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Servizi attivi
                    </p>
                  </div>
                  {/* Issues Totali */}
                  <div className="flex flex-col items-center justify-center p-5 text-center space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">
                      Issues Totali
                    </p>
                    <Badge
                      variant="secondary"
                      className="bg-cyber-red/20 text-cyber-red w-full justify-center"
                    >
                      Critico
                    </Badge>
                    <div className="text-4xl font-bold text-foreground">
                      {totalIssues}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Da risolvere
                    </p>
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
                <CardTitle className="text-xl mb-2">
                  Servizi HiSolution
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Stato dei servizi in tempo reale
                </p>
              </div>
              <div className="flex items-center gap-4">
                {isSuperAdmin && activeOrgId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setModulesDialogOpen(true)}
                  >
                    <Settings className="w-4 h-4 mr-1" />
                    Gestione Moduli Cliente
                  </Button>
                )}
                {canManageIntegrationSettings && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setModulesDialogOpen(true)}
                  >
                    <Settings className="w-4 h-4 mr-1" />
                    Impostazioni
                  </Button>
                )}
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary mb-1">
                    {totalIssues}
                  </div>
                  <p className="text-xs text-muted-foreground">Issues Attive</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            {hiSolutionServices.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {hiSolutionServices.map((orgService, index) => {
                  const service = orgService.services;
                  return renderServiceCard(
                    service,
                    orgService.health_score ?? 0,
                    index,
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 border border-dashed border-border rounded-lg">
                <p className="text-sm text-muted-foreground mb-3">
                  Nessun servizio HiSolution collegato per questo cliente.
                </p>
                {(isSuperAdmin || canManageIntegrationSettings) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => activeOrgId && setModulesDialogOpen(true)}
                  >
                    <Settings className="w-4 h-4 mr-1" />
                    Configura servizi
                  </Button>
                )}
              </div>
            )}

            <div className="border-t border-border pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-primary mb-1">
                    {connectedServicesCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Servizi Connessi
                  </div>
                </div>
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-red-500 mb-1">
                    {totalIssues}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Servizi Inattivi
                  </div>
                </div>
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-green-500 mb-1">
                    {integrations.filter((i) => i.is_active).length}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Servizi Operativi
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Analisi e Trend — dati dal report mensile dell'assessment */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Analisi e Trend</CardTitle>
            <p className="text-sm text-muted-foreground">
              Trend conformità e vulnerabilità dall'assessment mensile
            </p>
          </CardHeader>
          <CardContent>
            {radarCategories.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Radar chart */}
                <div className="lg:col-span-2">
                  <AssessmentRadarChart
                    data={radarCategories.map((c) => ({
                      category:
                        c.name.length > 18 ? c.name.slice(0, 16) + "…" : c.name,
                      fullName: c.name,
                      compliance: c.completion_percent,
                      target: 90,
                    }))}
                  />
                </div>
                {/* Delta + vulnerabilità */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-lg border border-border bg-card/50 text-center">
                      <div className="text-2xl font-bold text-primary">
                        {deltaHosts ?? "—"}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Delta Host
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border border-border bg-card/50 text-center">
                      <div className="text-2xl font-bold text-destructive">
                        {deltaCves ?? "—"}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Delta CVE
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-card/50">
                    <p className="text-sm font-medium mb-2">
                      Vulnerabilità recenti
                    </p>
                    {vulnerabilities.length > 0 ? (
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {vulnerabilities.slice(0, 6).map((v, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="font-mono text-xs truncate max-w-[140px]">
                              {v.cve}
                            </span>
                            <Badge
                              variant={
                                v.severity === "CRITICAL" ||
                                v.severity === "HIGH"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {v.severity}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nessuna vulnerabilità rilevata
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">
                  Nessun dato trend disponibile per questo cliente.
                </p>
                <p className="text-xs mt-1">
                  Compila l'assessment per generare i trend mensili.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isSuperAdmin && activeOrgId && (
        <ClientServicesDialog
          open={modulesDialogOpen}
          onOpenChange={setModulesDialogOpen}
          organizationId={activeOrgId}
          organizationName={activeOrgName}
          groupId={activeGroupId}
        />
      )}
    </DashboardLayout>
  );
};

export default Dashboard;
