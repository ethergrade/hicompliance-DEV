import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { criticalInfrastructureApi } from '@/lib/api';
import type { CriticalInfrastructureAsset } from '@/types/api';
import { Plus, Trash2, Edit, Truck, Loader2 } from 'lucide-react';

interface SupplierDirectoryTabProps {
  organizationId: string;
  groupId: string | null;
}

interface SupplierFormData {
  component_name: string;
  owner_team: string;
  management_type: 'internal' | 'external';
  location: string;
  dependencies: string;
}

const SupplierDirectoryTab: React.FC<SupplierDirectoryTabProps> = ({ organizationId, groupId }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<CriticalInfrastructureAsset | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>({
    component_name: '',
    owner_team: '',
    management_type: 'external',
    location: '',
    dependencies: '',
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers', organizationId, groupId],
    queryFn: () => criticalInfrastructureApi.list(organizationId, groupId),
    enabled: !!organizationId && !!groupId,
  });

  const createMutation = useMutation({
    mutationFn: (payload: Partial<CriticalInfrastructureAsset>) =>
      criticalInfrastructureApi.create(organizationId, payload, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', organizationId, groupId] });
      toast({ title: 'Fornitore aggiunto', description: 'Il fornitore è stato registrato con successo.' });
      closeDialog();
    },
    onError: (err: Error) => toast({ title: 'Errore', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<CriticalInfrastructureAsset>) => {
      if (!editingSupplier) throw new Error('Nessun fornitore selezionato');
      return criticalInfrastructureApi.update(organizationId, editingSupplier.id, payload, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', organizationId, groupId] });
      toast({ title: 'Fornitore aggiornato', description: 'Il fornitore è stato aggiornato con successo.' });
      closeDialog();
    },
    onError: (err: Error) => toast({ title: 'Errore', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (assetId: string) => criticalInfrastructureApi.delete(organizationId, assetId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', organizationId, groupId] });
      toast({ title: 'Fornitore rimosso', description: 'Il fornitore è stato rimosso con successo.' });
    },
    onError: (err: Error) => toast({ title: 'Errore', description: err.message, variant: 'destructive' }),
  });

  const openCreateDialog = () => {
    setEditingSupplier(null);
    setFormData({ component_name: '', owner_team: '', management_type: 'external', location: '', dependencies: '' });
    setDialogOpen(true);
  };

  const openEditDialog = (supplier: CriticalInfrastructureAsset) => {
    setEditingSupplier(supplier);
    setFormData({
      component_name: supplier.component_name,
      owner_team: supplier.owner_team || '',
      management_type: supplier.management_type || 'external',
      location: supplier.location || '',
      dependencies: supplier.dependencies || '',
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingSupplier(null);
  };

  const handleSubmit = () => {
    if (!formData.component_name.trim()) {
      toast({ title: 'Errore', description: 'Il nome del fornitore è obbligatorio.', variant: 'destructive' });
      return;
    }
    const payload: Partial<CriticalInfrastructureAsset> = {
      asset_id: `SUP-${Date.now()}`,
      component_name: formData.component_name.trim(),
      owner_team: formData.owner_team.trim(),
      management_type: formData.management_type,
      location: formData.location.trim(),
      dependencies: formData.dependencies.trim(),
    };
    if (editingSupplier) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Rubrica Fornitori</h2>
          <p className="text-sm text-gray-400">Gestisci l'elenco dei fornitori e partner strategici</p>
        </div>
        <Button onClick={openCreateDialog} disabled={!organizationId || !groupId}>
          <Plus className="w-4 h-4 mr-2" />
          Aggiungi Fornitore
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Caricamento fornitori...</span>
        </div>
      ) : suppliers.length === 0 ? (
        <Card className="border-dashed border-2 border-border bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Truck className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nessun fornitore registrato</h3>
            <p className="text-muted-foreground text-center mb-4">
              Aggiungi i fornitori strategici per la gestione degli incidenti
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Registra primo fornitore
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome Fornitore</TableHead>
                  <TableHead>Team/Servizio</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.component_name}</TableCell>
                    <TableCell>{s.owner_team || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={s.management_type === 'external' ? 'border-blue-500/30 text-blue-400' : 'border-purple-500/30 text-purple-400'}>
                        {s.management_type === 'external' ? 'Esterno' : s.management_type === 'internal' ? 'Interno' : '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>{s.location || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(s)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? 'Modifica Fornitore' : 'Nuovo Fornitore'}</DialogTitle>
            <DialogDescription>
              {editingSupplier ? 'Aggiorna i dettagli del fornitore.' : 'Registra un nuovo fornitore strategico.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supplier-name">Nome Fornitore *</Label>
              <Input
                id="supplier-name"
                placeholder="Es. Acme Security Ltd"
                value={formData.component_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, component_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-team">Servizio / Team di riferimento</Label>
              <Input
                id="supplier-team"
                placeholder="Es. SOC esterno, Consulenza GDPR"
                value={formData.owner_team}
                onChange={(e) => setFormData((prev) => ({ ...prev, owner_team: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-location">Sede</Label>
              <Input
                id="supplier-location"
                placeholder="Es. Milano, Italia"
                value={formData.location}
                onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-deps">Dipendenze / Note</Label>
              <Input
                id="supplier-deps"
                placeholder="Es. SLA 4h, contratto #1234"
                value={formData.dependencies}
                onChange={(e) => setFormData((prev) => ({ ...prev, dependencies: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Annulla</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingSupplier ? 'Aggiorna' : 'Crea'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplierDirectoryTab;
