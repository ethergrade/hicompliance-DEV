import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Plug,
  ShieldCheck,
  Radar,
  Eye,
  Shield,
  Activity,
  Server,
  Mail,
  Monitor,
  Smartphone,
  Search as SearchIcon,
  Settings,
  Save,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tenantServicesApi } from '@/lib/api/tenant-services';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import type {
  TenantServiceResource,
  ServiceCatalog,
  ServiceCatalogField,
} from '@/types/api';

interface ClientServicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationName: string;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  hicompliance: <ShieldCheck className="w-4 h-4" />,
  surfacescan360: <Radar className="w-4 h-4" />,
  darkrisk360: <Eye className="w-4 h-4" />,
  hipatch: <Shield className="w-4 h-4" />,
  hifirewall: <Shield className="w-4 h-4" />,
  hiendpoint: <Monitor className="w-4 h-4" />,
  himail: <Mail className="w-4 h-4" />,
  hitrack: <Activity className="w-4 h-4" />,
  hilog: <Server className="w-4 h-4" />,
  hidetect: <SearchIcon className="w-4 h-4" />,
  himobile: <Smartphone className="w-4 h-4" />,
};

const SERVICE_ORDER = [
  'HiCompliance',
  'SurfaceScan360',
  'DarkRisk360',
  'HiPatch',
  'HiTrack',
  'HiLog',
  'HiMail',
  'HiEndpoint',
  'HiFirewall',
  'HiDetect',
  'HiMobile',
];

