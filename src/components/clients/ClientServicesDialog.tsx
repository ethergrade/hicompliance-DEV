import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Link2, Unlink, Plug, Shield, Mail, Monitor, Smartphone, Activity, Search as SearchIcon, Server } from 'lucide-react';
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
          <ScrollArea className="max-h-[400px]">
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
