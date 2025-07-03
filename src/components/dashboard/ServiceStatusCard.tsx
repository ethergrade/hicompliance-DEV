import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Cloud, Mail, Monitor, Key, Zap, Search, Settings, User, Lock, File } from 'lucide-react';

interface Service {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive' | 'maintenance' | 'alert';
  health_score: number;
  description: string;
}

interface ServiceStatusCardProps {
  services: Service[];
}

const getServiceIcon = (code: string) => {
  switch (code) {
    case 'hi_firewall':
      return Shield;
    case 'hi_endpoint':
      return Monitor;
    case 'hi_mail':
      return Mail;
    case 'hi_log':
      return File;
    case 'hi_patch':
      return Settings;
    case 'hi_mfa':
      return Key;
    case 'hi_track':
      return Zap;
    case 'hi_detect':
      return Search;
    case 'hi_cloud_optix':
      return Cloud;
    case 'hi_phish_threat':
      return User;
    case 'hi_ztna':
      return Lock;
    case 'hi_mobile':
      return Monitor;
    default:
      return Shield;
  }
};

const getStatusBadge = (status: string, healthScore: number) => {
  switch (status) {
    case 'active':
      return (
        <Badge variant="secondary" className="bg-cyber-green/20 text-cyber-green">
          Attivo ({healthScore}%)
        </Badge>
      );
    case 'alert':
      return (
        <Badge variant="secondary" className="bg-cyber-red/20 text-cyber-red">
          Allerta ({healthScore}%)
        </Badge>
      );
    case 'maintenance':
      return (
        <Badge variant="secondary" className="bg-cyber-orange/20 text-cyber-orange">
          Manutenzione
        </Badge>
      );
    case 'inactive':
      return (
        <Badge variant="secondary" className="bg-muted-foreground/20 text-muted-foreground">
          Inattivo
        </Badge>
      );
    default:
      return null;
  }
};

export const ServiceStatusCard: React.FC<ServiceStatusCardProps> = ({ services }) => {
  const activeServices = services.filter(s => s.status === 'active').length;
  const alertServices = services.filter(s => s.status === 'alert').length;
  const avgHealthScore = services.length > 0 
    ? Math.round(services.reduce((acc, s) => acc + s.health_score, 0) / services.length)
    : 0;

  return (
    <Card className="border-border shadow-cyber">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Stato Servizi HiCompliance</span>
          <div className="flex space-x-2">
            <Badge variant="outline" className="text-cyber-green">
              {activeServices} Attivi
            </Badge>
            {alertServices > 0 && (
              <Badge variant="outline" className="text-cyber-red">
                {alertServices} Allerta
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service) => {
            const IconComponent = getServiceIcon(service.code);
            return (
              <div
                key={service.id}
                className="p-4 rounded-lg border border-border bg-card/50 hover:bg-card transition-cyber"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <IconComponent className="h-5 w-5 text-cyber-blue" />
                    <h4 className="font-medium text-sm">{service.name}</h4>
                  </div>
                  {getStatusBadge(service.status, service.health_score)}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {service.description}
                </p>
                {service.status === 'active' && (
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${service.health_score}%`,
                          backgroundColor: service.health_score >= 80 
                            ? 'hsl(var(--cyber-green))' 
                            : service.health_score >= 60 
                            ? 'hsl(var(--cyber-orange))' 
                            : 'hsl(var(--cyber-red))'
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {service.health_score}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {services.length === 0 && (
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nessun servizio configurato</p>
            <Button variant="outline" className="mt-4">
              Configura Servizi
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};