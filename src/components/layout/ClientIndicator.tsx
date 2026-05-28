import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useClientContext } from '@/contexts/ClientContext';
import { tenantServicesApi } from '@/lib/api/tenant-services';
import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Map routes to required service types
const SERVICE_ROUTE_MAP: Record<string, string> = {
  '/dark-risk': 'darkrisk',
  '/surface-scan': 'hitrack',
};

export const ClientIndicator: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    selectedOrganization,
    canManageMultipleClients,
    organizations,
    setSelectedOrganization,
    isLoadingClients,
  } = useClientContext();

  if (!canManageMultipleClients) return null;

  const handleOrganizationChange = async (organizationId: string) => {
    const organization = organizations.find((org) => org.id === organizationId);
    if (!organization) return;

    // Update selected organization
    setSelectedOrganization(organization);

    // Check if current route requires a specific service
    const currentPath = location.pathname;
    const requiredService = SERVICE_ROUTE_MAP[currentPath];
    
    if (requiredService && organization.group_id) {
      try {
        // Fetch services for the new organization
        const services = await tenantServicesApi.listByOrganization(
          organization.id,
          organization.group_id
        );
        const orgServices = services.filter(s => s.tenant_id === organization.id);
        
        // Check if required service is active
        const hasService = orgServices.some(
          s => s.service_type === requiredService && s.status === 'active'
        );
        
        // Redirect to dashboard if service not available
        if (!hasService) {
          navigate('/dashboard', { replace: true });
        }
      } catch {
        // On error, redirect to dashboard as fallback
        navigate('/dashboard', { replace: true });
      }
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-primary/5 px-4 py-3 md:flex-row md:items-center">
      <div className="flex items-center gap-2 text-sm">
        <Building2 className="w-4 h-4 text-primary" />
        <span className="text-muted-foreground">Cliente:</span>
      </div>
      <div className="flex flex-1 items-center gap-3">
        <Select
          value={selectedOrganization?.id}
          onValueChange={handleOrganizationChange}
          disabled={isLoadingClients || organizations.length === 0}
        >
          <SelectTrigger className="w-full max-w-md bg-background">
            <SelectValue placeholder="Seleziona cliente" />
          </SelectTrigger>
          <SelectContent>
            {organizations.map((organization) => (
              <SelectItem key={organization.id} value={organization.id}>
                {organization.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedOrganization ? (
          <Badge variant="secondary" className="font-medium">
            {selectedOrganization.name}
          </Badge>
        ) : (
          <span className="text-sm italic text-muted-foreground">Nessun cliente selezionato</span>
        )}
      </div>
    </div>
  );
};
