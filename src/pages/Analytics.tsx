import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Download
} from 'lucide-react';

const Analytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState('6m');

  // Funzione per ottenere i dati in base al timeRange
  const getDataByTimeRange = (range: string) => {
    const baseData = {
      // Dati attuali (migliori)
      current: {
        riskScore: 68,
        compliance: 62,
        threats: 120,
        resolved: 94,
        riskTrend: 'down',
        threatsTrend: 'down'
      },
      // Dati peggiorativi per periodi passati
      past: {
        '1y': {
          riskScore: 95,
          compliance: 45,
          threats: 280,
          resolved: 45,
          riskTrend: 'up',
          threatsTrend: 'up'
        },
        '6m': {
          riskScore: 68,
          compliance: 62,
          threats: 120,
          resolved: 94,
          riskTrend: 'down',
          threatsTrend: 'down'
        },
        '3m': {
          riskScore: 75,
          compliance: 58,
          threats: 155,
          resolved: 78,
          riskTrend: 'up',
          threatsTrend: 'down'
        },
        '1m': {
          riskScore: 72,
          compliance: 60,
          threats: 135,
          resolved: 86,
          riskTrend: 'down',
          threatsTrend: 'down'
        }
      }
    };
    
    return baseData.past[range as keyof typeof baseData.past] || baseData.current;
  };

  const currentData = getDataByTimeRange(timeRange);

  // Dati trend di rischio nel tempo - cambiano in base al timeRange
  const getRiskTrendData = (range: string) => {
    switch (range) {
      case '1y':
        return [
          { month: 'Gen 2024', critical: 25, high: 45, medium: 35, low: 15, overall: 95 },
          { month: 'Mar 2024', critical: 22, high: 42, medium: 38, low: 18, overall: 92 },
          { month: 'Mag 2024', critical: 20, high: 38, medium: 42, low: 20, overall: 88 },
          { month: 'Lug 2024', critical: 18, high: 35, medium: 45, low: 22, overall: 85 },
          { month: 'Set 2024', critical: 15, high: 32, medium: 48, low: 25, overall: 82 },
          { month: 'Nov 2024', critical: 12, high: 28, medium: 45, low: 28, overall: 78 },
          { month: 'Gen 2025', critical: 8, high: 24, medium: 48, low: 32, overall: 68 }
        ];
      case '3m':
        return [
          { month: 'Ott', critical: 15, high: 32, medium: 45, low: 25, overall: 82 },
          { month: 'Nov', critical: 12, high: 28, medium: 46, low: 28, overall: 78 },
          { month: 'Dic', critical: 10, high: 26, medium: 47, low: 30, overall: 75 },
          { month: 'Gen', critical: 8, high: 24, medium: 48, low: 32, overall: 68 }
        ];
      case '1m':
        return [
          { month: 'Sett 1', critical: 10, high: 26, medium: 47, low: 30, overall: 75 },
          { month: 'Sett 2', critical: 9, high: 25, medium: 47, low: 31, overall: 72 },
          { month: 'Sett 3', critical: 8, high: 24, medium: 48, low: 32, overall: 70 },
          { month: 'Sett 4', critical: 8, high: 24, medium: 48, low: 32, overall: 68 }
        ];
      default: // 6m
        return [
          { month: 'Ago', critical: 18, high: 35, medium: 42, low: 22, overall: 85 },
          { month: 'Set', critical: 15, high: 32, medium: 45, low: 25, overall: 82 },
          { month: 'Ott', critical: 12, high: 28, medium: 46, low: 28, overall: 78 },
          { month: 'Nov', critical: 10, high: 26, medium: 47, low: 30, overall: 75 },
          { month: 'Dic', critical: 8, high: 24, medium: 48, low: 32, overall: 72 },
          { month: 'Gen', critical: 8, high: 24, medium: 48, low: 32, overall: 68 }
        ];
    }
  };

  const riskTrendData = getRiskTrendData(timeRange);

  // Dati conformità Assessment che cambiano in base al timeRange
  const getAssessmentData = (range: string) => {
    const baseCategories = [
      'Business Continuity', 'Certificazioni', 'Crittografia', 'Gestione Identità',
      'Gestione Incidenti', 'Gestione Rischio', 'Gestione Risorse', 'Gestione Fornitori',
      'Governance', 'HR e Formazione', 'Igiene Informatica', 'Manutenzione',
      'Network Security', 'Sviluppo Software'
    ];

    const complianceByRange = {
      '1y': [45, 60, 35, 15, 50, 40, 30, 20, 65, 45, 38, 25, 55, 25],
      '6m': [72, 85, 60, 25, 78, 65, 55, 30, 88, 70, 62, 35, 82, 40],
      '3m': [68, 82, 55, 22, 75, 62, 52, 28, 85, 67, 58, 32, 78, 38],
      '1m': [70, 84, 58, 24, 76, 63, 53, 29, 86, 68, 60, 33, 80, 39]
    };

    const currentCompliance = complianceByRange[range as keyof typeof complianceByRange] || complianceByRange['6m'];
    
    return baseCategories.map((category, index) => ({
      category: category.length > 12 ? category.substring(0, 12) + '...' : category,
      compliance: currentCompliance[index],
      target: currentCompliance[index] + 15,
      completedQuestions: Math.round((currentCompliance[index] / 100) * 20),
      totalQuestions: 20
    }));
  };

  const assessmentComplianceData = getAssessmentData(timeRange);

  // Dati minacce nel tempo che cambiano in base al timeRange
  const getThreatsData = (range: string) => {
    switch (range) {
      case '1y':
        return [
          { week: 'Gen 2024', surfaceScan: 45, darkRisk: 35, hiFirewall: 40, hiEndpoint: 25, hiMail: 20 },
          { week: 'Mar 2024', surfaceScan: 42, darkRisk: 32, hiFirewall: 38, hiEndpoint: 22, hiMail: 18 },
          { week: 'Mag 2024', surfaceScan: 38, darkRisk: 28, hiFirewall: 35, hiEndpoint: 20, hiMail: 16 },
          { week: 'Lug 2024', surfaceScan: 35, darkRisk: 25, hiFirewall: 30, hiEndpoint: 18, hiMail: 14 },
          { week: 'Set 2024', surfaceScan: 28, darkRisk: 22, hiFirewall: 25, hiEndpoint: 15, hiMail: 12 },
          { week: 'Nov 2024', surfaceScan: 22, darkRisk: 18, hiFirewall: 20, hiEndpoint: 12, hiMail: 9 },
          { week: 'Gen 2025', surfaceScan: 14, darkRisk: 12, hiFirewall: 16, hiEndpoint: 8, hiMail: 6 }
        ];
      case '3m':
        return [
          { week: 'Ott', surfaceScan: 25, darkRisk: 20, hiFirewall: 22, hiEndpoint: 14, hiMail: 10 },
          { week: 'Nov', surfaceScan: 20, darkRisk: 16, hiFirewall: 18, hiEndpoint: 12, hiMail: 8 },
          { week: 'Dic', surfaceScan: 18, darkRisk: 14, hiFirewall: 16, hiEndpoint: 10, hiMail: 7 },
          { week: 'Gen', surfaceScan: 14, darkRisk: 12, hiFirewall: 14, hiEndpoint: 8, hiMail: 6 }
        ];
      case '1m':
        return [
          { week: 'Sett 1', surfaceScan: 18, darkRisk: 14, hiFirewall: 16, hiEndpoint: 10, hiMail: 7 },
          { week: 'Sett 2', surfaceScan: 16, darkRisk: 13, hiFirewall: 15, hiEndpoint: 9, hiMail: 7 },
          { week: 'Sett 3', surfaceScan: 15, darkRisk: 12, hiFirewall: 14, hiEndpoint: 8, hiMail: 6 },
          { week: 'Sett 4', surfaceScan: 14, darkRisk: 12, hiFirewall: 14, hiEndpoint: 8, hiMail: 6 }
        ];
      default: // 6m
        return [
          { week: 'Ago', surfaceScan: 35, darkRisk: 28, hiFirewall: 30, hiEndpoint: 18, hiMail: 14 },
          { week: 'Set', surfaceScan: 28, darkRisk: 22, hiFirewall: 25, hiEndpoint: 15, hiMail: 12 },
          { week: 'Ott', surfaceScan: 22, darkRisk: 18, hiFirewall: 20, hiEndpoint: 12, hiMail: 9 },
          { week: 'Nov', surfaceScan: 18, darkRisk: 15, hiFirewall: 16, hiEndpoint: 10, hiMail: 8 },
          { week: 'Dic', surfaceScan: 16, darkRisk: 12, hiFirewall: 14, hiEndpoint: 9, hiMail: 7 },
          { week: 'Gen', surfaceScan: 14, darkRisk: 12, hiFirewall: 14, hiEndpoint: 8, hiMail: 6 }
        ];
    }
  };

  const threatsTimeData = getThreatsData(timeRange);

  // Distribuzione severità che cambia in base al timeRange
  const getSeverityData = (range: string) => {
    switch (range) {
      case '1y':
        return [
          { name: 'Critiche', value: 35, color: '#DC2626' },
          { name: 'Elevate', value: 45, color: '#EA580C' },
          { name: 'Medie', value: 28, color: '#EAB308' },
          { name: 'Basse', value: 22, color: '#16A34A' }
        ];
      case '3m':
        return [
          { name: 'Critiche', value: 22, color: '#DC2626' },
          { name: 'Elevate', value: 35, color: '#EA580C' },
          { name: 'Medie', value: 38, color: '#EAB308' },
          { name: 'Basse', value: 30, color: '#16A34A' }
        ];
      case '1m':
        return [
          { name: 'Critiche', value: 18, color: '#DC2626' },
          { name: 'Elevate', value: 32, color: '#EA580C' },
          { name: 'Medie', value: 40, color: '#EAB308' },
          { name: 'Basse', value: 32, color: '#16A34A' }
        ];
      default: // 6m
        return [
          { name: 'Critiche', value: 15, color: '#DC2626' },
          { name: 'Elevate', value: 28, color: '#EA580C' },
          { name: 'Medie', value: 42, color: '#EAB308' },
          { name: 'Basse', value: 35, color: '#16A34A' }
        ];
    }
  };

  const severityDistribution = getSeverityData(timeRange);

  const exportReport = () => {
    // Simulazione export report
    console.log('Exporting analytics report...');
  };

  const calculateTrend = (data: any[], field: string) => {
    const values = data.map(item => item[field]);
    const trend = values[values.length - 1] - values[0];
    return trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable';
  };

  const riskTrend = calculateTrend(riskTrendData, 'overall');
  const currentRisk = riskTrendData[riskTrendData.length - 1].overall;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Analisi & Trend</h1>
            <p className="text-gray-400">
              Monitoraggio dei trend di rischio, conformità NIS2 e minacce nel tempo
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">Ultimo mese</SelectItem>
                <SelectItem value="3m">Ultimi 3 mesi</SelectItem>
                <SelectItem value="6m">Ultimi 6 mesi</SelectItem>
                <SelectItem value="1y">Ultimo anno</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={exportReport} className="bg-primary text-primary-foreground">
              <Download className="w-4 h-4 mr-2" />
              Esporta Report
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Score Rischio Attuale</p>
                  <p className="text-2xl font-bold text-white">{currentData.riskScore}</p>
                  <div className="flex items-center mt-1">
                    {currentData.riskTrend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-red-500 mr-1" />
                    ) : currentData.riskTrend === 'down' ? (
                      <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
                    ) : null}
                    <span className={`text-sm ${currentData.riskTrend === 'up' ? 'text-red-500' : 'text-green-500'}`}>
                      {currentData.riskTrend === 'up' ? '+15%' : '-12%'} vs periodo precedente
                    </span>
                  </div>
                </div>
                <BarChart3 className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Conformità Assessment Media</p>
                  <p className="text-2xl font-bold text-white">
                    {Math.round(assessmentComplianceData.reduce((acc, cat) => acc + cat.compliance, 0) / assessmentComplianceData.length)}%
                  </p>
                  <Badge variant="secondary" className="mt-1">
                    Target: {Math.round(assessmentComplianceData.reduce((acc, cat) => acc + cat.target, 0) / assessmentComplianceData.length)}%
                  </Badge>
                </div>
                <Shield className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Minacce Totali</p>
                  <p className="text-2xl font-bold text-white">{currentData.threats}</p>
                  <div className="flex items-center mt-1">
                    {currentData.threatsTrend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-red-500 mr-1" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
                    )}
                    <span className={`text-sm ${currentData.threatsTrend === 'up' ? 'text-red-500' : 'text-green-500'}`}>
                      {currentData.threatsTrend === 'up' ? '+25%' : '-35%'} vs periodo precedente
                    </span>
                  </div>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Minacce Risolte</p>
                  <p className="text-2xl font-bold text-white">{currentData.resolved}</p>
                  <Badge variant="default" className="mt-1 bg-green-600">
                    {Math.round((currentData.resolved / currentData.threats) * 100)}% Risolte
                  </Badge>
                </div>
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Trend di Rischio nel Tempo */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-white">Trend di Rischio nel Tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={riskTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1F2937', 
                      border: '1px solid #374151', 
                      color: '#F9FAFB' 
                    }} 
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="critical" 
                    stackId="1" 
                    stroke="#DC2626" 
                    fill="#DC2626" 
                    name="Critiche"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="high" 
                    stackId="1" 
                    stroke="#EA580C" 
                    fill="#EA580C" 
                    name="Elevate"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="medium" 
                    stackId="1" 
                    stroke="#EAB308" 
                    fill="#EAB308" 
                    name="Medie"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="low" 
                    stackId="1" 
                    stroke="#16A34A" 
                    fill="#16A34A" 
                    name="Basse"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conformità NIS2 */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-white">Assessment NIS2/NIST/ISO - 14 Categorie</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={assessmentComplianceData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis 
                      dataKey="category" 
                      tick={{ fontSize: 10, fill: '#9CA3AF' }}
                      className="text-xs"
                    />
                    <PolarRadiusAxis 
                      angle={0} 
                      domain={[0, 100]} 
                      tick={{ fontSize: 10, fill: '#9CA3AF' }}
                      tickCount={6}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1F2937', 
                        border: '1px solid #374151', 
                        color: '#F9FAFB' 
                      }} 
                    />
                    <Radar 
                      name="Conformità Attuale" 
                      dataKey="compliance" 
                      stroke="#3B82F6" 
                      fill="#3B82F6" 
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                    <Radar 
                      name="Target" 
                      dataKey="target" 
                      stroke="#10B981" 
                      fill="#10B981" 
                      fillOpacity={0.1}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Distribuzione Severità */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-white">Distribuzione Severità Minacce</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {severityDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1F2937', 
                        border: '1px solid #374151', 
                        color: '#F9FAFB' 
                      }} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Minacce per Sorgente nel Tempo */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-white">Minacce per Sorgente nel Tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={threatsTimeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="week" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1F2937', 
                      border: '1px solid #374151', 
                      color: '#F9FAFB' 
                    }} 
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="surfaceScan" 
                    stroke="#8B5CF6" 
                    strokeWidth={2} 
                    name="SurfaceScan"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="darkRisk" 
                    stroke="#EF4444" 
                    strokeWidth={2} 
                    name="DarkRisk"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="hiFirewall" 
                    stroke="#3B82F6" 
                    strokeWidth={2} 
                    name="HiFirewall"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="hiEndpoint" 
                    stroke="#10B981" 
                    strokeWidth={2} 
                    name="HiEndpoint"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="hiMail" 
                    stroke="#F59E0B" 
                    strokeWidth={2} 
                    name="HiMail"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Analytics;