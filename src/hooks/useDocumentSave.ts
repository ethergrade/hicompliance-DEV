import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type DocumentCategory = Database['public']['Enums']['document_category'];

interface SaveDocumentOptions {
  blob: Blob;
  fileName: string;
  category: DocumentCategory;
}

export const useDocumentSave = () => {
  const saveToDocuments = async ({ blob, fileName, category }: SaveDocumentOptions): Promise<boolean> => {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('User not authenticated:', userError);
        return false;
      }

      // Get user ID from users table
      const { data: userData, error: userDataError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (userDataError || !userData) {
        console.error('Error fetching user data:', userDataError);
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

      // Save to database
      const { error: dbError } = await supabase
        .from('incident_documents')
        .insert({
          name: fileName,
          file_path: filePath,
          file_size: blob.size,
          file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          category: category,
          uploaded_by: userData.id
        });

      if (dbError) {
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
