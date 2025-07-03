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
  const hiSolutionServices = services.filter(s => s.services?.code?.startsWith('hi_'));
  
  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <ServiceStatsCard services={services} />

      {/* HiSolution Services - Full Width */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Servizi HiSolution Connessi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {hiSolutionServices.map((service) => (
              <ConnectedServiceItem key={service.id} service={service} />
            ))}
          </div>
          
          {/* Threat Indicators */}
          <ThreatIndicatorsList />
        </CardContent>
      </Card>
    </div>
  );
};