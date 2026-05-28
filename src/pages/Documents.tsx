import React, { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useContactDirectory } from '@/hooks/useContactDirectory';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { documentsApi } from '@/lib/api';
import type { DocumentResource } from '@/types/api';
import DocumentSearchBar, { DocumentFilters } from '@/components/documents/DocumentSearchBar';
import DocumentMetadataDialog, { DocumentMetadata } from '@/components/documents/DocumentMetadataDialog';
import {
  generateDocumentCode,
  formatDocumentCodeWithRevision,
  DOCUMENT_STATUSES,
  CONFIDENTIALITY_LEVELS,
  STATUS_COLORS,
  CONFIDENTIALITY_COLORS,
  type DocumentCategory,
} from '@/components/documents/DocumentCodeGenerator';
import {
  Download, FileText, Upload, Trash2, File, FolderOpen,
  Settings2, Package, X, Eye
} from 'lucide-react';
import DocumentPreviewDialog from '@/components/documents/DocumentPreviewDialog';
import { useNavigate } from 'react-router-dom';

const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'Piano Generale', 'Checklist / OPL / SOP', 'Template', 'Processo',
  'Legal', 'ISO & Audit', 'NIS2', 'Tecnico', 'Varie'
];

// DocumentResource from API replaces ISODocument — use alias for clarity
type ISODocument = DocumentResource;

