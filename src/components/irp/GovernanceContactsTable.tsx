import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Edit, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { EmergencyContact } from '@/types/irp';
import { IRPContactForm } from './IRPContactForm';

interface GovernanceContactsTableProps {
  onDataChange?: () => void;
}

export const GovernanceContactsTable: React.FC<GovernanceContactsTableProps> = ({ onDataChange }) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [cisoSubstitute, setCisoSubstitute] = useState('');
  const [isEditingSubstitute, setIsEditingSubstitute] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const { toast } = useToast();

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
        <CardHeader>
          <CardTitle className="text-foreground text-xl">Governance e Organi Decisionali</CardTitle>
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
    </>
  );
};
