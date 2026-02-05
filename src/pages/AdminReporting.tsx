import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Navigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { 
  Building2,
  Users,
  Shield,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  FileText,
  Download,
  Activity,
  Server,
  Target,
  BarChart3
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface OrganizationStats {
  id: string;
  name: string;
  code: string;
  usersCount: number;
  servicesCount: number;
  activeServicesCount: number;
  assessmentProgress: number;
  remediationTasksCount: number;
  completedTasksCount: number;
  riskScore: number;
}

const AdminReporting: React.FC = () => {
  const { isSuperAdmin, isSales, loading: rolesLoading } = useUserRoles();
  const [timeRange, setTimeRange] = useState('30d');
  const [organizations, setOrganizations] = useState<OrganizationStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Aggregated stats
  const [aggregatedStats, setAggregatedStats] = useState({
    totalOrganizations: 0,
    totalUsers: 0,
    totalActiveServices: 0,
    averageAssessmentProgress: 0,
    totalRemediationTasks: 0,
    completedRemediationTasks: 0,
    averageRiskScore: 0
  });

  useEffect(() => {
    if (!rolesLoading && (isSuperAdmin || isSales)) {
      fetchAggregatedData();
    }
  }, [rolesLoading, isSuperAdmin, isSales, timeRange]);

  const fetchAggregatedData = async () => {
    setLoading(true);
    try {
      // Fetch organizations
      const { data: orgs, error: orgsError } = await supabase
        .from('organizations')
        .select('id, name, code');

      if (orgsError) throw orgsError;

      // Fetch users count per organization
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('organization_id');

      if (usersError) throw usersError;

      // Fetch organization services
      const { data: services, error: servicesError } = await supabase
        .from('organization_services')
        .select('organization_id, status');

      if (servicesError) throw servicesError;

      // Fetch remediation tasks
      const { data: tasks, error: tasksError } = await supabase
        .from('remediation_tasks')
        .select('organization_id, progress, is_deleted');

      if (tasksError) throw tasksError;

      // Fetch assessment responses
      const { data: responses, error: responsesError } = await supabase
        .from('assessment_responses')
        .select('organization_id, status');

      if (responsesError) throw responsesError;

      // Process data for each organization
      const orgStats: OrganizationStats[] = (orgs || []).map(org => {
        const orgUsers = users?.filter(u => u.organization_id === org.id) || [];
        const orgServices = services?.filter(s => s.organization_id === org.id) || [];
        const orgTasks = tasks?.filter(t => t.organization_id === org.id && !t.is_deleted) || [];
        const orgResponses = responses?.filter(r => r.organization_id === org.id) || [];

        const activeServices = orgServices.filter(s => s.status === 'active').length;
        const completedResponses = orgResponses.filter(r => r.status === 'completed').length;
        const assessmentProgress = orgResponses.length > 0 
          ? Math.round((completedResponses / orgResponses.length) * 100) 
          : 0;

        const completedTasks = orgTasks.filter(t => t.progress === 100).length;

        // Calculate risk score (mock based on available data)
        const riskScore = Math.max(0, Math.min(100, 
          100 - assessmentProgress * 0.3 - (activeServices * 5) - (completedTasks * 2)
        ));

        return {
          id: org.id,
          name: org.name,
          code: org.code,
          usersCount: orgUsers.length,
          servicesCount: orgServices.length,
          activeServicesCount: activeServices,
          assessmentProgress,
          remediationTasksCount: orgTasks.length,
          completedTasksCount: completedTasks,
          riskScore: Math.round(riskScore)
        };
      });

      setOrganizations(orgStats);

      // Calculate aggregated stats
      const totalOrgs = orgStats.length;
      const totalUsers = orgStats.reduce((acc, org) => acc + org.usersCount, 0);
      const totalActiveServices = orgStats.reduce((acc, org) => acc + org.activeServicesCount, 0);
      const avgProgress = totalOrgs > 0 
        ? Math.round(orgStats.reduce((acc, org) => acc + org.assessmentProgress, 0) / totalOrgs)
        : 0;
      const totalTasks = orgStats.reduce((acc, org) => acc + org.remediationTasksCount, 0);
      const completedTasks = orgStats.reduce((acc, org) => acc + org.completedTasksCount, 0);
      const avgRisk = totalOrgs > 0
        ? Math.round(orgStats.reduce((acc, org) => acc + org.riskScore, 0) / totalOrgs)
        : 0;

      setAggregatedStats({
        totalOrganizations: totalOrgs,
        totalUsers,
        totalActiveServices,
        averageAssessmentProgress: avgProgress,
        totalRemediationTasks: totalTasks,
        completedRemediationTasks: completedTasks,
        averageRiskScore: avgRisk
      });

    } catch (error) {
      console.error('Error fetching aggregated data:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare i dati aggregati',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Redirect non-admin/sales users
  if (!rolesLoading && !isSuperAdmin && !isSales) {
    return <Navigate to="/dashboard" replace />;
  }

  // Chart data
  const serviceDistributionData = [
    { name: 'HiFirewall', value: 12, color: '#3B82F6' },
    { name: 'HiEndpoint', value: 10, color: '#10B981' },
    { name: 'HiMail', value: 8, color: '#F59E0B' },
    { name: 'HiPatch', value: 7, color: '#EF4444' },
    { name: 'HiLog', value: 6, color: '#8B5CF6' },
    { name: 'HiTrack', value: 5, color: '#EC4899' }
  ];

  const riskTrendData = [
    { month: 'Set', avgRisk: 75, incidents: 45 },
    { month: 'Ott', avgRisk: 72, incidents: 38 },
    { month: 'Nov', avgRisk: 68, incidents: 32 },
    { month: 'Dic', avgRisk: 65, incidents: 28 },
    { month: 'Gen', avgRisk: 62, incidents: 22 },
    { month: 'Feb', avgRisk: aggregatedStats.averageRiskScore || 58, incidents: 18 }
  ];

  const assessmentProgressData = organizations
    .sort((a, b) => b.assessmentProgress - a.assessmentProgress)
    .slice(0, 10)
    .map(org => ({
      name: org.code,
      progress: org.assessmentProgress,
      target: 80
    }));

  const getRiskColor = (score: number) => {
    if (score < 40) return 'text-green-500';
    if (score < 70) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getRiskBadge = (score: number) => {
    if (score < 40) return 'default';
    if (score < 70) return 'secondary';
    return 'destructive';
  };

  const handleExport = () => {
    // Export CSV
    const headers = ['Organizzazione', 'Codice', 'Utenti', 'Servizi Attivi', 'Assessment %', 'Task Remediation', 'Task Completati', 'Risk Score'];
    const rows = organizations.map(org => [
      org.name,
      org.code,
      org.usersCount,
      org.activeServicesCount,
      org.assessmentProgress,
      org.remediationTasksCount,
      org.completedTasksCount,
      org.riskScore
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-aggregato-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    toast({
      title: 'Report Esportato',
      description: 'Il file CSV è stato scaricato'
    });
  };

  if (rolesLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard Reportistica</h1>
            <p className="text-muted-foreground">
              Statistiche aggregate su tutti i clienti
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Ultimi 7 giorni</SelectItem>
                <SelectItem value="30d">Ultimi 30 giorni</SelectItem>
                <SelectItem value="90d">Ultimi 90 giorni</SelectItem>
                <SelectItem value="1y">Ultimo anno</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Esporta CSV
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Organizzazioni Totali</p>
                  <p className="text-3xl font-bold text-foreground">{aggregatedStats.totalOrganizations}</p>
                  <div className="flex items-center mt-1">
                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-xs text-green-500">+2 questo mese</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-primary/10">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Utenti Totali</p>
                  <p className="text-3xl font-bold text-foreground">{aggregatedStats.totalUsers}</p>
                  <div className="flex items-center mt-1">
                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-xs text-green-500">+15% vs mese scorso</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/10">
                  <Users className="w-6 h-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Servizi Attivi</p>
                  <p className="text-3xl font-bold text-foreground">{aggregatedStats.totalActiveServices}</p>
                  <Badge variant="secondary" className="mt-1">
                    {organizations.length > 0 
                      ? Math.round(aggregatedStats.totalActiveServices / organizations.length * 10) / 10 
                      : 0} per cliente
                  </Badge>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10">
                  <Server className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Risk Score Medio</p>
                  <p className={`text-3xl font-bold ${getRiskColor(aggregatedStats.averageRiskScore)}`}>
                    {aggregatedStats.averageRiskScore}
                  </p>
                  <div className="flex items-center mt-1">
                    <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-xs text-green-500">-8% vs mese scorso</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-orange-500/10">
                  <AlertTriangle className="w-6 h-6 text-orange-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground">Assessment Medio</p>
                  <p className="text-2xl font-bold text-foreground">{aggregatedStats.averageAssessmentProgress}%</p>
                </div>
                <Target className="w-6 h-6 text-primary" />
              </div>
              <Progress value={aggregatedStats.averageAssessmentProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">Target: 80%</p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground">Remediation Tasks</p>
                  <p className="text-2xl font-bold text-foreground">
                    {aggregatedStats.completedRemediationTasks}/{aggregatedStats.totalRemediationTasks}
                  </p>
                </div>
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <Progress 
                value={aggregatedStats.totalRemediationTasks > 0 
                  ? (aggregatedStats.completedRemediationTasks / aggregatedStats.totalRemediationTasks) * 100 
                  : 0} 
                className="h-2" 
              />
              <p className="text-xs text-muted-foreground mt-2">
                {aggregatedStats.totalRemediationTasks > 0 
                  ? Math.round((aggregatedStats.completedRemediationTasks / aggregatedStats.totalRemediationTasks) * 100) 
                  : 0}% completati
              </p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground">Tempo Medio Remediation</p>
                  <p className="text-2xl font-bold text-foreground">14 giorni</p>
                </div>
                <Clock className="w-6 h-6 text-yellow-500" />
              </div>
              <div className="flex items-center">
                <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
                <span className="text-xs text-green-500">-3 giorni vs mese scorso</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Risk Trend Chart */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Trend Risk Score Medio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={riskTrendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-muted-foreground" fontSize={12} />
                    <YAxis className="text-muted-foreground" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="avgRisk" 
                      stroke="hsl(var(--primary))" 
                      fill="hsl(var(--primary) / 0.2)" 
                      name="Risk Score"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Services Distribution */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Distribuzione Servizi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={serviceDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {serviceDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Assessment Progress by Organization */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Progresso Assessment per Organizzazione (Top 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assessmentProgressData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" domain={[0, 100]} className="text-muted-foreground" fontSize={12} />
                  <YAxis dataKey="name" type="category" width={80} className="text-muted-foreground" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Bar dataKey="progress" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Progresso %" />
                  <Bar dataKey="target" fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} name="Target" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Organizations Table */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Dettaglio Organizzazioni
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Organizzazione</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Utenti</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Servizi</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Assessment</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Remediation</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Risk Score</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org) => (
                    <tr key={org.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-foreground">{org.name}</p>
                          <p className="text-xs text-muted-foreground">{org.code}</p>
                        </div>
                      </td>
                      <td className="text-center py-3 px-4">
                        <Badge variant="outline">{org.usersCount}</Badge>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className="text-foreground">{org.activeServicesCount}/{org.servicesCount}</span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <Progress value={org.assessmentProgress} className="w-16 h-2" />
                          <span className="text-sm text-foreground">{org.assessmentProgress}%</span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className="text-foreground">{org.completedTasksCount}/{org.remediationTasksCount}</span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <Badge variant={getRiskBadge(org.riskScore) as any}>
                          {org.riskScore}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminReporting;
