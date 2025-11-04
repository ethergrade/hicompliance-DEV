import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileDown, Save, Loader2 } from 'lucide-react';
import { IRPSectionEditor } from './IRPSectionEditor';
import { IRPContactsTable } from './IRPContactsTable';
import { useIRPDocument } from '@/hooks/useIRPDocument';
import { generateIRPDocument } from './docxGenerator';
import { toast } from 'sonner';
import { IRPDocumentData } from '@/types/irp';

interface IRPDocumentEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const IRPDocumentEditor = ({ open, onOpenChange }: IRPDocumentEditorProps) => {
  const { document, loading, saving, contacts, saveDocument, reloadContacts } = useIRPDocument();
  const [localDocument, setLocalDocument] = useState<IRPDocumentData | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (document) {
      setLocalDocument(document);
    }
  }, [document]);

  const handleSave = async () => {
    if (!localDocument) return;
    await saveDocument(localDocument);
  };

  const handleExport = async () => {
    if (!localDocument) return;
    try {
      setExporting(true);
      await generateIRPDocument(localDocument);
      toast.success('Documento esportato con successo');
    } catch (error) {
      console.error('Error exporting document:', error);
      toast.error('Errore nell\'esportazione del documento');
    } finally {
      setExporting(false);
    }
  };

  const updateContactEscalation = (id: string, level: number) => {
    if (!localDocument) return;
    const updatedContacts = localDocument.sections.contacts.map(c =>
      c.id === id ? { ...c, escalationLevel: level } : c
    );
    setLocalDocument({
      ...localDocument,
      sections: { ...localDocument.sections, contacts: updatedContacts },
    });
  };

  const handleReloadContacts = async () => {
    const newContacts = await reloadContacts();
    if (localDocument && newContacts) {
      setLocalDocument({
        ...localDocument,
        sections: { ...localDocument.sections, contacts: newContacts },
      });
      toast.success('Contatti ricaricati');
    }
  };

  if (loading || !localDocument) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl h-[90vh]">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editor Incident Response Plan</DialogTitle>
          <DialogDescription>
            Modifica il documento IRP e personalizza le sezioni secondo le tue esigenze
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="editor" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="editor">Editor Sezioni</TabsTrigger>
            <TabsTrigger value="contacts">Contatti di Emergenza</TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="flex-1 min-h-0">
            <ScrollArea className="h-full pr-4">
              <IRPSectionEditor document={localDocument} onUpdate={setLocalDocument} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="contacts" className="flex-1 min-h-0 flex flex-col">
            <div className="mb-4">
              <Button onClick={handleReloadContacts} variant="outline" size="sm">
                Ricarica Contatti
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                I contatti vengono caricati automaticamente dalla sezione "Contatti di Emergenza".
                Modifica il livello di escalation per ogni contatto (1=Più alto, 3=Più basso).
              </p>
            </div>
            <ScrollArea className="flex-1">
              <IRPContactsTable
                contacts={localDocument.sections.contacts}
                onUpdateContact={updateContactEscalation}
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-4 border-t">
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salva Bozza
                </>
              )}
            </Button>
          </div>
          <Button onClick={handleExport} disabled={exporting} variant="default">
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Esportazione...
              </>
            ) : (
              <>
                <FileDown className="mr-2 h-4 w-4" />
                Esporta DOCX
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
