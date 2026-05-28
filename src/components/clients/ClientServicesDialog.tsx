import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Activity, Bug, Loader2, Save, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { tenantServicesApi } from "@/lib/api";
import type { TenantServiceResource, StoreTenantServiceRequest } from "@/types/api";

interface ClientServicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Client name for dialog title */
  organizationName?: string;
}

type Duration = "2" | "3" | "4" | "5";

interface HiComplianceSettings {
  duration?: Duration;
  extended_range?: boolean;
}

interface HiTrackSettings {
  duration?: Duration;
  extended_range?: boolean;
}

interface HiPatchSettings {
  connectsecure_company_id?: string;
  ninjaone_organization_id?: string;
  ninjaone_organization_id_client?: string;
  ninjaone_organization_secret?: string;
}

interface ServiceData {
  service_type: string;
  active: boolean;
  settings: HiComplianceSettings | HiTrackSettings | HiPatchSettings;
  saved: boolean;
  saving: boolean;
}

const SERVICES = [
  {
    type: "hicompliance",
    label: "HiCompliance",
    subtitle: "NIS2 Assessment & Compliance",
    icon: Shield,
    defaultSettings: { duration: "3", extended_range: false } satisfies HiComplianceSettings,
  },
  {
    type: "hitrack",
    label: "HiTrack",
    subtitle: "SurfaceScan 360 & Monitoring",
    icon: Activity,
    defaultSettings: { duration: "3", extended_range: false } satisfies HiTrackSettings,
  },
  {
    type: "hipatch",
    label: "HiPatch",
    subtitle: "Vulnerability Assessment Continuativo",
    icon: Bug,
    defaultSettings: {
      connectsecure_company_id: "",
      ninjaone_organization_id: "",
      ninjaone_organization_id_client: "",
      ninjaone_organization_secret: "",
    } satisfies HiPatchSettings,
  },
] as const;

function parseDuration(v: unknown): Duration {
  if (v === "2" || v === "3" || v === "4" || v === "5") return v;
  return "3";
}

function toServiceData(ts: TenantServiceResource | null): ServiceData {
  const type = (ts?.service_type || "hicompliance") as ServiceData["service_type"];
  const cfg = SERVICES.find((s) => s.type === type);
  const defaults = cfg?.defaultSettings ?? {};
  const raw = (ts?.settings as Record<string, unknown> | null) ?? {};
  const settings = { ...defaults, ...raw };

  return {
    service_type: type,
    active: ts?.status === "active",
    settings,
    saved: true,
    saving: false,
  };
}

function buildStorePayload(data: ServiceData): StoreTenantServiceRequest {
  return {
    service_type: data.service_type,
    status: data.active ? "active" : "inactive",
    settings: data.settings,
  };
}

function DurationSelect({
  value,
  onChange,
  disabled,
}: {
  value: Duration;
  onChange: (v: Duration) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs whitespace-nowrap">Durata (anni):</Label>
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        value={value}
        onChange={(e) => onChange(e.target.value as Duration)}
        disabled={disabled}
      >
        {(["2", "3", "4", "5"] as Duration[]).map((d) => (
          <option key={d} value={d}>
            {d} anni
          </option>
        ))}
      </select>
    </div>
  );
}

function ExtendedToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs">Scope esteso</Label>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} size="sm" />
    </div>
  );
}

