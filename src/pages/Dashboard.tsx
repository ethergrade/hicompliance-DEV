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
    riskIndicator: 51,
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

        {/* Servizi HiSolution - Layout Orizzontale */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Servizi HiSolution</CardTitle>
            <p className="text-xs text-muted-foreground">Stato in tempo reale</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {hiSolutionServices.length > 0 ? hiSolutionServices.map((orgService, index) => {
                const service = orgService.services;
                const issueCount = Math.floor((100 - (orgService.health_score || 0)) / 10);
                const resolvedCount = Math.floor(50 + Math.random() * 100);
                const status = orgService.status;
                
                return (
                  <div key={index} className="flex flex-col p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className={`p-1.5 rounded-lg flex items-center justify-center ${
                        status === 'alert' ? 'bg-red-500/10' : status === 'maintenance' ? 'bg-yellow-500/10' : 'bg-green-500/10'
                      }`}>
                        <div className={`w-3 h-3 rounded-full ${
                          status === 'alert' ? 'bg-red-500' : status === 'maintenance' ? 'bg-yellow-500' : 'bg-green-500'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{service.name}</h4>
                      </div>
                    </div>
                    <div className="text-center">
                      {status === 'alert' ? (
                        <div className="text-lg font-bold text-red-500 mb-1">
                          {issueCount}
                        </div>
                      ) : status === 'maintenance' ? (
                        <div className="text-lg font-bold text-yellow-500 mb-1">
                          {Math.floor((100 - (orgService.health_score || 75)) / 15)}
                        </div>
                      ) : (
                        <div className="text-xs text-green-500 font-medium mb-1">
                          OK
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {resolvedCount} risolte / 90g
                      </p>
                    </div>
                  </div>
                );
              }) : (
                [
                  { name: 'HiFirewall', status: 'alert', issues: 8, resolved: 124 },
                  { name: 'HiEndpoint', status: 'alert', issues: 3, resolved: 54 },
                  { name: 'HiMail', status: 'maintenance', issues: 2, resolved: 98 },
                  { name: 'HiLog', status: 'alert', issues: 9, resolved: 54 }
                ].map((service, index) => (
                  <div key={index} className="flex flex-col p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className={`p-1.5 rounded-lg flex items-center justify-center ${
                        service.status === 'alert' ? 'bg-red-500/10' : service.status === 'maintenance' ? 'bg-yellow-500/10' : 'bg-green-500/10'
                      }`}>
                        <div className={`w-3 h-3 rounded-full ${
                          service.status === 'alert' ? 'bg-red-500' : service.status === 'maintenance' ? 'bg-yellow-500' : 'bg-green-500'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{service.name}</h4>
                      </div>
                    </div>
                    <div className="text-center">
                      {service.status === 'alert' ? (
                        <div className="text-lg font-bold text-red-500 mb-1">
                          {service.issues}
                        </div>
                      ) : service.status === 'maintenance' ? (
                        <div className="text-lg font-bold text-yellow-500 mb-1">
                          {service.issues}
                        </div>
                      ) : (
                        <div className="text-xs text-green-500 font-medium mb-1">
                          OK
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {service.resolved} risolte / 90g
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

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