const Documents: React.FC = () => {
  const [documents, setDocuments] = useState<ISODocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState<DocumentFilters>({
    search: '', category: 'all', status: 'all', confidentiality: 'all'
  });

  // Upload form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    name: '',
    category: 'Varie' as DocumentCategory,
    status: 'Bozza',
    confidentiality: 'Interno',
    description: '',
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState('');
  const [showUploadDetails, setShowUploadDetails] = useState(false);

  // Metadata dialog
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<ISODocument | null>(null);

  // Preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<ISODocument | null>(null);

  const openPreview = (doc: ISODocument) => {
    setPreviewDoc(doc);
    setPreviewOpen(true);
  };

  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { contacts } = useContactDirectory();
  const { organizationId, groupId } = useClientOrganization();

  const fetchDocuments = async () => {
    if (!organizationId) return;
    try {
      const docs = await documentsApi.list(organizationId, groupId);
      setDocuments(docs);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast({ title: "Errore", description: "Errore nel caricamento dei documenti", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) fetchDocuments();
  }, [organizationId]);

  // Filter documents
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      if (filters.category !== 'all' && doc.category !== filters.category) return false;
      if (filters.status !== 'all' && doc.status !== filters.status) return false;
      if (filters.confidentiality !== 'all' && doc.confidentiality !== filters.confidentiality) return false;
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        const matchName = doc.name.toLowerCase().includes(q);
        const matchCode = doc.document_code?.toLowerCase().includes(q);
        const matchDesc = doc.description?.toLowerCase().includes(q);
        const matchTags = doc.tags?.some(t => t.toLowerCase().includes(q));
        if (!matchName && !matchCode && !matchDesc && !matchTags) return false;
      }
      return true;
    });
  }, [documents, filters]);

  const getCategoryCount = (category: DocumentCategory | 'all') => {
    if (category === 'all') return documents.length;
    return documents.filter(doc => doc.category === category).length;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadForm(prev => ({ ...prev, name: file.name }));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadForm.name || !user || !organizationId) {
      toast({ title: "Errore", description: "Compila tutti i campi obbligatori", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      // Generate document code
      const categoryDocs = documents.filter(d => d.category === uploadForm.category);
      const nextSeq = categoryDocs.length + 1;
      const docCode = generateDocumentCode(uploadForm.category, nextSeq);

      await documentsApi.create(organizationId, {
        name: uploadForm.name,
        category: uploadForm.category,
        document_code: docCode,
        status: uploadForm.status,
        confidentiality: uploadForm.confidentiality,
        description: uploadForm.description,
        tags: uploadForm.tags,
      }, groupId, groupId);

      toast({ title: "Successo", description: "Documento caricato con successo" });
      setSelectedFile(null);
      setUploadForm({
        name: '', category: 'Varie', status: 'Bozza', confidentiality: 'Interno',
        description: '', tags: [],
      });
      setShowUploadDetails(false);
      fetchDocuments();
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({ title: "Errore", description: "Errore durante il caricamento", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: ISODocument) => {
    if (!organizationId) return;
    try {
      const data = await documentsApi.download(organizationId, doc.id, groupId);
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.document_code
        ? `${formatDocumentCodeWithRevision(doc.document_code, doc.revision)}_${doc.name}`
        : doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Errore", description: "Errore durante il download", variant: "destructive" });
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo documento?')) return;
    if (!organizationId) return;
    try {
      await documentsApi.delete(organizationId, docId, groupId);
      toast({ title: "Successo", description: "Documento eliminato" });
      fetchDocuments();
    } catch (error) {
      toast({ title: "Errore", description: "Errore durante l'eliminazione", variant: "destructive" });
    }
  };

  const openMetadataDialog = (doc: ISODocument) => {
    setSelectedDocument(doc);
    setMetadataDialogOpen(true);
  };

  const handleSaveMetadata = async (metadata: DocumentMetadata) => {
    if (!selectedDocument || !organizationId) return;
    try {
      await documentsApi.update(organizationId, selectedDocument.id, {
        name: metadata.name,
        document_code: metadata.document_code,
        revision: metadata.revision,
        status: metadata.status,
        confidentiality: metadata.confidentiality,
        category: metadata.category,
        description: metadata.description,
        tags: metadata.tags,
      }, groupId, groupId);

      toast({ title: "Successo", description: "Metadata aggiornati" });
      fetchDocuments();
    } catch (error) {
      toast({ title: "Errore", description: "Errore nell'aggiornamento", variant: "destructive" });
    }
  };

  const getContactNames = (ids: string[] | null) => {
    if (!ids || ids.length === 0) return null;
    return ids.map(id => {
      const c = contacts.find(ct => ct.id === id);
      return c ? `${c.first_name} ${c.last_name}` : '?';
    }).join(', ');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !uploadForm.tags.includes(t)) {
      setUploadForm(prev => ({ ...prev, tags: [...prev.tags, t] }));
      setTagInput('');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Gestione Documenti</h1>
            <p className="text-muted-foreground">Sistema documentale conforme ISO 9001 / ISO 27001</p>
          </div>
          <Button onClick={() => navigate('/asset-inventory')} variant="outline" className="flex items-center gap-2">
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
                variant={filters.category === 'all' ? 'default' : 'ghost'}
                className="w-full justify-between"
                onClick={() => setFilters(f => ({ ...f, category: 'all' }))}
              >
                <span>Tutti i documenti</span>
                <Badge variant="secondary">{getCategoryCount('all')}</Badge>
              </Button>
              {DOCUMENT_CATEGORIES.map(category => (
                <Button
                  key={category}
                  variant={filters.category === category ? 'default' : 'ghost'}
                  className="w-full justify-between"
                  onClick={() => setFilters(f => ({ ...f, category }))}
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
                    <Label>Seleziona File *</Label>
                    <Input type="file" onChange={handleFileSelect} accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.ppt,.pptx" className="cursor-pointer" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome Documento *</Label>
                    <Input value={uploadForm.name} onChange={e => setUploadForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome del documento" />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria *</Label>
                    <Select value={uploadForm.category} onValueChange={v => setUploadForm(f => ({ ...f, category: v as DocumentCategory }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Stato</Label>
                    <Select value={uploadForm.status} onValueChange={v => setUploadForm(f => ({ ...f, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Classificazione</Label>
                    <Select value={uploadForm.confidentiality} onValueChange={v => setUploadForm(f => ({ ...f, confidentiality: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONFIDENTIALITY_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tag</Label>
                    <div className="flex gap-1">
                      <Input
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                        placeholder="Aggiungi tag..."
                        className="flex-1"
                      />
                      <Button variant="outline" size="sm" onClick={addTag}>+</Button>
                    </div>
                    {uploadForm.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {uploadForm.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                            <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => setUploadForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))} />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Button variant="ghost" size="sm" onClick={() => setShowUploadDetails(!showUploadDetails)}>
                  {showUploadDetails ? 'Nascondi' : 'Mostra'} campi avanzati (Responsabili, Descrizione)
                </Button>

                {showUploadDetails && (
                  <div className="space-y-4 border-t border-border pt-4">
                    <div className="space-y-2">
                      <Label>Descrizione / Scopo</Label>
                      <Textarea
                        value={uploadForm.description}
                        onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))}
                        rows={2}
                        placeholder="Descrizione del documento..."
                      />
                    </div>

                  </div>
                )}

                {selectedFile && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      File: <span className="font-medium text-foreground">{selectedFile.name}</span>
                      {' '}({formatFileSize(selectedFile.size)})
                    </p>
                  </div>
                )}

                <Button onClick={handleUpload} disabled={!selectedFile || !uploadForm.name || uploading} className="w-full">
                  {uploading ? 'Caricamento...' : <><Upload className="w-4 h-4 mr-2" />Carica Documento</>}
                </Button>
              </CardContent>
            </Card>

            {/* Search Bar */}
            <DocumentSearchBar filters={filters} onFiltersChange={setFilters} />

            {/* Documents List */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">
                  {filters.category === 'all' ? 'Tutti i Documenti' : filters.category}
                  <span className="text-muted-foreground text-sm font-normal ml-2">({filteredDocuments.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center text-muted-foreground py-8">Caricamento documenti...</div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <File className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Nessun documento trovato</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredDocuments.map(doc => (
                      <div key={doc.id} className="flex items-start justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors">
                        <div className="flex items-start space-x-3 flex-1 min-w-0">
                          <FileText className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {doc.document_code && (
                                <span className="text-xs font-mono text-primary">
                                  {formatDocumentCodeWithRevision(doc.document_code, doc.revision)}
                                </span>
                              )}
                              <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`text-xs ${STATUS_COLORS[doc.status] || ''}`}>
                                {doc.status}
                              </Badge>
                              <Badge variant="outline" className={`text-xs ${CONFIDENTIALITY_COLORS[doc.confidentiality] || ''}`}>
                                {doc.confidentiality}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">{doc.category}</Badge>
                              {doc.tags && doc.tags.length > 0 && doc.tags.map(t => (
                                <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                              ))}
                            </div>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              <span>{formatFileSize(doc.file_size)} • {formatDate(doc.created_at)}</span>
                              {doc.revision_date && <span> • Rev. {formatDate(doc.revision_date)}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                          <Button size="sm" variant="ghost" onClick={() => openPreview(doc)} title="Anteprima">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openMetadataDialog(doc)} title="Modifica Metadata">
                            <Settings2 className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDownload(doc)} title="Download">
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(doc.id)} title="Elimina">
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

      {/* Metadata Dialog */}
      <DocumentMetadataDialog
        open={metadataDialogOpen}
        onOpenChange={setMetadataDialogOpen}
        metadata={selectedDocument ? {
          name: selectedDocument.name,
          document_code: selectedDocument.document_code || '',
          revision: selectedDocument.revision,
          status: selectedDocument.status,
          confidentiality: selectedDocument.confidentiality,
          category: selectedDocument.category,
          description: selectedDocument.description || '',
          tags: selectedDocument.tags || [],
        } : null}
        onSave={handleSaveMetadata}
        contacts={contacts}
      />

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        filePath={null}
        fileName={previewDoc?.name ?? ''}
        fileType={previewDoc?.file_type ?? ''}
      />
    </DashboardLayout>
  );
};

export default Documents;
