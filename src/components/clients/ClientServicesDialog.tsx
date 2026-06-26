import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Link2, Unlink, Plug, Shield, Mail, Monitor, Smartphone, Activity, Search as SearchIcon, Server, ShieldCheck, FileCheck, Eye, Radar, Pause, Play, ShieldAlert } from 'lucide-react';
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

interface OrganizationFlags {
  hicompliance_enabled: boolean;
  irp_extended: boolean;
  surface_scan_extended: boolean;
  surface_scan360_enabled: boolean;
  dark_risk360_enabled: boolean;
  darkrisk_esteso_enabled: boolean;
  services_paused: boolean;
  services_paused_at?: string | null;
  services_pause_reason?: string | null;
  hicompliance_contract_start?: string | null;
  hicompliance_contract_years?: number | null;
  surface_scan_contract_start?: string | null;
  surface_scan_contract_years?: number | null;
  dark_risk_contract_start?: string | null;
  dark_risk_contract_years?: number | null;
}

interface DarkRiskEntitlement {
  tier: 'standard' | 'extended';
  enabled: boolean;
}

interface DarkRiskEstesoProfile {
  enabled: boolean;
  manual_only: boolean;
  identity_model_valid_until: string;
}

interface LifecycleResponse {
  error?: string;
}

interface IntegrationRow {
  id: string;
  service_id: string;
  api_url: string;
  is_active: boolean;
  hisolution_services?: {
    code?: string;
    name?: string;
  } | null;
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
  const [hicomplianceStart, setHicomplianceStart] = useState('');
  const [hicomplianceYears, setHicomplianceYears] = useState('1');
  const [surfaceStart, setSurfaceStart] = useState('');
  const [surfaceYears, setSurfaceYears] = useState('1');
  const [scopeDomain, setScopeDomain] = useState('');
  const [addingScopeDomain, setAddingScopeDomain] = useState(false);
  const [darkRiskStart, setDarkRiskStart] = useState('');
  const [darkRiskYears, setDarkRiskYears] = useState('1');

  const { data: orgFlags } = useQuery({
    queryKey: ['org-feature-flags', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('hicompliance_enabled, irp_extended, surface_scan_extended, surface_scan360_enabled, dark_risk360_enabled, darkrisk_esteso_enabled, services_paused, services_paused_at, services_pause_reason, hicompliance_contract_start, hicompliance_contract_years, surface_scan_contract_start, surface_scan_contract_years, dark_risk_contract_start, dark_risk_contract_years')
        .eq('id', organizationId)
        .maybeSingle();
      if (error) throw error;
      return (data as OrganizationFlags | null) || {
        hicompliance_enabled: false,
        irp_extended: false,
        surface_scan_extended: false,
        surface_scan360_enabled: false,
        dark_risk360_enabled: false,
        darkrisk_esteso_enabled: false,
        services_paused: false,
      };
    },
    enabled: open && !!organizationId,
  });

  useEffect(() => {
    if (!orgFlags) return;
    const today = new Date().toISOString().slice(0, 10);
    setHicomplianceStart(String(orgFlags.hicompliance_contract_start || today));
    setHicomplianceYears(String(orgFlags.hicompliance_contract_years || 1));
    setSurfaceStart(String(orgFlags.surface_scan_contract_start || today));
    setSurfaceYears(String(orgFlags.surface_scan_contract_years || 1));
    setDarkRiskStart(String(orgFlags.dark_risk_contract_start || today));
    setDarkRiskYears(String(orgFlags.dark_risk_contract_years || 1));
  }, [orgFlags]);

