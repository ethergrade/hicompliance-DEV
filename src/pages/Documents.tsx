import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  Download,
  FileText,
  Upload,
  Trash2,
  File
} from 'lucide-react';

interface Document {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  category: string;
  uploaded_at: string;
  uploaded_by: string;
}

const Documents: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [category, setCategory] = useState('');
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchDocuments = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('incident_documents')
        .select('*')
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setDocuments((data || []) as any[]);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei documenti",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setDocumentName(file.name);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !documentName || !user) {
      toast({
        title: "Errore",
        description: "Seleziona un file e inserisci un nome",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      // Upload file to storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}_${documentName.replace(/[^a-zA-Z0-9]/g, '_')}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('incident-documents')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Save document metadata to database
      const { error: dbError } = await (supabase as any)
        .from('incident_documents')
        .insert({
          name: documentName,
          file_path: filePath,
          file_size: selectedFile.size,
          file_type: selectedFile.type,
          category: category || 'Generale',
          uploaded_by: user.id
        });

      if (dbError) throw dbError;

      toast({
        title: "Successo",
        description: "Documento caricato con successo"
      });

      // Reset form
      setSelectedFile(null);
      setDocumentName('');
      setCategory('');
      
      // Refresh documents list
      fetchDocuments();
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({
        title: "Errore",
        description: "Errore durante il caricamento del documento",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from('incident-documents')
        .download(doc.file_path);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({
        title: "Errore",
        description: "Errore durante il download del documento",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (docId: string, filePath: string) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('incident-documents')
        .remove([filePath]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('incident_documents' as any)
        .delete()
        .eq('id', docId);

      if (dbError) throw dbError;

      toast({
        title: "Successo",
        description: "Documento eliminato con successo"
      });

      fetchDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Errore",
        description: "Errore durante l'eliminazione del documento",
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestione Documenti</h1>
          <p className="text-muted-foreground">
            Carica e gestisci i documenti della tua organizzazione
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Carica Nuovo Documento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file">Seleziona File</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.txt,.xlsx,.xls"
                  className="cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nome Documento</Label>
                <Input
                  id="name"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder="Inserisci il nome del documento"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Categoria (opzionale)</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="es. Piano Generale, Checklist, Template"
                />
              </div>

              <Button
                onClick={handleUpload}
                disabled={!selectedFile || !documentName || uploading}
                className="w-full"
              >
                {uploading ? (
                  <>Caricamento in corso...</>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Carica Documento
                  </>
                )}
              </Button>

              {selectedFile && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    File selezionato: <span className="font-medium text-foreground">{selectedFile.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Dimensione: {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents List */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Documenti Caricati</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center text-muted-foreground py-8">
                  Caricamento documenti...
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <File className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nessun documento caricato</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {doc.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(doc.file_size)} • {formatDate(doc.uploaded_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {doc.category && (
                          <Badge variant="secondary" className="text-xs">
                            {doc.category}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(doc)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(doc.id, doc.file_path)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Documents;
