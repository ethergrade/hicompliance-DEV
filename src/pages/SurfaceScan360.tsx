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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  Network,
  TrendingDown,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';

const SurfaceScan360: React.FC = () => {
  const [openTooltip, setOpenTooltip] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [monthlyMonitoring, setMonthlyMonitoring] = useState(false);
  
  // Collapsible states for legends
  const [cveCollegendOpen, setCveLegendOpen] = useState(false);
  const [epssLegendOpen, setEpssLegendOpen] = useState(false);
  
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

  // Helper function to get EPSS risk level and color
  const getEPSSRiskLevel = (score: number) => {
    if (score < 4) return { level: 'Basso', color: '#10b981' }; // Green
    if (score < 7) return { level: 'Medio', color: '#f59e0b' }; // Orange (more visible)
    return { level: 'Alto', color: '#ef4444' }; // Red
  };

  // Custom dot component for dynamic coloring
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    const riskInfo = getEPSSRiskLevel(payload.epss_score);
    
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={riskInfo.color}
        stroke="hsl(var(--background))"
        strokeWidth={2}
      />
    );
  };

  // Custom active dot component
  const CustomActiveDot = (props: any) => {
    const { cx, cy, payload } = props;
    const riskInfo = getEPSSRiskLevel(payload.epss_score);
    
    return (
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill={riskInfo.color}
        stroke="hsl(var(--background))"
        strokeWidth={3}
      />
    );
  };

  // Custom EPSS tooltip component
  const EPSSTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const currentScore = data.value;
      const currentIndex = monthlyData.findIndex(item => item.mese === label);
      const previousScore = currentIndex > 0 ? monthlyData[currentIndex - 1].epss_score : null;
      const variation = previousScore ? (currentScore - previousScore).toFixed(1) : null;
      const riskInfo = getEPSSRiskLevel(currentScore);
      
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <div className="font-medium text-foreground mb-2">{label} 2024</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: riskInfo.color }}
              />
              <span className="text-sm text-foreground font-medium">
                EPSS Score: {currentScore}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Livello di rischio: <span style={{ color: riskInfo.color }}>{riskInfo.level}</span>
            </div>
            {variation && (
              <div className="text-xs text-muted-foreground">
                Variazione: {parseFloat(variation) > 0 ? '+' : ''}{variation} vs mese precedente
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
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

                {/* CVE Timeline with Collapsible Legend */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle>CVE Critiche vs Risolte</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-[250px]">
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

                    {/* Collapsible CVE Legend */}
                    <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border">
                      {/* Always visible color legend */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-3 bg-destructive rounded flex-shrink-0"></div>
                          <span className="text-sm font-medium">CVE Critiche</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-3 bg-primary rounded flex-shrink-0"></div>
                          <span className="text-sm font-medium">CVE Risolte</span>
                        </div>
                      </div>

                      {/* Collapsible detailed legend */}
                      <Collapsible open={cveCollegendOpen} onOpenChange={setCveLegendOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between text-sm p-2">
                            <span className="flex items-center gap-2">
                              <BarChart3 className="w-4 h-4" />
                              Dettagli Legenda
                            </span>
                            {cveCollegendOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-4 mt-3">
                          {/* CVE Definition */}
                          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-purple-800 mb-1">📋 Cosa sono le CVE?</p>
                                <p className="text-xs text-purple-700">
                                  Sistema di identificazione standardizzato per vulnerabilità di sicurezza note. 
                                  Ogni CVE ha un ID univoco e descrive una specifica falla di sicurezza.
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Trend Indicators */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                              <TrendingDown className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <div>
                                <span className="text-sm font-medium text-green-800">CVE Critiche ↓</span>
                                <div className="text-xs text-green-600">Tendenza positiva</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                              <TrendingUp className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              <div>
                                <span className="text-sm font-medium text-blue-800">CVE Risolte ↑</span>
                                <div className="text-xs text-blue-600">Attività remediation</div>
                              </div>
                            </div>
                          </div>

                          {/* Monthly Comparison */}
                          <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                            <div className="flex items-start gap-2">
                              <BarChart3 className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-orange-800 mb-1">💡 Confronto Mensile</p>
                                <p className="text-xs text-orange-700">
                                  Il rapporto ideale mostra CVE critiche in diminuzione e CVE risolte stabili o in aumento, 
                                  indicando un miglioramento continuo della postura di sicurezza.
                                </p>
                              </div>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>

                    {/* Current Status */}
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        <span className="font-medium">Stato Attuale:</span>
                        <span className="text-primary">20 CVE risolte a Dicembre</span>
                        <span className="text-destructive">vs 5 critiche attive</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Enhanced EPSS Score Timeline with Collapsible Legend */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-chart-3" />
                      EPSS Score Mensile
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Exploit Prediction Scoring System - predice la probabilità di sfruttamento delle vulnerabilità
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="mese" className="text-muted-foreground" />
                          <YAxis 
                            className="text-muted-foreground" 
                            domain={[0, 10]}
                            ticks={[0, 2, 4, 6, 8, 10]}
                          />
                          <defs>
                            <linearGradient id="epssGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <RechartsTooltip content={<EPSSTooltip />} />
                          <Line 
                            type="monotone" 
                            dataKey="epss_score" 
                            stroke="hsl(var(--chart-3))" 
                            strokeWidth={3}
                            dot={<CustomDot />}
                            activeDot={<CustomActiveDot />}
                            fill="url(#epssGradient)"
                          />
                          <Line 
                            type="monotone" 
                            dataKey={() => 4} 
                            stroke="#9ca3af" 
                            strokeWidth={1}
                            strokeDasharray="5 5"
                            dot={false}
                            activeDot={false}
                          />
                          <Line 
                            type="monotone" 
                            dataKey={() => 7} 
                            stroke="#9ca3af" 
                            strokeWidth={1}
                            strokeDasharray="5 5"
                            dot={false}
                            activeDot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                    
                    {/* Collapsible EPSS Legend */}
                    <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border">
                      {/* Always visible risk levels */}
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-green-500 flex-shrink-0"></div>
                          <span className="text-sm font-medium text-green-800">Basso &lt; 4.0</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-orange-500 flex-shrink-0"></div>
                          <span className="text-sm font-medium text-orange-800">Medio 4.0-7.0</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-red-500 flex-shrink-0"></div>
                          <span className="text-sm font-medium text-red-800">Alto &gt; 7.0</span>
                        </div>
                      </div>

                      {/* Collapsible detailed legend */}
                      <Collapsible open={epssLegendOpen} onOpenChange={setEpssLegendOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between text-sm p-2">
                            <span className="flex items-center gap-2">
                              <BarChart3 className="w-4 h-4" />
                              Dettagli Legenda
                            </span>
                            {epssLegendOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-4 mt-3">
                          {/* Chart Elements Legend */}
                          <div className="flex flex-wrap items-center gap-6 p-3 bg-gray-50 rounded-lg border">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-1 bg-chart-3 rounded"></div>
                              <span className="text-sm">Trend EPSS mensile</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-0.5 border-t-2 border-dashed border-gray-400"></div>
                              <span className="text-sm">Soglie di rischio</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full border-2 border-background bg-chart-3"></div>
                              <span className="text-sm">Punti colorati per rischio</span>
                            </div>
                          </div>
                          
                          {/* EPSS Explanation */}
                          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-blue-800 mb-1">📈 Cos'è l'EPSS Score?</p>
                                <p className="text-xs text-blue-700">
                                  Punteggio da 0 a 10 che indica la probabilità percentuale di sfruttamento 
                                  di una vulnerabilità nei prossimi 30 giorni. Più basso è meglio.
                                </p>
                              </div>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>

                    {/* Current Status */}
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <Activity className="w-4 h-4 text-chart-3" />
                        <span className="font-medium">Trend Attuale:</span>
                        <span className="text-green-500">↓ Miglioramento (-1.6 vs Gen 2024)</span>
                      </div>
                    </div>
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
                          <RechartsTooltip />
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
