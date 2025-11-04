import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IRPDocument, IRPDocumentData, EmergencyContact } from '@/types/irp';
import { toast } from 'sonner';

export const useIRPDocument = () => {
  const [document, setDocument] = useState<IRPDocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);

  // Load emergency contacts from database
  const loadEmergencyContacts = async () => {
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!userData?.organization_id) return;

      const { data: contactsData, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('organization_id', userData.organization_id)
        .order('category');

      if (error) throw error;

      const mappedContacts: EmergencyContact[] = (contactsData || []).map(contact => ({
        id: contact.id,
        name: contact.name,
        role: contact.role,
        phone: contact.phone,
        email: contact.email,
        category: contact.category,
        escalationLevel: 3,
      }));

      setContacts(mappedContacts);
      return mappedContacts;
    } catch (error) {
      console.error('Error loading contacts:', error);
      toast.error('Errore nel caricamento dei contatti');
      return [];
    }
  };

  // Load existing document or create default
  const loadDocument = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id, full_name')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) return;

      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', userData.organization_id)
        .single();

      // Try to load existing draft
      const { data: existingDoc } = await supabase
        .from('irp_documents')
        .select('*')
        .eq('organization_id', userData.organization_id)
        .eq('is_published', false)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      const loadedContacts = await loadEmergencyContacts();

      if (existingDoc && existingDoc.document_data) {
        const docData = existingDoc.document_data as unknown as IRPDocumentData;
        setDocument({
          ...docData,
          sections: {
            ...docData.sections,
            contacts: loadedContacts || [],
          },
        });
      } else {
        // Create default document structure
        const defaultDoc: IRPDocumentData = {
          companyName: orgData?.name || 'Nome Azienda',
          companyAddress: 'Indirizzo Azienda',
          date: new Date().toLocaleDateString('it-IT'),
          version: '1.0',
          sections: {
            introduction: '',
            severity: [],
            roles: [],
            contacts: loadedContacts || [],
            communications: '',
            procedures: [],
          },
        };
        setDocument(defaultDoc);
      }
    } catch (error) {
      console.error('Error loading document:', error);
      toast.error('Errore nel caricamento del documento');
    } finally {
      setLoading(false);
    }
  };

  // Save document to database
  const saveDocument = async (docData: IRPDocumentData) => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) throw new Error('Organization not found');

      // Check if draft exists
      const { data: existingDoc } = await supabase
        .from('irp_documents')
        .select('id, version')
        .eq('organization_id', userData.organization_id)
        .eq('is_published', false)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (existingDoc) {
        // Update existing draft
        const { error } = await supabase
          .from('irp_documents')
          .update({
            document_data: docData as any,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingDoc.id);

        if (error) throw error;
      } else {
        // Create new draft
        const { error } = await supabase
          .from('irp_documents')
          .insert([{
            organization_id: userData.organization_id,
            user_id: user.id,
            document_data: docData as any,
            version: 1,
            is_published: false,
          }]);

        if (error) throw error;
      }

      toast.success('Bozza salvata con successo');
      setDocument(docData);
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error('Errore nel salvataggio della bozza');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadDocument();
  }, []);

  return {
    document,
    loading,
    saving,
    contacts,
    saveDocument,
    reloadContacts: loadEmergencyContacts,
  };
};
