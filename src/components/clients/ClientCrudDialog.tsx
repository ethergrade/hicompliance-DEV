import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ShieldCheck, Globe, Eye, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: { id: string; name: string; code: string } | null;
  onSaved: () => void;
}

interface SupabaseEdgeErrorLike {
  message?: string;
}

const ClientCrudDialog: React.FC<Props> = ({ open, onOpenChange, organization, onSaved }) => {
  const todayDate = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [hicompliance, setHicompliance] = useState(false);
  const [surfaceScan, setSurfaceScan] = useState(false);
  const [darkRisk, setDarkRisk] = useState(false);
  const [darkRiskEsteso, setDarkRiskEsteso] = useState(false);
  const [surfaceScanTier, setSurfaceScanTier] = useState<'standard' | 'extended'>('standard');
  const [darkRiskTier, setDarkRiskTier] = useState<'standard' | 'extended'>('standard');
  const [hicomplianceStart, setHicomplianceStart] = useState(todayDate);
  const [hicomplianceYears, setHicomplianceYears] = useState('1');
  const [surfaceStart, setSurfaceStart] = useState(todayDate);
  const [surfaceYears, setSurfaceYears] = useState('1');
  const [darkRiskStart, setDarkRiskStart] = useState(todayDate);
  const [darkRiskYears, setDarkRiskYears] = useState('1');
  const [saving, setSaving] = useState(false);
  const isEdit = !!organization;

  useEffect(() => {
    if (organization) {
      setName(organization.name);
      setCode(organization.code);
    } else {
      setName('');
      setCode('');
      setHicompliance(false);
      setSurfaceScan(false);
      setDarkRisk(false);
      setDarkRiskEsteso(false);
      setSurfaceScanTier('standard');
      setDarkRiskTier('standard');
      setHicomplianceStart(todayDate);
      setHicomplianceYears('1');
      setSurfaceStart(todayDate);
      setSurfaceYears('1');
      setDarkRiskStart(todayDate);
      setDarkRiskYears('1');
    }
  }, [organization, open, todayDate]);

  const parseContractYears = (value: string): number => {
    const parsed = Number.parseInt(String(value || '1'), 10);
    if (Number.isNaN(parsed)) return 1;
    return Math.max(1, Math.min(10, parsed));
  };

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) {
      toast.error('Nome e codice sono obbligatori');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase
          .from('organizations')
          .update({ name: name.trim(), code: code.trim() })
          .eq('id', organization!.id);
        if (error) throw error;
        toast.success('Cliente aggiornato');
      } else {
        const { data: createdOrganization, error } = await supabase
          .from('organizations')
          .insert({
            name: name.trim(),
            code: code.trim(),
            hicompliance_enabled: hicompliance,
            surface_scan360_enabled: surfaceScan,
            surface_scan_extended: surfaceScan && surfaceScanTier === 'extended',
            pentest_tools_auto_validation: surfaceScan,
            dark_risk360_enabled: darkRisk || darkRiskEsteso,
            darkrisk_esteso_enabled: darkRiskEsteso,
            hicompliance_contract_start: hicompliance ? hicomplianceStart : null,
            hicompliance_contract_years: hicompliance ? parseContractYears(hicomplianceYears) : null,
            surface_scan_contract_start: surfaceScan ? surfaceStart : null,
            surface_scan_contract_years: surfaceScan ? parseContractYears(surfaceYears) : null,
            dark_risk_contract_start: (darkRisk || darkRiskEsteso) ? darkRiskStart : null,
            dark_risk_contract_years: (darkRisk || darkRiskEsteso) ? parseContractYears(darkRiskYears) : null,
          } as never)
          .select('id')
          .single();
        if (error) throw error;

        if ((darkRisk || darkRiskEsteso) && createdOrganization?.id) {
          const { error: tierError } = await supabase
            .from('darkrisk_entitlements' as never)
            .upsert(
              {
                organization_id: createdOrganization.id,
                tier: darkRiskTier,
                enabled: true,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'organization_id' },
            );

          if (tierError) {
            const missingRelation = String((tierError as { code?: string } | null)?.code || '') === '42P01';
            if (!missingRelation) throw tierError;
          }
        }

        if (darkRiskEsteso && createdOrganization?.id) {
          const { error: estesoProfileError } = await supabase
            .from('darkrisk_esteso_profiles' as never)
            .upsert(
              {
                organization_id: createdOrganization.id,
                enabled: true,
                manual_only: true,
                identity_model_valid_until: '2026-06-10',
                updated_at: new Date().toISOString(),
              } as never,
              { onConflict: 'organization_id' },
            );

          if (estesoProfileError) {
            const missingRelation = String((estesoProfileError as { code?: string } | null)?.code || '') === '42P01';
            if (!missingRelation) throw estesoProfileError;
          }
        }

        toast.success('Cliente creato');
      }
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = (err as SupabaseEdgeErrorLike)?.message || 'Errore nel salvataggio';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifica Cliente' : 'Nuovo Cliente'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome organizzazione</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="es. Azienda SRL" />
          </div>
          <div className="space-y-2">
            <Label>Codice cliente</Label>
            <Input value={code} onChange={e => setCode(e.target.value)} placeholder="es. AZ-001" />
          </div>

          {!isEdit && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Servizi da abilitare</Label>
                <p className="text-xs text-muted-foreground">Potrai modificarli in qualunque momento dal pannello Servizi del cliente.</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">HiCompliance</p>
                      <p className="text-xs text-muted-foreground">Assessment, Analisi, Remediation, Incident</p>
                    </div>
                  </div>
                  <Switch checked={hicompliance} onCheckedChange={setHicompliance} />
                </div>
                {hicompliance && (
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Inizio contratto</Label>
                      <Input type="date" value={hicomplianceStart} onChange={(e) => setHicomplianceStart(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Anni contratto</Label>
                      <Input type="number" min={1} max={10} value={hicomplianceYears} onChange={(e) => setHicomplianceYears(e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">SurfaceScan360</p>
                      <p className="text-xs text-muted-foreground">Scansione attack surface esterna</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={surfaceScanTier}
                      onValueChange={(value) => setSurfaceScanTier(value === 'extended' ? 'extended' : 'standard')}
                    >
                      <SelectTrigger className="h-8 w-[132px]">
                        <SelectValue placeholder="Livello" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="extended">Estesa</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch checked={surfaceScan} onCheckedChange={setSurfaceScan} />
                  </div>
                </div>
                {surfaceScan && (
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Inizio contratto SurfaceScan360</Label>
                      <Input type="date" value={surfaceStart} onChange={(e) => setSurfaceStart(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Anni contratto</Label>
                      <Input type="number" min={1} max={10} value={surfaceYears} onChange={(e) => setSurfaceYears(e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">DarkRisk360</p>
                      <p className="text-xs text-muted-foreground">Monitoraggio dark web e leak</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={darkRiskTier}
                      onValueChange={(value) => setDarkRiskTier(value === 'extended' ? 'extended' : 'standard')}
                    >
                      <SelectTrigger className="h-8 w-[132px]">
                        <SelectValue placeholder="Livello" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="extended">Estesa</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch checked={darkRisk} onCheckedChange={setDarkRisk} />
                  </div>
                </div>
                {darkRisk && (
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Inizio contratto DarkRisk360</Label>
                      <Input type="date" value={darkRiskStart} onChange={(e) => setDarkRiskStart(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Anni contratto</Label>
                      <Input type="number" min={1} max={10} value={darkRiskYears} onChange={(e) => setDarkRiskYears(e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="w-4 h-4 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium">DARKRISK_ESTESO (Super Admin)</p>
                      <p className="text-xs text-muted-foreground">MVP manuale: IntelX Search + Leaks, senza Firecrawl, valido fino al 10/06/2026.</p>
                    </div>
                  </div>
                  <Switch
                    checked={darkRiskEsteso}
                    onCheckedChange={(value) => {
                      setDarkRiskEsteso(value);
                      if (value) setDarkRisk(true);
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvataggio...' : isEdit ? 'Salva' : 'Crea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClientCrudDialog;
