import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Search, Plus, User, Mail, Phone, Briefcase, Download, 
  Pencil, Trash2, Upload, FileSpreadsheet, FileText 
} from 'lucide-react';
import { useContactDirectory } from '@/hooks/useContactDirectory';
import { DirectoryContact } from '@/types/irp';
import { ContactDirectoryForm } from './ContactDirectoryForm';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface ContactDirectoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectContact: (contact: DirectoryContact) => void;
}

export const ContactDirectoryDialog: React.FC<ContactDirectoryDialogProps> = ({
  open,
  onOpenChange,
  onSelectContact
}) => {
  const { 
    filteredContacts, 
    loading, 
    searchQuery, 
    setSearchQuery, 
    fetchContacts,
    importFromEmergencyContacts,
    addContact,
    updateContact,
    deleteContact
  } = useContactDirectory();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContact, setEditingContact] = useState<DirectoryContact | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<DirectoryContact | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleSelectContact = (contact: DirectoryContact) => {
    onSelectContact(contact);
    onOpenChange(false);
  };

  const handleContactAdded = () => {
    setShowAddForm(false);
    setEditingContact(null);
    fetchContacts();
  };

  const handleImport = async () => {
    setImporting(true);
    await importFromEmergencyContacts();
    setImporting(false);
  };

  const handleEditClick = (e: React.MouseEvent, contact: DirectoryContact) => {
    e.stopPropagation();
    setEditingContact(contact);
    setShowAddForm(true);
  };

  const handleDeleteClick = (e: React.MouseEvent, contact: DirectoryContact) => {
    e.stopPropagation();
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

  // Download template file
  const downloadTemplate = () => {
    const templateData = [
      ['Nome', 'Cognome', 'Titolo Aziendale', 'Email', 'Telefono', 'Note'],
      ['Mario', 'Rossi', 'IT Manager', 'mario.rossi@azienda.it', '+39 333 1234567', 'Contatto principale IT'],
      ['Anna', 'Bianchi', 'CISO', 'anna.bianchi@azienda.it', '+39 333 7654321', ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Nome
      { wch: 15 }, // Cognome
      { wch: 20 }, // Titolo Aziendale
      { wch: 30 }, // Email
      { wch: 18 }, // Telefono
      { wch: 30 }, // Note
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contatti');
    
    XLSX.writeFile(wb, 'template_rubrica_contatti.xlsx');
    
    toast({
      title: "Template scaricato",
      description: "Compila il file e importalo per aggiungere i contatti"
    });
  };

  // Parse imported file
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
          
          // Skip header row
          const contacts = jsonData.slice(1)
            .filter((row: string[]) => row.length >= 2 && row[0] && row[1]) // Must have nome and cognome
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
          
          // Detect delimiter (comma or semicolon or tab)
          const firstLine = lines[0];
          const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
          
          // Skip header row
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
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <User className="w-5 h-5" />
              Rubrica Contatti
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome, email o titolo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background border-border"
              />
            </div>

            {/* Contact List */}
            <ScrollArea className="h-[300px] pr-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? (
                    <p>Nessun contatto trovato per "{searchQuery}"</p>
                  ) : (
                    <div className="space-y-2">
                      <p>Nessun contatto nella rubrica</p>
                      <p className="text-sm">Importa i contatti esistenti o aggiungine di nuovi</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-background border border-border hover:border-primary/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {contact.first_name} {contact.last_name}
                          </span>
                          {contact.job_title && (
                            <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-1">
                              <Briefcase className="w-3 h-3" />
                              {contact.job_title}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          {contact.email && (
                            <span className="flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3" />
                              {contact.email}
                            </span>
                          )}
                          {contact.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {contact.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => handleEditClick(e, contact)}
                          title="Modifica"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => handleDeleteClick(e, contact)}
                          title="Elimina"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSelectContact(contact)}
                        >
                          Seleziona
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Action Buttons */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingContact(null);
                    setShowAddForm(true);
                  }}
                  className="flex-1"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi nuovo
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleImport}
                  disabled={importing}
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {importing ? 'Importazione...' : 'Importa da Governance'}
                </Button>
              </div>

              {/* File import section */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={downloadTemplate}
                  className="flex-1"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Scarica Template
                </Button>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importingFile}
                  className="flex-1"
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
              </div>
              
              <p className="text-xs text-muted-foreground text-center">
                Formati supportati: Excel (.xlsx, .xls), CSV, TXT (separato da virgola o punto e virgola)
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ContactDirectoryForm
        open={showAddForm}
        onOpenChange={(open) => {
          setShowAddForm(open);
          if (!open) setEditingContact(null);
        }}
        onContactSaved={handleContactAdded}
        editContact={editingContact}
      />

      {/* Delete confirmation dialog */}
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
    </>
  );
};
