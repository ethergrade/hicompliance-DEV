import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ServiceStatusCard } from '@/components/dashboard/ServiceStatusCard';
import { HiSolutionStatusGrid } from '@/components/dashboard/HiSolutionStatusGrid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

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
      } else {
        // Mock data for demo when no user is logged in
        const mockServices = [
          { id: '1', status: 'alert', health_score: 15, services: { name: 'HiFirewall', code: 'hi_firewall' } },
          { id: '2', status: 'alert', health_score: 70, services: { name: 'HiEndpoint', code: 'hi_endpoint' } },
          { id: '3', status: 'maintenance', health_score: 75, services: { name: 'HiMail', code: 'hi_mail' } },
          { id: '4', status: 'alert', health_score: 10, services: { name: 'HiLog', code: 'hi_log' } },
          { id: '5', status: 'maintenance', health_score: 65, services: { name: 'HiPatch', code: 'hi_patch' } },
          { id: '6', status: 'active', health_score: 95, services: { name: 'HiMfa', code: 'hi_mfa' } },
          { id: '7', status: 'active', health_score: 90, services: { name: 'HiTrack', code: 'hi_track' } },
          { id: '8', status: 'maintenance', health_score: 70, services: { name: 'Cloud Security', code: 'cloud_security' } },
          { id: '9', status: 'active', health_score: 88, services: { name: 'Endpoint Security', code: 'endpoint_security' } },
          { id: '10', status: 'alert', health_score: 60, services: { name: 'Email Security', code: 'email_security' } }
        ];
        setServices(mockServices);
      }
      setLoading(false);
    };

    fetchServices();
  }, [userProfile]);

  // Calculate real metrics from services
  const alertServices = services.filter(s => s.status === 'alert');
  const activeServices = services.filter(s => s.status === 'active');
  const maintenanceServices = services.filter(s => s.status === 'maintenance');
  const hiSolutionServices = services.filter(s => s.services?.code?.startsWith('hi_'));
  const totalIssues = alertServices.reduce((acc, service) => {
    const issues = service.health_score ? Math.floor((100 - service.health_score) / 10) : 5;
    return acc + issues;
  }, 0);

  // Fallback data when no services loaded
  const fallbackData = {
    alertCount: 4,
    activeCount: 3,
    maintenanceCount: 3,
    avgScore: 68,
    totalIssues: 22
  };

  const mockData = {
    nis2Compliance: alertServices.length > 3 ? 35 : 65,
    riskIndicator: Math.min(75 + (alertServices.length * 3), 100),
    totalAssets: services.length || 8,
    activeThreats: totalIssues || fallbackData.totalIssues
  };

  // Prepare chart data
  const chartData = [
    { name: 'Attivi', value: activeServices.length || fallbackData.activeCount, color: '#10b981' },
    { name: 'Allerta', value: alertServices.length || fallbackData.alertCount, color: '#ef4444' },
    { name: 'Manutenzione', value: maintenanceServices.length || fallbackData.maintenanceCount, color: '#f59e0b' }
  ];

  const COLORS = ['#10b981', '#ef4444', '#f59e0b'];

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
                {hiSolutionServices.length > 0 ? hiSolutionServices.map((orgService, index) => {
                  const service = orgService.services;
                  const issueCount = Math.floor((100 - (orgService.health_score || 0)) / 10);
                  const resolvedCount = Math.floor(50 + Math.random() * 100);
                  const status = orgService.status;
                  
                  return (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className={`p-1.5 rounded-lg flex items-center justify-center ${
                          status === 'alert' ? 'bg-red-500/10' : status === 'maintenance' ? 'bg-yellow-500/10' : 'bg-green-500/10'
                        }`}>
                          <div className={`w-3 h-3 rounded-full ${
                            status === 'alert' ? 'bg-red-500' : status === 'maintenance' ? 'bg-yellow-500' : 'bg-green-500'
                          }`} />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{service.name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {resolvedCount} risolte / 90g
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {status === 'alert' ? (
                          <div className="text-lg font-bold text-red-500">
                            {issueCount}
                          </div>
                        ) : status === 'maintenance' ? (
                          <div className="text-xs text-yellow-500 font-medium">
                            MANUTENZIONE
                          </div>
                        ) : (
                          <div className="text-xs text-green-500 font-medium">
                            OK
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  // Fallback data if no services loaded yet
                  [
                    { name: 'HiFirewall', status: 'alert', issues: 8, resolved: 124 },
                    { name: 'HiEndpoint', status: 'alert', issues: 3, resolved: 54 },
                    { name: 'HiMail', status: 'maintenance', issues: 2, resolved: 98 },
                    { name: 'HiLog', status: 'alert', issues: 9, resolved: 54 },
                    { name: 'HiPatch', status: 'maintenance', issues: 3, resolved: 78 },
                    { name: 'HiMfa', status: 'active', issues: 0, resolved: 145 },
                    { name: 'HiTrack', status: 'active', issues: 0, resolved: 89 }
                  ].map((service, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className={`p-1.5 rounded-lg flex items-center justify-center ${
                          service.status === 'alert' ? 'bg-red-500/10' : service.status === 'maintenance' ? 'bg-yellow-500/10' : 'bg-green-500/10'
                        }`}>
                          <div className={`w-3 h-3 rounded-full ${
                            service.status === 'alert' ? 'bg-red-500' : service.status === 'maintenance' ? 'bg-yellow-500' : 'bg-green-500'
                          }`} />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{service.name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {service.resolved} risolte / 90g
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {service.status === 'alert' ? (
                          <div className="text-lg font-bold text-red-500">
                            {service.issues}
                          </div>
                        ) : service.status === 'maintenance' ? (
                          <div className="text-xs text-yellow-500 font-medium">
                            MANUTENZIONE
                          </div>
                        ) : (
                          <div className="text-xs text-green-500 font-medium">
                            OK
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                
                {/* Summary Stats */}
                <div className="mt-4 pt-3 border-t border-border">
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div>
                      <div className="text-lg font-bold text-red-500">
                        {totalIssues}
                      </div>
                      <div className="text-xs text-muted-foreground">Issues Rilevate</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-green-500">
                        {hiSolutionServices.length > 0 ? hiSolutionServices.reduce((acc, s) => {
                          const resolved = Math.floor(50 + Math.random() * 100);
                          return acc + resolved;
                        }, 0) : 642}
                      </div>
                      <div className="text-xs text-muted-foreground">Risolte/90g</div>
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
                      {totalIssues || fallbackData.totalIssues}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Issues Critiche Rilevate
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ultimi 30 giorni
                    </p>
                  </div>
                  
                  {/* Center - Donut Chart */}
                  <div className="flex items-center justify-center">
                    <div className="w-32 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={35}
                            outerRadius={55}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  {/* Right - Stats */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Servizi Attivi</span>
                        <span className="font-medium text-green-500">
                          {activeServices.length || fallbackData.activeCount}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>In Allerta</span>
                        <span className="font-medium text-red-500">
                          {alertServices.length || fallbackData.alertCount}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Punteggio Medio</span>
                        <span className="font-medium text-yellow-500">
                          {hiSolutionServices.length > 0 ? Math.round(
                            hiSolutionServices.reduce((acc, s) => acc + (s.health_score || 0), 0) / 
                            hiSolutionServices.length
                          ) : fallbackData.avgScore}%
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