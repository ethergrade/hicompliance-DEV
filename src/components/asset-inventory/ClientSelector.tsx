import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface Organization {
  id: string;
  name: string;
  code: string;
}

interface ClientSelectorProps {
  selectedOrgId: string | null;
  onOrgChange: (orgId: string) => void;
  disabled?: boolean;
}

export const ClientSelector: React.FC<ClientSelectorProps> = ({ 
  selectedOrgId, 
  onOrgChange,
  disabled = false 
}) => {
  const { toast } = useToast();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgCode, setNewOrgCode] = useState('');

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, code')
        .order('name');

      if (error) throw error;
      setOrganizations(data || []);
    } catch (error) {
      console.error('Error loading organizations:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento delle organizzazioni",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!newOrgName.trim() || !newOrgCode.trim()) {
      toast({
        title: "Errore",
        description: "Inserisci nome e codice dell'organizzazione",
        variant: "destructive"
      });
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('organizations')
        .insert({
          name: newOrgName.trim(),
          code: newOrgCode.trim()
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Cliente creato con successo"
      });

      setOrganizations(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      onOrgChange(data.id);
      setDialogOpen(false);
      setNewOrgName('');
      setNewOrgCode('');
    } catch (error) {
      console.error('Error creating organization:', error);
      toast({
        title: "Errore",
        description: "Errore durante la creazione del cliente",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <Label htmlFor="client-select">Seleziona Cliente</Label>
        <Select 
          value={selectedOrgId || ''} 
          onValueChange={onOrgChange}
          disabled={disabled || loading}
        >
          <SelectTrigger id="client-select" className="w-full">
            <SelectValue placeholder={loading ? "Caricamento..." : "Seleziona un cliente"} />
          </SelectTrigger>
          <SelectContent>
            {organizations.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                {org.name} ({org.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" disabled={disabled}>
            <Plus className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crea Nuovo Cliente</DialogTitle>
            <DialogDescription>
              Inserisci i dati del nuovo cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Nome Organizzazione</Label>
              <Input
                id="org-name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Es. Acme Corporation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-code">Codice</Label>
              <Input
                id="org-code"
                value={newOrgCode}
                onChange={(e) => setNewOrgCode(e.target.value)}
                placeholder="Es. ACME"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleCreateOrganization} disabled={creating}>
              {creating ? 'Creazione...' : 'Crea Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