function sortServiceTypes(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const ia = SERVICE_ORDER.indexOf(a);
    const ib = SERVICE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

const ClientServicesDialog: React.FC<ClientServicesDialogProps> = ({
  open,
  onOpenChange,
  organizationName,
}) => {
  const queryClient = useQueryClient();
  const { organizationId } = useClientOrganization();

  const [localSettings, setLocalSettings] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const initializedRef = React.useRef(false);

  // Reset local state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      setLocalSettings({});
      setDirty(new Set());
    }
  }, [open]);

  const { data: catalog, isLoading: catalogLoading } = useQuery<ServiceCatalog>({
    queryKey: ['tenant-services-catalog'],
    queryFn: () => tenantServicesApi.catalog(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tenantServices = [], isLoading: servicesLoading } = useQuery<
    TenantServiceResource[]
  >({
    queryKey: ['tenant-services', organizationId],
    queryFn: () => tenantServicesApi.listByOrganization(organizationId!),
    enabled: open && !!organizationId,
  });

  // One-time init of local settings from fetched services
  useEffect(() => {
    if (!initializedRef.current && tenantServices.length > 0) {
      const next: Record<string, Record<string, unknown>> = {};
      tenantServices.forEach((s) => {
        if (s.status === 'active') {
          next[s.service_type] = (s.settings as Record<string, unknown>) || {};
        }
      });
      setLocalSettings(next);
      initializedRef.current = true;
    }
  }, [tenantServices]);

  const servicesMap = useMemo(() => {
    const map = new Map<string, TenantServiceResource>();
    tenantServices.forEach((s) => map.set(s.service_type, s));
    return map;
  }, [tenantServices]);

  const createMutation = useMutation({
    mutationFn: (serviceType: string) =>
      tenantServicesApi.create(
        {
          tenant_id: organizationId!,
          service_type: serviceType,
          status: 'active',
          settings: {},
        },
        organizationId!
      ),
    onSuccess: (_, serviceType) => {
      setLocalSettings((prev) => ({ ...prev, [serviceType]: {} }));
      queryClient.invalidateQueries({
        queryKey: ['tenant-services', organizationId],
      });
      toast.success('Servizio attivato');
    },
    onError: (err: Error) => toast.error(`Errore attivazione: ${err.message}`),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'active' | 'inactive';
    }) => tenantServicesApi.update(id, { status }, organizationId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tenant-services', organizationId],
      });
      toast.success('Stato servizio aggiornato');
    },
    onError: (err: Error) =>
      toast.error(`Errore aggiornamento stato: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tenantServicesApi.delete(id, organizationId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tenant-services', organizationId],
      });
      toast.success('Servizio disattivato');
    },
    onError: (err: Error) =>
      toast.error(`Errore disattivazione: ${err.message}`),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: ({
      id,
      settings,
    }: {
      id: string;
      settings: Record<string, unknown>;
    }) => tenantServicesApi.update(id, { settings }, organizationId!),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['tenant-services', organizationId],
      });
      toast.success('Configurazione salvata');
      setDirty((prev) => {
        const next = new Set(prev);
        const serviceType = Object.keys(localSettings).find(
          (k) => servicesMap.get(k)?.id === variables.id
        );
        if (serviceType) next.delete(serviceType);
        return next;
      });
    },
    onError: (err: Error) =>
      toast.error(`Errore salvataggio: ${err.message}`),
  });

  const handleToggle = (serviceType: string, checked: boolean) => {
    const service = servicesMap.get(serviceType);
    if (checked) {
      if (service) {
        if (service.status !== 'active') {
          updateStatusMutation.mutate({ id: service.id, status: 'active' });
        }
      } else {
        createMutation.mutate(serviceType);
      }
    } else {
      if (service) {
        deleteMutation.mutate(service.id);
      }
    }
  };

  const handleFieldChange = (
    serviceType: string,
    fieldKey: string,
    value: unknown
  ) => {
    setLocalSettings((prev) => ({
      ...prev,
      [serviceType]: {
        ...(prev[serviceType] || {}),
        [fieldKey]: value,
      },
    }));
    setDirty((prev) => new Set(prev).add(serviceType));
  };

  const handleSaveSettings = (serviceType: string) => {
    const service = servicesMap.get(serviceType);
    if (!service) return;
    const settings = localSettings[serviceType] || {};
    updateSettingsMutation.mutate({ id: service.id, settings });
  };

  const isLoading = catalogLoading || servicesLoading;
  const anyMutationPending =
    createMutation.isPending ||
    deleteMutation.isPending ||
    updateStatusMutation.isPending ||
    updateSettingsMutation.isPending;

  const sortedServiceTypes = useMemo(
    () => sortServiceTypes(Object.keys(catalog || {})),
    [catalog]
  );

  const renderField = (
    serviceType: string,
    fieldKey: string,
    field: ServiceCatalogField
  ) => {
    const inputId = `${serviceType}-${fieldKey}`;
    const value = localSettings[serviceType]?.[fieldKey];

    if (field.type === 'select' && field.options && field.options.length > 0) {
      return (
        <div className="space-y-1" key={fieldKey}>
          <Label htmlFor={inputId}>{field.label}</Label>
          <Select
            value={String(value ?? '')}
            onValueChange={(v) => handleFieldChange(serviceType, fieldKey, v)}
          >
            <SelectTrigger id={inputId} className="h-9">
              <SelectValue placeholder={`Seleziona ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (field.type === 'checkbox') {
      return (
        <div className="flex items-center justify-between py-1.5" key={fieldKey}>
          <Label htmlFor={inputId} className="cursor-pointer">
            {field.label}
          </Label>
          <Switch
            id={inputId}
            checked={!!value}
            onCheckedChange={(v) =>
              handleFieldChange(serviceType, fieldKey, v)
            }
            aria-label={field.label}
          />
        </div>
      );
    }

    return (
      <div className="space-y-1" key={fieldKey}>
        <Label htmlFor={inputId}>{field.label}</Label>
        <Input
          id={inputId}
          type={field.is_secret ? 'password' : 'text'}
          value={String(value ?? '')}
          onChange={(e) =>
            handleFieldChange(serviceType, fieldKey, e.target.value)
          }
          className="h-9"
          placeholder={field.label}
          autoComplete="off"
        />
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="w-5 h-5" />
            Servizi API — {organizationName}
          </DialogTitle>
          <DialogDescription>
            Attiva o disattiva i servizi HiSolution per questo cliente e configura
            i parametri richiesti
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[520px] pr-2">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {sortedServiceTypes.map((serviceType, idx) => {
                const entry = catalog![serviceType];
                const service = servicesMap.get(serviceType);
                const isActive = service?.status === 'active';
                const iconKey = serviceType.toLowerCase();
                const icon =
                  SERVICE_ICONS[iconKey] || (
                    <Settings className="w-4 h-4" />
                  );
                const hasFields =
                  entry.fields && Object.keys(entry.fields).length > 0;
                const isDirty = dirty.has(serviceType);
                const isSavingService =
                  updateSettingsMutation.isPending &&
                  service?.id === updateSettingsMutation.variables?.id;

                return (
                  <div key={serviceType}>
                    {idx > 0 && <Separator className="my-2" />}

                    {/* Service row */}
                    <div className="flex items-center justify-between rounded-md border p-3 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-1.5 rounded-md shrink-0 ${
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {entry.label || serviceType}
                          </p>
                          {isActive && (
                            <p className="text-xs text-muted-foreground">
                              Configurazione attiva
                            </p>
                          )}
                        </div>
                      </div>
                      <Switch
                        checked={isActive}
                        disabled={
                          anyMutationPending || !organizationId
                        }
                        onCheckedChange={(v) => handleToggle(serviceType, v)}
                        aria-label={`Attiva ${entry.label || serviceType}`}
                      />
                    </div>

                    {/* Expanded settings */}
                    {isActive && hasFields && (
                      <div className="ml-4 mt-2 space-y-3 border-l-2 border-primary/20 pl-3">
                        <div className="space-y-3">
                          {Object.entries(entry.fields).map(
                            ([fieldKey, field]) =>
                              renderField(serviceType, fieldKey, field)
                          )}
                        </div>

                        <div className="flex justify-end pt-1">
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={!isDirty || isSavingService}
                            onClick={() => handleSaveSettings(serviceType)}
                          >
                            {isSavingService ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Salva configurazione
                          </Button>
                        </div>
                      </div>
                    )}

                    {isActive && !hasFields && (
                      <div className="ml-4 mt-2 border-l-2 border-primary/20 pl-3 py-2">
                        <Badge variant="outline" className="text-xs">
                          Nessuna configurazione richiesta
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })}

              {sortedServiceTypes.length === 0 && !catalogLoading && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nessun servizio disponibile nel catalogo
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default ClientServicesDialog;
