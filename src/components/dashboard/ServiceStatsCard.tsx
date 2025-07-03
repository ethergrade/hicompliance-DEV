import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, AlertTriangle, Users } from 'lucide-react';

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

interface ServiceStatsCardProps {
  services: Service[];
}

export const ServiceStatsCard: React.FC<ServiceStatsCardProps> = ({ services }) => {
  const connectedServices = services.filter(s => s.status === 'active');
  const alertServices = services.filter(s => s.status === 'alert');

  return (
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
  );
};