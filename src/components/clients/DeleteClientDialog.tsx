import React, { useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { tenantsApi } from '@/lib/api';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: { id: string; name: string } | null;
  groupId?: string | null;
  onDeleted: (id: string) => void;
}

const DeleteClientDialog: React.FC<Props> = ({ open, onOpenChange, organization, groupId, onDeleted }) => {
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!organization) return;
    setDeleting(true);
    try {
      await tenantsApi.delete(organization.id, groupId ?? undefined);
      // La cancellazione è asincrona (gira in background): confermiamo l'avvio e
      // togliamo subito la riga dalla lista (rimozione ottimistica).
      toast.success(`Eliminazione di "${organization.name}" avviata — verrà rimosso a breve`);
      onDeleted(organization.id);
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore nell'eliminazione";
      toast.error(message);
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
            L'eliminazione avviene in background e puo' richiedere qualche minuto.
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
