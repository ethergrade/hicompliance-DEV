import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Globe, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Search,
  Eye,
  TrendingUp,
  Filter,
  Calendar,
  BarChart3,
  Activity,
  Network
} from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const SurfaceScan360: React.FC = () => {
  const [openTooltip, setOpenTooltip] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [monthlyMonitoring, setMonthlyMonitoring] = useState(false);
  const assetsPerPage = 5;
  
  const allPublicAssets = [
    { ip: '203.0.113.10', hostname: 'cliente1.com', score: 95, risk: 'Basso', status: 'Sicuro', ports: [80, 443], services: ['HTTP', 'HTTPS'] },
    { ip: '203.0.113.25', hostname: 'mail.cliente1.com', score: 78, risk: 'Medio', status: 'Attenzione', ports: [25, 587, 993], services: ['SMTP', 'IMAPS'] },
    { ip: '203.0.113.45', hostname: 'vpn.cliente1.com', score: 45, risk: 'Alto', status: 'Critico', ports: [1723, 443], services: ['PPTP', 'OpenVPN'] },
    { ip: '203.0.113.67', hostname: 'api.cliente1.com', score: 88, risk: 'Basso', status: 'Sicuro', ports: [443, 8080], services: ['HTTPS', 'API'] },
    { ip: '203.0.113.89', hostname: 'ftp.cliente1.com', score: 62, risk: 'Medio', status: 'Attenzione', ports: [21, 22], services: ['FTP', 'SSH'] },
    { ip: '203.0.113.102', hostname: 'db.cliente1.com', score: 72, risk: 'Medio', status: 'Attenzione', ports: [3306, 5432], services: ['MySQL', 'PostgreSQL'] },
    { ip: '203.0.113.123', hostname: 'cdn.cliente1.com', score: 91, risk: 'Basso', status: 'Sicuro', ports: [80, 443], services: ['HTTP', 'HTTPS'] },
    { ip: '203.0.113.144', hostname: 'test.cliente1.com', score: 55, risk: 'Alto', status: 'Critico', ports: [80, 8080], services: ['HTTP', 'Apache'] },
    { ip: '203.0.113.165', hostname: 'backup.cliente1.com', score: 82, risk: 'Basso', status: 'Sicuro', ports: [22, 873], services: ['SSH', 'rsync'] },
    { ip: '203.0.113.186', hostname: 'monitor.cliente1.com', score: 77, risk: 'Medio', status: 'Attenzione', ports: [443, 9090], services: ['HTTPS', 'Prometheus'] },
  ];

  // Filter assets based on search and filters
  const filteredAssets = allPublicAssets.filter(asset => {
    const matchesSearch = searchTerm === '' || 
      asset.ip.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.services.some(service => service.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || asset.status === statusFilter;
    const matchesRisk = riskFilter === 'all' || asset.risk === riskFilter;
    
    return matchesSearch && matchesStatus && matchesRisk;
  });

  const totalPages = Math.ceil(filteredAssets.length / assetsPerPage);
  const indexOfLastAsset = currentPage * assetsPerPage;
  const indexOfFirstAsset = indexOfLastAsset - assetsPerPage;
  const currentAssets = filteredAssets.slice(indexOfFirstAsset, indexOfLastAsset);

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, riskFilter]);

  const scanResults = [
    { 
      domain: 'cliente1.com', 
      status: 'Sicuro', 
      issues: 0, 
      score: 95,
      cves: [
        { id: 'CVE-2024-0001', severity: 'low', description: 'Minor configuration issue' },
        { id: 'CVE-2024-0002', severity: 'low', description: 'SSL certificate warning' }
      ]
    },
    { 
      domain: 'mail.cliente1.com', 
      status: 'Attenzione', 
      issues: 3, 
      score: 78,
      cves: [
        { id: 'CVE-2024-0003', severity: 'medium', description: 'Outdated mail server version' },
        { id: 'CVE-2024-0004', severity: 'medium', description: 'Weak encryption protocol' },
        { id: 'CVE-2024-0005', severity: 'low', description: 'Missing security header' }
      ]
    },
    { 
      domain: 'vpn.cliente1.com', 
      status: 'Critico', 
      issues: 8, 
      score: 45,
      cves: [
        { id: 'CVE-2024-0006', severity: 'high', description: 'Remote code execution vulnerability' },
        { id: 'CVE-2024-0007', severity: 'high', description: 'Authentication bypass' },
        { id: 'CVE-2024-0008', severity: 'medium', description: 'Information disclosure' },
        { id: 'CVE-2024-0009', severity: 'medium', description: 'Privilege escalation' },
        { id: 'CVE-2024-0010', severity: 'low', description: 'Cross-site scripting' }
      ]
    },
    { 
      domain: 'api.cliente1.com', 
      status: 'Sicuro', 
      issues: 1, 
      score: 88,
      cves: [
        { id: 'CVE-2024-0011', severity: 'low', description: 'Rate limiting not configured' }
      ]
    },
  ];

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Basso': return 'text-green-500';
      case 'Medio': return 'text-yellow-500';
      case 'Alto': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Sicuro': return 'text-green-500';
      case 'Attenzione': return 'text-yellow-500';
      case 'Critico': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Sicuro': return 'default';
      case 'Attenzione': return 'secondary';
      case 'Critico': return 'destructive';
      default: return 'outline';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-orange-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  // Monthly monitoring data
  const monthlyData = [
    { mese: 'Gen', porte_aperte: 45, porte_chiuse: 23, cve_critiche: 12, cve_risolte: 8, epss_score: 6.2 },
    { mese: 'Feb', porte_aperte: 52, porte_chiuse: 18, cve_critiche: 15, cve_risolte: 11, epss_score: 6.8 },
    { mese: 'Mar', porte_aperte: 48, porte_chiuse: 25, cve_critiche: 9, cve_risolte: 14, epss_score: 5.9 },
    { mese: 'Apr', porte_aperte: 41, porte_chiuse: 32, cve_critiche: 7, cve_risolte: 18, epss_score: 5.1 },
    { mese: 'Mag', porte_aperte: 39, porte_chiuse: 34, cve_critiche: 8, cve_risolte: 16, epss_score: 5.4 },
    { mese: 'Giu', porte_aperte: 43, porte_chiuse: 30, cve_critiche: 11, cve_risolte: 13, epss_score: 5.8 },
    { mese: 'Lug', porte_aperte: 46, porte_chiuse: 27, cve_critiche: 13, cve_risolte: 10, epss_score: 6.1 },
    { mese: 'Ago', porte_aperte: 44, porte_chiuse: 29, cve_critiche: 10, cve_risolte: 15, epss_score: 5.7 },
    { mese: 'Set', porte_aperte: 38, porte_chiuse: 35, cve_critiche: 6, cve_risolte: 19, epss_score: 4.9 },
    { mese: 'Ott', porte_aperte: 42, porte_chiuse: 31, cve_critiche: 9, cve_risolte: 16, epss_score: 5.5 },
    { mese: 'Nov', porte_aperte: 40, porte_chiuse: 33, cve_critiche: 8, cve_risolte: 17, epss_score: 5.2 },
    { mese: 'Dic', porte_aperte: 37, porte_chiuse: 36, cve_critiche: 5, cve_risolte: 20, epss_score: 4.6 }
  ];

  const exposedServicesData = [
    { name: 'HTTP/HTTPS', value: 35, color: '#3b82f6' },
    { name: 'SSH', value: 25, color: '#10b981' },
    { name: 'FTP', value: 15, color: '#f59e0b' },
    { name: 'SMTP', value: 12, color: '#ef4444' },
    { name: 'DNS', value: 8, color: '#8b5cf6' },
    { name: 'Altro', value: 5, color: '#6b7280' }
  ];

  const riskTrendData = [
    { mese: 'Gen', rischio_alto: 15, rischio_medio: 28, rischio_basso: 57 },
    { mese: 'Feb', rischio_alto: 18, rischio_medio: 32, rischio_basso: 50 },
    { mese: 'Mar', rischio_alto: 12, rischio_medio: 35, rischio_basso: 53 },
    { mese: 'Apr', rischio_alto: 9, rischio_medio: 31, rischio_basso: 60 },
    { mese: 'Mag', rischio_alto: 11, rischio_medio: 29, rischio_basso: 60 },
    { mese: 'Giu', rischio_alto: 14, rischio_medio: 33, rischio_basso: 53 },
    { mese: 'Lug', rischio_alto: 16, rischio_medio: 36, rischio_basso: 48 },
    { mese: 'Ago', rischio_alto: 13, rischio_medio: 34, rischio_basso: 53 },
    { mese: 'Set', rischio_alto: 8, rischio_medio: 27, rischio_basso: 65 },
    { mese: 'Ott', rischio_alto: 10, rischio_medio: 30, rischio_basso: 60 },
    { mese: 'Nov', rischio_alto: 9, rischio_medio: 28, rischio_basso: 63 },
    { mese: 'Dic', rischio_alto: 6, rischio_medio: 25, rischio_basso: 69 }
  ];

  const chartConfig = {
    porte_aperte: {
      label: "Porte Aperte",
      color: "hsl(var(--destructive))",
    },
    porte_chiuse: {
      label: "Porte Chiuse", 
      color: "hsl(var(--primary))",
    },
    cve_critiche: {
      label: "CVE Critiche",
      color: "hsl(var(--destructive))",
    },
    cve_risolte: {
      label: "CVE Risolte",
      color: "hsl(var(--primary))",
    },
    epss_score: {
      label: "EPSS Score",
      color: "hsl(var(--chart-3))",
    }
  };

  const toggleTooltip = (index: number) => {
    setOpenTooltip(openTooltip === index ? null : index);
  };

  return (
    <TooltipProvider>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">SurfaceScan360</h1>
              <p className="text-muted-foreground">
                Scansione completa della superficie di attacco esterna
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Monitoraggio Mensile</span>
                <Switch
                  checked={monthlyMonitoring}
                  onCheckedChange={setMonthlyMonitoring}
                />
              </div>
              <Button className="bg-primary text-primary-foreground">
                <Search className="w-4 h-4 mr-2" />
                Nuova Scansione
              </Button>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Domini Monitorati</p>
                    <p className="text-2xl font-bold text-foreground">12</p>
                  </div>
                  <Globe className="w-8 h-8 text-primary" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Vulnerabilità Critiche</p>
                    <p className="text-2xl font-bold text-red-500">8</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Score Medio</p>
                    <p className="text-2xl font-bold text-yellow-500">76</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Asset Monitorati</p>
                    <p className="text-2xl font-bold text-foreground">34</p>
                  </div>
                  <Shield className="w-8 h-8 text-primary" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Ultima Scansione</p>
                    <p className="text-sm font-medium text-foreground">2 ore fa</p>
                  </div>
                  <Eye className="w-8 h-8 text-primary" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Monitoring Section */}
          {monthlyMonitoring && (
            <>
              {/* Monthly KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Nuove Porte Aperte</p>
                        <p className="text-2xl font-bold text-destructive">+12</p>
                        <p className="text-xs text-muted-foreground">Questo mese</p>
                      </div>
                      <Network className="w-8 h-8 text-destructive" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">CVE Risolte</p>
                        <p className="text-2xl font-bold text-primary">20</p>
                        <p className="text-xs text-muted-foreground">Dicembre 2024</p>
                      </div>
                      <CheckCircle className="w-8 h-8 text-primary" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">EPSS Score Medio</p>
                        <p className="text-2xl font-bold text-chart-3">4.6</p>
                        <p className="text-xs text-green-500">-0.6 vs ultimo mese</p>
                      </div>
                      <BarChart3 className="w-8 h-8 text-chart-3" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Trend Rischio</p>
                        <p className="text-2xl font-bold text-green-500">↓ 69%</p>
                        <p className="text-xs text-muted-foreground">Rischio basso</p>
                      </div>
                      <Activity className="w-8 h-8 text-green-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Ports Timeline */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle>Trend Porte Aperte/Chiuse</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="mese" className="text-muted-foreground" />
                          <YAxis className="text-muted-foreground" />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line 
                            type="monotone" 
                            dataKey="porte_aperte" 
                            stroke="hsl(var(--destructive))" 
                            strokeWidth={2}
                            dot={{ fill: "hsl(var(--destructive))" }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="porte_chiuse" 
                            stroke="hsl(var(--primary))" 
                            strokeWidth={2}
                            dot={{ fill: "hsl(var(--primary))" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* CVE Timeline */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle>CVE Critiche vs Risolte</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="mese" className="text-muted-foreground" />
                          <YAxis className="text-muted-foreground" />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="cve_critiche" fill="hsl(var(--destructive))" />
                          <Bar dataKey="cve_risolte" fill="hsl(var(--primary))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* EPSS Score Timeline */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle>EPSS Score Mensile</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="mese" className="text-muted-foreground" />
                          <YAxis className="text-muted-foreground" />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line 
                            type="monotone" 
                            dataKey="epss_score" 
                            stroke="hsl(var(--chart-3))" 
                            strokeWidth={2}
                            dot={{ fill: "hsl(var(--chart-3))" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* Exposed Services */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle>Servizi Maggiormente Esposti</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={exposedServicesData}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}%`}
                          >
                            {exposedServicesData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Risk Trend Analysis */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle>Analisi Trend Rischio Mensile</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={riskTrendData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="mese" className="text-muted-foreground" />
                        <YAxis className="text-muted-foreground" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="rischio_alto" stackId="stack" fill="hsl(var(--destructive))" />
                        <Bar dataKey="rischio_medio" stackId="stack" fill="hsl(var(--chart-2))" />
                        <Bar dataKey="rischio_basso" stackId="stack" fill="hsl(var(--primary))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </>
          )}

          {/* Search and Filter Bar */}
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Cerca per IP, hostname o servizio..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Stato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti gli stati</SelectItem>
                      <SelectItem value="Sicuro">Sicuro</SelectItem>
                      <SelectItem value="Attenzione">Attenzione</SelectItem>
                      <SelectItem value="Critico">Critico</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Rischio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti i rischi</SelectItem>
                      <SelectItem value="Basso">Basso</SelectItem>
                      <SelectItem value="Medio">Medio</SelectItem>
                      <SelectItem value="Alto">Alto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Public Assets Table */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Asset IP Pubblici Monitorati ({filteredAssets.length} trovati)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {currentAssets.map((asset, index) => (
                  <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Shield className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">{asset.ip}</h4>
                        <p className="text-sm text-muted-foreground">{asset.hostname}</p>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-xs text-muted-foreground">Porte:</span>
                          <div className="flex space-x-1">
                            {asset.ports.map((port, portIndex) => (
                              <Badge key={portIndex} variant="outline" className="text-xs">
                                {port}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-center">
                        <div className="text-sm text-muted-foreground">Servizi</div>
                        <div className="flex space-x-1 mt-1">
                          {asset.services.map((service, serviceIndex) => (
                            <Badge key={serviceIndex} variant="secondary" className="text-xs">
                              {service}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">Score: {asset.score}/100</div>
                        <div className={`text-xs font-medium ${getRiskColor(asset.risk)}`}>
                          Rischio: {asset.risk}
                        </div>
                        <Badge variant={getStatusBadge(asset.status) as any} className="mt-1">
                          {asset.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {totalPages > 1 && (
                <div className="mt-6 flex justify-center">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scan Results */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Risultati Scansione</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {scanResults.map((result, index) => (
                  <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Globe className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">{result.domain}</h4>
                        <p className="text-sm text-muted-foreground">
                          {result.issues} vulnerabilità rilevate
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">Punteggio: {result.score}/100</div>
                        <Badge variant={getStatusBadge(result.status) as any}>
                          {result.status}
                        </Badge>
                      </div>
                      <Tooltip open={openTooltip === index} onOpenChange={() => toggleTooltip(index)}>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => toggleTooltip(index)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Dettagli
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent 
                          side="left" 
                          className="w-80 p-4 bg-background border border-border shadow-lg z-50"
                          align="start"
                        >
                          <div className="space-y-3">
                            <h4 className="font-semibold text-foreground">CVE Rilevate per {result.domain}</h4>
                            {result.cves.length > 0 ? (
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {result.cves.map((cve, cveIndex) => (
                                  <div key={cveIndex} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                    <div 
                                      className={`w-3 h-3 rounded-full ${getSeverityColor(cve.severity)} mt-1 flex-shrink-0`}
                                    />
                                    <div className="flex-1">
                                      <div className="font-medium text-sm text-foreground">{cve.id}</div>
                                      <div className="text-xs text-muted-foreground capitalize">{cve.severity} severity</div>
                                      <div className="text-xs text-muted-foreground mt-1">{cve.description}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">Nessuna CVE rilevata</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    </TooltipProvider>
  );
};

export default SurfaceScan360;