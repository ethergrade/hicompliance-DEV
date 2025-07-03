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
                <p className="text-xs text-muted-foreground">Stato in tempo reale</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { name: 'HiFirewall', status: 'alert', issues: 8, resolved: 124, code: 'hi_firewall' },
                  { name: 'HiEndpoint', status: 'alert', issues: 3, resolved: 54, code: 'hi_endpoint' },
                  { name: 'HiMail', status: 'alert', issues: 2, resolved: 98, code: 'hi_mail' },
                  { name: 'HiLog', status: 'alert', issues: 9, resolved: 54, code: 'hi_log' },
                  { name: 'HiPatch', status: 'alert', issues: 5, resolved: 78, code: 'hi_patch' },
                  { name: 'HiMfa', status: 'active', issues: 0, resolved: 145, code: 'hi_mfa' },
                  { name: 'HiTrack', status: 'active', issues: 0, resolved: 89, code: 'hi_track' }
                ].map((service, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className={`p-1.5 rounded-lg flex items-center justify-center ${
                        service.status === 'alert' ? 'bg-red-500/10' : 'bg-green-500/10'
                      }`}>
                        <div className={`w-3 h-3 rounded-full ${
                          service.status === 'alert' ? 'bg-red-500' : 'bg-green-500'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{service.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {service.resolved} resolved / 90d
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {service.status === 'alert' ? (
                        <div className="text-lg font-bold text-red-500">
                          {service.issues}
                        </div>
                      ) : (
                        <div className="text-xs text-green-500 font-medium">
                          OK
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {/* Summary Stats */}
                <div className="mt-4 pt-3 border-t border-border">
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div>
                      <div className="text-lg font-bold text-red-500">
                        {[8, 3, 2, 9, 5].reduce((a, b) => a + b, 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">Issues Aperte</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-green-500">
                        {[124, 54, 98, 54, 78, 145, 89].reduce((a, b) => a + b, 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">Risolte/90d</div>
                    </div>
                  </div>
                </div>
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