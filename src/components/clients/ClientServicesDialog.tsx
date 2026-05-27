import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

/** Prettify a service key for display: 'hipatch' → 'HiPatch', 'hifirewall' → 'HiFirewall' */
const prettifyServiceKey = (key: string) => {
  if (key.toLowerCase().startsWith('hi')) {
    return `Hi${key.slice(2).charAt(0).toUpperCase()}${key.slice(3)}`;
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
};

const ClientServicesDialog: React.FC<ClientServicesDialogProps> = ({
  open, onOpenChange, organizationId, organizationName,
}) => {
  const queryClient = useQueryClient();
  const [selectedService, setSelectedService] = useState<any | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});

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
        fields: svc.fields || {},
        status: tenantSvc?.status || 'inactive',
        tenantServiceId: tenantSvc?.id || null,
        settings: tenantSvc?.settings || null,
      };
    });
  }, [catalog, tenantServices]);

  const openEditForm = (svc: any) => {
    const existing = tenantServices.find((ts: TenantServiceResource) => ts.service_type === svc.id);
    const settings = (existing?.settings as Record<string, string> | undefined) || {};
    const fields = svc.fields || {};

    const initialValues: Record<string, string | boolean> = {};
    Object.entries(fields).forEach(([key, fieldDef]: [string, any]) => {
      const val = settings[key];
      if (fieldDef.type === 'checkbox') {
        initialValues[key] = val === true || val === '1' || val === 'true' || val === 1;
      } else {
        initialValues[key] = val !== undefined && val !== null ? String(val) : '';
      }
    });

    setSelectedService(svc);
    setIsEditMode(!!existing && svc.status === 'active');
    setFormValues(initialValues);
  };

  const closeForm = () => {
    setSelectedService(null);
    setIsEditMode(false);
    setFormValues({});
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedService) return;

      const existing = tenantServices.find((ts: TenantServiceResource) => ts.service_type === selectedService.id);

      const fields = (selectedService.fields || {}) as Record<string, any>;

      const settings: Record<string, unknown> = {};
      Object.entries(fields).forEach(([key, def]) => {
        const val = formValues[key];
        if (def.type === 'checkbox') {
          settings[key] = val === true || val === 'true' || val === '1';
        } else {
          settings[key] = val !== undefined && val !== null ? String(val) : '';
        }
      });

      const payload = {
        status: 'active' as const,
        settings,
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
    const fields = (selectedService.fields || {}) as Record<string, any>;

    const missing = Object.entries(fields).filter(([key, def]) => def.required && !(formValues[key] ?? '').toString().trim());
    if (missing.length > 0) {
      const labels = missing.map(([_, def]) => def.label);
      toast.error(`Campi obbligatori mancanti: ${labels.join(', ')}`);
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
            {selectedService ? `Configura ${prettifyServiceKey(selectedService.id)} - ${selectedService.name}` : `Servizi API - ${organizationName}`}
          </DialogTitle>
          <DialogDescription>
            {selectedService ? 'Modifica le credenziali API del servizio' : 'Collega o scollega i servizi per questo cliente'}
          </DialogDescription>
        </DialogHeader>

        {selectedService ? (
          <div className="space-y-4 py-2">
            {Object.entries(selectedService.fields || {}).map(([key, fieldDef]: [string, any]) => (
              <div key={key} className="space-y-2">
                {fieldDef.type === 'checkbox' ? (
                  <div className="flex items-center gap-3">
                    <Switch
                      id={`field-${key}`}
                      checked={!!formValues[key]}
                      onCheckedChange={(checked: boolean) =>
                        setFormValues(prev => ({ ...prev, [key]: checked }))
                      }
                    />
                    <Label htmlFor={`field-${key}`}>{fieldDef.label}</Label>
                  </div>
                ) : fieldDef.type === 'select' ? (
                  <>
                    <Label htmlFor={`field-${key}`}>{fieldDef.label}</Label>
                    <Select
                      value={String(formValues[key] ?? '')}
                      onValueChange={value => setFormValues(prev => ({ ...prev, [key]: value }))}
                    >
                      <SelectTrigger id={`field-${key}`}>
                        <SelectValue placeholder="Seleziona..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(fieldDef.options || {}).map(([optKey, optLabel]) => (
                          <SelectItem key={optKey} value={String(optKey)}>
                            {String(optLabel)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <Label htmlFor={`field-${key}`}>{fieldDef.label}</Label>
                    <Input
                      id={`field-${key}`}
                      type={fieldDef.is_secret ? 'password' : 'text'}
                      placeholder={fieldDef.placeholder || ''}
                      value={String(formValues[key] ?? '')}
                      onChange={e => setFormValues(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </>
                )}
              </div>
            ))}
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
                disabled={saveMutation.isPending}
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
                            <p className="text-sm font-medium">{prettifyServiceKey(svc.id)} - {svc.name}</p>
                            {isActive && svc.settings && Object.keys(svc.settings || {}).length > 0 && (
                              <p className="text-xs text-muted-foreground truncate max-w-[180px]">Configurato</p>
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
