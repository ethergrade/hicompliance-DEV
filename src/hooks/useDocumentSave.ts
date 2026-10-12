import { documentsApi } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthProvider';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import type { DocumentCategory } from '@/components/documents/DocumentCodeGenerator';

interface SaveDocumentOptions {
  blob: Blob;
  fileName: string;
  category: DocumentCategory;
}

export const useDocumentSave = () => {
  const { user } = useAuth();
  const { organizationId } = useClientOrganization();

  const saveToDocuments = async ({ blob, fileName, category }: SaveDocumentOptions): Promise<boolean> => {
    try {
      if (!user || !organizationId) return false;
      const isIrp = /^IRP_/i.test(fileName) || category === 'Piano Generale';
      await documentsApi.createWithFile(organizationId, blob, fileName, {
        name: fileName,
        category,
        source_type: isIrp ? 'irp' : 'manual',
        is_generated: true,
        tags: isIrp ? ['IRP', 'compilato'] : [],
      } as any);
      return true;
    } catch (error) {
      console.error('Error in saveToDocuments:', error);
      return false;
    }
  };

  return { saveToDocuments };
};
