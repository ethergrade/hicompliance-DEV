import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useContactDirectory } from '@/hooks/useContactDirectory';
import { DirectoryContact } from '@/types/irp';

// Props per uso standalone (con Dialog interno)
interface DialogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactSaved: (contact?: DirectoryContact) => void;
  editContact?: DirectoryContact | null;
}

// Props per uso inline (senza Dialog, solo form)
interface InlineFormProps {
  defaultValues?: DirectoryContact;
  onSubmit: (data: Omit<DirectoryContact, 'id' | 'organization_id' | 'created_at' | 'updated_at'>) => Promise<boolean>;
  onCancel: () => void;
}

export type ContactDirectoryFormProps = DialogFormProps | InlineFormProps;

// Type guard per distinguere le props
function isDialogProps(props: ContactDirectoryFormProps): props is DialogFormProps {
  return 'open' in props;
}

// Componente interno per il form
const FormContent: React.FC<{
  formData: {
    first_name: string;
    last_name: string;
    job_title: string;
    phone: string;
    email: string;
    notes: string;
  };
  loading: boolean;
  isEdit: boolean;
  onInputChange: (field: string, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}> = ({ formData, loading, isEdit, onInputChange, onSubmit, onCancel }) => {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first_name" className="text-foreground">Nome</Label>
          <Input
            id="first_name"
            value={formData.first_name}
            onChange={(e) => onInputChange('first_name', e.target.value)}
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
            onChange={(e) => onInputChange('last_name', e.target.value)}
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
          onChange={(e) => onInputChange('job_title', e.target.value)}
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
            onChange={(e) => onInputChange('phone', e.target.value)}
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
            onChange={(e) => onInputChange('email', e.target.value)}
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
          onChange={(e) => onInputChange('notes', e.target.value)}
          placeholder="Note opzionali..."
          className="bg-background border-border min-h-[80px]"
        />
      </div>

      <div className="flex gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1"
        >
          Annulla
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="flex-1 bg-primary text-primary-foreground"
        >
          {loading ? 'Salvataggio...' : (isEdit ? 'Aggiorna' : 'Aggiungi')}
        </Button>
      </div>
    </form>
  );
};

export const ContactDirectoryForm: React.FC<ContactDirectoryFormProps> = (props) => {
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

  const isDialog = isDialogProps(props);
  const editContact = isDialog ? props.editContact : props.defaultValues;

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
  }, [editContact]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isDialog) {
        // Dialog mode
        if (props.editContact) {
          const success = await updateContact(props.editContact.id, formData);
          if (success) {
            props.onOpenChange(false);
            props.onContactSaved();
          }
        } else {
          const newContact = await addContact(formData);
          if (newContact) {
            props.onOpenChange(false);
            props.onContactSaved(newContact);
          }
        }
      } else {
        // Inline mode - use provided onSubmit
        await props.onSubmit(formData);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (isDialog) {
      props.onOpenChange(false);
    } else {
      props.onCancel();
    }
  };

  if (isDialog) {
    return (
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {props.editContact ? 'Modifica Contatto Rubrica' : 'Aggiungi alla Rubrica'}
            </DialogTitle>
          </DialogHeader>
          <FormContent
            formData={formData}
            loading={loading}
            isEdit={!!props.editContact}
            onInputChange={handleInputChange}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Inline mode - just return the form
  return (
    <FormContent
      formData={formData}
      loading={loading}
      isEdit={!!props.defaultValues}
      onInputChange={handleInputChange}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
};