export default function ClientServicesDialog({ open, onOpenChange, organizationName }: ClientServicesDialogProps) {
  const { toast } = useToast();
  const { organizationId: companyId, groupId, isLoading: orgLoading } = useClientOrganization();
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [dataMap, setDataMap] = useState<Record<string, ServiceData>>({});

  const fetchServices = useCallback(async () => {
    if (!companyId || orgLoading) return;
    setLoading(true);
    try {
      const list = await tenantServicesApi.listByOrganization(companyId);
      const map: Record<string, ServiceData> = {};
      for (const s of SERVICES) {
        const existing = list.find((ts) => ts.service_type === s.type);
        map[s.type] = toServiceData(existing || null);
      }
      setDataMap(map);
    } catch (err: any) {
      toast({ title: "Errore", description: err?.message || "Impossibile caricare i servizi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, orgLoading, toast]);

  useEffect(() => {
    if (open) fetchServices();
  }, [open, fetchServices]);

  const updateService = useCallback(
    (type: string, patch: Partial<Omit<ServiceData, "service_type">>) => {
      setDataMap((prev) => {
        const cur = prev[type];
        if (!cur) return prev;
        return { ...prev, [type]: { ...cur, ...patch, saved: false } };
      });
    },
    []
  );

  const saveService = useCallback(
    async (type: string) => {
      if (!companyId || !groupId) return;
      setDataMap((prev) => ({ ...prev, [type]: { ...prev[type], saving: true } }));
      try {
        const data = dataMap[type];
        const payload = buildStorePayload(data);

        if (data.saved && data.id) {
          // Update existing — need the tenant service ID
          const list = await tenantServicesApi.listByOrganization(companyId);
          const existing = list.find((ts) => ts.service_type === type);
          if (existing) {
            await tenantServicesApi.update(existing.id, payload, groupId);
          } else {
            await tenantServicesApi.create(payload, groupId);
          }
        } else {
          await tenantServicesApi.create(payload, groupId);
        }
        setDataMap((prev) => ({
          ...prev,
          [type]: { ...prev[type], saved: true, saving: false },
        }));
        toast({ title: "Salvato", description: `${SERVICES.find((s) => s.type === type)?.label} aggiornato` });
      } catch (err: any) {
        setDataMap((prev) => ({ ...prev, [type]: { ...prev[type], saving: false } }));
        toast({ title: "Errore", description: err?.message || `Impossibile salvare il servizio`, variant: "destructive" });
      }
    },
    [companyId, groupId, dataMap, toast]
  );

  const saveAll = useCallback(async () => {
    if (!companyId || !groupId) return;
    setSavingAll(true);
    try {
      // Get current list to know what exists
      const list = await tenantServicesApi.listByOrganization(companyId);
      const existingMap: Record<string, TenantServiceResource> = {};
      for (const ts of list) existingMap[ts.service_type] = ts;

      for (const s of SERVICES) {
        const data = dataMap[s.type];
        if (!data) continue;
        const payload = buildStorePayload(data);
        const existing = existingMap[s.type];
        if (existing) {
          await tenantServicesApi.update(existing.id, payload, groupId);
        } else {
          await tenantServicesApi.create(payload, groupId);
        }
        setDataMap((prev) => ({
          ...prev,
          [s.type]: { ...prev[s.type], saved: true, saving: false },
        }));
      }
      toast({ title: "Completato", description: "Tutti i servizi sono stati salvati" });
    } catch (err: any) {
      toast({ title: "Errore", description: err?.message || "Errore nel salvataggio", variant: "destructive" });
    } finally {
      setSavingAll(false);
    }
  }, [companyId, groupId, dataMap, toast]);

  const isPristine = useMemo(() => {
    return Object.values(dataMap).every((d) => d.saved);
  }, [dataMap]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Shield className="w-5 h-5 text-primary" />
            Attivazione Servizi
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Configura e attiva i servizi HiSolution per questo cliente
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] px-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Caricamento servizi...</span>
            </div>
          ) : (
            <div className="space-y-4 pb-6">
              {SERVICES.map((s) => {
                const Icon = s.icon;
                const data = dataMap[s.type];
                if (!data) return null;

                return (
                  <Card key={s.type} className={data.active ? "border-primary/40" : ""}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${data.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <CardTitle className="text-sm">{s.label}</CardTitle>
                            <CardDescription className="text-xs">{s.subtitle}</CardDescription>
                          </div>
                        </div>
                        <Switch
                          checked={data.active}
                          onCheckedChange={(v) => updateService(s.type, { active: v })}
                          aria-label={`Attiva ${s.label}`}
                        />
                      </div>
                    </CardHeader>

                    {data.active && (
                      <CardContent className="pt-0 pb-4 space-y-3">
                        <Separator />

                        {(s.type === "hicompliance" || s.type === "hitrack") && (
                          <div className="space-y-3">
                            <DurationSelect
                              value={parseDuration((data.settings as HiComplianceSettings).duration)}
                              onChange={(v) =>
                                updateService(s.type, {
                                  settings: { ...(data.settings as HiComplianceSettings), duration: v },
                                })
                              }
                              disabled={data.saving}
                            />
                            <ExtendedToggle
                              checked={Boolean((data.settings as HiComplianceSettings).extended_range)}
                              onChange={(v) =>
                                updateService(s.type, {
                                  settings: { ...(data.settings as HiComplianceSettings), extended_range: v },
                                })
                              }
                              disabled={data.saving}
                            />
                          </div>
                        )}

                        {s.type === "hipatch" && (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <Label className="text-xs">ConnectSecure Company ID</Label>
                              <Input
                                placeholder="ID azienda ConnectSecure"
                                value={(data.settings as HiPatchSettings).connectsecure_company_id || ""}
                                onChange={(e) =>
                                  updateService(s.type, {
                                    settings: { ...(data.settings as HiPatchSettings), connectsecure_company_id: e.target.value },
                                  })
                                }
                                disabled={data.saving}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">NinjaOne Organization ID</Label>
                              <Input
                                placeholder="ID organizzazione NinjaOne"
                                value={(data.settings as HiPatchSettings).ninjaone_organization_id || ""}
                                onChange={(e) =>
                                  updateService(s.type, {
                                    settings: { ...(data.settings as HiPatchSettings), ninjaone_organization_id: e.target.value },
                                  })
                                }
                                disabled={data.saving}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">NinjaOne Client ID (secret)</Label>
                              <Input
                                type="password"
                                placeholder="Client ID segreto"
                                value={(data.settings as HiPatchSettings).ninjaone_organization_id_client || ""}
                                onChange={(e) =>
                                  updateService(s.type, {
                                    settings: { ...(data.settings as HiPatchSettings), ninjaone_organization_id_client: e.target.value },
                                  })
                                }
                                disabled={data.saving}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">NinjaOne Secret (secret)</Label>
                              <Input
                                type="password"
                                placeholder="Chiave segreta NinjaOne"
                                value={(data.settings as HiPatchSettings).ninjaone_organization_secret || ""}
                                onChange={(e) =>
                                  updateService(s.type, {
                                    settings: { ...(data.settings as HiPatchSettings), ninjaone_organization_secret: e.target.value },
                                  })
                                }
                                disabled={data.saving}
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveService(s.type)}
                            disabled={data.saved || data.saving || savingAll}
                            className="gap-1"
                          >
                            {data.saving ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : data.saved ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Save className="w-3 h-3" />
                            )}
                            {data.saving ? "Salvataggio..." : data.saved ? "Salvato" : "Salva"}
                          </Button>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
          <Button onClick={saveAll} disabled={isPristine || savingAll || loading} className="gap-1">
            {savingAll && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            Salva tutto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
