import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Mail, 
  Users, 
  Network, 
  Cloud,
  Lock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Wrench
} from 'lucide-react';

interface Service {
  id: string;
  services: {
    name: string;
    code: string;
    description: string | null;
    icon: string | null;
  };
  status: 'active' | 'inactive' | 'maintenance' | 'alert';
  health_score: number | null;
  last_updated: string;
}

interface ServiceStatusCardProps {
  services: Service[];
}

const getServiceIcon = (code: string) => {
  const iconMap: Record<string, any> = {
    cloud_security: Cloud,
    endpoint_security: Lock,
    email_security: Mail,
    user_data_governance: Users,
    network_security: Network,
    microsoft_365: Shield,
    google_workplace: Shield,
    salesforce: Shield,
  };
  return iconMap[code] || Shield;
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'active':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'alert':
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case 'maintenance':
      return <Wrench className="w-4 h-4 text-yellow-500" />;
    case 'inactive':
      return <XCircle className="w-4 h-4 text-gray-500" />;
    default:
      return <CheckCircle className="w-4 h-4 text-gray-500" />;
  }
};

const getStatusBadge = (status: string) => {
  const variants: Record<string, any> = {
    active: 'default',
    alert: 'destructive',
    maintenance: 'secondary',
    inactive: 'outline',
  };
  
  const labels: Record<string, string> = {
    active: 'Connesso',
    alert: 'Allerta',
    maintenance: 'Manutenzione',
    inactive: 'Disconnesso',
  };

  return (
    <Badge variant={variants[status]} className="text-xs">
      {labels[status]}
    </Badge>
  );
};

const getIssueCount = (healthScore: number | null, status: string): number => {
  if (status === 'alert' && healthScore) {
    return Math.floor((100 - healthScore) / 10);
  }
  return 0;
};

export const ServiceStatusCard: React.FC<ServiceStatusCardProps> = ({ services }) => {
  const connectedServices = services.filter(s => s.status === 'active');
  const alertServices = services.filter(s => s.status === 'alert');
  
  // Calcola statistiche dalla screenshot
  const cloudSecurityIssues = alertServices.find(s => s.services.code === 'cloud_security') ? 8 : 0;
  const endpointSecurityIssues = alertServices.find(s => s.services.code === 'endpoint_security') ? 12 : 0;
  const userDataGovernanceIssues = alertServices.find(s => s.services.code === 'user_data_governance') ? 4 : 0;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Servizi Connessi</p>
                <p className="text-2xl font-bold text-green-500">{connectedServices.length}</p>
              </div>
              <Shield className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Allerta</p>
                <p className="text-2xl font-bold text-red-500">{alertServices.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Utenti Protetti</p>
                <p className="text-2xl font-bold text-cyan-500">98</p>
              </div>
              <Users className="w-8 h-8 text-cyan-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Security Categories */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Categorie di Sicurezza</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {services.slice(0, 5).map((service) => {
              const IconComponent = getServiceIcon(service.services.code);
              const issueCount = getIssueCount(service.health_score, service.status);
              const resolvedCount = service.services.code === 'cloud_security' ? 124 : 
                                  service.services.code === 'endpoint_security' ? 54 :
                                  service.services.code === 'email_security' ? 98 :
                                  service.services.code === 'user_data_governance' ? 54 : 0;
              
              return (
                <div
                  key={service.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <IconComponent className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium">{service.services.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {resolvedCount} resolved / 90d
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {service.status === 'alert' && (
                      <div className="text-2xl font-bold text-red-500 mb-1">
                        {issueCount}
                      </div>
                    )}
                    {getStatusIcon(service.status)}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Right Column - Connected Services */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Servizi Connessi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {connectedServices.slice(0, 3).map((service) => {
              const IconComponent = getServiceIcon(service.services.code);
              return (
                <div
                  key={service.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-card"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <IconComponent className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <h4 className="font-medium">{service.services.name}</h4>
                      <p className="text-sm text-green-500">Connesso</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">Aperto</span>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                </div>
              );
            })}
            
            {/* Threat Indicators */}
            <div className="mt-6 space-y-2">
              <h5 className="font-medium text-sm">Minacce Rilevate (Ultimi 90 giorni)</h5>
              {[
                { name: 'Malware', color: 'text-red-500' },
                { name: 'Abnormal Admin Activity', color: 'text-red-500' },
                { name: 'Suspected Bot Attacks', color: 'text-red-500' },
                { name: 'Access Permissions Violation', color: 'text-red-500' },
                { name: 'Mass Download', color: 'text-red-500' },
              ].map((threat, index) => (
                <div key={index} className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className={threat.color}>{threat.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};