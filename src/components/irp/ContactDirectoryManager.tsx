import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Plus, Search, Pencil, Trash2, Users, Download, Phone, Mail } from 'lucide-react';
import { useContactDirectory } from '@/hooks/useContactDirectory';
import { ContactDirectoryForm } from './ContactDirectoryForm';
import { DirectoryContact } from '@/types/irp';

export const ContactDirectoryManager: React.FC = () => {
  const {
    contacts,
    loading,
    searchQuery,
    setSearchQuery,
    filteredContacts,
    addContact,
    updateContact,
    deleteContact,
    importFromEmergencyContacts
  } = useContactDirectory();

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<DirectoryContact | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<DirectoryContact | null>(null);
  const [importing, setImporting] = useState(false);

  const handleAddContact = async (data: Omit<DirectoryContact, 'id' | 'organization_id' | 'created_at' | 'updated_at'>) => {
    const result = await addContact(data);
    if (result) {
      setFormDialogOpen(false);
    }
    return !!result;
  };

  const handleEditContact = async (data: Omit<DirectoryContact, 'id' | 'organization_id' | 'created_at' | 'updated_at'>) => {
    if (!editingContact) return false;
    const result = await updateContact(editingContact.id, data);
    if (result) {
      setEditingContact(null);
      setFormDialogOpen(false);
    }
    return result;
  };

  const handleDeleteClick = (contact: DirectoryContact) => {
    setContactToDelete(contact);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (contactToDelete) {
      await deleteContact(contactToDelete.id);
      setDeleteDialogOpen(false);
      setContactToDelete(null);
    }
  };

  const handleEditClick = (contact: DirectoryContact) => {
    setEditingContact(contact);
    setFormDialogOpen(true);
  };

  const handleDialogClose = () => {
    setFormDialogOpen(false);
    setEditingContact(null);
  };

  const handleImport = async () => {
    setImporting(true);
    await importFromEmergencyContacts();
    setImporting(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-primary" />
              <div>
                <CardTitle>Rubrica Contatti</CardTitle>
                <CardDescription>
                  Gestisci i contatti dell'organizzazione per un facile riutilizzo
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleImport}
                disabled={importing}
              >
                <Download className="w-4 h-4 mr-2" />
                {importing ? 'Importazione...' : 'Importa da Governance'}
              </Button>
              <Button onClick={() => setFormDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Nuovo Contatto
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cerca per nome, email o ruolo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Caricamento contatti...
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                {searchQuery ? 'Nessun contatto trovato' : 'La rubrica è vuota'}
              </p>
              {!searchQuery && (
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={handleImport} disabled={importing}>
                    <Download className="w-4 h-4 mr-2" />
                    Importa esistenti
                  </Button>
                  <Button onClick={() => setFormDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Aggiungi contatto
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead>Contatti</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <div className="font-medium">
                          {contact.first_name} {contact.last_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contact.job_title ? (
                          <Badge variant="secondary">{contact.job_title}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          {contact.email && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              {contact.email}
                            </div>
                          )}
                          {contact.phone && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="w-3 h-3" />
                              {contact.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(contact)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(contact)}
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
            <span>{filteredContacts.length} contatti{searchQuery && ` trovati`}</span>
          </div>
        </CardContent>
      </Card>

      {/* Dialog per creare/modificare contatto */}
      <Dialog open={formDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingContact ? 'Modifica Contatto' : 'Nuovo Contatto'}
            </DialogTitle>
            <DialogDescription>
              {editingContact 
                ? 'Modifica i dati del contatto nella rubrica' 
                : 'Aggiungi un nuovo contatto alla rubrica'}
            </DialogDescription>
          </DialogHeader>
          <ContactDirectoryForm
            defaultValues={editingContact || undefined}
            onSubmit={editingContact ? handleEditContact : handleAddContact}
            onCancel={handleDialogClose}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog conferma eliminazione */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Contatto</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {contactToDelete?.first_name} {contactToDelete?.last_name} dalla rubrica? 
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
