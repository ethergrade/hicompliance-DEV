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
import { ShieldCheck, Globe, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: { id: string; name: string; code: string } | null;
  onSaved: () => void;
}

const ClientCrudDialog: React.FC<Props> = ({ open, onOpenChange, organization, onSaved }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [hicompliance, setHicompliance] = useState(false);
  const [surfaceScan, setSurfaceScan] = useState(false);
  const [darkRisk, setDarkRisk] = useState(false);
  const [surfaceScanTier, setSurfaceScanTier] = useState<'standard' | 'extended'>('standard');
  const [darkRiskTier, setDarkRiskTier] = useState<'standard' | 'extended'>('standard');
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
      setSurfaceScanTier('standard');
      setDarkRiskTier('standard');
    }
  }, [organization, open]);

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
            dark_risk360_enabled: darkRisk,
          } as any)
          .select('id')
          .single();
        if (error) throw error;

        if (darkRisk && createdOrganization?.id) {
          const { error: tierError } = await supabase
            .from('darkrisk_entitlements' as any)
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
            const missingRelation = String((tierError as any)?.code || '') === '42P01';
            if (!missingRelation) throw tierError;
          }
        }

        toast.success('Cliente creato');
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Errore nel salvataggio');
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
