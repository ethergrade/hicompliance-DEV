import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Shield,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  Target,
  Users,
  Calendar,
  BarChart3,
  Plus,
  Edit,
  Trash2,
  Activity
} from 'lucide-react';

const ThreatManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');

  // Dati delle minacce
  const threats = [
    {
      id: 'THR-001',
      title: 'Tentativo di accesso non autorizzato',
      description: 'Rilevati multipli tentativi di login da IP sospetto 192.168.1.100',
      severity: 'Alta',
      status: 'In corso',
      source: 'HiFirewall',
      category: 'Accesso non autorizzato',
      assignedTo: 'Marco Rossi',
      createdAt: '2024-01-20 14:30',
      lastUpdate: '2024-01-20 16:45',
      affectedAssets: ['Server Web', 'Database'],
      indicators: ['192.168.1.100', 'multiple_failed_logins'],
      priority: 'P1'
    },
    {
      id: 'THR-002',
      title: 'Malware rilevato su endpoint',
      description: 'Trojan.Win32.Agent identificato su workstation utente',
      severity: 'Critica',
      status: 'Risolto',
      source: 'HiEndpoint',
      category: 'Malware',
      assignedTo: 'Sara Bianchi',
      createdAt: '2024-01-19 09:15',
      lastUpdate: '2024-01-19 18:30',
      affectedAssets: ['WS-USER-042'],
      indicators: ['Trojan.Win32.Agent', 'suspicious_process'],
      priority: 'P1'
    },
    {
      id: 'THR-003',
      title: 'Email phishing rilevata',
      description: 'Campagna phishing targeting credenziali utente',
      severity: 'Media',
      status: 'In analisi',
      source: 'HiMail',
      category: 'Phishing',
      assignedTo: 'Luca Verdi',
      createdAt: '2024-01-18 11:20',
      lastUpdate: '2024-01-20 08:15',
      affectedAssets: ['Mail Server', 'Utenti'],
      indicators: ['suspicious_email', 'credential_harvesting'],
      priority: 'P2'
    },
    {
      id: 'THR-004',
      title: 'Vulnerabilità critica identificata',
      description: 'CVE-2024-0001 rilevata su server applicativo',
      severity: 'Critica',
      status: 'Aperto',
      source: 'SurfaceScan',
      category: 'Vulnerabilità',
      assignedTo: 'Anna Neri',
      createdAt: '2024-01-20 07:45',
      lastUpdate: '2024-01-20 10:30',
      affectedAssets: ['APP-SERVER-01'],
      indicators: ['CVE-2024-0001', 'remote_code_execution'],
      priority: 'P1'
    },
    {
      id: 'THR-005',
      title: 'Attività sospetta nel dark web',
      description: 'Credenziali aziendali in vendita su marketplace illegale',
      severity: 'Alta',
      status: 'In corso',
      source: 'DarkRisk',
      category: 'Credential Leak',
      assignedTo: 'Paolo Gialli',
      createdAt: '2024-01-17 16:20',
      lastUpdate: '2024-01-20 14:00',
      affectedAssets: ['Credenziali utente'],
      indicators: ['credential_sale', 'dark_web_marketplace'],
      priority: 'P1'
    }
  ];

  // Statistiche delle minacce
  const threatStats = {
    total: threats.length,
    critical: threats.filter(t => t.severity === 'Critica').length,
    high: threats.filter(t => t.severity === 'Alta').length,
    medium: threats.filter(t => t.severity === 'Media').length,
    resolved: threats.filter(t => t.status === 'Risolto').length,
    inProgress: threats.filter(t => t.status === 'In corso').length,
    open: threats.filter(t => t.status === 'Aperto').length
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critica': return 'text-red-500';
      case 'Alta': return 'text-orange-500';
      case 'Media': return 'text-yellow-500';
      default: return 'text-green-500';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'Critica': return 'bg-red-600';
      case 'Alta': return 'bg-orange-600';
      case 'Media': return 'bg-yellow-600';
      default: return 'bg-green-600';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Risolto': return 'text-green-500';
      case 'In corso': return 'text-blue-500';
      case 'In analisi': return 'text-purple-500';
      case 'Aperto': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Risolto': return CheckCircle2;
      case 'In corso': return Clock;
      case 'In analisi': return Eye;
      case 'Aperto': return XCircle;
      default: return AlertTriangle;
    }
  };

  const filteredThreats = threats.filter(threat => {
    const matchesSearch = threat.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         threat.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         threat.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || threat.status === filterStatus;
    const matchesSeverity = filterSeverity === 'all' || threat.severity === filterSeverity;
    
    return matchesSearch && matchesStatus && matchesSeverity;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Threat Management</h1>
            <p className="text-gray-400">
              Gestione centralizzata delle minacce e intelligence di sicurezza
            </p>
          </div>
          <Button className="bg-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" />
            Nuova Minaccia
          </Button>
        </div>

        {/* Statistiche */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Minacce Totali</p>
                  <p className="text-2xl font-bold text-white">{threatStats.total}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Critiche/Alte</p>
                  <p className="text-2xl font-bold text-white">
                    {threatStats.critical + threatStats.high}
                  </p>
                  <div className="flex items-center mt-1">
                    <TrendingUp className="w-4 h-4 text-red-500 mr-1" />
                    <span className="text-sm text-red-500">Priorità alta</span>
                  </div>
                </div>
                <Shield className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">In Gestione</p>
                  <p className="text-2xl font-bold text-white">{threatStats.inProgress}</p>
                  <Badge variant="secondary" className="mt-1">
                    Attive
                  </Badge>
                </div>
                <Activity className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Risolte</p>
                  <p className="text-2xl font-bold text-white">{threatStats.resolved}</p>
                  <div className="flex items-center mt-1">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-500">
                      {Math.round((threatStats.resolved / threatStats.total) * 100)}%
                    </span>
                  </div>
                </div>
                <Target className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="threats" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="threats">Gestione Minacce</TabsTrigger>
            <TabsTrigger value="intelligence">Threat Intelligence</TabsTrigger>
            <TabsTrigger value="analytics">Analisi e Report</TabsTrigger>
          </TabsList>

          <TabsContent value="threats" className="space-y-6">
            {/* Filtri e Ricerca */}
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        placeholder="Cerca minacce per ID, titolo o descrizione..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Stato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti gli stati</SelectItem>
                      <SelectItem value="Aperto">Aperto</SelectItem>
                      <SelectItem value="In analisi">In analisi</SelectItem>
                      <SelectItem value="In corso">In corso</SelectItem>
                      <SelectItem value="Risolto">Risolto</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Severità" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte le severità</SelectItem>
                      <SelectItem value="Critica">Critica</SelectItem>
                      <SelectItem value="Alta">Alta</SelectItem>
                      <SelectItem value="Media">Media</SelectItem>
                      <SelectItem value="Bassa">Bassa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Lista Minacce */}
            <div className="space-y-4">
              {filteredThreats.map((threat) => {
                const StatusIcon = getStatusIcon(threat.status);
                return (
                  <Card key={threat.id} className="border-border bg-card hover:bg-card/80 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center space-x-3">
                            <Badge variant="outline" className="font-mono text-xs">
                              {threat.id}
                            </Badge>
                            <div className={`w-2 h-2 rounded-full ${getSeverityBadge(threat.severity)}`} />
                            <span className={`text-sm font-medium ${getSeverityColor(threat.severity)}`}>
                              {threat.severity.toUpperCase()}
                            </span>
                            <Badge variant="secondary">{threat.source}</Badge>
                            <Badge variant="outline">{threat.priority}</Badge>
                          </div>
                          
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-1">{threat.title}</h3>
                            <p className="text-gray-400 text-sm">{threat.description}</p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-400">Categoria: </span>
                              <span className="text-white">{threat.category}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Assegnato a: </span>
                              <span className="text-white">{threat.assignedTo}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Ultimo aggiornamento: </span>
                              <span className="text-white">{threat.lastUpdate}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <span className="text-sm text-gray-400">Asset coinvolti:</span>
                            {threat.affectedAssets.map((asset, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {asset}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col items-end space-y-3">
                          <div className="flex items-center space-x-2">
                            <StatusIcon className={`w-4 h-4 ${getStatusColor(threat.status)}`} />
                            <span className={`text-sm font-medium ${getStatusColor(threat.status)}`}>
                              {threat.status}
                            </span>
                          </div>
                          
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline">
                              <Eye className="w-4 h-4 mr-1" />
                              Dettagli
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="w-4 h-4 mr-1" />
                              Modifica
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="intelligence" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-white">Feed Intelligence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="p-3 border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary" className="bg-red-600">Critico</Badge>
                        <span className="text-xs text-gray-400">2 ore fa</span>
                      </div>
                      <p className="text-sm text-white mb-1">Nuova campagna ransomware LockBit targeting settore sanitario</p>
                      <p className="text-xs text-gray-400">Fonte: CISA Alert AA24-016A</p>
                    </div>
                    
                    <div className="p-3 border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary" className="bg-orange-600">Alto</Badge>
                        <span className="text-xs text-gray-400">5 ore fa</span>
                      </div>
                      <p className="text-sm text-white mb-1">Vulnerabilità zero-day in Apache Struts (CVE-2024-0002)</p>
                      <p className="text-xs text-gray-400">Fonte: MITRE CVE Database</p>
                    </div>
                    
                    <div className="p-3 border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary" className="bg-yellow-600">Medio</Badge>
                        <span className="text-xs text-gray-400">1 giorno fa</span>
                      </div>
                      <p className="text-sm text-white mb-1">Aumento attività phishing con tema fatturazione elettronica</p>
                      <p className="text-xs text-gray-400">Fonte: CERT-AGID</p>
                    </div>
                  </div>
                  
                  <Button variant="outline" className="w-full">
                    Visualizza tutti i feed
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-white">Indicatori di Compromissione</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="p-3 border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">IP Address</Badge>
                        <span className="text-xs text-gray-400">Confermato</span>
                      </div>
                      <p className="text-sm font-mono text-white">192.168.1.100</p>
                      <p className="text-xs text-gray-400">Associato a botnet Emotet</p>
                    </div>
                    
                    <div className="p-3 border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">Hash</Badge>
                        <span className="text-xs text-gray-400">Sospetto</span>
                      </div>
                      <p className="text-sm font-mono text-white">a1b2c3d4...</p>
                      <p className="text-xs text-gray-400">Variante Trojan.Agent</p>
                    </div>
                    
                    <div className="p-3 border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">Domain</Badge>
                        <span className="text-xs text-gray-400">Bloccato</span>
                      </div>
                      <p className="text-sm font-mono text-white">evil-domain.com</p>
                      <p className="text-xs text-gray-400">Command & Control server</p>
                    </div>
                  </div>
                  
                  <Button variant="outline" className="w-full">
                    Gestisci IOC
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-white">Trend Minacce per Categoria</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Malware</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-700 rounded-full h-2">
                          <div className="bg-red-500 h-2 rounded-full" style={{ width: '75%' }}></div>
                        </div>
                        <span className="text-sm text-white">15</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Phishing</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-700 rounded-full h-2">
                          <div className="bg-orange-500 h-2 rounded-full" style={{ width: '60%' }}></div>
                        </div>
                        <span className="text-sm text-white">12</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Vulnerabilità</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-700 rounded-full h-2">
                          <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '45%' }}></div>
                        </div>
                        <span className="text-sm text-white">9</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Accesso non autorizzato</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-700 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: '30%' }}></div>
                        </div>
                        <span className="text-sm text-white">6</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-white">Tempo di Risoluzione</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">MTTR Critico</span>
                      <span className="text-sm text-white">2.5 ore</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">MTTR Alto</span>
                      <span className="text-sm text-white">8.2 ore</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">MTTR Medio</span>
                      <span className="text-sm text-white">24.1 ore</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">SLA Rispettato</span>
                      <div className="flex items-center space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-green-500">94%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ThreatManagement;