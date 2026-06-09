import { useState, useEffect, useCallback } from 'react';
import { irpApi } from '@/lib/api/irp';
import { useToast } from '@/hooks/use-toast';
import { DirectoryContact } from '@/types/irp';
import type { IrpContactResource } from '@/types/api';
import { useClientOrganization } from '@/hooks/useClientOrganization';

interface UseContactDirectoryReturn {
  contacts: DirectoryContact[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredContacts: DirectoryContact[];
  fetchContacts: () => Promise<void>;
  addContact: (contact: Omit<DirectoryContact, 'id' | 'organization_id' | 'created_at' | 'updated_at'>) => Promise<DirectoryContact | null>;
  updateContact: (id: string, contact: Partial<DirectoryContact>) => Promise<boolean>;
  deleteContact: (id: string) => Promise<boolean>;
  importFromEmergencyContacts: () => Promise<{ imported: number; skipped: number }>;
}

/** Map API IrpContactResource → DirectoryContact for backward compatibility */
const toDirectoryContact = (api: IrpContactResource): DirectoryContact => ({
  id: api.id,
  organization_id: api.tenant_id,
  first_name: api.first_name,
  last_name: api.last_name,
  job_title: api.job_title ?? undefined,
  phone: api.phone,
  email: api.email,
  notes: api.notes ?? undefined,
  created_at: api.created_at,
  updated_at: api.updated_at,
});

export const useContactDirectory = (): UseContactDirectoryReturn => {
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();
  const { organizationId: clientOrgId, groupId, isLoading: clientLoading } = useClientOrganization();

  const fetchContacts = useCallback(async () => {
    if (clientLoading || !clientOrgId) return;

    setLoading(true);
    try {
      const apiContacts = await irpApi.contacts(clientOrgId, groupId);
      setContacts((apiContacts || []).map(toDirectoryContact));
    } catch (error) {
      console.error('Error fetching directory contacts:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare la rubrica contatti",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast, clientOrgId, clientLoading]);

  useEffect(() => {
    if (!clientLoading && clientOrgId) {
      fetchContacts();
    }
  }, [fetchContacts, clientLoading, clientOrgId]);

  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${contact.first_name} ${contact.last_name}`.toLowerCase();
    return (
      fullName.includes(query) ||
      contact.email?.toLowerCase().includes(query) ||
      contact.job_title?.toLowerCase().includes(query)
    );
  });

  const addContact = async (contactData: Omit<DirectoryContact, 'id' | 'organization_id' | 'created_at' | 'updated_at'>): Promise<DirectoryContact | null> => {
    try {
      if (!clientOrgId) throw new Error('Organizzazione non trovata');

      const created = await irpApi.createContact(clientOrgId, {
        first_name: contactData.first_name,
        last_name: contactData.last_name,
        job_title: contactData.job_title ?? null,
        email: contactData.email ?? '',
        phone: contactData.phone ?? '',
        notes: contactData.notes ?? null,
      }, groupId);

      toast({
        title: "Successo",
        description: "Contatto aggiunto alla rubrica"
      });

      await fetchContacts();
      return toDirectoryContact(created);
    } catch (error) {
      console.error('Error adding directory contact:', error);
      toast({
        title: "Errore",
        description: "Impossibile aggiungere il contatto alla rubrica",
        variant: "destructive"
      });
      return null;
    }
  };

  const updateContact = async (id: string, contactData: Partial<DirectoryContact>): Promise<boolean> => {
    try {
      if (!clientOrgId) throw new Error('Organizzazione non trovata');

      const payload: Record<string, unknown> = {};
      if (contactData.first_name !== undefined) payload.first_name = contactData.first_name;
      if (contactData.last_name !== undefined) payload.last_name = contactData.last_name;
      if (contactData.job_title !== undefined) payload.job_title = contactData.job_title;
      if (contactData.email !== undefined) payload.email = contactData.email;
      if (contactData.phone !== undefined) payload.phone = contactData.phone;
      if (contactData.notes !== undefined) payload.notes = contactData.notes;

      await irpApi.updateContact(clientOrgId, id, payload, groupId);

      toast({
        title: "Successo",
        description: "Contatto aggiornato"
      });

      await fetchContacts();
      return true;
    } catch (error) {
      console.error('Error updating directory contact:', error);
      toast({
        title: "Errore",
        description: "Impossibile aggiornare il contatto",
        variant: "destructive"
      });
      return false;
    }
  };

  const deleteContact = async (id: string): Promise<boolean> => {
    try {
      if (!clientOrgId) throw new Error('Organizzazione non trovata');

      await irpApi.deleteContact(clientOrgId, id, groupId);

      toast({
        title: "Successo",
        description: "Contatto rimosso dalla rubrica"
      });

      await fetchContacts();
      return true;
    } catch (error) {
      console.error('Error deleting directory contact:', error);
      toast({
        title: "Errore",
        description: "Impossibile eliminare il contatto",
        variant: "destructive"
      });
      return false;
    }
  };

  const importFromEmergencyContacts = async (): Promise<{ imported: number; skipped: number }> => {
    try {
      if (!clientOrgId) throw new Error('Organizzazione non trovata');

      // Fetch emergency contacts from API
      const emergencyContacts = await irpApi.emergencyContacts(clientOrgId, groupId);

      if (!emergencyContacts || emergencyContacts.length === 0) {
        toast({
          title: "Info",
          description: "Nessun contatto di emergenza da importare"
        });
        return { imported: 0, skipped: 0 };
      }

      // Fetch existing directory contacts to avoid duplicates
      const existingContacts = await irpApi.contacts(clientOrgId, groupId);
      const existingSet = new Set(
        (existingContacts || []).map(c =>
          `${c.first_name?.toLowerCase()}_${c.last_name?.toLowerCase()}_${c.email?.toLowerCase()}`
        )
      );

      let imported = 0;
      let skipped = 0;

      for (const contact of emergencyContacts) {
        const nameParts = (contact.name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const key = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${contact.email?.toLowerCase()}`;

        if (existingSet.has(key)) {
          skipped++;
          continue;
        }

        existingSet.add(key);

        try {
          await irpApi.createContact(clientOrgId, {
            first_name: firstName,
            last_name: lastName,
            job_title: contact.job_title || contact.role || null,
            phone: contact.phone || '',
            email: contact.email || '',
          }, groupId);
          imported++;
        } catch {
          skipped++;
        }
      }

      if (imported === 0 && skipped > 0) {
        toast({
          title: "Info",
          description: `Tutti i contatti sono già presenti nella rubrica (${skipped} duplicati)`
        });
      } else {
        toast({
          title: "Importazione completata",
          description: `${imported} contatti importati${skipped > 0 ? `, ${skipped} duplicati saltati` : ''}`
        });
      }

      await fetchContacts();
      return { imported, skipped };
    } catch (error) {
      console.error('Error importing contacts:', error);
      toast({
        title: "Errore",
        description: "Impossibile importare i contatti",
        variant: "destructive"
      });
      return { imported: 0, skipped: 0 };
    }
  };

  return {
    contacts,
    loading,
    searchQuery,
    setSearchQuery,
    filteredContacts,
    fetchContacts,
    addContact,
    updateContact,
    deleteContact,
    importFromEmergencyContacts
  };
};
