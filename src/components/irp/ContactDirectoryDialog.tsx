import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Plus, User, Mail, Phone, Briefcase } from 'lucide-react';
import { useContactDirectory } from '@/hooks/useContactDirectory';
import { DirectoryContact } from '@/types/irp';
import { ContactDirectoryForm } from './ContactDirectoryForm';

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
  const { filteredContacts, loading, searchQuery, setSearchQuery, fetchContacts } = useContactDirectory();
  const [showAddForm, setShowAddForm] = useState(false);

  const handleSelectContact = (contact: DirectoryContact) => {
    onSelectContact(contact);
    onOpenChange(false);
  };

  const handleContactAdded = () => {
    setShowAddForm(false);
    fetchContacts();
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
            <ScrollArea className="h-[350px] pr-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? (
                    <p>Nessun contatto trovato per "{searchQuery}"</p>
                  ) : (
                    <p>Nessun contatto nella rubrica</p>
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
                      <Button
                        size="sm"
                        onClick={() => handleSelectContact(contact)}
                        className="ml-4"
                      >
                        Seleziona
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Add New Button */}
            <div className="border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAddForm(true)}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Aggiungi nuovo alla Rubrica
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ContactDirectoryForm
        open={showAddForm}
        onOpenChange={setShowAddForm}
        onContactSaved={handleContactAdded}
      />
    </>
  );
};
