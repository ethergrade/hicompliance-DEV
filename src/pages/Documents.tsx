import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  FileText,
  Upload,
  Trash2,
  File,
  FolderOpen,
  Edit2,
  FolderInput,
  Package
} from 'lucide-react';

// Use the database enum type directly to stay in sync
type DocumentCategory = Database['public']['Enums']['document_category'];

// Define display categories (excluding deprecated "Audit" which is now "ISO & Audit")
const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'Piano Generale',
  'Checklist / OPL / SOP',
  'Template',
  'Processo',
  'Legal',
  'ISO & Audit',
  'NIS2',
  'Tecnico',
  'Varie'
];

interface Document {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  category: DocumentCategory;
  uploaded_at: string;
  uploaded_by: string;
}

const Documents: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('Varie');
  const [activeCategory, setActiveCategory] = useState<DocumentCategory | 'all'>('all');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [newDocumentName, setNewDocumentName] = useState('');
  const [newCategory, setNewCategory] = useState<DocumentCategory>('Varie');
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch user ID from users table
  useEffect(() => {
    const fetchUserId = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      
      if (error) {
        console.error('Error fetching user ID:', error);
        return;
      }
      setUserId(data?.id);
    };
    fetchUserId();
  }, [user]);

  const fetchDocuments = async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('incident_documents')
        .select('*')
        .eq('uploaded_by', userId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
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
    if (userId) {
      fetchDocuments();
    }
  }, [userId]);

  useEffect(() => {
    if (activeCategory === 'all') {
      setFilteredDocuments(documents);
    } else {
      setFilteredDocuments(documents.filter(doc => doc.category === activeCategory));
    }
  }, [documents, activeCategory]);

  const getCategoryCount = (category: DocumentCategory | 'all') => {
    if (category === 'all') return documents.length;
    return documents.filter(doc => doc.category === category).length;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setDocumentName(file.name);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !documentName || !user || !userId) {
      toast({
        title: "Errore",
        description: "Seleziona un file, inserisci un nome e seleziona una categoria",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}_${documentName.replace(/[^a-zA-Z0-9]/g, '_')}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('incident-documents')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('incident_documents')
        .insert({
          name: documentName,
          file_path: filePath,
          file_size: selectedFile.size,
          file_type: selectedFile.type,
          category: selectedCategory,
          uploaded_by: userId
        });

      if (dbError) throw dbError;

      toast({
        title: "Successo",
        description: "Documento caricato con successo"
      });

      setSelectedFile(null);
      setDocumentName('');
      setSelectedCategory('Varie');
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
    if (!confirm('Sei sicuro di voler eliminare questo documento?')) return;
    
    try {
      const { error: storageError } = await supabase.storage
        .from('incident-documents')
        .remove([filePath]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('incident_documents')
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

  const handleRename = async () => {
    if (!selectedDocument || !newDocumentName.trim()) {
      toast({
        title: "Errore",
        description: "Inserisci un nome valido",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('incident_documents')
        .update({ name: newDocumentName.trim() })
        .eq('id', selectedDocument.id);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Documento rinominato con successo"
      });

      setRenameDialogOpen(false);
      setSelectedDocument(null);
      setNewDocumentName('');
      fetchDocuments();
    } catch (error) {
      console.error('Error renaming document:', error);
      toast({
        title: "Errore",
        description: "Errore durante la rinomina del documento",
        variant: "destructive"
      });
    }
  };

  const handleMove = async () => {
    if (!selectedDocument) return;

    try {
      const { error } = await supabase
        .from('incident_documents')
        .update({ category: newCategory })
        .eq('id', selectedDocument.id);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Documento spostato con successo"
      });

      setMoveDialogOpen(false);
      setSelectedDocument(null);
      fetchDocuments();
    } catch (error) {
      console.error('Error moving document:', error);
      toast({
        title: "Errore",
        description: "Errore durante lo spostamento del documento",
        variant: "destructive"
      });
    }
  };

  const openRenameDialog = (doc: Document) => {
    setSelectedDocument(doc);
    setNewDocumentName(doc.name);
    setRenameDialogOpen(true);
  };

  const openMoveDialog = (doc: Document) => {
    setSelectedDocument(doc);
    setNewCategory(doc.category);
    setMoveDialogOpen(true);
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Gestione Documenti</h1>
            <p className="text-muted-foreground">
              Organizza i tuoi documenti per categoria
            </p>
          </div>
          <Button
            onClick={() => navigate('/asset-inventory')}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Package className="w-4 h-4" />
            Inventario Asset Tecnici
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Categories Sidebar */}
          <Card className="border-border bg-card lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <FolderOpen className="w-5 h-5" />
                Categorie
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Button
                variant={activeCategory === 'all' ? 'default' : 'ghost'}
                className="w-full justify-between"
                onClick={() => setActiveCategory('all')}
              >
                <span>Tutti i documenti</span>
                <Badge variant="secondary">{getCategoryCount('all')}</Badge>
              </Button>
              {DOCUMENT_CATEGORIES.map((category) => (
                <Button
                  key={category}
                  variant={activeCategory === category ? 'default' : 'ghost'}
                  className="w-full justify-between"
                  onClick={() => setActiveCategory(category)}
                >
                  <span className="truncate">{category}</span>
                  <Badge variant="secondary">{getCategoryCount(category)}</Badge>
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Upload Section */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Carica Nuovo Documento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="file">Seleziona File *</Label>
                    <Input
                      id="file"
                      type="file"
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.ppt,.pptx"
                      className="cursor-pointer"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Nome Documento *</Label>
                    <Input
                      id="name"
                      value={documentName}
                      onChange={(e) => setDocumentName(e.target.value)}
                      placeholder="Nome del documento"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Categoria *</Label>
                    <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as DocumentCategory)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

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
              </CardContent>
            </Card>

            {/* Documents List */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">
                  {activeCategory === 'all' ? 'Tutti i Documenti' : activeCategory}
                  <span className="text-muted-foreground text-sm font-normal ml-2">
                    ({filteredDocuments.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center text-muted-foreground py-8">
                    Caricamento documenti...
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <File className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Nessun documento in questa categoria</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredDocuments.map((doc) => (
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
                          <Badge variant="secondary" className="text-xs">
                            {doc.category}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openRenameDialog(doc)}
                            title="Rinomina"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openMoveDialog(doc)}
                            title="Sposta in altra categoria"
                          >
                            <FolderInput className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownload(doc)}
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(doc.id, doc.file_path)}
                            title="Elimina"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
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
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rinomina Documento</DialogTitle>
            <DialogDescription>
              Inserisci il nuovo nome per il documento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename">Nuovo Nome</Label>
              <Input
                id="rename"
                value={newDocumentName}
                onChange={(e) => setNewDocumentName(e.target.value)}
                placeholder="Nome documento"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleRename}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sposta Documento</DialogTitle>
            <DialogDescription>
              Seleziona la nuova categoria per il documento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="move-category">Categoria</Label>
              <Select value={newCategory} onValueChange={(value) => setNewCategory(value as DocumentCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleMove}>
              Sposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Documents;
