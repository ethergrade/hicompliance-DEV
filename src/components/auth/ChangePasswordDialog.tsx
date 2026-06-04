import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({ open, onOpenChange }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({});
  };

  const handleClose = (value: boolean) => {
    if (!value) reset();
    onOpenChange(value);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!currentPassword.trim()) errs.current_password = 'La password corrente è obbligatoria';
    if (!newPassword.trim()) {
      errs.password = 'La nuova password è obbligatoria';
    } else if (newPassword.length < 8) {
      errs.password = 'La password deve essere di almeno 8 caratteri';
    }
    if (!confirmPassword.trim()) {
      errs.confirm_password = 'Conferma la nuova password';
    } else if (newPassword !== confirmPassword) {
      errs.confirm_password = 'Le password non coincidono';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    try {
      await authApi.changePassword({
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: confirmPassword,
      });
      toast({ title: 'Password aggiornata', description: 'La password è stata cambiata con successo.' });
      handleClose(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const serverErrors = err.errors;
        if (serverErrors) {
          const mapped: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(serverErrors)) {
            if (msgs.length > 0) mapped[key] = msgs[0];
          }
          setErrors(mapped);
          return;
        }
        toast({ title: 'Errore', description: err.message, variant: 'destructive' });
      } else {
        toast({ title: 'Errore', description: 'Impossibile cambiare la password. Riprova più tardi.', variant: 'destructive' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Cambia Password</DialogTitle>
          <DialogDescription>
            Inserisci la password corrente e la nuova password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="current-password">Password Corrente</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setErrors(prev => ({ ...prev, current_password: '' })); }}
              placeholder="••••••••"
            />
            {errors.current_password && (
              <p className="text-sm text-destructive">{errors.current_password}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">Nuova Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setErrors(prev => ({ ...prev, password: '', confirm_password: '' })); }}
              placeholder="Minimo 8 caratteri"
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Conferma Nuova Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setErrors(prev => ({ ...prev, confirm_password: '' })); }}
              placeholder="••••••••"
            />
            {errors.confirm_password && (
              <p className="text-sm text-destructive">{errors.confirm_password}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Salvataggio...' : 'Salva Password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
