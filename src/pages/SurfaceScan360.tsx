import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Globe, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Search,
  Eye,
  TrendingUp
} from 'lucide-react';

const SurfaceScan360: React.FC = () => {
  const [openTooltip, setOpenTooltip] = useState<number | null>(null);
  
  const publicAssets = [
    { ip: '203.0.113.10', hostname: 'cliente1.com', score: 95, risk: 'Basso', status: 'Sicuro', ports: [80, 443], services: ['HTTP', 'HTTPS'] },
    { ip: '203.0.113.25', hostname: 'mail.cliente1.com', score: 78, risk: 'Medio', status: 'Attenzione', ports: [25, 587, 993], services: ['SMTP', 'IMAPS'] },
    { ip: '203.0.113.45', hostname: 'vpn.cliente1.com', score: 45, risk: 'Alto', status: 'Critico', ports: [1723, 443], services: ['PPTP', 'OpenVPN'] },
    { ip: '203.0.113.67', hostname: 'api.cliente1.com', score: 88, risk: 'Basso', status: 'Sicuro', ports: [443, 8080], services: ['HTTPS', 'API'] },
    { ip: '203.0.113.89', hostname: 'ftp.cliente1.com', score: 62, risk: 'Medio', status: 'Attenzione', ports: [21, 22], services: ['FTP', 'SSH'] },
  ];

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
            <Button className="bg-primary text-primary-foreground">
              <Search className="w-4 h-4 mr-2" />
              Nuova Scansione
            </Button>
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

          {/* Public Assets Table */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Asset IP Pubblici Monitorati</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {publicAssets.map((asset, index) => (
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