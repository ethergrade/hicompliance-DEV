import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EmergencyContactFormProps {
  onContactAdded: () => void;
}

export const EmergencyContactForm: React.FC<EmergencyContactFormProps> = ({ onContactAdded }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    role: '',
    phone: '',
    email: '',
    category: '',
    newCategory: ''
  });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Get current user first
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        toast({
          title: "Errore",
          description: "Utente non autenticato",
          variant: "destructive"
        });
        return;
      }

      // Get user's organization
      const { data: userData, error: orgError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (orgError || !userData?.organization_id) {
        console.error('Organization error:', orgError);
        toast({
          title: "Errore",
          description: "Organizzazione non trovata. Contatta l'amministratore.",
          variant: "destructive"
        });
        return;
      }

      const finalCategory = formData.category === 'new' ? formData.newCategory : formData.category;
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();

      const { error } = await supabase
        .from('emergency_contacts')
        .insert({
          name: fullName,
          role: formData.role,
          phone: formData.phone,
          email: formData.email,
          category: finalCategory,
          organization_id: userData.organization_id
        });

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Contatto di emergenza aggiunto con successo"
      });

      setFormData({ 
        firstName: '', 
        lastName: '', 
        role: '', 
        phone: '', 
        email: '', 
        category: '', 
        newCategory: '' 
      });
      setShowNewCategory(false);
      setOpen(false);
      onContactAdded();
    } catch (error) {
      console.error('Error adding contact:', error);
      toast({
        title: "Errore",
        description: "Errore durante l'aggiunta del contatto",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (field === 'category') {
      setShowNewCategory(value === 'new');
      if (value !== 'new') {
        setFormData(prev => ({ ...prev, newCategory: '' }));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-primary text-primary-foreground">
          <Plus className="w-4 h-4 mr-1" />
          Aggiungi Contatto
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white">Aggiungi Contatto di Emergenza</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-white">Nome</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                required
                placeholder="Mario"
                className="bg-background border-border text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-white">Cognome</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                required
                placeholder="Rossi"
                className="bg-background border-border text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role" className="text-white">Ruolo</Label>
            <Input
              id="role"
              value={formData.role}
              onChange={(e) => handleInputChange('role', e.target.value)}
              required
              placeholder="es. Chief Information Security Officer"
              className="bg-background border-border text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-white">Telefono</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              required
              placeholder="es. +39 02 1234 5678"
              className="bg-background border-border text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-white">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              required
              placeholder="es. security@company.com"
              className="bg-background border-border text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category" className="text-white">Categoria</Label>
            <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
              <SelectTrigger className="bg-background border-border text-white">
                <SelectValue placeholder="Seleziona categoria" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="security" className="text-white">Team di Sicurezza</SelectItem>
                <SelectItem value="it" className="text-white">Team IT</SelectItem>
                <SelectItem value="authorities" className="text-white">Autorità e Partner</SelectItem>
                <SelectItem value="new" className="text-white">+ Nuova Categoria</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showNewCategory && (
            <div className="space-y-2">
              <Label htmlFor="newCategory" className="text-white">Nome Nuova Categoria</Label>
              <Input
                id="newCategory"
                value={formData.newCategory}
                onChange={(e) => handleInputChange('newCategory', e.target.value)}
                required={formData.category === 'new'}
                placeholder="es. Team Legale, Fornitori..."
                className="bg-background border-border text-white"
              />
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Annulla
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground">
              {loading ? 'Salvataggio...' : 'Salva Contatto'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};