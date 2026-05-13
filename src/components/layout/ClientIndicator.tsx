import React from 'react';
import { useClientContext } from '@/contexts/ClientContext';
import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const ClientIndicator: React.FC = () => {
  const {
    selectedOrganization,
    canManageMultipleClients,
    organizations,
    setSelectedOrganization,
    isLoadingClients,
  } = useClientContext();

  if (!canManageMultipleClients) return null;

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-primary/5 px-4 py-3 md:flex-row md:items-center">
      <div className="flex items-center gap-2 text-sm">
        <Building2 className="w-4 h-4 text-primary" />
        <span className="text-muted-foreground">Cliente:</span>
      </div>
      <div className="flex flex-1 items-center gap-3">
        <Select
          value={selectedOrganization?.id}
          onValueChange={(value) => {
            const organization = organizations.find((org) => org.id === value);
            if (organization) {
              setSelectedOrganization(organization);
            }
          }}
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
