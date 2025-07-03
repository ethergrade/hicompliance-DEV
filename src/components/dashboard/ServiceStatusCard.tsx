import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ServiceStatsCard } from './ServiceStatsCard';
import { SecurityCategoryItem } from './SecurityCategoryItem';
import { ConnectedServiceItem } from './ConnectedServiceItem';
import { ThreatIndicatorsList } from './ThreatIndicatorsList';

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

export const ServiceStatusCard: React.FC<ServiceStatusCardProps> = ({ services }) => {
  const connectedServices = services.filter(s => s.status === 'active');
  
  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <ServiceStatsCard services={services} />

      {/* Services Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Security Categories - Hidden */}
        <div className="hidden">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Categorie di Sicurezza</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {services.slice(0, 5).map((service) => (
                <SecurityCategoryItem key={service.id} service={service} />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Connected Services */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Servizi Connessi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {connectedServices.slice(0, 3).map((service) => (
              <ConnectedServiceItem key={service.id} service={service} />
            ))}
            
            {/* Threat Indicators */}
            <ThreatIndicatorsList />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};