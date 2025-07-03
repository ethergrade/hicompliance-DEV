import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  const scanResults = [
    { domain: 'cliente1.com', status: 'Sicuro', issues: 0, score: 95 },
    { domain: 'mail.cliente1.com', status: 'Attenzione', issues: 3, score: 78 },
    { domain: 'vpn.cliente1.com', status: 'Critico', issues: 8, score: 45 },
    { domain: 'api.cliente1.com', status: 'Sicuro', issues: 1, score: 88 },
  ];

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

  return (
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
                  <p className="text-sm text-muted-foreground">Ultima Scansione</p>
                  <p className="text-sm font-medium text-foreground">2 ore fa</p>
                </div>
                <Eye className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

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
                    <Button variant="outline" size="sm">
                      <Eye className="w-4 h-4 mr-1" />
                      Dettagli
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SurfaceScan360;