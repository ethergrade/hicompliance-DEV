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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { FileDown, Save, Loader2, AlertTriangle } from 'lucide-react';
import { IRPSectionEditor } from './IRPSectionEditor';
import { IRPContactsTable } from './IRPContactsTable';
import { useIRPDocument } from '@/hooks/useIRPDocument';
import { generateIRPDocument } from './docxGenerator';
import { useDocumentSave } from '@/hooks/useDocumentSave';
import { useRiskAnalysis } from '@/hooks/useRiskAnalysis';
import { toast } from 'sonner';
import { IRPDocumentData, RiskAnalysisSummary } from '@/types/irp';
import { CATEGORY_LABELS, SecurityControlCategory } from '@/types/riskAnalysis';
import { getControlsByCategory, getAllCategories } from '@/data/securityControls';

interface IRPDocumentEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const IRPDocumentEditor = ({ open, onOpenChange }: IRPDocumentEditorProps) => {
  const { document, loading, saving, contacts, saveDocument, reloadContacts } = useIRPDocument();
  const { saveToDocuments } = useDocumentSave();
  const { assets: riskAssets, loading: loadingRisk } = useRiskAnalysis();
  const [localDocument, setLocalDocument] = useState<IRPDocumentData | null>(null);
  const [exporting, setExporting] = useState(false);
  const [includeRiskAnalysis, setIncludeRiskAnalysis] = useState(true);

  useEffect(() => {
    if (document) {
      setLocalDocument(document);
    }
  }, [document]);

  const handleSave = async () => {
    if (!localDocument) return;
    await saveDocument(localDocument);
  };

  // Calculate category averages for risk analysis
  const getCategoryAverage = (asset: typeof riskAssets[0], category: SecurityControlCategory): number => {
    const controls = getControlsByCategory(category);
    const scores = controls
      .map(c => asset.control_scores[c.id])
      .filter((s): s is number => typeof s === 'number');
    
    if (scores.length === 0) return 0;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  };

  // Prepare risk analysis data for export
  const prepareRiskAnalysisData = (): RiskAnalysisSummary[] => {
    if (!includeRiskAnalysis || riskAssets.length === 0) return [];

    const threatSourceLabels: Record<string, string> = {
      non_umana: 'Fonti Non Umane',
      umana_esterna: 'Fonti Umane Esterne',
      umana_interna: 'Fonti Umane Interne',
    };

    return riskAssets.map(asset => ({
      assetName: asset.asset_name,
      threatSource: threatSourceLabels[asset.threat_source] || asset.threat_source,
      riskScore: asset.risk_score,
      categoryAverages: getAllCategories().map(cat => ({
        category: CATEGORY_LABELS[cat],
        average: getCategoryAverage(asset, cat),
      })),
    }));
  };

  const handleExport = async () => {
    if (!localDocument) return;
    try {
      setExporting(true);
      
      // Prepare document with risk analysis data
      const docWithRiskAnalysis: IRPDocumentData = {
        ...localDocument,
        riskAnalysis: prepareRiskAnalysisData(),
      };
      
      // Generate document and get blob
      const { blob, fileName } = await generateIRPDocument(docWithRiskAnalysis);
      
      // Save to Gestione Documenti automatically
      const saved = await saveToDocuments({
        blob,
        fileName,
        category: 'Piano Generale'
      });
      
      if (saved) {
        toast.success('Documento esportato e salvato in Gestione Documenti');
      } else {
        toast.success('Documento esportato (salvataggio automatico non riuscito)');
      }
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
              onReload={handleReloadContacts}
            />
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-4 pt-4 border-t">
          {/* Risk Analysis inclusion option */}
          <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
            <div className="flex items-center gap-3">
              <Checkbox
                id="include-risk-analysis"
                checked={includeRiskAnalysis}
                onCheckedChange={(checked) => setIncludeRiskAnalysis(checked === true)}
              />
              <div>
                <Label htmlFor="include-risk-analysis" className="cursor-pointer font-medium">
                  Includi Analisi Rischi
                </Label>
                <p className="text-xs text-muted-foreground">
                  {riskAssets.length > 0 
                    ? `${riskAssets.length} asset analizzati disponibili`
                    : 'Nessun dato di analisi rischi disponibile'}
                </p>
              </div>
            </div>
            {riskAssets.length === 0 && (
              <div className="flex items-center gap-1 text-xs text-warning">
                <AlertTriangle className="h-3 w-3" />
                <span>Compila prima l'Analisi Rischi</span>
              </div>
            )}
          </div>

          <div className="flex justify-between">
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
            <Button onClick={handleExport} disabled={exporting || loadingRisk} variant="default">
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
        </div>
      </DialogContent>
    </Dialog>
  );
};
