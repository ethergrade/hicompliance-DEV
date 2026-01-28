import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HiPatchDashboard } from '@/components/service-dashboards/HiPatchDashboard';
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
