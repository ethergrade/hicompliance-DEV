import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ServiceStatusCard } from '@/components/dashboard/ServiceStatusCard';
import { HiSolutionStatusGrid } from '@/components/dashboard/HiSolutionStatusGrid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';

const Dashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchServices = async () => {
      if (userProfile?.organization_id) {
        const { data } = await supabase
          .from('organization_services')
          .select('*, services(*)')
          .eq('organization_id', userProfile.organization_id);
        
        setServices(data || []);
      }
      setLoading(false);
    };

    fetchServices();
  }, [userProfile]);

  // Calculate real metrics from services
  const alertServices = services.filter(s => s.status === 'alert');
  const activeServices = services.filter(s => s.status === 'active');
  const hiSolutionServices = services.filter(s => s.services.code.startsWith('hi_'));
  const totalIssues = alertServices.reduce((acc, service) => {
    const issues = service.health_score ? Math.floor((100 - service.health_score) / 10) : 0;
    return acc + issues;
  }, 0);

  const mockData = {
    nis2Compliance: 42,
    riskIndicator: Math.min(84 + (alertServices.length * 5), 100),
    totalAssets: hiSolutionServices.length,
    activeThreats: totalIssues
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">
              {userProfile?.organizations?.name || 'Organizzazione'}
            </p>
          </div>
        </div>

        {/* Main Layout - Sidebar Services + Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[600px]">
          {/* Left Sidebar - Services Overview */}
          <div className="lg:col-span-1">
            <Card className="border-border h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Servizi HiSolution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {hiSolutionServices.map((service) => {
                  const issueCount = getIssueCount(service.health_score, service.status);
                  const resolvedCount = getResolvedCount(service.services.code);
                  
                  return (
                    <div key={service.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className={`p-1.5 rounded-lg ${
                          service.status === 'alert' ? 'bg-red-500/10' : 'bg-green-500/10'
                        }`}>
                          <div className={`w-6 h-6 rounded ${
                            service.status === 'alert' ? 'bg-red-500' : 'bg-green-500'
                          }`} />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">{service.services.name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {resolvedCount} resolved / 90d
                          </p>
                        </div>
                      </div>
                      {service.status === 'alert' && (
                        <div className="text-xl font-bold text-red-500">
                          {issueCount}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Security Overview Card */}
            <Card className="border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Panoramica Sicurezza</CardTitle>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">Ultimo aggiornamento:</span>
                    <span className="text-sm font-medium">2 ore fa</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Left - Main Metric */}
                  <div className="text-center">
                    <div className="text-4xl font-bold text-primary mb-2">
                      {totalIssues}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Issues Critiche Rilevate
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ultimi 30 giorni
                    </p>
                  </div>
                  
                  {/* Center - Chart Placeholder */}
                  <div className="flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full border-8 border-red-500 border-t-green-500 border-r-yellow-500 border-l-blue-500"></div>
                  </div>
                  
                  {/* Right - Stats */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Servizi Attivi</span>
                        <span className="font-medium text-green-500">
                          {activeServices.length}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>In Allerta</span>
                        <span className="font-medium text-red-500">
                          {alertServices.length}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Score Medio</span>
                        <span className="font-medium text-yellow-500">
                          {Math.round(
                            hiSolutionServices.reduce((acc, s) => acc + (s.health_score || 0), 0) / 
                            hiSolutionServices.length
                          )}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <MetricCard
                title="Conformità NIS2"
                value="Moderato"
                percentage={mockData.nis2Compliance}
                status="warning"
                description="Conformità generale"
              />
              <MetricCard
                title="Risk Score"
                value={alertServices.length > 3 ? "Alto" : "Medio"}
                percentage={mockData.riskIndicator}
                status="critical"
                description="Livello di rischio"
              />
              <MetricCard
                title="Servizi Monitorati"
                value={hiSolutionServices.length}
                status="good"
                description="Servizi attivi"
              />
              <MetricCard
                title="Issues Totali"
                value={mockData.activeThreats}
                status="critical"
                description="Da risolvere"
              />
            </div>
          </div>
        </div>

        {/* Additional Components */}
        <HiSolutionStatusGrid services={services} />
        <ServiceStatusCard services={services} />
      </div>
    </DashboardLayout>
  );

  function getIssueCount(healthScore: number | null, status: string): number {
    if (status === 'alert' && healthScore !== null) {
      return Math.floor((100 - healthScore) / 10);
    }
    return 0;
  }

  function getResolvedCount(code: string): number {
    const resolvedMap: Record<string, number> = {
      hi_firewall: 124,
      hi_endpoint: 54,
      hi_mail: 98,
      hi_log: 54,
      hi_patch: 78,
      hi_mfa: 145,
      hi_track: 89,
    };
    return resolvedMap[code] || 0;
  }
};

export default Dashboard;