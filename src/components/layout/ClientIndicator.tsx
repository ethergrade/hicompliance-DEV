import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useClientContext } from '@/contexts/ClientContext';
import { tenantServicesApi } from '@/lib/api/tenant-services';
import { Badge } from '@/components/ui/badge';
import { Building2, Users } from 'lucide-react';
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
    selectedGroup,
    groups,
    canManageMultipleClients,
    organizations,
    setSelectedOrganization,
    setSelectedGroup,
    isLoadingClients,
  } = useClientContext();

  if (!canManageMultipleClients) return null;

  // Filter organizations by selected group
  const filteredOrganizations = useMemo(() => {
    if (!selectedGroup) return organizations;
    return organizations.filter(org => org.group_id === selectedGroup.id);
  }, [organizations, selectedGroup]);

  const handleGroupChange = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      setSelectedGroup(group);
      // Clear organization selection when group changes
      // The user will need to select a new organization from the filtered list
    }
  };

  const handleOrganizationChange = async (organizationId: string) => {
    const organization = filteredOrganizations.find((org) => org.id === organizationId);
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

  const showGroupSelector = groups.length > 1;

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-primary/5 px-4 py-3 md:flex-row md:items-center">
      {/* Group Selector - Only show if multiple groups */}
      {showGroupSelector && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">Gruppo:</span>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={selectedGroup?.id}
              onValueChange={handleGroupChange}
              disabled={isLoadingClients || groups.length === 0}
            >
              <SelectTrigger className="w-full max-w-[180px] bg-background">
                <SelectValue placeholder="Seleziona gruppo" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name || `Gruppo ${group.id.slice(0, 8)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="hidden md:block w-px h-6 bg-border mx-2" />
        </>
      )}

      {/* Organization/Client Selector */}
      <div className="flex items-center gap-2 text-sm">
        <Building2 className="w-4 h-4 text-primary" />
        <span className="text-muted-foreground">Azienda:</span>
      </div>
      <div className="flex flex-1 items-center gap-3">
        <Select
          value={selectedOrganization?.id}
          onValueChange={handleOrganizationChange}
          disabled={isLoadingClients || filteredOrganizations.length === 0}
        >
          <SelectTrigger className="w-full max-w-[280px] bg-background">
            <SelectValue placeholder={selectedGroup ? "Seleziona azienda" : "Seleziona prima un gruppo"} />
          </SelectTrigger>
          <SelectContent>
            {filteredOrganizations.map((organization) => (
              <SelectItem key={organization.id} value={organization.id}>
                {organization.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedOrganization ? (
          <Badge variant="secondary" className="font-medium hidden sm:inline-flex">
            {selectedOrganization.name}
          </Badge>
        ) : (
          <span className="text-sm italic text-muted-foreground hidden sm:inline">Nessuna azienda selezionata</span>
        )}
      </div>
    </div>
  );
};
