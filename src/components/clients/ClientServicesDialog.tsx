import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Link2, Unlink, Plug, Shield, Mail, Monitor, Smartphone, Activity, Search as SearchIcon, Server, Cloud, Laptop } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantServicesApi } from '@/lib/api/tenant-services';
import { configApi } from '@/lib/api/config';
import type { TenantServiceResource } from '@/types/api';
import { toast } from 'sonner';

interface ClientServicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  hipatch: <Shield className="w-4 h-4" />,
  hifirewall: <Shield className="w-4 h-4" />,
  hiendpoint: <Monitor className="w-4 h-4" />,
  himail: <Mail className="w-4 h-4" />,
  hitrack: <Activity className="w-4 h-4" />,
  hilog: <Server className="w-4 h-4" />,
  hidetect: <SearchIcon className="w-4 h-4" />,
  himobile: <Smartphone className="w-4 h-4" />,
  hicompliance: <Cloud className="w-4 h-4" />,
};

const ClientServicesDialog: React.FC<ClientServicesDialogProps> = ({
  open, onOpenChange, organizationId, organizationName,
}) => {
  const queryClient = useQueryClient();
  const [confirmToggle, setConfirmToggle] = useState<{ service: any; currentStatus: string } | null>(null);

  // Service catalog from /config/tenant-services
  const { data: catalog = {}, isLoading: catalogLoading } = useQuery({
    queryKey: ['config-tenant-services'],
    queryFn: () => configApi.tenantServices(),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  // Tenant services from /tenant-services?tenant_id=X
  const { data: tenantServices = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['tenant-services', organizationId],
    queryFn: () => tenantServicesApi.listByOrganization(organizationId),
    enabled: open && !!organizationId,
    staleTime: 30_000,
  });

  // Build service list from catalog + tenant services
  const serviceList = useMemo(() => {
    return Object.entries(catalog).map(([key, value]) => {
      const svc = value as any;
      const tenantSvc = tenantServices.find((ts: TenantServiceResource) => ts.service_type === key);
      return {
        id: key,
        code: key,
        name: svc.label || key,
        description: svc.description || '',
        icon: svc.icon || '',
        status: tenantSvc?.status || 'inactive',
        tenantServiceId: tenantSvc?.id || null,
        settings: tenantSvc?.settings || null,
      };
    });
  }, [catalog, tenantServices]);

  const toggleServiceMutation = useMutation({
    mutationFn: async ({ serviceId, status, tenantServiceId }: { serviceId: string; status: string; tenantServiceId: string | null }) => {
      if (tenantServiceId) {
        await tenantServicesApi.update(tenantServiceId, { status: status as 'active' | 'inactive' });
      } else if (status === 'active') {
        await tenantServicesApi.create({
          tenant_id: organizationId,
          service_type: serviceId,
          status: 'active',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-services', organizationId] });
      toast.success(confirmToggle?.currentStatus === 'active' ? 'Servizio disattivato' : 'Servizio attivato');
      setConfirmToggle(null);
    },
    onError: (err: Error) => {
      toast.error(`Errore: ${err.message}`);
      setConfirmToggle(null);
    },
  });

  const handleToggle = (service: any) => {
    if (service.status === 'active') {
      setConfirmToggle({ service, currentStatus: 'active' });
    } else {
      toggleServiceMutation.mutate({
        serviceId: service.id,
        status: 'active',
        tenantServiceId: service.tenantServiceId,
      });
    }
  };

  const isLoading = catalogLoading || servicesLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="w-5 h-5" />
            Servizi HiConsole — {organizationName}
          </DialogTitle>
          <DialogDescription>Attiva o disattiva i servizi per questo cliente</DialogDescription>
        </DialogHeader>

        {confirmToggle ? (
          <div className="space-y-4 py-2">
            <p className="text-sm">
              Sei sicuro di voler <strong>disattivare</strong> {confirmToggle.service.name}?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmToggle(null)}>Annulla</Button>
              <Button
                variant="destructive"
                onClick={() => toggleServiceMutation.mutate({
                  serviceId: confirmToggle.service.id,
                  status: 'inactive',
                  tenantServiceId: confirmToggle.service.tenantServiceId,
                })}
                disabled={toggleServiceMutation.isPending}
              >
                {toggleServiceMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Disattiva
              </Button>
            </div>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : serviceList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nessun servizio disponibile nel catalogo</div>
            ) : (
              <div className="space-y-1">
                {serviceList.map((svc, idx) => {
                  const isActive = svc.status === 'active';
                  return (
                    <React.Fragment key={svc.id}>
                      {idx > 0 && <Separator />}
                      <div className="flex items-center justify-between py-2.5 px-1">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-md ${isActive ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                            {SERVICE_ICONS[svc.code?.toLowerCase()] || <Plug className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{svc.name}</p>
                            <p className="text-xs text-muted-foreground">{svc.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <>
                              <Badge variant="outline" className="text-xs border-green-500/30 text-green-500">Attivo</Badge>
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => handleToggle(svc)}
                                disabled={toggleServiceMutation.isPending}
                              >
                                <Unlink className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline" size="sm" className="text-xs"
                              onClick={() => handleToggle(svc)}
                              disabled={toggleServiceMutation.isPending}
                            >
                              <Link2 className="w-3.5 h-3.5 mr-1" /> Attiva
                            </Button>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ClientServicesDialog;
