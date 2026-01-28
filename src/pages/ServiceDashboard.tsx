import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HiPatchDashboard } from '@/components/service-dashboards/HiPatchDashboard';
import { HiFirewallDashboard } from '@/components/service-dashboards/HiFirewallDashboard';
import { HiEndpointDashboard } from '@/components/service-dashboards/HiEndpointDashboard';
import { HiMailDashboard } from '@/components/service-dashboards/HiMailDashboard';
import { HiLogDashboard } from '@/components/service-dashboards/HiLogDashboard';
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbLink, 
  BreadcrumbList, 
  BreadcrumbPage, 
  BreadcrumbSeparator 
} from '@/components/ui/breadcrumb';

const serviceNameMap: Record<string, string> = {
  'hi_patch': 'HiPatch',
  'hi_firewall': 'HiFirewall',
  'hi_endpoint': 'HiEndpoint',
  'hi_mail': 'HiMail',
  'hi_log': 'HiLog',
  'hi_mfa': 'HiMfa',
  'hi_track': 'HiTrack',
};

const ServiceDashboard: React.FC = () => {
  const { serviceCode } = useParams<{ serviceCode: string }>();
  const serviceName = serviceNameMap[serviceCode || ''] || serviceCode;

  const renderServiceContent = () => {
    switch (serviceCode) {
      case 'hi_patch':
        return <HiPatchDashboard />;
      case 'hi_firewall':
        return <HiFirewallDashboard />;
      case 'hi_endpoint':
        return <HiEndpointDashboard />;
      case 'hi_mail':
        return <HiMailDashboard />;
      case 'hi_log':
        return <HiLogDashboard />;
      default:
        return (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-muted-foreground">
              Dashboard per {serviceName} in costruzione
            </h2>
          </div>
        );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{serviceName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {renderServiceContent()}
      </div>
    </DashboardLayout>
  );
};

export default ServiceDashboard;
