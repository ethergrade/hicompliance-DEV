import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, Link2, Mail, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { useSupplierDirectory } from '@/hooks/useSupplierDirectory';
import { SupplierDirectoryEntry } from '@/types/irp';
import { useToast } from '@/hooks/use-toast';

interface SupplierFormState {
  supplier_name: string;
  service_type: string;
  contact_name: string;
  email: string;
  phone: string;
  linked_asset_id: string;
  notes: string;
}

const EMPTY_FORM: SupplierFormState = {
  supplier_name: '',
  service_type: '',
  contact_name: '',
  email: '',
  phone: '',
  linked_asset_id: '',
  notes: '',
};

export const SupplierDirectoryManager: React.FC = () => {
  const {
    loading,
    saving,
    filteredSuppliers,
    searchQuery,
    setSearchQuery,
    assetOptions,
    addSupplier,
    updateSupplier,
    deleteSupplier,
  } = useSupplierDirectory();

  const { toast } = useToast();

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDirectoryEntry | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<SupplierDirectoryEntry | null>(null);
  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM);

  const linkedAssetNote = useMemo(() => {
    if (assetOptions.length > 0) return null;
    return 'Nessun asset disponibile in Infrastruttura Critica. Puoi creare il fornitore e associare l\'asset in seguito.';
  }, [assetOptions.length]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingSupplier(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setFormDialogOpen(true);
  };

  const openEditDialog = (supplier: SupplierDirectoryEntry) => {
    setEditingSupplier(supplier);
    setForm({
      supplier_name: supplier.supplier_name || '',
      service_type: supplier.service_type || '',
      contact_name: supplier.contact_name || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      linked_asset_id: supplier.linked_asset_id || '',
      notes: supplier.notes || '',
    });
    setFormDialogOpen(true);
  };

  const closeDialog = () => {
    setFormDialogOpen(false);
    resetForm();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.supplier_name.trim()) {
      toast({
        title: 'Dato mancante',
        description: 'Inserisci il nome del fornitore',
        variant: 'destructive',
      });
      return;
    }

    const payload = {
      supplier_name: form.supplier_name.trim(),
      service_type: form.service_type.trim() || undefined,
      contact_name: form.contact_name.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      linked_asset_id: form.linked_asset_id || null,
      notes: form.notes.trim() || undefined,
    };

    const ok = editingSupplier
      ? await updateSupplier(editingSupplier.id, payload)
      : !!(await addSupplier(payload));

    if (ok) {
      closeDialog();
    }
  };

  const handleDeleteClick = (supplier: SupplierDirectoryEntry) => {
    setSupplierToDelete(supplier);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!supplierToDelete) return;
    const ok = await deleteSupplier(supplierToDelete.id);
    if (ok) {
      setDeleteDialogOpen(false);
      setSupplierToDelete(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-6 h-6 text-primary" />
              <div>
                <CardTitle>Rubrica Fornitori</CardTitle>
                <CardDescription>
                  Gestisci i fornitori e collega ogni fornitore a un asset dell&apos;infrastruttura critica
                </CardDescription>
              </div>
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Nuovo Fornitore
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cerca fornitore, servizio, contatto o asset..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Caricamento fornitori...</div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">
                {searchQuery ? 'Nessun fornitore trovato' : 'La rubrica fornitori e vuota'}
              </p>
              {!searchQuery && (
                <Button variant="outline" onClick={openCreateDialog}>
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi fornitore
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornitore</TableHead>
                    <TableHead>Servizio</TableHead>
                    <TableHead>Contatto</TableHead>
                    <TableHead>Asset Associato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.supplier_name}</TableCell>
                      <TableCell>
                        {supplier.service_type ? (
                          <Badge variant="secondary">{supplier.service_type}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          {supplier.contact_name && <span>{supplier.contact_name}</span>}
                          {supplier.email && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              {supplier.email}
                            </div>
                          )}
                          {supplier.phone && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="w-3 h-3" />
                              {supplier.phone}
                            </div>
                          )}
                          {!supplier.contact_name && !supplier.email && !supplier.phone && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {supplier.linked_asset_label ? (
                          <div className="flex items-center gap-2 text-sm">
                            <Link2 className="w-3.5 h-3.5 text-primary" />
                            <span>{supplier.linked_asset_label}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Non associato</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(supplier)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(supplier)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-between items-center text-sm text-muted-foreground">
            <span>{filteredSuppliers.length} fornitori{searchQuery && ' trovati'}</span>
            {linkedAssetNote ? <span className="text-xs">{linkedAssetNote}</span> : <span className="text-xs">Associazione asset disponibile</span>}
          </div>
        </CardContent>
      </Card>

      <Dialog open={formDialogOpen} onOpenChange={(open) => (!open ? closeDialog() : setFormDialogOpen(true))}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? 'Modifica Fornitore' : 'Nuovo Fornitore'}</DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? 'Aggiorna i dati del fornitore e l\'asset associato'
                : 'Crea un fornitore e associa un asset monitorato'}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="supplier_name">Nome fornitore *</Label>
                <Input
                  id="supplier_name"
                  value={form.supplier_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, supplier_name: event.target.value }))}
                  placeholder="Es. SecureNet Srl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="service_type">Servizio / Tecnologia</Label>
                <Input
                  id="service_type"
                  value={form.service_type}
                  onChange={(event) => setForm((prev) => ({ ...prev, service_type: event.target.value }))}
                  placeholder="Es. SOC, Firewall, Backup"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact_name">Referente</Label>
                <Input
                  id="contact_name"
                  value={form.contact_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, contact_name: event.target.value }))}
                  placeholder="Nome e cognome"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="fornitore@azienda.it"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefono</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="+39 ..."
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>Asset associato</Label>
                <Select
                  value={form.linked_asset_id || '__none__'}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, linked_asset_id: value === '__none__' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona un asset (opzionale)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessun asset associato</SelectItem>
                    {assetOptions.map((asset) => (
                      <SelectItem key={asset.id} value={asset.id}>
                        {asset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="notes">Note</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Informazioni operative, SLA, escalation, copertura..."
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>
                Annulla
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvataggio...' : editingSupplier ? 'Salva modifiche' : 'Crea fornitore'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Fornitore</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {supplierToDelete?.supplier_name}? Questa azione non puo essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
