import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ServiceStatusCard } from '@/components/dashboard/ServiceStatusCard';
import { HiSolutionStatusGrid } from '@/components/dashboard/HiSolutionStatusGrid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { SecurityFeedsSection } from '@/components/dashboard/SecurityFeedsSection';
import { EPSSWidget } from '@/components/dashboard/EPSSWidget';
import { 
  Shield, 
  Monitor, 
  Mail, 
  FileText, 
  Download, 
  Lock, 
  BarChart3, 
  Cloud, 
  Laptop,
  AtSign 
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
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
          { id: '6', status: 'active', health_score: 90, services: { name: 'HiTrack', code: 'hi_track' } },
          { id: '7', status: 'active', health_score: 92, services: { name: 'HiDetect', code: 'hi_detect' } },
        ];
        setServices(mockServices);
      }
      setLoading(false);
    };

    fetchServices();
  }, [userProfile]);

  // Calculate real metrics from services
  // Services to exclude from display
  const excludedServices = ['hi_mfa', 'hi_cloud_optix', 'hi_phish_threat', 'hi_ztna'];
  const hiSolutionServices = services.filter(s => 
    s.services?.code?.startsWith('hi_') && !excludedServices.includes(s.services?.code)
  );
  
  // Calculate metrics based on health score (not status)
  // Health Score >= 80: Green (OK/Operational)
  // Health Score >= 50 and < 80: Yellow (Warning)
  // Health Score < 50: Red (Critical/Alert)
  const servicesWithCriticalHealth = hiSolutionServices.filter(s => (s.health_score || 0) < 50);
  const servicesWithWarningHealth = hiSolutionServices.filter(s => (s.health_score || 0) >= 50 && (s.health_score || 0) < 80);
  const servicesWithGoodHealth = hiSolutionServices.filter(s => (s.health_score || 0) >= 80);
  
  // Total issues calculated from services with health < 80
  const totalIssues = hiSolutionServices.reduce((acc, service) => {
    const healthScore = service.health_score || 0;
    if (healthScore < 80) {
      // Calculate issues: lower health = more issues
      const issues = Math.ceil((100 - healthScore) / 20);
      return acc + issues;
    }
    return acc;
  }, 0);

  // Fallback data when no services loaded
  const fallbackData = {
    alertCount: 4,
    activeCount: 2,
    warningCount: 2,
    avgScore: 47,
    totalIssues: 22
  };

  const mockData = {
    nis2Compliance: servicesWithCriticalHealth.length > 3 ? 35 : 65,
    riskIndicator: 51,
    totalAssets: services.length || 8,
    activeThreats: totalIssues || fallbackData.totalIssues
  };

  // Prepare chart data based on health score thresholds
  const chartData = [
    { name: 'Operativi', value: servicesWithGoodHealth.length || fallbackData.activeCount, color: '#10b981' },
    { name: 'Attenzione', value: servicesWithWarningHealth.length || fallbackData.warningCount, color: '#f59e0b' },
    { name: 'Critici', value: servicesWithCriticalHealth.length || fallbackData.alertCount, color: '#ef4444' }
  ];

  const COLORS = ['#10b981', '#f59e0b', '#ef4444'];

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
          <div className="text-right">
            <div className="text-4xl font-bold text-red-500 mb-1">
              {totalIssues || fallbackData.totalIssues}
            </div>
            <p className="text-sm text-muted-foreground">Issues Attive</p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            title="Conformità NIS2/NIST/ISO"
            value="Moderato"
            percentage={mockData.nis2Compliance}
            status="warning"
            description="Conformità generale"
          />
          <MetricCard
            title="Risk Score"
            value={servicesWithCriticalHealth.length > 3 ? "Alto" : servicesWithCriticalHealth.length > 1 ? "Medio" : "Basso"}
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

        {/* Servizi HiSolution - Stato in tempo reale con statistiche integrate */}
        <Card className="border-border">
          <CardHeader className="pb-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl mb-2">Servizi HiSolution</CardTitle>
                <p className="text-sm text-muted-foreground">Stato dei servizi in tempo reale</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary mb-1">
                  {totalIssues || 23}
                </div>
                <p className="text-xs text-muted-foreground">Issues Attive</p>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-8">
            {/* Griglia servizi */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {hiSolutionServices.length > 0 ? hiSolutionServices.map((orgService, index) => {
                const service = orgService.services;
                const healthScore = orgService.health_score || 0;
                const issueCount = Math.floor((100 - healthScore) / 10);
                const resolvedCount = Math.floor(50 + Math.random() * 100);
                const status = orgService.status;
                
                // Mappatura icone per i servizi
                const getServiceIcon = (code: string) => {
                  switch (code) {
                    case 'hi_firewall': return <Shield className="w-4 h-4" />;
                    case 'hi_endpoint': return <Laptop className="w-4 h-4" />;
                    case 'hi_mail': return <Mail className="w-4 h-4" />;
                    case 'hi_log': return <FileText className="w-4 h-4" />;
                    case 'hi_patch': return <Download className="w-4 h-4" />;
                    case 'hi_track': return <BarChart3 className="w-4 h-4" />;
                    case 'hi_detect': return <Monitor className="w-4 h-4" />;
                    default: return <Shield className="w-4 h-4" />;
                  }
                };
                
                // Calcolo punteggio di criticità basato su health score e issues
                const criticalityScore = status === 'alert' ? 
                  Math.min(100, 100 - healthScore + issueCount * 5) : 
                  status === 'maintenance' ? 
                    Math.min(80, 100 - healthScore) : 
                    Math.max(10, 100 - healthScore);
                
                const getCriticalityColor = (score: number) => {
                  if (score >= 70) return 'text-red-500';
                  if (score >= 40) return 'text-yellow-500';
                  return 'text-green-500';
                };
                
                const getHealthColor = (score: number) => {
                  if (score >= 80) return 'text-green-500';
                  if (score >= 50) return 'text-yellow-500';
                  return 'text-red-500';
                };
                
                return (
                  <div 
                    key={index} 
                    className="flex flex-col p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-all duration-200 hover:shadow-lg cursor-pointer"
                    onClick={() => navigate(`/dashboard/service/${service.code}`)}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-2 rounded-lg flex items-center justify-center ${
                        healthScore < 50 ? 'bg-red-500/10' : healthScore < 80 ? 'bg-yellow-500/10' : 'bg-green-500/10'
                      }`}>
                        <div className={`w-3 h-3 rounded-full ${
                          healthScore < 50 ? 'bg-red-500' : healthScore < 80 ? 'bg-yellow-500' : 'bg-green-500'
                        }`} />
                      </div>
                      <div className="text-right">
                        {healthScore >= 80 ? (
                          <div className="text-sm text-green-500 font-semibold">
                            OK
                          </div>
                        ) : (
                          <div className={`text-xl font-bold ${healthScore < 50 ? 'text-red-500' : 'text-yellow-500'}`}>
                            {Math.ceil((100 - healthScore) / 20)}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="text-primary">
                          {getServiceIcon(service.code)}
                        </div>
                        <h4 className="font-semibold text-base">{service.name}</h4>
                      </div>
                      
                      {/* Health Score e Criticità */}
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Health Score:</span>
                          <span className={`text-sm font-semibold ${getHealthColor(healthScore)}`}>
                            {healthScore}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Criticità:</span>
                          <span className={`text-sm font-semibold ${getCriticalityColor(criticalityScore)}`}>
                            {criticalityScore}/100
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-sm text-muted-foreground">
                        {resolvedCount} risolte negli ultimi 90 giorni
                      </p>
                    </div>
                  </div>
                );
              }) : (
                [
                  { name: 'HiFirewall', code: 'hi_firewall', healthScore: 56, resolved: 124 },
                  { name: 'HiEndpoint', code: 'hi_endpoint', healthScore: 26, resolved: 54 },
                  { name: 'HiMail', code: 'hi_mail', healthScore: 13, resolved: 98 },
                  { name: 'HiLog', code: 'hi_log', healthScore: 55, resolved: 54 },
                  { name: 'HiPatch', code: 'hi_patch', healthScore: 23, resolved: 78 },
                  { name: 'HiTrack', code: 'hi_track', healthScore: 88, resolved: 89 },
                  { name: 'HiDetect', code: 'hi_detect', healthScore: 89, resolved: 127 },
                  { name: 'HiMobile', code: 'hi_mobile', healthScore: 24, resolved: 89 }
                ].map((service, index) => {
                  const isGood = service.healthScore >= 80;
                  const isWarning = service.healthScore >= 50 && service.healthScore < 80;
                  const issues = isGood ? 0 : Math.ceil((100 - service.healthScore) / 20);
                  
                  return (
                    <div 
                      key={index} 
                      className="flex flex-col p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-all duration-200 hover:shadow-lg cursor-pointer"
                      onClick={() => navigate(`/dashboard/service/${service.code}`)}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-2 rounded-lg flex items-center justify-center ${
                          service.healthScore < 50 ? 'bg-red-500/10' : service.healthScore < 80 ? 'bg-yellow-500/10' : 'bg-green-500/10'
                        }`}>
                          <div className={`w-3 h-3 rounded-full ${
                            service.healthScore < 50 ? 'bg-red-500' : service.healthScore < 80 ? 'bg-yellow-500' : 'bg-green-500'
                          }`} />
                        </div>
                        <div className="text-right">
                          {isGood ? (
                            <div className="text-sm text-green-500 font-semibold">
                              OK
                            </div>
                          ) : (
                            <div className={`text-xl font-bold ${service.healthScore < 50 ? 'text-red-500' : 'text-yellow-500'}`}>
                              {issues}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex-1">
                        <h4 className="font-semibold text-base mb-2">{service.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {service.resolved} risolte negli ultimi 90 giorni
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Statistiche riassuntive */}
            <div className="border-t border-border pt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center p-4">
                  <div className="text-2xl font-bold text-primary mb-1">
                    8
                  </div>
                  <div className="text-sm text-muted-foreground">Servizi Connessi</div>
                </div>
                
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-red-500 mb-1">
                    6
                  </div>
                  <div className="text-sm text-muted-foreground">Servizi in Allerta</div>
                </div>
                
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-green-500 mb-1">
                    8
                  </div>
                  <div className="text-sm text-muted-foreground">Servizi Operativi</div>
                </div>
                
                <div className="text-center p-4">
                  <div className="text-2xl font-bold text-blue-500 mb-1">
                    {hiSolutionServices.length > 0 ? hiSolutionServices.reduce((acc, s) => {
                      const resolved = Math.floor(50 + Math.random() * 100);
                      return acc + resolved;
                    }, 0) : 642}
                  </div>
                  <div className="text-sm text-muted-foreground">Totale Risolte</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* EPSS Widget + Security Feeds */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <EPSSWidget />
          </div>
          <div className="lg:col-span-2">
            <SecurityFeedsSection compact />
          </div>
        </div>
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
      hi_track: 89,
      hi_detect: 127,
    };
    return resolvedMap[code] || 0;
  }
};

export default Dashboard;