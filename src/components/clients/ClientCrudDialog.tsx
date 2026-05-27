import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { tenantsApi } from '@/lib/api';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: { id: string; name: string; ms_tenant_id: string | null } | null;
  onSaved: () => void;
}

const ClientCrudDialog: React.FC<Props> = ({ open, onOpenChange, organization, onSaved }) => {
  const [name, setName] = useState('');
  const [msTenantId, setMsTenantId] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = !!organization;

  useEffect(() => {
    if (organization) {
      setName(organization.name);
      setMsTenantId(organization.ms_tenant_id || '');
    } else {
      setName('');
      setMsTenantId('');
    }
  }, [organization, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Il nome è obbligatorio');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await tenantsApi.update(organization!.id, {
          name: name.trim(),
          ms_tenant_id: msTenantId.trim() || null,
        });
        toast.success('Cliente aggiornato');
      } else {
        await tenantsApi.create({
          name: name.trim(),
          ms_tenant_id: msTenantId.trim() || null,
        });
        toast.success('Cliente creato');
      }
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nel salvataggio';
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
            <Label>Customer Code</Label>
            <Input value={msTenantId} onChange={e => setMsTenantId(e.target.value)} placeholder="es. HC-001" />
          </div>
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
