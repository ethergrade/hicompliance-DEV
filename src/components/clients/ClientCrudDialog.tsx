import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
  const [saving, setSaving] = useState(false);
  const isEdit = !!organization;

  useEffect(() => {
    if (organization) {
      setName(organization.name);
      setCode(organization.code);
    } else {
      setName('');
      setCode('');
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
        const { error } = await supabase
          .from('organizations')
          .insert({ name: name.trim(), code: code.trim() });
        if (error) throw error;
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
