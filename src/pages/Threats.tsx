import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  AlertTriangle, 
  Shield, 
  Search,
  Download,
  Eye,
  Calendar,
  TrendingUp,
  Globe,
  Filter
} from 'lucide-react';

interface Threat {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  score: number;
  source: 'HiFirewall' | 'HiEndpoint' | 'HiMail' | 'HiLog' | 'HiPatch' | 'HiMfa' | 'HiTrack' | 'SurfaceScan' | 'DarkRisk';
  asset: string;
  cve?: string;
  description: string;
  discoveredAt: string;
  status: 'active' | 'investigating' | 'mitigated' | 'resolved';
  category: string;
}

const Threats: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const allThreats: Threat[] = [
    {
      id: '1',
      title: 'Remote Code Execution Vulnerability',
      severity: 'critical',
      score: 95,
      source: 'SurfaceScan',
      asset: 'vpn.cliente1.com',
      cve: 'CVE-2024-0006',
      description: 'Critical vulnerability allowing remote code execution through VPN service',
      discoveredAt: '2024-07-03T10:30:00Z',
      status: 'active',
      category: 'Network Security'
    },
    {
      id: '2',
      title: 'Authentication Bypass',
      severity: 'critical',
      score: 92,
      source: 'SurfaceScan',
      asset: 'vpn.cliente1.com',
      cve: 'CVE-2024-0007',
      description: 'Authentication mechanism can be bypassed, allowing unauthorized access',
      discoveredAt: '2024-07-03T09:15:00Z',
      status: 'investigating',
      category: 'Authentication'
    },
    {
      id: '3',
      title: 'Dark Web Credential Exposure',
      severity: 'high',
      score: 88,
      source: 'DarkRisk',
      asset: 'cliente1.com',
      description: 'Employee credentials found on dark web marketplace',
      discoveredAt: '2024-07-03T08:45:00Z',
      status: 'active',
      category: 'Data Breach'
    },
    {
      id: '4',
      title: 'Privilege Escalation',
      severity: 'high',
      score: 85,
      source: 'SurfaceScan',
      asset: 'vpn.cliente1.com',
      cve: 'CVE-2024-0009',
      description: 'Local privilege escalation vulnerability in VPN software',
      discoveredAt: '2024-07-03T07:20:00Z',
      status: 'mitigated',
      category: 'System Security'
    },
    {
      id: '5',
      title: 'Email Server Vulnerability',
      severity: 'high',
      score: 82,
      source: 'HiMail',
      asset: 'mail.cliente1.com',
      cve: 'CVE-2024-0003',
      description: 'Outdated mail server with known security vulnerabilities',
      discoveredAt: '2024-07-02T16:30:00Z',
      status: 'investigating',
      category: 'Email Security'
    },
    {
      id: '6',
      title: 'Information Disclosure',
      severity: 'medium',
      score: 75,
      source: 'SurfaceScan',
      asset: 'vpn.cliente1.com',
      cve: 'CVE-2024-0008',
      description: 'Sensitive information can be disclosed to unauthorized users',
      discoveredAt: '2024-07-02T14:15:00Z',
      status: 'active',
      category: 'Information Security'
    },
    {
      id: '7',
      title: 'Weak Encryption Protocol',
      severity: 'medium',
      score: 68,
      source: 'HiFirewall',
      asset: 'mail.cliente1.com',
      cve: 'CVE-2024-0004',
      description: 'Email server using deprecated encryption protocols',
      discoveredAt: '2024-07-02T12:00:00Z',
      status: 'resolved',
      category: 'Encryption'
    },
    {
      id: '8',
      title: 'Cross-Site Scripting',
      severity: 'medium',
      score: 62,
      source: 'SurfaceScan',
      asset: 'test.cliente1.com',
      cve: 'CVE-2024-0010',
      description: 'XSS vulnerability in test environment web application',
      discoveredAt: '2024-07-01T18:45:00Z',
      status: 'mitigated',
      category: 'Web Security'
    },
    {
      id: '9',
      title: 'Missing Security Headers',
      severity: 'low',
      score: 45,
      source: 'HiLog',
      asset: 'mail.cliente1.com',
      cve: 'CVE-2024-0005',
      description: 'Web server missing important security headers',
      discoveredAt: '2024-07-01T15:30:00Z',
      status: 'resolved',
      category: 'Web Security'
    },
    {
      id: '10',
      title: 'SSL Certificate Warning',
      severity: 'low',
      score: 38,
      source: 'SurfaceScan',
      asset: 'cliente1.com',
      cve: 'CVE-2024-0002',
      description: 'SSL certificate approaching expiration date',
      discoveredAt: '2024-07-01T10:15:00Z',
      status: 'investigating',
      category: 'SSL/TLS'
    }
  ];

  // Filter threats
  const filteredThreats = allThreats.filter(threat => {
    const matchesSearch = searchTerm === '' || 
      threat.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      threat.asset.toLowerCase().includes(searchTerm.toLowerCase()) ||
      threat.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      threat.cve?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      threat.category.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSeverity = severityFilter === 'all' || threat.severity === severityFilter;
    const matchesSource = sourceFilter === 'all' || threat.source === sourceFilter;
    const matchesStatus = statusFilter === 'all' || threat.status === statusFilter;
    
    return matchesSearch && matchesSeverity && matchesSource && matchesStatus;
  });

  // Sort by severity and score
  const sortedThreats = filteredThreats.sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const aSeverity = severityOrder[a.severity];
    const bSeverity = severityOrder[b.severity];
    
    if (aSeverity !== bSeverity) {
      return bSeverity - aSeverity;
    }
    return b.score - a.score;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600';
      case 'high': return 'text-orange-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'default';
      default: return 'outline';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return 'destructive';
      case 'investigating': return 'secondary';
      case 'mitigated': return 'default';
      case 'resolved': return 'default';
      default: return 'outline';
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'HiFirewall': return 'text-blue-600';
      case 'HiEndpoint': return 'text-green-600';
      case 'HiMail': return 'text-orange-600';
      case 'HiLog': return 'text-cyan-600';
      case 'HiPatch': return 'text-violet-600';
      case 'HiMfa': return 'text-pink-600';
      case 'HiTrack': return 'text-indigo-600';
      case 'SurfaceScan': return 'text-purple-500';
      case 'DarkRisk': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const exportThreats = () => {
    const csvContent = [
      ['ID', 'Titolo', 'Gravità', 'Score', 'Sorgente', 'Asset', 'CVE', 'Categoria', 'Stato', 'Data Scoperta'],
      ...sortedThreats.map(threat => [
        threat.id,
        threat.title,
        threat.severity,
        threat.score.toString(),
        threat.source,
        threat.asset,
        threat.cve || '',
        threat.category,
        threat.status,
        new Date(threat.discoveredAt).toLocaleDateString('it-IT')
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `minacce-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const criticalCount = allThreats.filter(t => t.severity === 'critical').length;
  const highCount = allThreats.filter(t => t.severity === 'high').length;
  const mediumCount = allThreats.filter(t => t.severity === 'medium').length;
  const lowCount = allThreats.filter(t => t.severity === 'low').length;
  const activeCount = allThreats.filter(t => t.status === 'active').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Gestione Minacce</h1>
            <p className="text-muted-foreground">
              Analisi completa delle minacce rilevate da tutti i servizi HiCompliance
            </p>
          </div>
          <Button onClick={exportThreats} className="bg-primary text-primary-foreground">
            <Download className="w-4 h-4 mr-2" />
            Esporta Report
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Totale Minacce</p>
                  <p className="text-2xl font-bold text-foreground">{allThreats.length}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Critiche</p>
                  <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Elevate</p>
                  <p className="text-2xl font-bold text-orange-500">{highCount}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Medie</p>
                  <p className="text-2xl font-bold text-yellow-500">{mediumCount}</p>
                </div>
                <Eye className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Basse</p>
                  <p className="text-2xl font-bold text-green-500">{lowCount}</p>
                </div>
                <Shield className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Attive</p>
                  <p className="text-2xl font-bold text-red-500">{activeCount}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter Bar */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row gap-4 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Cerca per titolo, asset, CVE o categoria..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Gravità" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte le gravità</SelectItem>
                    <SelectItem value="critical">Critica</SelectItem>
                    <SelectItem value="high">Elevata</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="low">Bassa</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Sorgente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte le sorgenti</SelectItem>
                    <SelectItem value="HiFirewall">HiFirewall</SelectItem>
                    <SelectItem value="HiEndpoint">HiEndpoint</SelectItem>
                    <SelectItem value="HiMail">HiMail</SelectItem>
                    <SelectItem value="HiLog">HiLog</SelectItem>
                    <SelectItem value="HiPatch">HiPatch</SelectItem>
                    <SelectItem value="HiMfa">HiMfa</SelectItem>
                    <SelectItem value="HiTrack">HiTrack</SelectItem>
                    <SelectItem value="SurfaceScan">SurfaceScan</SelectItem>
                    <SelectItem value="DarkRisk">DarkRisk</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Stato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli stati</SelectItem>
                    <SelectItem value="active">Attiva</SelectItem>
                    <SelectItem value="investigating">In analisi</SelectItem>
                    <SelectItem value="mitigated">Mitigata</SelectItem>
                    <SelectItem value="resolved">Risolta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Threats Summary */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Sintesi Minacce ({filteredThreats.length} trovate)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground mb-4">
              Minacce ordinate per priorità: dalla più critica alla meno grave
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Minaccia</TableHead>
                    <TableHead>Gravità</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Sorgente</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead>CVE</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Scoperta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedThreats.map((threat) => (
                    <TableRow key={threat.id} className="hover:bg-muted/50 border-b border-border">
                      <TableCell>
                        <div>
                          <div className="font-medium text-white">{threat.title}</div>
                          <div className="text-sm text-white/70 line-clamp-2">
                            {threat.description}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getSeverityBadge(threat.severity) as any} className={getSeverityColor(threat.severity)}>
                          {threat.severity.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-white">{threat.score}/100</span>
                      </TableCell>
                      <TableCell>
                        <span className={getSourceColor(threat.source)}>
                          {threat.source}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm text-white">{threat.asset}</span>
                      </TableCell>
                      <TableCell>
                        {threat.cve && (
                          <Badge variant="outline" className="font-mono text-xs border-white/30 text-white">
                            {threat.cve}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-white">{threat.category}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadge(threat.status) as any}>
                          {threat.status === 'active' ? 'Attiva' :
                           threat.status === 'investigating' ? 'In analisi' :
                           threat.status === 'mitigated' ? 'Mitigata' : 'Risolta'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-white">
                          {new Date(threat.discoveredAt).toLocaleDateString('it-IT')}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Threats;