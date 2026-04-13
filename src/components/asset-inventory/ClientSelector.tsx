import React, { useEffect, useState } from 'react';
import { tenantsApi } from '@/lib/api';
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
      const tenants = await tenantsApi.listAll();
      setOrganizations(
        tenants
          .map(t => ({ id: String(t.id), name: t.name, code: t.ms_tenant_id || String(t.id) }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
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
      const created = await tenantsApi.create({
        name: newOrgName.trim(),
        ms_tenant_id: newOrgCode.trim(),
      });

      toast({
        title: "Successo",
        description: "Cliente creato con successo"
      });

      const newOrg = { id: String(created.id), name: created.name, code: created.ms_tenant_id || String(created.id) };
      setOrganizations(prev => [...prev, newOrg].sort((a, b) => a.name.localeCompare(b.name)));
      onOrgChange(newOrg.id);
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
