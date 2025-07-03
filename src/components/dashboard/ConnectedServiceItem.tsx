import React from 'react';
import { 
  Shield, 
  Mail, 
  Users, 
  Network, 
  Cloud,
  Lock,
  CheckCircle
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

interface ConnectedServiceItemProps {
  service: Service;
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

export const ConnectedServiceItem: React.FC<ConnectedServiceItemProps> = ({ service }) => {
  const IconComponent = getServiceIcon(service.services.code);
  
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
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
};