import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Link2, Unlink, Plug, Shield, Mail, Monitor, Smartphone, Activity, Search as SearchIcon, Server, ShieldCheck, FileCheck, Eye, Radar } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClientServicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
}

interface Integration {
  id: string;
  service_id: string;
  api_url: string;
  is_active: boolean;
  service_code?: string;
  service_name?: string;
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
  const [connectingService, setConnectingService] = useState<{ id: string; name: string } | null>(null);
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  const { data: orgFlags } = useQuery({
    queryKey: ['org-feature-flags', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('hicompliance_enabled, irp_extended, surface_scan_extended, pentest_tools_auto_validation, surface_scan360_enabled, dark_risk360_enabled' as any)
        .eq('id', organizationId)
        .maybeSingle();
      if (error) throw error;
      return (data as any) || { hicompliance_enabled: false, irp_extended: false, surface_scan_extended: false, pentest_tools_auto_validation: true, surface_scan360_enabled: false, dark_risk360_enabled: false };
    },
    enabled: open && !!organizationId,
  });

  const { data: darkRiskEntitlement } = useQuery({
    queryKey: ['darkrisk-entitlement', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('darkrisk_entitlements' as any)
        .select('tier, enabled')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) {
        const missingRelation = String((error as any)?.code || '') === '42P01';
        if (missingRelation) {
          return { tier: 'standard', enabled: Boolean(orgFlags?.dark_risk360_enabled) };
        }
        throw error;
      }

      return (data as any) || { tier: 'standard', enabled: Boolean(orgFlags?.dark_risk360_enabled) };
    },
    enabled: open && !!organizationId,
  });

  const updateFlagsMutation = useMutation({
    mutationFn: async (patch: Record<string, boolean>) => {
      const { error } = await supabase.from('organizations').update(patch as any).eq('id', organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-feature-flags', organizationId] });
      toast.success('Configurazione aggiornata');
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });

  const updateDarkRiskTierMutation = useMutation({
    mutationFn: async (tier: 'standard' | 'extended') => {
      const payload = {
        organization_id: organizationId,
        tier,
        enabled: true,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('darkrisk_entitlements' as any)
        .upsert(payload, { onConflict: 'organization_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['darkrisk-entitlement', organizationId] });
      toast.success('Tier DarkRisk360 aggiornato');
    },
    onError: (err: Error) => toast.error(`Errore tier DarkRisk360: ${err.message}`),
  });

  const { data: services = [] } = useQuery({
    queryKey: ['hisolution-services'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hisolution_services').select('*');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['client-integrations', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('id, service_id, api_url, is_active, hisolution_services(code, name)')
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: item.id,
        service_id: item.service_id,
        api_url: item.api_url,
        is_active: item.is_active,
        service_code: item.hisolution_services?.code,
        service_name: item.hisolution_services?.name,
      })) as Integration[];
    },
    enabled: open && !!organizationId,
  });

  const connectMutation = useMutation({
    mutationFn: async ({ serviceId, apiUrl, apiKey }: { serviceId: string; apiUrl: string; apiKey: string }) => {
      const { data: existing } = await supabase
        .from('organization_integrations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('service_id', serviceId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('organization_integrations')
          .update({ api_url: apiUrl, api_key: apiKey, is_active: true, api_methods: {} })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('organization_integrations')
          .insert({ organization_id: organizationId, service_id: serviceId, api_url: apiUrl, api_key: apiKey, is_active: true, api_methods: {} });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-integrations', organizationId] });
      toast.success('Servizio collegato con successo');
      setConnectingService(null);
      setApiUrl('');
      setApiKey('');
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const { error } = await supabase
        .from('organization_integrations')
        .update({ is_active: false })
        .eq('id', integrationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-integrations', organizationId] });
      toast.success('Servizio scollegato');
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });

  const getIntegration = (serviceId: string) => integrations.find(i => i.service_id === serviceId);

  const handleConnect = () => {
    if (!connectingService || !apiUrl.trim() || !apiKey.trim()) return;
    connectMutation.mutate({ serviceId: connectingService.id, apiUrl: apiUrl.trim(), apiKey: apiKey.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="w-5 h-5" />
            Servizi API — {organizationName}
          </DialogTitle>
          <DialogDescription>Collega o scollega i servizi HiSolution per questo cliente</DialogDescription>
        </DialogHeader>

        {connectingService ? (
          <div className="space-y-4 py-2">
            <p className="text-sm font-medium">Collega {connectingService.name}</p>
            <div className="space-y-2">
              <Label htmlFor="client-api-url">URL API</Label>
              <Input id="client-api-url" placeholder="https://api.example.com/v1" value={apiUrl} onChange={e => setApiUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-api-key">Chiave API</Label>
              <Input id="client-api-key" type="password" placeholder="sk-..." value={apiKey} onChange={e => setApiKey(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setConnectingService(null); setApiUrl(''); setApiKey(''); }}>Annulla</Button>
              <Button onClick={handleConnect} disabled={connectMutation.isPending || !apiUrl.trim() || !apiKey.trim()}>
                {connectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Collega
              </Button>
            </div>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px] pr-2">
            {/* Top-level feature flags */}
            <div className="space-y-3 mb-4">
              {/* HiCompliance */}
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-md ${orgFlags?.hicompliance_enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">HiCompliance</p>
                    <p className="text-xs text-muted-foreground">Assessment, Analisi, Remediation, Incident</p>
                  </div>
                </div>
                <Switch
                  checked={!!orgFlags?.hicompliance_enabled}
                  disabled={updateFlagsMutation.isPending}
                  onCheckedChange={(v) => {
                    const patch: any = { hicompliance_enabled: v };
                    if (!v) { patch.irp_extended = false; }
                    updateFlagsMutation.mutate(patch);
                  }}
                />
              </div>

              {orgFlags?.hicompliance_enabled && (
                <div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
                  <div className="flex items-center justify-between rounded-md border p-2.5">
                    <div className="flex items-center gap-3">
                      <FileCheck className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">IRP Esteso</p>
                        <p className="text-xs text-muted-foreground">Playbook avanzati e documento esteso</p>
                      </div>
                    </div>
                    <Switch
                      checked={!!orgFlags?.irp_extended}
                      disabled={updateFlagsMutation.isPending}
                      onCheckedChange={(v) => updateFlagsMutation.mutate({ irp_extended: v })}
                    />
                  </div>
                </div>
              )}

              {/* SurfaceScan360 — independent */}
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-md ${orgFlags?.surface_scan360_enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    <Radar className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">SurfaceScan360</p>
                    <p className="text-xs text-muted-foreground">Scansione attack surface esterna</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={orgFlags?.surface_scan_extended ? 'extended' : 'standard'}
                    onValueChange={(value) => {
                      updateFlagsMutation.mutate({
                        surface_scan_extended: value === 'extended',
                      });
                    }}
                    disabled={updateFlagsMutation.isPending || !orgFlags?.surface_scan360_enabled}
                  >
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue placeholder="Livello" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="extended">Estesa</SelectItem>
                    </SelectContent>
                  </Select>
                  <Switch
                    checked={!!orgFlags?.surface_scan360_enabled}
                    disabled={updateFlagsMutation.isPending}
                    onCheckedChange={(v) => {
                      const patch: any = { surface_scan360_enabled: v };
                      if (v) { patch.pentest_tools_auto_validation = true; }
                      if (!v) { patch.surface_scan_extended = false; }
                      updateFlagsMutation.mutate(patch);
                    }}
                  />
                </div>
              </div>

              {orgFlags?.surface_scan360_enabled && (
                <div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
                  <div className="flex items-center justify-between rounded-md border p-2.5">
                    <div className="flex items-center gap-3">
                      <Radar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Livello SurfaceScan360</p>
                        <p className="text-xs text-muted-foreground">
                          {orgFlags?.surface_scan_extended ? 'Estesa: scope avanzato (domini multipli e range IP)' : 'Standard: scope base operativo'}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {orgFlags?.surface_scan_extended ? 'Estesa' : 'Standard'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-2.5">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Validazione attiva CVE</p>
                        <p className="text-xs text-muted-foreground">Sempre attiva di default su tutti i clienti abilitati SurfaceScan360</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs border-green-500/30 text-green-500">Sempre attiva</Badge>
                  </div>
                </div>
              )}

              {/* DarkRisk360 — independent */}
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-md ${orgFlags?.dark_risk360_enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">DarkRisk360</p>
                    <p className="text-xs text-muted-foreground">Monitoraggio dark web e leak</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={String((darkRiskEntitlement as any)?.tier || 'standard') === 'extended' ? 'extended' : 'standard'}
                    onValueChange={(value) =>
                      updateDarkRiskTierMutation.mutate(value === 'extended' ? 'extended' : 'standard')
                    }
                    disabled={updateDarkRiskTierMutation.isPending || !orgFlags?.dark_risk360_enabled}
                  >
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue placeholder="Livello" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="extended">Estesa</SelectItem>
                    </SelectContent>
                  </Select>
                  <Switch
                    checked={!!orgFlags?.dark_risk360_enabled}
                    disabled={updateFlagsMutation.isPending}
                    onCheckedChange={async (v) => {
                      updateFlagsMutation.mutate({ dark_risk360_enabled: v });
                      if (v) {
                        await updateDarkRiskTierMutation.mutateAsync(
                          (String((darkRiskEntitlement as any)?.tier || 'standard') === 'extended' ? 'extended' : 'standard')
                        );
                      }
                    }}
                  />
                </div>
              </div>

              {orgFlags?.dark_risk360_enabled && (
                <div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
                  <div className="flex items-center justify-between rounded-md border p-2.5">
                    <div className="flex items-center gap-3">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Tier DarkRisk360</p>
                        <p className="text-xs text-muted-foreground">Standard o Estesa sullo stesso modulo</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {String((darkRiskEntitlement as any)?.tier || 'standard') === 'extended' ? 'Estesa' : 'Standard'}
                    </Badge>
                  </div>
                </div>
              )}
            </div>


            <Separator className="my-3" />
            <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Servizi HiSolution (API)</p>

            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-1">

                {services.map((svc, idx) => {
                  const integration = getIntegration(svc.id);
                  const connected = !!integration;
                  return (
                    <React.Fragment key={svc.id}>
                      {idx > 0 && <Separator />}
                      <div className="flex items-center justify-between py-2.5 px-1">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-md ${connected ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                            {SERVICE_ICONS[svc.code?.toLowerCase()] || <Plug className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{svc.name}</p>
                            {connected && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{integration.api_url}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {connected ? (
                            <>
                              <Badge variant="outline" className="text-xs border-green-500/30 text-green-500">Attivo</Badge>
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => disconnectMutation.mutate(integration.id)}
                                disabled={disconnectMutation.isPending}
                              >
                                {disconnectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                              </Button>
                            </>
                          ) : (
                            <Button variant="outline" size="sm" className="text-xs" onClick={() => setConnectingService({ id: svc.id, name: svc.name })}>
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
