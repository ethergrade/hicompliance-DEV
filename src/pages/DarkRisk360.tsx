import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  AlertTriangle, 
  Eye, 
  UserX,
  CreditCard,
  Mail,
  Lock,
  TrendingDown
} from 'lucide-react';
import { AlertBellButton } from '@/components/dark-risk/AlertBellButton';
import { AlertConfigDialog } from '@/components/dark-risk/AlertConfigDialog';
import { useDarkRiskAlerts } from '@/hooks/useDarkRiskAlerts';

const DarkRisk360: React.FC = () => {
  const { alerts, createAlert } = useDarkRiskAlerts();
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  
  const activeAlertsCount = alerts.filter(a => a.is_active).length;
  
  const darkWebThreats = [
    { 
      type: 'Credenziali Compromesse', 
      severity: 'Critico', 
      count: 24, 
      description: 'Email e password trovate sul dark web',
      icon: UserX
    },
    { 
      type: 'Dati Carte di Credito', 
      severity: 'Alto', 
      count: 8, 
      description: 'Informazioni di pagamento in vendita',
      icon: CreditCard
    },
    { 
      type: 'Database Leak', 
      severity: 'Critico', 
      count: 3, 
      description: 'Database aziendali compromessi',
      icon: Shield
    },
    { 
      type: 'Email Compromise', 
      severity: 'Medio', 
      count: 12, 
      description: 'Account email compromessi',
      icon: Mail
    },
  ];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critico': return 'text-red-500';
      case 'Alto': return 'text-orange-500';
      case 'Medio': return 'text-yellow-500';
      case 'Basso': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'Critico': return 'destructive';
      case 'Alto': return 'destructive';
      case 'Medio': return 'secondary';
      case 'Basso': return 'default';
      default: return 'outline';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">DarkRisk360</h1>
            <p className="text-muted-foreground">
              Monitoraggio minacce nel dark web e mercati illegali
            </p>
          </div>
          <Button className="bg-primary text-primary-foreground">
            <Eye className="w-4 h-4 mr-2" />
            Scansione Deep Web
          </Button>
        </div>

        {/* Threat Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">Minacce Attive</p>
                    <AlertBellButton
                      alertCount={activeAlertsCount}
                      onClick={() => setAlertDialogOpen(true)}
                    />
                  </div>
                  <p className="text-2xl font-bold text-red-500">47</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">Credenziali Leak</p>
                    <AlertBellButton
                      alertCount={activeAlertsCount}
                      onClick={() => setAlertDialogOpen(true)}
                    />
                  </div>
                  <p className="text-2xl font-bold text-orange-500">24</p>
                </div>
                <UserX className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Domini Monitorati</p>
                  <p className="text-2xl font-bold text-primary">156</p>
                </div>
                <Shield className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Punteggio Rischio</p>
                  <p className="text-2xl font-bold text-red-500">85</p>
                </div>
                <TrendingDown className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Threats */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Minacce Rilevate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {darkWebThreats.map((threat, index) => {
                const IconComponent = threat.icon;
                return (
                  <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="p-2 rounded-lg bg-red-500/10">
                        <IconComponent className="w-5 h-5 text-red-500" />
                      </div>
                      <div>
                        <h4 className="font-medium">{threat.type}</h4>
                        <p className="text-sm text-muted-foreground">
                          {threat.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-2xl font-bold">
                        <span className={getSeverityColor(threat.severity)}>
                          {threat.count}
                        </span>
                      </div>
                      <Badge variant={getSeverityBadge(threat.severity) as any}>
                        {threat.severity}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Alert Recenti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                'Nuove credenziali trovate per dominio cliente1.com',
                'Database leak rilevato su forum underground',
                'Aumento attività di phishing verso il brand aziendale',
                'Credenziali admin vendute su marketplace dark web'
              ].map((alert, index) => (
                <div key={index} className="flex items-center space-x-3 p-3 rounded-lg bg-muted/30">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-sm">{alert}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {index + 1}h fa
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <AlertConfigDialog
          open={alertDialogOpen}
          onOpenChange={setAlertDialogOpen}
          onSubmit={createAlert}
          mode="create"
        />
      </div>
    </DashboardLayout>
  );
};

export default DarkRisk360;