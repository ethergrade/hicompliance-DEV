import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DirectoryContact } from '@/types/irp';

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
}

export const useContactDirectory = (): UseContactDirectoryReturn => {
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const fetchContacts = useCallback(async () => {
    setLoading(true);
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
        .from('contact_directory')
        .select('*')
        .eq('organization_id', userData.organization_id)
        .order('last_name', { ascending: true });

      if (error) throw error;

      setContacts((data as DirectoryContact[]) || []);
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
  }, [toast]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non autenticato');

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) throw new Error('Organizzazione non trovata');

      const { data, error } = await supabase
        .from('contact_directory')
        .insert({
          ...contactData,
          organization_id: userData.organization_id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Contatto aggiunto alla rubrica"
      });

      await fetchContacts();
      return data as DirectoryContact;
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
      const { error } = await supabase
        .from('contact_directory')
        .update(contactData)
        .eq('id', id);

      if (error) throw error;

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
      const { error } = await supabase
        .from('contact_directory')
        .delete()
        .eq('id', id);

      if (error) throw error;

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

  return {
    contacts,
    loading,
    searchQuery,
    setSearchQuery,
    filteredContacts,
    fetchContacts,
    addContact,
    updateContact,
    deleteContact
  };
};
