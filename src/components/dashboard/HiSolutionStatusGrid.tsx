import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Monitor, 
  Mail, 
  FileText, 
  Download,
  Key,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Wrench
} from 'lucide-react';

interface HiService {
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

interface HiSolutionStatusGridProps {
  services: HiService[];
}

const getHiServiceIcon = (code: string) => {
  const iconMap: Record<string, any> = {
    hi_firewall: Shield,
    hi_endpoint: Monitor,
    hi_mail: Mail,
    hi_log: FileText,
    hi_patch: Download,
    hi_mfa: Key,
    hi_track: Activity,
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
  if (status === 'alert' && healthScore !== null) {
    return Math.floor((100 - healthScore) / 10);
  }
  return 0;
};

const getResolvedCount = (code: string): number => {
  const resolvedMap: Record<string, number> = {
    hi_firewall: 124,
    hi_endpoint: 54,
    hi_mail: 98,
    hi_log: 54,
    hi_patch: 78,
    hi_mfa: 145,
    hi_track: 89,
  };
  return resolvedMap[code] || 0;
};

export const HiSolutionStatusGrid: React.FC<HiSolutionStatusGridProps> = ({ services }) => {
  // Filter only HiSolution services
  const hiServices = services.filter(s => s.services.code.startsWith('hi_'));
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Servizi HiSolution</h2>
          <p className="text-muted-foreground">Stato dei servizi di sicurezza</p>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {hiServices.map((service) => {
          const IconComponent = getHiServiceIcon(service.services.code);
          const issueCount = getIssueCount(service.health_score, service.status);
          const resolvedCount = getResolvedCount(service.services.code);
          
          return (
            <Card key={service.id} className="border-border hover:bg-muted/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      service.status === 'alert' 
                        ? 'bg-red-500/10' 
                        : 'bg-green-500/10'
                    }`}>
                      <IconComponent className={`w-5 h-5 ${
                        service.status === 'alert' 
                          ? 'text-red-500' 
                          : 'text-green-500'
                      }`} />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-medium">
                        {service.services.name}
                      </CardTitle>
                    </div>
                  </div>
                  {getStatusIcon(service.status)}
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                {service.status === 'alert' && (
                  <div className="text-center mb-3">
                    <div className="text-3xl font-bold text-red-500 mb-1">
                      {issueCount}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Issues rilevate
                    </p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Resolved / 90d:</span>
                    <span className="text-green-500 font-medium">{resolvedCount}</span>
                  </div>
                  
                  {service.health_score !== null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Health Score:</span>
                      <span className={`font-medium ${
                        service.health_score >= 80 
                          ? 'text-green-500' 
                          : service.health_score >= 50 
                          ? 'text-yellow-500' 
                          : 'text-red-500'
                      }`}>
                        {service.health_score}%
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};