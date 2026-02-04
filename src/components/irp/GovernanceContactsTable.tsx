import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Trash2, Edit, Save, Eye, Info, Download, Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { EmergencyContact, DirectoryContact } from '@/types/irp';
import { IRPContactForm } from './IRPContactForm';
import { ContactDirectoryDialog } from './ContactDirectoryDialog';

interface GovernanceContactsTableProps {
  onDataChange?: () => void;
}

// Example contacts from PDF
const exampleContacts = [
  { name: 'Marco Bianchi', job_title: 'IT MANAGER', irp_role: 'Incident Response Team', phone: '3333425678', email: 'mb@azienda.com', responsibilities: 'Gestione tecnica infrastruttura, isolamento sistemi, forensica' },
  { name: 'Luca Rossi', job_title: 'RISK MANAGER', irp_role: 'Incident Response Manager', phone: '3333425678', email: 'lr@azienda.com', responsibilities: 'Coordinamento operativo IR, dichiarazione incidente, tempistiche risposta' },
  { name: 'Andrea Verdi', job_title: 'CISO', irp_role: 'Steering Committee', phone: '3333425678', email: 'av@azienda.com', responsibilities: 'Supervisione strategica, approvazione escalation critiche, liaison esterno' },
  { name: 'Sonia Neri', job_title: 'CTO', irp_role: 'Incident Response Program Owner', phone: '3333425678', email: 'sn@azienda.com', responsibilities: 'Ownership del programma IR, budget, risorse' },
  { name: 'Mario Rossi', job_title: 'CTO CISO', irp_role: 'Communications Lead', phone: '3333425678', email: 'mr@azienda.com', responsibilities: 'Comunicazioni interne/esterne, media relations, cliente notification' },
  { name: 'Luca Azzurri', job_title: 'LEGAL DEPARTMENT', irp_role: 'Legal Counsel', phone: '3333425678', email: 'la@azienda.com', responsibilities: 'Valutazione obbligo GDPR, notifica autorità, comunicazioni legali' },
  { name: 'Matteo Verdi', job_title: 'CISO IT MANAGER', irp_role: 'Cyber Insurance', phone: '3333425678', email: 'mv@azienda.com', responsibilities: 'Gestione polizza cyber, notifica sinistro, coordinamento perito' },
  { name: 'Paolo Biondi', job_title: 'Referente CSIRT', irp_role: 'Referente CSIRT', phone: '3333425678', email: 'pb@azienda.com', responsibilities: 'Notifica CSIRT Italia, gestione pre-alert/alert/report, coordinamento ACN' },
];

