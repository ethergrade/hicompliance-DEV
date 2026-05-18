import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Link2, Unlink, Plug, Shield, Mail, Monitor, Smartphone, Activity, Search as SearchIcon, Server, Pencil } from 'lucide-react';
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
};

const ClientServicesDialog: React.FC<ClientServicesDialogProps> = ({
  open, onOpenChange, organizationId, organizationName,
}) => {
  const queryClient = useQueryClient();
  const [selectedService, setSelectedService] = useState<any | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

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

  const openEditForm = (svc: any) => {
    const existing = tenantServices.find((ts: TenantServiceResource) => ts.service_type === svc.id);
    const settings = (existing?.settings as Record<string, string> | undefined) || {};
    setSelectedService(svc);
    setIsEditMode(!!existing && svc.status === 'active');
    setApiUrl(settings.api_url || '');
    setApiKey(settings.api_key || '');
  };

  const closeForm = () => {
    setSelectedService(null);
    setIsEditMode(false);
    setApiUrl('');
    setApiKey('');
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedService) return;

      const existing = tenantServices.find((ts: TenantServiceResource) => ts.service_type === selectedService.id);

      const payload = {
        status: 'active' as const,
        settings: {
          ...((existing?.settings as Record<string, unknown>) || {}),
          api_url: apiUrl.trim(),
          api_key: apiKey.trim(),
        },
      };

      if (existing?.id) {
        await tenantServicesApi.update(existing.id, payload);
      } else {
        await tenantServicesApi.create({
          tenant_id: organizationId,
          service_type: selectedService.id,
          status: 'active',
          settings: payload.settings,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-services', organizationId] });
      toast.success(isEditMode ? 'Configurazione aggiornata' : 'Servizio collegato con successo');
      closeForm();
    },
    onError: (err: Error) => {
      toast.error(`Errore: ${err.message}`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedService) return;
      const existing = tenantServices.find((ts: TenantServiceResource) => ts.service_type === selectedService.id);
      if (existing?.id) {
        await tenantServicesApi.update(existing.id, { status: 'inactive' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-services', organizationId] });
      toast.success('Servizio scollegato');
      closeForm();
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });

  const handleSave = () => {
    if (!selectedService) return;
    if (!apiUrl.trim() || !apiKey.trim()) {
      toast.error('URL e Chiave API sono obbligatori');
      return;
    }
    saveMutation.mutate();
  };

  const isLoading = catalogLoading || servicesLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="w-5 h-5" />
            {selectedService ? `Configura ${selectedService.name}` : `Servizi API — ${organizationName}`}
          </DialogTitle>
          <DialogDescription>
            {selectedService ? 'Modifica le credenziali API del servizio' : 'Collega o scollega i servizi per questo cliente'}
          </DialogDescription>
        </DialogHeader>

        {selectedService ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="client-api-url">URL API</Label>
              <Input
                id="client-api-url"
                placeholder="https://api.example.com/v1"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-api-key">Chiave API</Label>
              <Input
                id="client-api-key"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={closeForm}>
                Annulla
              </Button>
              {isEditMode && (
                <Button
                  variant="destructive"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Scollega
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending || !apiUrl.trim() || !apiKey.trim()}
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditMode ? 'Salva' : 'Collega'}
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
                  const settings = svc.settings as Record<string, string> | undefined;
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
                            {isActive && settings?.api_url && (
                              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{settings.api_url}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <>
                              <Badge variant="outline" className="text-xs border-green-500/30 text-green-500">Attivo</Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditForm(svc)}
                                disabled={saveMutation.isPending || disconnectMutation.isPending}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => openEditForm(svc)}
                              disabled={saveMutation.isPending}
                            >
                              <Link2 className="w-3.5 h-3.5 mr-1" /> Collega
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
