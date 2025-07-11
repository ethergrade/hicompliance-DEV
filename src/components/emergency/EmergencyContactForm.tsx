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
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    phone: '',
    email: '',
    category: ''
  });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Get current user's organization
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!userData?.organization_id) {
        toast({
          title: "Errore",
          description: "Organizzazione non trovata",
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('emergency_contacts')
        .insert({
          ...formData,
          organization_id: userData.organization_id
        });

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Contatto di emergenza aggiunto con successo"
      });

      setFormData({ name: '', role: '', phone: '', email: '', category: '' });
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
          <div className="space-y-2">
            <Label htmlFor="name" className="text-white">Nome/Ruolo</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              required
              placeholder="es. CISO, Security Manager..."
              className="bg-background border-border text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role" className="text-white">Descrizione Ruolo</Label>
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
              </SelectContent>
            </Select>
          </div>

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