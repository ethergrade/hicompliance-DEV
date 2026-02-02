import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { EmergencyContact, IRP_ROLES } from '@/types/irp';

interface IRPContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactSaved: () => void;
  editContact?: EmergencyContact | null;
}

export const IRPContactForm: React.FC<IRPContactFormProps> = ({ 
  open, 
  onOpenChange, 
  onContactSaved,
  editContact 
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    jobTitle: '',
    irpRole: '',
    phone: '',
    email: '',
    responsibilities: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    if (editContact) {
      const nameParts = editContact.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      setFormData({
        firstName,
        lastName,
        jobTitle: editContact.job_title || editContact.role || '',
        irpRole: editContact.irp_role || '',
        phone: editContact.phone || '',
        email: editContact.email || '',
        responsibilities: editContact.responsibilities || ''
      });
    } else {
      setFormData({
        firstName: '',
        lastName: '',
        jobTitle: '',
        irpRole: '',
        phone: '',
        email: '',
        responsibilities: ''
      });
    }
  }, [editContact, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        toast({
          title: "Errore",
          description: "Utente non autenticato",
          variant: "destructive"
        });
        return;
      }

      const { data: userData, error: orgError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (orgError || !userData?.organization_id) {
        toast({
          title: "Errore",
          description: "Organizzazione non trovata",
          variant: "destructive"
        });
        return;
      }

      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      const contactData = {
        name: fullName,
        role: formData.jobTitle, // Keep for backward compatibility
        job_title: formData.jobTitle,
        irp_role: formData.irpRole,
        phone: formData.phone,
        email: formData.email,
        responsibilities: formData.responsibilities,
        category: 'governance', // New category for governance contacts
        organization_id: userData.organization_id
      };

      if (editContact) {
        const { error } = await supabase
          .from('emergency_contacts')
          .update(contactData)
          .eq('id', editContact.id);

        if (error) throw error;

        toast({
          title: "Successo",
          description: "Contatto aggiornato con successo"
        });
      } else {
        const { error } = await supabase
          .from('emergency_contacts')
          .insert(contactData);

        if (error) throw error;

        toast({
          title: "Successo",
          description: "Contatto aggiunto con successo"
        });
      }

      onOpenChange(false);
      onContactSaved();
    } catch (error) {
      console.error('Error saving contact:', error);
      toast({
        title: "Errore",
        description: "Errore durante il salvataggio del contatto",
        variant: "destructive"
      });
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
            {editContact ? 'Modifica Contatto' : 'Aggiungi Contatto Governance'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-foreground">Nome</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                required
                placeholder="Mario"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-foreground">Cognome</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                required
                placeholder="Rossi"
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobTitle" className="text-foreground">Titolo Aziendale</Label>
            <Input
              id="jobTitle"
              value={formData.jobTitle}
              onChange={(e) => handleInputChange('jobTitle', e.target.value)}
              required
              placeholder="es. IT MANAGER, CISO, CTO"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="irpRole" className="text-foreground">Ruolo IRP</Label>
            <Select value={formData.irpRole} onValueChange={(value) => handleInputChange('irpRole', value)}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Seleziona ruolo IRP" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {IRP_ROLES.map((role) => (
                  <SelectItem key={role} value={role} className="text-foreground">
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-foreground">Telefono</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                required
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
                required
                placeholder="email@azienda.com"
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="responsibilities" className="text-foreground">Responsabilità</Label>
            <Textarea
              id="responsibilities"
              value={formData.responsibilities}
              onChange={(e) => handleInputChange('responsibilities', e.target.value)}
              placeholder="Descrivi le responsabilità nel piano IRP..."
              className="bg-background border-border min-h-[100px]"
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
