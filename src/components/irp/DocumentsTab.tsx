import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { irpApi } from '@/lib/api';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { FileText, Download, Clock, Loader2, History } from 'lucide-react';

interface DocumentsTabProps {
  organizationId: string;
  groupId: string | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  created_at: string;
  version?: string;
  summary?: string;
}

const DocumentsTab: React.FC<DocumentsTabProps> = ({ organizationId, groupId }) => {
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();
  const { selectedOrganization } = useClientOrganization();

  const { data: documentData, isLoading: docLoading } = useQuery({
    queryKey: ['irp-document', organizationId, groupId],
    queryFn: () => irpApi.document(organizationId, groupId),
    enabled: !!organizationId && !!groupId,
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['irp-history', organizationId, groupId],
    queryFn: () => irpApi.history(organizationId, groupId) as Promise<HistoryEntry[]>,
    enabled: !!organizationId && !!groupId,
  });

  const handleExport = async () => {
    if (!organizationId) return;
    setExporting(true);
    try {
      await irpApi.exportDocument(organizationId, selectedOrganization?.name || 'documento', groupId);
      toast({ title: 'Download avviato', description: 'Il documento IRP è in fase di download.' });
    } catch (err: any) {
      toast({ title: 'Errore', description: err?.message || 'Impossibile scaricare il documento.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Documenti IRP</h2>
          <p className="text-sm text-gray-400">Documentazione, esportazioni e storico del piano di risposta</p>
        </div>
        <Button onClick={handleExport} disabled={exporting || !organizationId}>
          {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Scarica IRP Completo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Document Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Stato Documento
            </CardTitle>
            <CardDescription>Riepilogo del documento IRP corrente</CardDescription>
          </CardHeader>
          <CardContent>
            {docLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : documentData ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Versione</span>
                  <Badge variant="outline">{(documentData as any).version || '1.0'}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Ultima modifica</span>
                  <span className="text-sm">{(documentData as any).updated_at ? new Date((documentData as any).updated_at).toLocaleDateString('it-IT') : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Stato</span>
                  <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/20 text-green-600">Attivo</Badge>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Nessun documento IRP creato</p>
                <p className="text-xs text-muted-foreground mt-1">Crea il primo documento dalla sezione Procedure Operative</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* History Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Cronologia Modifiche
            </CardTitle>
            <CardDescription>Versioni e modifiche recenti del documento</CardDescription>
          </CardHeader>
          <CardContent>
            {histLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Nessuna modifica registrata</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {history.slice(0, 10).map((entry, idx) => (
                  <div key={entry.id || idx} className="flex items-start gap-3 border-b border-border pb-2 last:border-0">
                    <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.action || entry.summary || 'Modifica documento'}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.created_at ? new Date(entry.created_at).toLocaleString('it-IT') : '—'}
                        {entry.version ? ` · v${entry.version}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DocumentsTab;
