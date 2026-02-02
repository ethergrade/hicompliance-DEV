import React, { useState, useRef } from 'react';
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
import { Plus, Search, Pencil, Trash2, Users, Download, Phone, Mail, Upload, FileSpreadsheet } from 'lucide-react';
import { useContactDirectory } from '@/hooks/useContactDirectory';
import { ContactDirectoryForm } from './ContactDirectoryForm';
import { DirectoryContact } from '@/types/irp';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

export const ContactDirectoryManager: React.FC = () => {
  const {
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
  const [importingFile, setImportingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

  // Download template file
  const downloadTemplate = () => {
    const templateData = [
      ['Nome', 'Cognome', 'Titolo Aziendale', 'Email', 'Telefono', 'Note'],
      ['Mario', 'Rossi', 'IT Manager', 'mario.rossi@azienda.it', '+39 333 1234567', 'Contatto principale IT'],
      ['Anna', 'Bianchi', 'CISO', 'anna.bianchi@azienda.it', '+39 333 7654321', ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    
    ws['!cols'] = [
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 30 },
      { wch: 18 },
      { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contatti');
    
    XLSX.writeFile(wb, 'template_rubrica_contatti.xlsx');
    
    toast({
      title: "Template scaricato",
      description: "Compila il file e importalo per aggiungere i contatti"
    });
  };

  const parseFile = async (file: File): Promise<Array<Omit<DirectoryContact, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension === 'xlsx' || extension === 'xls') {
      return parseExcel(file);
    } else if (extension === 'csv' || extension === 'txt') {
      return parseCSV(file);
    } else {
      throw new Error('Formato file non supportato. Usa .xlsx, .xls, .csv o .txt');
    }
  };

  const parseExcel = (file: File): Promise<Array<Omit<DirectoryContact, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });
          
          const contacts = jsonData.slice(1)
            .filter((row: string[]) => row.length >= 2 && row[0] && row[1])
            .map((row: string[]) => ({
              first_name: String(row[0] || '').trim(),
              last_name: String(row[1] || '').trim(),
              job_title: String(row[2] || '').trim() || undefined,
              email: String(row[3] || '').trim() || undefined,
              phone: String(row[4] || '').trim() || undefined,
              notes: String(row[5] || '').trim() || undefined,
            }));
          
          resolve(contacts);
        } catch (error) {
          reject(new Error('Errore nel parsing del file Excel'));
        }
      };
      reader.onerror = () => reject(new Error('Errore nella lettura del file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const parseCSV = (file: File): Promise<Array<Omit<DirectoryContact, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split(/\r?\n/).filter(line => line.trim());
          
          const firstLine = lines[0];
          const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
          
          const contacts = lines.slice(1)
            .map(line => {
              const parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
              return {
                first_name: parts[0] || '',
                last_name: parts[1] || '',
                job_title: parts[2] || undefined,
                email: parts[3] || undefined,
                phone: parts[4] || undefined,
                notes: parts[5] || undefined,
              };
            })
            .filter(c => c.first_name && c.last_name);
          
          resolve(contacts);
        } catch (error) {
          reject(new Error('Errore nel parsing del file CSV/TXT'));
        }
      };
      reader.onerror = () => reject(new Error('Errore nella lettura del file'));
      reader.readAsText(file);
    });
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingFile(true);
    
    try {
      const contacts = await parseFile(file);
      
      if (contacts.length === 0) {
        toast({
          title: "Nessun contatto trovato",
          description: "Il file non contiene contatti validi. Assicurati che ci siano Nome e Cognome.",
          variant: "destructive"
        });
        return;
      }

      let imported = 0;
      let errors = 0;

      for (const contact of contacts) {
        const result = await addContact(contact as Omit<DirectoryContact, 'id' | 'organization_id' | 'created_at' | 'updated_at'>);
        if (result) {
          imported++;
        } else {
          errors++;
        }
      }

      toast({
        title: "Importazione completata",
        description: `${imported} contatti importati${errors > 0 ? `, ${errors} errori` : ''}`
      });

    } catch (error) {
      console.error('File import error:', error);
      toast({
        title: "Errore importazione",
        description: error instanceof Error ? error.message : "Errore durante l'importazione del file",
        variant: "destructive"
      });
    } finally {
      setImportingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-primary" />
              <div>
                <CardTitle>Rubrica Contatti</CardTitle>
                <CardDescription>
                  Gestisci i contatti dell'organizzazione per un facile riutilizzo
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={downloadTemplate}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Scarica Template
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importingFile}
              >
                <Upload className="w-4 h-4 mr-2" />
                {importingFile ? 'Importazione...' : 'Importa da File'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                onChange={handleFileImport}
                className="hidden"
              />
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
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button variant="outline" onClick={downloadTemplate}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Scarica Template
                  </Button>
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-2" />
                    Importa da File
                  </Button>
                  <Button variant="outline" onClick={handleImport} disabled={importing}>
                    <Download className="w-4 h-4 mr-2" />
                    Importa da Governance
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
            <span className="text-xs">Formati supportati: Excel (.xlsx, .xls), CSV, TXT</span>
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
