import React from 'react';
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

interface SecurityCategoryItemProps {
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

const getIssueCount = (healthScore: number | null, status: string): number => {
  if (status === 'alert' && healthScore) {
    return Math.floor((100 - healthScore) / 10);
  }
  return 0;
};

export const SecurityCategoryItem: React.FC<SecurityCategoryItemProps> = ({ service }) => {
  const IconComponent = getServiceIcon(service.services.code);
  const issueCount = getIssueCount(service.health_score, service.status);
  const resolvedCount = service.services.code === 'cloud_security' ? 124 : 
                      service.services.code === 'endpoint_security' ? 54 :
                      service.services.code === 'email_security' ? 98 :
                      service.services.code === 'user_data_governance' ? 54 : 0;

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
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
};