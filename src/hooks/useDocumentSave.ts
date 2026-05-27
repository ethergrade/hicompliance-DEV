import { supabase } from '@/integrations/supabase/client';
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
      if (!user || !organizationId) {
        console.error('User not authenticated or no organization');
        return false;
      }

      // Create unique file path
      const timestamp = Date.now();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${user.id}/${timestamp}_${sanitizedFileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('incident-documents')
        .upload(filePath, blob);

      if (uploadError) {
        console.error('Error uploading to storage:', uploadError);
        return false;
      }

      // Save to database via API
      try {
        await documentsApi.create(organizationId, {
          name: fileName,
          category: category,
        });
      } catch (dbError) {
        console.error('Error saving to database:', dbError);
        // Cleanup: remove uploaded file
        await supabase.storage.from('incident-documents').remove([filePath]);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in saveToDocuments:', error);
      return false;
    }
  };

  return { saveToDocuments };
};
