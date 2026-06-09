import { useState, useEffect } from 'react';
import { irpApi, tenantsApi } from '@/lib/api';
import { IRPDocument, IRPDocumentData, EmergencyContact } from '@/types/irp';
import { toast } from 'sonner';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export const useIRPDocument = () => {
  const [document, setDocument] = useState<IRPDocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const { organizationId: clientOrgId, groupId, isLoading: clientLoading } = useClientOrganization();

  // Load emergency contacts from API
  const loadEmergencyContacts = async (orgId: string) => {
    try {
      const contactsData = await irpApi.contacts(orgId, groupId);

      const mappedContacts: EmergencyContact[] = (contactsData || []).map(contact => ({
        id: contact.id,
        name: contact.name,
        role: contact.role || '',
        job_title: contact.job_title || contact.role || '',
        irp_role: contact.irp_role || '',
        phone: contact.phone,
        email: contact.email,
        category: contact.category,
        responsibilities: contact.responsibilities || '',
        escalationLevel: contact.escalation_level || 3,
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
      const tenant = await tenantsApi.get(clientOrgId, groupId);

      // Try to load existing document from API
      let existingDocData: IRPDocumentData | null = null;
      try {
        const rawDoc = await irpApi.document(clientOrgId, groupId);
        if (rawDoc && typeof rawDoc === 'object') {
          existingDocData = rawDoc as unknown as IRPDocumentData;
        }
      } catch {
        // No existing document — will create default
      }

      const loadedContacts = await loadEmergencyContacts(clientOrgId);

      if (existingDocData) {
        setDocument({
          ...existingDocData,
          sections: {
            ...(existingDocData.sections || {}),
            contacts: loadedContacts || [],
          },
        });
      } else {
        // Create default document structure
        const defaultDoc: IRPDocumentData = {
          companyName: tenant?.name || 'Nome Azienda',
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

  // Save document via API
  const saveDocument = async (docData: IRPDocumentData) => {
    if (!clientOrgId) {
      toast.error('Organizzazione non trovata');
      return;
    }
    try {
      setSaving(true);
      await irpApi.saveDocument(clientOrgId, docData as unknown as Record<string, unknown>, groupId);

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
