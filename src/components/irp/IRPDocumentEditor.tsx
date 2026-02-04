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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { FileDown, Save, Loader2, AlertTriangle, Shield, BarChart3, TrendingUp, Info } from 'lucide-react';
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
import { cn } from '@/lib/utils';

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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="editor">Editor Sezioni</TabsTrigger>
            <TabsTrigger value="contacts">Contatti di Emergenza</TabsTrigger>
            <TabsTrigger value="risk-preview" className="flex items-center gap-1">
              <BarChart3 className="w-4 h-4" />
              Anteprima Rischi
            </TabsTrigger>
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

          {/* Risk Analysis Preview Tab */}
          <TabsContent value="risk-preview" className="flex-1 min-h-0">
            <ScrollArea className="h-full pr-4">
              <div className="space-y-6 pb-4">
                {loadingRisk ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : riskAssets.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <h3 className="font-medium text-lg mb-2">Nessun dato di Analisi Rischi</h3>
                      <p className="text-sm text-muted-foreground max-w-md">
                        Compila prima l'Analisi Rischi nella sezione IRP per visualizzare qui 
                        un'anteprima dei dati che verranno inclusi nel documento esportato.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Asset Analizzati
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{riskAssets.length}</div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Risk Score Medio
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {(() => {
                            const avgScore = Math.round(
                              riskAssets.reduce((sum, a) => sum + (a.risk_score || 0), 0) / riskAssets.length
                            );
                            return (
                              <div className={cn(
                                "text-2xl font-bold",
                                avgScore >= 71 ? "text-green-600" :
                                avgScore >= 41 ? "text-yellow-600" : "text-red-600"
                              )}>
                                {avgScore}%
                              </div>
                            );
                          })()}
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Categorie Valutate
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{getAllCategories().length}</div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Info Banner */}
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <Info className="w-5 h-5 text-primary mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-foreground">Anteprima dati per l'export</p>
                        <p className="text-muted-foreground">
                          Questi dati verranno inclusi nel documento IRP esportato se l'opzione 
                          "Includi Analisi Rischi" è attiva.
                        </p>
                      </div>
                    </div>

                    {/* Assets Table */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Dettaglio Asset e Risk Score</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Asset</TableHead>
                                <TableHead>Fonte Minaccia</TableHead>
                                <TableHead className="text-center">Risk Score</TableHead>
                                <TableHead className="text-center">Livello</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {riskAssets.map((asset) => {
                                const threatLabels: Record<string, string> = {
                                  non_umana: 'Fonti Non Umane',
                                  umana_esterna: 'Fonti Umane Esterne',
                                  umana_interna: 'Fonti Umane Interne',
                                };
                                const score = asset.risk_score || 0;
                                const level = score >= 71 ? 'Basso' : score >= 41 ? 'Medio' : 'Alto';
                                const levelColor = score >= 71 ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                                                   score >= 41 ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' :
                                                   'bg-red-500/10 text-red-600 border-red-500/20';
                                
                                return (
                                  <TableRow key={asset.id}>
                                    <TableCell className="font-medium">{asset.asset_name}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {threatLabels[asset.threat_source] || asset.threat_source}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <span className={cn(
                                        "font-bold",
                                        score >= 71 ? "text-green-600" :
                                        score >= 41 ? "text-yellow-600" : "text-red-600"
                                      )}>
                                        {score}%
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Badge variant="outline" className={levelColor}>
                                        {level}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Category Averages per Asset */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Medie per Categoria di Controllo</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="sticky left-0 bg-background">Asset</TableHead>
                                {getAllCategories().map(cat => (
                                  <TableHead key={cat} className="text-center text-xs whitespace-nowrap px-2">
                                    {CATEGORY_LABELS[cat].split(' ')[0]}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {riskAssets.map((asset) => (
                                <TableRow key={asset.id}>
                                  <TableCell className="sticky left-0 bg-background font-medium text-sm">
                                    {asset.asset_name.length > 20 
                                      ? asset.asset_name.substring(0, 20) + '...' 
                                      : asset.asset_name}
                                  </TableCell>
                                  {getAllCategories().map(cat => {
                                    const avg = getCategoryAverage(asset, cat);
                                    const pct = Math.round((avg / 3) * 100);
                                    return (
                                      <TableCell key={cat} className="text-center px-2">
                                        <div className={cn(
                                          "inline-flex items-center justify-center w-10 h-6 rounded text-xs font-medium",
                                          pct >= 71 ? "bg-green-500/20 text-green-700" :
                                          pct >= 41 ? "bg-yellow-500/20 text-yellow-700" :
                                          "bg-red-500/20 text-red-700"
                                        )}>
                                          {avg.toFixed(1)}
                                        </div>
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Scala: 0 (Assente) → 3 (Completo). Colori: 🔴 Alto rischio (&lt;41%) | 🟡 Medio (41-70%) | 🟢 Basso (&gt;70%)
                        </p>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
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
