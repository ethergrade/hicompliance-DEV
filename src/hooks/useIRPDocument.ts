import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IRPDocument, IRPDocumentData, EmergencyContact } from '@/types/irp';
import { toast } from 'sonner';
 import { useClientOrganization } from '@/hooks/useClientOrganization';

export const useIRPDocument = () => {
  const [document, setDocument] = useState<IRPDocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const { organizationId: clientOrgId, isLoading: clientLoading } = useClientOrganization();

  // Load emergency contacts from database
  const loadEmergencyContacts = async (orgId: string) => {
    try {
      const { data: contactsData, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('organization_id', orgId)
        .order('category');

      if (error) throw error;

      const mappedContacts: EmergencyContact[] = (contactsData || []).map(contact => ({
        id: contact.id,
        name: contact.name,
        role: contact.role,
        job_title: (contact as any).job_title || contact.role,
        irp_role: (contact as any).irp_role || '',
        phone: contact.phone,
        email: contact.email,
        category: contact.category,
        responsibilities: (contact as any).responsibilities || '',
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
    if (clientLoading || !clientOrgId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', clientOrgId)
        .single();

      // Try to load existing draft
      const { data: existingDoc } = await supabase
        .from('irp_documents')
        .select('*')
        .eq('organization_id', clientOrgId)
        .eq('is_published', false)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      const loadedContacts = await loadEmergencyContacts(clientOrgId);

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

      if (!clientOrgId) throw new Error('Organization not found');

      // Check if draft exists
      const { data: existingDoc } = await supabase
        .from('irp_documents')
        .select('id, version')
        .eq('organization_id', clientOrgId)
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
            organization_id: clientOrgId,
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
    if (!clientLoading && clientOrgId) {
      loadDocument();
    }
  }, [clientLoading, clientOrgId]);

  return {
    document,
    loading,
    saving,
    contacts,
    saveDocument,
    reloadContacts: () => clientOrgId ? loadEmergencyContacts(clientOrgId) : Promise.resolve([]),
  };
};
