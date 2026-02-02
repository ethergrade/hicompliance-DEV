import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useContactDirectory } from '@/hooks/useContactDirectory';
import { DirectoryContact } from '@/types/irp';

interface ContactDirectoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactSaved: (contact?: DirectoryContact) => void;
  editContact?: DirectoryContact | null;
}

export const ContactDirectoryForm: React.FC<ContactDirectoryFormProps> = ({
  open,
  onOpenChange,
  onContactSaved,
  editContact
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    job_title: '',
    phone: '',
    email: '',
    notes: ''
  });
  const { addContact, updateContact } = useContactDirectory();

  useEffect(() => {
    if (editContact) {
      setFormData({
        first_name: editContact.first_name || '',
        last_name: editContact.last_name || '',
        job_title: editContact.job_title || '',
        phone: editContact.phone || '',
        email: editContact.email || '',
        notes: editContact.notes || ''
      });
    } else {
      setFormData({
        first_name: '',
        last_name: '',
        job_title: '',
        phone: '',
        email: '',
        notes: ''
      });
    }
  }, [editContact, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editContact) {
        const success = await updateContact(editContact.id, formData);
        if (success) {
          onOpenChange(false);
          onContactSaved();
        }
      } else {
        const newContact = await addContact(formData);
        if (newContact) {
          onOpenChange(false);
          onContactSaved(newContact);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editContact ? 'Modifica Contatto Rubrica' : 'Aggiungi alla Rubrica'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name" className="text-foreground">Nome</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => handleInputChange('first_name', e.target.value)}
                required
                placeholder="Mario"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name" className="text-foreground">Cognome</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => handleInputChange('last_name', e.target.value)}
                required
                placeholder="Rossi"
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job_title" className="text-foreground">Titolo Aziendale</Label>
            <Input
              id="job_title"
              value={formData.job_title}
              onChange={(e) => handleInputChange('job_title', e.target.value)}
              placeholder="es. IT Manager, CISO, CTO"
              className="bg-background border-border"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-foreground">Telefono</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="+39 333 1234567"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="email@azienda.com"
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-foreground">Note</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Note opzionali..."
              className="bg-background border-border min-h-[80px]"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary text-primary-foreground"
            >
              {loading ? 'Salvataggio...' : (editContact ? 'Aggiorna' : 'Aggiungi')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
