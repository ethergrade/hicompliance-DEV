import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { companiesApi } from '@/lib/api/tenants';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { getErrorDetail } from "@/lib/api-client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: { id: string; name: string; code: string } | null;
  onSaved: () => void;
  /** Se fornito, usa questo groupId invece di prenderlo da useClientOrganization */
  groupId?: string | null;
}

const ClientCrudDialog: React.FC<Props> = ({ open, onOpenChange, organization, onSaved, groupId: explicitGroupId }) => {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const { selectedOrganization } = useClientOrganization();
  const isEdit = !!organization;

  useEffect(() => {
    if (organization) {
      setName(organization.name);
    } else {
      setName('');
    }
  }, [organization, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Il nome è obbligatorio');
      return;
    }
    const groupId = explicitGroupId ?? selectedOrganization?.group_id;
    if (!groupId) {
      toast.error('Gruppo non trovato — impossibile salvare');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await companiesApi.update(organization!.id, { name: name.trim() }, groupId);
        toast.success('Cliente aggiornato');
      } else {
        await companiesApi.create({ name: name.trim() }, groupId);
        toast.success('Cliente creato — attiva i servizi dal pannello Servizi');
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(getErrorDetail(err));
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
          {!isEdit && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground">
                I servizi (HiCompliance, SurfaceScan360, DarkRisk360) si attivano
dal pannello <strong>Servizi</strong> del cliente dopo la creazione.
              </p>
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
