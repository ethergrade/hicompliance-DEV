import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string | null;
  fileName: string;
  fileType: string;
}

const getExt = (name: string) => name.split('.').pop()?.toLowerCase() || '';

const isImage = (ext: string, mime: string) =>
  mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);

const isPdf = (ext: string, mime: string) => mime === 'application/pdf' || ext === 'pdf';

const isText = (ext: string, mime: string) =>
  mime.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'log', 'xml', 'yaml', 'yml'].includes(ext);

const isOffice = (ext: string) =>
  ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);

const DocumentPreviewDialog: React.FC<DocumentPreviewDialogProps> = ({
  open, onOpenChange, filePath, fileName, fileType,
}) => {
  const [loading, setLoading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ext = getExt(fileName);

  useEffect(() => {
    if (!open || !filePath) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setSignedUrl(null);
      setTextContent(null);
      try {
        // TODO: migrate to backend API (signed URL from Supabase Storage)
        if (cancelled) return;
        throw new Error('Anteprima non disponibile: storage backend non migrato');
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setError(e?.message || 'Errore caricamento anteprima');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, filePath, fileType, ext]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Caricamento anteprima...
        </div>
      );
    }
    if (error || !signedUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground gap-2">
          <FileText className="w-10 h-10 opacity-50" />
          <p>{error || 'Anteprima non disponibile'}</p>
        </div>
      );
    }
    if (isImage(ext, fileType)) {
      return (
        <div className="flex items-center justify-center bg-muted/30 rounded-lg overflow-auto max-h-[75vh]">
          <img src={signedUrl} alt={fileName} className="max-w-full max-h-[75vh] object-contain" />
        </div>
      );
    }
    if (isPdf(ext, fileType)) {
      return (
        <iframe
          src={signedUrl}
          title={fileName}
          className="w-full h-[75vh] rounded-lg border border-border bg-background"
        />
      );
    }
    if (isText(ext, fileType)) {
      return (
        <pre className="w-full h-[75vh] overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-xs text-foreground whitespace-pre-wrap break-words">
          {textContent}
        </pre>
      );
    }
    if (isOffice(ext)) {
      const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`;
      return (
        <div className="space-y-2">
          <iframe
            src={officeUrl}
            title={fileName}
            className="w-full h-[75vh] rounded-lg border border-border bg-background"
          />
          <p className="text-xs text-muted-foreground">
            Anteprima Office tramite Microsoft Online Viewer. Se non si visualizza, scarica il file.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground gap-3">
        <FileText className="w-10 h-10 opacity-50" />
        <p>Formato non supportato per l'anteprima diretta.</p>
        <Button asChild variant="outline">
          <a href={signedUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4 mr-2" /> Apri in nuova scheda
          </a>
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4 pr-6">
            <span className="truncate">{fileName}</span>
            {signedUrl && (
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1" /> Nuova scheda
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={signedUrl} download={fileName}>
                    <Download className="w-4 h-4 mr-1" /> Scarica
                  </a>
                </Button>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
};

export default DocumentPreviewDialog;
