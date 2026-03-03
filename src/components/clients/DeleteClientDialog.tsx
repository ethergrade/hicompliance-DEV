import React, { useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: { id: string; name: string } | null;
  onDeleted: () => void;
}

const DeleteClientDialog: React.FC<Props> = ({ open, onOpenChange, organization, onDeleted }) => {
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!organization) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', organization.id);
      if (error) throw error;
      toast.success(`Cliente "${organization.name}" eliminato`);
      onDeleted();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Errore nell\'eliminazione');
    } finally {
      setDeleting(false);
      setConfirm('');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Elimina Cliente</AlertDialogTitle>
          <AlertDialogDescription>
            Questa azione e' irreversibile. Tutti i dati associati a <strong>{organization?.name}</strong> verranno eliminati.
            <br /><br />
            Digita <strong>{organization?.name}</strong> per confermare:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Nome organizzazione..."
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirm('')}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={confirm !== organization?.name || deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? 'Eliminazione...' : 'Elimina definitivamente'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteClientDialog;
