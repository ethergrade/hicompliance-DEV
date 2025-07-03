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
  Cell
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

  // Dati trend di rischio nel tempo
  const riskTrendData = [
    { month: 'Gen', critical: 12, high: 24, medium: 45, low: 18, overall: 85 },
    { month: 'Feb', critical: 8, high: 28, medium: 42, low: 22, overall: 78 },
    { month: 'Mar', critical: 15, high: 32, medium: 38, low: 25, overall: 88 },
    { month: 'Apr', critical: 6, high: 26, medium: 44, low: 24, overall: 72 },
    { month: 'Mag', critical: 10, high: 30, medium: 40, low: 20, overall: 82 },
    { month: 'Giu', critical: 4, high: 22, medium: 46, low: 28, overall: 68 }
  ];

  // Dati conformità NIS2
  const nis2ComplianceData = [
    { category: 'Governance', compliance: 85, target: 90 },
    { category: 'Risk Management', compliance: 78, target: 85 },
    { category: 'Incident Response', compliance: 92, target: 95 },
    { category: 'Business Continuity', compliance: 70, target: 80 },
    { category: 'Supply Chain', compliance: 65, target: 75 },
    { category: 'Cybersecurity Measures', compliance: 88, target: 90 },
    { category: 'Human Resources', compliance: 82, target: 85 },
    { category: 'Asset Management', compliance: 75, target: 80 }
  ];

  // Dati minacce nel tempo
  const threatsTimeData = [
    { week: 'Sett 1', surfaceScan: 12, darkRisk: 8, hiFirewall: 15, hiEndpoint: 6, hiMail: 4 },
    { week: 'Sett 2', surfaceScan: 18, darkRisk: 12, hiFirewall: 10, hiEndpoint: 8, hiMail: 7 },
    { week: 'Sett 3', surfaceScan: 8, darkRisk: 15, hiFirewall: 20, hiEndpoint: 12, hiMail: 5 },
    { week: 'Sett 4', surfaceScan: 22, darkRisk: 6, hiFirewall: 8, hiEndpoint: 15, hiMail: 9 },
    { week: 'Sett 5', surfaceScan: 14, darkRisk: 20, hiFirewall: 12, hiEndpoint: 4, hiMail: 6 },
    { week: 'Sett 6', surfaceScan: 10, darkRisk: 18, hiFirewall: 16, hiEndpoint: 10, hiMail: 8 }
  ];

  // Distribuzione severità minacce
  const severityDistribution = [
    { name: 'Critiche', value: 15, color: '#DC2626' },
    { name: 'Elevate', value: 28, color: '#EA580C' },
    { name: 'Medie', value: 42, color: '#EAB308' },
    { name: 'Basse', value: 35, color: '#16A34A' }
  ];

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
                  <p className="text-2xl font-bold text-white">{currentRisk}</p>
                  <div className="flex items-center mt-1">
                    {riskTrend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-red-500 mr-1" />
                    ) : riskTrend === 'down' ? (
                      <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
                    ) : null}
                    <span className={`text-sm ${riskTrend === 'up' ? 'text-red-500' : 'text-green-500'}`}>
                      {riskTrend === 'up' ? '+5%' : '-8%'} vs mese scorso
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
                  <p className="text-sm text-gray-400">Conformità NIS2 Media</p>
                  <p className="text-2xl font-bold text-white">79%</p>
                  <Badge variant="secondary" className="mt-1">
                    Target: 85%
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
                  <p className="text-2xl font-bold text-white">120</p>
                  <div className="flex items-center mt-1">
                    <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-500">-12% questa settimana</span>
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
                  <p className="text-2xl font-bold text-white">94</p>
                  <Badge variant="default" className="mt-1 bg-green-600">
                    78% Risolte
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
              <CardTitle className="text-white">Conformità Direttiva NIS2</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={nis2ComplianceData} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" domain={[0, 100]} stroke="#9CA3AF" />
                    <YAxis dataKey="category" type="category" width={120} stroke="#9CA3AF" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1F2937', 
                        border: '1px solid #374151', 
                        color: '#F9FAFB' 
                      }} 
                    />
                    <Bar dataKey="compliance" fill="#3B82F6" name="Attuale" />
                    <Bar dataKey="target" fill="#10B981" name="Target" />
                  </BarChart>
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