  const { data: darkRiskEntitlement } = useQuery({
    queryKey: ['darkrisk-entitlement', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('darkrisk_entitlements' as never)
        .select('tier, enabled')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) {
        const missingRelation = String((error as { code?: string } | null)?.code || '') === '42P01';
        if (missingRelation) {
          return { tier: 'standard', enabled: Boolean(orgFlags?.dark_risk360_enabled) };
        }
        throw error;
      }

      return (data as DarkRiskEntitlement | null) || { tier: 'standard', enabled: Boolean(orgFlags?.dark_risk360_enabled) };
    },
    enabled: open && !!organizationId,
  });

  const { data: darkRiskEstesoProfile } = useQuery({
    queryKey: ['darkrisk-esteso-profile', organizationId],
    queryFn: async (): Promise<DarkRiskEstesoProfile> => {
      const { data, error } = await supabase
        .from('darkrisk_esteso_profiles' as never)
        .select('enabled, manual_only, identity_model_valid_until')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) {
        const missingRelation = String((error as { code?: string } | null)?.code || '') === '42P01';
        if (missingRelation) {
          return {
            enabled: Boolean(orgFlags?.darkrisk_esteso_enabled),
            manual_only: true,
            identity_model_valid_until: '2026-06-10',
          };
        }
        throw error;
      }

      const row = (data as Partial<DarkRiskEstesoProfile> | null) || null;
      return {
        enabled: Boolean(row?.enabled ?? orgFlags?.darkrisk_esteso_enabled),
        manual_only: Boolean(row?.manual_only ?? true),
        identity_model_valid_until: String(row?.identity_model_valid_until || '2026-06-10'),
      };
    },
    enabled: open && !!organizationId,
  });

  const updateFlagsMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from('organizations').update(patch as never).eq('id', organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-feature-flags', organizationId] });
      toast.success('Configurazione aggiornata');
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });

  const parseContractYears = (value: string): number => {
    const parsed = Number.parseInt(String(value || '1'), 10);
    if (Number.isNaN(parsed)) return 1;
    return Math.max(1, Math.min(10, parsed));
  };

  const handleAddScopeDomain = async () => {
    const domain = scopeDomain.trim().toLowerCase();
    if (!domain) return;
    setAddingScopeDomain(true);
    try {
      const { error } = await supabase
        .from('surface_scan_monitored_ips' as never)
        .upsert({
          organization_id: organizationId,
          input_value:     domain,
          entry_type:      'domain',
          ip_start:        '',
          ip_end:          '',
          discovered_via:  'profiling',
          created_by:      null,
        } as never, { onConflict: 'organization_id,input_value' } as never);
      if (error && error.code !== '23505') throw error;
      toast.success(`${domain} aggiunto allo scope`);
      setScopeDomain('');
    } catch (err: unknown) {
      toast.error('Errore scope: ' + String((err as { message?: string })?.message || err));
    } finally {
      setAddingScopeDomain(false);
    }
  };

  const lifecycleMutation = useMutation({
    mutationFn: async (payload: { action: 'pause_all_services' | 'resume_all_services'; reason?: string }) => {
      const { data, error } = await supabase.functions.invoke('client-services-lifecycle', {
        body: {
          action: payload.action,
          organization_id: organizationId,
          reason: payload.reason || null,
        },
      });
      if (error) throw error;
      const resultPayload = data as LifecycleResponse | null;
      if (resultPayload?.error) throw new Error(resultPayload.error);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['org-feature-flags', organizationId] });
      const actionLabel = variables.action === 'pause_all_services' ? 'Servizi fermati' : 'Servizi riattivati';
      toast.success(actionLabel);
    },
    onError: (err: Error) => toast.error(`Errore lifecycle: ${err.message}`),
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
        .from('darkrisk_entitlements' as never)
        .upsert(payload, { onConflict: 'organization_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['darkrisk-entitlement', organizationId] });
      toast.success('Tier DarkRisk360 aggiornato');
    },
    onError: (err: Error) => toast.error(`Errore tier DarkRisk360: ${err.message}`),
  });

  const updateDarkRiskEstesoProfileMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const payload = {
        organization_id: organizationId,
        enabled,
        manual_only: true,
        identity_model_valid_until: '2026-06-10',
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('darkrisk_esteso_profiles' as never)
        .upsert(payload, { onConflict: 'organization_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['darkrisk-esteso-profile', organizationId] });
      toast.success('Profilo DARKRISK_ESTESO aggiornato');
    },
    onError: (err: Error) => toast.error(`Errore profilo DARKRISK_ESTESO: ${err.message}`),
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
      return ((data || []) as IntegrationRow[]).map((item) => ({
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
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Stato esecuzione servizi</p>
                  <p className="text-xs text-muted-foreground">
                    {orgFlags?.services_paused
                      ? `In pausa${orgFlags?.services_pause_reason ? `: ${orgFlags.services_pause_reason}` : ''}`
                      : 'Attivo: cron e scansioni automatiche abilitate'}
                  </p>
                </div>
                <Button
                  variant={orgFlags?.services_paused ? 'default' : 'destructive'}
                  size="sm"
                  onClick={() => lifecycleMutation.mutate({
                    action: orgFlags?.services_paused ? 'resume_all_services' : 'pause_all_services',
                    reason: orgFlags?.services_paused ? undefined : 'manual_stop_from_client_management',
                  })}
                  disabled={lifecycleMutation.isPending}
                >
                  {lifecycleMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : orgFlags?.services_paused ? (
                    <Play className="w-4 h-4 mr-2" />
                  ) : (
                    <Pause className="w-4 h-4 mr-2" />
                  )}
                  {orgFlags?.services_paused ? 'Riattiva tutti i servizi' : 'Ferma tutti i servizi'}
                </Button>
              </div>

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
                    const patch: Record<string, unknown> = { hicompliance_enabled: v };
                    if (!v) { patch.irp_extended = false; }
                    if (!v) {
                      patch.hicompliance_contract_start = null;
                      patch.hicompliance_contract_years = null;
                    } else {
                      patch.hicompliance_contract_start = hicomplianceStart || new Date().toISOString().slice(0, 10);
                      patch.hicompliance_contract_years = parseContractYears(hicomplianceYears);
                    }
                    updateFlagsMutation.mutate(patch);
                  }}
                />
              </div>

              {orgFlags?.hicompliance_enabled && (
                <div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-2.5">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Data inizio contratto</p>
                      <Input
                        type="date"
                        value={hicomplianceStart}
                        onChange={(e) => setHicomplianceStart(e.target.value)}
                        onBlur={() => updateFlagsMutation.mutate({
                          hicompliance_contract_start: hicomplianceStart || null,
                          hicompliance_contract_years: parseContractYears(hicomplianceYears),
                        })}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Durata (anni)</p>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={hicomplianceYears}
                        onChange={(e) => setHicomplianceYears(e.target.value)}
                        onBlur={() => updateFlagsMutation.mutate({
                          hicompliance_contract_start: hicomplianceStart || null,
                          hicompliance_contract_years: parseContractYears(hicomplianceYears),
                        })}
                      />
                    </div>
                  </div>

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
                      const patch: Record<string, unknown> = { surface_scan360_enabled: v };
                      if (!v) {
                        patch.surface_scan_extended = false;
                        patch.surface_scan_contract_start = null;
                        patch.surface_scan_contract_years = null;
                      } else {
                        patch.surface_scan_contract_start = surfaceStart || new Date().toISOString().slice(0, 10);
                        patch.surface_scan_contract_years = parseContractYears(surfaceYears);
                      }
                      updateFlagsMutation.mutate(patch);
                    }}
                  />
                </div>
              </div>

              {orgFlags?.surface_scan360_enabled && (
                <div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-2.5">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Data inizio contratto</p>
                      <Input
                        type="date"
                        value={surfaceStart}
                        onChange={(e) => setSurfaceStart(e.target.value)}
                        onBlur={() => updateFlagsMutation.mutate({
                          surface_scan_contract_start: surfaceStart || null,
                          surface_scan_contract_years: parseContractYears(surfaceYears),
                        })}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Durata (anni)</p>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={surfaceYears}
                        onChange={(e) => setSurfaceYears(e.target.value)}
                        onBlur={() => updateFlagsMutation.mutate({
                          surface_scan_contract_start: surfaceStart || null,
                          surface_scan_contract_years: parseContractYears(surfaceYears),
                        })}
                      />
                    </div>
                  </div>

                  <div className="rounded-md border p-2.5 space-y-1.5">
                    <p className="text-xs text-muted-foreground">Aggiungi dominio allo scope</p>
                    <div className="flex gap-2">
                      <Input
                        value={scopeDomain}
                        onChange={(e) => setScopeDomain(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleAddScopeDomain(); }}
                        placeholder="es. azienda.it"
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleAddScopeDomain()}
                        disabled={addingScopeDomain || !scopeDomain.trim()}
                      >
                        {addingScopeDomain ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Aggiungi'}
                      </Button>
                    </div>
                  </div>

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
                    value={String(darkRiskEntitlement?.tier || 'standard') === 'extended' ? 'extended' : 'standard'}
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
                      const patch: Record<string, unknown> = { dark_risk360_enabled: v };
                      if (!v) {
                        patch.dark_risk_contract_start = null;
                        patch.dark_risk_contract_years = null;
                        patch.darkrisk_esteso_enabled = false;
                      } else {
                        patch.dark_risk_contract_start = darkRiskStart || new Date().toISOString().slice(0, 10);
                        patch.dark_risk_contract_years = parseContractYears(darkRiskYears);
                      }
                      await updateFlagsMutation.mutateAsync(patch);
                      if (v) {
                        await updateDarkRiskTierMutation.mutateAsync(
                          (String(darkRiskEntitlement?.tier || 'standard') === 'extended' ? 'extended' : 'standard')
                        );
                      } else {
                        await updateDarkRiskEstesoProfileMutation.mutateAsync(false);
                      }
                    }}
                  />
                </div>
              </div>

              {orgFlags?.dark_risk360_enabled && (
                <div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-2.5">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Data inizio contratto</p>
                      <Input
                        type="date"
                        value={darkRiskStart}
                        onChange={(e) => setDarkRiskStart(e.target.value)}
                        onBlur={() => updateFlagsMutation.mutate({
                          dark_risk_contract_start: darkRiskStart || null,
                          dark_risk_contract_years: parseContractYears(darkRiskYears),
                        })}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Durata (anni)</p>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={darkRiskYears}
                        onChange={(e) => setDarkRiskYears(e.target.value)}
                        onBlur={() => updateFlagsMutation.mutate({
                          dark_risk_contract_start: darkRiskStart || null,
                          dark_risk_contract_years: parseContractYears(darkRiskYears),
                        })}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-2.5">
                    <div className="flex items-center gap-3">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Tier DarkRisk360</p>
                        <p className="text-xs text-muted-foreground">Standard o Estesa sullo stesso modulo</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {String(darkRiskEntitlement?.tier || 'standard') === 'extended' ? 'Estesa' : 'Standard'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="w-4 h-4 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium">DARKRISK_ESTESO (MVP)</p>
                        <p className="text-xs text-muted-foreground">Manual-only, usa IntelX Search + Leaks senza Firecrawl.</p>
                      </div>
                    </div>
                    <Switch
                      checked={!!orgFlags?.darkrisk_esteso_enabled}
                      disabled={updateFlagsMutation.isPending || updateDarkRiskEstesoProfileMutation.isPending}
                      onCheckedChange={async (v) => {
                        const patch: Record<string, unknown> = { darkrisk_esteso_enabled: v };
                        if (v) {
                          patch.dark_risk360_enabled = true;
                          patch.dark_risk_contract_start = darkRiskStart || new Date().toISOString().slice(0, 10);
                          patch.dark_risk_contract_years = parseContractYears(darkRiskYears);
                        }
                        await updateFlagsMutation.mutateAsync(patch);
                        await updateDarkRiskEstesoProfileMutation.mutateAsync(v);
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-2.5">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Profilo esteso</p>
                        <p className="text-xs text-muted-foreground">Scadenza modello identity e policy operativa.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        manual_only: {String(darkRiskEstesoProfile?.manual_only ?? true)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        valid_until: {darkRiskEstesoProfile?.identity_model_valid_until || '2026-06-10'}
                      </Badge>
                    </div>
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
