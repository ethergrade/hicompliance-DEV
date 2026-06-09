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
  const { organizationId, groupId } = useClientOrganization();

  const saveToDocuments = async ({ blob, fileName, category }: SaveDocumentOptions): Promise<boolean> => {
    try {
      if (!user || !organizationId) {
        console.error('User not authenticated or no organization');
        return false;
      }

      await documentsApi.createWithFile(organizationId, blob, fileName, {
        name: fileName,
        category,
      }, groupId);

      return true;
    } catch (error) {
      console.error('Error in saveToDocuments:', error);
      return false;
    }
  };

  return { saveToDocuments };
};