export const GovernanceContactsTable: React.FC<GovernanceContactsTableProps> = ({ onDataChange }) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [cisoSubstitute, setCisoSubstitute] = useState('');
  const [isEditingSubstitute, setIsEditingSubstitute] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [addingExampleIndex, setAddingExampleIndex] = useState<number | null>(null);
  const [addingAllExamples, setAddingAllExamples] = useState(false);
  const [showConfirmAllDialog, setShowConfirmAllDialog] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const { toast } = useToast();

  const handleSelectContactFromDirectory = (contact: DirectoryContact) => {
    const fullName = `${contact.first_name} ${contact.last_name}`;
    setCisoSubstitute(fullName);
    setDirectoryOpen(false);
    setIsEditingSubstitute(false);
  };

  const fetchContacts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) return;

      const { data, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('organization_id', userData.organization_id)
        .order('name');

      if (error) throw error;

      const mappedContacts: EmergencyContact[] = (data || []).map(contact => ({
        id: contact.id,
        name: contact.name,
        role: contact.role,
        job_title: contact.job_title || contact.role,
        irp_role: contact.irp_role || '',
        phone: contact.phone,
        email: contact.email,
        category: contact.category,
        responsibilities: contact.responsibilities || '',
      }));

      setContacts(mappedContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei contatti",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const handleDeleteContact = async (contactId: string) => {
    try {
      const { error } = await supabase
        .from('emergency_contacts')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Contatto eliminato con successo"
      });

      fetchContacts();
      onDataChange?.();
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: "Errore",
        description: "Errore durante l'eliminazione del contatto",
        variant: "destructive"
      });
    }
  };

  const handleEditContact = (contact: EmergencyContact) => {
    setEditingContact(contact);
    setFormOpen(true);
  };

  const handleAddContact = () => {
    setEditingContact(null);
    setFormOpen(true);
  };

  const handleContactSaved = () => {
    fetchContacts();
    onDataChange?.();
  };

  const addExampleContact = async (exampleContact: typeof exampleContacts[0], index: number) => {
    setAddingExampleIndex(index);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) throw new Error('Organization not found');

      const { error } = await supabase
        .from('emergency_contacts')
        .insert({
          name: exampleContact.name,
          role: exampleContact.job_title, // Legacy field
          job_title: exampleContact.job_title,
          irp_role: exampleContact.irp_role,
          phone: exampleContact.phone,
          email: exampleContact.email,
          responsibilities: exampleContact.responsibilities,
          category: 'governance',
          organization_id: userData.organization_id,
        });

      if (error) throw error;

      toast({
        title: "Successo",
        description: `Contatto "${exampleContact.name}" aggiunto alla matrice`
      });

      fetchContacts();
      onDataChange?.();
    } catch (error) {
      console.error('Error adding example contact:', error);
      toast({
        title: "Errore",
        description: "Errore durante l'aggiunta del contatto",
        variant: "destructive"
      });
    } finally {
      setAddingExampleIndex(null);
    }
  };

  const addAllExampleContacts = async () => {
    setAddingAllExamples(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) throw new Error('Organization not found');

      const contactsToInsert = exampleContacts.map(contact => ({
        name: contact.name,
        role: contact.job_title, // Legacy field
        job_title: contact.job_title,
        irp_role: contact.irp_role,
        phone: contact.phone,
        email: contact.email,
        responsibilities: contact.responsibilities,
        category: 'governance',
        organization_id: userData.organization_id,
      }));

      const { error } = await supabase
        .from('emergency_contacts')
        .insert(contactsToInsert);

      if (error) throw error;

      toast({
        title: "Successo",
        description: `${exampleContacts.length} contatti di esempio aggiunti alla matrice`
      });

      setShowExample(false);
      fetchContacts();
      onDataChange?.();
    } catch (error) {
      console.error('Error adding all example contacts:', error);
      toast({
        title: "Errore",
        description: "Errore durante l'aggiunta dei contatti",
        variant: "destructive"
      });
    } finally {
      setAddingAllExamples(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Caricamento...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-foreground text-xl">Governance e Organi Decisionali</CardTitle>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowExample(true)}
          >
            <Eye className="w-4 h-4 mr-2" />
            Vedi Esempio
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Introductory text with CISO substitute field */}
          <div className="p-4 bg-muted/30 rounded-lg border border-border">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Nel caso la figura di <span className="font-semibold text-foreground">CISO</span> non sia presente in Azienda, 
              questa figura compresa di ruoli e responsabilità sarà coperta da:{' '}
              {isEditingSubstitute ? (
                <span className="inline-flex items-center gap-2">
                  <Input
                    value={cisoSubstitute}
                    onChange={(e) => setCisoSubstitute(e.target.value)}
                    className="w-48 h-7 text-sm inline-block bg-background"
                    placeholder="Nome e Cognome"
                  />
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-7 px-2"
                    onClick={() => setDirectoryOpen(true)}
                    title="Seleziona dalla rubrica"
                  >
                    <Users className="w-3 h-3" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 px-2"
                    onClick={() => setIsEditingSubstitute(false)}
                  >
                    <Save className="w-3 h-3" />
                  </Button>
                </span>
              ) : (
                <span 
                  className="font-semibold text-primary cursor-pointer hover:underline"
                  onClick={() => setIsEditingSubstitute(true)}
                >
                  {cisoSubstitute || '[Clicca per inserire]'}
                </span>
              )}
              {' '}che svolgerà le mansioni di CISO riportate nel documento.
            </p>
          </div>

          {/* Contacts Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-foreground font-semibold">Nome</TableHead>
                  <TableHead className="text-foreground font-semibold">Titolo</TableHead>
                  <TableHead className="text-foreground font-semibold">Ruolo</TableHead>
                  <TableHead className="text-foreground font-semibold">Informazioni di contatto</TableHead>
                  <TableHead className="text-foreground font-semibold">Responsabilità</TableHead>
                  <TableHead className="text-foreground font-semibold w-20">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nessun contatto configurato. Clicca "Aggiungi Contatto" per iniziare.
                    </TableCell>
                  </TableRow>
                ) : (
                  contacts.map((contact) => (
                    <TableRow key={contact.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">
                        {contact.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.job_title || contact.role}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.irp_role || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="space-y-1">
                          <div>{contact.phone}</div>
                          <div className="text-sm">{contact.email}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-xs">
                        <div className="line-clamp-2">
                          {contact.responsibilities || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditContact(contact)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteContact(contact.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Add Contact Button */}
          <Button onClick={handleAddContact} className="bg-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" />
            Aggiungi Contatto
          </Button>
        </CardContent>
      </Card>

      <IRPContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onContactSaved={handleContactSaved}
        editContact={editingContact}
      />

      {/* Example Dialog */}
      <Dialog open={showExample} onOpenChange={setShowExample}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Esempio di Compilazione</DialogTitle>
            <DialogDescription>
              Ecco un esempio di come compilare la tabella Governance e Organi Decisionali
            </DialogDescription>
          </DialogHeader>
          
          {/* Button to add all example contacts */}
          <Button 
            onClick={() => setShowConfirmAllDialog(true)}
            disabled={addingAllExamples}
            className="w-full bg-primary text-primary-foreground"
          >
            {addingAllExamples ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Popola la matrice con tutti i dati di esempio
          </Button>

          {/* Example introductory text */}
          <div className="p-4 bg-muted/30 rounded-lg border border-border">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Nel caso la figura di <span className="font-semibold text-foreground">CISO</span> non sia presente in Azienda, 
              questa figura compresa di ruoli e responsabilità sarà coperta da:{' '}
              <span className="font-semibold text-primary">Mario Bianchi</span>
              {' '}che svolgerà le mansioni di CISO riportate nel documento.
            </p>
          </div>

          {/* Example table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-foreground font-semibold">Nome</TableHead>
                  <TableHead className="text-foreground font-semibold">Titolo</TableHead>
                  <TableHead className="text-foreground font-semibold">Ruolo</TableHead>
                  <TableHead className="text-foreground font-semibold">Informazioni di contatto</TableHead>
                  <TableHead className="text-foreground font-semibold">Responsabilità</TableHead>
                  <TableHead className="text-foreground font-semibold w-24">Azione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exampleContacts.map((contact, index) => (
                  <TableRow key={index} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground">
                      {contact.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.job_title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.irp_role}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="space-y-1">
                        <div>{contact.phone}</div>
                        <div className="text-sm">{contact.email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-xs">
                      <div className="line-clamp-2">
                        {contact.responsibilities}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addExampleContact(contact, index)}
                        disabled={addingExampleIndex === index || addingAllExamples}
                        className="text-xs"
                      >
                        {addingExampleIndex === index ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3 mr-1" />
                        )}
                        Aggiungi
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
            <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Questo è un esempio di compilazione. I dati reali andranno inseriti tramite il pulsante "Aggiungi Contatto".
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for adding all examples */}
      <AlertDialog open={showConfirmAllDialog} onOpenChange={setShowConfirmAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma inserimento dati di esempio</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per aggiungere {exampleContacts.length} contatti di esempio alla matrice.
              {contacts.length > 0 && (
                <span className="block mt-2 font-medium text-destructive">
                  Attenzione: ci sono già {contacts.length} contatti nella matrice. I dati di esempio verranno aggiunti a quelli esistenti e potrebbero creare duplicati.
                </span>
              )}
              <span className="block mt-2">Vuoi procedere?</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShowConfirmAllDialog(false);
                addAllExampleContacts();
              }}
            >
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ContactDirectoryDialog
        open={directoryOpen}
        onOpenChange={setDirectoryOpen}
        onSelectContact={handleSelectContactFromDirectory}
      />
    </>
  );
};
